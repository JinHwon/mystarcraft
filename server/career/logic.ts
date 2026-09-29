/**
 * 커리어 모드(원작 방식) 게임 로직. DB 없이 CareerState 만 다루는 순수 함수들.
 */
import { STAT_KEYS, StatKey } from "@shared/gameConstants";
import { ORIG_MAPS, ORIG_PLAYERS, ORIG_TEAMS, FREE_AGENT_TEAM } from "@shared/career/originalData";
import {
  ACTIONS,
  ActionKey,
  CareerState,
  CMatch,
  COND_MAX,
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
import { simulateSet } from "../gameSimulation";
import { initialPlayers, initialTeams } from "@shared/career/init";

const RACE: Record<string, Race> = { T: "terran", Z: "zerg", P: "protoss" };
const REGULAR_WEEKS = 11;
const rand = () => Math.random();
const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const clampStat = (v: number) => Math.max(STAT_MIN, Math.min(STAT_MAX_CAREER, Math.round(v)));
const clampCond = (v: number) => Math.max(COND_MIN, Math.min(COND_MAX, Math.round(v)));

export class CareerError extends Error {}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function news(s: CareerState, text: string) {
  s.news.unshift({ season: s.season, week: s.week, text });
  if (s.news.length > 60) s.news.length = 60;
}

import { rosterOf, proTeams, standings, myPendingMatch } from "@shared/career/view";
export { rosterOf, proTeams, standings, myPendingMatch };

// ── 새 게임 ─────────────────────────────────────────────────────

export function newCareer(myTeam: number): CareerState {
  if (myTeam < 0 || myTeam >= FREE_AGENT_TEAM) throw new CareerError("팀을 선택해주세요");
  const players = initialPlayers(() => randInt(4, 7));
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
  };
  scheduleRegularSeason(s);
  news(s, `${s.teams[myTeam].name} 감독으로 부임했습니다. ${s.season}시즌 마이프로리그가 곧 개막합니다!`);
  return s;
}

/** 경기 세트별 맵 (서로 다른 맵) */
function pickMaps(n: number): number[] {
  return shuffle(ORIG_MAPS.map((_, i) => i)).slice(0, n);
}

function scheduleRegularSeason(s: CareerState) {
  const ids = shuffle(proTeams(s).map(t => t.id));
  const n = ids.length;
  const list = [...ids];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      s.matches.push({ id: s.nextMatchId++, week: r + 1, stage: "regular", a: r % 2 ? b : a, b: r % 2 ? a : b, maps: pickMaps(PRO_SETS) });
    }
    list.splice(1, 0, list.pop()!);
  }
}

// ── 순위 ───────────────────────────────────────────────────────


// ── 선수 행동 ──────────────────────────────────────────────────

export function setAction(s: CareerState, pid: number, action: ActionKey | null) {
  const p = s.players[pid];
  if (!p || p.team !== s.myTeam) throw new CareerError("우리 팀 선수가 아닙니다");
  const cost = (a: ActionKey | null | undefined) => (a ? ACTIONS.find(x => x.key === a)!.ap : 0);
  const used = rosterOf(s, s.myTeam).reduce((sum, x) => sum + (x.id === pid ? 0 : cost(x.action)), 0);
  if (used + cost(action) > s.ap) throw new CareerError(`행동력이 부족합니다 (남은 행동력 ${s.ap - used})`);
  p.action = action;
}

function gainStats(p: CPlayer, picks: number, min: number, max: number): string[] {
  const keys = shuffle([...STAT_KEYS]).slice(0, picks);
  return keys.map(k => {
    // 능력치가 높을수록 잘 안 오름
    const room = Math.max(0.15, 1 - (p.stats[k] - 500) / 600);
    const g = Math.max(1, Math.round(randInt(min, max) * room));
    p.stats[k] = clampStat(p.stats[k] + g);
    return k;
  });
}

