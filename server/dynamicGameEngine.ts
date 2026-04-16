/**
 * 동적 게임 엔진 v18.0
 * 
 * 핵심:
 * 1. 병력과 자원이 많은 사용자가 유리
 * 2. 병력 vs 병력 전투에서 병력 수가 결정적 요소
 * 3. 자원이 많을수록 병력 증가 속도가 빨라짐 (자원 → 병력 변환)
 * 4. 병력 생산 시 자원이 크게 소모됨
 * 5. 견제/멀티/앞마당 파괴 → 자원 수급률 감소
 * 6. 능력치가 좋을수록 멀티/생산기지를 잘 짓고 자원을 많이 모음
 * 7. 생산기지 타격 → 병력 증가량 감소
 * 8. 80% 이상 유리 → 게임 종료
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
  multiCount: number;
  productionFacilities: number;
  /** 앞마당 파괴 여부 - 파괴되면 자원 수급 대폭 감소 */
  frontBaseDestroyed: boolean;
  /** 견제 받는 중 - 자원 수급률 감소 (턴 수 카운트) */
  harassedTurns: number;
  /** 생산기지 피해 수준 (0~3) - 높을수록 병력 생산 감소 */
  productionDamage: number;
  hasObserver: boolean; hasVessel: boolean; hasArbiter: boolean;
  hasRecall: boolean; hasEMP: boolean; hasStasisField: boolean;
  buildStrategy?: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first";
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
      speed: stats.speed || 50, economy: stats.economy || 50,
      sense: stats.sense || 50, control: stats.control || 50,
      harassment: stats.harassment || 50, strategy: stats.strategy || 50,
      scouting: stats.scouting || 50, massProduction: stats.massProduction || 50,
    } : undefined,
    multiCount: 1,
    productionFacilities: 1,
    frontBaseDestroyed: false,
    harassedTurns: 0,
    productionDamage: 0,
    hasObserver: false, hasVessel: false, hasArbiter: false,
    hasRecall: false, hasEMP: false, hasStasisField: false,
    buildOrder: initializeBuildOrder(race),
    producedUnitsFirstTime: new Set(),
    unitsProduced: [],
  };
}

export function initializeGameState(
  p1Id: number, p1Name: string, p1Race: "terran" | "zerg" | "protoss",
  p2Id: number, p2Name: string, p2Race: "terran" | "zerg" | "protoss",
  p1Stats?: Record<string, number>, p2Stats?: Record<string, number>
): GameState {
  return {
    turn: 0, gameEnded: false,
    player1: makePlayer(p1Id, p1Name, p1Race, p1Stats),
    player2: makePlayer(p2Id, p2Name, p2Race, p2Stats),
    player1Advantage: 50,
    player1Events: [], player2Events: [],
    turnCommentaries: [],
  };
}

// ── 빌드 전략 ──────────────────────────────────────────────────

function getRaceBuildStrategies(race: "terran" | "zerg" | "protoss") {
  switch (race) {
    case "terran": return ["barracks_first", "cc_first"] as const;
    case "protoss": return ["gateway_first"] as const;
    case "zerg": return ["hatch_first"] as const;
  }
}

function generatePlayerAction(gs: GameState, p: PlayerState): PlayerAction | null {
  if (gs.turn === 1 && !p.buildStrategy) {
    const strats = getRaceBuildStrategies(p.race);
    const s = strats[Math.floor(Math.random() * strats.length)];
    p.buildStrategy = s;
    return { type: s, data: s };
  }
  const t = gs.turn;
  if (t >= 5 && t <= 15 && p.resources > 400 && Math.random() < 0.25) {
    const bldgs: Record<string, string[]> = {
      terran: ["배럭", "팩토리", "스타포트"],
      protoss: ["게이트웨이", "사이버네틱스 코어", "로보틱스 팩토리"],
      zerg: ["스포닝풀", "레어", "하이브"],
    };
    const list = bldgs[p.race] || [];
    if (list.length) return { type: "building_built", data: list[Math.floor(Math.random() * list.length)] };
  }
  if (t >= 6 && p.resources > 200 && Math.random() < 0.35) {
    const units: Record<string, string[]> = {
      terran: ["마린", "메딕", "파이어뱃", "벌쳐", "탱크"],
      protoss: ["질럿", "드래군", "옵저버", "리버"],
      zerg: ["저글링", "히드라", "뮤탈리스크", "럴커"],
    };
    const list = units[p.race] || [];
    if (list.length) return { type: "unit_produced", data: list[Math.floor(Math.random() * list.length)] };
  }
  return null;
}

