/**
 * 커리어 모드 공통 함수: 난수, 소식, 능력치 성장, 세트 진행 (프로리그·스타리그 공용)
 */
import { STAT_KEYS, StatKey } from "@shared/gameConstants";
import { ORIG_MAPS } from "@shared/career/originalData";
import {
  ADAPT_WEEKS,
  COND_MAX,
  ageOf,
  youthGrowth,
  COND_MIN,
  MAP_POOL_SIZE,
  STAT_MAX_CAREER,
  STAT_MIN,
  burstChance,
  SLUMP_CHANCE,
  slumpCond,
  slumpOn,
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
  // 하나는 가장 낮은 능력치 (패배로 떨어진 능력치를 훈련으로 되살릴 수 있게), 나머지는 무작위
  const weakest = [...STAT_KEYS].sort((a, b) => p.stats[a] - p.stats[b])[0];
  const keys = [weakest, ...shuffle(STAT_KEYS.filter(k => k !== weakest)).slice(0, Math.max(0, picks - 1))];
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
  /** 능력치 배율 (포텐셜 폭발) */
  mul?: number;
  /** 스나이핑 적중: 이 세트를 이길 확률 65% 이상 */
  snipe?: boolean;
  /** 컨디션 난조 (그 주 경기 컨디션 -40, 최저 10) */
  slump?: boolean;
  /** 능력치별 추가 (작전 메모) */
  bonus?: Partial<Record<StatKey, number>>;
  /** 패배 시 능력치 감소 완화 (츄잉껌) */
  gum?: boolean;
}

/** 세트에 실제로 들어가는 능력치 (장비·컨디션·세트 아이템). 화면의 condStats 와 같은 계산 */
export function effStats(p: CPlayer, mod?: SetMods): Record<StatKey, number> {
  const g = gearStats(p, Object.fromEntries(STAT_KEYS.map(s => [s, (mod?.all ?? 0) + (mod?.bonus?.[s] ?? 0)])));
  const cond = mod?.slump ? slumpCond(gearCond(p)) : gearCond(p);
  const k = condMultiplier(cond) * (mod?.mul ?? 1);
  return Object.fromEntries(STAT_KEYS.map(s => [s, g[s] * k])) as Record<StatKey, number>;
}

/** 실력 차이가 크다고 보는 기준 (컨디션 반영 능력치 합이 이만큼 이상 차이) */
const BIG_GAP = 0.12;
/** 단기전·장기전 기준 (초) — 중계 없는 빠른 판정(duration 0)은 경기 길이를 따지지 않음 */
const SHORT_GAME = 600, LONG_GAME = 1000;

/**
 * 경기 뒤 컨디션 하락 (1 단위)
 * - 승리: 쉽게 이김(내가 훨씬 강하거나 단기전) 0~2, 그 밖 1~3
 * - 패배: 실력 차이가 크거나 장기전 3~6, 그 밖(비슷한 실력·단기전) 1~4
 * edge: (내 실전 능력치 - 상대) / 상대
 */
