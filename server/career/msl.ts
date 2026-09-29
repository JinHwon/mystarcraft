/**
 * 마이스타리그 (원작 MSL 방식 개인리그)
 * PC방 예선 → 듀얼 토너먼트 → 조 지명식 → 32강 조별(듀얼 방식) → 16강 → 8강 → 4강 → 결승
 */
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import {
  MSL_PRIZE,
  MSL_STAGE_NAMES,
  MSL_WEEK,
  totalOf,
  type CareerState,
  type MslGroup,
  type MslSeries,
  type MslState,
} from "@shared/career/rules";
import { news, pickMaps, playSet, rand, shuffle } from "./core";

const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];

const strength = (s: CareerState, id: number) => totalOf(s.players[id].stats);
const byStrength = (s: CareerState, ids: number[]) => [...ids].sort((a, b) => strength(s, b) - strength(s, a));
const isMine = (s: CareerState, id: number) => s.players[id]?.team === s.myTeam;

/** 이번 주에 치른, 우리 선수가 나온 경기 (하이라이트 포함, 화면 표시용) */
export type MslReport = MslSeries & { stage: string };

// ── 시즌 시작 ──────────────────────────────────────────────────

export function createMsl(s: CareerState): MslState {
  const prev = s.msl && s.msl.season === s.season - 1 ? s.msl : undefined;
  // 시드: 지난 대회 16강 진출자 → 부족하면 능력치 상위 프로 선수
  const prevSeeds = prev ? Object.entries(prev.placements).filter(([, r]) => ["우승", "준우승", "4강", "8강", "16강"].includes(r)).map(([id]) => Number(id)) : [];
  const pros = s.players.filter(p => p.team !== FREE_AGENT_TEAM).map(p => p.id);
  const seeds = byStrength(s, [...new Set([...prevSeeds.filter(id => s.players[id]), ...byStrength(s, pros)])]).slice(0, 16);
  return {
    season: s.season, stage: "pc", seeds, pcQualifiers: [], pcEntrants: 0,
    duals: [], nominations: [], groups: [], bracket: [], placements: {},
  };
}

// ── 경기 ───────────────────────────────────────────────────────

function series(s: CareerState, a: number, b: number, bestOf: number, label: string, report: MslReport[], stage: string): MslSeries {
  const need = Math.ceil(bestOf / 2);
  const mine = isMine(s, a) || isMine(s, b);
  const maps = pickMaps(bestOf);
  let sa = 0, sb = 0;
  const sets = [];
  for (let i = 0; sa < need && sb < need; i++) {
    const r = playSet(s, s.players[a], s.players[b], maps[i], mine);
    if (r.winner === "a") sa++; else sb++;
    sets.push(r);
  }
  const result: MslSeries = { a, b, bestOf, sa, sb, winner: sa > sb ? a : b, label, sets };
  if (mine) {
    report.push({ ...result, stage, sets: sets.map(x => ({ ...x })) });
    for (const x of sets) delete x.highlights; // 세이브에는 중계를 남기지 않음
  }
  return result;
}

/** 듀얼 방식 4인 조: 1경기·2경기 → 승자전(1위 통과)·패자전(탈락) → 최종전(2위 통과) */
function playDual(s: CareerState, name: string, players: number[], report: MslReport[], stage: string): MslGroup {
  const [p0, p1, p2, p3] = players;
  const games: MslSeries[] = [];
  const g1 = series(s, p0, p1, 1, `${name}조 1경기`, report, stage);
  const g2 = series(s, p2, p3, 1, `${name}조 2경기`, report, stage);
  games.push(g1, g2);
  const l1 = g1.winner === p0 ? p1 : p0, l2 = g2.winner === p2 ? p3 : p2;
  const wm = series(s, g1.winner, g2.winner, 1, `${name}조 승자전`, report, stage);
  const lm = series(s, l1, l2, 1, `${name}조 패자전`, report, stage);
  games.push(wm, lm);
  const first = wm.winner;
  const wLoser = wm.winner === g1.winner ? g2.winner : g1.winner;
  const fm = series(s, wLoser, lm.winner, 1, `${name}조 최종전`, report, stage);
  games.push(fm);
  return { name, players, games, qualified: [first, fm.winner] };
}

// ── 단계별 진행 ────────────────────────────────────────────────

