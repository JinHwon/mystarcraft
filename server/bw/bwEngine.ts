/**
 * 브루드 워 경기 시뮬레이션 엔진
 *
 * 한 턴 = 게임 시간 20초, 내부적으로 5초 단위로 경제/생산을 진행한다.
 * - 경제: 일꾼 수·기지 포화도(미네랄 16 + 가스 3)·기지 자원 고갈을 실제 채취량 기준으로 계산
 * - 인구수: 서플라이 디팟/파일런/오버로드, 커맨드 센터 10·넥서스 9·해처리 1, 최대 200
 * - 생산: 건물별 실제 생산 시간, 저그는 해처리당 애벌레 생성 (12초, 최대 3)
 * - 빌드: 종족전별 실제 빌드 오더 → 테크 트리 순서대로 건물/연구
 * - 교전: 공격 타입 × 크기 상성, 스플래시, 탐지(클로킹), 스킬(스톰·이레디·스웜·EMP), 업그레이드,
 *         란체스터 법칙으로 전력 비교 후 피해 산출
 * - 능력치: 물량(매크로 효율·인구 막힘) 컨트롤(교전 효율·후퇴) 공격력/수비력(공격·수비 교전)
 *           견제(견제 빈도·성공) 정찰(빌드 파악·탐지 대비) 센스(공격·멀티 타이밍) 전략(빌드·상성 대응)
 */
import {
  UNITS, BUILDINGS, TECHS, RACE_ROLES, ECONOMY, BASE_NAMES,
  damageMultiplier, nameOf, type Race, type UnitDef,
} from "./bwData";
import { pickPlan, type Plan, type HarassKind } from "./bwBuilds";

const TICK = 5;
export const TURN_SECONDS = 20;
const MAX_GAME_SECONDS = 40 * 60;

type Skills = { sense: number; control: number; attack: number; harass: number; strategy: number; supply: number; defense: number; scout: number };

interface Base {
  name: string;
  minerals: number;
  gas: number;
  hasGas: boolean;
  gasPending: boolean;
  alive: boolean;
  ready: boolean;
  mentionedDepleted?: boolean;
}

interface Job {
  kind: "building" | "tech" | "unit" | "expand" | "worker";
  key: string;
  remaining: number;
  producer?: string;
  count?: number;
  supply?: number;
}

export interface GameEventRecord {
  type: "engagement" | "multi_expansion" | "resource_drain" | "scouting_success" | "scouting_failure";
  winner?: 1 | 2;
  time: number;
}

export interface BwPlayer {
  side: 1 | 2;
  id: number;
  name: string;
  race: Race;
  sk: Skills;
  /** 맵 지형 (-1 ~ 1 로 정규화: 러쉬거리 짧음/김, 복잡도 단순/복잡, 자원 적음/풍부) */
  terrain: Terrain;
  plan: Plan;
  openingIdx: number;
  /** 오프닝 이후 올릴 테크 순서 (끝내지 못한 오프닝 단계가 앞에 붙음) */
  techQueue: string[];
  openingDoneSteps: Set<number>;
  minerals: number;
  gas: number;
  totalMined: number;
  workers: number;
  bases: Base[];
  buildings: Record<string, number>;
  pendingBuildings: Record<string, number>;
  techs: Set<string>;
  pendingTechs: Set<string>;
  units: Record<string, number>;
  jobs: Job[];
  busy: Record<string, number>;
  larva: number;
  larvaTimer: number;
  pushDone: boolean;
  lastAttackTurn: number;
  /** 상대 공격을 막아낸 직후 역습 가능 (턴 번호) */
  counterTurn: number;
  harassCooldown: number;
  scouted: boolean;
  knowsEnemyPlan: boolean;
  knownEnemy: Record<string, number>;
  detectionUrgent: boolean;
  supplyBlockedTicks: number;
  blockAnnounced: boolean;
  announced: Set<string>;
  incomeWindow: number[];
  workersLost: number;
  /** 지출 분류 (분석용) */
  spent: Record<string, number>;
  // 기존 인터페이스 호환 (최종 점수 계산 등)
  supply: number;
  resources: number;
  health: number;
}

export interface GameState {
  turn: number;
  time: number;
  gameEnded: boolean;
  winner?: number;
  endReason?: string;
  player1: BwPlayer;
  player2: BwPlayer;
  player1Advantage: number;
  player1Events: GameEventRecord[];
  player2Events: GameEventRecord[];
  turnCommentaries: string[];
  mapTraits?: { rushDistance: number; resources: number; complexity: number };
  mapRaceAdvantage?: Record<string, number>;
  /** 원작식 해설용 경기 이벤트 기록 (있을 때만 쌓음) */
  feed?: FeedEvent[];
}

type Side = 1 | 2;
/** 원작식 해설을 고르기 위한 구조화된 경기 이벤트 */
export type FeedEvent = { t: number } & (
  | { k: "plan"; side: Side; plan: string; style: string }
  | { k: "build"; side: Side; key: string; count: number }
  | { k: "expand"; side: Side; idx: number }
  | { k: "unit"; side: Side; key: string; count: number }
  | { k: "tech"; side: Side; key: string }
  | { k: "attack"; side: Side; units: Record<string, number>; vs: Record<string, number>; target: number; early: boolean }
  | { k: "fight"; winner: Side; attacker: Side; winUnits: Record<string, number>; loseUnits: Record<string, number>; close: boolean; crush: boolean; upset: boolean; target: number }
  | { k: "base"; victim: Side; idx: number; killed: number }
  | { k: "raid"; side: Side; killed: number }
  | { k: "harass"; side: Side; kind: string; killed: number }
  | { k: "push"; side: Side }
  | { k: "counter"; side: Side }
  | { k: "gg"; loser: Side }
  | { k: "judge"; winner: Side }
);

function emit(gs: GameState, ev: FeedEvent extends infer E ? (E extends { t: number } ? Omit<E, "t"> : never) : never) {
  gs.feed?.push({ ...ev, t: gs.time } as FeedEvent);
}

// ══════════════════════════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════════════════════════

const rand = () => Math.random();
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const skill = (v: number | undefined) => clamp(((v ?? 500) - 500) / 500, -1, 1.4);

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function say(gs: GameState, text: string) {
  gs.turnCommentaries.push(`[${fmtTime(gs.time)}] ${text}`);
}

function enemyOf(gs: GameState, p: BwPlayer): BwPlayer {
  return p.side === 1 ? gs.player2 : gs.player1;
}

function eventsOf(gs: GameState, p: BwPlayer): GameEventRecord[] {
  return p.side === 1 ? gs.player1Events : gs.player2Events;
}

function has(p: BwPlayer, key: string): boolean {
  return (p.buildings[key] ?? 0) > 0 || p.techs.has(key);
}

function reqMet(p: BwPlayer, reqs: string[]): boolean {
  return reqs.every(r => has(p, r));
}

function aliveBases(p: BwPlayer): Base[] {
  return p.bases.filter(b => b.alive && b.ready);
}

function townHalls(p: BwPlayer): number {
  return aliveBases(p).length;
}

function hatcheryCount(p: BwPlayer): number {
  return townHalls(p) + (p.race === "zerg" ? p.buildings.hatchery ?? 0 : 0);
}

function isCombat(def: UnitDef): boolean {
  return !def.worker && !def.support;
}

function armySupply(p: BwPlayer): number {
  let s = 0;
  for (const [k, c] of Object.entries(p.units)) {
    const d = UNITS[k];
    if (d && isCombat(d)) s += d.supply * c;
  }
  return Math.round(s);
}

function armyValue(p: BwPlayer): number {
  let v = 0;
  for (const [k, c] of Object.entries(p.units)) {
    const d = UNITS[k];
    if (d && isCombat(d)) v += (d.min + d.gas * 1.2) * c / (d.count ?? 1);
  }
  return v;
}

/** 방어 건물 가치 (공격 판단용) */
function staticValue(p: BwPlayer): number {
  let v = 0;
  for (const [k, c] of Object.entries(p.buildings)) {
    const d = BUILDINGS[k];
    if (d?.defense && c > 0) v += c * (d.min + 100);
  }
  return v;
}

function supplyUsed(p: BwPlayer): number {
  let s = p.workers;
  for (const [k, c] of Object.entries(p.units)) s += (UNITS[k]?.supply ?? 0) * c;
  for (const j of p.jobs) if (j.supply) s += j.supply;
  return s;
}

function supplyCap(p: BwPlayer): number {
  const roles = RACE_ROLES[p.race];
  let cap = townHalls(p) * (BUILDINGS[roles.townhall].supplyProvided ?? 0);
  if (p.race === "zerg") cap += (p.units.overlord ?? 0) * 8 + (p.buildings.hatchery ?? 0);
  else cap += (p.buildings[roles.supply] ?? 0) * 8;
  return Math.min(ECONOMY.supplyMax, cap);
}

function pendingSupply(p: BwPlayer): number {
  let s = 0;
  for (const j of p.jobs) {
    if (j.key === RACE_ROLES[p.race].supply) s += 8;
    if (j.kind === "expand") s += BUILDINGS[RACE_ROLES[p.race].townhall].supplyProvided ?? 0;
  }
  return s;
}

function composition(units: Record<string, number>, max = 4): string {
  const list = Object.entries(units)
    .filter(([k, c]) => c > 0 && UNITS[k] && isCombat(UNITS[k]))
    .sort((a, b) => b[1] * UNITS[b[0]].supply - a[1] * UNITS[a[0]].supply)
    .slice(0, max)
    .map(([k, c]) => `${UNITS[k].name} ${Math.round(c)}`);
  return list.length ? list.join(" · ") : "병력 없음";
}

function workerName(p: BwPlayer) {
  return UNITS[RACE_ROLES[p.race].worker].name;
}

// ══════════════════════════════════════════════════════════════
// 초기화
// ══════════════════════════════════════════════════════════════

function makePlayer(side: 1 | 2, id: number, name: string, race: Race, vs: Race, stats: Record<string, number> | undefined, resFactor: number, terrain: Terrain): BwPlayer {
  const sk: Skills = {
    sense: skill(stats?.sense), control: skill(stats?.control), attack: skill(stats?.attack),
    harass: skill(stats?.harass), strategy: skill(stats?.strategy), supply: skill(stats?.supply),
    defense: skill(stats?.defense), scout: skill(stats?.scout),
  };
  const plan = pickPlan(race, vs, sk.strategy, rand, terrain.rd);
  const p: BwPlayer = {
    side, id, name, race, sk, terrain, plan, openingIdx: 0, techQueue: [...plan.tech], openingDoneSteps: new Set(),
    minerals: 50, gas: 0, totalMined: 0,
    workers: 4,
    bases: [{ name: BASE_NAMES[0], minerals: ECONOMY.baseMinerals * resFactor, gas: ECONOMY.baseGas * resFactor, hasGas: false, gasPending: false, alive: true, ready: true }],
    buildings: {}, pendingBuildings: {},
    techs: new Set(), pendingTechs: new Set(),
    units: race === "zerg" ? { overlord: 1 } : {},
    jobs: [], busy: {},
    larva: race === "zerg" ? 3 : 0, larvaTimer: 0,
    pushDone: false, lastAttackTurn: -99, counterTurn: -99, harassCooldown: 6,
    scouted: false, knowsEnemyPlan: false, knownEnemy: {}, detectionUrgent: false,
    supplyBlockedTicks: 0, blockAnnounced: false,
    announced: new Set(), incomeWindow: [], workersLost: 0, spent: {},
    supply: 0, resources: 0, health: 100,
  };
  return p;
}

export interface Terrain { rd: number; cx: number; rs: number }

function toTerrain(t?: { rushDistance: number; resources: number; complexity: number }): Terrain {
  const n = (v: number | undefined) => clamp(((v ?? 50) - 50) / 50, -1, 1);
  return { rd: n(t?.rushDistance), cx: n(t?.complexity), rs: n(t?.resources) };
}

export function initializeGameState(
  p1Id: number, p1Name: string, p1Race: Race,
  p2Id: number, p2Name: string, p2Race: Race,
  p1Stats?: Record<string, number>, p2Stats?: Record<string, number>,
  mapTraits?: { rushDistance: number; resources: number; complexity: number },
  mapRaceAdvantage?: Record<string, number>
): GameState {
  const resFactor = clamp((mapTraits?.resources ?? 50) / 50, 0.7, 1.4);
  const terrain = toTerrain(mapTraits);
  const gs: GameState = {
    turn: 0, time: 0, gameEnded: false,
    player1: makePlayer(1, p1Id, p1Name, p1Race, p2Race, p1Stats, resFactor, terrain),
    player2: makePlayer(2, p2Id, p2Name, p2Race, p1Race, p2Stats, resFactor, terrain),
    player1Advantage: 50,
    player1Events: [], player2Events: [],
    turnCommentaries: [],
    mapTraits, mapRaceAdvantage,
  };
  return gs;
}

// ══════════════════════════════════════════════════════════════
// 경제
// ══════════════════════════════════════════════════════════════

