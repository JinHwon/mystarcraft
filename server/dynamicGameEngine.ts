/**
 * 동적 게임 엔진 v20.0
 * 
 * 핵심:
 * 1. 병력 MAX 200, 증가 속도 현실적으로 조절
 * 2. 빌드오더 테크트리: 배럭→팩토리→스타포트 순서대로만 건설 가능
 * 3. 각 생산건물에서 해당 유닛만 생산 가능
 * 4. 자원 부족 시 병력 생산 비례 감소
 * 5. 유닛 조합에 따른 유불리 반영
 * 6. 견제 성공/실패, 본진 파괴=즉시 종료
 * 7. 멀티/앞마당 파괴 시 자원 수급 복귀
 * 8. 초반 러쉬 빌드 시스템
 */

import { generateTurnCommentary, generateGameEndCommentary } from "./conciseCommentary";
import {
  initializeBuildOrder,
  updateBuildOrder,
  canBuildBuilding,
  type BuildOrderState,
} from "@shared/buildOrder";
import {
  GAME_MAX_TROOPS,
  GAME_MAX_RESOURCES,
  GAME_INITIAL_TROOPS,
  GAME_INITIAL_RESOURCES,
  BUILD_RESOURCE_RATES,
  BUILD_TROOP_RATES,
} from "@shared/gameConstants";
import {
  generateGameEvent,
  generateSituationCommentary,
  type GameEvent,
} from "./gameEventGenerator";

export interface PlayerAction {
  type: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first" | "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack" | "scout" | "counter_tech";
  data: string;
}

export interface PlayerState {
  id: number;
  name: string;
  race: "terran" | "zerg" | "protoss";
  supply: number;
  resources: number;
  health: number;
  stats?: {
    attack: number; defense: number; speed: number; economy: number;
    sense: number; control: number; harassment: number; strategy: number;
    scouting: number; massProduction: number;
  };
  multiCount: number;
  /** 생산건물 종류별 개수 */
  productionBuildings: Record<string, number>;
  /** 총 생산건물 수 (편의용) */
  productionFacilities: number;
  frontBaseDestroyed: boolean;
  harassedTurns: number;
  productionDamage: number;
  baseHealth: number;
  /** 현재 보유 유닛 조합 */
  unitComposition: Record<string, number>;
  hasObserver: boolean; hasVessel: boolean; hasArbiter: boolean;
  hasRecall: boolean; hasEMP: boolean; hasStasisField: boolean;
  buildStrategy?: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first";
  isRushing: boolean;
  buildOrder: BuildOrderState;
  producedUnitsFirstTime: Set<string>;
  unitsProduced: string[];
  lastAction?: PlayerAction;
}

export interface GameState {
  turn: number;
  gameEnded: boolean;
  winner?: number;
  player1: PlayerState;
  player2: PlayerState;
  player1Advantage: number;
  player1Events: string[];
  player2Events: string[];
  turnCommentaries: string[];
  mapTraits?: { rushDistance: number; resources: number; complexity: number };
  mapRaceAdvantage?: Record<string, number>;
}

// ── 종족별 건물/유닛 정의 ──

/** 생산건물: 여러 개 건설 가능, 테크트리 순서 필요 */
const PRODUCTION_TECH_ORDER: Record<string, string[]> = {
  terran: ["배럭", "팩토리", "스타포트"],
  protoss: ["게이트웨이", "로보틱스 팩토리", "스타게이트"],
  zerg: ["해처리"],
};

/** 건물별 생산 가능 유닛 */
const BUILDING_UNITS: Record<string, string[]> = {
  "배럭": ["마린", "메딕", "파이어뱃"],
  "팩토리": ["벌쳐", "탱크", "골리앗"],
  "스타포트": ["배틀크루저", "사이언스 베슬"],
  "게이트웨이": ["질럿", "드래군"],
  "로보틱스 팩토리": ["옵저버", "리버"],
  "스타게이트": ["케리어", "아비터"],
  "해처리": ["저글링", "히드라", "뮤탈리스크", "럴커", "울트라리스크"],
};

/** 유닛 전투력 가중치 (고급 유닛일수록 높음) */
const UNIT_POWER: Record<string, number> = {
  "마린": 1.0, "메딕": 0.5, "파이어뱃": 1.2,
  "벌쳐": 1.3, "탱크": 2.5, "골리앗": 1.8,
  "배틀크루저": 4.0, "사이언스 베슬": 1.5,
  "질럿": 1.2, "드래군": 1.5,
  "옵저버": 0.3, "리버": 3.0,
  "케리어": 4.5, "아비터": 2.0,
  "저글링": 0.6, "히드라": 1.5,
  "뮤탈리스크": 2.0, "럴커": 2.2, "울트라리스크": 3.5,
};

