/**
 * 동적 게임 엔진 v11.0 - 스타크래프트 실제 메커니즘 반영
 * 
 * 핵심 메커니즘:
 * 1. 초반 빌드 선택만 해설 (큰 흐름)
 * 2. 병력/자원 독립 시뮬레이션 (해설과 분리)
 * 3. 빌드별 자원/병력 증가률 차등 (CC먼저 > 배럭먼저)
 * 4. 병력 최대 200, 자원 최대 20000
 * 5. 그래프 부드러운 변화 (선형 보간)
 * 6. 현재 상황 해설 (누가 유리한지)
 * 7. 게임 종료 해설 필수
 * 8. 턴 표시 제거
 */

import { generateTurnCommentary, generateGameEndCommentary } from "./conciseCommentary";
import {
  initializeBuildOrder,
  updateBuildOrder,
  canBuildBuilding,
  canProduceUnit,
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
  
  // 선수 능력치
  stats?: {
    attack: number;
    defense: number;
    speed: number;
    economy: number;
    sense: number;
    control: number;
    harassment: number;
    strategy: number;
    scouting: number;
    massProduction: number;
  };
  
  // 경제 시스템
  multiCount: number;
  productionFacilities: number;
  
  // 기술 시스템
  hasObserver: boolean;
  hasVessel: boolean;
  hasArbiter: boolean;
  hasRecall: boolean;
  hasEMP: boolean;
  hasStasisField: boolean;
  
  // 빌드 선택
  buildStrategy?: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first";
  
  // 빌드 오더 시스템
  buildOrder: BuildOrderState;
  producedUnitsFirstTime: Set<string>;
  
  // 게임 진행 기록
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
  
  // 게임 진행 기록 (능력치 변동 계산용)
  player1Events: string[];
  player2Events: string[];
  allCommentaries: string[];
}

/**
 * 게임 상태 초기화
 */
export function initializeGameState(
  player1Id: number,
  player1Name: string,
  player1Race: "terran" | "zerg" | "protoss",
  player2Id: number,
  player2Name: string,
  player2Race: "terran" | "zerg" | "protoss",
  player1Stats?: Record<string, number>,
  player2Stats?: Record<string, number>
): GameState {
  return {
    turn: 0,
    gameEnded: false,
    player1: {
      id: player1Id,
      name: player1Name,
      race: player1Race,
      supply: GAME_INITIAL_TROOPS,
      resources: GAME_INITIAL_RESOURCES,
      health: 100,
      stats: player1Stats ? {
        attack: player1Stats.attack || 50,
        defense: player1Stats.defense || 50,
        speed: player1Stats.speed || 50,
        economy: player1Stats.economy || 50,
        sense: player1Stats.sense || 50,
        control: player1Stats.control || 50,
        harassment: player1Stats.harassment || 50,
        strategy: player1Stats.strategy || 50,
        scouting: player1Stats.scouting || 50,
        massProduction: player1Stats.massProduction || 50,
      } : undefined,
      multiCount: 1,
      productionFacilities: 0,
      hasObserver: false,
      hasVessel: false,
      hasArbiter: false,
      hasRecall: false,
      hasEMP: false,
      hasStasisField: false,
      buildOrder: initializeBuildOrder(player1Race),
      producedUnitsFirstTime: new Set(),
      unitsProduced: [],
    },
    player2: {
      id: player2Id,
      name: player2Name,
      race: player2Race,
      supply: GAME_INITIAL_TROOPS,
      resources: GAME_INITIAL_RESOURCES,
      health: 100,
      stats: player2Stats ? {
        attack: player2Stats.attack || 50,
        defense: player2Stats.defense || 50,
        speed: player2Stats.speed || 50,
        economy: player2Stats.economy || 50,
        sense: player2Stats.sense || 50,
        control: player2Stats.control || 50,
        harassment: player2Stats.harassment || 50,
        strategy: player2Stats.strategy || 50,
        scouting: player2Stats.scouting || 50,
        massProduction: player2Stats.massProduction || 50,
      } : undefined,
      multiCount: 1,
      productionFacilities: 0,
      hasObserver: false,
      hasVessel: false,
      hasArbiter: false,
      hasRecall: false,
      hasEMP: false,
      hasStasisField: false,
      buildOrder: initializeBuildOrder(player2Race),
      producedUnitsFirstTime: new Set(),
      unitsProduced: [],
    },
    player1Advantage: 50,
    player1Events: [],
    player2Events: [],
    allCommentaries: [],
  };
}