function mine(gs: GameState, p: BwPlayer, dt: number) {
  const bases = aliveBases(p);
  const gasBases = bases.filter(b => b.hasGas);
  let remaining = p.workers;
  let gasIncome = 0;
  for (const b of gasBases) {
    const gw = Math.min(ECONOMY.gasWorkers, remaining);
    remaining -= gw;
    const rate = (gw / ECONOMY.gasWorkers) * ECONOMY.gasPerRefinery * (b.gas > 0 ? 1 : 0.25);
    const got = rate * dt;
    b.gas = Math.max(0, b.gas - got);
    gasIncome += got;
  }
  let mineralIncome = 0;
  for (const b of bases) {
    if (b.minerals <= 0) continue;
    const w = Math.min(ECONOMY.maxMineralWorkers, remaining);
    remaining -= w;
    const eff = Math.min(w, ECONOMY.optimalMineralWorkers) + Math.max(0, w - ECONOMY.optimalMineralWorkers) * ECONOMY.oversaturatedRate;
    const got = Math.min(b.minerals, eff * ECONOMY.mineralPerWorker * dt);
    b.minerals -= got;
    mineralIncome += got;
    if (b.minerals < 1500 && !b.mentionedDepleted && b.name === BASE_NAMES[0] && gs.time > 300) {
      b.mentionedDepleted = true;
      say(gs, `${p.name} 선수, 본진 미네랄이 바닥을 보이기 시작합니다. 멀티가 더 필요한 시점입니다.`);
    }
  }
  p.minerals += mineralIncome;
  p.gas += gasIncome;
  p.totalMined += mineralIncome + gasIncome;
  p.incomeWindow.push(mineralIncome + gasIncome);
  if (p.incomeWindow.length > 12) p.incomeWindow.shift();
}

function incomePerMinute(p: BwPlayer): number {
  const total = p.incomeWindow.reduce((a, b) => a + b, 0);
  return p.incomeWindow.length ? Math.round((total / (p.incomeWindow.length * TICK)) * 60) : 0;
}

function workerTarget(p: BwPlayer, time: number): number {
  if (p.plan.style === "cheese" && !p.pushDone) return p.plan.opening[0][0] + 2;
  let t = 0;
  for (const b of aliveBases(p)) {
    if (b.minerals > 800) t += ECONOMY.optimalMineralWorkers + 2;
    if (b.hasGas || b.gasPending) t += ECONOMY.gasWorkers;
  }
  // 건설 중인 멀티를 위해 미리 일꾼 확보
  if (p.jobs.some(j => j.kind === "expand")) t += 8;
  let target = Math.min(p.race === "zerg" ? 72 : 66, Math.max(12, t));
  // 저그는 시간대별 드론 상한 (6분 약 42기, 9분 약 57기)
  if (p.race === "zerg") target = Math.min(target, Math.round(12 + (p.plan.style === "greedy" ? 5.8 : 5) * (time / 60)));
  return target;
}

// ══════════════════════════════════════════════════════════════
// 생산/건설
// ══════════════════════════════════════════════════════════════

function canPay(p: BwPlayer, min: number, gas: number, reserve: { min: number; gas: number }) {
  // 예약은 해당 자원을 쓰는 지출에만 적용 (가스를 모으는 중이어도 미네랄 유닛은 생산)
  return (min <= 0 || p.minerals - reserve.min >= min) && (gas <= 0 || p.gas - reserve.gas >= gas);
}

function pay(p: BwPlayer, min: number, gas: number, category = "etc") {
  p.minerals -= min;
  p.gas -= gas;
  p.spent[category] = (p.spent[category] ?? 0) + min;
}

function producerKey(p: BwPlayer, from: string) {
  return from === RACE_ROLES[p.race].townhall ? "__townhall" : from;
}

function freeProducers(p: BwPlayer, from: string): number {
  if (from === RACE_ROLES[p.race].townhall) return townHalls(p) - (p.busy.__townhall ?? 0);
  return (p.buildings[from] ?? 0) - (p.busy[from] ?? 0);
}

function tryBuilding(gs: GameState, p: BwPlayer, key: string, reserve: { min: number; gas: number }): boolean {
  const def = BUILDINGS[key];
  if (!def || !reqMet(p, def.requires)) return false;
  if (key === "machine_shop" && (p.buildings.machine_shop ?? 0) + (p.pendingBuildings.machine_shop ?? 0) >= (p.buildings.factory ?? 0)) return false;
  if (def.role === "gas") {
    const target = aliveBases(p).find(b => !b.hasGas && !b.gasPending && b.gas > 0);
    if (!target) return false;
    if (!canPay(p, def.min, def.gas, reserve)) return false;
    target.gasPending = true;
  } else if (!canPay(p, def.min, def.gas, reserve)) {
    return false;
  }
  if (p.race === "zerg") {
    if (p.workers <= 3) return false;
    p.workers -= 1; // 드론이 건물로 변태
  }
  pay(p, def.min, def.gas, def.role === "static" ? "static" : def.role === "producer" || def.role === "townhall" ? "producer" : "building");
  p.pendingBuildings[key] = (p.pendingBuildings[key] ?? 0) + 1;
  p.jobs.push({ kind: "building", key, remaining: def.time });
  return true;
}

function tryExpand(gs: GameState, p: BwPlayer, reserve: { min: number; gas: number }): boolean {
  const th = BUILDINGS[RACE_ROLES[p.race].townhall];
  if (!canPay(p, th.min, 0, reserve)) return false;
  if (p.race === "zerg") {
    if (p.workers <= 3) return false;
    p.workers -= 1;
  }
  pay(p, th.min, 0, "expand");
  p.jobs.push({ kind: "expand", key: th.key, remaining: th.time });
  return true;
}

function tryTech(gs: GameState, p: BwPlayer, key: string, reserve: { min: number; gas: number }): boolean {
  const def = TECHS[key];
  if (!def || p.techs.has(key) || p.pendingTechs.has(key)) return false;
  const atOk = def.at === "hatchery" ? townHalls(p) > 0 : def.at === "command_center" ? townHalls(p) > 0 : has(p, def.at);
  if (!atOk || !reqMet(p, def.requires)) return false;
  if (!canPay(p, def.min, def.gas, reserve)) return false;
  pay(p, def.min, def.gas, "tech");
  p.pendingTechs.add(key);
  p.jobs.push({ kind: "tech", key, remaining: def.time });
  return true;
}

function unitProducible(p: BwPlayer, key: string): boolean {
  const def = UNITS[key];
  if (!def || def.race !== p.race || def.worker) return false;
  if (!reqMet(p, def.requires)) return false;
  if (def.from === "larva") return p.larva > 0;
  if (def.from.startsWith("morph:")) {
    const src = def.from.slice(6);
    return (p.units[src] ?? 0) >= (key === "archon" ? 2 : 1);
  }
  return freeProducers(p, def.from) > 0;
}

function tryUnit(gs: GameState, p: BwPlayer, key: string, reserve: { min: number; gas: number }): boolean {
  const def = UNITS[key];
  if (!unitProducible(p, key)) return false;
  const count = def.count ?? 1;
  const cost = { min: def.min * count, gas: def.gas * count };
  if (!canPay(p, cost.min, cost.gas, reserve)) return false;
  const supplyNeed = def.supply * count;
  const morphSrc = def.from.startsWith("morph:") ? def.from.slice(6) : null;
  const freedSupply = morphSrc ? UNITS[morphSrc].supply * (key === "archon" ? 2 : 1) : 0;
  if (supplyNeed - freedSupply > 0 && supplyUsed(p) + supplyNeed - freedSupply > supplyCap(p)) {
    p.supplyBlockedTicks++;
    return false;
  }
  pay(p, cost.min, cost.gas, "army");
  let producer: string | undefined;
  if (def.from === "larva") p.larva--;
  else if (def.from.startsWith("morph:")) {
    const src = def.from.slice(6);
    const n = key === "archon" ? 2 : 1;
    p.units[src] -= n;
  } else {
    producer = producerKey(p, def.from);
    p.busy[producer] = (p.busy[producer] ?? 0) + 1;
  }
  // 변태 중인 유닛은 원래 유닛을 제거했으므로 완성될 유닛의 인구수 전체를 예약
  p.jobs.push({ kind: "unit", key, remaining: def.time, producer, count, supply: supplyNeed });
  return true;
}

function tryWorker(p: BwPlayer, reserve: { min: number; gas: number }): boolean {
  const w = UNITS[RACE_ROLES[p.race].worker];
  if (!canPay(p, w.min, 0, reserve)) return false;
  if (supplyUsed(p) + 1 > supplyCap(p)) {
    p.supplyBlockedTicks++;
    return false;
  }
  if (p.race === "zerg") {
    if (p.larva <= 0) return false;
    p.larva--;
    pay(p, w.min, 0, "worker");
    p.jobs.push({ kind: "worker", key: w.key, remaining: w.time, supply: 1 });
    return true;
  }
  if (freeProducers(p, RACE_ROLES[p.race].townhall) <= 0) return false;
  pay(p, w.min, 0, "worker");
  p.busy.__townhall = (p.busy.__townhall ?? 0) + 1;
  p.jobs.push({ kind: "worker", key: w.key, remaining: w.time, producer: "__townhall", supply: 1 });
  return true;
}

function trySupply(p: BwPlayer, reserve: { min: number; gas: number }): boolean {
  const key = RACE_ROLES[p.race].supply;
  if (p.race === "zerg") {
    if (p.larva <= 0 || !canPay(p, 100, 0, reserve)) return false;
    p.larva--;
    pay(p, 100, 0, "supply");
    p.jobs.push({ kind: "unit", key: "overlord", remaining: UNITS.overlord.time, count: 1 });
    return true;
  }
  const def = BUILDINGS[key];
  if (!canPay(p, def.min, 0, reserve)) return false;
  pay(p, def.min, 0, "supply");
  p.pendingBuildings[key] = (p.pendingBuildings[key] ?? 0) + 1;
  p.jobs.push({ kind: "building", key, remaining: def.time });
  return true;
}

const NOTABLE_BUILDINGS = new Set([
  "factory", "starport", "science_facility", "armory",
  "cybernetics_core", "robotics_facility", "stargate", "templar_archives", "fleet_beacon", "arbiter_tribunal", "citadel_of_adun",
  "spawning_pool", "hydralisk_den", "spire", "queens_nest", "ultralisk_cavern", "defiler_mound",
]);
const NOTABLE_TECHS = new Set([
  "stim", "siege_mode", "irradiate", "cloaking_field", "emp", "spider_mines",
  "singularity_charge", "leg_enhancements", "psionic_storm", "stasis_field",
  "lair", "hive", "metabolic_boost", "lurker_aspect", "consume", "chitinous_plating",
]);
/** 처음 N기 이상 모였을 때 해설할 유닛 */
const NOTABLE_UNITS: Record<string, number> = {
  siege_tank: 3, science_vessel: 1, wraith: 3, dropship: 1, goliath: 6,
  dark_templar: 2, high_templar: 2, archon: 2, reaver: 1, corsair: 3, carrier: 3, arbiter: 1, observer: 1,
  mutalisk: 6, lurker: 3, ultralisk: 3, defiler: 1,
};

function completeJobs(gs: GameState, p: BwPlayer, dt: number) {
  const done: Job[] = [];
  for (const j of p.jobs) {
    j.remaining -= dt;
    if (j.remaining <= 0) done.push(j);
  }
  if (!done.length) return;
  p.jobs = p.jobs.filter(j => j.remaining > 0);
  for (const j of done) {
    if (j.producer) p.busy[j.producer] = Math.max(0, (p.busy[j.producer] ?? 0) - 1);
    if (j.kind === "worker") {
      p.workers += 1;
    } else if (j.kind === "unit") {
      p.units[j.key] = (p.units[j.key] ?? 0) + (j.count ?? 1);
      if (gs.feed && !p.announced.has("f:u:" + j.key)) { p.announced.add("f:u:" + j.key); emit(gs, { k: "unit", side: p.side as Side, key: j.key, count: p.units[j.key] }); }
      const th = NOTABLE_UNITS[j.key];
      if (th && !p.announced.has("u:" + j.key) && (p.units[j.key] ?? 0) >= th) {
        p.announced.add("u:" + j.key);
        say(gs, unitArrivalLine(p, j.key));
      }
    } else if (j.kind === "building") {
      p.pendingBuildings[j.key] = Math.max(0, (p.pendingBuildings[j.key] ?? 0) - 1);
      p.buildings[j.key] = (p.buildings[j.key] ?? 0) + 1;
      if (gs.feed && (p.buildings[j.key] ?? 0) <= 2) emit(gs, { k: "build", side: p.side as Side, key: j.key, count: p.buildings[j.key] });
      if (BUILDINGS[j.key].role === "gas") {
        const b = p.bases.find(x => x.gasPending && !x.hasGas && x.alive);
        if (b) { b.gasPending = false; b.hasGas = true; }
      }
      if (NOTABLE_BUILDINGS.has(j.key) && !p.announced.has("b:" + j.key)) {
        p.announced.add("b:" + j.key);
        say(gs, buildingLine(p, j.key));
      }
    } else if (j.kind === "tech") {
      p.pendingTechs.delete(j.key);
      p.techs.add(j.key);
      emit(gs, { k: "tech", side: p.side as Side, key: j.key });
      if (NOTABLE_TECHS.has(j.key)) say(gs, techLine(p, j.key));
    } else if (j.kind === "expand") {
      const resFactor = clamp((gs.mapTraits?.resources ?? 50) / 50, 0.7, 1.4);
      const idx = p.bases.length;
      p.bases.push({
        name: BASE_NAMES[Math.min(idx, BASE_NAMES.length - 1)],
        minerals: ECONOMY.baseMinerals * resFactor, gas: ECONOMY.baseGas * resFactor,
        hasGas: false, gasPending: false, alive: true, ready: true,
      });
      eventsOf(gs, p).push({ type: "multi_expansion", time: gs.time });
      emit(gs, { k: "expand", side: p.side as Side, idx });
      say(gs, `${p.name} 선수 ${p.bases[idx].name} ${nameOf(j.key)} 완성! 기지 ${townHalls(p)}개 체제입니다.`);
    }
  }
}