function runPc(s: CareerState, m: MslState) {
  // 시드·듀얼 직행(능력치 다음 24명)을 뺀 모든 선수가 PC방 예선 (단판 토너먼트, 8명 통과)
  const direct = new Set(m.seeds);
  const dualDirect = byStrength(s, s.players.map(p => p.id).filter(id => !direct.has(id))).slice(0, 24);
  dualDirect.forEach(id => direct.add(id));
  let pool = shuffle(s.players.map(p => p.id).filter(id => !direct.has(id)));
  m.pcEntrants = pool.length;
  while (pool.length > 8) {
    // 정확히 8명이 남도록 필요한 만큼만 경기, 나머지는 부전승
    const games = Math.min(Math.floor(pool.length / 2), pool.length - 8);
    const next: number[] = pool.slice(games * 2);
    for (let i = 0; i < games * 2; i += 2) {
      const r = playSet(s, s.players[pool[i]], s.players[pool[i + 1]], pickMaps(1)[0], false);
      next.push(r.winner === "a" ? pool[i] : pool[i + 1]);
    }
    pool = shuffle(next);
  }
  m.pcQualifiers = pool;
  // 듀얼 토너먼트 조 편성 (직행 24명 + 예선 통과 8명, 강한 선수가 고르게 퍼지도록)
  const dualPlayers = [...byStrength(s, dualDirect), ...shuffle(pool)];
  m.duals = GROUP_NAMES.map((name, g) => ({ name, players: [0, 1, 2, 3].map(k => dualPlayers[k * 8 + (k % 2 ? 7 - g : g)]), games: [], qualified: [] }));
  const mine = pool.filter(id => isMine(s, id));
  news(s, `🎮 마이스타리그 PC방 예선 종료 (${m.pcEntrants}명 참가)${mine.length ? ` — 우리 팀 ${mine.map(id => s.players[id].name).join(", ")} 통과!` : ""}`);
}

function runDual(s: CareerState, m: MslState, report: MslReport[]) {
  m.duals = m.duals.map(g => playDual(s, g.name, g.players, report, "듀얼 토너먼트"));
  for (const g of m.duals) for (const id of g.players) if (!g.qualified.includes(id)) m.placements[id] = "듀얼 탈락";
  const q = m.duals.flatMap(g => g.qualified).filter(id => isMine(s, id));
  news(s, `🎮 듀얼 토너먼트 종료${q.length ? ` — 우리 팀 ${q.map(id => s.players[id].name).join(", ")} 32강 진출!` : ""}`);
}

/** 조 지명식: 시드 상위 8명이 조 1번, 차례로 원하는 상대를 지명 (약한 선수나 같은 종족을 피하는 경향) */
function runNomination(s: CareerState, m: MslState) {
  const heads = m.seeds.slice(0, 8);
  const pool = new Set([...m.seeds.slice(8), ...m.duals.flatMap(g => g.qualified)]);
  const groups: number[][] = heads.map(h => [h]);
  m.nominations = [];
  for (let round = 0; round < 3; round++) {
    const order = round % 2 === 0 ? [...heads.keys()] : [...heads.keys()].reverse();
    for (const g of order) {
      const head = heads[g];
      const candidates = [...pool];
      const score = (id: number) => strength(s, id) + (s.players[id].race === s.players[head].race ? 150 : 0) + rand() * 400;
      const pick = candidates.sort((a, b) => score(a) - score(b))[0];
      pool.delete(pick);
      groups[g].push(pick);
      if (round === 0) m.nominations.push({ by: head, pick, group: GROUP_NAMES[g] });
    }
  }
  m.groups = groups.map((players, g) => ({ name: GROUP_NAMES[g], players, games: [], qualified: [] }));
  const mine = m.nominations.filter(n => isMine(s, n.by) || isMine(s, n.pick));
  const top = m.nominations[0];
  news(s, `🎤 조 지명식: ${s.players[top.by].name} 선수가 ${s.players[top.pick].name} 선수를 지명!${mine.length > 0 && mine[0] !== top ? ` (${s.players[mine[0].by].name} → ${s.players[mine[0].pick].name})` : ""}`);
}

