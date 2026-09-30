/**
 * 커리어 모드(원작 방식) 게임 로직. DB 없이 CareerState 만 다루는 순수 함수들.
 */
import { STAT_KEYS, StatKey } from "@shared/gameConstants";
import { ORIG_MAPS, ORIG_PLAYERS, ORIG_TEAMS, FREE_AGENT_TEAM } from "@shared/career/originalData";
import {
  ACTIONS,
  AI_MIN_ROSTER,
  ActionKey,
  CareerState,
  CMatch,
  COND_MAX,
  WEEKLY_COND_RECOVERY,
  actionOf,
  COND_MIN,
  CPlayer,
  FINAL_SETS,
  FINAL_WIN,
  MATCH_MONEY,
  MAX_ROSTER,
  MIN_ROSTER,
  ORIG_STAT_ORDER,
  POSTSEASON_PRIZE,
  PRO_SETS,
  PRO_WIN,
  Race,
  SetResult,
  START_MONEY,
  STAT_MAX_CAREER,
  STAT_MIN,
  WEEKLY_AP,
  WEEKLY_SPONSOR,
  ageOf,
  askingPrice,
  condMultiplier,
  totalOf,
} from "@shared/career/rules";
import {
  type SetMods,
  CareerError, addExp, clampCond, rollWeekBursts, quickSet, clampStat, drawMapPool, gainStats, news, pickMaps, playSet, rand, randInt, shuffle, STAGE_GROWTH, withStageGrowth,
  type PlayedSet,
} from "./core";
export { CareerError };
import { initialPlayers, initialTeams } from "@shared/career/init";
import { eventOn } from "./events";
import { aiShopping } from "./aiShop";
import { runReserveWeek } from "./reserveLeague";
import { createMsl, nominationPending, runMslWeek, type MslReport } from "./msl";
import { ITEM_BY_KEY, POTION_LIMIT, slotOf } from "@shared/career/items";
import { ensurePotential, retirements, rookies } from "./generation";
import { addManagerExp, mainSponsorPay, book, ensureClub, newSeasonClub, pay, seasonEndClub, weeklyClub } from "./club";
import { cheerChance, defaultContract, scoutPrice } from "@shared/career/contract";
export type { MslReport };

const RACE: Record<string, Race> = { T: "terran", Z: "zerg", P: "protoss" };
const REGULAR_WEEKS = 11;




import { rosterOf, proTeams, standings, myPendingMatch, evaluateTrade, activePlayers } from "@shared/career/view";
export { rosterOf, proTeams, standings, myPendingMatch };

// ── 새 게임 ─────────────────────────────────────────────────────

export function newCareer(myTeam: number): CareerState {
  if (myTeam < 0 || myTeam >= FREE_AGENT_TEAM) throw new CareerError("팀을 선택해주세요");
  const players = initialPlayers(() => randInt(50, 90));
  const s: CareerState = {
    version: 1,
    myTeam,
    season: 1,
    week: 1,
    phase: "regular",
    ap: WEEKLY_AP,
    players,
    teams: initialTeams(),
    matches: [],
    nextMatchId: 1,
    news: [],
    history: [],
    mapPool: drawMapPool(),
    condScale: 100,
  };
  ensureClub(s);
  ensurePotential(s);
  scheduleRegularSeason(s);
  // 개인리그 시드를 미리 정해 두어 일정표에서 볼 수 있게
  s.msl = createMsl(s);
  rollWeekBursts(s);
  news(s, `${s.teams[myTeam].name} 감독으로 부임했습니다. ${s.season}시즌 마이프로리그가 곧 개막합니다!`);
  return s;
}

/** 예전 세이브 보정 */
export function migrateCareer(s: CareerState) {
  if (!s.mapPool?.length) s.mapPool = drawMapPool();
  ensureClub(s);
  ensurePotential(s);
  ensureHeadToHead(s);
  rollWeekBursts(s);
  // 개인리그 준우승 기록 (예전 세이브는 시즌 기록에만 있음)
  for (const h of s.history) {
    const p = h.mslRunnerUp !== undefined ? s.players[h.mslRunnerUp] : undefined;
    const t = `${h.season}시즌 마이스타리그 준우승`;
    if (p && !(p.titles ?? []).includes(t)) p.titles = [...(p.titles ?? []), t];
  }
  // 없어진 행동(베스트) → 훈련
  for (const p of s.players) if ((p.action as string) === "best") p.action = "train";
  // 컨디션 1~10 단위 → % 단위
  if (!s.condScale) { for (const p of s.players) p.cond = Math.min(100, Math.max(1, p.cond * 10)); s.condScale = 100; }
}

/** 상대 전적 기록이 생기기 전 세이브: 이번 시즌 치른 프로리그 세트로 채움 */
function ensureHeadToHead(s: CareerState) {
  if (s.players.some(p => p.h2h)) return;
  for (const m of s.matches) for (const x of m.sets ?? []) {
    const [w, l] = x.winner === "a" ? [s.players[x.a], s.players[x.b]] : [s.players[x.b], s.players[x.a]];
    if (!w || !l) continue;
    if (w.team === s.myTeam) w.h2h = { ...w.h2h, [l.id]: [(w.h2h?.[l.id]?.[0] ?? 0) + 1, w.h2h?.[l.id]?.[1] ?? 0] };
    if (l.team === s.myTeam) l.h2h = { ...l.h2h, [w.id]: [l.h2h?.[w.id]?.[0] ?? 0, (l.h2h?.[w.id]?.[1] ?? 0) + 1] };
  }
}