// ── 자원/병력 증가 ──────────────────────────────────────────────

function updateResourcesAndTroops(gs: GameState, p: PlayerState): void {
  if (gs.gameEnded) return;
  const strat = p.buildStrategy || "barracks_first";
  const rRate = BUILD_RESOURCE_RATES[strat] || 100;
  const tRate = BUILD_TROOP_RATES[strat] || 1.0;

  // ── 능력치 보정 ──
  // economy 높을수록 자원 수급 빠름 (최대 +50%)
  let ecoMul = 1.0;
  if (p.stats) ecoMul = 1.0 + (p.stats.economy - 50) / 200;
  // massProduction 높을수록 병력 생산 빠름 (최대 +50%)
  let troopMul = 1.0;
  if (p.stats) troopMul = 1.0 + (p.stats.massProduction - 50) / 200;
  // sense 높을수록 멀티 확장/생산기지 건설 확률 증가 (별도 처리)

  // ── 앞마당 파괴 시 자원 수급 50% 감소 ──
  const frontPenalty = p.frontBaseDestroyed ? 0.5 : 1.0;

  // ── 견제 받는 중이면 자원 수급 20~40% 감소 ──
  let harassPenalty = 1.0;
  if (p.harassedTurns > 0) {
    harassPenalty = Math.max(0.6, 1.0 - p.harassedTurns * 0.1);
    p.harassedTurns = Math.max(0, p.harassedTurns - 1); // 매 턴 회복
  }

  // ── 종족별 유불리 ──
  const raceResourceBonus = p.race === 'terran' ? 1.5 : 1.0;
  const raceTroopBonus = p.race === 'zerg' ? 1.5 : 1.0;

  // ── 자원 증가 ──
  // 기본 자원 증가: 빌드 기본률 * 1.5 * 멀티 수 * 능력치 * 패널티들
  const resInc = rRate * 1.5 * p.multiCount * ecoMul * frontPenalty * harassPenalty * raceResourceBonus;
  const resVar = 1.0 + (Math.random() - 0.5) * 0.3;
  p.resources = Math.min(GAME_MAX_RESOURCES, p.resources + resInc * resVar);

  // ── 병력 증가: 자원이 많을수록 빨라짐 ──
  // 자원 기반 병력 생산 속도 보너스: 자원 2000 이상이면 최대 2배
  const resourceSpeedBonus = Math.min(2.0, 1.0 + Math.max(0, p.resources - 500) / 3000);

  // 생산기지 피해 시 병력 생산 감소 (피해 1당 25% 감소, 최대 75% 감소)
  const productionDamagePenalty = Math.max(0.25, 1.0 - p.productionDamage * 0.25);

  // 유효 생산기지 수 = 생산기지 * 피해 패널티
  const effectiveProduction = p.productionFacilities * productionDamagePenalty;

  if (p.resources > 50) {
    const baseTroopInc = 3.5 * effectiveProduction * tRate * troopMul * frontPenalty * raceTroopBonus;
    const troopInc = baseTroopInc * resourceSpeedBonus;
    const troopVar = 1.0 + (Math.random() - 0.5) * 0.3;
    const actualTroopInc = troopInc * troopVar;
    p.supply = Math.min(GAME_MAX_TROOPS, p.supply + actualTroopInc);

    // ── 병력 생산 시 자원 소모: 생산기지가 많을수록 자원 소모도 비례 증가 ──
    // 기본 병력 1당 자원 10~14 소모
    const resourceCostPerTroop = 10 + Math.random() * 4;
    const resourceCost = actualTroopInc * resourceCostPerTroop;
    
    // 생산기지 유지비: 생산기지 1개당 턴마다 자원 15~25 추가 소모
    const facilityMaintenanceCost = p.productionFacilities * (15 + Math.random() * 10);
    
    p.resources = Math.max(0, p.resources - resourceCost - facilityMaintenanceCost);
  } else {
    // 자원이 50 이하면 병력 생산 불가 - 생산기지 유지비만 소모
    const facilityMaintenanceCost = p.productionFacilities * (10 + Math.random() * 5);
    p.resources = Math.max(0, p.resources - facilityMaintenanceCost);
  }
}

// ── 전투 시스템 ──────────────────────────────────────────────────

