/**
 * 동적 게임 엔진 v16.0 - 시각적 병력/자원 변화 + 전투 시스템 개선
 * 
 * 핵심 메커니즘:
 * 1. 매 턴마다 병력/자원이 변화 (시각적 즐거움)
 * 2. 멀티 확장 → 자원 증가율 상승
 * 3. 견제 → 자원 증가율 감소 (멀티 파괴, 일꾼 피해)
 * 4. 전투 시 양쪽 병력 감소, 병력 적은 쪽이 더 큰 피해
 * 5. 능력치 높으면 불리한 전투도 이길 수 있음
 * 6. 70% 유리 → 우위 해설, 80% 이상 → 게임 종료
 * 7. 증가 수치 완만하게 조정
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
  
  multiCount: number;
  productionFacilities: number;
  
  hasObserver: boolean;
  hasVessel: boolean;
  hasArbiter: boolean;
  hasRecall: boolean;
  hasEMP: boolean;
  hasStasisField: boolean;
  
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
  // 현재 턴의 해설만 저장 (매 턴 초기화)
  turnCommentaries: string[];
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
      productionFacilities: 1,
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
      productionFacilities: 1,
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
    turnCommentaries: [],
  };
}

/**
 * 종족별 빌드 전략 매핑
 */
function getRaceBuildStrategies(race: "terran" | "zerg" | "protoss"): readonly ("barracks_first" | "cc_first" | "gateway_first" | "hatch_first")[] {
  switch (race) {
    case "terran":
      return ["barracks_first", "cc_first"] as const;
    case "protoss":
      return ["gateway_first"] as const;
    case "zerg":
      return ["hatch_first"] as const;
  }
}

/**
 * 플레이어 액션 생성 - 종족별 빌드 차등 적용
 */
function generatePlayerAction(gameState: GameState, player: PlayerState): PlayerAction | null {
  // 초반 빌드 선택 - 종족에 맞는 전략만 선택
  if (gameState.turn === 1 && !player.buildStrategy) {
    const strategies = getRaceBuildStrategies(player.race);
    const selected = strategies[Math.floor(Math.random() * strategies.length)];
    player.buildStrategy = selected;
    return { type: selected, data: selected };
  }

  const turn = gameState.turn;
  
  // 초반 건물 건설 (턴 5-15)
  if (turn >= 5 && turn <= 15 && player.resources > 500) {
    const buildingsByRace: Record<string, string[]> = {
      terran: ["배럭", "팩토리", "스타포트"],
      protoss: ["게이트웨이", "사이버네틱스 코어", "로보틱스 팩토리"],
      zerg: ["스포닝풀", "레어", "하이브"]
    };
    const buildings = buildingsByRace[player.race] || [];
    if (buildings.length > 0 && Math.random() < 0.25) {
      const building = buildings[Math.floor(Math.random() * buildings.length)];
      return { type: "building_built", data: building };
    }
  }
  
  // 중반 유닛 생산 (턴 8 이후)
  if (turn >= 8 && player.resources > 300) {
    const unitsByRace: Record<string, string[]> = {
      terran: ["마린", "메딕", "파이어뱃", "벌쳐", "탱크"],
      protoss: ["질럿", "드래군", "옵저버", "리버"],
      zerg: ["저글링", "히드라", "뮤탈리스크", "럴커"]
    };
    const units = unitsByRace[player.race] || [];
    if (units.length > 0 && Math.random() < 0.35) {
      const unit = units[Math.floor(Math.random() * units.length)];
      return { type: "unit_produced", data: unit };
    }
  }

  return null;
}

/**
 * 병력/자원 증가 시뮬레이션 - 완만한 증가
 */
function updateResourcesAndTroops(gameState: GameState, player: PlayerState): void {
  if (gameState.gameEnded) return;

  const buildStrategy = player.buildStrategy || "barracks_first";
  const resourceRate = BUILD_RESOURCE_RATES[buildStrategy] || 100;
  const troopRate = BUILD_TROOP_RATES[buildStrategy] || 1.0;

  // 능력치 반영
  let economyMultiplier = 1.0;
  if (player.stats) {
    economyMultiplier = 1.0 + (player.stats.economy - 50) / 500;
  }
  let troopMultiplier = 1.0;
  if (player.stats) {
    troopMultiplier = 1.0 + (player.stats.massProduction - 50) / 500;
  }

  // 자원 증가: 기본 10~15 * 멀티 수 (완만하게)
  const baseResourceIncrease = (resourceRate / 10) * player.multiCount * economyMultiplier;
  // 약간의 랜덤 변동 추가 (±20%)
  const resourceVariation = 1.0 + (Math.random() - 0.5) * 0.4;
  player.resources = Math.min(GAME_MAX_RESOURCES, player.resources + baseResourceIncrease * resourceVariation);

  // 병력 증가: 생산기지당 2~3 (완만하게)
  const baseTroopIncrease = 2.5 * player.productionFacilities * troopRate * troopMultiplier;
  const troopVariation = 1.0 + (Math.random() - 0.5) * 0.3;
  player.supply = Math.min(GAME_MAX_TROOPS, player.supply + baseTroopIncrease * troopVariation);
}