/** 유닛 상성 보너스: [공격유닛][방어유닛] = 보너스 배율 */
const UNIT_COUNTERS: Record<string, Record<string, number>> = {
  "탱크":   { "질럿": 1.5, "저글링": 1.8, "히드라": 1.3 },
  "벌쳐":   { "저글링": 1.6, "질럿": 1.3 },
  "마린":   { "뮤탈리스크": 0.7, "럴커": 0.5, "탱크": 0.6 },
  "파이어뱃": { "저글링": 1.8, "질럿": 1.4 },
  "골리앗": { "뮤탈리스크": 1.5, "케리어": 1.3 },
  "질럿":   { "마린": 1.3, "히드라": 0.8, "탱크": 0.5 },
  "드래군": { "벌쳐": 1.3, "뮤탈리스크": 1.4, "탱크": 0.7 },
  "리버":   { "마린": 2.0, "저글링": 2.0, "히드라": 1.5 },
  "케리어": { "히드라": 1.3, "마린": 1.5 },
  "저글링": { "탱크": 0.4, "리버": 0.3, "파이어뱃": 0.5 },
  "히드라": { "뮤탈리스크": 1.3, "질럿": 1.2 },
  "뮤탈리스크": { "마린": 1.4, "프로브": 2.0 },
  "럴커":   { "마린": 1.8, "질럿": 1.5, "저글링": 1.5 },
  "울트라리스크": { "마린": 1.5, "질럿": 1.3, "탱크": 0.8 },
};

function makePlayer(
  id: number, name: string, race: "terran" | "zerg" | "protoss",
  stats?: Record<string, number>
): PlayerState {
  // 초기 생산건물: 종족별 기본 1개
  const initialProd: Record<string, number> = {};
  const firstBuilding = PRODUCTION_TECH_ORDER[race]?.[0];
  if (firstBuilding) initialProd[firstBuilding] = 1;

  return {
    id, name, race,
    supply: GAME_INITIAL_TROOPS,
    resources: GAME_INITIAL_RESOURCES,
    health: 100,
    stats: stats ? {
      attack: stats.attack || 50, defense: stats.defense || 50,
      speed: stats.speed || 50, economy: stats.sense || stats.economy || 50,
      sense: stats.sense || 50, control: stats.control || 50,
      harassment: stats.harass || stats.harassment || 50, strategy: stats.strategy || 50,
      scouting: stats.scout || stats.scouting || 50, massProduction: stats.supply || stats.massProduction || 50,
    } : undefined,
    multiCount: 1,
    productionBuildings: initialProd,
    productionFacilities: 1,
    frontBaseDestroyed: false,
    harassedTurns: 0,
    productionDamage: 0,
    baseHealth: 100,
    unitComposition: {},
    hasObserver: false, hasVessel: false, hasArbiter: false,
    hasRecall: false, hasEMP: false, hasStasisField: false,
    isRushing: false,
    buildOrder: initializeBuildOrder(race),
    producedUnitsFirstTime: new Set(),
    unitsProduced: [],
  };
}

export function initializeGameState(
  p1Id: number, p1Name: string, p1Race: "terran" | "zerg" | "protoss",
  p2Id: number, p2Name: string, p2Race: "terran" | "zerg" | "protoss",
  p1Stats?: Record<string, number>, p2Stats?: Record<string, number>,
  mapTraits?: { rushDistance: number; resources: number; complexity: number },
  mapRaceAdvantage?: Record<string, number>
): GameState {
  return {
    turn: 0, gameEnded: false,
    player1: makePlayer(p1Id, p1Name, p1Race, p1Stats),
    player2: makePlayer(p2Id, p2Name, p2Race, p2Stats),
    player1Advantage: 50,
    player1Events: [], player2Events: [],
    turnCommentaries: [],
    mapTraits,
    mapRaceAdvantage,
  };
}

// ── 빌드 전략 ──

function getRaceBuildStrategies(race: "terran" | "zerg" | "protoss") {
  switch (race) {
    case "terran": return ["barracks_first", "cc_first"] as const;
    case "protoss": return ["gateway_first"] as const;
    case "zerg": return ["hatch_first"] as const;
  }
}

// ── 테크트리에 따른 건물 건설 ──