function spawnLarva(p: BwPlayer, dt: number) {
  if (p.race !== "zerg") return;
  p.larvaTimer += dt;
  while (p.larvaTimer >= ECONOMY.larvaInterval) {
    p.larvaTimer -= ECONOMY.larvaInterval;
    p.larva = Math.min(hatcheryCount(p) * ECONOMY.larvaMax, p.larva + hatcheryCount(p));
  }
}

// ══════════════════════════════════════════════════════════════
// 의사 결정 (매크로)
// ══════════════════════════════════════════════════════════════

function currentComp(gs: GameState, p: BwPlayer): Record<string, number> {
  const base = p.plan.lateTech && has(p, p.plan.lateTech) && p.plan.lateComp ? p.plan.lateComp : p.plan.comp;
  const comp: Record<string, number> = { ...base };
  const e = p.knownEnemy;
  const adapt = 0.6 + 0.4 * clamp(p.sk.strategy + 0.5, 0, 1.5);
  const add = (k: string, w: number) => { comp[k] = (comp[k] ?? 0) + w * adapt; };
  // 변태 유닛은 재료 유닛도 뽑아야 함 (럴커 ← 히드라, 아칸 ← 하이 템플러)
  if ((comp.lurker ?? 0) > 0 && p.techs.has("lurker_aspect") && (p.units.hydralisk ?? 0) < 2) comp.hydralisk = (comp.hydralisk ?? 0) + comp.lurker * 0.8;
  if ((comp.archon ?? 0) > 0 && !comp.high_templar) comp.high_templar = comp.archon * 0.8;
  const air = (e.mutalisk ?? 0) + (e.wraith ?? 0) * 1.2 + (e.carrier ?? 0) * 3 + (e.corsair ?? 0) * 0.6;
  if (p.race === "terran") {
    if ((e.mutalisk ?? 0) >= 6) { add("marine", 0.15); if (comp.goliath) add("goliath", 0.15); }
    if ((e.carrier ?? 0) >= 2) add("goliath", 0.4);
    if ((e.lurker ?? 0) >= 2) { add("siege_tank", 0.1); add("science_vessel", 0.06); }
    if ((e.ultralisk ?? 0) >= 2) add("siege_tank", 0.15);
    if ((e.wraith ?? 0) >= 3) add("goliath", 0.2);
  } else if (p.race === "protoss") {
    if ((e.mutalisk ?? 0) >= 6) { add("corsair", 0.15); add("archon", 0.1); add("dragoon", 0.1); }
    if ((e.lurker ?? 0) >= 2) { add("observer", 0.04); add("reaver", 0.06); }
    if ((e.siege_tank ?? 0) >= 6) add("zealot", 0.1);
    if ((e.wraith ?? 0) >= 3) add("dragoon", 0.15);
    if ((e.ultralisk ?? 0) >= 2) add("dragoon", 0.15);
  } else {
    if (air >= 6) { add("scourge", 0.12); add("hydralisk", 0.15); }
    if ((e.carrier ?? 0) >= 2) { add("scourge", 0.2); add("hydralisk", 0.25); }
    if ((e.siege_tank ?? 0) >= 5 && has(p, "hive")) add("ultralisk", 0.15);
    if ((e.zealot ?? 0) >= 8) add("lurker", 0.1);
    if ((e.marine ?? 0) >= 16) add("lurker", 0.1);
  }
  return comp;
}

function chooseUnit(gs: GameState, p: BwPlayer): string | null {
  const comp = currentComp(gs, p);
  let total = 0;
  const avail: Array<[string, number]> = [];
  for (const [k, w] of Object.entries(comp)) {
    if (w <= 0 || !unitProducible(p, k)) continue;
    avail.push([k, w]);
    total += w;
  }
  if (!avail.length) return null;
  const army = Math.max(1, armySupply(p) + p.jobs.filter(j => j.kind === "unit").reduce((s, j) => s + (j.supply ?? 0), 0));
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [k, w] of avail) {
    const d = UNITS[k];
    const inProd = p.jobs.filter(j => j.key === k).reduce((s, j) => s + (j.count ?? 1), 0);
    const share = (((p.units[k] ?? 0) + inProd) * d.supply) / army;
    const score = w / total - share + rand() * 0.05;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}

function wantedStatics(gs: GameState, p: BwPlayer): Record<string, number> {
  const e = enemyOf(gs, p);
  const bases = Math.max(1, townHalls(p));
  const w: Record<string, number> = {};
  const earlyThreat = p.knowsEnemyPlan && (e.plan.style === "cheese" || e.plan.style === "aggressive") && gs.time < 480;
  const enemyAir = (p.knownEnemy.mutalisk ?? 0) + (p.knownEnemy.wraith ?? 0) + (p.knownEnemy.carrier ?? 0) + (p.knownEnemy.corsair ?? 0) > 3;
  const cloakThreat = p.detectionUrgent || (p.knowsEnemyPlan && /dt|lurker/.test(e.plan.key));
  const defBias = 1 + Math.max(0, p.sk.defense) * 0.5;
  if (p.race === "terran") {
    if (earlyThreat || e.race === "zerg") w.bunker = 1;
    if (enemyAir || cloakThreat) w.missile_turret = Math.round(bases * 1.5 * defBias);
  } else if (p.race === "protoss") {
    if (e.race === "zerg") w.photon_cannon = Math.round((1 + (enemyAir ? bases * 1.2 : bases * 0.4)) * defBias);
    else if (enemyAir || cloakThreat) w.photon_cannon = Math.round(bases * defBias);
  } else {
    let sunken = 0;
    if (earlyThreat) sunken = 2;
    // 앞마당·3번째 멀티에 성큰 1~2개씩
    if (e.race === "terran" && gs.time > 240) sunken += Math.round(Math.max(1, bases - 1) * defBias);
    if (e.race === "protoss" && gs.time > 220) sunken += Math.round(Math.max(1, bases - 1) * 1.5 * defBias);
    if (sunken) w.sunken_colony = sunken;
    if (enemyAir) w.spore_colony = Math.round(bases * defBias);
  }
  return w;
}

function macroEfficiency(p: BwPlayer): number {
  // 자원이 풍부한 맵일수록 물량(운영) 능력치 차이가 크게 드러남
  return clamp(0.86 + 0.18 * p.sk.supply * (1 + 0.5 * p.terrain.rs), 0.6, 1.0);
}