/**
 * 원작처럼 2라운드 풀리그: 한 주에 프로리그 2경기 (1경기: r라운드 대진, 2경기: (10-r)라운드 대진, 홈·원정 바꿈)
 * 6주차는 같은 상대와 두 번 붙는다 (원작 일정표와 같음)
 */
function scheduleRegularSeason(s: CareerState) {
  const ids = shuffle(proTeams(s).map(t => t.id));
  const n = ids.length;
  const list = [...ids];
  const rounds: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  for (let w = 0; w < REGULAR_WEEKS; w++) {
    for (const [a, b] of rounds[w]) s.matches.push({ id: s.nextMatchId++, week: w + 1, leg: 1, stage: "regular", a, b, maps: pickMaps(PRO_SETS, s.mapPool) });
    for (const [a, b] of rounds[REGULAR_WEEKS - 1 - w]) s.matches.push({ id: s.nextMatchId++, week: w + 1, leg: 2, stage: "regular", a: b, b: a, maps: pickMaps(PRO_SETS, s.mapPool) });
  }
}

// ── 순위 ───────────────────────────────────────────────────────


// ── 선수 행동 ──────────────────────────────────────────────────

export function setAction(s: CareerState, pid: number, action: ActionKey | null) {
  const p = s.players[pid];
  if (!p || p.team !== s.myTeam) throw new CareerError("우리 팀 선수가 아닙니다");
  if (s.live) throw new CareerError("경기 중에는 행동을 바꿀 수 없습니다");
  if (action && !actionOf(action)) throw new CareerError("없는 행동입니다");
  p.action = action;
}


/** 행동 한 명 실행: 능력치·컨디션·돈 변화 */
function actOne(s: CareerState, p: CPlayer, action: ActionKey | null | undefined) {
  const mine = p.team === s.myTeam;
  // 훈련 효과 2배 이벤트 (우리 선수)
  const boost = mine && eventOn("stat_boost") ? 2 : 1;
  const tired = p.cond < 30;
  switch (action) {
    case "train": gainStats(p, 2, 2 * boost, 6 * boost); p.cond = clampCond(p.cond - randInt(3, 5)); break;
    case "rest": p.cond = clampCond(p.cond + 5); break;
    case "event": {
      const earn = 30 + p.level * 12 + randInt(0, 40);
      if (mine) {
        pay(s, "이벤트", earn, `${p.name} 팬미팅`);
        // 팬미팅: 인기가 많을수록 치어풀을 받을 확률이 높음
        if (rand() < cheerChance(p)) {
          s.inventory = { ...s.inventory, cheer: (s.inventory?.cheer ?? 0) + 1 };
          news(s, `📣 ${p.name} 선수가 팬미팅에서 치어풀을 선물 받았습니다!`);
        }
      }
      p.cond = clampCond(p.cond - randInt(3, 5));
      break;
    }
    default: break; // 자율 연습: 주가 끝날 때 기본 회복(+10%)만
  }
  // 컨디션이 바닥(30% 미만)인데 무리하게 훈련하면 능력치가 떨어지기도
  if (tired && action === "train" && rand() < 0.35) {
    const k = STAT_KEYS[randInt(0, STAT_KEYS.length - 1)];
    p.stats[k] = clampStat(p.stats[k] - randInt(1, 4));
  }
}

/** 다른 팀·무소속 선수의 한 주 행동 (한 주 한 번, 주가 끝날 때) */
function applyActions(s: CareerState) {
  const wk = `${s.season}-${s.week}`;
  if (s.actionsWeek === wk) return; // 한 주에 한 번만 (프로리그가 한 주 2경기)
  s.actionsWeek = wk;
  for (const p of activePlayers(s)) {
    if (p.team === s.myTeam) continue; // 우리 선수는 선수 행동 화면의 "진행하기"로
    if (p.team === FREE_AGENT_TEAM) { p.cond = clampCond(p.cond + randInt(-4, 4)); continue; }
    actOne(s, p, rand() < 0.55 ? "train" : "rest");
    p.action = null;
  }
}

export interface ActionResult { id: number; action: ActionKey; ap: number; cond: [number, number]; stats: Partial<Record<StatKey, number>>; money: number; cheer?: boolean }

/**
 * 우리 선수 행동 바로 진행: 행동을 정한 선수마다 행동력이 남아 있으면 한 번 실행하고 행동력을 쓴다
 * 고른 행동은 바꾸거나 초기화할 때까지 유지 (행동력이 남으면 또 진행 가능)
 */
export function runMyActions(s: CareerState, only?: number): { results: ActionResult[]; skipped: number[] } {
  if (s.live) throw new CareerError("경기 중에는 행동을 진행할 수 없습니다");
  // only: 그 선수만 (선수 카드의 진행 버튼)
  const roster = rosterOf(s, s.myTeam).filter(p => only === undefined || p.id === only);
  if (!roster.some(p => p.action)) throw new CareerError("행동을 정한 선수가 없습니다");
  const results: ActionResult[] = [];
  const skipped: number[] = [];
  for (const p of roster) {
    const a = actionOf(p.action);
    if (!a) continue;
    if (playerAp(p) < a.ap) { skipped.push(p.id); continue; }
    p.ap = playerAp(p) - a.ap;
    const before = { cond: p.cond, stats: { ...p.stats }, money: s.teams[s.myTeam].money, cheer: s.inventory?.cheer ?? 0 };
    actOne(s, p, a.key);
    const stats = Object.fromEntries(STAT_KEYS.map(k => [k, p.stats[k] - before.stats[k]]).filter(([, d]) => d !== 0));
    results.push({ id: p.id, action: a.key, ap: p.ap, cond: [before.cond, p.cond], stats, money: s.teams[s.myTeam].money - before.money, cheer: (s.inventory?.cheer ?? 0) > before.cheer || undefined });
  }
  if (!results.length) throw new CareerError("행동력이 부족합니다 (매주 선수마다 20씩 받습니다)");
  s.myActionsWeek = `${s.season}-${s.week}`;
  return { results, skipped };
}