function condLoss(won: boolean, edge: number, duration: number): number {
  const short = duration > 0 && duration <= SHORT_GAME, long = duration >= LONG_GAME;
  if (won) return edge >= BIG_GAP || short ? randInt(0, 2) : randInt(1, 3);
  return Math.abs(edge) >= BIG_GAP || long ? randInt(3, 6) : randInt(1, 4);
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
export const STAGE_GROWTH = { semi: 1.8, po: 2.2, final: 2.6, promo: 2.0, ro8: 1.6, ro4: 2.0, mslFinal: 2.5 } as const;
let stageGrowth = 1;
/** 개인리그: 이기고 진 선수의 컨디션 하락을 비슷하게 (다전제에서 한 번 진 선수가 계속 불리해지지 않게) */
let evenFatigue = false;
export function withEvenFatigue<T>(fn: () => T): T {
  const prev = evenFatigue;
  evenFatigue = true;
  try { return fn(); } finally { evenFatigue = prev; }
}
/** 2부 리그 경기: 오르는 폭에 나이별 배율 (어릴수록 크게), 어린 선수는 져도 덜 떨어짐 */
let youthMode = false;
export function withStageGrowth<T>(mul: number, fn: () => T, youth = false): T {
  const prev = stageGrowth, prevYouth = youthMode;
  stageGrowth = mul;
  youthMode = youth;
  try { return fn(); } finally { stageGrowth = prev; youthMode = prevYouth; }
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
  // 포텐셜 폭발(예: 114%)도 떨어진 컨디션만큼 줄어듦 (100% 이하가 되면 끝)
  const burstBefore = { a: burstOf(s, a), b: burstOf(s, b) };
  const tire = (p: CPlayer, d: number) => {
    if (p.team === s.myTeam && eventOn("fatigue_unlimited")) return;
    p.cond = clampCond(p.cond - d);
    const mul = burstOf(s, p);
    if (mul) {
      const next = Math.round((mul - d / 100) * 100) / 100;
      if (next > 1) p.burst = { ...p.burst!, mul: next }; else delete p.burst;
    }
  };
  // 세트 전 실전 능력치(컨디션 반영)로 실력 차이
  const power = (p: CPlayer, snap: { cond: number; stats: Record<StatKey, number> }) => totalOf(snap.stats) * condMultiplier(snap.cond) * (burstBefore[p === a ? "a" : "b"] ?? 1);
  const pw = power(w, w === a ? before.a : before.b), pl = power(l, l === a ? before.a : before.b);
  if (evenFatigue) {
    // 개인리그 다전제: 두 선수 비슷하게 (진 선수가 같거나 1 더)
    const d = condLoss(true, 0, duration);
    tire(w, d);
    tire(l, d + randInt(0, 1));
  } else {
    tire(w, condLoss(true, (pw - pl) / Math.max(1, pl), duration));
    tire(l, condLoss(false, (pl - pw) / Math.max(1, pw), duration));
  }
  addExp(s, w, 30); addExp(s, l, 10);
  for (const [p, d] of [[a, da], [b, db]] as const) {
    const age = ageOf(p, s.season);
    const up = stageGrowth * (youthMode ? youthGrowth(age) : 1);
    const down = youthMode && age <= 21 ? (age <= 19 ? 0.5 : 0.7) : 1;
    for (const [k, v] of Object.entries(d)) p.stats[k as StatKey] = clampStat(p.stats[k as StatKey] + (v! > 0 ? Math.round(v! * up) : Math.round(v! * down)));
  }
  for (const p of [a, b]) wearEquip(s, p);
  const fx = { a: fxOf(a, before.a, aWin ? 30 : 10), b: fxOf(b, before.b, aWin ? 10 : 30) };
  for (const [k, p] of [["a", a], ["b", b]] as const) {
    const was = burstBefore[k];
    if (was) fx[k].burst = [was, burstOf(s, p) ?? 0];
  }
  return fx;
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

/**
 * 주가 시작될 때 이번 주 포텐셜이 터질 선수(능력치 110~120%)와 컨디션 난조 선수(컨디션 -40, 최저 10)를 정함 (엔트리 화면부터 보임)
 * 난조는 컨디션과 관계없이 무작위
 */
export function rollWeekBursts(s: CareerState) {
  const wk = `${s.season}-${s.week}`;
  if (s.burstWeek === wk) return;
  s.burstWeek = wk;
  for (const p of s.players) if (p.team >= 0) rollForm(s, p);
}
/**
 * 시즌 중 팀을 옮긴 선수: 프로리그 적응기간 2주 (새 팀의 이번 주 경기가 이미 끝났으면 다음 주부터 2주)
 * 비시즌 이적은 적응기간 없음. 개인리그는 상관없음
 */
export function markNewcomer(s: CareerState, p: CPlayer) {
  if (s.phase === "offseason") { delete p.newcomer; return; }
  const left = s.matches.some(m => m.week === s.week && !m.done && (m.a === p.team || m.b === p.team));
  p.newcomer = { season: s.season, until: s.week + ADAPT_WEEKS + (left ? 0 : 1) };
}

/** 다른 구단이 우리 선수에게 낸 제안 중 아직 답하지 않은 이적료 합 (그 구단은 이 돈을 다른 데 쓰지 않음) */
export function committedMoney(s: CareerState, team: number): number {
  return (s.offers ?? []).filter(o => o.team === team).reduce((a, o) => a + Math.max(o.fee, o.max ?? 0), 0);
}
/** 구단이 지금 자유롭게 쓸 수 있는 돈 */
export const freeMoney = (s: CareerState, team: number) => (s.teams[team]?.money ?? 0) - committedMoney(s, team);

/** 한 선수의 포텐셜 폭발·컨디션 난조를 새로 정함 (주가 시작될 때, 경기를 마칠 때마다) */
export function rollForm(s: CareerState, p: CPlayer) {
  const wk = `${s.season}-${s.week}`;
  delete p.slump;
  if (rand() < burstChance(gearCond(p))) p.burst = { week: wk, mul: Math.round((1.1 + rand() * 0.1) * 100) / 100 };
  else {
    delete p.burst;
    if (rand() < SLUMP_CHANCE) p.slump = wk;
  }
}
/** 경기(프로리그 한 경기·개인리그 한 시리즈)를 마친 선수들은 다음 경기 상태를 새로 정함 */
export function rerollAfterMatch(s: CareerState, ids: Iterable<number>) {
  for (const id of new Set(ids)) { const p = s.players[id]; if (p && p.team >= 0) { rollForm(s, p); delete p.vitaUsed; } }
}
/** 이번 주 상태(포텐셜 폭발 배율·컨디션 난조)를 세트 효과에 더함 */
const withWeek = (s: CareerState, p: CPlayer, mod?: SetMods): SetMods | undefined => {
  const burst = burstOf(s, p), slump = slumpOn(s, p);
  if (!burst && !slump) return mod;
  return { ...mod, ...(burst ? { mul: (mod?.mul ?? 1) * burst } : {}), ...(slump ? { slump: true } : {}) };
};

/**
 * 동족전: 초반 빌드 싸움으로 유불리가 갈림 → 세트마다 한쪽 경기력이 최대 25% 오르고 다른 쪽이 그만큼 내려감
 * (대부분은 작은 차이, 가끔 크게) — 능력치가 낮은 선수도 빌드가 잘 맞으면 이길 수 있음
 */
export const MIRROR_SWING = 0.25;
function mirrorEdge(a: CPlayer, b: CPlayer): number {
  if (a.race !== b.race) return 0;
  return (rand() + rand() - 1) * MIRROR_SWING;
}
function withEdge(mods: { a?: SetMods; b?: SetMods } | undefined, edge: number): { a?: SetMods; b?: SetMods } | undefined {
  if (!edge) return mods;
  return { a: { ...mods?.a, mul: (mods?.a?.mul ?? 1) * (1 + edge) }, b: { ...mods?.b, mul: (mods?.b?.mul ?? 1) * (1 - edge) } };
}

export function playSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, withHighlights: boolean, withTimeline = false, mods?: { a?: SetMods; b?: SetMods }): PlayedSet {
  const m = mapView(mapId);
  // 동족전 빌드 유불리 (스나이핑 등 아이템 효과는 그대로 따로)
  const edge = mirrorEdge(a, b);
  const baseMods = mods;
  mods = withEdge(mods, edge);
  const burst = { a: burstOf(s, a), b: burstOf(s, b) };
  const slump = { a: slumpOn(s, a), b: slumpOn(s, b) };
  let r = simulateSet(
    { id: a.id + 1, name: a.name, race: a.race, stats: effStats(a, withWeek(s, a, mods?.a)), fatigue: 100 },
    { id: b.id + 1, name: b.name, race: b.race, stats: effStats(b, withWeek(s, b, mods?.b)), fatigue: 100 },
    mapAdvantage(mapId, a.race, b.race),
    // 원작 100 기준 → 엔진 50 기준
    { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
    withHighlights,
    withTimeline
  );
  let aWin = r.winnerId === a.id + 1;
  // 스나이핑 적중: 65% 확률로 그 선수가 이기는 경기를 다시 뽑음 (원래 이길 확률까지 더하면 65% 이상)
  const snipe = snipeSide(mods);
  if (snipe && rand() < SNIPE_WIN && aWin !== (snipe === "a")) {
    // 실력 차이가 너무 크면 다시 뽑을 때마다 노린 쪽 경기력을 조금씩 올림
    const boost = (side: "a" | "b", t: number) => side === snipe ? { mul: (mods?.[side]?.mul ?? 1) * (1 + t * 0.04) } : {};
    for (let t = 1; t <= 40 && aWin !== (snipe === "a"); t++) {
      r = simulateSet(
        { id: a.id + 1, name: a.name, race: a.race, stats: effStats(a, withWeek(s, a, { ...mods?.a, ...boost("a", t) })), fatigue: 100 },
        { id: b.id + 1, name: b.name, race: b.race, stats: effStats(b, withWeek(s, b, { ...mods?.b, ...boost("b", t) })), fatigue: 100 },
        mapAdvantage(mapId, a.race, b.race),
        { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
        withHighlights,
        withTimeline
      );
      aWin = r.winnerId === a.id + 1;
    }
  }
  const fx = afterSet(s, a, b, aWin, baseMods, r.content, r.duration);
  // 중계: 동족전 초반 빌드 유불리
  if (r.timeline && Math.abs(edge) >= 0.1) {
    const lead = edge > 0 ? a : b;
    r.timeline.lines.unshift({ t: 0, side: edge > 0 ? 1 : 2, text: `동족전 초반 빌드 싸움, ${lead.name} 선수가 빌드에서 앞서며 유리하게 출발합니다!` });
  }
  // 중계: 포텐셜이 터진 선수 해설
  for (const [side, p] of [[1, a], [2, b]] as const) {
    const k = side === 1 ? "a" : "b";
    if (burst[k] && r.timeline) r.timeline.lines.unshift({ t: 0, side, text: `${p.name} 선수, 오늘 뭔가 다릅니다! 포텐셜이 터졌어요!` });
    if (slump[k] && r.timeline) r.timeline.lines.unshift({ t: 0, side, text: `${p.name} 선수, 오늘은 몸이 무거워 보이네요. 컨디션 난조입니다.` });
  }
  return {
    mapId, a: a.id, b: b.id, winner: aWin ? "a" : "b", duration: r.duration, fx,
    burst: burst.a || burst.b ? burst : undefined,
    slump: slump.a || slump.b ? slump : undefined,
    highlights: withHighlights ? r.highlights : undefined,
    timeline: r.timeline,
  };
}

/** 스나이핑이 적중하면 이 세트를 이길 최소 확률 */
export const SNIPE_WIN = 0.65;
/** 스나이핑이 적중한 쪽 (둘 다면 상쇄) */
function snipeSide(mods?: { a?: SetMods; b?: SetMods }): "a" | "b" | undefined {
  const a = !!mods?.a?.snipe, b = !!mods?.b?.snipe;
  return a === b ? undefined : a ? "a" : "b";
}

/** 빠른 판정 승패: 실전 능력치 차이와 맵 종족 상성으로 (a 가 이기면 true) */
export function quickWin(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, mods?: { a?: SetMods; b?: SetMods }): boolean {
  mods = withEdge(mods, mirrorEdge(a, b));
  const pa = totalOf(effStats(a, withWeek(s, a, mods?.a))), pb = totalOf(effStats(b, withWeek(s, b, mods?.b)));
  const adv = a.race === b.race ? 0 : (matchupValue(mapId, a.race, b.race) - 50) / 100;
  let pWin = 1 / (1 + Math.exp(-((pa - pb) / 450 + adv * 2.2)));
  // 스나이핑 적중: 이길 확률 65% 이상 (원래 확률이 높으면 더 높게)
  const snipe = snipeSide(mods);
  if (snipe === "a") pWin = SNIPE_WIN + (1 - SNIPE_WIN) * pWin;
  if (snipe === "b") pWin = (1 - SNIPE_WIN) * pWin;
  return rand() < pWin;
}

/**
 * 빠른 세트 (중계 없이 능력치·컨디션·맵 상성으로 승패만): PC방 예선처럼 경기 수가 많을 때
 * 세트 후 처리는 playSet 과 같다
 */
export function quickSet(s: CareerState, a: CPlayer, b: CPlayer, mapId: number, mods?: { a?: SetMods; b?: SetMods }): SetResult {
  const aWin = quickWin(s, a, b, mapId, mods);
  afterSet(s, a, b, aWin, mods);
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