function resolveEngagement(gs: GameState): { winnerIsP1: boolean; decisive: boolean } {
  const p1 = gs.player1, p2 = gs.player2;

  // ── 병력 수가 전투의 핵심 요소 (70% 비중) ──
  let p1Pow = p1.supply * 2.0;  // 병력 비중 대폭 강화
  let p2Pow = p2.supply * 2.0;

  // ── 자원이 많으면 보급/보충 능력으로 전투력 보너스 (15% 비중) ──
  p1Pow += p1.resources / 200;
  p2Pow += p2.resources / 200;

  // ── 능력치 보정 (최대 ±40%) - 병력 수 다음으로 중요 ──
  if (p1.stats) {
    const bonus = (p1.stats.attack * 1.5 + p1.stats.control * 1.2 + p1.stats.strategy + p1.stats.defense * 0.8 + p1.stats.sense * 0.5) / 250;
    p1Pow *= (1 + (bonus - 1) * 0.4);
  }
  if (p2.stats) {
    const bonus = (p2.stats.attack * 1.5 + p2.stats.control * 1.2 + p2.stats.strategy + p2.stats.defense * 0.8 + p2.stats.sense * 0.5) / 250;
    p2Pow *= (1 + (bonus - 1) * 0.4);
  }

  // ── 랜덤 ±8% (줄여서 병력/능력치 영향력 강화) ──
  p1Pow *= 1 + (Math.random() - 0.5) * 0.16;
  p2Pow *= 1 + (Math.random() - 0.5) * 0.16;

  // 종족별 유불리: 프로토스는 전투 승률 1.5배 높음
  if (p1.race === 'protoss') p1Pow *= 1.5;
  if (p2.race === 'protoss') p2Pow *= 1.5;

  const winP1 = p1Pow >= p2Pow;

  // ── 피해 계산: 병력 차이가 클수록 승자 피해 적고 패자 피해 큼 ──
  const supplyRatio = winP1
    ? (p1.supply / Math.max(1, p2.supply))
    : (p2.supply / Math.max(1, p1.supply));
  const dominance = Math.min(2.0, supplyRatio); // 최대 2배 우세

  // 승자: 병력 우세할수록 적게 잃음 (5~25%)
  const winLoss = Math.max(0.05, 0.25 - (dominance - 1) * 0.15);
  // 패자: 병력 열세할수록 많이 잃음 (30~70%)
  const loseLoss = Math.min(0.70, 0.30 + (dominance - 1) * 0.25);

  const winResLoss = 50 + Math.random() * 150;
  const loseResLoss = 200 + Math.random() * 400;

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

  // 결정적 한방 판정: 패자 병력이 15 이하로 떨어지면 decisive
  const loserSupply = winP1 ? p2.supply : p1.supply;
  const decisive = loserSupply <= 15;

  return { winnerIsP1: winP1, decisive };
}

// ── 메인 게임 루프 ──────────────────────────────────────────────

