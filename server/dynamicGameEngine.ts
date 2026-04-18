/**
 * 동적 게임 엔진 v19.0
 * 
 * 핵심 메커니즘:
 * 1. 본진(1) + 앞마당/멀티로 자원 수급, 멀티가 많을수록 자원 수급량 증가
 * 2. 생산건물(배럭/팩토리/스타포트, 해처리, 게이트/로보/스타게이트)을 지어야 병력 생산
 * 3. 생산건물이 많을수록 병력 생산↑ + 자원 소모↑
 * 4. 비생산건물(사이버네틱스코어, 스포닝풀, 레어 등)은 1번만 건설
 * 5. 견제 성공 → 상대 병력/자원/생산기지 피해, 실패 → 공격자 피해
 * 6. 본진 파괴 → 즉시 게임 종료
 * 7. 앞마당/멀티 파괴 → 병력/자원 대폭 감소, 자원 수급량 해당 멀티 이전으로 복귀
 * 8. 초반 러쉬 빌드 → 상대가 무난한 빌드(멀티)면 유리, 막히면 불리
 * 9. 종족전 밸런스: T vs Z 55:45, T vs P 45:55, Z vs P 55:45
 * 10. 맵 종족 유불리 + 맵 특성(러쉬거리/자원/복잡도) 반영
 */