function decide(gs: GameState, p: BwPlayer) {
  const reserve = { min: 0, gas: 0 };
  const roles = RACE_ROLES[p.race];

  // 1) 오프닝 빌드 오더 - 앞 단계가 선행 건물 완성을 기다리는 중이면 다음 단계를 먼저 진행
  for (let i = p.openingIdx; i < p.plan.opening.length && i < p.openingIdx + 3; i++) {
    if (p.openingDoneSteps.has(i)) continue;
    const [trigger, key] = p.plan.opening[i];
    if (supplyUsed(p) < trigger && gs.time < 240) break;
    const reqs = key === "expand" || key === "overlord" ? [] : BUILDINGS[key]?.requires ?? TECHS[key]?.requires ?? UNITS[key]?.requires ?? [];
    const techAt = TECHS[key]?.at;
    const waitingReq = !reqMet(p, reqs) || (techAt && techAt !== "hatchery" && techAt !== "command_center" && !has(p, techAt));
    if (waitingReq) {
      const pendingReq = reqs.some(r => (p.pendingBuildings[r] ?? 0) > 0 || p.pendingTechs.has(r)) || (techAt && (p.pendingBuildings[techAt] ?? 0) > 0);
      if (!pendingReq || gs.time > 420) p.openingDoneSteps.add(i); // 불가능한 단계는 건너뜀
      continue;
    }
    let ok = false;
    if (key === "expand") ok = tryExpand(gs, p, reserve);
    else if (key === "overlord") ok = trySupply(p, reserve);
    else if (BUILDINGS[key]) ok = tryBuilding(gs, p, key, reserve);
    else if (TECHS[key]) ok = tryTech(gs, p, key, reserve);
    else if (UNITS[key]) ok = tryUnit(gs, p, key, reserve);
    if (ok) {
      p.openingDoneSteps.add(i);
    } else {
      // 필요한 자원을 예약해 두고 다른 지출은 그 이후로
      const cost = key === "expand" ? BUILDINGS[roles.townhall] : (BUILDINGS[key] ?? TECHS[key] ?? UNITS[key]);
      if (cost) { reserve.min += cost.min ?? 0; reserve.gas += cost.gas ?? 0; }
      break;
    }
  }
  while (p.openingDoneSteps.has(p.openingIdx)) p.openingIdx++;
  // 오프닝은 4분 30초까지만 고집하고, 못 끝낸 단계는 테크 순서 앞으로 넘김
  if (p.openingIdx < p.plan.opening.length && gs.time >= 270) {
    const rest = p.plan.opening.filter((_, i) => i >= p.openingIdx && !p.openingDoneSteps.has(i)).map(([, k]) => k).filter(k => k !== "expand" && k !== "overlord" && !UNITS[k]);
    p.techQueue = [...rest.filter(k => !p.techQueue.includes(k)), ...p.techQueue];
    p.openingIdx = p.plan.opening.length;
  }
  const openingDone = p.openingIdx >= p.plan.opening.length;

  // 매크로 효율 (물량): 낮으면 생산 공백이 생김
  const focused = rand() < macroEfficiency(p);

  // 2) 인구수 관리
  const cap = supplyCap(p);
  const used = supplyUsed(p);
  if (cap < ECONOMY.supplyMax) {
    const productionRate = townHalls(p) + Object.entries(p.buildings).reduce((s, [k, c]) => s + (BUILDINGS[k]?.role === "producer" ? c * 2 : 0), 0) + (p.race === "zerg" ? hatcheryCount(p) * 2 : 0);
    const margin = 2 + productionRate;
    if (used + margin >= cap + pendingSupply(p) && (gs.time > 50 || used >= cap - 1)) {
      // 인구수 확보는 최우선 (예약 자원 무시). 물량 능력치가 낮으면 가끔 늦음
      const forget = rand() < clamp(0.15 - 0.12 * p.sk.supply, 0.02, 0.3);
      if (!forget || used >= cap) {
        trySupply(p, { min: 0, gas: 0 });
        if (used + margin >= cap + pendingSupply(p) + 8 && townHalls(p) >= 2) trySupply(p, { min: 0, gas: 0 });
      }
    }
  }
  if (used >= cap && cap < ECONOMY.supplyMax) {
    p.supplyBlockedTicks++;
    if (p.supplyBlockedTicks >= 3 && !p.blockAnnounced && gs.time > 180) {
      p.blockAnnounced = true;
      say(gs, `${p.name} 선수, 인구수가 막혔습니다! (${Math.round(used)}/${cap}) 생산이 잠시 멈춥니다.`);
    }
  } else {
    p.supplyBlockedTicks = 0;
    p.blockAnnounced = false;
  }

  // 3) 일꾼
  const wTarget = workerTarget(p, gs.time);
  const workersInProd = p.jobs.filter(j => j.kind === "worker").length;
  const enemy = enemyOf(gs, p);
  const underPressure = armyValue(enemy) > armyValue(p) * 1.6 && armySupply(enemy) > 12;
  if (p.workers + workersInProd < wTarget && (focused || gs.time < 180)) {
    if (p.race === "zerg") {
      // 애벌레 배분: 상대 병력(정찰 정보) 대비 내 병력이 부족하면 병력 우선, 여유가 있으면 드론
      const knownEnemyValue = Object.entries(p.knownEnemy).reduce((s2, [k, c]) => s2 + (UNITS[k] && isCombat(UNITS[k]) ? (UNITS[k].min + UNITS[k].gas * 1.2) * c : 0), 0);
      // 성큰 등 방어 건물도 방어력으로 계산 (저그는 성큰+소수 병력으로 버티며 드론을 늘림)
      const staticValue = ((p.buildings.sunken_colony ?? 0) + (p.buildings.spore_colony ?? 0) * 0.5) * 260;
      const safety = (knownEnemyValue || armyValue(enemy)) * (0.55 + 0.1 * p.sk.sense) - armyValue(p) - staticValue;
      // 시간대별 드론 비중 (프로 3해처리 운영 기준: 6분 전후 40기 안팎에서 병력 전환)
      const timeShare = gs.time < 300 ? 0.85 : gs.time < 390 ? 0.55 : gs.time < 600 ? 0.35 : 0.25;
      // 시간대별 최소 방어 병력 (저글링·히드라 소수 + 성큰)
      const minArmy = enemy.race === "zerg" ? 0 : gs.time < 200 ? 0 : gs.time < 330 ? 3 : gs.time < 450 ? 7 : 12;
      const thinArmy = armySupply(p) + (p.buildings.sunken_colony ?? 0) * 2 < minArmy;
      let droneShare = underPressure ? 0.1 : safety > 300 && gs.time > 240 ? Math.min(0.25, timeShare) : p.plan.style === "greedy" ? Math.min(0.9, timeShare + 0.15) : timeShare;
      if (thinArmy) droneShare = Math.min(droneShare, 0.35);
      let n = Math.floor(p.larva * droneShare + (rand() < 0.5 ? 1 : 0));
      if (!openingDone && safety < 300) n = p.larva;
      while (n-- > 0 && p.workers + p.jobs.filter(j => j.kind === "worker").length < wTarget && tryWorker(p, reserve)) { /* 드론 생산 */ }
    } else {
      let n = townHalls(p);
      while (n-- > 0 && tryWorker(p, reserve)) { /* 일꾼 생산 */ }
    }
  }

  if (!openingDone) {
    // 상대 치즈/초반 러쉬를 정찰했다면 오프닝 중에도 방어 건물과 병력을 먼저 준비
    const earlyThreat = p.knowsEnemyPlan && (enemy.plan.style === "cheese" || enemy.plan.style === "aggressive") && gs.time < 360;
    if (earlyThreat) {
      for (const [k, n] of Object.entries(wantedStatics(gs, p))) {
        if ((p.buildings[k] ?? 0) + (p.pendingBuildings[k] ?? 0) < n) { tryBuilding(gs, p, k, { min: 0, gas: 0 }); break; }
      }
    }
    // 오프닝 중에도 생산 건물은 쉬지 않고 병력 생산 (저그는 드론 우선, 자원이 남거나 위협이 있을 때 병력)
    const zergIdle = p.race === "zerg" && p.minerals - reserve.min > 250;
    if (p.race !== "zerg" || zergIdle || p.plan.style === "cheese" || p.plan.style === "aggressive" || underPressure || earlyThreat) {
      produceArmy(gs, p, earlyThreat ? { min: 0, gas: 0 } : reserve, focused || earlyThreat);
    }
    return;
  }

  // 4) 멀티
  const bases = townHalls(p) + p.jobs.filter(j => j.kind === "expand").length;
  const senseShift = 1 - 0.12 * p.sk.sense;
  let targetBases = 1;
  for (const [t, n] of p.plan.expand) if (gs.time >= t * senseShift) targetBases = n;
  const mainLow = aliveBases(p).filter(b => b.minerals > 1500).length < 2 && gs.time > 540;
  if (mainLow) targetBases = Math.max(targetBases, townHalls(p) + 1);
  if (underPressure && gs.time < 600) targetBases = Math.min(targetBases, townHalls(p));
  if (bases < targetBases && bases < 7) {
    if (!tryExpand(gs, p, reserve)) {
      // 멀티 자금은 일부만 모아둠 (병력 생산을 완전히 멈추지 않음)
      reserve.min += BUILDINGS[roles.townhall].min * 0.4;
    }
  }

  // 가스 건물: 시간에 따라 늘림 (4분 전 1개, 7분 전 2개, 이후 기지마다)
  const gasCount = p.bases.filter(b => b.alive && (b.hasGas || b.gasPending)).length;
  const gasTarget = Math.min(townHalls(p), gs.time < 240 ? 1 : gs.time < 420 ? 2 : townHalls(p));
  if (gs.time > 120 && gasCount < gasTarget && !p.bases.some(b => b.gasPending) && p.workers >= 14) {
    tryBuilding(gs, p, roles.gas, reserve);
  }

  // 5) 탐지 긴급 대응
  if (p.detectionUrgent) {
    // 탐지 수단은 병렬로 최우선 확보 (테란: 엔베·터렛 + 아카데미·컴샛, 프로토스: 포지·캐논 + 로보·옵저버토리)
    const paths = p.race === "terran" ? [["engineering_bay", "missile_turret"], ["academy", "comsat"]] : p.race === "protoss" ? [["forge", "photon_cannon"], ["robotics_facility", "observatory"]] : [];
    for (const path of paths) {
      for (const k of path) {
        if (k !== "missile_turret" && k !== "photon_cannon" && (has(p, k) || (p.pendingBuildings[k] ?? 0) > 0 || p.pendingTechs.has(k))) continue;
        if ((k === "missile_turret" || k === "photon_cannon") && (p.buildings[k] ?? 0) + (p.pendingBuildings[k] ?? 0) >= townHalls(p)) break;
        if (BUILDINGS[k]) tryBuilding(gs, p, k, { min: 0, gas: 0 }); else tryTech(gs, p, k, { min: 0, gas: 0 });
        break;
      }
    }
    if (p.race === "protoss" && has(p, "observatory") && (p.units.observer ?? 0) < 2) tryUnit(gs, p, "observer", reserve);
    if (p.race === "terran" && (has(p, "comsat") || (p.units.science_vessel ?? 0) > 0)) p.detectionUrgent = false;
    if (p.race === "protoss" && (p.units.observer ?? 0) > 0) p.detectionUrgent = false;
    if (p.race === "zerg") p.detectionUrgent = false;
  }

  // 6) 테크 트리 (전략 능력치가 낮으면 테크가 늦어짐). 동시 연구/테크 건물은 1~2개까지만
  const techInFlight = p.pendingTechs.size + p.plan.tech.filter(k => BUILDINGS[k] && (p.pendingBuildings[k] ?? 0) > 0).length;
  const maxInFlight = gs.time < 480 ? 1 : 2;
  if (techInFlight < maxInFlight && rand() < clamp(0.75 + 0.2 * p.sk.strategy, 0.4, 0.98)) {
    // 선행 조건 중 없는 건물/연구가 있으면 먼저 확보 (예: 컴샛 ← 아카데미)
    const firstMissingReq = (key: string): string | null => {
      const reqs = BUILDINGS[key]?.requires ?? TECHS[key]?.requires ?? [];
      const at = TECHS[key]?.at;
      const all = at && at !== "hatchery" && at !== "command_center" ? [...reqs, at] : reqs;
      for (const r of all) {
        if (has(p, r) || (p.pendingBuildings[r] ?? 0) > 0 || p.pendingTechs.has(r)) continue;
        return firstMissingReq(r) ?? r;
      }
      return null;
    };
    for (const k0 of p.techQueue) {
      if (k0 === "expand") continue;
      const done = TECHS[k0] ? p.techs.has(k0) || p.pendingTechs.has(k0) : has(p, k0) || (p.pendingBuildings[k0] ?? 0) > 0;
      const k = done ? k0 : firstMissingReq(k0) ?? k0;
      if (TECHS[k]) {
        if (p.techs.has(k) || p.pendingTechs.has(k)) continue;
        if (!tryTech(gs, p, k, reserve)) {
          // 다음 테크가 가능한 상태면 가스를 모아둠 (미네랄 유닛 생산은 계속)
          const d = TECHS[k];
          const atOk = d.at === "hatchery" || d.at === "command_center" ? townHalls(p) > 0 : has(p, d.at);
          if (atOk && reqMet(p, d.requires) && rand() < 0.65) reserve.gas += d.gas;
        }
        break;
      }
      if (BUILDINGS[k]) {
        if (k === roles.gas) {
          if (aliveBases(p).every(b => b.hasGas || b.gasPending || b.gas <= 0)) continue;
          tryBuilding(gs, p, k, reserve);
          break;
        }
        if (has(p, k) || (p.pendingBuildings[k] ?? 0) > 0) continue;
        if (!tryBuilding(gs, p, k, reserve)) {
          const d = BUILDINGS[k];
          if (reqMet(p, d.requires) && rand() < 0.65) reserve.gas += d.gas;
        }
        break;
      }
    }
  }

  // 7) 생산 건물
  for (const [k, perBase] of Object.entries(p.plan.producers)) {
    const def = BUILDINGS[k];
    if (!def || !reqMet(p, def.requires)) continue;
    const have = (p.buildings[k] ?? 0) + (p.pendingBuildings[k] ?? 0);
    const want = Math.min(p.plan.producerMax[k] ?? 10, Math.max(1, Math.round(perBase * Math.max(1, townHalls(p)))));
    if (k === "hatchery" && gs.time < 300) continue;
    // 가스가 드는 생산 건물은 가스 여유가 있을 때만 (유닛 생산 가스 우선)
    if (def.gas > 0 && gs.time > 300 && p.gas - reserve.gas < def.gas + 100) continue;
    if (have < want && p.minerals - reserve.min > def.min + 150) tryBuilding(gs, p, k, reserve);
  }
  // 탱크가 필요하면 팩토리마다 머신 샵
  if ((currentComp(gs, p).siege_tank ?? 0) > 0 && has(p, "factory")) {
    const shops = (p.buildings.machine_shop ?? 0) + (p.pendingBuildings.machine_shop ?? 0);
    if (shops < Math.ceil((p.buildings.factory ?? 0) * 0.7)) tryBuilding(gs, p, "machine_shop", reserve);
  }

  // 8) 방어 건물
  for (const [k, n] of Object.entries(wantedStatics(gs, p))) {
    const have = (p.buildings[k] ?? 0) + (p.pendingBuildings[k] ?? 0);
    if (have < n) { tryBuilding(gs, p, k, reserve); break; }
  }

  // 9) 병력
  produceArmy(gs, p, reserve, focused);
}

/** 종족별 가스 없이 뽑는 기본 유닛 / 생산 건물 (미네랄이 남을 때 소진용) */
const MINERAL_SINK: Record<Race, { unit: string; producer: string }> = {
  terran: { unit: "marine", producer: "barracks" },
  protoss: { unit: "zealot", producer: "gateway" },
  zerg: { unit: "zergling", producer: "hatchery" },
};

function mineralSink(p: BwPlayer, enemyRace: Race) {
  // 테란 메카닉(프로토스·테란 상대)은 팩토리가 비어 있으면 벌처, 아니면 마린 (배럭은 가스 불필요)
  if (p.race === "terran" && enemyRace !== "zerg" && freeProducers(p, "factory") > 0) return { unit: "vulture", producer: "barracks" };
  return MINERAL_SINK[p.race];
}

function addProductionIfFloating(gs: GameState, p: BwPlayer, reserve: { min: number; gas: number }) {
  const bank = p.minerals - reserve.min;
  if (bank < 450 || gs.time < 150) return;
  // 미네랄이 크게 남으면 멀티를 앞당김
  if (bank >= 700 && gs.time > 270 && townHalls(p) < 5 && !p.jobs.some(j => j.kind === "expand")) {
    if (tryExpand(gs, p, reserve)) return;
  }
  if (p.race === "zerg") {
    if (p.larva === 0 && (p.buildings.hatchery ?? 0) + (p.pendingBuildings.hatchery ?? 0) < (p.plan.producerMax.hatchery ?? 3) && !p.pendingBuildings.hatchery) {
      tryBuilding(gs, p, "hatchery", reserve);
    }
    return;
  }
  // 가장 많이 쓰는 생산 건물을 추가 (가스가 부족하면 미네랄만 드는 생산 건물)
  const entries = Object.entries(p.plan.producers).sort((a, b) => b[1] - a[1]);
  for (const [k] of entries) {
    const def = BUILDINGS[k];
    if (!def || !reqMet(p, def.requires)) continue;
    const have = (p.buildings[k] ?? 0) + (p.pendingBuildings[k] ?? 0);
    if (have >= (p.plan.producerMax[k] ?? 10) || (p.pendingBuildings[k] ?? 0) > 0) continue;
    if (tryBuilding(gs, p, k, reserve)) return;
  }
  const sink = mineralSink(p, enemyOf(gs, p).race);
  if (bank >= 600 && (p.buildings[sink.producer] ?? 0) + (p.pendingBuildings[sink.producer] ?? 0) < 12 && !(p.pendingBuildings[sink.producer] ?? 0)) {
    tryBuilding(gs, p, sink.producer, reserve);
  }
}