/** 선수 행동력 (예전 세이브·새로 온 선수는 한 주치) */
export const playerAp = (p: CPlayer) => p.ap ?? WEEKLY_AP;

// ── 경기 ───────────────────────────────────────────────────────

/** AI 엔트리: 1~(n-1)세트는 상위 선수 중 무작위(중복 없음), 마지막 세트(에이스 결정전)는 최강 선수 */
export function aiEntry(s: CareerState, team: number, sets: number): number[] {
  const roster = rosterOf(s, team)
    .map(p => ({ p, v: totalOf(p.stats) * condMultiplier(p.cond) }))
    .sort((a, b) => b.v - a.v)
    .map(x => x.p.id);
  if (!roster.length) return [];
  const top = roster.slice(0, Math.max(sets - 1, Math.min(roster.length, sets + 1)));
  const front = shuffle(top).slice(0, sets - 1);
  while (front.length < sets - 1) front.push(roster[front.length % roster.length]);
  return [...front, roster[0]];
}

export function validateEntry(s: CareerState, entry: number[], sets: number) {
  if (entry.length !== sets) throw new CareerError(`${sets}세트 엔트리를 모두 정해주세요`);
  for (const id of entry) {
    if (s.players[id]?.team !== s.myTeam) throw new CareerError("우리 팀 선수만 출전할 수 있습니다");
  }
  const front = entry.slice(0, sets - 1);
  if (new Set(front).size !== front.length) throw new CareerError(`1~${sets - 1}세트에는 서로 다른 선수를 배치해야 합니다 (에이스 결정전은 누구나 가능)`);
}




/** 경기 결과 기록 (순위·상금·소식) */
function recordMatch(s: CareerState, m: CMatch, entryA: number[], entryB: number[], results: PlayedSet[]) {
  let sa = 0, sb = 0;
  for (const r of results) (r.winner === "a" ? sa++ : sb++);
  m.entryA = entryA; m.entryB = entryB;
  m.done = true;
  m.scoreA = sa; m.scoreB = sb;
  m.winner = sa > sb ? m.a : m.b;
  // 세이브에는 중계 타임라인을 남기지 않음
  m.sets = results.map(({ timeline, ...rest }) => rest);
  const ta = s.teams[m.a], tb = s.teams[m.b];
  if (m.stage === "regular") {
    ta.setWins += sa; ta.setLosses += sb; tb.setWins += sb; tb.setLosses += sa;
    if (m.winner === m.a) { ta.wins++; tb.losses++; } else { tb.wins++; ta.losses++; }
  }
  // 다른 팀은 리그 기본 수당, 우리 팀은 메인 스폰서 계약 수당
  const loserTeam = m.winner === m.a ? m.b : m.a;
  if (m.winner !== s.myTeam) s.teams[m.winner].money += MATCH_MONEY.win;
  if (loserTeam !== s.myTeam) s.teams[loserTeam].money += MATCH_MONEY.lose;
  if (m.a === s.myTeam || m.b === s.myTeam) {
    const won = m.winner === s.myTeam;
    const oppTeam = s.teams[m.a === s.myTeam ? m.b : m.a];
    const [my, their] = m.a === s.myTeam ? [sa, sb] : [sb, sa];
    const stageName = m.stage === "regular" ? `${m.week}주차 ${m.leg ?? 1}경기` : ({ semi: "준플레이오프", po: "플레이오프", final: "결승" } as const)[m.stage];
    mainSponsorPay(s, won ? "win" : "loss", won ? "스폰서 승리 수당" : "스폰서 패배 수당", `${stageName} vs ${oppTeam.name} ${my}:${their}`);
    addManagerExp(s, won ? 30 : 10);
  }
  // 출전 기록 (사기·출전 보장 조건)
  for (const id of new Set(results.flatMap(r => [r.a, r.b]))) s.players[id].sApps = (s.players[id].sApps ?? 0) + 1;
  if (m.a === s.myTeam || m.b === s.myTeam) {
    const won = m.winner === s.myTeam;
    const opp = s.teams[m.a === s.myTeam ? m.b : m.a];
    const stageName = { regular: `${m.week}주차`, semi: "준플레이오프", po: "플레이오프", final: "결승" }[m.stage];
    news(s, `${won ? "🎉" : "😢"} ${stageName} vs ${opp.name} ${Math.max(sa, sb)}:${Math.min(sa, sb)} ${won ? "승리" : "패배"}`);
  }
}

/** 포스트시즌은 경기 뒤 능력치가 크게 오름 */
const stageGrowthOf = (m: CMatch) => (m.stage === "regular" ? 1 : STAGE_GROWTH[m.stage]);

