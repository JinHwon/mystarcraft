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
  actionOf, restNotNeeded,
  COND_MIN,
  CPlayer,
  MATCH_MONEY,
  matchNeed,
  matchSets,
  MAX_ROSTER,
  MIN_ROSTER,
  ORIG_STAT_ORDER,
  POSTSEASON_PRIZE,
  Race,
  SetResult,
  START_MONEY,
  STAT_MAX_CAREER,
  STAT_MIN,
  WEEKLY_AP,
  WEEKLY_SPONSOR,
  B_MATCH_MONEY,
  B_WEEKLY_SPONSOR,
  ageOf,
  askingPrice,
  burstOf,
  condMultiplier,
  snapOf,
  totalOf,
  type PlayerSnap,
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
import { broadcastRights, gateIncome, regularSeasonPrize, weeklyGoods } from "./income";
import { applyPromo, ensureDivisions, fillBRosters, fmt, promoMoves, rosterLimits, scheduleDivision, schedulePromo } from "./divisions";
import { createMsl, mslDueThisWeek, mslPlayersThisWeek, nominationPending, runMslWeek, type MslReport } from "./msl";
import { ITEM_BY_KEY, isStackable, packOf, slotOf, stackMax } from "@shared/career/items";
import { ensurePotential, retirements, rookies } from "./generation";
import { addManagerExp, mainSponsorPay, book, ensureClub, newSeasonClub, pay, seasonEndClub, weeklyClub } from "./club";
import { EVENT_INCOME_MAX, cheerChance, defaultContract, eventCondCost, eventIncome, popularity, scoutPrice } from "@shared/career/contract";
export type { MslReport };

const RACE: Record<string, Race> = { T: "terran", Z: "zerg", P: "protoss" };
const REGULAR_WEEKS = 11;




import { rosterOf, proTeams, standings, myPendingMatch, evaluateTrade, activePlayers, divOf, divTeams, leagueName, myDiv } from "@shared/career/view";
export { rosterOf, proTeams, standings, myPendingMatch };

// ── 새 게임 ─────────────────────────────────────────────────────

export function newCareer(myTeam: number): CareerState {
  const teams = initialTeams();
  if (!teams[myTeam] || myTeam === FREE_AGENT_TEAM) throw new CareerError("팀을 선택해주세요");
  const players = initialPlayers(() => COND_MAX);
  const s: CareerState = {
    version: 1,
    myTeam,
    season: 1,
    week: 1,
    phase: "regular",
    ap: WEEKLY_AP,
    players,
    teams,
    matches: [],
    nextMatchId: 1,
    news: [],
    history: [],
    mapPool: drawMapPool(),
    condScale: 100,
  };
  // 2부 B팀 선수 채우기 (무소속 유망주 + 신예)
  fillBRosters(s, true);
  ensureClub(s);
  ensurePotential(s);
  scheduleRegularSeason(s);
  // 개인리그 시드를 미리 정해 두어 일정표에서 볼 수 있게
  s.msl = createMsl(s);
  rollWeekBursts(s);
  news(s, `${s.teams[myTeam].name} 감독으로 부임했습니다. ${s.season}시즌 ${leagueName(myDiv(s))}가 곧 개막합니다!`);
  return s;
}

