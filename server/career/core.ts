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
  burstChance,
  burstOf,
  condMultiplier,
  totalOf,
  type CareerState,
  type CPlayer,
  type PlayerFx,
  type Race,
  type SetResult,
  type SetTimeline,
} from "@shared/career/rules";
import { mapView, matchupValue } from "@shared/career/view";
import { ITEM_BY_KEY, gearCond, gearStats } from "@shared/career/items";
import { simulateSet, type SetContent } from "../gameSimulation";
import { setDeltas, talent } from "./growth";
import { eventOn } from "./events";

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
    // 능력치가 높을수록 조금 덜 오름 (선수별 성장 한계는 없음, 재능은 속도만)
    const room = Math.max(0.4, 1 - (p.stats[k] - 600) / 900);
    const g = Math.max(1, Math.round(randInt(min, max) * room * talent(p)));
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

/** 세트에 실제로 들어가는 능력치 (장비·컨디션·세트 아이템). 화면의 condStats 와 같은 계산 */
export function effStats(p: CPlayer, mod?: SetMods): Record<StatKey, number> {
  const g = gearStats(p, mod?.all ?? 0);
  const k = condMultiplier(gearCond(p)) * (mod?.mul ?? 1);
  return Object.fromEntries(STAT_KEYS.map(s => [s, g[s] * k])) as Record<StatKey, number>;
}

/**
 * 경기 뒤 컨디션 하락 (원작: 1 단위)
 * - 패배: 3~10 (경기가 길수록, 기지를 잃거나 완패할수록 더)
 * - 승리: 0~3 (컨디션이 좋으면 안 떨어지기도, 긴 경기면 더)
 */
function condLoss(p: CPlayer, won: boolean, c: SetContent | undefined, duration: number): number {
  const long = Math.min(3, Math.max(0, (duration - 600) / 300));
  if (won) {
    const base = p.cond >= 80 ? randInt(0, 2) : randInt(1, 3);
    return Math.max(0, Math.min(3, Math.round(base + long * 0.4)));
  }
  const pain = c ? c.crushed * 1 + c.basesLost * 0.7 + c.holdFails * 0.4 : 0;
  return Math.max(3, Math.min(10, Math.round(randInt(3, 5) + long + pain)));
}

/** 세트 전 상태 → 변화 기록 */
function fxOf(p: CPlayer, before: { cond: number; stats: Record<StatKey, number>; level: number }, exp: number): PlayerFx {
  const stats = Object.fromEntries(STAT_KEYS.map(k => [k, p.stats[k] - before.stats[k]]).filter(([, d]) => d !== 0));
  return { cond: [before.cond, p.cond], stats: Object.keys(stats).length ? stats : undefined, exp, level: p.level !== before.level ? p.level : undefined };
}

/**
 * 세트 후 처리: 전적·컨디션(둘 다 지침: 승자 -1, 패자 -2)·경험치·장비 내구도
 * 능력치: 경기 내용에 따라 여러 능력치가 오르내림 (growth.ts, 츄잉껌이면 떨어지는 폭 66% 덜)
 */
/**
 * 큰 무대 성장 배율: 프로리그 포스트시즌(준PO·PO·결승)과 개인리그 8강 이상은 경기 뒤 능력치가 크게 오름
 * (오르는 쪽에만 적용, 떨어지는 폭은 그대로)
 */
export const STAGE_GROWTH = { semi: 1.8, po: 2.2, final: 2.6, ro8: 1.6, ro4: 2.0, mslFinal: 2.5 } as const;
let stageGrowth = 1;
export function withStageGrowth<T>(mul: number, fn: () => T): T {
  const prev = stageGrowth;
  stageGrowth = mul;
  try { return fn(); } finally { stageGrowth = prev; }
}