function getNextBuildableProduction(p: PlayerState): string | null {
  const techOrder = PRODUCTION_TECH_ORDER[p.race] || [];
  // 테크트리 순서대로 확인: 이전 건물이 있어야 다음 건물 건설 가능
  for (let i = 0; i < techOrder.length; i++) {
    const building = techOrder[i];
    if (i === 0) continue; // 첫 건물은 이미 있음
    const prevBuilding = techOrder[i - 1];
    // 이전 건물이 있고, 현재 건물이 없으면 건설 가능
    if ((p.productionBuildings[prevBuilding] ?? 0) > 0 && (p.productionBuildings[building] ?? 0) === 0) {
      return building;
    }
  }
  return null;
}

function getExistingProductionBuildings(p: PlayerState): string[] {
  return Object.entries(p.productionBuildings).filter(([, count]) => count > 0).map(([name]) => name);
}

function tryBuildAction(gs: GameState, p: PlayerState): void {
  const t = gs.turn;
  if (t < 3) return;

  // 1) 테크트리 상 다음 생산건물 건설 (1개만)
  const nextProd = getNextBuildableProduction(p);
  if (nextProd && p.resources > 500 && Math.random() < 0.12 + (p.stats ? (p.stats.strategy - 50) / 800 : 0)) {
    p.productionBuildings[nextProd] = 1;
    p.productionFacilities++;
    p.resources -= 350;
    updateBuildOrder(p.buildOrder, nextProd);
    gs.turnCommentaries.push(`${p.name} 선수가 ${nextProd}을 건설! 새로운 유닛 생산이 가능해집니다.`);
    return;
  }

  // 2) 기존 생산건물 추가 건설 (물량 증가)
  const existing = getExistingProductionBuildings(p);
  if (existing.length > 0 && p.productionFacilities < 8) {
    const prodChance = 0.08 + (p.stats ? (p.stats.massProduction - 50) / 600 + (p.stats.strategy - 50) / 1200 : 0);
    const cost = 300 + p.productionFacilities * 60;
    if (p.resources > cost + 400 && Math.random() < prodChance) {
      const building = existing[Math.floor(Math.random() * existing.length)];
      p.productionBuildings[building] = (p.productionBuildings[building] ?? 0) + 1;
      p.productionFacilities++;
      p.resources -= cost;
      gs.turnCommentaries.push(`${p.name} 선수가 ${building}을 추가 건설! (총 ${p.productionFacilities}개) 병력 생산↑ 자원 소모↑`);
    }
  }
}

// ── 유닛 생산 (건물별 가능 유닛만) ──

function getProducibleUnits(p: PlayerState): string[] {
  const units: string[] = [];
  for (const [building, count] of Object.entries(p.productionBuildings)) {
    if (count > 0 && BUILDING_UNITS[building]) {
      for (const unit of BUILDING_UNITS[building]) {
        if (!units.includes(unit)) units.push(unit);
      }
    }
  }
  return units;
}

function produceUnits(gs: GameState, p: PlayerState): void {
  if (p.resources <= 50 || p.supply >= GAME_MAX_TROOPS) return;

  const availableUnits = getProducibleUnits(p);
  if (availableUnits.length === 0) return;

  // 자원 기반 생산량: 자원이 적으면 적게, 많으면 많이
  const resourceFactor = Math.min(1.0, p.resources / 1500);
  const damagePenalty = Math.max(0.25, 1.0 - p.productionDamage * 0.25);
  
  // 능력치 보정
  let troopMul = 1.0;
  if (p.stats) troopMul = 1.0 + (p.stats.massProduction - 50) / 300;

  // 종족별 보너스
  const raceTroopBonus = p.race === 'zerg' ? 1.4 : p.race === 'protoss' ? 1.1 : 1.0;

  // 기본 생산량: 생산건물 수 × 자원비례 × 능력치 × 종족 (턴당 1~4 정도)
  const baseInc = 1.0 * p.productionFacilities * resourceFactor * damagePenalty * troopMul * raceTroopBonus;
  const variance = 1.0 + (Math.random() - 0.5) * 0.3;
  const actualInc = Math.max(0, baseInc * variance);

  if (actualInc > 0) {
    p.supply = Math.min(GAME_MAX_TROOPS, p.supply + actualInc);

    // 자원 소모: 생산량에 비례 + 생산건물 유지비
    const prodCost = actualInc * (15 + Math.random() * 5);
    const maintenanceCost = p.productionFacilities * (15 + Math.random() * 8);
    p.resources = Math.max(0, p.resources - prodCost - maintenanceCost);

    // 유닛 조합 업데이트 (랜덤 배분)
    const unitsToAdd = Math.round(actualInc);
    for (let i = 0; i < unitsToAdd; i++) {
      const unit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
      p.unitComposition[unit] = (p.unitComposition[unit] ?? 0) + 1;
    }
  } else {
    // 생산 못해도 유지비는 소모
    const maintenanceCost = p.productionFacilities * (8 + Math.random() * 4);
    p.resources = Math.max(0, p.resources - maintenanceCost);
  }
}