function produceArmy(gs: GameState, p: BwPlayer, reserve: { min: number; gas: number }, focused: boolean) {
  if (!focused) return;
  let guard = 0;
  while (guard++ < 40) {
    const k = chooseUnit(gs, p);
    if (!k || !tryUnit(gs, p, k, reserve)) {
      // 선택한 유닛이 비싸면 다른 유닛으로라도 생산 (예: 가스 부족 → 미네랄 유닛)
      let fallback = Object.keys(currentComp(gs, p)).find(u => u !== k && UNITS[u]?.gas === 0 && unitProducible(p, u));
      // 가스가 모자라 미네랄이 쌓이면 종족 기본 유닛으로 소진
      const sinkUnit = mineralSink(p, enemyOf(gs, p).race).unit;
      if (!fallback && p.minerals - reserve.min > 350 && unitProducible(p, sinkUnit)) fallback = sinkUnit;
      if (!fallback || !tryUnit(gs, p, fallback, reserve)) break;
    }
  }
  addProductionIfFloating(gs, p, reserve);
  // 아칸 합체
  if (p.race === "protoss" && (currentComp(gs, p).archon ?? 0) > 0 && (p.units.high_templar ?? 0) >= 4) tryUnit(gs, p, "archon", reserve);
}

// ══════════════════════════════════════════════════════════════
// 정찰
// ══════════════════════════════════════════════════════════════

function scouting(gs: GameState, p: BwPlayer) {
  const e = enemyOf(gs, p);
  if (!p.scouted && gs.time >= 80) {
    p.scouted = true;
    const chance = clamp(0.45 + 0.35 * p.sk.scout, 0.15, 0.95);
    if (rand() < chance) {
      p.knowsEnemyPlan = true;
      eventsOf(gs, p).push({ type: "scouting_success", time: gs.time });
      const seen = Object.entries(e.buildings).filter(([, c]) => c > 0).map(([k]) => nameOf(k));
      const pending = Object.entries(e.pendingBuildings).filter(([, c]) => c > 0).map(([k]) => nameOf(k) + "(건설 중)");
      const exp = e.jobs.some(j => j.kind === "expand") || e.bases.length > 1;
      const what = [...seen, ...pending].slice(0, 3).join(", ");
      say(gs, `${p.name} 선수 ${workerName(p)} 정찰 성공! ${e.name} 선수의 ${what || "본진"}${exp ? ", 빠른 앞마당" : ""}을 확인합니다.`);
      if (e.plan.style === "cheese") say(gs, `${p.name} 선수, 상대의 ${e.plan.name}을(를) 읽었습니다! 방어 준비에 들어갑니다.`);
    } else {
      eventsOf(gs, p).push({ type: "scouting_failure", time: gs.time });
      if (e.plan.style === "cheese" || e.plan.key.includes("dt")) say(gs, `${p.name} 선수의 정찰이 늦었습니다. 상대 빌드를 확인하지 못했어요.`);
    }
  }
  // 중후반 정보 (컴샛·옵저버·오버로드 정찰 / 교전으로 파악)
  if (gs.turn % 3 === 0 && rand() < clamp(0.5 + 0.35 * p.sk.scout, 0.2, 0.95)) {
    p.knownEnemy = { ...e.units };
  }
}

// ══════════════════════════════════════════════════════════════
// 교전
// ══════════════════════════════════════════════════════════════

/** 종족전 밸런스 보정 (같은 능력치에서 종족전 승률이 50%에 가깝도록 시뮬레이션으로 산출) */
export const RACE_BALANCE: Record<string, number> = {
  terran_protoss: 1.053, protoss_terran: 0.951,
  terran_zerg: 1.008, zerg_terran: 0.994,
  protoss_zerg: 0.937, zerg_protoss: 1.065,
};

interface Fighter { key: string; count: number; hp: number; size: "small" | "medium" | "large"; air: boolean; gDps: number; aDps: number; dmg: "normal" | "explosive" | "concussive"; splash: number; cloaked: boolean; bio: boolean; isStatic?: boolean; isWorker?: boolean; race: Race; }

function hasDetection(p: BwPlayer, defending: boolean): boolean {
  if (p.race === "terran") return p.techs.has("comsat") || (p.units.science_vessel ?? 0) > 0 || (defending && (p.buildings.missile_turret ?? 0) > 0);
  if (p.race === "protoss") return (p.units.observer ?? 0) > 0 || (defending && (p.buildings.photon_cannon ?? 0) > 0);
  return (p.units.overlord ?? 0) > 0 || (defending && (p.buildings.spore_colony ?? 0) > 0);
}

function upgradeLevel(p: BwPlayer, key: string): number {
  const d = UNITS[key];
  if (!d) return 0;
  if (p.race === "terran") return d.bio ? (p.techs.has("t_infantry_weapons") ? 1 : 0) : (p.techs.has("t_vehicle_weapons") ? 1 : 0);
  if (p.race === "protoss") return !d.air && p.techs.has("p_ground_weapons") ? 1 : 0;
  const melee = key === "zergling" || key === "ultralisk";
  return melee ? (p.techs.has("z_melee_attacks") ? 1 : 0) : (p.techs.has("z_missile_attacks") ? 1 : 0);
}

function buildFighters(p: BwPlayer, units: Record<string, number>, staticShare: number, workers: number): Fighter[] {
  const list: Fighter[] = [];
  for (const [k, c] of Object.entries(units)) {
    const d = UNITS[k];
    if (!d || c <= 0 || d.worker || d.support) continue;
    let g = d.gDps, a = d.aDps, hp = d.hp, splash = d.splash ?? 0;
    const up = 1 + 0.08 * upgradeLevel(p, k);
    g *= up; a *= up;
    if ((k === "marine" || k === "firebat") && p.techs.has("stim")) { g *= 1.45; a *= 1.45; }
    if (k === "marine" && p.techs.has("u238")) { g *= 1.1; a *= 1.1; }
    if (k === "siege_tank" && p.techs.has("siege_mode")) { g = 30 * up; splash = 1.1; }
    if (k === "vulture" && p.techs.has("spider_mines")) g *= 1.35;
    if (k === "goliath" && p.techs.has("charon_boosters")) a *= 1.25;
    if (k === "zealot" && p.techs.has("leg_enhancements")) g *= 1.2;
    if (k === "dragoon" && p.techs.has("singularity_charge")) { g *= 1.3; a *= 1.3; }
    if (k === "zergling") { if (p.techs.has("metabolic_boost")) g *= 1.25; if (p.techs.has("adrenal_glands")) g *= 1.3; }
    if (k === "hydralisk" && p.techs.has("hydra_upgrades")) { g *= 1.2; a *= 1.2; }
    if (k === "ultralisk" && p.techs.has("chitinous_plating")) hp *= 1.35;
    list.push({ key: k, count: c / 1, hp, size: d.size, air: d.air, gDps: g, aDps: a, dmg: d.dmg, splash, cloaked: !!d.cloaked, bio: !!d.bio, race: p.race });
  }
  if (staticShare > 0) {
    for (const [k, c] of Object.entries(p.buildings)) {
      const d = BUILDINGS[k];
      if (!d?.defense || c <= 0) continue;
      const n = c * staticShare;
      if (n < 0.3) continue;
      if (k === "bunker" && (units.marine ?? 0) < 4) continue;
      list.push({ key: k, count: n, hp: d.defense.hp, size: "large", air: false, gDps: d.defense.gDps, aDps: d.defense.aDps, dmg: d.defense.dmg, splash: 0, cloaked: false, bio: false, isStatic: true, race: p.race });
    }
  }
  if (workers > 0) {
    const w = UNITS[RACE_ROLES[p.race].worker];
    list.push({ key: w.key, count: workers, hp: w.hp, size: "small", air: false, gDps: w.gDps, aDps: 0, dmg: "normal", splash: 0, cloaked: false, bio: true, isWorker: true, race: p.race });
  }
  return list;
}

interface SideResult { strength: number; dps: number; hp: number }

function sideStrength(me: BwPlayer, mine: Fighter[], enemy: BwPlayer, theirs: Fighter[], meDefending: boolean, enemyDefending: boolean, mapAdv: number): SideResult {
  const enemyDetects = hasDetection(enemy, enemyDefending);
  const targets = theirs.filter(t => !(t.cloaked && !hasDetection(me, meDefending)));
  const tGround = targets.filter(t => !t.air);
  const tAir = targets.filter(t => t.air);
  const hpG = tGround.reduce((s, t) => s + t.hp * t.count, 0);
  const hpA = tAir.reduce((s, t) => s + t.hp * t.count, 0);
  const countG = tGround.reduce((s, t) => s + t.count, 0);
  const countA = tAir.reduce((s, t) => s + t.count, 0);
  const smallMedG = hpG > 0 ? tGround.filter(t => t.size !== "large").reduce((s, t) => s + t.hp * t.count, 0) / hpG : 0;
  const smallMedA = hpA > 0 ? tAir.filter(t => t.size !== "large").reduce((s, t) => s + t.hp * t.count, 0) / hpA : 0;

  // 근접 유닛은 원거리 유닛 무리에 달라붙는 동안 손해 (특히 스팀 바이오닉·드라군 상대로)
  const enemyRangedShare = theirs.filter(t => !t.isStatic && !t.isWorker).reduce((s, t) => s + (UNITS[t.key]?.ranged ? t.hp * t.count : 0), 0)
    / Math.max(1, theirs.filter(t => !t.isStatic && !t.isWorker).reduce((s, t) => s + t.hp * t.count, 0));
  const MELEE: Record<string, number> = { zergling: 0.72, zealot: 0.8, firebat: 0.85, dark_templar: 0.9, ultralisk: 0.9, scv: 0.6, probe: 0.6, drone: 0.6 };

  let dps = 0;
  for (const f of mine) {
    const canG = f.gDps > 0 && hpG > 0;
    const canA = f.aDps > 0 && hpA > 0;
    const totalHp = (canG ? hpG : 0) + (canA ? hpA : 0);
    if (totalHp <= 0) continue;
    let unitDps = 0;
    if (canG) {
      let m = 0;
      for (const t of tGround) m += (t.hp * t.count / totalHp) * damageMultiplier(f.dmg, t.size);
      unitDps += f.gDps * m * (1 + f.splash * smallMedG * Math.min(1, countG / 12));
    }
    if (canA) {
      let m = 0;
      for (const t of tAir) m += (t.hp * t.count / totalHp) * damageMultiplier(f.dmg, t.size);
      unitDps += f.aDps * m * (1 + f.splash * smallMedA * Math.min(1, countA / 10));
    }
    if (f.cloaked && !enemyDetects) unitDps *= 2.2;
    const melee = MELEE[f.key];
    // 복잡한 지형(좁은 길목)에서는 근접 유닛이 더 불리, 넓은 맵에서는 덜 불리
    if (melee) unitDps *= 1 - (1 - melee) * enemyRangedShare * (1 + 0.5 * me.terrain.cx);
    // 시즈 탱크: 긴 사거리로 먼저 포격 (수비 시 시즈 라인은 특히 강력, 언덕·길목이 많을수록 더)
    if (f.key === "siege_tank" && me.techs.has("siege_mode")) unitDps *= (meDefending ? 1.7 : 1.3) * (1 + 0.15 * me.terrain.cx);
    dps += unitDps * f.count;
  }

  // 순간 피해 (교전 약 20초 기준): 스파이더 마인
  if (me.techs.has("spider_mines") && (me.units.vulture ?? 0) > 0 && hpG > 0) {
    const mineTargets = tGround.filter(t => !t.isStatic && t.key !== "vulture").reduce((s, t) => s + t.hp * t.count * damageMultiplier("explosive", t.size), 0) / Math.max(1, hpG);
    dps += (me.units.vulture ?? 0) * 11 * mineTargets * (meDefending ? 1.3 : 0.8) * (1 + 0.3 * me.sk.control);
  }

  // 사이오닉 스톰: 뭉친 소형·중형 유닛에 큰 피해
  if (me.techs.has("psionic_storm") && (me.units.high_templar ?? 0) > 0) {
    const bioShare = targets.filter(t => t.size !== "large" && !t.isStatic).reduce((s, t) => s + t.hp * t.count, 0) / Math.max(1, hpG + hpA);
    dps += (me.units.high_templar ?? 0) * 40 * (1 + 0.2 * me.terrain.cx) * bioShare * Math.min(1, (countG + countA) / 12) * (1 + 0.3 * me.sk.control);
  }

  let hp = mine.reduce((s, f) => s + f.hp * f.count, 0);
  // 메딕 치료
  const bioHp = mine.filter(f => f.bio && !f.isWorker).reduce((s, f) => s + f.hp * f.count, 0);
  if ((me.units.medic ?? 0) > 0 && bioHp > 0) {
    const bioCount = mine.filter(f => f.bio && !f.isWorker).reduce((s, f) => s + f.count, 0);
    hp += bioHp * 0.45 * Math.min(1, (me.units.medic ?? 0) * 4 / Math.max(1, bioCount));
  }
  // 적 스킬 영향
  const vessels = enemy.units.science_vessel ?? 0;
  if (vessels > 0 && me.race === "zerg" && enemy.techs.has("irradiate")) hp *= 1 - Math.min(0.3, vessels * 0.05);
  if (vessels > 0 && me.race === "protoss" && enemy.techs.has("emp")) hp *= 1 - Math.min(0.28, vessels * 0.05);
  const defilers = enemy.units.defiler ?? 0;
  if (defilers > 0 && me.race === "terran" && enemy.techs.has("consume")) {
    // 다크 스웜: 원거리 지상 공격이 막힘
    const rangedShare = mine.filter(f => !f.air && UNITS[f.key]?.ranged).reduce((s, f) => s + f.gDps * f.count, 0) / Math.max(1, mine.reduce((s, f) => s + f.gDps * f.count, 0));
    dps *= 1 - rangedShare * Math.min(0.6, defilers * 0.2);
  }
  const arbiters = me.units.arbiter ?? 0;
  if (arbiters > 0) dps *= 1 + Math.min(0.2, arbiters * 0.07);

  // 능력치/지형 보정
  // 컨트롤(교전 운영) + 전략(교전 장소·타이밍 선택) + 정찰(상대 병력 파악) + 센스
  // 복잡한 맵일수록 컨트롤, 넓은 맵일수록 병력 규모가 중요
  const t = me.terrain;
  let mul = clamp(1 + 0.13 * me.sk.control * (1 + 0.4 * t.cx) + 0.05 * me.sk.strategy + 0.04 * me.sk.scout + 0.03 * me.sk.sense, 0.75, 1.4);
  // 자기 기지 수비: 방어 건물·증원 병력·지형 이점 (러쉬거리가 멀수록 수비 측 증원이 빠름)
  if (meDefending) mul *= clamp(1 + 0.14 * me.sk.defense * (1 + 0.3 * t.rd), 0.85, 1.25) * (1.2 + 0.06 * t.rd);
  else mul *= clamp(1 + 0.1 * me.sk.attack * (1 - 0.4 * t.rd), 0.88, 1.2);
  if (meDefending && me.techs.has("siege_mode")) mul *= 1 + Math.min(0.25, (me.units.siege_tank ?? 0) * 0.03);
  if (meDefending && (me.units.lurker ?? 0) > 0) mul *= 1 + Math.min(0.2, (me.units.lurker ?? 0) * 0.03);
  mul *= mapAdv * (me.plan.power ?? 1) * (RACE_BALANCE[`${me.race}_${enemy.race}`] ?? 1);
  // 컨트롤·위치 선정 등 교전의 변수
  mul *= 0.8 + rand() * 0.4;
  return { strength: dps * mul * hp, dps: dps * mul, hp };
}