/**
 * 플레이어 액션 생성 - 빌드별 차등 적용
 */
function generatePlayerAction(gameState: GameState, player: PlayerState): PlayerAction | null {
  const buildStrategy = player.buildStrategy || "barracks_first";
  const resourceRate = BUILD_RESOURCE_RATES[buildStrategy] || 100;
  const troopRate = BUILD_TROOP_RATES[buildStrategy] || 1.0;

  // 초반 빌드 선택
  if (gameState.turn === 1 && !player.buildStrategy) {
    const strategies = ["barracks_first", "cc_first", "gateway_first", "hatch_first"] as const;
    const selected = strategies[Math.floor(Math.random() * strategies.length)];
    player.buildStrategy = selected;
    return { type: selected, data: selected };
  }

  // 일반 게임 진행 (액션 없음 - 병력/자원은 독립적으로 증가)
  return null;
}

/**
 * 병력/자원 독립 시뮬레이션 - 빌드별 차등 적용 및 능력치 반영
 */
function updateResourcesAndTroops(gameState: GameState, player: PlayerState): void {
  if (gameState.gameEnded) return;

  const buildStrategy = player.buildStrategy || "barracks_first";
  const resourceRate = BUILD_RESOURCE_RATES[buildStrategy] || 100;
  const troopRate = BUILD_TROOP_RATES[buildStrategy] || 1.0;

  // 능력치 반영 - 경제 능력치로 자원 증가율 조정
  let economyMultiplier = 1.0;
  if (player.stats) {
    economyMultiplier = 1.0 + (player.stats.economy - 50) / 500; // 50 기준, 최대 1.1배
  }

  // 능력치 반영 - 대량 생산으로 병력 증가율 조정
  let troopMultiplier = 1.0;
  if (player.stats) {
    troopMultiplier = 1.0 + (player.stats.massProduction - 50) / 500; // 50 기준, 최대 1.1배
  }

  // 자원 증가 (멀티 개수에 따라 증가, 능력치 반영)
  // 기본값을 10배 증가: 100 * multiCount * economyMultiplier (/ 10 제거)
  const resourceIncrease = resourceRate * player.multiCount * economyMultiplier;
  player.resources = Math.min(GAME_MAX_RESOURCES, player.resources + resourceIncrease);

  // 병력 증가 (생산기지 개수에 따라 증가, 능력치 반영)
  // 기본값을 5배 증가: 25 * productionFacilities * troopRate * troopMultiplier
  const baseIncrease = 25 * player.productionFacilities * troopRate * troopMultiplier;
  player.supply = Math.min(GAME_MAX_TROOPS, player.supply + baseIncrease);
}

/**
 * 게임 진행 - 턴 진행
 */