/**
 * 전투 처리 - 양쪽 병력 감소, 병력 적은 쪽이 더 큰 피해
 * 능력치가 높으면 불리한 전투도 이길 수 있음
 */
function resolveEngagement(gameState: GameState, attackerIsPlayer1: boolean): { winnerIsPlayer1: boolean } {
  const p1 = gameState.player1;
  const p2 = gameState.player2;
  
  // 기본 전투력 = 병력 수
  let p1Power = p1.supply;
  let p2Power = p2.supply;
  
  // 능력치 보정 (공격력, 컨트롤, 전략)
  if (p1.stats) {
    const statBonus = (p1.stats.attack + p1.stats.control + p1.stats.strategy) / 150;
    p1Power *= (1 + (statBonus - 1) * 0.3); // 능력치에 따라 최대 30% 보정
  }
  if (p2.stats) {
    const statBonus = (p2.stats.attack + p2.stats.control + p2.stats.strategy) / 150;
    p2Power *= (1 + (statBonus - 1) * 0.3);
  }
  
  // 약간의 랜덤 요소 (±15%)
  p1Power *= (1 + (Math.random() - 0.5) * 0.3);
  p2Power *= (1 + (Math.random() - 0.5) * 0.3);
  
  const winnerIsPlayer1 = p1Power >= p2Power;
  
  // 전투 피해 계산
  const totalPower = p1Power + p2Power;
  const powerRatio = winnerIsPlayer1 ? p2Power / totalPower : p1Power / totalPower;
  
  // 승자: 병력의 15~25% 손실
  // 패자: 병력의 30~50% 손실
  const winnerLossRate = 0.15 + Math.random() * 0.10;
  const loserLossRate = 0.30 + Math.random() * 0.20;
  
  // 자원 피해도 발생
  const winnerResourceLoss = 100 + Math.random() * 200;
  const loserResourceLoss = 300 + Math.random() * 500;
  
  if (winnerIsPlayer1) {
    p1.supply = Math.max(5, p1.supply - Math.round(p1.supply * winnerLossRate));
    p2.supply = Math.max(5, p2.supply - Math.round(p2.supply * loserLossRate));
    p1.resources = Math.max(0, p1.resources - winnerResourceLoss);
    p2.resources = Math.max(0, p2.resources - loserResourceLoss);
  } else {
    p2.supply = Math.max(5, p2.supply - Math.round(p2.supply * winnerLossRate));
    p1.supply = Math.max(5, p1.supply - Math.round(p1.supply * loserLossRate));
    p2.resources = Math.max(0, p2.resources - winnerResourceLoss);
    p1.resources = Math.max(0, p1.resources - loserResourceLoss);
  }
  
  return { winnerIsPlayer1 };
}

/**
 * 게임 진행 - 턴 진행
 */