function applyLosses(p: BwPlayer, fighters: Fighter[], frac: number, enemy: BwPlayer, enemyDefending: boolean): { lost: Record<string, number>; workers: number } {
  const lost: Record<string, number> = {};
  let workers = 0;
  const enemyHasAA = enemy.race === "zerg" ? ["hydralisk", "mutalisk", "scourge"].some(k => (enemy.units[k] ?? 0) > 0) || (enemyDefending && (enemy.buildings.spore_colony ?? 0) > 0)
    : enemy.race === "terran" ? ["marine", "goliath", "wraith"].some(k => (enemy.units[k] ?? 0) > 0) || (enemyDefending && (enemy.buildings.missile_turret ?? 0) > 0)
    : ["dragoon", "archon", "corsair", "carrier"].some(k => (enemy.units[k] ?? 0) > 0) || (enemyDefending && (enemy.buildings.photon_cannon ?? 0) > 0);
  const enemyDetects = hasDetection(enemy, enemyDefending);
  for (const f of fighters) {
    if (f.air && !enemyHasAA) continue;
    if (f.cloaked && !enemyDetects) continue;
    const jitter = 0.8 + rand() * 0.4;
    const n = Math.min(f.count, Math.round(f.count * frac * jitter));
    if (n <= 0) continue;
    if (f.isStatic) {
      const k = f.key;
      const destroyed = Math.min(p.buildings[k] ?? 0, Math.round(n));
      p.buildings[k] = (p.buildings[k] ?? 0) - destroyed;
      if (destroyed) lost[k] = destroyed;
    } else if (f.isWorker) {
      workers += n;
      p.workers = Math.max(0, p.workers - n);
      p.workersLost += n;
    } else {
      p.units[f.key] = Math.max(0, (p.units[f.key] ?? 0) - n);
      lost[f.key] = n;
    }
  }
  return { lost, workers };
}

function lossText(lost: Record<string, number>): string {
  const parts = Object.entries(lost)
    .filter(([, n]) => n > 0)
    .sort((a, b) => (b[1] * (UNITS[b[0]]?.supply ?? 1)) - (a[1] * (UNITS[a[0]]?.supply ?? 1)))
    .slice(0, 3)
    .map(([k, n]) => `${nameOf(k)} ${Math.round(n)}`);
  return parts.join(", ");
}

function mapAdvantage(gs: GameState, p: BwPlayer): number {
  const adv = gs.mapRaceAdvantage?.[p.race];
  if (typeof adv !== "number" || adv <= 0) return 1;
  // 맵 테이블 값(예: 0.9 ~ 1.1)을 완만하게 반영
  // 교전 결과는 배율에 민감하므로 아주 완만하게 반영 (유리 종족 약 60~65%)
  return adv > 3 ? 1 + (adv - 50) / 2000 : 1 + (adv - 1) * 0.1;
}

/**
 * 교전 처리. attacker 가 defender 의 기지(targetIdx)를 공격, targetIdx = -1 이면 중앙 교전
 */
function battle(gs: GameState, attacker: BwPlayer, defender: BwPlayer, targetIdx: number) {
  const field = targetIdx < 0;
  const target = field ? null : defender.bases[targetIdx];
  // 방어 건물: 본진은 일부, 나머지는 멀티들에 고르게 배치된 것으로 계산
  const nonMain = Math.max(1, defender.bases.filter((b, i) => i > 0 && b.alive && b.ready).length);
  const staticShare = field ? 0 : targetIdx === 0 ? 0.35 : Math.min(0.8, 1 / nonMain);
  // 초반 러쉬는 일꾼까지 동원해서 막음 (본진·앞마당)
  const workerPull = !field && gs.time < 360 && targetIdx <= 1 ? Math.min(defender.workers, targetIdx === 0 ? 12 : 8) : 0;
  const attackUnits = { ...attacker.units };
  const defendUnits = { ...defender.units };
  const aF = buildFighters(attacker, attackUnits, 0, 0);
  const dF = buildFighters(defender, defendUnits, staticShare, workerPull);
  if (!aF.length) return;

  const beforeA = armySupply(attacker);
  const beforeD = armySupply(defender);
  const where = field ? "중앙" : `${defender.name} 선수의 ${target!.name}`;
  emit(gs, { k: "attack", side: attacker.side as Side, units: { ...attackUnits }, vs: { ...defendUnits }, target: targetIdx, early: workerPull > 0 });
  say(gs, `${attacker.name} 선수 공격! ${composition(attackUnits)} 병력이 ${where}으로 진격합니다. (상대 ${composition(defendUnits, 3)})`);

  const sa = sideStrength(attacker, aF, defender, dF, false, !field, mapAdvantage(gs, attacker));
  const sd = sideStrength(defender, dF, attacker, aF, !field, false, mapAdvantage(gs, defender));

  // 역전의 한타: 병력이 밀리는 쪽이 위치 선정·컨트롤로 싸움을 뒤집는 경우 (센스·전략·컨트롤이 높을수록 자주)
  const aUnder = sa.strength < sd.strength;
  const under = aUnder ? attacker : defender;
  const ratio = Math.min(sa.strength, sd.strength) / Math.max(1, Math.max(sa.strength, sd.strength));
  let upset = false;
  if (ratio > 0.3 && gs.time > 300) {
    const chance = clamp(0.24 + 0.08 * (under.sk.sense + under.sk.strategy) + 0.05 * under.sk.control, 0.08, 0.36) * (ratio > 0.55 ? 1 : 0.7);
    if (rand() < chance) {
      upset = true;
      const boost = 1.4 + rand() * 0.7;
      if (aUnder) sa.strength *= boost; else sd.strength *= boost;
    }
  }

  const attackerWins = sa.strength >= sd.strength;
  const r = Math.min(sa.strength, sd.strength) / Math.max(1, Math.max(sa.strength, sd.strength));
  // 이긴 쪽도 상당한 손실을 입는다 (한 번 이겼다고 바로 끝나지 않도록)
  const winnerLoss = clamp(1 - Math.sqrt(Math.max(0, 1 - r)), 0.15, 0.92);
  const winner = attackerWins ? attacker : defender;
  const loser = attackerWins ? defender : attacker;
  const retreatSkill = clamp(0.5 + 0.35 * loser.sk.control + 0.25 * loser.sk.sense, 0, 1);
  // 수비하다 진 쪽은 기지를 지키느라 거의 전멸, 공격하다 진 쪽은 컨트롤·센스에 따라 후퇴로 일부 보존
  const loserLoss = attackerWins && !field
    ? clamp(0.8 + 0.15 * (1 - r) - 0.2 * retreatSkill, 0.5, 0.95)
    : clamp(0.85 - 0.3 * retreatSkill - 0.2 * r, 0.4, 0.9);

  const wF = attackerWins ? aF : dF;
  const lF = attackerWins ? dF : aF;
  applyLosses(winner, wF, winnerLoss, loser, attackerWins && !field);
  const lRes = applyLosses(loser, lF, loserLoss, winner, !attackerWins && !field);

  const winSide = winner.side;
  gs.player1Events.push({ type: "engagement", winner: winSide, time: gs.time });
  gs.player2Events.push({ type: "engagement", winner: winSide, time: gs.time });
  for (const pl of [attacker, defender]) pl.knownEnemy = { ...enemyOf(gs, pl).units };

  const lostA = beforeA - armySupply(attacker);
  const lostD = beforeD - armySupply(defender);
  const closeFight = r > 0.8;
  const winLine = closeFight ? "치열한 접전 끝에" : r < 0.35 ? "압도적으로" : "";
  emit(gs, {
    k: "fight", winner: winner.side as Side, attacker: attacker.side as Side,
    winUnits: { ...(attackerWins ? attackUnits : defendUnits) }, loseUnits: { ...(attackerWins ? defendUnits : attackUnits) },
    close: closeFight, crush: r < 0.35, upset: upset && winner === under, target: targetIdx,
  });
  if (upset && winner === under) {
    say(gs, `${winner.name} 선수 기막힌 위치 선정! 병력은 밀렸지만 절묘한 컨트롤로 싸움을 뒤집습니다!`);
  }
  say(gs, `${winner.name} 선수 ${winLine ? winLine + " " : ""}교전 승리! ${loser.name} 선수 ${lossText(lRes.lost) || "병력"} 잃습니다${lRes.workers ? `, ${workerName(loser)} ${lRes.workers}기 포함` : ""}. (인구 -${attackerWins ? lostD : lostA} vs -${attackerWins ? lostA : lostD})`);

  attacker.lastAttackTurn = gs.turn;
  // 수비 성공 → 상대 병력이 줄어든 틈을 타 역습 기회
  if (!attackerWins && !field) {
    defender.counterTurn = gs.turn;
    say(gs, `${defender.name} 선수 수비 성공! 이제 역습의 기회를 노립니다.`);
  }

  // 공격 성공 시 기지 피해
  if (attackerWins && target) {
    const remaining = armySupply(attacker);
    const workersHere = Math.min(defender.workers, targetIdx === 0 ? defender.workers * 0.45 : 16);
    const killed = Math.round(workersHere * clamp(0.22 + 0.35 * (1 - r) + 0.1 * attacker.sk.attack, 0.1, 0.8));
    if (killed > 0) {
      defender.workers = Math.max(0, defender.workers - killed);
      defender.workersLost += killed;
      eventsOf(gs, defender).push({ type: "resource_drain", time: gs.time });
    }
    const defenderLeft = armySupply(defender);
    // 기지 함락은 확실히 이겼을 때만, 그래도 수비 측이 버텨낼 수 있음 (역전의 여지)
    const breakChance = clamp(0.35 + 0.5 * (1 - r) + 0.1 * attacker.sk.attack - 0.1 * defender.sk.defense, 0.2, 0.9);
    if (remaining >= Math.max(16, defenderLeft * 3) && rand() < breakChance) {
      target.alive = false;
      if (target.hasGas) {
        const gk = RACE_ROLES[defender.race].gas;
        defender.buildings[gk] = Math.max(0, (defender.buildings[gk] ?? 0) - 1);
      }
      if (targetIdx === 0) {
        // 본진 함락: 생산/테크 건물 상당수 파괴
        for (const k of Object.keys(defender.buildings)) {
          if (BUILDINGS[k]?.role === "townhall") continue;
          defender.buildings[k] = Math.floor((defender.buildings[k] ?? 0) * 0.35);
        }
      }
      emit(gs, { k: "base", victim: defender.side as Side, idx: targetIdx, killed });
      say(gs, `${defender.name} 선수의 ${target.name}이(가) 무너집니다! ${nameOf(RACE_ROLES[defender.race].townhall)} 파괴${killed ? `, ${workerName(defender)} ${killed}기 사망` : ""}.`);
    } else if (killed > 0) {
      emit(gs, { k: "raid", side: attacker.side as Side, killed });
      say(gs, `${attacker.name} 선수, 병력을 물리친 뒤 ${workerName(defender)} ${killed}기까지 잡아냅니다. ${defender.name} 선수, ${target.name}은(는) 간신히 지켜냅니다!`);
    }
  }
}