function runGroups(s: CareerState, m: MslState, report: MslReport[]) {
  runNomination(s, m);
  m.groups = m.groups.map(g => playDual(s, g.name, g.players, report, "32강"));
  for (const g of m.groups) for (const id of g.players) if (!g.qualified.includes(id)) m.placements[id] = "32강";
  // 16강 대진: A1-B2, B1-A2, C1-D2, D1-C2 ...
  const ro16: MslSeries[] = [];
  for (let i = 0; i < 8; i += 2) {
    const [a, b] = [m.groups[i], m.groups[i + 1]];
    ro16.push({ a: a.qualified[0], b: b.qualified[1], bestOf: 3, sa: 0, sb: 0, winner: -1, label: "16강", sets: [] });
    ro16.push({ a: b.qualified[0], b: a.qualified[1], bestOf: 3, sa: 0, sb: 0, winner: -1, label: "16강", sets: [] });
  }
  m.bracket = [{ round: "ro16", series: ro16 }];
  const q = m.groups.flatMap(g => g.qualified).filter(id => isMine(s, id));
  news(s, `🎮 32강 종료${q.length ? ` — 우리 팀 ${q.map(id => s.players[id].name).join(", ")} 16강 진출!` : ""}`);
}

const NEXT_ROUND = { ro16: "ro8", ro8: "ro4", ro4: "final" } as const;
const ROUND_LABEL = { ro16: "16강", ro8: "8강", ro4: "4강", final: "결승" } as const;
const BEST_OF = { ro16: 3, ro8: 3, ro4: 5, final: 5 } as const;

function runKnockout(s: CareerState, m: MslState, round: "ro16" | "ro8" | "ro4" | "final", report: MslReport[]) {
  const stage = m.bracket.find(b => b.round === round);
  if (!stage) return;
  stage.series = stage.series.map(x => {
    const r = series(s, x.a, x.b, BEST_OF[round], ROUND_LABEL[round], report, ROUND_LABEL[round]);
    const loser = r.winner === x.a ? x.b : x.a;
    m.placements[loser] = round === "final" ? "준우승" : ROUND_LABEL[round];
    return r;
  });
  const winners = stage.series.map(x => x.winner);
  if (round === "final") {
    m.champion = winners[0];
    m.runnerUp = stage.series[0].winner === stage.series[0].a ? stage.series[0].b : stage.series[0].a;
    m.placements[m.champion] = "우승";
    finishMsl(s, m);
    return;
  }
  const next = NEXT_ROUND[round];
  const nextSeries: MslSeries[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    nextSeries.push({ a: winners[i], b: winners[i + 1], bestOf: BEST_OF[next], sa: 0, sb: 0, winner: -1, label: ROUND_LABEL[next], sets: [] });
  }
  m.bracket.push({ round: next, series: nextSeries });
  const mine = winners.filter(id => isMine(s, id));
  news(s, `🎮 마이스타리그 ${ROUND_LABEL[round]} 종료${mine.length ? ` — 우리 팀 ${mine.map(id => s.players[id].name).join(", ")} ${ROUND_LABEL[next]} 진출!` : ""}`);
}

function finishMsl(s: CareerState, m: MslState) {
  // 상금은 선수 소속 팀에 지급
  for (const [id, place] of Object.entries(m.placements)) {
    const prize = MSL_PRIZE[place];
    const p = s.players[Number(id)];
    if (prize && p && p.team !== FREE_AGENT_TEAM) s.teams[p.team].money += prize;
  }
  const champ = s.players[m.champion!];
  champ.titles = [...(champ.titles ?? []), `${s.season}시즌 마이스타리그 우승`];
  news(s, `👑 ${s.season}시즌 마이스타리그 우승: ${champ.name} (${s.teams[champ.team].name})! 준우승 ${s.players[m.runnerUp!].name}`);
}

/** 이번 주 스타리그 일정 진행 (한 주에 한 단계). 우리 선수 경기 목록을 돌려준다 */
export function runMslWeek(s: CareerState): MslReport[] {
  if (!s.msl || s.msl.season !== s.season) s.msl = createMsl(s);
  const m = s.msl;
  const report: MslReport[] = [];
  if (m.stage === "done" || s.week < MSL_WEEK[m.stage]) return report;
  switch (m.stage) {
    case "pc": runPc(s, m); m.stage = "dual"; break;
    case "dual": runDual(s, m, report); m.stage = "group"; break;
    case "group": runGroups(s, m, report); m.stage = "ro16"; break;
    case "ro16": runKnockout(s, m, "ro16", report); m.stage = "ro8"; break;
    case "ro8": runKnockout(s, m, "ro8", report); m.stage = "ro4"; break;
    case "ro4": runKnockout(s, m, "ro4", report); m.stage = "final"; break;
    case "final": runKnockout(s, m, "final", report); m.stage = "done"; break;
  }
  return report;
}

export { MSL_STAGE_NAMES };