function playMatch(s: CareerState, m: CMatch, myEntry?: number[]): PlayedSet[] {
  const sets = m.stage === "final" ? FINAL_SETS : PRO_SETS;
  const need = m.stage === "final" ? FINAL_WIN : PRO_WIN;
  // 우리 경기와 포스트시즌(준PO·PO·결승)은 중계
  const involvesMe = m.a === s.myTeam || m.b === s.myTeam || m.stage !== "regular";
  const entryA = m.a === s.myTeam && myEntry ? myEntry : aiEntry(s, m.a, sets);
  const entryB = m.b === s.myTeam && myEntry ? myEntry : aiEntry(s, m.b, sets);
  let sa = 0, sb = 0;
  const results: PlayedSet[] = [];
  for (let i = 0; i < sets && sa < need && sb < need; i++) {
    const pa = s.players[entryA[i]], pb = s.players[entryB[i]];
    if (!pa || !pb) continue;
    // 다른 팀끼리 경기는 빠른 판정 (중계가 필요 없음)
    const r = withStageGrowth(stageGrowthOf(m), () => (involvesMe ? playSet(s, pa, pb, m.maps[i % m.maps.length], true, true) : quickSet(s, pa, pb, m.maps[i % m.maps.length])));
    if (r.winner === "a") sa++; else sb++;
    results.push(r);
  }
  recordMatch(s, m, entryA, entryB, results);
  return results;
}

/** 포스트시즌 다른 팀 경기 (중계 화면용, 세이브에는 해설을 남기지 않음) */
export interface ProReport { matchId: number; stage: CMatch["stage"]; a: number; b: number; sa: number; sb: number; sets: PlayedSet[]; entryA: number[]; entryB: number[]; maps: number[] }

/** 오래된 중계 하이라이트는 지워서 세이브 크기를 줄임 (내 팀 최근 4경기만 유지) */
function pruneHighlights(s: CareerState) {
  const mine = s.matches.filter(m => m.done && (m.a === s.myTeam || m.b === s.myTeam));
  for (const m of mine.slice(0, Math.max(0, mine.length - 4))) {
    for (const set of m.sets ?? []) delete set.highlights;
  }
}


// ── 한 주 진행 ─────────────────────────────────────────────────

export interface WeekResult {
  playedMatchId?: number;
  /** 우리 경기 세트별 중계 (원작식 중계 화면용) */
  broadcast?: PlayedSet[];
  mslReports: MslReport[];
  /** 우리 팀이 없는 포스트시즌 경기 중계 */
  proReports?: ProReport[];
  /** 이번 주에 치른 개인리그 일정 (MSL_PLAN 번호) — 결과 화면용 */
  mslPlans?: number[];
  /** 조 지명식(우리 선수 지명)을 기다리는 중 — 지명 후 completeWeek 로 마무리 */
  needNomination?: boolean;
}

/** 이번 주 경기가 끝난 뒤: 조 지명식을 기다려야 하면 멈추고, 아니면 마무리 */
function endWeek(s: CareerState, playedMatchId?: number): WeekResult {
  if (nominationPending(s)) {
    s.weekHold = { playedMatchId };
    return { mslReports: [], playedMatchId, needNomination: true };
  }
  return { ...finishWeek(s), playedMatchId };
}

/** 조 지명식을 마치고(또는 남은 차례를 자동으로) 이번 주 마무리 */
export function completeWeek(s: CareerState): WeekResult {
  if (!s.weekHold) throw new CareerError("마무리할 주가 없습니다");
  const pm = s.weekHold.playedMatchId;
  delete s.weekHold;
  return { ...finishWeek(s), playedMatchId: pm };
}

export function advanceWeek(s: CareerState, myEntry?: number[]): WeekResult {
  if (s.phase === "offseason") throw new CareerError("시즌이 끝났습니다. 다음 시즌을 시작하세요");
  if (s.weekHold) throw new CareerError("조 지명식을 먼저 진행하세요");
  if (s.live) throw new CareerError("진행 중인 경기가 있습니다");
  const mine = myPendingMatch(s);
  if (mine) {
    const sets = mine.stage === "final" ? FINAL_SETS : PRO_SETS;
    if (!myEntry) throw new CareerError("엔트리를 편성해주세요");
    if (rosterOf(s, s.myTeam).length < MIN_ROSTER) throw new CareerError(`선수가 최소 ${MIN_ROSTER}명 있어야 경기를 치를 수 있습니다`);
    validateEntry(s, myEntry, sets);
  }
  let broadcast: PlayedSet[] | undefined;
  let m = mine, last = mine;
  while (m) {
    broadcast = playMatch(s, m, myEntry);
    last = m;
    m = myPendingMatch(s);
  }
  return { ...endWeek(s, last?.id), broadcast };
}

/** 이번 주 나머지 일정 (다른 팀 경기·스타리그·스폰서) 진행 후 다음 주로 */
function finishWeek(s: CareerState): WeekResult {
  // 다른 팀 선수의 주간 훈련·휴식 (경기 시작 요청을 가볍게 하려고 주 마무리 때 한꺼번에)
  applyActions(s);
  const proReports: ProReport[] = [];
  for (const m of s.matches.filter(x => !x.done && x.week === s.week)) {
    const sets = playMatch(s, m);
    if (m.stage !== "regular" && m.a !== s.myTeam && m.b !== s.myTeam) {
      proReports.push({ matchId: m.id, stage: m.stage, a: m.a, b: m.b, sa: m.scoreA ?? 0, sb: m.scoreB ?? 0, sets: sets.map(x => ({ ...x })), entryA: m.entryA ?? [], entryB: m.entryB ?? [], maps: m.maps });
      for (const x of sets) { delete x.timeline; delete x.highlights; }
    }
  }
  const { reports: mslReports, plans: mslPlans } = s.phase !== "offseason" ? runMslWeek(s) : { reports: [], plans: [] };
  // 2부 리그 (정규시즌 매주 2경기, 마지막 주에 우승자)
  if (s.phase === "regular") runReserveWeek(s, s.week >= REGULAR_WEEKS);
  // 다른 팀은 고정 후원금, 우리 팀은 고른 스폰서 (구단 운영 → 스폰서)
  for (const t of proTeams(s)) if (t.id !== s.myTeam) t.money += WEEKLY_SPONSOR;
  weeklyClub(s);
  // 한 주(프로리그 2경기)가 끝나면 모든 선수 컨디션 10% 회복
  for (const p of activePlayers(s)) p.cond = clampCond(p.cond + WEEKLY_COND_RECOVERY);
  // 다른 구단은 여유 자금으로 주전 선수 아이템 구입
  if (s.phase !== "offseason") aiShopping(s);
  // 우리 선수 행동력: 매주 20 (최대 40까지 모임)
  for (const p of [...rosterOf(s, s.myTeam), ...s.players.filter(x => x.team === s.myTeam && x.reserve)]) p.ap = playerAp(p) + WEEKLY_AP;
  pruneHighlights(s);
  s.week++;
  rollWeekBursts(s);
  s.ap = WEEKLY_AP;
  progressSchedule(s);
  return { mslReports, mslPlans, proReports };
}