// ── 자원 증가 ──

function updateResources(gs: GameState, p: PlayerState): void {
  if (gs.gameEnded) return;
  const strat = p.buildStrategy || "barracks_first";
  const rRate = BUILD_RESOURCE_RATES[strat] || 100;

  let ecoMul = 1.0;
  if (p.stats) ecoMul = 1.0 + (p.stats.economy - 50) / 250;

  const frontPenalty = p.frontBaseDestroyed ? 0.5 : 1.0;
  let harassPenalty = 1.0;
  if (p.harassedTurns > 0) {
    harassPenalty = Math.max(0.6, 1.0 - p.harassedTurns * 0.1);
    p.harassedTurns = Math.max(0, p.harassedTurns - 1);
  }

  const raceResourceBonus = p.race === 'terran' ? 1.4 : p.race === 'protoss' ? 1.25 : 1.0;

  // 자원 = 기본률 × 멀티 수 × 능력치 × 패널티
  const resInc = rRate * 0.8 * p.multiCount * ecoMul * frontPenalty * harassPenalty * raceResourceBonus;
  const resVar = 1.0 + (Math.random() - 0.5) * 0.2;
  p.resources = Math.min(GAME_MAX_RESOURCES, p.resources + resInc * resVar);
}

// ── 종족전 밸런스 ──

function getMatchupBonus(race1: string, race2: string): { p1: number; p2: number } {
  const key = `${race1}-${race2}`;
  switch (key) {
    case "terran-zerg":    return { p1: 1.10, p2: 1.0 };
    case "zerg-terran":    return { p1: 1.0, p2: 1.10 };
    case "terran-protoss": return { p1: 1.0, p2: 1.10 };
    case "protoss-terran": return { p1: 1.10, p2: 1.0 };
    case "zerg-protoss":   return { p1: 1.10, p2: 1.0 };
    case "protoss-zerg":   return { p1: 1.0, p2: 1.10 };
    default:               return { p1: 1.0, p2: 1.0 };
  }
}

// ── 유닛 조합 전투력 계산 ──

function calcCompositionPower(comp: Record<string, number>): number {
  let total = 0;
  for (const [unit, count] of Object.entries(comp)) {
    total += (UNIT_POWER[unit] ?? 1.0) * count;
  }
  return total;
}

function calcCounterBonus(attacker: Record<string, number>, defender: Record<string, number>): number {
  let bonus = 0;
  let totalUnits = 0;
  for (const [atkUnit, atkCount] of Object.entries(attacker)) {
    const counters = UNIT_COUNTERS[atkUnit];
    if (!counters) continue;
    for (const [defUnit, defCount] of Object.entries(defender)) {
      if (counters[defUnit]) {
        bonus += (counters[defUnit] - 1.0) * Math.min(atkCount, defCount);
        totalUnits += Math.min(atkCount, defCount);
      }
    }
  }
  return totalUnits > 0 ? 1.0 + bonus / (totalUnits * 2) : 1.0;
}

// ── 전투 시스템 ──