export function progressGame(gs: GameState): void {
  if (gs.gameEnded) return;
  gs.turn++;
  gs.turnCommentaries = [];

  // 액션
  const a1 = generatePlayerAction(gs, gs.player1);
  const a2 = generatePlayerAction(gs, gs.player2);
  if (a1) gs.player1.lastAction = a1;
  if (a2) gs.player2.lastAction = a2;

  // 자원/병력 증가
  updateResourcesAndTroops(gs, gs.player1);
  updateResourcesAndTroops(gs, gs.player2);

  // ── 멀티 확장: 능력치(economy, sense)가 높을수록 확률 증가 ──
  const p1MultiChance = calcMultiExpandChance(gs.player1);
  const p2MultiChance = calcMultiExpandChance(gs.player2);
  if (gs.player1.resources > 1500 && gs.player1.multiCount < 4 && Math.random() < p1MultiChance) {
    gs.player1.multiCount++;
    gs.player1.resources -= 600;
    gs.turnCommentaries.push(`${gs.player1.name} 선수가 멀티를 확장했습니다! 경제력이 강화됩니다.`);
  }
  if (gs.player2.resources > 1500 && gs.player2.multiCount < 4 && Math.random() < p2MultiChance) {
    gs.player2.multiCount++;
    gs.player2.resources -= 600;
    gs.turnCommentaries.push(`${gs.player2.name} 선수가 멀티를 확장했습니다! 경제력이 강화됩니다.`);
  }

  // ── 생산기지 추가: 능력치(massProduction, strategy)가 높을수록 확률 증가 ──
  // 생산기지가 많으면 병력 생산이 빨라지지만 자원 소모도 빨라짐
  const p1ProdChance = calcProductionBuildChance(gs.player1);
  const p2ProdChance = calcProductionBuildChance(gs.player2);
  if (gs.player1.resources > 1200 && gs.player1.productionFacilities < 6 && Math.random() < p1ProdChance) {
    gs.player1.productionFacilities++;
    gs.player1.resources -= 300;
    const facilityName = gs.player1.race === 'terran' ? '배럭' : gs.player1.race === 'protoss' ? '게이트웨이' : '해처리';
    gs.turnCommentaries.push(`${gs.player1.name} 선수가 ${facilityName}을 추가 건설! 병력 생산이 빨라지지만 자원 소모도 늘어납니다.`);
  }
  if (gs.player2.resources > 1200 && gs.player2.productionFacilities < 6 && Math.random() < p2ProdChance) {
    gs.player2.productionFacilities++;
    gs.player2.resources -= 300;
    const facilityName = gs.player2.race === 'terran' ? '배럭' : gs.player2.race === 'protoss' ? '게이트웨이' : '해처리';
    gs.turnCommentaries.push(`${gs.player2.name} 선수가 ${facilityName}을 추가 건설! 병력 생산이 빨라지지만 자원 소모도 늘어납니다.`);
  }

  // ── 앞마당 복구 (10% 확률, defense 높으면 최대 20%) ──
  if (gs.player1.frontBaseDestroyed) {
    const repairChance = 0.10 + (gs.player1.stats ? (gs.player1.stats.defense - 50) / 500 : 0);
    if (Math.random() < repairChance) {
      gs.player1.frontBaseDestroyed = false;
      gs.turnCommentaries.push(`${gs.player1.name} 선수가 앞마당을 복구했습니다!`);
    }
  }
  if (gs.player2.frontBaseDestroyed) {
    const repairChance = 0.10 + (gs.player2.stats ? (gs.player2.stats.defense - 50) / 500 : 0);
    if (Math.random() < repairChance) {
      gs.player2.frontBaseDestroyed = false;
      gs.turnCommentaries.push(`${gs.player2.name} 선수가 앞마당을 복구했습니다!`);
    }
  }

  // ── 생산기지 피해 복구 (매 턴 자연 회복) ──
  if (gs.player1.productionDamage > 0 && Math.random() < 0.15) {
    gs.player1.productionDamage = Math.max(0, gs.player1.productionDamage - 1);
  }
  if (gs.player2.productionDamage > 0 && Math.random() < 0.15) {
    gs.player2.productionDamage = Math.max(0, gs.player2.productionDamage - 1);
  }

  // 이벤트 생성
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
      // ── 견제: 자원 피해 + 자원 수급률 감소 효과 ──
      const dmg = 300 + Math.random() * 500;
      if (evt.playerId === 1) {
        gs.player2.resources = Math.max(0, gs.player2.resources - dmg);
        // 견제 받으면 2~4턴 동안 자원 수급률 감소
        gs.player2.harassedTurns = Math.min(4, gs.player2.harassedTurns + 2);
      } else {
        gs.player1.resources = Math.max(0, gs.player1.resources - dmg);
        gs.player1.harassedTurns = Math.min(4, gs.player1.harassedTurns + 2);
      }
      // 결정적 견제: 상대 자원이 100 이하로 떨어지면
      const targetRes = evt.playerId === 1 ? gs.player2.resources : gs.player1.resources;
      if (targetRes <= 100) decisive = true;
      gs.turnCommentaries.push(evt.commentary);
      if (decisive) {
        const attacker = evt.playerId === 1 ? gs.player1.name : gs.player2.name;
        gs.turnCommentaries.push(`[중립] ${attacker} 선수의 견제가 치명적이었습니다! 상대 경제가 붕괴되었습니다!`);
      }
    } else if (evt.type === "resource_drain") {
      const drain = 200 + Math.random() * 400;
      if (evt.playerId === 1) {
        gs.player2.resources = Math.max(0, gs.player2.resources - drain);
        // 자원 드레인도 수급률에 영향
        gs.player2.harassedTurns = Math.min(4, gs.player2.harassedTurns + 1);
      } else {
        gs.player1.resources = Math.max(0, gs.player1.resources - drain);
        gs.player1.harassedTurns = Math.min(4, gs.player1.harassedTurns + 1);
      }
      gs.turnCommentaries.push(evt.commentary);
    } else if (evt.type === "multi_destroy") {
      // 멀티 또는 앞마당 파괴
      const destroyFront = Math.random() < 0.4; // 40% 확률로 앞마당 파괴
      if (evt.playerId === 1) {
        if (destroyFront && !gs.player2.frontBaseDestroyed) {
          gs.player2.frontBaseDestroyed = true;
          gs.player2.resources = Math.max(0, gs.player2.resources - 300);
          gs.turnCommentaries.push(`${gs.player1.name} 선수가 상대방의 앞마당을 파괴했습니다! 자원 수급에 큰 타격!`);
        } else if (gs.player2.multiCount > 1) {
          gs.player2.multiCount--;
          gs.player2.resources = Math.max(0, gs.player2.resources - 400);
          gs.turnCommentaries.push(`${gs.player1.name} 선수가 상대방의 멀티를 파괴했습니다! 경제력이 크게 줄었습니다!`);
        } else {
          gs.turnCommentaries.push(evt.commentary);
        }
      } else {
        if (destroyFront && !gs.player1.frontBaseDestroyed) {
          gs.player1.frontBaseDestroyed = true;
          gs.player1.resources = Math.max(0, gs.player1.resources - 300);
          gs.turnCommentaries.push(`${gs.player2.name} 선수가 상대방의 앞마당을 파괴했습니다! 자원 수급에 큰 타격!`);
        } else if (gs.player1.multiCount > 1) {
          gs.player1.multiCount--;
          gs.player1.resources = Math.max(0, gs.player1.resources - 400);
          gs.turnCommentaries.push(`${gs.player2.name} 선수가 상대방의 멀티를 파괴했습니다! 경제력이 크게 줄었습니다!`);
        } else {
          gs.turnCommentaries.push(evt.commentary);
        }
      }
    } else if (evt.type === "production_hit") {
      // ── 생산기지 타격 이벤트 ──
      if (evt.playerId === 1) {
        gs.player2.productionDamage = Math.min(3, gs.player2.productionDamage + 1);
        gs.player2.resources = Math.max(0, gs.player2.resources - 200);
      } else {
        gs.player1.productionDamage = Math.min(3, gs.player1.productionDamage + 1);
        gs.player1.resources = Math.max(0, gs.player1.resources - 200);
      }
      gs.turnCommentaries.push(evt.commentary);
    } else if (evt.type === "tech_upgrade") {
      gs.turnCommentaries.push(evt.commentary);
    }
  } else if (gs.turn % 5 === 0) {
    gs.turnCommentaries.push(generateSituationCommentary());
  }

  // ── 유불리 계산: 병력과 자원이 핵심 요소 ──
  // 병력 비중 60%, 자원 비중 25%, 능력치 비중 15%
  let s1 = gs.player1.supply * 3.0 + gs.player1.resources / 100;
  let s2 = gs.player2.supply * 3.0 + gs.player2.resources / 100;
  
  // 능력치 보정: 전체 능력치 합산의 영향 (최대 ±25%)
  if (gs.player1.stats) {
    const statSum = (gs.player1.stats.attack + gs.player1.stats.defense + gs.player1.stats.control + gs.player1.stats.strategy + gs.player1.stats.sense) / 5;
    s1 *= 1 + (statSum - 50) / 400;
  }
  if (gs.player2.stats) {
    const statSum = (gs.player2.stats.attack + gs.player2.stats.defense + gs.player2.stats.control + gs.player2.stats.strategy + gs.player2.stats.sense) / 5;
    s2 *= 1 + (statSum - 50) / 400;
  }
  
  const total = s1 + s2;
  gs.player1Advantage = total > 0 ? (s1 / total) * 100 : 50;

  // 게임 종료: 80% 이상 유리 or 결정적 한방 후 75% 이상 or 최대 턴
  const endByAdvantage = gs.player1Advantage > 80 || gs.player1Advantage < 20;
  const endByDecisive = decisive && (gs.player1Advantage > 75 || gs.player1Advantage < 25);
  if (gs.turn >= 120 || endByAdvantage || endByDecisive) {
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

// ── 능력치 기반 멀티 확장 확률 ──
function calcMultiExpandChance(p: PlayerState): number {
  // 기본 12%, economy/sense 높으면 최대 25%
  let chance = 0.12;
  if (p.stats) {
    chance += (p.stats.economy - 50) / 800;  // economy 100이면 +6.25%
    chance += (p.stats.sense - 50) / 1000;    // sense 100이면 +5%
  }
  return Math.max(0.05, Math.min(0.25, chance));
}

// ── 능력치 기반 생산기지 건설 확률 ──
function calcProductionBuildChance(p: PlayerState): number {
  // 기본 10%, massProduction/strategy 높으면 최대 22%
  let chance = 0.10;
  if (p.stats) {
    chance += (p.stats.massProduction - 50) / 600;  // massProduction 100이면 +8.3%
    chance += (p.stats.strategy - 50) / 1200;        // strategy 100이면 +4.2%
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
    commentaries: [...gs.turnCommentaries],
  };
}
