/**
 * 커리어 모드 공통 함수: 난수, 소식, 능력치 성장, 세트 진행 (프로리그·스타리그 공용)
 */
import { STAT_KEYS, StatKey } from "@shared/gameConstants";
import { ORIG_MAPS } from "@shared/career/originalData";
import {
  COND_MAX,
  COND_MIN,
  MAP_POOL_SIZE,
  STAT_MAX_CAREER,
  STAT_MIN,
  condMultiplier,
  totalOf,
  type CareerState,
  type CPlayer,
  type Race,
  type SetResult,
  type SetTimeline,
} from "@shared/career/rules";
import { mapView, matchupValue } from "@shared/career/view";
import { ITEM_BY_KEY, gearCond, gearStats } from "@shared/career/items";
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
  // 원작 종족전 값은 앞 종족 승률 % (50 = 균형) → 엔진 배율 (60:40 이면 1.1 : 0.9)
  const d = (matchupValue(mapId, ra, rb) - 50) / 100;
  return { [ra]: 1 + d, [rb]: 1 - d };
}

export type PlayedSet = SetResult & { timeline?: SetTimeline };

/** 세트 한 판에만 붙는 효과 (경기 아이템) */
export interface SetMods {
  /** 모든 능력치 추가 (치어풀) */
  all?: number;
  /** 능력치 배율 (스나이핑 적중) */
  mul?: number;
  /** 패배 시 능력치 감소 완화 (츄잉껌) */
  gum?: boolean;
}

function effStats(p: CPlayer, mod?: SetMods): Record<StatKey, number> {
  const g = gearStats(p, mod?.all ?? 0);
  const k = condMultiplier(gearCond(p)) * (mod?.mul ?? 1);
  return Object.fromEntries(STAT_KEYS.map(s => [s, g[s] * k])) as Record<StatKey, number>;
}

/** 세트 후 처리: 전적·컨디션·경험치·장비 내구도·패배 시 능력치 감소 */
function afterSet(s: CareerState, a: CPlayer, b: CPlayer, aWin: boolean, mods?: { a?: SetMods; b?: SetMods }) {
  const [w, l] = aWin ? [a, b] : [b, a];
  const lMod = aWin ? mods?.b : mods?.a;
  w.wins++; w.sWins++; l.losses++; l.sLosses++;
  w.vs = { ...w.vs, [l.race]: [(w.vs?.[l.race]?.[0] ?? 0) + 1, w.vs?.[l.race]?.[1] ?? 0] };
  l.vs = { ...l.vs, [w.race]: [l.vs?.[w.race]?.[0] ?? 0, (l.vs?.[w.race]?.[1] ?? 0) + 1] };
  w.cond = clampCond(w.cond + 1); l.cond = clampCond(l.cond - 1);
  addExp(s, w, 30); addExp(s, l, 10);
  // 원작: 패배하면 능력치가 조금 떨어진다 (츄잉껌이면 66% 덜)
  if (rand() < 0.4) {
    const k = STAT_KEYS[Math.floor(rand() * STAT_KEYS.length)];
    const loss = Math.round(randInt(2, 6) * (lMod?.gum ? 0.34 : 1));
    if (loss > 0) l.stats[k] = clampStat(l.stats[k] - loss);
  }
  for (const p of [a, b]) wearEquip(s, p);
}

/** 장비 내구도 1 감소, 다 쓰면 사라짐 */
function wearEquip(s: CareerState, p: CPlayer) {
  if (!p.equip) return;
  for (const [slot, e] of Object.entries(p.equip)) {
    if (!e) continue;
    e.left--;
    if (e.left <= 0) {
      delete p.equip[slot as keyof typeof p.equip];
      if (p.team === s.myTeam) news(s, `🔧 ${p.name} 선수의 ${ITEM_BY_KEY[e.key]?.name ?? "장비"} 수명이 다했습니다`);
    }
  }
}

export function playSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, withHighlights: boolean, withTimeline = false, mods?: { a?: SetMods; b?: SetMods }): PlayedSet {
  const m = mapView(mapId);
  const r = simulateSet(
    { id: a.id + 1, name: a.name, race: a.race, stats: effStats(a, mods?.a), fatigue: 100 },
    { id: b.id + 1, name: b.name, race: b.race, stats: effStats(b, mods?.b), fatigue: 100 },
    mapAdvantage(mapId, a.race, b.race),
    // 원작 100 기준 → 엔진 50 기준
    { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
    withHighlights,
    withTimeline
  );
  const aWin = r.winnerId === a.id + 1;
  afterSet(s, a, b, aWin, mods);
  return {
    mapId, a: a.id, b: b.id, winner: aWin ? "a" : "b", duration: r.duration,
    highlights: withHighlights ? r.highlights : undefined,
    timeline: r.timeline,
  };
}

/**
 * 빠른 세트 (중계 없이 능력치·컨디션·맵 상성으로 승패만): PC방 예선처럼 경기 수가 많을 때
 * 세트 후 처리는 playSet 과 같다
 */
export function quickSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number): SetResult {
  const pa = totalOf(effStats(a)), pb = totalOf(effStats(b));
  const adv = a.race === b.race ? 0 : (matchupValue(mapId, a.race, b.race) - 50) / 100;
  const pWin = 1 / (1 + Math.exp(-((pa - pb) / 450 + adv * 2.2)));
  const aWin = rand() < pWin;
  afterSet(s, a, b, aWin);
  return { mapId, a: a.id, b: b.id, winner: aWin ? "a" : "b", duration: 0 };
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

/** 서로 다른 맵 n개. pool(시즌 맵 추첨 결과)이 있으면 그 안에서 고른다 */
export function pickMaps(n: number, pool?: number[]): number[] {
  const src = pool?.length ? pool : ORIG_MAPS.map((_, i) => i);
  const out: number[] = [];
  while (out.length < n) out.push(...shuffle(src));
  return out.slice(0, n);
}

export function drawMapPool(): number[] {
  return pickMaps(MAP_POOL_SIZE);
}