/** 예전 세이브 보정 */
export function migrateCareer(s: CareerState) {
  if (!s.mapPool?.length) s.mapPool = drawMapPool();
  ensureDivisions(s);
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
 * 6주차는 같은 상대와 두 번 붙는다 (원작 일정표와 같음). 1부·2부 같은 일정
 */
function scheduleRegularSeason(s: CareerState) {
  scheduleDivision(s, 1);
  scheduleDivision(s, 2);
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


/** 연봉 불만 기간인지 (sulkUntil = "시즌-주") */
function sulking(s: CareerState, p: CPlayer) {
  const [ss, ww] = (p.sulkUntil ?? "0-0").split("-").map(Number);
  return s.season < ss || (s.season === ss && s.week <= ww);
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
      // 인기 많은 선수일수록 팬미팅 수익이 큼 (최대 150만). 한 주에 팬미팅을 여러 번 열수록 팬이 덜 모임 (한 번에 10%씩, 최소 30%)
      // (예전엔 선수 전원이 매주 팬미팅만 해도 시즌에 2억 넘게 벌려 경제가 무너졌음)
      const wk = `${s.season}-${s.week}`;
      if (mine && s.eventCount?.week !== wk) s.eventCount = { week: wk, n: 0 };
      const fade = mine ? Math.max(0.3, 1 - 0.1 * s.eventCount!.n++) : 1;
      // 인기(능력치·승수·우승 경력)가 높은 선수일수록 훨씬 많이 벌어옴
      const earn = Math.round(Math.min(EVENT_INCOME_MAX, eventIncome(p) + randInt(0, 6)) * fade);
      if (mine) {
        pay(s, "이벤트", earn, `${p.name} 팬미팅`);
        // 팬미팅: 인기가 많을수록 치어풀을 받을 확률이 높음
        if (rand() < cheerChance(p)) {
          s.inventory = { ...s.inventory, cheer: (s.inventory?.cheer ?? 0) + 1 };
          news(s, `📣 ${p.name} 선수가 팬미팅에서 치어풀을 선물 받았습니다!`);
        }
      }
      p.cond = clampCond(p.cond - randInt(3, 5) - eventCondCost(p));
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
export function runMyActions(s: CareerState, only?: number): { results: ActionResult[]; skipped: number[]; full: number[] } {
  if (s.live) throw new CareerError("경기 중에는 행동을 진행할 수 없습니다");
  // only: 그 선수만 (선수 카드의 진행 버튼)
  // 팬미팅은 한 주에 여러 번 열수록 수익이 줄어드므로, 인기 많은 선수부터 진행
  const roster = rosterOf(s, s.myTeam).filter(p => only === undefined || p.id === only)
    .sort((a, b) => Number(b.action === "event") - Number(a.action === "event") || popularity(b) - popularity(a));
  if (!roster.some(p => p.action)) throw new CareerError("행동을 정한 선수가 없습니다");
  const results: ActionResult[] = [];
  const skipped: number[] = [];
  const full: number[] = [];
  for (const p of roster) {
    const a = actionOf(p.action);
    if (!a) continue;
    // 컨디션 100% 선수의 휴식은 건너뜀 (행동력도 그대로)
    if (restNotNeeded(p)) { full.push(p.id); continue; }
    if (playerAp(p) < a.ap) { skipped.push(p.id); continue; }
    p.ap = playerAp(p) - a.ap;
    const before = { cond: p.cond, stats: { ...p.stats }, money: s.teams[s.myTeam].money, cheer: s.inventory?.cheer ?? 0 };
    actOne(s, p, a.key);
    const stats = Object.fromEntries(STAT_KEYS.map(k => [k, p.stats[k] - before.stats[k]]).filter(([, d]) => d !== 0));
    results.push({ id: p.id, action: a.key, ap: p.ap, cond: [before.cond, p.cond], stats, money: s.teams[s.myTeam].money - before.money, cheer: (s.inventory?.cheer ?? 0) > before.cheer || undefined });
  }
  if (!results.length) throw new CareerError(full.length && !skipped.length ? "컨디션이 이미 100%라 휴식할 필요가 없습니다" : "행동력이 부족합니다 (매주 선수마다 20씩 받습니다)");
  s.myActionsWeek = `${s.season}-${s.week}`;
  return { results, skipped, full };
}

/** 선수 행동력 (예전 세이브·새로 온 선수는 한 주치) */
export const playerAp = (p: CPlayer) => p.ap ?? WEEKLY_AP;

// ── 경기 ───────────────────────────────────────────────────────

/** AI 엔트리: 1~(n-1)세트는 상위 선수 중 무작위(중복 없음), 마지막 세트(에이스 결정전)는 최강 선수 */
export function aiEntry(s: CareerState, team: number, sets: number): number[] {
  const roster = rosterOf(s, team)
    .map(p => ({ p, v: totalOf(p.stats) * condMultiplier(p.cond) * (burstOf(s, p) ?? 1) }))
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
  // 홈 팀 관중 수입
  gateIncome(s, m);
  // 다른 팀은 리그 기본 수당, 우리 팀은 메인 스폰서 계약 수당
  const loserTeam = m.winner === m.a ? m.b : m.a;
  const money = (team: number) => (divOf(s, team) === 2 ? B_MATCH_MONEY : MATCH_MONEY);
  if (m.winner !== s.myTeam) s.teams[m.winner].money += money(m.winner).win;
  if (loserTeam !== s.myTeam) s.teams[loserTeam].money += money(loserTeam).lose;
  if (m.a === s.myTeam || m.b === s.myTeam) {
    const won = m.winner === s.myTeam;
    const oppTeam = s.teams[m.a === s.myTeam ? m.b : m.a];
    const [my, their] = m.a === s.myTeam ? [sa, sb] : [sb, sa];
    const stageName = m.stage === "regular" ? `${m.week}주차 ${m.leg ?? 1}경기` : ({ semi: "준플레이오프", po: "플레이오프", final: "결승", promo: "승강전" } as const)[m.stage];
    mainSponsorPay(s, won ? "win" : "loss", won ? "스폰서 승리 수당" : "스폰서 패배 수당", `${stageName} vs ${oppTeam.name} ${my}:${their}`);
    addManagerExp(s, won ? 30 : 10);
  }
  // 출전 기록 (사기·출전 보장 조건)
  for (const id of new Set(results.flatMap(r => [r.a, r.b]))) s.players[id].sApps = (s.players[id].sApps ?? 0) + 1;
  if (m.a === s.myTeam || m.b === s.myTeam) {
    const won = m.winner === s.myTeam;
    const opp = s.teams[m.a === s.myTeam ? m.b : m.a];
    const stageName = { regular: `${m.week}주차`, semi: "준플레이오프", po: "플레이오프", final: "결승", promo: "승강전" }[m.stage];
    news(s, `${won ? "🎉" : "😢"} ${stageName} vs ${opp.name} ${Math.max(sa, sb)}:${Math.min(sa, sb)} ${won ? "승리" : "패배"}`);
  }
}

/** 포스트시즌·승강전은 경기 뒤 능력치가 크게 오름 */
const stageGrowthOf = (m: CMatch) => (m.stage === "regular" ? 1 : STAGE_GROWTH[m.stage]);
/** 2부 정규 경기는 어린 선수일수록 크게 성장 */
const youthOf = (m: CMatch) => m.stage === "regular" && m.div === 2;

function playMatch(s: CareerState, m: CMatch, myEntry?: number[]): PlayedSet[] {
  const sets = matchSets(m);
  const need = matchNeed(m);
  // 우리 경기와 포스트시즌(준PO·PO·결승)은 중계
  const involvesMe = m.a === s.myTeam || m.b === s.myTeam || m.stage !== "regular";
  if (m.winners) return playWinnersMatch(s, m, involvesMe, myEntry);
  const entryA = m.a === s.myTeam && myEntry ? myEntry : aiEntry(s, m.a, sets);
  const entryB = m.b === s.myTeam && myEntry ? myEntry : aiEntry(s, m.b, sets);
  let sa = 0, sb = 0;
  const results: PlayedSet[] = [];
  for (let i = 0; i < sets && sa < need && sb < need; i++) {
    const pa = s.players[entryA[i]], pb = s.players[entryB[i]];
    if (!pa || !pb) continue;
    // 다른 팀끼리 경기는 빠른 판정 (중계가 필요 없음)
    const r = withStageGrowth(stageGrowthOf(m), () => (involvesMe ? playSet(s, pa, pb, m.maps[i % m.maps.length], true, true) : quickSet(s, pa, pb, m.maps[i % m.maps.length])), youthOf(m));
    if (r.winner === "a") sa++; else sb++;
    results.push(r);
  }
  recordMatch(s, m, entryA, entryB, results);
  return results;
}

/**
 * 위너스리그 출전 순서 (AI): 컨디션 반영 능력치 상위 선수들, 가장 강한 선수는 뒤에 (마무리)
 * first 를 주면 그 선수가 선봉
 */
export function winnersOrder(s: CareerState, team: number, first?: number): number[] {
  const ranked = rosterOf(s, team).map(p => ({ id: p.id, v: totalOf(p.stats) * condMultiplier(p.cond) * (burstOf(s, p) ?? 1) })).sort((a, b) => b.v - a.v).map(x => x.id);
  const top = ranked.slice(0, 7);
  const [ace, ...rest] = top;
  const order = [...shuffle(rest), ace].filter(id => id !== undefined && id !== first);
  const tail = ranked.slice(7).filter(id => id !== first);
  return first !== undefined ? [first, ...order, ...tail] : [...order, ...tail];
}

/** 위너스리그 다음 출전 선수: 순서대로, 이번 경기에서 진 선수는 빠짐 (모두 졌으면 처음부터 다시) */
function nextInOrder(order: number[], out: Set<number>) {
  return order.find(id => !out.has(id)) ?? order[0];
}

/** 이번 경기에서 진(탈락한) 선수 */
function winnersOut(sets: SetResult[], side: "a" | "b") {
  return new Set(sets.filter(x => x.winner !== side).map(x => (side === "a" ? x.a : x.b)));
}

/** 위너스리그 한 경기 (AI끼리, 또는 엔트리를 미리 낸 우리 경기): 이긴 선수는 질 때까지, 진 팀은 순서대로 다음 선수 */
function playWinnersMatch(s: CareerState, m: CMatch, withBroadcast: boolean, myEntry?: number[]): PlayedSet[] {
  const need = matchNeed(m);
  const orderA = winnersOrder(s, m.a, m.a === s.myTeam ? myEntry?.[0] : undefined);
  const orderB = winnersOrder(s, m.b, m.b === s.myTeam ? myEntry?.[0] : undefined);
  let pa = orderA[0], pb = orderB[0];
  const results: PlayedSet[] = [];
  let sa = 0, sb = 0;
  for (let i = 0; sa < need && sb < need; i++) {
    const map = m.maps[i % m.maps.length];
    const r = withStageGrowth(stageGrowthOf(m), () => (withBroadcast ? playSet(s, s.players[pa], s.players[pb], map, true, true) : quickSet(s, s.players[pa], s.players[pb], map)), youthOf(m));
    results.push(r);
    if (r.winner === "a") { sa++; pb = nextInOrder(orderB, winnersOut(results, "b")); }
    else { sb++; pa = nextInOrder(orderA, winnersOut(results, "a")); }
  }
  recordMatch(s, m, results.map(x => x.a), results.map(x => x.b), results);
  return results;
}

/** 포스트시즌 다른 팀 경기 (중계 화면용, 세이브에는 해설을 남기지 않음) */
export interface ProReport { matchId: number; stage: CMatch["stage"]; a: number; b: number; sa: number; sb: number; sets: PlayedSet[]; entryA: number[]; entryB: number[]; maps: number[]; pre?: Record<number, PlayerSnap>; winners?: boolean }

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
  /** 개인리그 경기 전 준비 (컨디션·아이템) — 확인을 누르면 completeWeek 로 개인리그 진행 */
  needMsl?: number[];
}

/**
 * 이번 주 경기가 끝난 뒤: 조 지명식을 기다려야 하면 멈추고,
 * 우리 경기를 치렀고 이번 주 개인리그에 우리 선수가 나가면 (컨디션·아이템을 챙기도록) 멈추고, 아니면 마무리
 */
function endWeek(s: CareerState, playedMatchId?: number): WeekResult {
  if (nominationPending(s)) {
    s.weekHold = { playedMatchId };
    return { mslReports: [], playedMatchId, needNomination: true };
  }
  // 다른 팀 경기 먼저 (포스트시즌이면 관전), 개인리그는 다음 단계로 나눠 한 번에 너무 많이 치르지 않음
  const proReports = playOtherMatches(s);
  const msl = mslPlayersThisWeek(s);
  if ((playedMatchId !== undefined && msl.length) || (proReports.length && mslDueThisWeek(s))) {
    s.weekHold = { playedMatchId, msl };
    return { mslReports: [], playedMatchId, proReports, needMsl: msl };
  }
  const done = finishWeek(s);
  return { ...done, proReports: [...proReports, ...(done.proReports ?? [])], playedMatchId };
}

const holdMessage = (s: CareerState) => (s.weekHold?.msl ? "이번 주 개인리그를 먼저 진행하세요" : "조 지명식을 먼저 진행하세요");

/** 조 지명식을 마치고(또는 남은 차례를 자동으로), 또는 개인리그 준비를 마치고 이번 주 마무리 */
export function completeWeek(s: CareerState): WeekResult {
  if (!s.weekHold) throw new CareerError("마무리할 주가 없습니다");
  const pm = s.weekHold.playedMatchId;
  delete s.weekHold;
  return { ...finishWeek(s), playedMatchId: pm };
}

export function advanceWeek(s: CareerState, myEntry?: number[]): WeekResult {
  if (s.phase === "offseason") throw new CareerError("시즌이 끝났습니다. 다음 시즌을 시작하세요");
  if (s.weekHold) throw new CareerError(holdMessage(s));
  if (s.live) throw new CareerError("진행 중인 경기가 있습니다");
  const mine = myPendingMatch(s);
  if (mine) {
    const sets = matchSets(mine);
    if (!myEntry) throw new CareerError("엔트리를 편성해주세요");
    if (rosterOf(s, s.myTeam).length < MIN_ROSTER) throw new CareerError(`선수가 최소 ${MIN_ROSTER}명 있어야 경기를 치를 수 있습니다`);
    if (mine.winners) { if (s.players[myEntry[0]]?.team !== s.myTeam) throw new CareerError("선봉으로 나갈 우리 선수를 골라주세요"); }
    else validateEntry(s, myEntry, sets);
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

/** 이번 주 다른 팀 경기 (한 번만: 이미 치른 경기는 건너뜀). 우리 팀이 없는 포스트시즌 경기는 관전용 중계를 돌려줌 */
function playOtherMatches(s: CareerState): ProReport[] {
  // 다른 팀 선수의 주간 훈련·휴식 (경기 시작 요청을 가볍게 하려고 주 마무리 때 한꺼번에)
  applyActions(s);
  const proReports: ProReport[] = [];
  for (const m of s.matches.filter(x => !x.done && x.week === s.week)) {
    const watched = m.stage !== "regular" && m.a !== s.myTeam && m.b !== s.myTeam;
    // 관전 화면용: 경기 직전 양 팀 선수 상태
    const pre = watched ? Object.fromEntries([...rosterOf(s, m.a), ...rosterOf(s, m.b)].map(p => [p.id, snapOf(p, s)])) : undefined;
    const sets = playMatch(s, m);
    if (watched) {
      proReports.push({ matchId: m.id, stage: m.stage, a: m.a, b: m.b, sa: m.scoreA ?? 0, sb: m.scoreB ?? 0, sets: sets.map(x => ({ ...x })), entryA: m.entryA ?? [], entryB: m.entryB ?? [], maps: m.maps, pre, ...(m.winners ? { winners: true } : {}) });
      for (const x of sets) { delete x.timeline; delete x.highlights; }
    }
  }
  return proReports;
}

/** 이번 주 나머지 일정 (다른 팀 경기·스타리그·스폰서) 진행 후 다음 주로 */
function finishWeek(s: CareerState): WeekResult {
  const proReports = playOtherMatches(s);
  const { reports: mslReports, plans: mslPlans } = s.phase !== "offseason" ? runMslWeek(s) : { reports: [], plans: [] };
  // 다른 팀은 고정 후원금 (2부는 적게), 우리 팀은 고른 스폰서 (구단 운영 → 스폰서)
  for (const t of proTeams(s)) if (t.id !== s.myTeam) t.money += t.div === 2 ? B_WEEKLY_SPONSOR : WEEKLY_SPONSOR;
  weeklyClub(s);
  // 굿즈 판매 (모든 구단)
  if (s.phase !== "offseason") weeklyGoods(s);
  // 2부 팀 최소 인원 (이적·은퇴로 모자라면 리그가 채움)
  fillBRosters(s);
  // 한 주(프로리그 2경기)가 끝나면 모든 선수 컨디션 10% 회복
  // 연봉 협상이 틀어져 불만인 선수는 그 기간 동안 회복 없음
  for (const p of activePlayers(s)) {
    if (p.sulkUntil && sulking(s, p)) continue;
    if (p.sulkUntil) delete p.sulkUntil;
    p.cond = clampCond(p.cond + WEEKLY_COND_RECOVERY);
  }
  // 다른 구단은 여유 자금으로 주전 선수 아이템 구입
  if (s.phase !== "offseason") aiShopping(s);
  // 우리 선수 행동력: 매주 20 (최대 40까지 모임)
  for (const p of rosterOf(s, s.myTeam)) p.ap = playerAp(p) + WEEKLY_AP;
  pruneHighlights(s);
  s.week++;
  rollWeekBursts(s);
  s.ap = WEEKLY_AP;
  progressSchedule(s);
  return { mslReports, mslPlans, proReports };
}

// ── 우리 경기: 세트마다 진행 ──────────────────────────────────────

const setsOf = (m: CMatch) => matchSets(m);
const needOf = (m: CMatch) => matchNeed(m);

/** 엔트리(1~(n-1)세트)를 내고 경기 시작. 선수 행동은 이때 반영된다 */
export type SetItemPlan = Record<number, { key: string; predict?: number }>;

export function beginMatch(s: CareerState, front: number[], items: SetItemPlan = {}) {
  if (s.live) throw new CareerError("이미 진행 중인 경기가 있습니다");
  if (s.weekHold) throw new CareerError(holdMessage(s));
  const m = myPendingMatch(s);
  if (!m) throw new CareerError("이번 주 우리 팀 경기가 없습니다");
  const sets = setsOf(m);
  if (m.winners) return beginWinners(s, m, front, items);
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

/** 위너스리그 경기 시작: 선봉 한 명 (+ 1세트 아이템, 스나이핑으로 상대 선봉 예측 가능) */
function beginWinners(s: CareerState, m: CMatch, front: number[], items: SetItemPlan) {
  const first = front[0];
  if (front.length !== 1 || s.players[first]?.team !== s.myTeam) throw new CareerError("선봉으로 나갈 우리 선수 한 명을 골라주세요");
  if (rosterOf(s, s.myTeam).length < MIN_ROSTER) throw new CareerError(`선수가 최소 ${MIN_ROSTER}명 있어야 경기를 치를 수 있습니다`);
  for (const [k, v] of Object.entries(items)) {
    const it = ITEM_BY_KEY[v.key];
    if (Number(k) !== 0) throw new CareerError("위너스리그는 1세트에만 아이템을 미리 정합니다");
    if (!it || it.kind !== "match") throw new CareerError("경기에 쓸 수 없는 아이템입니다");
    if (v.key === "sniping" && (v.predict === undefined || !s.players[v.predict])) throw new CareerError("스나이핑할 상대 선수를 골라주세요");
    if ((s.inventory?.[v.key] ?? 0) < 1) throw new CareerError(`${it.name} 이(가) 부족합니다`);
  }
  const oppTeam = m.a === s.myTeam ? m.b : m.a;
  const oppOrder = winnersOrder(s, oppTeam);
  s.live = { matchId: m.id, mine: [first], opp: [oppOrder[0]], sets: [], items, oppOrder, winners: true };
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

/**
 * 다음 세트 진행. ACE 결정전이면 ace(우리 선수, 누구나)를 함께 보낸다
 * 위너스리그: 우리 선수가 지면 다음 세트에 나갈 선수를 ace 로 보낸다 (이번 경기에서 진 선수는 못 나옴)
 */
export function playLiveSet(s: CareerState, ace?: number): LiveSetResult {
  const live = s.live;
  if (!live) throw new CareerError("진행 중인 경기가 없습니다");
  const m = s.matches.find(x => x.id === live.matchId)!;
  const sets = setsOf(m), need = needOf(m);
  const i = live.sets.length;
  const meA0 = m.a === s.myTeam;
  if (live.winners && i > 0) {
    const prev = live.sets[i - 1];
    const myWon = (prev.winner === "a") === meA0;
    const myOut = winnersOut(live.sets, meA0 ? "a" : "b");
    if (myWon) {
      live.mine[i] = live.mine[i - 1];
      live.opp[i] = live.opp[i] ?? nextInOrder(live.oppOrder ?? [live.opp[i - 1]], winnersOut(live.sets, meA0 ? "b" : "a"));
    } else {
      const left = rosterOf(s, s.myTeam).filter(p => !myOut.has(p.id));
      if (ace === undefined || s.players[ace]?.team !== s.myTeam) throw new CareerError("다음 세트에 나갈 선수를 골라주세요");
      if (myOut.has(ace) && left.length) throw new CareerError("이번 경기에서 진 선수는 다시 나갈 수 없습니다");
      live.mine[i] = ace;
      live.opp[i] = live.opp[i - 1];
    }
  } else if (!live.winners && i === sets - 1) {
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
    if (ITEM_BY_KEY[plan.key]?.setBonus) mod.bonus = ITEM_BY_KEY[plan.key].setBonus;
    if (plan.key === "sniping" && plan.predict === live.opp[i]) { mod.mul = 1.1; sniped = true; }
  }
  const mods = meA ? { a: mod } : { b: mod };
  const set = withStageGrowth(stageGrowthOf(m), () => playSet(s, s.players[entryA[i]], s.players[entryB[i]], m.maps[i % m.maps.length], true, true, mods), youthOf(m));
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
  // 위너스리그: 우리 선수가 졌으면 다음 선수를 골라야 함
  if (live.winners) return { set, matchOver: false, needAce: (set.winner === "a") !== meA };
  return { set, matchOver: false, needAce: live.sets.length === sets - 1 };
}

const PLAYOFF: ReadonlyArray<CMatch["stage"]> = ["semi", "po", "final"];

/**
 * 정규시즌 → 준PO(3·4위) → PO(2위 vs 준PO 승자) → 결승(1위 vs PO 승자) → 시즌 종료 (1부)
 * 준PO 주에 승강전 (1부 11·12위 vs 2부 2·1위)도 함께
 */
function progressSchedule(s: CareerState) {
  if (s.phase === "regular" && s.week > REGULAR_WEEKS) {
    s.phase = "postseason";
    const st = standings(s, 1);
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "semi", div: 1, a: st[2].id, b: st[3].id, ...fmt(s, "semi") });
    schedulePromo(s);
    regularSeasonPrize(s);
    const mine = standings(s);
    const myRank = mine.findIndex(t => t.id === s.myTeam) + 1;
    const n = mine.length;
    const note = myDiv(s) === 2
      ? (myRank <= 2 ? " — 승강전 진출! 이기면 1부 승격" : "")
      : myRank <= 4 ? " — 포스트시즌 진출!" : myRank > n - 2 ? " — 승강전으로 1부 잔류를 다툽니다" : " — 포스트시즌 진출 실패";
    news(s, `정규시즌 종료! 1부 1위 ${st[0].name}${divTeams(s, 2).length ? ` · 2부 1위 ${standings(s, 2)[0]?.name}` : ""}. 우리 팀 ${myDiv(s) === 2 ? "2부 " : ""}${myRank}위${note}`);
    return;
  }
  if (s.phase !== "postseason") return;
  const last = s.matches.filter(m => PLAYOFF.includes(m.stage) && m.done).sort((a, b) => b.id - a.id)[0];
  if (!last || s.matches.some(m => !m.done)) return;
  const st = standings(s, 1);
  if (last.stage === "semi") {
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "po", div: 1, a: st[1].id, b: last.winner!, ...fmt(s, "po") });
  } else if (last.stage === "po") {
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "final", div: 1, a: st[0].id, b: last.winner!, ...fmt(s, "final") });
  } else if (last.stage === "final") {
    finishSeason(s, last);
  }
}