// ── 우리 경기: 세트마다 진행 ──────────────────────────────────────

const setsOf = (m: CMatch) => (m.stage === "final" ? FINAL_SETS : PRO_SETS);
const needOf = (m: CMatch) => (m.stage === "final" ? FINAL_WIN : PRO_WIN);

/** 엔트리(1~(n-1)세트)를 내고 경기 시작. 선수 행동은 이때 반영된다 */
export type SetItemPlan = Record<number, { key: string; predict?: number }>;

export function beginMatch(s: CareerState, front: number[], items: SetItemPlan = {}) {
  if (s.live) throw new CareerError("이미 진행 중인 경기가 있습니다");
  if (s.weekHold) throw new CareerError("조 지명식을 먼저 진행하세요");
  const m = myPendingMatch(s);
  if (!m) throw new CareerError("이번 주 우리 팀 경기가 없습니다");
  const sets = setsOf(m);
  if (front.length !== sets - 1) throw new CareerError(`1~${sets - 1}세트 엔트리를 모두 정해주세요`);
  for (const id of front) if (s.players[id]?.team !== s.myTeam) throw new CareerError("우리 팀 선수만 출전할 수 있습니다");
  if (new Set(front).size !== front.length) throw new CareerError(`1~${sets - 1}세트에는 서로 다른 선수를 배치해야 합니다`);
  // 경기 아이템 확인 (세트마다 하나, 보유 수량 안에서)
  const need: Record<string, number> = {};
  for (const [k, v] of Object.entries(items)) {
    const i = Number(k);
    const it = ITEM_BY_KEY[v.key];
    if (!it || it.kind !== "match") throw new CareerError("경기에 쓸 수 없는 아이템입니다");
    if (!(i >= 0 && i < sets - 1)) throw new CareerError("아이템은 1~4세트에만 쓸 수 있습니다");
    if (v.key === "sniping" && (v.predict === undefined || !s.players[v.predict])) throw new CareerError("스나이핑할 상대 선수를 골라주세요");
    need[v.key] = (need[v.key] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(need)) if ((s.inventory?.[k] ?? 0) < n) throw new CareerError(`${ITEM_BY_KEY[k].name} 이(가) 부족합니다`);
  const oppTeam = m.a === s.myTeam ? m.b : m.a;
  s.live = { matchId: m.id, mine: [...front], opp: aiEntry(s, oppTeam, sets), sets: [], items };
  return { matchId: m.id };
}

export interface LiveSetResult {
  set: PlayedSet;
  /** 이 세트로 경기가 끝남 */
  matchOver: boolean;
  playedMatchId?: number;
  /** 경기가 끝났으면 이번 주 나머지 결과 */
  week?: WeekResult;
  /** 다음 세트가 ACE 결정전 (선수를 골라야 함) */
  needAce: boolean;
}

/** 다음 세트 진행. ACE 결정전이면 ace(우리 선수, 누구나)를 함께 보낸다 */
export function playLiveSet(s: CareerState, ace?: number): LiveSetResult {
  const live = s.live;
  if (!live) throw new CareerError("진행 중인 경기가 없습니다");
  const m = s.matches.find(x => x.id === live.matchId)!;
  const sets = setsOf(m), need = needOf(m);
  const i = live.sets.length;
  if (i === sets - 1) {
    if (ace === undefined || s.players[ace]?.team !== s.myTeam) throw new CareerError("ACE 결정전에 나갈 선수를 골라주세요");
    live.mine[i] = ace;
  }
  const meA = m.a === s.myTeam;
  const entryA = meA ? live.mine : live.opp, entryB = meA ? live.opp : live.mine;
  // 경기 아이템 (쓸 때 소모)
  const plan = live.items?.[i];
  const mod: SetMods = {};
  let sniped = false;
  if (plan && (s.inventory?.[plan.key] ?? 0) > 0) {
    s.inventory![plan.key]--;
    if (plan.key === "cheer") mod.all = ITEM_BY_KEY.cheer.all;
    if (plan.key === "gum") mod.gum = true;
    if (plan.key === "sniping" && plan.predict === live.opp[i]) { mod.mul = 1.1; sniped = true; }
  }
  const mods = meA ? { a: mod } : { b: mod };
  const set = withStageGrowth(stageGrowthOf(m), () => playSet(s, s.players[entryA[i]], s.players[entryB[i]], m.maps[i % m.maps.length], true, true, mods));
  if (plan) {
    set.item = plan.key;
    set.sniped = sniped;
    const me = s.players[live.mine[i]];
    const side = meA ? 1 : 2;
    // 원작 해설로 아이템 장면
    const extra = plan.key === "cheer" ? `${me.name} 선수를 응원하는 치어풀이 보이네요.` : sniped ? `${me.name} 선수, 상대를 노리고 나온 것 같은데요!` : undefined;
    if (extra && set.timeline) set.timeline.lines.unshift({ t: 0, side, text: extra });
    const myWin = (set.winner === "a") === meA;
    if (plan.key === "ceremony" && myWin) {
      pay(s, "세레모니", 150, `${me.name} 승리 세레모니`);
      set.ceremony = 150;
      for (const p of rosterOf(s, s.myTeam)) p.cond = clampCond(p.cond + 1);
    }
  }
  live.sets.push(set);
  const sa = live.sets.filter(x => x.winner === "a").length, sb = live.sets.length - sa;
  if (sa >= need || sb >= need) {
    recordMatch(s, m, entryA, entryB, live.sets);
    delete s.live;
    // 이번 주 우리 경기가 더 남았으면 (한 주 2경기) 주를 넘기지 않음
    if (myPendingMatch(s)) return { set, matchOver: true, playedMatchId: m.id, needAce: false };
    const week = endWeek(s, m.id);
    return { set, matchOver: true, playedMatchId: m.id, week, needAce: false };
  }
  return { set, matchOver: false, needAce: live.sets.length === sets - 1 };
}

/** 정규시즌 → 준PO(3·4위) → PO(2위 vs 준PO 승자) → 결승(1위 vs PO 승자) → 시즌 종료 */
function progressSchedule(s: CareerState) {
  if (s.phase === "regular" && s.week > REGULAR_WEEKS) {
    s.phase = "postseason";
    const st = standings(s);
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "semi", a: st[2].id, b: st[3].id, maps: pickMaps(PRO_SETS, s.mapPool) });
    const myRank = st.findIndex(t => t.id === s.myTeam) + 1;
    news(s, `정규시즌 종료! 1위 ${st[0].name}. 우리 팀 ${myRank}위${myRank <= 4 ? " — 포스트시즌 진출!" : " — 포스트시즌 진출 실패"}`);
    return;
  }
  if (s.phase !== "postseason") return;
  const last = s.matches.filter(m => m.stage !== "regular" && m.done).sort((a, b) => b.id - a.id)[0];
  if (!last || s.matches.some(m => !m.done)) return;
  const st = standings(s);
  if (last.stage === "semi") {
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "po", a: st[1].id, b: last.winner!, maps: pickMaps(PRO_SETS, s.mapPool) });
  } else if (last.stage === "po") {
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "final", a: st[0].id, b: last.winner!, maps: pickMaps(FINAL_SETS, s.mapPool) });
  } else if (last.stage === "final") {
    finishSeason(s, last);
  }
}