function resolveEngagement(gs: GameState): { winnerIsP1: boolean; decisive: boolean } {
  const p1 = gs.player1, p2 = gs.player2;

  // 기본 전투력 = 병력 수
  let p1Pow = p1.supply * 1.5;
  let p2Pow = p2.supply * 1.5;

  // 유닛 조합 전투력 보정
  const p1CompPow = calcCompositionPower(p1.unitComposition);
  const p2CompPow = calcCompositionPower(p2.unitComposition);
  if (p1CompPow > 0) p1Pow += p1CompPow * 0.5;
  if (p2CompPow > 0) p2Pow += p2CompPow * 0.5;

  // 유닛 상성 보너스
  p1Pow *= calcCounterBonus(p1.unitComposition, p2.unitComposition);
  p2Pow *= calcCounterBonus(p2.unitComposition, p1.unitComposition);

  // 자원 보정
  p1Pow += p1.resources / 300;
  p2Pow += p2.resources / 300;

  // 능력치 보정
  if (p1.stats) {
    const bonus = (p1.stats.attack * 1.5 + p1.stats.control * 1.2 + p1.stats.strategy + p1.stats.defense * 0.8 + p1.stats.sense * 0.5) / 250;
    p1Pow *= (1 + (bonus - 1) * 0.35);
  }
  if (p2.stats) {
    const bonus = (p2.stats.attack * 1.5 + p2.stats.control * 1.2 + p2.stats.strategy + p2.stats.defense * 0.8 + p2.stats.sense * 0.5) / 250;
    p2Pow *= (1 + (bonus - 1) * 0.35);
  }

  // 랜덤
  p1Pow *= 1 + (Math.random() - 0.5) * 0.16;
  p2Pow *= 1 + (Math.random() - 0.5) * 0.16;

  // 초반 러쉬 방어
  if (gs.turn <= 15) {
    if (p1.stats) p1Pow *= 1.0 + Math.max(0, (p1.stats.scouting - 50)) / 350;
    if (p2.stats) p2Pow *= 1.0 + Math.max(0, (p2.stats.scouting - 50)) / 350;
  }

  // 종족전 + 맵 종족 유불리
  const mb = getMatchupBonus(p1.race, p2.race);
  p1Pow *= mb.p1; p2Pow *= mb.p2;
  if (gs.mapRaceAdvantage) {
    const d = ((gs.mapRaceAdvantage[p1.race] ?? 50) - (gs.mapRaceAdvantage[p2.race] ?? 50)) / 200;
    p1Pow *= 1 + d; p2Pow *= 1 - d;
  }

  const winP1 = p1Pow >= p2Pow;

  // 피해 계산
  const ratio = winP1 ? (p1.supply / Math.max(1, p2.supply)) : (p2.supply / Math.max(1, p1.supply));
  const dom = Math.min(2.0, ratio);
  const winLoss = Math.max(0.05, 0.25 - (dom - 1) * 0.15);
  const loseLoss = Math.min(0.70, 0.30 + (dom - 1) * 0.25);

  if (winP1) {
    p1.supply = Math.max(3, p1.supply - Math.round(p1.supply * winLoss));
    p2.supply = Math.max(3, p2.supply - Math.round(p2.supply * loseLoss));
    p1.resources = Math.max(0, p1.resources - (100 + Math.random() * 200));
    p2.resources = Math.max(0, p2.resources - (300 + Math.random() * 500));
  } else {
    p2.supply = Math.max(3, p2.supply - Math.round(p2.supply * winLoss));
    p1.supply = Math.max(3, p1.supply - Math.round(p1.supply * loseLoss));
    p2.resources = Math.max(0, p2.resources - (100 + Math.random() * 200));
    p1.resources = Math.max(0, p1.resources - (300 + Math.random() * 500));
  }

  // 유닛 조합도 비례 감소
  const loser = winP1 ? p2 : p1;
  for (const unit of Object.keys(loser.unitComposition)) {
    loser.unitComposition[unit] = Math.max(0, Math.round(loser.unitComposition[unit] * (1 - loseLoss)));
  }
  const winner = winP1 ? p1 : p2;
  for (const unit of Object.keys(winner.unitComposition)) {
    winner.unitComposition[unit] = Math.max(0, Math.round(winner.unitComposition[unit] * (1 - winLoss)));
  }

  const loserSupply = winP1 ? p2.supply : p1.supply;
  const decisive = loserSupply <= 15;
  return { winnerIsP1: winP1, decisive };
}

// ── 견제 시스템 ──

function resolveHarass(gs: GameState, attackerId: number): { success: boolean; dmg: number } {
  const attacker = attackerId === 1 ? gs.player1 : gs.player2;
  const defender = attackerId === 1 ? gs.player2 : gs.player1;
  const atkH = attacker.stats?.harassment ?? 50;
  const defS = defender.stats?.scouting ?? 50;
  const defD = defender.stats?.defense ?? 50;
  const chance = 0.5 + (atkH - (defS + defD) / 2) / 400;
  const success = Math.random() < Math.max(0.2, Math.min(0.85, chance));
  if (success) {
    return { success: true, dmg: (250 + Math.random() * 400) * (1.0 + (atkH - 50) / 150) };
  } else {
    return { success: false, dmg: 150 + Math.random() * 250 };
  }
}

// ── 메인 게임 루프 ──

