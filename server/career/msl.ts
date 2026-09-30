/**
 * 마이스타리그 (원작 MSL 방식 개인리그)
 * PC방 예선 → 듀얼 토너먼트 → 조 지명식 → 32강 조별(듀얼 방식) → 16강 → 8강 → 4강 → 결승
 */
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import {
  MSL_PRIZE,
  MSL_STAGE_NAMES,
  MSL_PLAN,
  totalOf,
  type MslStage,
  type CareerState,
  type MslGroup,
  type MslSeries,
  type MslState,
} from "@shared/career/rules";
import { addManagerExp, book, mainSponsorPay } from "./club";
import { activePlayers } from "@shared/career/view";
import { news, pickMaps, playSet, quickSet, rand, shuffle, type PlayedSet } from "./core";

const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];

const strength = (s: CareerState, id: number) => totalOf(s.players[id].stats);
const byStrength = (s: CareerState, ids: number[]) => [...ids].sort((a, b) => strength(s, b) - strength(s, a));
const isMine = (s: CareerState, id: number) => s.players[id]?.team === s.myTeam;

/** 이번 주에 치른, 우리 선수가 나온 경기 (하이라이트 포함, 화면 표시용) */
export type MslReport = Omit<MslSeries, "sets"> & { stage: string; sets: PlayedSet[]; maps: number[] };

// ── 시즌 시작 ──────────────────────────────────────────────────

export function createMsl(s: CareerState): MslState {
  const prev = s.msl && s.msl.season === s.season - 1 ? s.msl : undefined;
  // 시드: 지난 대회 16강 진출자 → 부족하면 능력치 상위 프로 선수
  const prevSeeds = prev ? Object.entries(prev.placements).filter(([, r]) => ["우승", "준우승", "4강", "8강", "16강"].includes(r)).map(([id]) => Number(id)) : [];
  const pros = activePlayers(s).filter(p => p.team !== FREE_AGENT_TEAM).map(p => p.id);
  const seeds = byStrength(s, [...new Set([...prevSeeds.filter(id => (s.players[id]?.team ?? -1) >= 0), ...byStrength(s, pros)])]).slice(0, 16);
  return {
    season: s.season, stage: "pc", seeds, pcQualifiers: [], pcEntrants: 0,
    duals: [], nominations: [], groups: [], bracket: [], placements: {},
  };
}

// ── 경기 ───────────────────────────────────────────────────────

