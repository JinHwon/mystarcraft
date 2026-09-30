/**
 * 2부 리그: 우리 2부 선수와 무소속 유망주가 겨루는 개인리그 (정규시즌 매주 2경기, 빠른 판정)
 * - 경기 뒤 능력치가 오르내리고, 어릴수록 훨씬 빨리 큼 (나이가 많으면 오히려 떨어지기도)
 * - 프로리그 전적(승패·출전)에는 들어가지 않음
 * - 정규시즌이 끝나면 1위가 우승 (능력치 보너스)
 */
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import { ageOf, totalOf, youthGrowth, type CareerState, type CPlayer, type ReserveLeague } from "@shared/career/rules";
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { addExp, clampStat, gainStats, news, pickMaps, quickWin, rand } from "./core";
import { setDeltas } from "./growth";

const FIELD_SIZE = 16;
/** 한 주 경기 수 (프로리그처럼 2경기) */
const ROUNDS_PER_WEEK = 2;

/** 어린 선수는 져도 덜 떨어짐 */
const youthLoss = (age: number) => (age <= 19 ? 0.5 : age <= 21 ? 0.7 : 1);

const eligible = (s: CareerState, p: CPlayer | undefined): p is CPlayer =>
  !!p && ((p.team === s.myTeam && !!p.reserve) || p.team === FREE_AGENT_TEAM);

/** 이번 시즌 2부 리그 (없으면 만들고, 참가 선수를 채움) */
export function ensureReserveLeague(s: CareerState): ReserveLeague {
  let L = s.reserveLeague;
  if (!L || L.season !== s.season) L = s.reserveLeague = { season: s.season, field: [], table: {}, last: [] };
  // 1부로 올라가거나 다른 구단에 간 선수는 빠짐, 우리 2부 선수는 항상 참가
  L.field = L.field.filter(id => eligible(s, s.players[id]));
  for (const p of s.players) if (p.team === s.myTeam && p.reserve && !L.field.includes(p.id)) L.field.push(p.id);
  // 남는 자리는 무소속 유망주 (어린 순, 같은 나이면 능력치 순)
  if (L.field.length < FIELD_SIZE) {
    const pool = s.players
      .filter(p => p.team === FREE_AGENT_TEAM && !L!.field.includes(p.id))
      .sort((a, b) => ageOf(a, s.season) - ageOf(b, s.season) || totalOf(b.stats) - totalOf(a.stats));
    for (const p of pool.slice(0, FIELD_SIZE - L.field.length)) L.field.push(p.id);
  }
  for (const id of L.field) L.table[id] ??= [0, 0];
  return L;
}

/** 순위 (승 → 승-패 → 능력치) */
export function reserveStandings(s: CareerState): number[] {
  const L = s.reserveLeague;
  if (!L) return [];
  return [...L.field].sort((a, b) => {
    const [aw, al] = L.table[a] ?? [0, 0], [bw, bl] = L.table[b] ?? [0, 0];
    return bw - aw || (bw - bl) - (aw - al) || totalOf(s.players[b].stats) - totalOf(s.players[a].stats);
  });
}

/** 경기 뒤 능력치 변동 (나이 반영) → 능력치 합 변화 */
function grow(s: CareerState, p: CPlayer, opp: CPlayer, won: boolean): number {
  const age = ageOf(p, s.season);
  const d = setDeltas(p, opp, won, undefined, 0);
  let sum = 0;
  for (const k of STAT_KEYS) {
    const v = d[k as StatKey] ?? 0;
    if (!v) continue;
    const adj = Math.round(v > 0 ? v * youthGrowth(age) : v * youthLoss(age));
    const before = p.stats[k];
    p.stats[k] = clampStat(before + adj);
    sum += p.stats[k] - before;
  }
  addExp(s, p, won ? 20 : 8);
  return sum;
}

/** 이번 주 2부 리그 경기 (정규시즌 매주), lastWeek 이면 끝나고 우승자 결정 */
export function runReserveWeek(s: CareerState, lastWeek: boolean) {
  const L = ensureReserveLeague(s);
  L.last = [];
  for (let r = 0; r < ROUNDS_PER_WEEK; r++) {
    // 성적이 비슷한 선수끼리 (같은 성적이면 무작위)
    const order = [...L.field].sort((a, b) => {
      const [aw, al] = L.table[a], [bw, bl] = L.table[b];
      return (bw - bl) - (aw - al) || rand() - 0.5;
    });
    const maps = pickMaps(Math.ceil(order.length / 2), s.mapPool);
    for (let i = 0; i + 1 < order.length; i += 2) {
      const a = s.players[order[i]], b = s.players[order[i + 1]];
      const mapId = maps[(i / 2) % maps.length];
      const aWin = quickWin(s, a, b, mapId);
      const [w, l] = aWin ? [a, b] : [b, a];
      L.table[w.id][0]++;
      L.table[l.id][1]++;
      const gain = { [w.id]: grow(s, w, l, true), [l.id]: grow(s, l, w, false) };
      L.last.push({ week: s.week, a: a.id, b: b.id, winner: w.id, mapId, gain });
    }
  }
  const mine = L.last.filter(g => s.players[g.a].team === s.myTeam || s.players[g.b].team === s.myTeam);
  if (mine.length) {
    const won = mine.filter(g => s.players[g.winner].team === s.myTeam).length;
    news(s, `🌱 2부 리그 ${s.week}주차: 우리 선수 ${won}승 ${mine.length - won}패`);
  }
  if (lastWeek && !L.champion) {
    const champ = s.players[reserveStandings(s)[0]];
    if (champ) {
      L.champion = champ.id;
      champ.titles = [...(champ.titles ?? []), `${s.season}시즌 2부리그 우승`];
      gainStats(champ, 4, 10, 20);
      news(s, `🌱 ${s.season}시즌 2부 리그 우승: ${champ.name}${champ.team === s.myTeam ? " (우리 2부 선수!)" : " (무소속)"}`);
    }
  }
}