/**
 * 우리 팀 시즌 성적 (상금·평판·감독 경험치 기준)
 * 1부: 우승·준우승·플레이오프·준플레이오프·포스트시즌 진출 실패, 승강전에 나갔으면 잔류·강등
 * 2부: 승격(승강전 승리), 2부 우승(1위), 2부 n위
 */
function myPostseasonResult(s: CareerState): string {
  const promo = s.matches.find(m => m.stage === "promo" && (m.a === s.myTeam || m.b === s.myTeam));
  if (myDiv(s) === 2) {
    if (promo?.winner === s.myTeam) return "승격";
    const rank = standings(s, 2).findIndex(t => t.id === s.myTeam) + 1;
    return rank === 1 ? "2부 우승" : `2부 ${rank}위`;
  }
  if (promo) return promo.winner === s.myTeam ? "잔류" : "강등";
  const post = s.matches.filter(m => PLAYOFF.includes(m.stage) && (m.a === s.myTeam || m.b === s.myTeam));
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
  // 2부 1위·승강전 결과 (다음 시즌 시작 때 리그를 바꿈)
  const champion2 = s.matches.some(m => m.div === 2 && m.done) ? standings(s, 2)[0]?.id : undefined;
  const moves = promoMoves(s);
  s.promo = { season: s.season, moves };
  s.history.unshift({ season: s.season, champion, myRank, myResult: result, mslChampion: msl?.champion, mslRunnerUp: msl?.runnerUp, team: s.myTeam, div: myDiv(s), champion2, promo: moves });
  for (const p of rosterOf(s, champion)) p.titles = [...(p.titles ?? []), `${s.season}시즌 프로리그 우승`];
  if (champion2 !== undefined) for (const p of rosterOf(s, champion2)) p.titles = [...(p.titles ?? []), `${s.season}시즌 2부 리그 1위`];
  news(s, `🏆 ${s.season}시즌 마이프로리그 우승: ${s.teams[champion].name}!${champion2 !== undefined ? ` 2부 1위: ${s.teams[champion2].name}.` : ""} 우리 팀 최종 성적: ${result}${prize ? ` (상금 ${prize.toLocaleString()}만원)` : ""}`);
  for (const m of moves) news(s, `🔁 다음 시즌: ${s.teams[m.up].name} 1부 승격, ${s.teams[m.down].name} 2부 강등`);
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
    // 새 시즌은 모두 컨디션 100%로 시작
    p.cond = COND_MAX;
  }
  for (const t of s.teams) { t.wins = 0; t.losses = 0; t.setWins = 0; t.setLosses = 0; }
  // 승강전 결과대로 1부·2부를 바꿈
  applyPromo(s);
  // 세대 교체: 은퇴 → 신인 등장
  const gone = retirements(s);
  rookies(s, gone.length);
  ensurePotential(s);
  newSeasonClub(s);
  // 리그 중계권 분배금 (새 시즌 가계부에)
  broadcastRights(s);
  // AI 1부 팀: 선수가 부족하면 자유계약 선수 영입 (2부 팀은 아래 fillBRosters 가 유망주로)
  for (const t of divTeams(s, 1)) {
    if (t.id === s.myTeam) continue;
    while (rosterOf(s, t.id).length < 10) {
      const fa = rosterOf(s, FREE_AGENT_TEAM).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
      if (!fa) break;
      fa.team = t.id;
      fa.contract = defaultContract(fa, s.season);
      news(s, `📰 ${t.name}, 자유계약 선수 ${fa.name} 영입`);
    }
  }
  fillBRosters(s);
  // 지난 시즌 경기 기록은 요약만 남기고 정리
  s.matches = [];
  scheduleRegularSeason(s);
  // 개인리그 시드를 미리 정해 두어 일정표에서 볼 수 있게 (지난 대회 성적은 createMsl 이 참고)
  s.msl = createMsl(s);
  rollWeekBursts(s);
  news(s, `${s.season}시즌 ${leagueName(myDiv(s))} 개막!`);
}