/** quiet: 중계·감독 경험치 없이 빠른 판정만 (PC방 예선) */
function series(s: CareerState, a: number, b: number, bestOf: number, label: string, report: MslReport[], stage: string, quiet = false): MslSeries {
  const need = Math.ceil(bestOf / 2);
  const mine = !quiet && (isMine(s, a) || isMine(s, b));
  const maps = pickMaps(bestOf, s.mapPool);
  let sa = 0, sb = 0;
  const sets: PlayedSet[] = [];
  for (let i = 0; sa < need && sb < need; i++) {
    // 우리 선수 경기만 중계, 나머지는 빠른 판정
    const r: PlayedSet = mine ? playSet(s, s.players[a], s.players[b], maps[i], true, true) : quickSet(s, s.players[a], s.players[b], maps[i]);
    if (r.winner === "a") sa++; else sb++;
    sets.push(r);
  }
  const result: MslSeries = { a, b, bestOf, sa, sb, winner: sa > sb ? a : b, label, sets };
  if (mine && isMine(s, result.winner)) addManagerExp(s, 5);
  if (mine) {
    report.push({ ...result, stage, maps, sets: sets.map(x => ({ ...x })) });
    for (const x of sets) { delete x.highlights; delete x.timeline; } // 세이브에는 중계를 남기지 않음
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
  const dualDirect = byStrength(s, activePlayers(s).map(p => p.id).filter(id => !direct.has(id))).slice(0, 24);
  dualDirect.forEach(id => direct.add(id));
  let pool = shuffle(activePlayers(s).map(p => p.id).filter(id => !direct.has(id)));
  m.pcEntrants = pool.length;
  m.pcGames = [];
  for (let round = 1; pool.length > 8; round++) {
    // 정확히 8명이 남도록 필요한 만큼만 경기, 나머지는 부전승
    const games = Math.min(Math.floor(pool.length / 2), pool.length - 8);
    const next: number[] = pool.slice(games * 2);
    for (let i = 0; i < games * 2; i += 2) {
      // 참가자가 많아 하나씩 중계하지 않고, 결과 화면에서 우리 선수 전적을 보여준다
      const r = series(s, pool[i], pool[i + 1], 1, `${round}회전`, [], "PC방 예선", true);
      next.push(r.winner);
      if (isMine(s, r.a) || isMine(s, r.b)) m.pcGames.push(r);
      m.placements[r.winner === pool[i] ? pool[i + 1] : pool[i]] = "PC방 탈락";
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

function runDual(s: CareerState, m: MslState, report: MslReport[], part: number) {
  const idx = [0, 1, 2].map(k => part * 3 + k).filter(i => i < m.duals.length);
  for (const i of idx) m.duals[i] = playDual(s, m.duals[i].name, m.duals[i].players, report, "듀얼 토너먼트");
  const done = idx.map(i => m.duals[i]);
  for (const g of done) for (const id of g.players) if (!g.qualified.includes(id)) m.placements[id] = "듀얼 탈락";
  const q = done.flatMap(g => g.qualified).filter(id => isMine(s, id));
  news(s, `🎮 듀얼 토너먼트 ${done.map(g => g.name).join("·")}조 종료${q.length ? ` — 우리 팀 ${q.map(id => s.players[id].name).join(", ")} 32강 진출!` : ""}`);
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

function runGroups(s: CareerState, m: MslState, report: MslReport[], part: number) {
  for (let i = part * 4; i < part * 4 + 4 && i < m.groups.length; i++) m.groups[i] = playDual(s, m.groups[i].name, m.groups[i].players, report, "32강");
  const done = m.groups.slice(part * 4, part * 4 + 4);
  for (const g of done) for (const id of g.players) if (!g.qualified.includes(id)) m.placements[id] = "32강";
  const q = done.flatMap(g => g.qualified).filter(id => isMine(s, id));
  news(s, `🎮 32강 ${done.map(g => g.name).join("·")}조 종료${q.length ? ` — 우리 팀 ${q.map(id => s.players[id].name).join(", ")} 16강 진출!` : ""}`);
  if (part < 1) return;
  // 16강 대진: A1-B2, B1-A2, C1-D2, D1-C2 ...
  const ro16: MslSeries[] = [];
  for (let i = 0; i < 8; i += 2) {
    const [a, b] = [m.groups[i], m.groups[i + 1]];
    ro16.push({ a: a.qualified[0], b: b.qualified[1], bestOf: 3, sa: 0, sb: 0, winner: -1, label: "16강", sets: [] });
    ro16.push({ a: b.qualified[0], b: a.qualified[1], bestOf: 3, sa: 0, sb: 0, winner: -1, label: "16강", sets: [] });
  }
  m.bracket = [{ round: "ro16", series: ro16 }];
}

const NEXT_ROUND = { ro16: "ro8", ro8: "ro4", ro4: "final" } as const;
const ROUND_LABEL = { ro16: "16강", ro8: "8강", ro4: "4강", final: "결승" } as const;
const BEST_OF = { ro16: 3, ro8: 3, ro4: 5, final: 5 } as const;

/** 토너먼트: from~to 번 경기를 치르고, 마지막 파트면 다음 라운드 대진을 만든다 */
function runKnockout(s: CareerState, m: MslState, round: "ro16" | "ro8" | "ro4" | "final", report: MslReport[], from: number, to: number) {
  const stage = m.bracket.find(b => b.round === round);
  if (!stage) return;
  for (let i = from; i < Math.min(to, stage.series.length); i++) {
    const x = stage.series[i];
    const r = series(s, x.a, x.b, BEST_OF[round], `${ROUND_LABEL[round]} ${i + 1}경기`, report, ROUND_LABEL[round]);
    const loser = r.winner === x.a ? x.b : x.a;
    m.placements[loser] = round === "final" ? "준우승" : ROUND_LABEL[round];
    stage.series[i] = r;
  }
  if (stage.series.some(x => x.winner < 0)) {
    const mine = stage.series.slice(from, to).filter(x => isMine(s, x.winner)).map(x => s.players[x.winner].name);
    news(s, `🎮 마이스타리그 ${ROUND_LABEL[round]} ${from + 1}~${to}경기 종료${mine.length ? ` — 우리 팀 ${mine.join(", ")} 승리!` : ""}`);
    return;
  }
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
    if (prize && p && p.team !== FREE_AGENT_TEAM) { s.teams[p.team].money += prize; if (p.team === s.myTeam) book(s, "개인리그 상금", prize); }
  }
  // 메인 스폰서 개인리그 수당 · 감독 경험치
  if (s.players[m.champion!]?.team === s.myTeam) { mainSponsorPay(s, "mslTitle", "메인 스폰서 개인리그 우승 수당"); addManagerExp(s, 120); }
  if (s.players[m.runnerUp!]?.team === s.myTeam) { mainSponsorPay(s, "mslRunnerUp", "메인 스폰서 개인리그 준우승 수당"); addManagerExp(s, 60); }
  const champ = s.players[m.champion!];
  champ.titles = [...(champ.titles ?? []), `${s.season}시즌 마이스타리그 우승`];
  news(s, `👑 ${s.season}시즌 마이스타리그 우승: ${champ.name} (${s.teams[champ.team].name})! 준우승 ${s.players[m.runnerUp!].name}`);
}

const NEXT_STAGE: Record<MslStage, MslStage> = { pc: "dual", dual: "nom", nom: "group", group: "ro16", ro16: "ro8", ro8: "ro4", ro4: "final", final: "done", done: "done" };

/** 이번 주 개인리그 일정 진행 (MSL_PLAN). 우리 선수 경기 목록을 돌려준다 */
export function runMslWeek(s: CareerState): { reports: MslReport[]; plans: number[] } {
  if (!s.msl || s.msl.season !== s.season) s.msl = createMsl(s);
  const m = s.msl;
  const report: MslReport[] = [];
  // 예전 세이브: 단계로 위치 추정
  if (m.planIdx === undefined) m.planIdx = m.stage === "done" ? MSL_PLAN.length : Math.max(0, MSL_PLAN.findIndex(x => x.stage === m.stage));
  const plans: number[] = [];
  while (m.planIdx < MSL_PLAN.length && MSL_PLAN[m.planIdx].week <= s.week) {
    const plan = MSL_PLAN[m.planIdx];
    plans.push(m.planIdx);
    const last = !MSL_PLAN[m.planIdx + 1] || MSL_PLAN[m.planIdx + 1].stage !== plan.stage;
    switch (plan.stage) {
      case "pc": runPc(s, m); break;
      case "dual": runDual(s, m, report, plan.part); break;
      case "nom": runNomination(s, m); break;
      case "group": runGroups(s, m, report, plan.part); break;
      case "ro16": runKnockout(s, m, "ro16", report, plan.part * 4, plan.part * 4 + 4); break;
      case "ro8": runKnockout(s, m, "ro8", report, plan.part * 2, plan.part * 2 + 2); break;
      case "ro4": runKnockout(s, m, "ro4", report, 0, 2); break;
      case "final": runKnockout(s, m, "final", report, 0, 1); break;
    }
    if (last) m.stage = NEXT_STAGE[plan.stage];
    m.planIdx++;
  }
  return { reports: report, plans };
}

export { MSL_STAGE_NAMES };
