/**
 * 2부 리그: 1부 구단마다 B팀 (이름 뒤에 B), 1부와 같은 일정(11주 2라운드 풀리그)으로 진행
 * - 1부 감독이면 2부는 자동 진행 (기록만 봄), 2부 팀 감독이면 2부 경기를 직접 진행
 * - 정규시즌 뒤 승강전: 1부 11위 vs 2부 2위, 1부 12위 vs 2부 1위 (5전 3선승, 1부 팀이 a) → 이긴 팀이 다음 시즌 1부
 * - 2부 팀은 최소 8명 (모자라면 리그가 무소속·신예로 채움), 서브 스폰서 1곳
 * - 2부 선수를 1부 팀이 사 가면 리그가 이적료만큼 육성 지원금을 더 줌 (2부 구단 운영 자금)
 * - 2부 경기는 어린 선수일수록 크게 성장
 */
import { FREE_AGENT_TEAM, ORIG_TEAMS } from "@shared/career/originalData";
import {
  B_DEVELOPMENT_BONUS,
  B_DEVELOPMENT_BONUS_OTHER,
  B_MAX_ROSTER,
  B_MIN_ROSTER,
  B_ROSTER_TARGET,
  B_TEAM_OFFSET,
  MAX_ROSTER,
  SQUAD_MIN,
  isWinnersSeason,
  matchSets,
  ageOf,
  totalOf,
  type CareerState,
  type CMatch,
  type CPlayer,
} from "@shared/career/rules";
import { bTeamOf } from "@shared/career/init";
import { bTeamIdOf, divOf, divTeams, rosterOf, standings } from "@shared/career/view";
import { defaultContract } from "@shared/career/contract";
import { CareerError, news, pickMaps, shuffle } from "./core";
import { prospects } from "./generation";

const REGULAR_WEEKS = 11;
/** 무소속으로 남겨 둘 인원 (이적시장용) */
const KEEP_FREE_AGENTS = 18;

/** 팀 인원 한도 (2부는 최소 8명) */
export function rosterLimits(s: CareerState, team: number) {
  return divOf(s, team) === 2 ? { min: B_MIN_ROSTER, max: B_MAX_ROSTER } : { min: SQUAD_MIN, max: MAX_ROSTER };
}

/** 우리 구단의 B팀 (1부 구단 감독일 때) */
export function myBTeam(s: CareerState): number | undefined {
  return bTeamIdOf(s, s.myTeam);
}

/** 2부 팀이 1부 팀에 선수를 팔 때 리그가 더 주는 육성 지원금 */
export function developmentBonus(s: CareerState, seller: number, buyer: number, fee: number): number {
  // 2부(B팀) → 1부: 같은 구단 1군이면 50%, 다른 구단이면 20%
  if (seller === FREE_AGENT_TEAM || divOf(s, seller) !== 2 || divOf(s, buyer) !== 1) return 0;
  const rate = s.teams[seller]?.parent === buyer ? B_DEVELOPMENT_BONUS : B_DEVELOPMENT_BONUS_OTHER;
  return Math.round((fee * rate) / 10) * 10;
}

/**
 * 2라운드 풀리그 일정 (한 주 2경기: 1경기 r라운드, 2경기 (10-r)라운드, 홈·원정 바꿈)
 * fromWeek: 시즌 중간에 2부가 생긴 예전 세이브는 남은 주만
 */
/** 경기 방식과 맵: 3의 배수 시즌은 위너스리그 (7전 4선승, 결승 9전 5선승) */
export function fmt(s: CareerState, stage: CMatch["stage"]): Pick<CMatch, "maps" | "winners"> {
  const winners = isWinnersSeason(s.season);
  return { maps: pickMaps(matchSets({ stage, winners }), s.mapPool), ...(winners ? { winners: true } : {}) };
}