function applyActions(s: CareerState) {
  const me = s.teams[s.myTeam];
  for (const p of s.players) {
    if (p.team === FREE_AGENT_TEAM) { p.cond = clampCond(p.cond + (rand() < 0.5 ? 1 : -1)); continue; }
    let action: ActionKey | null | undefined = p.action;
    if (p.team !== s.myTeam) action = rand() < 0.55 ? "train" : "rest"; // AI 팀
    switch (action) {
      case "train": gainStats(p, 2, 2, 6); p.cond = clampCond(p.cond - 1); break;
      case "best": gainStats(p, 3, 5, 12); p.cond = clampCond(p.cond - 2); break;
      case "rest": p.cond = clampCond(p.cond + 2); break;
      case "event": {
        const earn = 30 + p.level * 12 + randInt(0, 40);
        if (p.team === s.myTeam) me.money += earn;
        p.cond = clampCond(p.cond + 1);
        break;
      }
      default: p.cond = clampCond(p.cond + (rand() < 0.5 ? 1 : 0));
    }
    if (p.team === s.myTeam && action === "best") me.money -= ACTIONS.find(a => a.key === "best")!.money;
    p.action = null;
  }
}

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

function mapAdvantage(mapId: number, ra: Race, rb: Race): Record<string, number> {
  if (ra === rb) return {};
  const [, , , , tvz, zvp, pvt] = ORIG_MAPS[mapId];
  const table: Record<string, number> = {
    terran_zerg: tvz, zerg_terran: 200 - tvz,
    zerg_protoss: zvp, protoss_zerg: 200 - zvp,
    protoss_terran: pvt, terran_protoss: 200 - pvt,
  };
  const d = ((table[`${ra}_${rb}`] ?? 100) - 100) / 100;
  return { [ra]: 1 + d, [rb]: 1 - d };
}

function playSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, withHighlights: boolean): SetResult {
  const [, rush, res, cx] = ORIG_MAPS[mapId];
  const scale = (p: CPlayer) => Object.fromEntries(STAT_KEYS.map(k => [k, p.stats[k] * condMultiplier(p.cond)])) as Record<StatKey, number>;
  const r = simulateSet(
    { id: a.id + 1, name: a.name, race: a.race, stats: scale(a), fatigue: 100 },
    { id: b.id + 1, name: b.name, race: b.race, stats: scale(b), fatigue: 100 },
    mapAdvantage(mapId, a.race, b.race),
    { rushDistance: rush, resources: res, complexity: cx },
    withHighlights
  );
  const aWin = r.winnerId === a.id + 1;
  const [w, l] = aWin ? [a, b] : [b, a];
  w.wins++; w.sWins++; l.losses++; l.sLosses++;
  w.cond = clampCond(w.cond + 1); l.cond = clampCond(l.cond - 1);
  addExp(s, w, 30); addExp(s, l, 10);
  return { mapId, a: a.id, b: b.id, winner: aWin ? "a" : "b", duration: r.duration, highlights: withHighlights ? r.highlights : undefined };
}

function addExp(s: CareerState, p: CPlayer, exp: number) {
  p.exp += exp;
  const need = () => 100 + p.level * 60;
  while (p.exp >= need()) {
    p.exp -= need();
    p.level++;
    const up = gainStats(p, 2, 4, 8);
    if (p.team === s.myTeam) news(s, `⬆️ ${p.name} 선수 레벨 업! (Lv.${p.level}, 능력치 상승)`);
    void up;
  }
}