// ── 이적 ──────────────────────────────────────────────────────

export function scoutPlayer(s: CareerState, pid: number) {
  const p = s.players[pid];
  if (!p || p.team !== FREE_AGENT_TEAM) throw new CareerError("무소속 선수만 영입할 수 있습니다");
  const { max } = rosterLimits(s, s.myTeam);
  if (rosterOf(s, s.myTeam).length >= max) throw new CareerError(`선수단은 최대 ${max}명입니다`);
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
  if (myDiv(s) === 2 && rosterOf(s, s.myTeam).length <= rosterLimits(s, s.myTeam).min) throw new CareerError(`2부 팀은 최소 ${rosterLimits(s, s.myTeam).min}명이 있어야 합니다 (리그 규정)`);
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

/**
 * 아이템 구입. 경기 아이템·비타비타·장비는 보관함에 (종류마다 소모품 999개·장비 99개), 장비는 target 을 주면 산 것 하나를 바로 장착
 * qty 는 구입 횟수 (비타비타는 한 번에 3개)
 * 즉시 사용·포션은 선수(target)에게 바로 쓴다
 */
export function buyItem(s: CareerState, key: string, target?: number, qty = 1): BuyResult {
  const it = ITEM_BY_KEY[key];
  if (!it || it.notForSale) throw new CareerError("구입 불가능 품목입니다");
  const me = s.teams[s.myTeam];
  if (isStackable(it)) {
    const n = Math.max(1, Math.min(stackMax(it), Math.floor(qty)));
    const units = n * packOf(it);
    const owned = s.inventory?.[key] ?? 0;
    if (owned + units > stackMax(it)) throw new CareerError(`${it.name}은(는) 최대 ${stackMax(it)}개까지 가질 수 있습니다 (보유 ${owned}개)`);
    if (me.money < it.price * n) throw new CareerError("소지금이 부족합니다");
    pay(s, "아이템", -it.price * n, `${it.name}${n > 1 ? ` ×${n}` : ""}${packOf(it) > 1 ? ` (${units}개)` : ""}`);
    s.inventory = { ...s.inventory, [key]: owned + units };
    // 선수를 고르고 사면 산 만큼 바로 장착 (같은 장비면 사용 횟수가 더해짐)
    if (it.kind === "equip" && target !== undefined) return equipItem(s, key, target, n);
    return { message: units > 1 ? `${units}개 구입하였습니다 (보유 ${owned + units}개)` : "구입하였습니다" };
  }
  if (me.money < it.price) throw new CareerError("소지금이 부족합니다");
  const p = target !== undefined ? s.players[target] : undefined;
  if (!p || p.team !== s.myTeam) throw new CareerError("선수를 선택하세요");
  if (it.kind === "instant") {
    if (p.cond >= COND_MAX) throw new CareerError("컨디션이 최대입니다");
    pay(s, "아이템", -it.price, `${it.name} (${p.name})`);
    p.cond = clampCond(p.cond + (it.cond ?? 0));
    return { message: "맛있게 마셨다" };
  }
  // 포션: 능력치 무작위 변화
  const po = it.potion!;
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

/**
 * 보관함의 장비를 선수에게 장착 (그 칸에 끼던 장비는 버려짐, 같은 장비면 새것으로 바꿔 내구도가 다시 참)
 */
export function equipItem(s: CareerState, key: string, target: number, qty = 1): BuyResult {
  const it = ITEM_BY_KEY[key];
  if (!it || it.kind !== "equip") throw new CareerError("장착할 수 있는 장비가 아닙니다");
  if ((s.inventory?.[key] ?? 0) <= 0) throw new CareerError("보유한 장비가 없습니다. 먼저 구입하세요");
  const p = s.players[target];
  if (!p || p.team !== s.myTeam) throw new CareerError("선수를 선택하세요");
  if (s.live && (s.live.mine.includes(p.id))) throw new CareerError("경기 중인 선수는 장비를 바꿀 수 없습니다");
  const slot = slotOf(it)!;
  const n = Math.max(1, Math.min(s.inventory![key], Math.floor(qty)));
  const prev = p.equip?.[slot];
  const uses = (it.uses ?? 20) * n;
  s.inventory![key] -= n;
  // 같은 장비면 남은 경기 수에 더하고, 다른 장비면 지우고 덮어씀
  const same = prev?.key === key;
  p.equip = { ...p.equip, [slot]: { key, left: (same ? prev!.left : 0) + uses } };
  const left = p.equip[slot]!.left;
  news(s, `🛒 ${p.name} 선수 ${it.name}${n > 1 ? ` ×${n}` : ""} 장착${same ? ` (남은 ${left}경기)` : prev ? ` (${ITEM_BY_KEY[prev.key]?.name ?? "이전 장비"} 교체)` : ""}`);
  return { message: same ? `같은 장비라 사용 횟수를 더했습니다 (남은 ${left}경기)` : prev ? `${ITEM_BY_KEY[prev.key]?.name ?? "이전 장비"}을(를) 빼고 장착하였습니다 (${left}경기)` : `장착하였습니다 (${left}경기)` };
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
  const mine = rosterLimits(s, s.myTeam), theirs = rosterLimits(s, teamId);
  if (myAfter > mine.max) throw new CareerError(`선수단은 최대 ${mine.max}명입니다`);
  if (myAfter < mine.min) throw new CareerError(`선수가 최소 ${mine.min}명 있어야 합니다`);
  if (theirAfter > theirs.max) throw new CareerError(`${s.teams[teamId].name} 선수단이 가득 찹니다`);
  if (theirAfter < Math.max(AI_MIN_ROSTER, theirs.min)) throw new CareerError(`${s.teams[teamId].name}은(는) 선수가 너무 적어져서 거절합니다`);
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