function myPostseasonResult(s: CareerState): string {
  const post = s.matches.filter(m => m.stage !== "regular" && (m.a === s.myTeam || m.b === s.myTeam));
  if (!post.length) return "포스트시즌 진출 실패";
  const final = post.find(m => m.stage === "final");
  if (final) return final.winner === s.myTeam ? "우승" : "준우승";
  if (post.some(m => m.stage === "po")) return "플레이오프";
  return "준플레이오프";
}

function finishSeason(s: CareerState, final: CMatch) {
  s.phase = "offseason";
  const champion = final.winner!;
  const result = myPostseasonResult(s);
  const prize = POSTSEASON_PRIZE[result] ?? 0;
  pay(s, "상금", prize, `프로리그 ${result}`);
  const myRank = standings(s).findIndex(t => t.id === s.myTeam) + 1;
  const msl = s.msl?.season === s.season ? s.msl : undefined;
  s.history.unshift({ season: s.season, champion, myRank, myResult: result, mslChampion: msl?.champion, mslRunnerUp: msl?.runnerUp, team: s.myTeam });
  for (const p of rosterOf(s, champion)) p.titles = [...(p.titles ?? []), `${s.season}시즌 프로리그 우승`];
  news(s, `🏆 ${s.season}시즌 마이프로리그 우승: ${s.teams[champion].name}! 우리 팀 최종 성적: ${result}${prize ? ` (상금 ${prize.toLocaleString()}만원)` : ""}`);
  seasonEndClub(s, result, champion);
}

// ── 다음 시즌 ─────────────────────────────────────────────────

/** 이번 시즌이 끝나면 계약이 끝나는 우리 선수 (1부·2부) */
export function expiringPlayers(s: CareerState) {
  return s.players.filter(p => p.team === s.myTeam && (p.contract?.years ?? 1) <= 1);
}