function wantsToAttack(gs: GameState, p: BwPlayer): boolean {
  const e = enemyOf(gs, p);
  const myArmy = armySupply(p);
  if (myArmy < 2) return false;
  const push = p.plan.push;
  if (push && !p.pushDone && gs.time >= push.at && myArmy >= push.minArmySupply) {
    p.pushDone = true;
    emit(gs, { k: "push", side: p.side as Side });
    say(gs, `${p.name} 선수 ${push.name}! 준비한 타이밍에 병력을 이끌고 나갑니다.`);
    return true;
  }
  if (push && !p.pushDone && gs.time >= push.at + 180) p.pushDone = true; // 타이밍을 놓침
  // 역습: 방금 막아낸 쪽은 적 병력이 비었을 때 곧바로 치고 나간다
  if (gs.turn - p.counterTurn <= 2 && myArmy >= 8 && armyValue(p) >= armyValue(e) * 1.3) {
    p.counterTurn = -99;
    emit(gs, { k: "counter", side: p.side as Side });
    say(gs, `${p.name} 선수 역습! 상대 병력이 빠진 틈을 파고듭니다!`);
    return true;
  }
  if (gs.turn - p.lastAttackTurn < 3) return false;
  if (myArmy < 24) return false;
  // 복잡한 맵은 상대 병력을 파악하기 어려워 정찰 능력치가 더 중요
  const noise = clamp((0.4 - 0.3 * p.sk.scout) * (1 + 0.4 * p.terrain.cx), 0.06, 0.7);
  const estimate = (armyValue(e) + staticValue(e) * 0.6) * (1 + (rand() * 2 - 1) * noise);
  let threshold = 1.5 - 0.12 * p.sk.attack - 0.08 * p.sk.sense;
  if (supplyUsed(p) >= 180) threshold = 0.9;
  threshold = Math.max(0.85, threshold);
  return armyValue(p) >= estimate * threshold + 150;
}

// ══════════════════════════════════════════════════════════════
// 견제
// ══════════════════════════════════════════════════════════════

function harassAvailable(p: BwPlayer, kind: HarassKind, e: BwPlayer): number {
  switch (kind) {
    case "vulture_raid": return p.techs.has("ion_thrusters") && (p.units.vulture ?? 0) >= 4 ? Math.min(6, p.units.vulture) : 0;
    case "bio_drop": return (p.units.dropship ?? 0) >= 1 && (p.units.marine ?? 0) + (p.units.medic ?? 0) >= 12 ? 8 : 0;
    case "wraith_cloak": return p.techs.has("cloaking_field") && (p.units.wraith ?? 0) >= 3 ? Math.min(6, p.units.wraith) : 0;
    case "reaver_drop": return (p.units.reaver ?? 0) >= 1 && (p.units.shuttle ?? 0) >= 1 ? Math.min(2, p.units.reaver) : 0;
    case "dark_templar": return (p.units.dark_templar ?? 0) >= 2 ? Math.min(4, p.units.dark_templar) : 0;
    case "corsair_overlord": return e.race === "zerg" && (p.units.corsair ?? 0) >= 4 ? Math.min(8, p.units.corsair) : 0;
    case "muta_harass": return (p.units.mutalisk ?? 0) >= 6 ? Math.min(12, p.units.mutalisk) : 0;
    case "ling_runby": return p.techs.has("metabolic_boost") && (p.units.zergling ?? 0) >= 16 ? Math.min(16, p.units.zergling) : 0;
  }
}

function harass(gs: GameState, p: BwPlayer) {
  if (p.harassCooldown > 0) { p.harassCooldown--; return; }
  const e = enemyOf(gs, p);
  const kinds = p.plan.harass.filter(k => harassAvailable(p, k, e) > 0);
  if (!kinds.length) return;
  if (rand() > clamp(0.3 + 0.35 * p.sk.harass, 0.1, 0.75)) return;
  const kind = kinds[Math.floor(rand() * kinds.length)];
  const squad = harassAvailable(p, kind, e);
  const bases = Math.max(1, townHalls(e));
  const staticAA = ((e.buildings.missile_turret ?? 0) + (e.buildings.photon_cannon ?? 0) + (e.buildings.spore_colony ?? 0)) / bases;
  const staticG = ((e.buildings.photon_cannon ?? 0) + (e.buildings.sunken_colony ?? 0) + (e.buildings.bunker ?? 0)) / bases;
  // 복잡한 맵은 드랍·우회 경로가 많아 견제가 잘 통함
  const skillMul = clamp((1 + 0.9 * p.sk.harass) * (1 + 0.35 * p.terrain.cx), 0.4, 2.6);
  const defense = clamp(0.2 + 0.18 * e.sk.defense + 0.1 * e.sk.sense, 0.02, 0.6);
  let killed = 0;
  let lostUnits = 0;
  let text = "";
  const wn = workerName(e);
  switch (kind) {
    case "vulture_raid": {
      const block = defense + staticG * 0.15 + ((e.units.dragoon ?? 0) > 6 ? 0.15 : 0);
      killed = Math.round(squad * 1.4 * skillMul * (1 - clamp(block, 0, 0.85)));
      lostUnits = Math.round(squad * clamp(block, 0, 0.8) * 0.6);
      text = `${p.name} 선수 벌처 ${squad}기, ${e.name} 선수의 ${wn} 라인 급습! 마인까지 심으며 ${wn} ${killed}기 잡아냅니다.`;
      if (lostUnits) p.units.vulture -= lostUnits;
      break;
    }
    case "bio_drop": {
      const block = defense + staticG * 0.12 + (e.race === "zerg" && (e.units.lurker ?? 0) > 0 ? 0.25 : 0);
      killed = Math.round(9 * skillMul * (1 - clamp(block, 0, 0.9)));
      lostUnits = Math.round(8 * clamp(block, 0, 0.9) * 0.8);
      text = `${p.name} 선수 드랍십 드랍! 마린·메딕이 ${e.name} 선수 멀티에 내려 ${wn} ${killed}기를 잡습니다.`;
      p.units.marine = Math.max(0, (p.units.marine ?? 0) - lostUnits);
      break;
    }
    case "wraith_cloak": {
      const detect = hasDetection(e, true);
      const block = detect ? defense + staticAA * 0.2 + 0.2 : defense * 0.5;
      killed = Math.round(squad * (detect ? 0.8 : 2.2) * skillMul * (1 - clamp(block, 0, 0.9)));
      lostUnits = detect ? Math.round(squad * clamp(block, 0, 0.8) * 0.5) : 0;
      text = detect
        ? `${p.name} 선수 클로킹 레이스 견제, 하지만 탐지에 걸립니다. ${wn} ${killed}기만 잡고 레이스 ${lostUnits}기 잃습니다.`
        : `${p.name} 선수 클로킹 레이스! ${e.name} 선수 탐지 수단이 없습니다! ${wn} ${killed}기 잡아냅니다!`;
      if (!detect) e.detectionUrgent = true;
      if (lostUnits) p.units.wraith -= lostUnits;
      break;
    }
    case "reaver_drop": {
      const block = defense + staticG * 0.15 + ((e.units.mutalisk ?? 0) + (e.units.wraith ?? 0) > 4 ? 0.2 : 0);
      killed = Math.round((5 + squad * 3) * skillMul * (1 - clamp(block, 0, 0.9)));
      lostUnits = rand() < clamp(block, 0, 0.8) * 0.5 ? 1 : 0;
      text = `${p.name} 선수 셔틀 리버 드랍! 스캐럽 한 방에 ${wn}들이 녹아내립니다. ${wn} ${killed}기 사망!`;
      if (lostUnits) { p.units.reaver -= 1; text += " 하지만 리버 1기를 잃습니다."; }
      break;
    }
    case "dark_templar": {
      const detect = hasDetection(e, true);
      const block = detect ? defense + staticG * 0.1 + 0.35 : defense * 0.3;
      killed = Math.round(squad * (detect ? 1.2 : 4) * skillMul * (1 - clamp(block, 0, 0.9)));
      lostUnits = detect ? Math.round(squad * clamp(block, 0, 0.8) * 0.6) : 0;
      if (!detect) {
        const armyLoss = Math.round(armySupply(e) * 0.1);
        text = `${p.name} 선수 다크 템플러 난입! ${e.name} 선수 탐지가 없습니다! ${wn} ${killed}기와 병력 일부까지 쓸려나갑니다!`;
        const topUnit = Object.entries(e.units).filter(([k, c]) => c > 0 && UNITS[k] && isCombat(UNITS[k]) && !UNITS[k].air).sort((a, b) => b[1] - a[1])[0];
        if (topUnit && armyLoss > 0) e.units[topUnit[0]] = Math.max(0, topUnit[1] - Math.ceil(armyLoss / UNITS[topUnit[0]].supply));
        e.detectionUrgent = true;
      } else {
        text = `${p.name} 선수 다크 템플러 견제, 하지만 ${e.name} 선수가 탐지로 막아냅니다. ${wn} ${killed}기 피해.`;
      }
      if (lostUnits) p.units.dark_templar -= lostUnits;
      break;
    }
    case "corsair_overlord": {
      const block = defense + staticAA * 0.25 + ((e.units.scourge ?? 0) + (e.units.hydralisk ?? 0) > 8 ? 0.3 : 0);
      const ovl = Math.min(e.units.overlord ?? 0, Math.round(squad * 0.8 * skillMul * (1 - clamp(block, 0, 0.9))));
      if (ovl > 0) {
        e.units.overlord -= ovl;
        text = `${p.name} 선수 커세어 ${squad}기가 오버로드 사냥! 오버로드 ${ovl}기 격추, ${e.name} 선수 인구수가 막힙니다!`;
        eventsOf(gs, e).push({ type: "resource_drain", time: gs.time });
        eventsOf(gs, p).push({ type: "engagement", winner: p.side, time: gs.time });
      }
      lostUnits = Math.round(squad * clamp(block, 0, 0.8) * 0.3);
      if (lostUnits) p.units.corsair -= lostUnits;
      break;
    }
    case "muta_harass": {
      const block = defense + staticAA * 0.2 + ((e.units.marine ?? 0) > 12 ? 0.2 : 0) + ((e.units.corsair ?? 0) + (e.units.archon ?? 0) > 3 ? 0.25 : 0);
      killed = Math.round(squad * 0.75 * skillMul * (1 - clamp(block, 0, 0.9)));
      lostUnits = Math.round(squad * clamp(block, 0, 0.8) * 0.35);
      text = `${p.name} 선수 뮤탈리스크 ${squad}기 견제! 뭉쳐서 ${e.name} 선수 ${wn} 라인을 찌르며 ${wn} ${killed}기를 잡습니다.`;
      if (lostUnits) { p.units.mutalisk -= lostUnits; text += ` 뮤탈 ${lostUnits}기는 잃습니다.`; }
      break;
    }
    case "ling_runby": {
      const block = defense + staticG * 0.25 + ((e.units.siege_tank ?? 0) + (e.units.reaver ?? 0) > 2 ? 0.3 : 0) + ((e.units.zealot ?? 0) + (e.units.firebat ?? 0) > 6 ? 0.2 : 0);
      killed = Math.round(squad * 0.5 * skillMul * (1 - clamp(block, 0, 0.9)));
      lostUnits = Math.round(squad * clamp(block, 0, 0.9) * 0.7);
      text = `${p.name} 선수 발업 저글링 ${squad}기 우회 난입! ${e.name} 선수 ${wn} ${killed}기가 쓰러집니다.`;
      if (lostUnits) p.units.zergling = Math.max(0, (p.units.zergling ?? 0) - lostUnits);
      break;
    }
  }
  p.harassCooldown = 3;
  killed = Math.min(killed, Math.max(0, e.workers - 2));
  emit(gs, { k: "harass", side: p.side as Side, kind, killed: kind === "corsair_overlord" && text ? 1 : killed });
  if (killed > 0) {
    e.workers -= killed;
    e.workersLost += killed;
    eventsOf(gs, e).push({ type: "resource_drain", time: gs.time });
    eventsOf(gs, p).push({ type: "engagement", winner: p.side, time: gs.time });
    if (text) say(gs, text);
  } else if (text && kind !== "corsair_overlord") {
    say(gs, `${p.name} 선수의 견제 시도, ${e.name} 선수가 깔끔하게 막아냅니다.`);
  } else if (text) {
    say(gs, text);
  }
}