export function scheduleDivision(s: CareerState, div: 1 | 2, fromWeek = 1) {
  const ids = shuffle(divTeams(s, div).map(t => t.id));
  const n = ids.length;
  if (n < 2 || n % 2) return;
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
  const weeks = Math.min(REGULAR_WEEKS, rounds.length);
  for (let w = fromWeek - 1; w < weeks; w++) {
    for (const [a, b] of rounds[w]) s.matches.push({ id: s.nextMatchId++, week: w + 1, leg: 1, stage: "regular", div, a, b, ...fmt(s, "regular") });
    for (const [a, b] of rounds[weeks - 1 - w]) s.matches.push({ id: s.nextMatchId++, week: w + 1, leg: 2, stage: "regular", div, a: b, b: a, ...fmt(s, "regular") });
  }
}

/** 무소속 선수를 팀에 (리그 규정 충원: 이적료 없음, 기본 계약) */
function assign(s: CareerState, p: CPlayer, team: number) {
  p.team = team;
  p.reserve = false;
  p.action = null;
  p.morale = 70;
  p.wantsOut = false;
  p.contract = defaultContract(p, s.season);
}

/**
 * 2부 팀 인원 채우기: AI 팀은 9명, 우리 팀은 규정 최소 8명까지
 * 무소속 유망주(어린 순)부터, 이적시장용 무소속이 모자라면 신예를 새로 뽑아 채움
 * initial: 새 게임 — 2부 팀끼리 전력이 비슷하도록 강한 순으로 번갈아 나눔
 */
export function fillBRosters(s: CareerState, initial = false) {
  const need = new Map<number, number>();
  // 우리 1부 팀도 최소 인원(계약 만료·은퇴로 줄었을 때)까지
  const mine1 = !initial && divOf(s, s.myTeam) === 1 ? [s.teams[s.myTeam]] : [];
  for (const t of [...divTeams(s, 2), ...mine1]) {
    const target = t.id === s.myTeam && !initial ? rosterLimits(s, t.id).min : B_ROSTER_TARGET;
    const n = target - rosterOf(s, t.id).length;
    if (n > 0) need.set(t.id, n);
  }
  const total = [...need.values()].reduce((a, b) => a + b, 0);
  if (!total) return;
  const free = () => s.players.filter(p => p.team === FREE_AGENT_TEAM);
  const short = total + KEEP_FREE_AGENTS - free().length;
  if (short > 0) prospects(s, short);
  // 어린 선수 우선 (2부는 육성 리그), 같은 나이면 강한 순
  const pool = free()
    .sort((a, b) => Math.min(ageOf(a, s.season), 24) - Math.min(ageOf(b, s.season), 24) || totalOf(b.stats) - totalOf(a.stats))
    .slice(0, total)
    .sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  // 자리가 남은 팀을 뱀 순서로 (강한 선수가 한 팀에 몰리지 않게)
  const teams = [...need.keys()];
  const slots: number[] = [];
  const left = new Map(need);
  for (let round = 0; slots.length < pool.length; round++) {
    const before = slots.length;
    for (const t of round % 2 ? [...teams].reverse() : teams) {
      if ((left.get(t) ?? 0) > 0) { slots.push(t); left.set(t, left.get(t)! - 1); }
    }
    if (slots.length === before) break;
  }
  pool.forEach((p, i) => {
    const team = slots[i];
    if (team === undefined) return;
    assign(s, p, team);
    if (team === s.myTeam && !initial) news(s, `📋 리그 규정(선수단 최소 ${rosterLimits(s, team).min}명): ${p.name} 선수가 우리 팀에 배정되었습니다`);
  });
}