export function startNextSeason(s: CareerState, opts: { releaseExpiring?: boolean } = {}) {
  if (s.phase !== "offseason") throw new CareerError("아직 시즌이 진행 중입니다");
  const expiring = expiringPlayers(s);
  if (expiring.length && !opts.releaseExpiring) {
    throw new CareerError(`계약이 끝나는 선수가 있습니다: ${expiring.map(p => p.name).join(", ")} — 재계약·트레이드·이적·방출로 정리하거나 "만료 선수 내보내고 시작"을 누르세요`);
  }
  s.season++;
  s.week = 1;
  s.phase = "regular";
  s.ap = WEEKLY_AP;
  s.mapPool = drawMapPool();
  // 나이에 따른 성장 (능력치는 경기·훈련으로만 떨어짐 — 나이 든 선수는 은퇴로 정리)
  for (const p of activePlayers(s)) {
    const age = ageOf(p, s.season);
    if (age <= 21) gainStats(p, 3, 8, 25);
    else if (age <= 24) gainStats(p, 2, 3, 12);
    p.sWins = 0; p.sLosses = 0;
    p.potions = 0;
    // 선수 행동력은 시즌마다 새로 (쌓인 건 시즌 동안만)
    if (p.team === s.myTeam) p.ap = WEEKLY_AP;
    p.cond = randInt(50, 90);
  }
  for (const t of s.teams) { t.wins = 0; t.losses = 0; t.setWins = 0; t.setLosses = 0; }
  // 세대 교체: 은퇴 → 신인 등장
  const gone = retirements(s);
  rookies(s, gone.length);
  ensurePotential(s);
  newSeasonClub(s);
  // AI 팀: 선수가 부족하면 자유계약 선수 영입
  for (const t of proTeams(s)) {
    if (t.id === s.myTeam) continue;
    while (rosterOf(s, t.id).length < 10) {
      const fa = rosterOf(s, FREE_AGENT_TEAM).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
      if (!fa) break;
      fa.team = t.id;
      fa.contract = defaultContract(fa, s.season);
      news(s, `📰 ${t.name}, 자유계약 선수 ${fa.name} 영입`);
    }
  }
  // 지난 시즌 경기 기록은 요약만 남기고 정리
  s.matches = [];
  scheduleRegularSeason(s);
  // 개인리그 시드를 미리 정해 두어 일정표에서 볼 수 있게 (지난 대회 성적은 createMsl 이 참고)
  s.msl = createMsl(s);
  rollWeekBursts(s);
  news(s, `${s.season}시즌 마이프로리그 개막!`);
}

// ── 이적 ──────────────────────────────────────────────────────

export function scoutPlayer(s: CareerState, pid: number) {
  const p = s.players[pid];
  if (!p || p.team !== FREE_AGENT_TEAM) throw new CareerError("무소속 선수만 영입할 수 있습니다");
  if (rosterOf(s, s.myTeam).length >= MAX_ROSTER) throw new CareerError(`선수단은 최대 ${MAX_ROSTER}명입니다`);
  const price = scoutPrice(s, p);
  const me = s.teams[s.myTeam];
  if (me.money < price) throw new CareerError(`자금이 부족합니다 (요구 금액 ${price.toLocaleString()}만원)`);
  pay(s, "영입", -price, `무소속 ${p.name}`);
  p.team = s.myTeam;
  p.reserve = false;
  p.contract = defaultContract(p, s.season);
  p.morale = 70;
  p.action = null;
  news(s, `🤝 ${p.name} 선수 영입 (${price.toLocaleString()}만원)`);
  return { price };
}

export function releasePlayer(s: CareerState, pid: number) {
  const p = s.players[pid];
  if (!p || p.team !== s.myTeam) throw new CareerError("우리 팀 선수가 아닙니다");
  if (s.live) throw new CareerError("경기 중에는 방출할 수 없습니다");
  if (myPendingMatch(s) && rosterOf(s, s.myTeam).length <= MIN_ROSTER) throw new CareerError(`경기를 치르려면 최소 ${MIN_ROSTER}명이 필요합니다`);
  const gain = Math.round(askingPrice(p, s.season) * 0.2 / 10) * 10;
  pay(s, "방출", gain, p.name);
  delete p.contract;
  p.reserve = false;
  p.team = FREE_AGENT_TEAM;
  p.action = null;
  news(s, `👋 ${p.name} 선수 방출 (방출 이득 ${gain.toLocaleString()}만원)`);
  return { gain };
}

// ── 아이템 상점 ─────────────────────────────────────────────────

export interface BuyResult { message: string; delta?: Partial<Record<string, number>> }

/** 아이템 구입. 장비·즉시 사용·포션은 선수(target)에게 바로 쓴다 */
export function buyItem(s: CareerState, key: string, target?: number, qty = 1): BuyResult {
  const it = ITEM_BY_KEY[key];
  if (!it || it.notForSale) throw new CareerError("구입 불가능 품목입니다");
  const me = s.teams[s.myTeam];
  if (it.kind === "match" || it.kind === "stock") {
    const n = Math.max(1, Math.min(99, Math.floor(qty)));
    if (me.money < it.price * n) throw new CareerError("소지금이 부족합니다");
    pay(s, "아이템", -it.price * n, `${it.name}${n > 1 ? ` ×${n}` : ""}`);
    s.inventory = { ...s.inventory, [key]: (s.inventory?.[key] ?? 0) + n };
    return { message: n > 1 ? `${n}개 구입하였습니다` : "구입하였습니다" };
  }
  if (me.money < it.price) throw new CareerError("소지금이 부족합니다");
  const p = target !== undefined ? s.players[target] : undefined;
  if (!p || p.team !== s.myTeam) throw new CareerError("선수를 선택하세요");
  if (it.kind === "equip") {
    const slot = slotOf(it)!;
    if (p.equip?.[slot]?.key === key) throw new CareerError("이미 장착 중입니다");
    pay(s, "아이템", -it.price, `${it.name} (${p.name} 장착)`);
    p.equip = { ...p.equip, [slot]: { key, left: it.uses ?? 20 } };
    news(s, `🛒 ${p.name} 선수 ${it.name} 장착`);
    return { message: "구입하였습니다" };
  }
  if (it.kind === "instant") {
    if (p.cond >= COND_MAX) throw new CareerError("컨디션이 최대입니다");
    pay(s, "아이템", -it.price, `${it.name} (${p.name})`);
    p.cond = clampCond(p.cond + (it.cond ?? 0));
    return { message: "맛있게 마셨다" };
  }
  // 포션: 능력치 무작위 변화
  const po = it.potion!;
  if ((p.potions ?? 0) >= POTION_LIMIT) throw new CareerError("이 선수는 더 사용 할 수 없습니다");
  if (p.cond - po.condCost < COND_MIN) throw new CareerError("컨디션이 너무 낮습니다");
  const keys = po.stat ? [po.stat] : [...STAT_KEYS];
  if (po.min >= 0 && keys.every(k => p.stats[k] >= STAT_MAX_CAREER)) throw new CareerError("이미 최대 수치입니다");
  pay(s, "아이템", -it.price, `${it.name} (${p.name})`);
  p.potions = (p.potions ?? 0) + 1;
  const delta: Record<string, number> = {};
  if (key === "p_vit") {
    p.cond = clampCond(p.cond + randInt(po.min, po.max));
    for (const k of STAT_KEYS) { p.stats[k] = clampStat(p.stats[k] - (po.allMinus ?? 0)); delta[k] = -(po.allMinus ?? 0); }
    return { message: "맛있게 마셨다", delta };
  }
  p.cond = clampCond(p.cond - po.condCost);
  let sum = 0;
  for (const k of keys) {
    const d = randInt(po.min, po.max);
    const before = p.stats[k];
    p.stats[k] = clampStat(before + d);
    delta[k] = p.stats[k] - before;
    sum += delta[k];
  }
  const avg = sum / keys.length;
  const message = avg < 0 ? "정신이 몽롱해진다..." : avg < (po.max - po.min) * 0.25 + Math.max(0, po.min) ? "먹은것 같긴한데..." : avg >= po.max * 0.7 ? "호랑이 기운이 솟아났다" : "맛있게 마셨다";
  return { message, delta };
}