// ══════════════════════════════════════════════════════════════
// 해설 문구
// ══════════════════════════════════════════════════════════════

function buildingLine(p: BwPlayer, key: string): string {
  const lines: Record<string, string> = {
    factory: "팩토리 완성, 메카닉 테크가 시작됩니다.",
    starport: "스타포트 완성, 공중 유닛이 나올 수 있습니다.",
    science_facility: "사이언스 퍼실리티 완성! 사이언스 베슬이 나옵니다.",
    armory: "아머리 완성, 골리앗 생산과 메카닉 업그레이드가 가능해졌습니다.",
    cybernetics_core: "사이버네틱스 코어 완성, 드라군이 나옵니다.",
    robotics_facility: "로보틱스 퍼실리티 완성, 옵저버·리버 테크입니다.",
    stargate: "스타게이트 완성! 공중 유닛을 준비합니다.",
    citadel_of_adun: "시타델 오브 아둔 완성, 템플러 테크로 가는 길입니다.",
    templar_archives: "템플러 아카이브 완성! 하이 템플러·다크 템플러가 가능합니다.",
    fleet_beacon: "플릿 비콘 완성, 캐리어 체제로 갑니다!",
    arbiter_tribunal: "아비터 트리뷰널 완성, 아비터가 나옵니다.",
    spawning_pool: "스포닝 풀 완성, 저글링 생산이 가능합니다.",
    hydralisk_den: "히드라리스크 덴 완성!",
    spire: "스파이어 완성! 뮤탈리스크가 곧 나옵니다.",
    queens_nest: "퀸즈 네스트 완성, 하이브로 가는 준비입니다.",
    ultralisk_cavern: "울트라리스크 캐번 완성, 울트라리스크가 나옵니다!",
    defiler_mound: "디파일러 마운드 완성, 디파일러가 전장에 합류합니다.",
  };
  return `${p.name} 선수 ${lines[key] ?? nameOf(key) + " 완성."}`;
}

function techLine(p: BwPlayer, key: string): string {
  const lines: Record<string, string> = {
    stim: "스팀팩 연구 완료! 바이오닉의 공격 속도가 크게 오릅니다.",
    siege_mode: "시즈 모드 연구 완료, 탱크 라인이 단단해집니다.",
    irradiate: "이레디에이트 연구 완료, 저그 입장에선 뮤탈·디파일러가 위험해집니다.",
    cloaking_field: "레이스 클로킹 연구 완료! 상대의 탐지 준비가 관건입니다.",
    emp: "EMP 연구 완료, 프로토스의 실드를 벗겨낼 수 있습니다.",
    spider_mines: "스파이더 마인 연구 완료, 벌처가 마인을 깔기 시작합니다.",
    singularity_charge: "드라군 사거리 업그레이드 완료!",
    leg_enhancements: "질럿 발업 완료, 질럿이 빨라졌습니다.",
    psionic_storm: "사이오닉 스톰 연구 완료! 뭉친 병력에 치명적입니다.",
    stasis_field: "스테이시스 필드 연구 완료.",
    lair: "레어 완성, 중반 테크로 넘어갑니다.",
    hive: "하이브 완성! 후반 테크가 열렸습니다.",
    metabolic_boost: "저글링 발업 완료, 저글링이 빨라집니다.",
    lurker_aspect: "럴커 변태 연구 완료! 럴커가 나옵니다.",
    consume: "컨슘 연구 완료, 디파일러의 다크 스웜이 본격적으로 쓰입니다.",
    chitinous_plating: "울트라리스크 방어력 업그레이드 완료.",
  };
  return `${p.name} 선수 ${lines[key] ?? nameOf(key) + " 완료."}`;
}

function unitArrivalLine(p: BwPlayer, key: string): string {
  const n = p.units[key] ?? 0;
  const name = UNITS[key].name;
  const lines: Record<string, string> = {
    mutalisk: `뮤탈리스크 ${n}기가 모였습니다! 견제를 준비합니다.`,
    siege_tank: `시즈 탱크 ${n}기 확보, 라인을 잡기 시작합니다.`,
    science_vessel: "첫 사이언스 베슬 등장!",
    dark_templar: `다크 템플러 ${n}기 등장! 상대의 탐지 대비가 궁금합니다.`,
    lurker: `럴커 ${n}기 변태 완료! 길목을 막아섭니다.`,
    carrier: `캐리어 ${n}기! 공중 함대가 모이기 시작합니다.`,
    ultralisk: `울트라리스크 ${n}기 합류!`,
    defiler: "디파일러 등장, 다크 스웜이 깔릴 수 있습니다.",
    arbiter: "아비터 등장! 리콜과 스테이시스를 조심해야 합니다.",
    reaver: "리버 생산! 셔틀 드랍을 노릴 수 있습니다.",
    corsair: `커세어 ${n}기, 제공권을 가져갑니다.`,
    observer: "옵저버 생산, 탐지 수단을 확보했습니다.",
  };
  return `${p.name} 선수 ${lines[key] ?? `${name} ${n}기 확보.`}`;
}

// ══════════════════════════════════════════════════════════════
// 턴 진행
// ══════════════════════════════════════════════════════════════

function evaluate(p: BwPlayer): number {
  // 현재 병력과 경제 중심 (누적 채취량은 제외해 교전 결과가 바로 드러나게)
  return armyValue(p) * 1.4 + staticValue(p) * 0.3 + p.workers * 55 + townHalls(p) * 300 + (p.minerals + p.gas) * 0.2;
}

function checkGameOver(gs: GameState): void {
  const [a, b] = [gs.player1, gs.player2];
  for (const [p, e] of [[a, b], [b, a]] as const) {
    const noHall = townHalls(p) === 0 && !p.jobs.some(j => j.kind === "expand");
    // 병력이 전멸했더라도 일꾼·기지·자원이 남아 있으면 다시 병력을 모아 버틸 수 있다
    const bank = p.minerals + p.gas;
    const canRebuild = p.workers >= e.workers * 0.6 && townHalls(p) >= townHalls(e) - 1 && (p.workers >= 16 || bank >= 400);
    const crushed = gs.time > 240 && armySupply(p) <= Math.max(4, armySupply(e) * 0.15) && armySupply(e) >= 36 && !canRebuild;
    const broke = p.workers <= 3 && p.minerals < 50 && armySupply(p) < 2 && gs.time > 150;
    const economyDead = gs.time > 540 && p.workers < e.workers * 0.35 && armyValue(p) < armyValue(e) * 0.4;
    if (noHall || crushed || broke || economyDead) {
      gs.gameEnded = true;
      gs.winner = e.id;
      gs.endReason = noHall ? "기지 전멸" : crushed ? "주력 병력 전멸" : "경제 붕괴";
      emit(gs, { k: "gg", loser: p.side as Side });
      say(gs, `${p.name} 선수, 더 이상 버티지 못하고 GG를 선언합니다! ${e.name} 선수 승리! (${gs.endReason})`);
      return;
    }
  }
  if (gs.time >= MAX_GAME_SECONDS) {
    gs.gameEnded = true;
    const winner = evaluate(a) >= evaluate(b) ? a : b;
    gs.winner = winner.id;
    gs.endReason = "장기전 판정";
    emit(gs, { k: "judge", winner: winner.side as Side });
    say(gs, `경기가 40분을 넘겼습니다. 자원과 병력에서 앞선 ${winner.name} 선수의 판정승입니다!`);
  }
}

function statusLine(gs: GameState) {
  const [a, b] = [gs.player1, gs.player2];
  say(gs, `현황 | ${a.name}: 인구 ${Math.round(supplyUsed(a))}/${supplyCap(a)} · 일꾼 ${a.workers} · 기지 ${townHalls(a)} · 분당 ${incomePerMinute(a).toLocaleString()} | ${b.name}: 인구 ${Math.round(supplyUsed(b))}/${supplyCap(b)} · 일꾼 ${b.workers} · 기지 ${townHalls(b)} · 분당 ${incomePerMinute(b).toLocaleString()}`);
}

function syncCompat(p: BwPlayer) {
  p.supply = armySupply(p);
  p.resources = Math.round(p.totalMined);
  const bases = p.bases.length || 1;
  p.health = Math.round((aliveBases(p).length / bases) * 100);
}

export function progressGame(gs: GameState): void {
  if (gs.gameEnded) return;
  gs.turn++;
  gs.turnCommentaries = [];
  const players = [gs.player1, gs.player2];

  if (gs.turn === 1) {
    for (const p of players) {
      say(gs, `${p.name} 선수(${RACE_ROLES[p.race].name}) ${workerName(p)} 4기로 경기를 시작합니다.`);
    }
  }

  for (let t = 0; t < TURN_SECONDS; t += TICK) {
    gs.time += TICK;
    for (const p of players) {
      mine(gs, p, TICK);
      completeJobs(gs, p, TICK);
      spawnLarva(p, TICK);
      decide(gs, p);
    }
  }

  // 빌드 공개 (해설자 시점, 1분 40초 무렵)
  if (gs.time >= 100 && gs.time < 100 + TURN_SECONDS) {
    for (const p of players) {
      emit(gs, { k: "plan", side: p.side as Side, plan: p.plan.key, style: p.plan.style });
      say(gs, `${p.name} 선수의 빌드는 ${p.plan.name}. ${p.plan.desc}.`);
    }
  }

  for (const p of players) scouting(gs, p);
  for (const p of players) harass(gs, p);

  // 공격 결정
  const [a, b] = players;
  const aWants = wantsToAttack(gs, a);
  const bWants = wantsToAttack(gs, b);
  if (aWants && bWants) {
    const first = armyValue(a) >= armyValue(b) ? a : b;
    battle(gs, first, enemyOf(gs, first), -1);
  } else if (aWants || bWants) {
    const att = aWants ? a : b;
    const def = enemyOf(gs, att);
    const alive = def.bases.map((x, i) => ({ x, i })).filter(o => o.x.alive && o.x.ready);
    const targetIdx = alive.length ? alive[alive.length - 1].i : -1;
    battle(gs, att, def, targetIdx);
  }

  checkGameOver(gs);

  if (!gs.gameEnded && gs.turn % 9 === 0) statusLine(gs);

  // 유불리 (군사력·경제·기지 가치 비교, 급변하지 않도록 완만하게)
  const va = evaluate(gs.player1);
  const vb = evaluate(gs.player2);
  const raw = (va / Math.max(1, va + vb)) * 100;
  gs.player1Advantage = Math.round(clamp(gs.player1Advantage * 0.25 + raw * 0.75, 1, 99));
  if (gs.gameEnded) gs.player1Advantage = gs.winner === gs.player1.id ? 100 : 0;

  for (const p of players) syncCompat(p);

  // 한 턴 해설이 너무 길어지지 않도록 정리 (교전·GG 우선)
  if (gs.turnCommentaries.length > 6) {
    const important = gs.turnCommentaries.filter(c => /공격!|교전|GG|무너|판정|현황/.test(c));
    const rest = gs.turnCommentaries.filter(c => !important.includes(c));
    gs.turnCommentaries = [...rest.slice(0, Math.max(0, 6 - important.length)), ...important];
  }
}

export function progressTurn(gs: GameState): void {
  progressGame(gs);
}

export interface PlayerSnapshot {
  race: Race;
  plan: string;
  population: number;
  supplyCap: number;
  workers: number;
  armySupply: number;
  minerals: number;
  gas: number;
  incomePerMin: number;
  bases: number;
  army: string;
  techs: string[];
}

function snapshot(p: BwPlayer): PlayerSnapshot {
  return {
    race: p.race,
    plan: p.plan.name,
    population: Math.round(supplyUsed(p)),
    supplyCap: supplyCap(p),
    workers: p.workers,
    armySupply: armySupply(p),
    minerals: Math.round(p.minerals),
    gas: Math.round(p.gas),
    incomePerMin: incomePerMinute(p),
    bases: townHalls(p),
    army: composition(p.units, 5),
    techs: Array.from(p.techs).filter(t => NOTABLE_TECHS.has(t)).map(nameOf),
  };
}

export function gameStateToTurnData(gs: GameState) {
  return {
    turn: gs.turn,
    time: gs.time,
    player1Commentary: [] as string[],
    player2Commentary: [] as string[],
    player1Supply: armySupply(gs.player1),
    player1Resources: Math.round(gs.player1.totalMined),
    player2Supply: armySupply(gs.player2),
    player2Resources: Math.round(gs.player2.totalMined),
    player1Health: gs.player1.health,
    player2Health: gs.player2.health,
    player1Advantage: gs.player1Advantage,
    commentaries: [...gs.turnCommentaries],
    p1: snapshot(gs.player1),
    p2: snapshot(gs.player2),
  };
}