import { generateTurnCommentary, generateGameEndCommentary } from "./conciseCommentary";
import {
  initializeBuildOrder,
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
  /** 멀티 수 (본진 포함, 최소 1) */
  multiCount: number;
  /** 생산건물 수 */
  productionFacilities: number;
  /** 앞마당 파괴 여부 */
  frontBaseDestroyed: boolean;
  /** 견제 받는 중 (턴 수 카운트) */
  harassedTurns: number;
  /** 생산기지 피해 수준 (0~3) */
  productionDamage: number;
  /** 본진 체력 (0이 되면 게임 종료) */
  baseHealth: number;
  /** 비생산 건물 건설 여부 */
  builtTechBuildings: Set<string>;
  hasObserver: boolean; hasVessel: boolean; hasArbiter: boolean;
  hasRecall: boolean; hasEMP: boolean; hasStasisField: boolean;
  buildStrategy?: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first";
  /** 초반 러쉬 빌드 사용 여부 */
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

function makePlayer(
  id: number, name: string, race: "terran" | "zerg" | "protoss",
  stats?: Record<string, number>
): PlayerState {
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
    productionFacilities: 1,
    frontBaseDestroyed: false,
    harassedTurns: 0,
    productionDamage: 0,
    baseHealth: 100,
    builtTechBuildings: new Set(),
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

// ── 종족별 생산건물 / 비생산건물 정의 ──

const PRODUCTION_BUILDINGS: Record<string, string[]> = {
  terran: ["배럭", "팩토리", "스타포트"],
  protoss: ["게이트웨이", "로보틱스 팩토리", "스타게이트"],
  zerg: ["해처리"],
};

const TECH_BUILDINGS: Record<string, string[]> = {
  terran: ["엔지니어링 베이", "아카데미", "아머리", "사이언스 퍼실리티"],
  protoss: ["사이버네틱스 코어", "템플러 아카이브", "플릿 비콘", "옵저버토리"],
  zerg: ["스포닝풀", "레어", "하이브", "에볼루션 챔버"],
};

// ── 빌드 전략 ──

function getRaceBuildStrategies(race: "terran" | "zerg" | "protoss") {
  switch (race) {
    case "terran": return ["barracks_first", "cc_first"] as const;
    case "protoss": return ["gateway_first"] as const;
    case "zerg": return ["hatch_first"] as const;
  }
}

function isRushBuild(strategy: string): boolean {
  return strategy === "barracks_first" || strategy === "gateway_first";
}

// ── 건물 건설 액션 ──

function tryBuildAction(gs: GameState, p: PlayerState): void {
  const t = gs.turn;
  
  // 비생산 건물: 1번만 건설 (턴 5~15, 자원 400 이상)
  if (t >= 5 && t <= 20 && p.resources > 400) {
    const techList = TECH_BUILDINGS[p.race] || [];
    const unbuilt = techList.filter(b => !p.builtTechBuildings.has(b));
    if (unbuilt.length > 0 && Math.random() < 0.15) {
      const building = unbuilt[Math.floor(Math.random() * unbuilt.length)];
      p.builtTechBuildings.add(building);
      p.resources -= 200;
      gs.turnCommentaries.push(`${p.name} 선수가 ${building}을 건설했습니다.`);
    }
  }
  
  // 생산건물 추가: 자원 충분하고 확률 통과 시
  const prodChance = calcProductionBuildChance(p);
  if (p.resources > 800 && p.productionFacilities < 8 && Math.random() < prodChance) {
    const prodList = PRODUCTION_BUILDINGS[p.race] || [];
    const building = prodList[Math.floor(Math.random() * prodList.length)];
    const cost = 300 + p.productionFacilities * 50; // 생산건물이 많을수록 비용 증가
    if (p.resources >= cost) {
      p.productionFacilities++;
      p.resources -= cost;
      gs.turnCommentaries.push(`${p.name} 선수가 ${building}을 추가 건설! (생산건물 ${p.productionFacilities}개) 병력 생산이 빨라지지만 자원 소모도 늘어납니다.`);
    }
  }
}

// ── 유닛 생산 액션 ──

function tryUnitAction(gs: GameState, p: PlayerState): void {
  if (gs.turn >= 6 && p.resources > 200 && Math.random() < 0.35) {
    const units: Record<string, string[]> = {
      terran: ["마린", "메딕", "파이어뱃", "벌쳐", "탱크"],
      protoss: ["질럿", "드래군", "옵저버", "리버"],
      zerg: ["저글링", "히드라", "뮤탈리스크", "럴커"],
    };
    const list = units[p.race] || [];
    if (list.length) {
      const unit = list[Math.floor(Math.random() * list.length)];
      p.lastAction = { type: "unit_produced", data: unit };
    }
  }
}

// ── 자원/병력 증가 ──

function updateResourcesAndTroops(gs: GameState, p: PlayerState): void {
  if (gs.gameEnded) return;
  const strat = p.buildStrategy || "barracks_first";
  const rRate = BUILD_RESOURCE_RATES[strat] || 100;
  const tRate = BUILD_TROOP_RATES[strat] || 1.0;

  // 능력치 보정
  let ecoMul = 1.0;
  if (p.stats) ecoMul = 1.0 + (p.stats.economy - 50) / 200;
  let troopMul = 1.0;
  if (p.stats) {
    troopMul = 1.0 + (p.stats.massProduction - 50) / 200 + (p.stats.massProduction - 50) / 350;
  }

  // 앞마당 파괴 시 자원 수급 50% 감소
  const frontPenalty = p.frontBaseDestroyed ? 0.5 : 1.0;

  // 견제 받는 중이면 자원 수급 감소
  let harassPenalty = 1.0;
  if (p.harassedTurns > 0) {
    harassPenalty = Math.max(0.6, 1.0 - p.harassedTurns * 0.1);
    p.harassedTurns = Math.max(0, p.harassedTurns - 1);
  }

  // 종족별 보너스
  const raceResourceBonus = p.race === 'terran' ? 1.5 : p.race === 'protoss' ? 1.3 : 1.0;
  const raceTroopBonus = p.race === 'zerg' ? 1.5 : p.race === 'protoss' ? 1.15 : 1.0;

  // ── 자원 증가: 멀티 수에 비례 (본진=1, 앞마당=2, 멀티=3...) ──
  const resInc = rRate * 1.2 * p.multiCount * ecoMul * frontPenalty * harassPenalty * raceResourceBonus;
  const resVar = 1.0 + (Math.random() - 0.5) * 0.2;
  p.resources = Math.min(GAME_MAX_RESOURCES, p.resources + resInc * resVar);

  // ── 병력 증가: 생산건물 수 × 자원 기반 ──
  const productionDamagePenalty = Math.max(0.25, 1.0 - p.productionDamage * 0.25);
  const effectiveProduction = p.productionFacilities * productionDamagePenalty;

  if (p.resources > 100) {
    const baseTroopInc = 3.0 * effectiveProduction * tRate * troopMul * frontPenalty * raceTroopBonus;
    const troopVar = 1.0 + (Math.random() - 0.5) * 0.2;
    const actualTroopInc = baseTroopInc * troopVar;
    p.supply = Math.min(GAME_MAX_TROOPS, p.supply + actualTroopInc);

    // 병력 생산 시 자원 소모 (생산건물 많을수록 소모 증가)
    const resourceCostPerTroop = 12 + Math.random() * 4;
    const resourceCost = actualTroopInc * resourceCostPerTroop;
    // 생산건물 유지비
    const facilityMaintenanceCost = p.productionFacilities * (20 + Math.random() * 10);
    p.resources = Math.max(0, p.resources - resourceCost - facilityMaintenanceCost);
  } else {
    // 자원 부족 시 병력 생산 불가, 유지비만 소모
    const facilityMaintenanceCost = p.productionFacilities * (10 + Math.random() * 5);
    p.resources = Math.max(0, p.resources - facilityMaintenanceCost);
  }
}

// ── 종족전 밸런스 보정 ──
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

// ── 전투 시스템 ──

function resolveEngagement(gs: GameState): { winnerIsP1: boolean; decisive: boolean } {
  const p1 = gs.player1, p2 = gs.player2;

  let p1Pow = p1.supply * 2.0;
  let p2Pow = p2.supply * 2.0;

  p1Pow += p1.resources / 200;
  p2Pow += p2.resources / 200;

  if (p1.stats) {
    const bonus = (p1.stats.attack * 1.5 + p1.stats.control * 1.2 + p1.stats.strategy + p1.stats.defense * 0.8 + p1.stats.sense * 0.5) / 250;
    p1Pow *= (1 + (bonus - 1) * 0.4);
  }
  if (p2.stats) {
    const bonus = (p2.stats.attack * 1.5 + p2.stats.control * 1.2 + p2.stats.strategy + p2.stats.defense * 0.8 + p2.stats.sense * 0.5) / 250;
    p2Pow *= (1 + (bonus - 1) * 0.4);
  }

  p1Pow *= 1 + (Math.random() - 0.5) * 0.16;
  p2Pow *= 1 + (Math.random() - 0.5) * 0.16;

  // 초반 러쉬 방어: scouting 높으면 초반 교전에서 방어 보너스
  if (gs.turn <= 15) {
    if (p1.stats) p1Pow *= 1.0 + Math.max(0, (p1.stats.scouting - 50)) / 350;
    if (p2.stats) p2Pow *= 1.0 + Math.max(0, (p2.stats.scouting - 50)) / 350;
  }

  // 종족전 밸런스
  const matchupBonus = getMatchupBonus(p1.race, p2.race);
  p1Pow *= matchupBonus.p1;
  p2Pow *= matchupBonus.p2;

  // 맵 종족 유불리
  if (gs.mapRaceAdvantage) {
    const p1MapAdv = gs.mapRaceAdvantage[p1.race] ?? 50;
    const p2MapAdv = gs.mapRaceAdvantage[p2.race] ?? 50;
    const mapAdvDiff = (p1MapAdv - p2MapAdv) / 200;
    p1Pow *= 1 + mapAdvDiff;
    p2Pow *= 1 - mapAdvDiff;
  }

  const winP1 = p1Pow >= p2Pow;

  const supplyRatio = winP1
    ? (p1.supply / Math.max(1, p2.supply))
    : (p2.supply / Math.max(1, p1.supply));
  const dominance = Math.min(2.0, supplyRatio);

  const winLoss = Math.max(0.05, 0.25 - (dominance - 1) * 0.15);
  const loseLoss = Math.min(0.70, 0.30 + (dominance - 1) * 0.25);

  const winResLoss = 100 + Math.random() * 200 + (winP1 ? p1.supply : p2.supply) * 1.5;
  const loseResLoss = 300 + Math.random() * 500 + (winP1 ? p2.supply : p1.supply) * 2.0;

  if (winP1) {
    p1.supply = Math.max(3, p1.supply - Math.round(p1.supply * winLoss));
    p2.supply = Math.max(3, p2.supply - Math.round(p2.supply * loseLoss));
    p1.resources = Math.max(0, p1.resources - winResLoss);
    p2.resources = Math.max(0, p2.resources - loseResLoss);
  } else {
    p2.supply = Math.max(3, p2.supply - Math.round(p2.supply * winLoss));
    p1.supply = Math.max(3, p1.supply - Math.round(p1.supply * loseLoss));
    p2.resources = Math.max(0, p2.resources - winResLoss);
    p1.resources = Math.max(0, p1.resources - loseResLoss);
  }

  const loserSupply = winP1 ? p2.supply : p1.supply;
  const loserResources = winP1 ? p2.resources : p1.resources;
  const loserTotal = loserSupply + loserResources / 100;
  const decisive = loserSupply <= 15 || loserTotal <= 20;

  return { winnerIsP1: winP1, decisive };
}

// ── 견제 시스템 (성공/실패 판정) ──

function resolveHarass(gs: GameState, attackerId: number): { success: boolean; dmg: number } {
  const attacker = attackerId === 1 ? gs.player1 : gs.player2;
  const defender = attackerId === 1 ? gs.player2 : gs.player1;

  // 성공 확률: 공격자 harassment vs 방어자 scouting+defense
  const atkHarass = attacker.stats?.harassment ?? 50;
  const defScout = defender.stats?.scouting ?? 50;
  const defDef = defender.stats?.defense ?? 50;
  
  const successChance = 0.5 + (atkHarass - (defScout + defDef) / 2) / 400;
  const success = Math.random() < Math.max(0.2, Math.min(0.85, successChance));

  if (success) {
    const harassBonus = 1.0 + (atkHarass - 50) / 150;
    const dmg = (300 + Math.random() * 500) * harassBonus;
    return { success: true, dmg };
  } else {
    // 실패 시 공격자가 피해
    const failDmg = 150 + Math.random() * 300;
    return { success: false, dmg: failDmg };
  }
}

// ── 메인 게임 루프 ──

export function progressGame(gs: GameState): void {
  if (gs.gameEnded) return;
  gs.turn++;
  gs.turnCommentaries = [];

  // ── 초반 빌드 선택 (턴 1) ──
  if (gs.turn === 1) {
    for (const p of [gs.player1, gs.player2]) {
      const strats = getRaceBuildStrategies(p.race);
      const s = strats[Math.floor(Math.random() * strats.length)];
      p.buildStrategy = s;
      p.isRushing = isRushBuild(s);
      p.lastAction = { type: s, data: s };
    }
  }

  // ── 초반 러쉬 판정 (턴 8~12) ──
  if (gs.turn >= 8 && gs.turn <= 12) {
    for (const [rusher, target] of [[gs.player1, gs.player2], [gs.player2, gs.player1]] as [PlayerState, PlayerState][]) {
      if (rusher.isRushing && !target.isRushing && Math.random() < 0.15) {
        // 러쉬 vs 멀티 빌드: 러쉬 성공/실패 판정
        const rushPow = rusher.supply * 1.5 + (rusher.stats?.attack ?? 50) / 5;
        const defPow = target.supply * 1.0 + (target.stats?.defense ?? 50) / 5 + (target.stats?.scouting ?? 50) / 8;
        const rushSuccess = rushPow > defPow * (0.9 + Math.random() * 0.2);
        
        if (rushSuccess) {
          target.supply = Math.max(3, target.supply * 0.4);
          target.resources = Math.max(0, target.resources * 0.5);
          target.baseHealth -= 30 + Math.random() * 20;
          gs.turnCommentaries.push(`${rusher.name} 선수의 초반 러쉬가 성공! ${target.name} 선수가 큰 피해를 입었습니다!`);
          if (target.baseHealth <= 0) {
            gs.gameEnded = true;
            gs.winner = rusher.id;
            gs.turnCommentaries.push(`${rusher.name} 선수의 러쉬로 ${target.name} 선수의 본진이 파괴되었습니다! GG!`);
            return;
          }
        } else {
          rusher.supply = Math.max(3, rusher.supply * 0.6);
          rusher.resources = Math.max(0, rusher.resources * 0.7);
          rusher.isRushing = false;
          gs.turnCommentaries.push(`${target.name} 선수가 ${rusher.name} 선수의 러쉬를 완벽하게 방어! 러쉬 실패로 ${rusher.name} 선수가 불리해졌습니다.`);
        }
      }
    }
  }

  // 자원/병력 증가
  updateResourcesAndTroops(gs, gs.player1);
  updateResourcesAndTroops(gs, gs.player2);

  // 건물 건설
  tryBuildAction(gs, gs.player1);
  tryBuildAction(gs, gs.player2);

  // 유닛 생산 액션
  tryUnitAction(gs, gs.player1);
  tryUnitAction(gs, gs.player2);

  // ── 멀티 확장 ──
  for (const p of [gs.player1, gs.player2]) {
    const multiChance = calcMultiExpandChance(p);
    const multiCost = 400 + p.multiCount * 200; // 멀티가 많을수록 비용 증가
    if (p.resources > multiCost + 500 && p.multiCount < 4 && Math.random() < multiChance) {
      p.multiCount++;
      p.resources -= multiCost;
      gs.turnCommentaries.push(`${p.name} 선수가 ${p.multiCount === 2 ? '앞마당' : `${p.multiCount}번째 멀티`}를 확장! 자원 수급이 늘어납니다.`);
    }
  }

  // ── 앞마당 복구 ──
  for (const p of [gs.player1, gs.player2]) {
    if (p.frontBaseDestroyed) {
      const repairChance = 0.08 + (p.stats ? (p.stats.defense - 50) / 500 : 0);
      if (Math.random() < repairChance) {
        p.frontBaseDestroyed = false;
        gs.turnCommentaries.push(`${p.name} 선수가 앞마당을 복구했습니다!`);
      }
    }
    if (p.productionDamage > 0 && Math.random() < 0.12) {
      p.productionDamage = Math.max(0, p.productionDamage - 1);
    }
  }

  // ── 이벤트 생성 ──
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
        const winner = result.winnerIsP1 ? gs.player1.name : gs.player2.name;
        gs.turnCommentaries.push(`[중립] ${winner} 선수의 대승! 결정적인 전투였습니다!`);
      }
    } else if (evt.type === "harass") {
      // 견제: 성공/실패 판정
      const harassResult = resolveHarass(gs, evt.playerId);
      const attacker = evt.playerId === 1 ? gs.player1 : gs.player2;
      const defender = evt.playerId === 1 ? gs.player2 : gs.player1;
      
      if (harassResult.success) {
        // 견제 성공: 상대 자원/병력/생산기지 피해
        defender.resources = Math.max(0, defender.resources - harassResult.dmg);
        defender.supply = Math.max(3, defender.supply - Math.round(harassResult.dmg / 80));
        if (Math.random() < 0.3) {
          defender.productionDamage = Math.min(3, defender.productionDamage + 1);
        }
        const harassDuration = defender.stats ? Math.max(1, 2 - Math.floor((defender.stats.scouting - 50) / 200)) : 2;
        defender.harassedTurns = Math.min(4, defender.harassedTurns + harassDuration);
        gs.turnCommentaries.push(evt.commentary);
        
        if (defender.resources <= 100) {
          decisive = true;
          gs.turnCommentaries.push(`[중립] ${attacker.name} 선수의 견제가 치명적이었습니다! 상대 경제가 붕괴!`);
        }
      } else {
        // 견제 실패: 공격자가 병력/자원 피해
        attacker.supply = Math.max(3, attacker.supply - Math.round(harassResult.dmg / 60));
        attacker.resources = Math.max(0, attacker.resources - harassResult.dmg * 0.5);
        gs.turnCommentaries.push(`${defender.name} 선수가 ${attacker.name} 선수의 견제를 방어! 오히려 견제 병력이 큰 피해를 입었습니다.`);
      }
    } else if (evt.type === "resource_drain") {
      const drainResult = resolveHarass(gs, evt.playerId);
      const drainAttacker = evt.playerId === 1 ? gs.player1 : gs.player2;
      const drainDefender = evt.playerId === 1 ? gs.player2 : gs.player1;
      if (drainResult.success) {
        drainDefender.resources = Math.max(0, drainDefender.resources - drainResult.dmg * 0.7);
        drainDefender.harassedTurns = Math.min(4, drainDefender.harassedTurns + 1);
        gs.turnCommentaries.push(evt.commentary);
      } else {
        drainAttacker.supply = Math.max(3, drainAttacker.supply - Math.round(drainResult.dmg / 80));
        gs.turnCommentaries.push(`${drainDefender.name} 선수가 자원 견제를 방어했습니다.`);
      }
    } else if (evt.type === "multi_destroy") {
      // 멀티/앞마당 파괴: 자원 수급량이 해당 멀티 이전으로 복귀
      const destroyFront = Math.random() < 0.35;
      const atkPlayer = evt.playerId === 1 ? gs.player1 : gs.player2;
      const defPlayer = evt.playerId === 1 ? gs.player2 : gs.player1;
      
      if (destroyFront && !defPlayer.frontBaseDestroyed) {
        defPlayer.frontBaseDestroyed = true;
        defPlayer.resources = Math.max(0, defPlayer.resources * 0.5);
        defPlayer.supply = Math.max(3, defPlayer.supply * 0.8);
        gs.turnCommentaries.push(`${atkPlayer.name} 선수가 ${defPlayer.name} 선수의 앞마당을 파괴! 자원 수급과 병력에 큰 타격!`);
      } else if (defPlayer.multiCount > 1) {
        defPlayer.multiCount--;
        defPlayer.resources = Math.max(0, defPlayer.resources * 0.6);
        defPlayer.supply = Math.max(3, defPlayer.supply * 0.75);
        gs.turnCommentaries.push(`${atkPlayer.name} 선수가 ${defPlayer.name} 선수의 멀티를 파괴! 자원 수급이 크게 줄었습니다. (멀티 ${defPlayer.multiCount}개)`);
      } else {
        // 본진 공격
        defPlayer.baseHealth -= 25 + Math.random() * 25;
        defPlayer.resources = Math.max(0, defPlayer.resources * 0.4);
        defPlayer.supply = Math.max(3, defPlayer.supply * 0.5);
        gs.turnCommentaries.push(`${atkPlayer.name} 선수가 ${defPlayer.name} 선수의 본진을 공격! 심각한 피해!`);
        if (defPlayer.baseHealth <= 0) {
          gs.gameEnded = true;
          gs.winner = atkPlayer.id;
          gs.turnCommentaries.push(`${defPlayer.name} 선수의 본진이 파괴되었습니다! ${atkPlayer.name} 선수 승리! GG!`);
          return;
        }
      }
    } else if (evt.type === "production_hit") {
      const hitPlayer = evt.playerId === 1 ? gs.player2 : gs.player1;
      hitPlayer.productionDamage = Math.min(3, hitPlayer.productionDamage + 1);
      hitPlayer.resources = Math.max(0, hitPlayer.resources - 200);
      if (hitPlayer.productionFacilities > 1 && Math.random() < 0.25) {
        hitPlayer.productionFacilities--;
        gs.turnCommentaries.push(`생산건물이 파괴되었습니다! (남은 생산건물 ${hitPlayer.productionFacilities}개)`);
      }
      gs.turnCommentaries.push(evt.commentary);
    } else if (evt.type === "tech_upgrade") {
      gs.turnCommentaries.push(evt.commentary);
    }
  } else if (gs.turn % 5 === 0) {
    gs.turnCommentaries.push(generateSituationCommentary());
  }

  // ── 유불리 계산 ──
  let s1 = gs.player1.supply * 2.5 + gs.player1.resources / 60;
  let s2 = gs.player2.supply * 2.5 + gs.player2.resources / 60;
  
  // 프로토스 유불리 보정
  if (gs.player1.race === 'protoss') s1 *= 1.15;
  if (gs.player2.race === 'protoss') s2 *= 1.15;
  
  // 종족전 밸런스
  const advMatchup = getMatchupBonus(gs.player1.race, gs.player2.race);
  s1 *= advMatchup.p1;
  s2 *= advMatchup.p2;
  
  // 맵 종족 유불리
  if (gs.mapRaceAdvantage) {
    const p1MapAdv = gs.mapRaceAdvantage[gs.player1.race] ?? 50;
    const p2MapAdv = gs.mapRaceAdvantage[gs.player2.race] ?? 50;
    const mapAdvDiff = (p1MapAdv - p2MapAdv) / 200;
    s1 *= 1 + mapAdvDiff;
    s2 *= 1 - mapAdvDiff;
  }

  // 능력치 보정
  if (gs.player1.stats) {
    const statSum = (gs.player1.stats.attack + gs.player1.stats.defense + gs.player1.stats.control + gs.player1.stats.strategy + gs.player1.stats.sense) / 5;
    s1 *= 1 + (statSum - 50) / 400;
  }
  if (gs.player2.stats) {
    const statSum = (gs.player2.stats.attack + gs.player2.stats.defense + gs.player2.stats.control + gs.player2.stats.strategy + gs.player2.stats.sense) / 5;
    s2 *= 1 + (statSum - 50) / 400;
  }
  
  // 맵 특성 보정
  if (gs.mapTraits && gs.player1.stats && gs.player2.stats) {
    const mt = gs.mapTraits;
    let mapBonus1 = 0, mapBonus2 = 0;
    if (mt.rushDistance <= 30) {
      const w = (30 - mt.rushDistance) / 30;
      mapBonus1 += ((gs.player1.stats.harassment + gs.player1.stats.attack + gs.player1.stats.strategy) / 3 - 50) / 600 * w;
      mapBonus2 += ((gs.player2.stats.harassment + gs.player2.stats.attack + gs.player2.stats.strategy) / 3 - 50) / 600 * w;
    }
    if (mt.resources > 55) {
      const w = (mt.resources - 55) / 45;
      mapBonus1 += ((gs.player1.stats.massProduction + gs.player1.stats.defense + gs.player1.stats.sense) / 3 - 50) / 600 * w;
      mapBonus2 += ((gs.player2.stats.massProduction + gs.player2.stats.defense + gs.player2.stats.sense) / 3 - 50) / 600 * w;
    }
    if (mt.complexity > 55) {
      const w = (mt.complexity - 55) / 45;
      mapBonus1 += ((gs.player1.stats.sense + gs.player1.stats.control + gs.player1.stats.scouting) / 3 - 50) / 600 * w;
      mapBonus2 += ((gs.player2.stats.sense + gs.player2.stats.control + gs.player2.stats.scouting) / 3 - 50) / 600 * w;
    }
    s1 *= 1 + mapBonus1;
    s2 *= 1 + mapBonus2;
  }
  
  const total = s1 + s2;
  const rawAdvantage = total > 0 ? (s1 / total) * 100 : 50;
  const blendFactor = Math.max(0, 1 - gs.turn / 15);
  gs.player1Advantage = rawAdvantage * (1 - blendFactor) + 50 * blendFactor;

  // ── 게임 종료 조건 ──
  const endByAdvantage = gs.player1Advantage > 80 || gs.player1Advantage < 20;
  const endByDecisive = decisive && (gs.player1Advantage > 70 || gs.player1Advantage < 30);
  const p1Collapsed = gs.player1.supply <= 10 && gs.player1.resources <= 200;
  const p2Collapsed = gs.player2.supply <= 10 && gs.player2.resources <= 200;
  const endByCollapse = (p1Collapsed || p2Collapsed) && gs.turn >= 15;
  // 본진 체력 0 이하
  const p1BaseDead = gs.player1.baseHealth <= 0;
  const p2BaseDead = gs.player2.baseHealth <= 0;
  
  if (p1BaseDead || p2BaseDead) {
    gs.gameEnded = true;
    gs.winner = p1BaseDead ? gs.player2.id : gs.player1.id;
    const loser = p1BaseDead ? gs.player1.name : gs.player2.name;
    const winner = p1BaseDead ? gs.player2.name : gs.player1.name;
    gs.turnCommentaries.push(`${loser} 선수의 본진이 파괴되었습니다! ${winner} 선수 승리! GG!`);
  } else if (gs.turn >= 120 || endByAdvantage || endByDecisive || endByCollapse) {
    gs.gameEnded = true;
    gs.winner = gs.player1Advantage > 50 ? gs.player1.id : gs.player2.id;
  }

  // 턴별 해설
  const comms = generateTurnCommentary(gs, gs.player1.name, gs.player2.name);
  if (comms?.length) gs.turnCommentaries.push(...comms);

  // 종료 해설
  if (gs.gameEnded) {
    const isP1Win = gs.winner === gs.player1.id;
    const end = generateGameEndCommentary(gs.player1.name, gs.player2.name, isP1Win);
    if (end) gs.turnCommentaries.push(end);
  }
}

// ── 능력치 기반 확률 계산 ──

function calcMultiExpandChance(p: PlayerState): number {
  let chance = 0.12;
  if (p.stats) {
    chance += (p.stats.economy - 50) / 800;
    chance += (p.stats.sense - 50) / 1000;
  }
  return Math.max(0.05, Math.min(0.25, chance));
}

function calcProductionBuildChance(p: PlayerState): number {
  let chance = 0.10;
  if (p.stats) {
    chance += (p.stats.massProduction - 50) / 600;
    chance += (p.stats.strategy - 50) / 1200;
  }
  return Math.max(0.05, Math.min(0.22, chance));
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