function afterSet(s: CareerState, a: CPlayer, b: CPlayer, aWin: boolean, mods?: { a?: SetMods; b?: SetMods }, content?: [SetContent, SetContent], duration = 0): { a: PlayerFx; b: PlayerFx } {
  const snap = (p: CPlayer) => ({ cond: p.cond, stats: { ...p.stats }, level: p.level });
  const before = { a: snap(a), b: snap(b) };
  const [w, l] = aWin ? [a, b] : [b, a];
  // 능력치 변동은 세트 전 능력치로 계산 (두 선수 동시에)
  const da = setDeltas(a, b, aWin, content?.[0], duration, !aWin && !!mods?.a?.gum);
  const db = setDeltas(b, a, !aWin, content?.[1], duration, aWin && !!mods?.b?.gum);
  w.wins++; w.sWins++; l.losses++; l.sLosses++;
  w.vs = { ...w.vs, [l.race]: [(w.vs?.[l.race]?.[0] ?? 0) + 1, w.vs?.[l.race]?.[1] ?? 0] };
  l.vs = { ...l.vs, [w.race]: [l.vs?.[w.race]?.[0] ?? 0, (l.vs?.[w.race]?.[1] ?? 0) + 1] };
  if (w.team === s.myTeam) w.h2h = { ...w.h2h, [l.id]: [(w.h2h?.[l.id]?.[0] ?? 0) + 1, w.h2h?.[l.id]?.[1] ?? 0] };
  if (l.team === s.myTeam) l.h2h = { ...l.h2h, [w.id]: [l.h2h?.[w.id]?.[0] ?? 0, (l.h2h?.[w.id]?.[1] ?? 0) + 1] };
  // 컨디션 유지 이벤트: 우리 선수는 지치지 않음
  const tire = (p: CPlayer, d: number) => { if (!(p.team === s.myTeam && eventOn("fatigue_unlimited"))) p.cond = clampCond(p.cond - d); };
  tire(w, condLoss(w, true, content?.[w === a ? 0 : 1], duration));
  tire(l, condLoss(l, false, content?.[l === a ? 0 : 1], duration));
  addExp(s, w, 30); addExp(s, l, 10);
  for (const [p, d] of [[a, da], [b, db]] as const) {
    for (const [k, v] of Object.entries(d)) p.stats[k as StatKey] = clampStat(p.stats[k as StatKey] + (v! > 0 ? Math.round(v! * stageGrowth) : v!));
  }
  for (const p of [a, b]) wearEquip(s, p);
  return { a: fxOf(a, before.a, aWin ? 30 : 10), b: fxOf(b, before.b, aWin ? 10 : 30) };
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

/** 세트마다 포텐셜 폭발 판정 → 능력치 배율 (1.1~1.2) */
/** 주가 시작될 때 이번 주 포텐셜이 터질 선수를 정함 (엔트리 화면부터 보임) */
export function rollWeekBursts(s: CareerState) {
  const wk = `${s.season}-${s.week}`;
  if (s.burstWeek === wk) return;
  s.burstWeek = wk;
  for (const p of s.players) {
    if (p.team < 0) continue;
    if (rand() < burstChance(gearCond(p))) p.burst = { week: wk, mul: Math.round((1.1 + rand() * 0.1) * 100) / 100 };
    else delete p.burst;
  }
}
const withBurst = (mod: SetMods | undefined, burst: number | undefined): SetMods | undefined => (burst ? { ...mod, mul: (mod?.mul ?? 1) * burst } : mod);

export function playSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, withHighlights: boolean, withTimeline = false, mods?: { a?: SetMods; b?: SetMods }): PlayedSet {
  const m = mapView(mapId);
  const burst = { a: burstOf(s, a), b: burstOf(s, b) };
  const r = simulateSet(
    { id: a.id + 1, name: a.name, race: a.race, stats: effStats(a, withBurst(mods?.a, burst.a)), fatigue: 100 },
    { id: b.id + 1, name: b.name, race: b.race, stats: effStats(b, withBurst(mods?.b, burst.b)), fatigue: 100 },
    mapAdvantage(mapId, a.race, b.race),
    // 원작 100 기준 → 엔진 50 기준
    { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
    withHighlights,
    withTimeline
  );
  const aWin = r.winnerId === a.id + 1;
  const fx = afterSet(s, a, b, aWin, mods, r.content, r.duration);
  // 중계: 포텐셜이 터진 선수 해설
  for (const [side, p] of [[1, a], [2, b]] as const) {
    if (burst[side === 1 ? "a" : "b"] && r.timeline) r.timeline.lines.unshift({ t: 0, side, text: `${p.name} 선수, 오늘 뭔가 다릅니다! 포텐셜이 터졌어요!` });
  }
  return {
    mapId, a: a.id, b: b.id, winner: aWin ? "a" : "b", duration: r.duration, fx,
    burst: burst.a || burst.b ? burst : undefined,
    highlights: withHighlights ? r.highlights : undefined,
    timeline: r.timeline,
  };
}

/**
 * 빠른 세트 (중계 없이 능력치·컨디션·맵 상성으로 승패만): PC방 예선처럼 경기 수가 많을 때
 * 세트 후 처리는 playSet 과 같다
 */
export function quickSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number): SetResult {
  const pa = totalOf(effStats(a, withBurst(undefined, burstOf(s, a)))), pb = totalOf(effStats(b, withBurst(undefined, burstOf(s, b))));
  const adv = a.race === b.race ? 0 : (matchupValue(mapId, a.race, b.race) - 50) / 100;
  const pWin = 1 / (1 + Math.exp(-((pa - pb) / 450 + adv * 2.2)));
  const aWin = rand() < pWin;
  afterSet(s, a, b, aWin);
  return { mapId, a: a.id, b: b.id, winner: aWin ? "a" : "b", duration: 0 };
}

export function addExp(s: CareerState, p: CPlayer, exp: number) {
  p.exp += p.team === s.myTeam && eventOn("exp_double") ? exp * 2 : exp;
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