/** 보관한 아이템을 선수에게 사용 (비타비타: 컨디션 +3). qty 개까지, 컨디션이 가득 차거나 아이템이 떨어지면 멈춤 */
export function useStockItem(s: CareerState, key: string, target: number, qty = 1): BuyResult & { used?: number } {
  const it = ITEM_BY_KEY[key];
  if (!it || it.kind !== "stock") throw new CareerError("사용할 수 없는 아이템입니다");
  if ((s.inventory?.[key] ?? 0) <= 0) throw new CareerError("아이템이 없습니다");
  const p = s.players[target];
  if (!p || p.team !== s.myTeam) throw new CareerError("대상을 선택해 주세요");
  if (p.cond >= COND_MAX) throw new CareerError("컨디션이 최대 입니다");
  let used = 0;
  while (used < qty && p.cond < COND_MAX && (s.inventory![key] ?? 0) > 0) {
    s.inventory![key]--;
    p.cond = clampCond(p.cond + (it.cond ?? 0));
    used++;
  }
  return { message: used > 1 ? `${used}개 사용했습니다` : "아이템을 사용했습니다", used };
}

// ── 트레이드 ───────────────────────────────────────────────────

/** AI 팀과 선수(+현금) 교환. 우리가 내주는 가치가 상대 요구치 이상이면 성사 */
export function proposeTrade(s: CareerState, teamId: number, myIds: number[], theirIds: number[], cash: number) {
  if (teamId === s.myTeam || teamId === FREE_AGENT_TEAM || !s.teams[teamId]) throw new CareerError("트레이드할 팀을 선택해주세요");
  if (s.live) throw new CareerError("경기 중에는 트레이드할 수 없습니다");
  cash = Math.max(0, Math.round(cash || 0));
  myIds = [...new Set(myIds)];
  theirIds = [...new Set(theirIds)];
  if (!theirIds.length) throw new CareerError("받을 선수를 선택해주세요");
  if (myIds.some(id => s.players[id]?.team !== s.myTeam || s.players[id]?.reserve)) throw new CareerError("우리 1부 선수만 트레이드할 수 있습니다");
  if (theirIds.some(id => s.players[id]?.team !== teamId)) throw new CareerError("상대 팀 선수가 아닙니다");
  const me = s.teams[s.myTeam];
  if (me.money < cash) throw new CareerError("자금이 부족합니다");
  const myAfter = rosterOf(s, s.myTeam).length - myIds.length + theirIds.length;
  const theirAfter = rosterOf(s, teamId).length - theirIds.length + myIds.length;
  if (myAfter > MAX_ROSTER) throw new CareerError(`선수단은 최대 ${MAX_ROSTER}명입니다`);
  if (myAfter < MIN_ROSTER) throw new CareerError(`선수가 최소 ${MIN_ROSTER}명 있어야 합니다`);
  if (theirAfter > MAX_ROSTER) throw new CareerError(`${s.teams[teamId].name} 선수단이 가득 찹니다`);
  if (theirAfter < AI_MIN_ROSTER) throw new CareerError(`${s.teams[teamId].name}은(는) 선수가 너무 적어져서 거절합니다`);
  const ev = evaluateTrade(s, teamId, myIds, theirIds, cash);
  if (ev.get < ev.need) {
    throw new CareerError(`${s.teams[teamId].name}: "조건이 부족합니다" (제시 ${ev.get.toLocaleString()} / 요구 ${ev.need.toLocaleString()})`);
  }
  pay(s, "트레이드", -cash, `${s.teams[teamId].name}와(과) 트레이드`);
  s.teams[teamId].money += cash;
  for (const id of myIds) { s.players[id].team = teamId; s.players[id].action = null; }
  for (const id of theirIds) { s.players[id].team = s.myTeam; s.players[id].action = null; }
  const names = (ids: number[]) => ids.map(id => s.players[id].name).join(", ");
  news(s, `🔁 트레이드 성사: ${names(theirIds)} ⇄ ${myIds.length ? names(myIds) : ""}${cash ? `${myIds.length ? " + " : ""}${cash.toLocaleString()}만원` : ""} (${s.teams[teamId].name})`);
  return ev;
}