/** 예전 세이브 → B팀·2부 리그 (구단 2부 육성 선수는 그 구단 B팀으로) */
export function ensureDivisions(s: CareerState) {
  for (const t of s.teams) if (t.id !== FREE_AGENT_TEAM && t.id < B_TEAM_OFFSET && t.div === undefined) t.div = 1;
  delete (s as { reserveLeague?: unknown }).reserveLeague;
  if (s.teams.some(t => t.div === 2)) return;
  for (const o of ORIG_TEAMS) {
    if (o.id === FREE_AGENT_TEAM) continue;
    s.teams[o.id + B_TEAM_OFFSET] = bTeamOf(o);
  }
  let moved = 0;
  for (const p of s.players) {
    if (!p.reserve) continue;
    p.reserve = false;
    if (p.team >= 0 && p.team !== FREE_AGENT_TEAM && p.team < B_TEAM_OFFSET) {
      p.team += B_TEAM_OFFSET;
      p.action = null;
      moved++;
    }
  }
  fillBRosters(s, true);
  // 시즌 중이면 남은 주의 2부 일정
  if (s.phase === "regular") scheduleDivision(s, 2, s.week);
  news(s, `🏟️ 2부 리그 출범! 구단마다 B팀이 생겼습니다${moved ? ` (2부 육성 선수 ${moved}명은 각 구단 B팀으로)` : ""} — 1부 11·12위와 2부 1·2위가 승강전을 치릅니다`);
}

/** 정규시즌 뒤 승강전: 1부 11위 vs 2부 2위, 1부 12위 vs 2부 1위 */
export function schedulePromo(s: CareerState) {
  const st1 = standings(s, 1), st2 = standings(s, 2);
  if (st1.length < 4 || st2.length < 2) return;
  const pairs: Array<[number, number]> = [[st1[st1.length - 2].id, st2[1].id], [st1[st1.length - 1].id, st2[0].id]];
  for (const [a, b] of pairs) s.matches.push({ id: s.nextMatchId++, week: s.week, stage: "promo", div: 1, a, b, ...fmt(s, "promo") });
  news(s, `⚔️ 승강전: ${pairs.map(([a, b]) => `${s.teams[a].name}(1부) vs ${s.teams[b].name}(2부)`).join(" / ")}`);
}

/** 승강전 결과 (2부 팀이 이기면 올라가고 1부 팀이 내려감) */
export function promoMoves(s: CareerState): Array<{ up: number; down: number }> {
  return s.matches
    .filter((m): m is CMatch & { winner: number } => m.stage === "promo" && !!m.done && m.winner !== undefined)
    .filter(m => divOf(s, m.winner) === 2)
    .map(m => ({ up: m.winner, down: m.winner === m.a ? m.b : m.a }));
}

/** 다음 시즌 시작: 승강전 결과대로 리그를 바꿈 */
export function applyPromo(s: CareerState) {
  const moves = s.promo?.moves ?? [];
  for (const { up, down } of moves) {
    s.teams[up].div = 1;
    s.teams[down].div = 2;
    news(s, `⬆️ ${s.teams[up].name} 1부 승격 · ⬇️ ${s.teams[down].name} 2부 강등`);
  }
  delete s.promo;
}

/** 1부 선수를 우리 구단 B팀으로 보냄 (2부에서 뛰며 성장, 다시 데려올 때는 시세의 절반) */
export function sendToB(s: CareerState, pid: number) {
  const p = s.players[pid];
  const b = myBTeam(s);
  if (b === undefined) throw new CareerError("우리 구단 B팀이 없습니다 (1부 구단 감독일 때만 가능)");
  if (!p || p.team !== s.myTeam) throw new CareerError("우리 선수가 아닙니다");
  if (s.live) throw new CareerError("경기 중에는 바꿀 수 없습니다");
  if (rosterOf(s, s.myTeam).length <= rosterLimits(s, s.myTeam).min) throw new CareerError(`선수단은 최소 ${rosterLimits(s, s.myTeam).min}명을 유지해야 합니다`);
  if (rosterOf(s, b).length >= B_MAX_ROSTER) throw new CareerError(`${s.teams[b].name} 선수단이 가득 찼습니다 (최대 ${B_MAX_ROSTER}명)`);
  p.team = b;
  p.action = null;
  p.wantsOut = false;
  p.morale = Math.max(0, (p.morale ?? 70) - 10);
  for (const l of s.listings ?? []) if (l.player === pid) s.listings = s.listings!.filter(x => x.player !== pid);
  news(s, `⬇️ ${p.name} 선수를 ${s.teams[b].name}(2부)로 보냈습니다 — 2부 경기에서 뛰며 성장합니다`);
  return { team: b };
}
