/**
 * 커리어 모드 공통 함수: 난수, 소식, 능력치 성장, 세트 진행 (프로리그·스타리그 공용)
 */
import { STAT_KEYS, StatKey } from "@shared/gameConstants";
import { ORIG_MAPS } from "@shared/career/originalData";
import {
  COND_MAX,
  COND_MIN,
  STAT_MAX_CAREER,
  STAT_MIN,
  condMultiplier,
  type CareerState,
  type CPlayer,
  type Race,
  type SetResult,
} from "@shared/career/rules";
import { simulateSet } from "../gameSimulation";

export const rand = () => Math.random();
export const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
export const clampStat = (v: number) => Math.max(STAT_MIN, Math.min(STAT_MAX_CAREER, Math.round(v)));
export const clampCond = (v: number) => Math.max(COND_MIN, Math.min(COND_MAX, Math.round(v)));

export class CareerError extends Error {}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function news(s: CareerState, text: string) {
  s.news.unshift({ season: s.season, week: s.week, text });
  if (s.news.length > 60) s.news.length = 60;
}

export function gainStats(p: CPlayer, picks: number, min: number, max: number): string[] {
  const keys = shuffle([...STAT_KEYS]).slice(0, picks);
  return keys.map(k => {
    // 능력치가 높을수록 잘 안 오름
    const room = Math.max(0.15, 1 - (p.stats[k] - 500) / 600);
    const g = Math.max(1, Math.round(randInt(min, max) * room));
    p.stats[k] = clampStat(p.stats[k] + g);
    return k;
  });
}

export function mapAdvantage(mapId: number, ra: Race, rb: Race): Record<string, number> {
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

export function playSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, withHighlights: boolean): SetResult {
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

export function addExp(s: CareerState, p: CPlayer, exp: number) {
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

export function pickMaps(n: number): number[] {
  return shuffle(ORIG_MAPS.map((_, i) => i)).slice(0, n);
}