export function progressGame(gs: GameState): void {
  if (gs.gameEnded) return;
  gs.turn++;
  gs.turnCommentaries = [];

  // 턴 1: 빌드 선택
  if (gs.turn === 1) {
    for (const p of [gs.player1, gs.player2]) {
      const strats = getRaceBuildStrategies(p.race);
      const s = strats[Math.floor(Math.random() * strats.length)];
      p.buildStrategy = s;
      p.isRushing = (s === "barracks_first" || s === "gateway_first");
      p.lastAction = { type: s, data: s };
    }
  }

  // 초반 러쉬 판정 (턴 8~12)
  if (gs.turn >= 8 && gs.turn <= 12) {
    for (const [rusher, target] of [[gs.player1, gs.player2], [gs.player2, gs.player1]] as [PlayerState, PlayerState][]) {
      if (rusher.isRushing && !target.isRushing && Math.random() < 0.12) {
        const rushPow = rusher.supply * 1.5 + (rusher.stats?.attack ?? 50) / 5;
        const defPow = target.supply * 1.0 + (target.stats?.defense ?? 50) / 5 + (target.stats?.scouting ?? 50) / 8;
        if (rushPow > defPow * (0.9 + Math.random() * 0.2)) {
          target.supply = Math.max(3, target.supply * 0.4);
          target.resources = Math.max(0, target.resources * 0.5);
          target.baseHealth -= 30 + Math.random() * 20;
          gs.turnCommentaries.push(`${rusher.name} 선수의 초반 러쉬 성공! ${target.name} 선수 큰 피해!`);
          if (target.baseHealth <= 0) {
            gs.gameEnded = true; gs.winner = rusher.id;
            gs.turnCommentaries.push(`${target.name} 선수의 본진 파괴! ${rusher.name} 선수 승리! GG!`);
            return;
          }
        } else {
          rusher.supply = Math.max(3, rusher.supply * 0.6);
          rusher.resources = Math.max(0, rusher.resources * 0.7);
          rusher.isRushing = false;
          gs.turnCommentaries.push(`${target.name} 선수가 러쉬를 완벽 방어! ${rusher.name} 선수 불리!`);
        }
      }
    }
  }

  // 자원 증가
  updateResources(gs, gs.player1);
  updateResources(gs, gs.player2);

  // 건물 건설
  tryBuildAction(gs, gs.player1);
  tryBuildAction(gs, gs.player2);

  // 유닛 생산
  produceUnits(gs, gs.player1);
  produceUnits(gs, gs.player2);

  // 멀티 확장
  for (const p of [gs.player1, gs.player2]) {
    const multiChance = 0.10 + (p.stats ? (p.stats.economy - 50) / 800 + (p.stats.sense - 50) / 1000 : 0);
    const multiCost = 400 + p.multiCount * 200;
    if (p.resources > multiCost + 500 && p.multiCount < 4 && Math.random() < multiChance) {
      p.multiCount++;
      p.resources -= multiCost;
      gs.turnCommentaries.push(`${p.name} 선수가 ${p.multiCount === 2 ? '앞마당' : `${p.multiCount}번째 멀티`}를 확장!`);
    }
  }

  // 앞마당 복구
  for (const p of [gs.player1, gs.player2]) {
    if (p.frontBaseDestroyed && Math.random() < 0.08 + (p.stats ? (p.stats.defense - 50) / 500 : 0)) {
      p.frontBaseDestroyed = false;
      gs.turnCommentaries.push(`${p.name} 선수가 앞마당을 복구!`);
    }
    if (p.productionDamage > 0 && Math.random() < 0.12) {
      p.productionDamage = Math.max(0, p.productionDamage - 1);
    }
  }

  // 이벤트
  const ctx = {
    turn: gs.turn,
    player1: { id: gs.player1.id, name: gs.player1.name, race: gs.player1.race, supply: gs.player1.supply, resources: gs.player1.resources, multiCount: gs.player1.multiCount },
    player2: { id: gs.player2.id, name: gs.player2.name, race: gs.player2.race, supply: gs.player2.supply, resources: gs.player2.resources, multiCount: gs.player2.multiCount },
    player1Advantage: gs.player1Advantage,
  };
  const evt = generateGameEvent(ctx);
  let decisive = false;

  if (evt) {
    if (evt.type === "engagement") {
      const result = resolveEngagement(gs);
      decisive = result.decisive;
      gs.turnCommentaries.push(evt.commentary);
      if (decisive) {
        gs.turnCommentaries.push(`[중립] ${result.winnerIsP1 ? gs.player1.name : gs.player2.name} 선수의 대승!`);
      }
    } else if (evt.type === "harass") {
      const hr = resolveHarass(gs, evt.playerId);
      const atk = evt.playerId === 1 ? gs.player1 : gs.player2;
      const def = evt.playerId === 1 ? gs.player2 : gs.player1;
      if (hr.success) {
        def.resources = Math.max(0, def.resources - hr.dmg);
        def.supply = Math.max(3, def.supply - Math.round(hr.dmg / 80));
        if (Math.random() < 0.3) def.productionDamage = Math.min(3, def.productionDamage + 1);
        def.harassedTurns = Math.min(4, def.harassedTurns + 2);
        gs.turnCommentaries.push(evt.commentary);
        if (def.resources <= 100) { decisive = true; gs.turnCommentaries.push(`[중립] ${atk.name} 선수의 견제가 치명적!`); }
      } else {
        atk.supply = Math.max(3, atk.supply - Math.round(hr.dmg / 60));
        atk.resources = Math.max(0, atk.resources - hr.dmg * 0.5);
        gs.turnCommentaries.push(`${def.name} 선수가 견제를 방어! ${atk.name} 선수 병력 피해!`);
      }
    } else if (evt.type === "resource_drain") {
      const dr = resolveHarass(gs, evt.playerId);
      const dAtk = evt.playerId === 1 ? gs.player1 : gs.player2;
      const dDef = evt.playerId === 1 ? gs.player2 : gs.player1;
      if (dr.success) {
        dDef.resources = Math.max(0, dDef.resources - dr.dmg * 0.7);
        dDef.harassedTurns = Math.min(4, dDef.harassedTurns + 1);
        gs.turnCommentaries.push(evt.commentary);
      } else {
        dAtk.supply = Math.max(3, dAtk.supply - Math.round(dr.dmg / 80));
        gs.turnCommentaries.push(`${dDef.name} 선수가 자원 견제를 방어!`);
      }
    } else if (evt.type === "multi_destroy") {
      const mAtk = evt.playerId === 1 ? gs.player1 : gs.player2;
      const mDef = evt.playerId === 1 ? gs.player2 : gs.player1;
      if (Math.random() < 0.35 && !mDef.frontBaseDestroyed) {
        mDef.frontBaseDestroyed = true;
        mDef.resources = Math.max(0, mDef.resources * 0.5);
        mDef.supply = Math.max(3, mDef.supply * 0.8);
        gs.turnCommentaries.push(`${mAtk.name} 선수가 앞마당 파괴! 자원/병력 큰 타격!`);
      } else if (mDef.multiCount > 1) {
        mDef.multiCount--;
        mDef.resources = Math.max(0, mDef.resources * 0.6);
        mDef.supply = Math.max(3, mDef.supply * 0.75);
        gs.turnCommentaries.push(`${mAtk.name} 선수가 멀티 파괴! (멀티 ${mDef.multiCount}개)`);
      } else {
        mDef.baseHealth -= 25 + Math.random() * 25;
        mDef.resources = Math.max(0, mDef.resources * 0.4);
        mDef.supply = Math.max(3, mDef.supply * 0.5);
        gs.turnCommentaries.push(`${mAtk.name} 선수가 본진 공격! 심각한 피해!`);
        if (mDef.baseHealth <= 0) {
          gs.gameEnded = true; gs.winner = mAtk.id;
          gs.turnCommentaries.push(`${mDef.name} 선수 본진 파괴! GG!`);
          return;
        }
      }
    } else if (evt.type === "production_hit") {
      const hDef = evt.playerId === 1 ? gs.player2 : gs.player1;
      hDef.productionDamage = Math.min(3, hDef.productionDamage + 1);
      hDef.resources = Math.max(0, hDef.resources - 200);
      if (hDef.productionFacilities > 1 && Math.random() < 0.25) {
        // 생산건물 1개 파괴
        const blds = Object.entries(hDef.productionBuildings).filter(([, c]) => c > 0);
        if (blds.length > 0) {
          const [bName] = blds[Math.floor(Math.random() * blds.length)];
          hDef.productionBuildings[bName]--;
          hDef.productionFacilities--;
          gs.turnCommentaries.push(`생산건물 ${bName} 파괴! (남은 ${hDef.productionFacilities}개)`);
        }
      }
      gs.turnCommentaries.push(evt.commentary);
    } else if (evt.type === "tech_upgrade") {
      gs.turnCommentaries.push(evt.commentary);
    }
  } else if (gs.turn % 5 === 0) {
    gs.turnCommentaries.push(generateSituationCommentary());
  }

  // ── 유불리 계산 ──
  let s1 = gs.player1.supply * 2.0 + gs.player1.resources / 80;
  let s2 = gs.player2.supply * 2.0 + gs.player2.resources / 80;

  // 유닛 조합 전투력 반영
  const c1 = calcCompositionPower(gs.player1.unitComposition);
  const c2 = calcCompositionPower(gs.player2.unitComposition);
  s1 += c1 * 0.3;
  s2 += c2 * 0.3;

  // 프로토스 보정
  if (gs.player1.race === 'protoss') s1 *= 1.12;
  if (gs.player2.race === 'protoss') s2 *= 1.12;

  // 종족전 + 맵 종족 유불리
  const am = getMatchupBonus(gs.player1.race, gs.player2.race);
  s1 *= am.p1; s2 *= am.p2;
  if (gs.mapRaceAdvantage) {
    const d = ((gs.mapRaceAdvantage[gs.player1.race] ?? 50) - (gs.mapRaceAdvantage[gs.player2.race] ?? 50)) / 200;
    s1 *= 1 + d; s2 *= 1 - d;
  }

  // 능력치 보정
  if (gs.player1.stats) {
    const ss = (gs.player1.stats.attack + gs.player1.stats.defense + gs.player1.stats.control + gs.player1.stats.strategy + gs.player1.stats.sense) / 5;
    s1 *= 1 + (ss - 50) / 400;
  }
  if (gs.player2.stats) {
    const ss = (gs.player2.stats.attack + gs.player2.stats.defense + gs.player2.stats.control + gs.player2.stats.strategy + gs.player2.stats.sense) / 5;
    s2 *= 1 + (ss - 50) / 400;
  }

  // 맵 특성 보정
  if (gs.mapTraits && gs.player1.stats && gs.player2.stats) {
    const mt = gs.mapTraits;
    let b1 = 0, b2 = 0;
    if (mt.rushDistance <= 30) {
      const w = (30 - mt.rushDistance) / 30;
      b1 += ((gs.player1.stats.harassment + gs.player1.stats.attack + gs.player1.stats.strategy) / 3 - 50) / 600 * w;
      b2 += ((gs.player2.stats.harassment + gs.player2.stats.attack + gs.player2.stats.strategy) / 3 - 50) / 600 * w;
    }
    if (mt.resources > 55) {
      const w = (mt.resources - 55) / 45;
      b1 += ((gs.player1.stats.massProduction + gs.player1.stats.defense + gs.player1.stats.sense) / 3 - 50) / 600 * w;
      b2 += ((gs.player2.stats.massProduction + gs.player2.stats.defense + gs.player2.stats.sense) / 3 - 50) / 600 * w;
    }
    if (mt.complexity > 55) {
      const w = (mt.complexity - 55) / 45;
      b1 += ((gs.player1.stats.sense + gs.player1.stats.control + gs.player1.stats.scouting) / 3 - 50) / 600 * w;
      b2 += ((gs.player2.stats.sense + gs.player2.stats.control + gs.player2.stats.scouting) / 3 - 50) / 600 * w;
    }
    s1 *= 1 + b1; s2 *= 1 + b2;
  }

  const total = s1 + s2;
  const raw = total > 0 ? (s1 / total) * 100 : 50;
  const blend = Math.max(0, 1 - gs.turn / 15);
  gs.player1Advantage = raw * (1 - blend) + 50 * blend;

  // 게임 종료
  if (gs.player1.baseHealth <= 0 || gs.player2.baseHealth <= 0) {
    gs.gameEnded = true;
    gs.winner = gs.player1.baseHealth <= 0 ? gs.player2.id : gs.player1.id;
    const loser = gs.player1.baseHealth <= 0 ? gs.player1.name : gs.player2.name;
    gs.turnCommentaries.push(`${loser} 선수 본진 파괴! GG!`);
  } else if (gs.turn >= 120 || gs.player1Advantage > 80 || gs.player1Advantage < 20 ||
    (decisive && (gs.player1Advantage > 70 || gs.player1Advantage < 30)) ||
    ((gs.player1.supply <= 10 && gs.player1.resources <= 200) || (gs.player2.supply <= 10 && gs.player2.resources <= 200)) && gs.turn >= 15) {
    gs.gameEnded = true;
    gs.winner = gs.player1Advantage > 50 ? gs.player1.id : gs.player2.id;
  }

  const comms = generateTurnCommentary(gs, gs.player1.name, gs.player2.name);
  if (comms?.length) gs.turnCommentaries.push(...comms);

  if (gs.gameEnded) {
    const end = generateGameEndCommentary(gs.player1.name, gs.player2.name, gs.winner === gs.player1.id);
    if (end) gs.turnCommentaries.push(end);
  }
}

export function progressTurn(gs: GameState): void { progressGame(gs); }

export function gameStateToTurnData(gs: GameState) {
  return {
    turn: gs.turn,
    player1Commentary: [], player2Commentary: [],
    player1Supply: Math.round(gs.player1.supply),
    player1Resources: Math.round(gs.player1.resources),
    player2Supply: Math.round(gs.player2.supply),
    player2Resources: Math.round(gs.player2.resources),
    player1Health: gs.player1.health,
    player2Health: gs.player2.health,
    player1Advantage: gs.player1Advantage,
    commentaries: [...gs.turnCommentaries],
  };
}