function playMatch(s: CareerState, m: CMatch, myEntry?: number[]) {
  const sets = m.stage === "final" ? FINAL_SETS : PRO_SETS;
  const need = m.stage === "final" ? FINAL_WIN : PRO_WIN;
  const involvesMe = m.a === s.myTeam || m.b === s.myTeam;
  const entryA = m.a === s.myTeam && myEntry ? myEntry : aiEntry(s, m.a, sets);
  const entryB = m.b === s.myTeam && myEntry ? myEntry : aiEntry(s, m.b, sets);
  let sa = 0, sb = 0;
  const results: SetResult[] = [];
  for (let i = 0; i < sets && sa < need && sb < need; i++) {
    const pa = s.players[entryA[i]], pb = s.players[entryB[i]];
    if (!pa || !pb) { if (!pa) sb++; else sa++; continue; }
    const r = playSet(s, pa, pb, m.maps[i % m.maps.length], involvesMe);
    if (r.winner === "a") sa++; else sb++;
    results.push(r);
  }
  m.done = true;
  m.scoreA = sa; m.scoreB = sb;
  m.winner = sa > sb ? m.a : m.b;
  m.sets = results;
  const ta = s.teams[m.a], tb = s.teams[m.b];
  if (m.stage === "regular") {
    ta.setWins += sa; ta.setLosses += sb; tb.setWins += sb; tb.setLosses += sa;
    if (m.winner === m.a) { ta.wins++; tb.losses++; } else { tb.wins++; ta.losses++; }
  }
  s.teams[m.winner].money += MATCH_MONEY.win;
  s.teams[m.winner === m.a ? m.b : m.a].money += MATCH_MONEY.lose;
  if (involvesMe) {
    const won = m.winner === s.myTeam;
    const opp = s.teams[m.a === s.myTeam ? m.b : m.a];
    const stageName = { regular: `${m.week}주차`, semi: "준플레이오프", po: "플레이오프", final: "결승" }[m.stage];
    news(s, `${won ? "🎉" : "😢"} ${stageName} vs ${opp.name} ${Math.max(sa, sb)}:${Math.min(sa, sb)} ${won ? "승리" : "패배"}`);
  }
}

/** 오래된 중계 하이라이트는 지워서 세이브 크기를 줄임 (내 팀 최근 4경기만 유지) */
function pruneHighlights(s: CareerState) {
  const mine = s.matches.filter(m => m.done && (m.a === s.myTeam || m.b === s.myTeam));
  for (const m of mine.slice(0, Math.max(0, mine.length - 4))) {
    for (const set of m.sets ?? []) delete set.highlights;
  }
}


// ── 한 주 진행 ─────────────────────────────────────────────────

export function advanceWeek(s: CareerState, myEntry?: number[]): { playedMatchId?: number } {
  if (s.phase === "offseason") throw new CareerError("시즌이 끝났습니다. 다음 시즌을 시작하세요");
  const mine = myPendingMatch(s);
  if (mine) {
    const sets = mine.stage === "final" ? FINAL_SETS : PRO_SETS;
    if (!myEntry) throw new CareerError("엔트리를 편성해주세요");
    if (rosterOf(s, s.myTeam).length < MIN_ROSTER) throw new CareerError(`선수가 최소 ${MIN_ROSTER}명 있어야 경기를 치를 수 있습니다`);
    validateEntry(s, myEntry, sets);
  }

  applyActions(s);
  for (const m of s.matches.filter(x => !x.done && x.week === s.week)) {
    playMatch(s, m, m === mine ? myEntry : undefined);
  }
  for (const t of proTeams(s)) t.money += WEEKLY_SPONSOR;
  pruneHighlights(s);

  const playedMatchId = mine?.id;
  s.week++;
  s.ap = WEEKLY_AP;
  progressSchedule(s);
  return { playedMatchId };
}

/** 정규시즌 → 준PO(3·4위) → PO(2위 vs 준PO 승자) → 결승(1위 vs PO 승자) → 시즌 종료 */
function progressSchedule(s: CareerState) {
  if (s.phase === "regular" && s.week > REGULAR_WEEKS) {
    s.phase = "postseason";
    const st = standings(s);
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "semi", a: st[2].id, b: st[3].id, maps: pickMaps(PRO_SETS) });
    const myRank = st.findIndex(t => t.id === s.myTeam) + 1;
    news(s, `정규시즌 종료! 1위 ${st[0].name}. 우리 팀 ${myRank}위${myRank <= 4 ? " — 포스트시즌 진출!" : " — 포스트시즌 진출 실패"}`);
    return;
  }
  if (s.phase !== "postseason") return;
  const last = s.matches.filter(m => m.stage !== "regular" && m.done).sort((a, b) => b.id - a.id)[0];
  if (!last || s.matches.some(m => !m.done)) return;
  const st = standings(s);
  if (last.stage === "semi") {
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "po", a: st[1].id, b: last.winner!, maps: pickMaps(PRO_SETS) });
  } else if (last.stage === "po") {
    s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "final", a: st[0].id, b: last.winner!, maps: pickMaps(FINAL_SETS) });
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
  s.teams[s.myTeam].money += prize;
  const myRank = standings(s).findIndex(t => t.id === s.myTeam) + 1;
  s.history.unshift({ season: s.season, champion, myRank, myResult: result });
  for (const p of rosterOf(s, champion)) p.titles = [...(p.titles ?? []), `${s.season}시즌 프로리그 우승`];
  news(s, `🏆 ${s.season}시즌 마이프로리그 우승: ${s.teams[champion].name}! 우리 팀 최종 성적: ${result}${prize ? ` (상금 ${prize.toLocaleString()}만원)` : ""}`);
}