export function progressGame(gameState: GameState): void {
  if (gameState.gameEnded) return;

  gameState.turn++;
  // 매 턴 해설 초기화
  gameState.turnCommentaries = [];

  // 플레이어 액션 생성
  const action1 = generatePlayerAction(gameState, gameState.player1);
  const action2 = generatePlayerAction(gameState, gameState.player2);
  if (action1) gameState.player1.lastAction = action1;
  if (action2) gameState.player2.lastAction = action2;

  // 병력/자원 증가
  updateResourcesAndTroops(gameState, gameState.player1);
  updateResourcesAndTroops(gameState, gameState.player2);

  // 멀티 확장 (자원이 충분하면, 최대 4개)
  if (gameState.player1.resources > 3000 && gameState.player1.multiCount < 4 && Math.random() < 0.15) {
    gameState.player1.multiCount++;
    gameState.player1.resources -= 800;
  }
  if (gameState.player2.resources > 3000 && gameState.player2.multiCount < 4 && Math.random() < 0.15) {
    gameState.player2.multiCount++;
    gameState.player2.resources -= 800;
  }

  // 생산기지 추가 (자원이 충분하면, 최대 5개)
  if (gameState.player1.resources > 2000 && gameState.player1.productionFacilities < 5 && Math.random() < 0.1) {
    gameState.player1.productionFacilities++;
    gameState.player1.resources -= 400;
  }
  if (gameState.player2.resources > 2000 && gameState.player2.productionFacilities < 5 && Math.random() < 0.1) {
    gameState.player2.productionFacilities++;
    gameState.player2.resources -= 400;
  }

  // 게임 이벤트 생성
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
    if (gameEvent.type === "engagement") {
      // 전투: 양쪽 병력 감소, 능력치 반영
      const result = resolveEngagement(gameState, gameEvent.playerId === 1);
      gameState.turnCommentaries.push(gameEvent.commentary);
    } else if (gameEvent.type === "harass") {
      // 견제: 자원 증가율 감소 효과 (자원 직접 피해 + 일꾼 피해)
      const harassDamage = 200 + Math.random() * 300;
      if (gameEvent.playerId === 1) {
        gameState.player2.resources = Math.max(0, gameState.player2.resources - harassDamage);
      } else {
        gameState.player1.resources = Math.max(0, gameState.player1.resources - harassDamage);
      }
      gameState.turnCommentaries.push(gameEvent.commentary);
    } else if (gameEvent.type === "resource_drain") {
      // 자원 드레인: 지속적 경제 피해
      const drainAmount = 150 + Math.random() * 250;
      if (gameEvent.playerId === 1) {
        gameState.player2.resources = Math.max(0, gameState.player2.resources - drainAmount);
      } else {
        gameState.player1.resources = Math.max(0, gameState.player1.resources - drainAmount);
      }
      gameState.turnCommentaries.push(gameEvent.commentary);
    } else if (gameEvent.type === "multi_destroy") {
      // 멀티 파괴: 멀티 수 감소 → 자원 증가율 감소
      if (gameEvent.playerId === 1 && gameState.player2.multiCount > 1) {
        gameState.player2.multiCount--;
        gameState.player2.resources = Math.max(0, gameState.player2.resources - 500);
      } else if (gameEvent.playerId === 2 && gameState.player1.multiCount > 1) {
        gameState.player1.multiCount--;
        gameState.player1.resources = Math.max(0, gameState.player1.resources - 500);
      }
      gameState.turnCommentaries.push(gameEvent.commentary);
    } else if (gameEvent.type === "tech_upgrade") {
      gameState.turnCommentaries.push(gameEvent.commentary);
    }
  } else if (gameState.turn % 4 === 0) {
    gameState.turnCommentaries.push(generateSituationCommentary());
  }

  // 유불리 계산 (병력 비중 높게)
  const player1Score = gameState.player1.supply * 2 + gameState.player1.resources / 200;
  const player2Score = gameState.player2.supply * 2 + gameState.player2.resources / 200;
  const totalScore = player1Score + player2Score;
  gameState.player1Advantage = totalScore > 0 ? (player1Score / totalScore) * 100 : 50;

  // 게임 종료 조건: 80% 이상 유리하면 종료
  if (gameState.turn >= 150 || gameState.player1Advantage > 80 || gameState.player1Advantage < 20) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1Advantage > 50 ? gameState.player1.id : gameState.player2.id;
  }

  // 턴별 해설 (빌드/유닛/건물)
  const commentaries = generateTurnCommentary(gameState, gameState.player1.name, gameState.player2.name);
  if (commentaries && commentaries.length > 0) {
    gameState.turnCommentaries.push(...commentaries);
  }

  // 게임 종료 해설
  if (gameState.gameEnded) {
    const isPlayer1Winner = gameState.winner === gameState.player1.id;
    const endCommentary = generateGameEndCommentary(gameState.player1.name, gameState.player2.name, isPlayer1Winner);
    if (endCommentary) gameState.turnCommentaries.push(endCommentary);
  }
}

/**
 * progressTurn 호환성 함수
 */
export function progressTurn(gameState: GameState): void {
  progressGame(gameState);
}

/**
 * 게임 상태를 턴 데이터로 변환 - 각 턴의 해설만 포함
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
    // 이 턴의 해설만 포함 (누적 아님)
    commentaries: [...gameState.turnCommentaries],
  };
}