export function progressGame(gameState: GameState): void {
  if (gameState.gameEnded) return;

  gameState.turn++;

  // 플레이어 액션 생성
  const action1 = generatePlayerAction(gameState, gameState.player1);
  const action2 = generatePlayerAction(gameState, gameState.player2);

  if (action1) gameState.player1.lastAction = action1;
  if (action2) gameState.player2.lastAction = action2;

  // 병력/자원 독립 시뮬레이션
  updateResourcesAndTroops(gameState, gameState.player1);
  updateResourcesAndTroops(gameState, gameState.player2);

  // 멀티 확장 (자원이 충분하면 멀티 확장)
  if (gameState.player1.resources > 5000 && gameState.player1.multiCount < 3) {
    gameState.player1.multiCount++;
    gameState.player1.resources -= 1000;
  }
  if (gameState.player2.resources > 5000 && gameState.player2.multiCount < 3) {
    gameState.player2.multiCount++;
    gameState.player2.resources -= 1000;
  }

  // 생산기지 추가 (자원이 충분하면 생산기지 추가)
  if (gameState.player1.resources > 3000 && gameState.player1.productionFacilities < 3) {
    gameState.player1.productionFacilities++;
    gameState.player1.resources -= 500;
  }
  if (gameState.player2.resources > 3000 && gameState.player2.productionFacilities < 3) {
    gameState.player2.productionFacilities++;
    gameState.player2.resources -= 500;
  }

  // 게임 이벤트 생성 및 동적 해설
  const eventContext = {
    turn: gameState.turn,
    player1: {
      id: gameState.player1.id,
      name: gameState.player1.name,
      race: gameState.player1.race,
      supply: gameState.player1.supply,
      resources: gameState.player1.resources,
      multiCount: gameState.player1.multiCount,
    },
    player2: {
      id: gameState.player2.id,
      name: gameState.player2.name,
      race: gameState.player2.race,
      supply: gameState.player2.supply,
      resources: gameState.player2.resources,
      multiCount: gameState.player2.multiCount,
    },
    player1Advantage: gameState.player1Advantage,
  };

  const gameEvent = generateGameEvent(eventContext);
  if (gameEvent) {
    // 이벤트에 따른 병력/자원 변화
    if (gameEvent.type === "engagement") {
      if (gameEvent.playerId === 1) {
        gameState.player2.supply = Math.max(0, gameState.player2.supply - 30);
      } else {
        gameState.player1.supply = Math.max(0, gameState.player1.supply - 30);
      }
    } else if (gameEvent.type === "harass" || gameEvent.type === "resource_drain") {
      if (gameEvent.playerId === 1) {
        gameState.player2.resources = Math.max(0, gameState.player2.resources - 500);
      } else {
        gameState.player1.resources = Math.max(0, gameState.player1.resources - 500);
      }
    } else if (gameEvent.type === "multi_destroy") {
      if (gameEvent.playerId === 1) {
        gameState.player2.multiCount = Math.max(1, gameState.player2.multiCount - 1);
        gameState.player2.resources = Math.max(0, gameState.player2.resources - 1000);
      } else {
        gameState.player1.multiCount = Math.max(1, gameState.player1.multiCount - 1);
        gameState.player1.resources = Math.max(0, gameState.player1.resources - 1000);
      }
    }
    gameState.allCommentaries.push(gameEvent.commentary);
  } else if (gameState.turn % 3 === 0) {
    // 이벤트가 없으면 단순한 상황 해설
    gameState.allCommentaries.push(generateSituationCommentary());
  }

  // 유불리 계산
  const player1Score = gameState.player1.supply * 1.5 + gameState.player1.resources / 100;
  const player2Score = gameState.player2.supply * 1.5 + gameState.player2.resources / 100;
  const totalScore = player1Score + player2Score;
  gameState.player1Advantage = totalScore > 0 ? (player1Score / totalScore) * 100 : 50;

  // 게임 종료 조건 (100턴 또는 한 플레이어가 크게 밀렸을 때)
  if (gameState.turn >= 100 || gameState.player1Advantage > 95 || gameState.player1Advantage < 5) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1Advantage > 50 ? 1 : 2;
  }

  // 초반 비드 해설
  const commentaries = generateTurnCommentary(gameState, gameState.player1.name, gameState.player2.name);
  if (commentaries && commentaries.length > 0) {
    gameState.allCommentaries.push(...commentaries);
  }

  // 게임 종료 해설
  if (gameState.gameEnded) {
    const endCommentary = generateGameEndCommentary(gameState.player1.name, gameState.player2.name, gameState.winner === 1);
    if (endCommentary) gameState.allCommentaries.push(endCommentary);
  }
}

/**
 * progressTurn 호환성 함수
 */
export function progressTurn(gameState: GameState): void {
  progressGame(gameState);
}

/**
 * 게임 상태를 턴 데이터로 변환
 */
export function gameStateToTurnData(gameState: GameState) {
  return {
    turn: gameState.turn,
    player1Commentary: [],
    player2Commentary: [],
    player1Supply: Math.round(gameState.player1.supply),
    player1Resources: Math.round(gameState.player1.resources),
    player2Supply: Math.round(gameState.player2.supply),
    player2Resources: Math.round(gameState.player2.resources),
    player1Health: gameState.player1.health,
    player2Health: gameState.player2.health,
    allCommentaries: gameState.allCommentaries,
  };
}