// ── 다음 시즌 ─────────────────────────────────────────────────

export function startNextSeason(s: CareerState) {
  if (s.phase !== "offseason") throw new CareerError("아직 시즌이 진행 중입니다");
  s.season++;
  s.week = 1;
  s.phase = "regular";
  s.ap = WEEKLY_AP;
  // 나이에 따른 성장/노쇠
  for (const p of s.players) {
    const age = ageOf(p, s.season);
    if (age <= 21) gainStats(p, 3, 8, 25);
    else if (age <= 24) gainStats(p, 2, 3, 12);
    else if (age >= 28) {
      for (const k of shuffle([...STAT_KEYS]).slice(0, 3)) p.stats[k] = clampStat(p.stats[k] - randInt(5, 20));
    }
    p.sWins = 0; p.sLosses = 0;
    p.cond = randInt(4, 7);
  }
  for (const t of s.teams) { t.wins = 0; t.losses = 0; t.setWins = 0; t.setLosses = 0; }
  // AI 팀: 선수가 부족하면 자유계약 선수 영입
  for (const t of proTeams(s)) {
    if (t.id === s.myTeam) continue;
    while (rosterOf(s, t.id).length < 10) {
      const fa = rosterOf(s, FREE_AGENT_TEAM).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
      if (!fa) break;
      fa.team = t.id;
      news(s, `📰 ${t.name}, 자유계약 선수 ${fa.name} 영입`);
    }
  }
  // 지난 시즌 경기 기록은 요약만 남기고 정리
  s.matches = [];
  scheduleRegularSeason(s);
  news(s, `${s.season}시즌 마이프로리그 개막!`);
}

// ── 이적 ──────────────────────────────────────────────────────

export function scoutPlayer(s: CareerState, pid: number) {
  const p = s.players[pid];
  if (!p || p.team !== FREE_AGENT_TEAM) throw new CareerError("무소속 선수만 영입할 수 있습니다");
  if (rosterOf(s, s.myTeam).length >= MAX_ROSTER) throw new CareerError(`선수단은 최대 ${MAX_ROSTER}명입니다`);
  const price = askingPrice(p, s.season);
  const me = s.teams[s.myTeam];
  if (me.money < price) throw new CareerError(`자금이 부족합니다 (요구 금액 ${price.toLocaleString()}만원)`);
  me.money -= price;
  p.team = s.myTeam;
  p.action = null;
  news(s, `🤝 ${p.name} 선수 영입 (${price.toLocaleString()}만원)`);
  return { price };
}

export function releasePlayer(s: CareerState, pid: number) {
  const p = s.players[pid];
  if (!p || p.team !== s.myTeam) throw new CareerError("우리 팀 선수가 아닙니다");
  if (myPendingMatch(s) && rosterOf(s, s.myTeam).length <= MIN_ROSTER) throw new CareerError(`경기를 치르려면 최소 ${MIN_ROSTER}명이 필요합니다`);
  const gain = Math.round(askingPrice(p, s.season) * 0.2 / 10) * 10;
  s.teams[s.myTeam].money += gain;
  p.team = FREE_AGENT_TEAM;
  p.action = null;
  news(s, `👋 ${p.name} 선수 방출 (방출 이득 ${gain.toLocaleString()}만원)`);
  return { gain };
}
