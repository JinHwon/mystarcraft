/**
 * 동적 게임 시뮬레이션 엔진
 * 실제 게임 흐름을 반영하여 턴별로 동적으로 진행
 */

import { selectBuildOrder, recommendUnit, getUnitCounters, unitStats, type Race } from "./starcraftData";

export interface GameState {
  turn: number;
  player1: PlayerState;
  player2: PlayerState;
  allCommentaries: string[];
  gameEnded: boolean;
  winner?: number;
}

export interface PlayerState {
  playerId: number;
  name: string;
  race: Race;
  resources: number;
  supply: number;
  health: number;
  units: UnitInventory;
  lastCommentaries: string[];
  buildOrder: string[];
  techLevel: number;
}

export interface UnitInventory {
  [unitName: string]: number;
}

/**
 * 게임 상태 초기화
 */
export function initializeGameState(
  player1Id: number,
  player1Name: string,
  player1Race: Race,
  player2Id: number,
  player2Name: string,
  player2Race: Race
): GameState {
  return {
    turn: 0,
    player1: {
      playerId: player1Id,
      name: player1Name,
      race: player1Race,
      resources: 50,
      supply: 12,
      health: 100,
      units: {},
      lastCommentaries: [],
      buildOrder: selectBuildOrder(player1Race, player2Race, "intermediate").techPath,
      techLevel: 0,
    },
    player2: {
      playerId: player2Id,
      name: player2Name,
      race: player2Race,
      resources: 50,
      supply: 12,
      health: 100,
      units: {},
      lastCommentaries: [],
      buildOrder: selectBuildOrder(player2Race, player1Race, "intermediate").techPath,
      techLevel: 0,
    },
    allCommentaries: [],
    gameEnded: false,
  };
}

/**
 * 턴 진행 - 동적으로 게임 상태 업데이트
 */
export function progressTurn(gameState: GameState): GameState {
  gameState.turn++;
  const turnPhase = gameState.turn / 50; // 최대 50턴 기준

  // 플레이어 1 턴 진행
  progressPlayerTurn(gameState, gameState.player1, gameState.player2, turnPhase);
  
  // 플레이어 2 턴 진행
  progressPlayerTurn(gameState, gameState.player2, gameState.player1, turnPhase);

  // 병력 교전 시뮬레이션
  simulateCombat(gameState);

  // 게임 종료 판정
  checkGameEnd(gameState);

  return gameState;
}

/**
 * 플레이어 턴 진행
 */
function progressPlayerTurn(
  gameState: GameState,
  player: PlayerState,
  opponent: PlayerState,
  turnPhase: number
): void {
  const commentaries: string[] = [];

  // 1. 자원 생성
  const resourceGain = 10 + Math.floor(turnPhase * 20);
  player.resources += resourceGain;
  commentaries.push(`${player.name} 선수 자원 ${resourceGain}을 획득했습니다`);

  // 2. 멀티 확장 (게임 중반 이후)
  if (turnPhase > 0.3 && turnPhase < 0.7 && player.resources > 200) {
    if (Math.random() < 0.3) {
      player.resources += 30;
      commentaries.push(`${player.name} 선수 멀티지역 리소스를 확보했습니다!`);
    }
  }

  // 3. 상대 유닛 분석 및 유닛 생산
  const recommendedUnit = recommendUnit(
    Object.keys(opponent.units).filter(u => opponent.units[u] > 0),
    player.resources,
    player.race
  );

  if (recommendedUnit && unitStats[recommendedUnit]) {
    const unitCost = unitStats[recommendedUnit].cost;
    const unitSupply = unitStats[recommendedUnit].supply;

    if (player.resources >= unitCost && player.supply + unitSupply <= 200) {
      player.resources -= unitCost;
      player.units[recommendedUnit] = (player.units[recommendedUnit] || 0) + 1;
      player.supply += unitSupply;
      commentaries.push(`${player.name} 선수 ${recommendedUnit}을(를) 생산했습니다`);

      // 상대 유닛 카운터 해설
      const counters = getUnitCounters(recommendedUnit);
      if (counters.length > 0) {
        commentaries.push(`${player.name} 선수 ${counters.join(", ")}을(를) 카운터합니다`);
      }
    }
  }

  // 4. 기본 유닛 생산 (자원이 충분하면)
  if (player.resources > 100 && player.supply < 150) {
    const basicUnit = player.race === "terran" ? "마린" : player.race === "protoss" ? "질럿" : "저글링";
    const unitCost = unitStats[basicUnit].cost;
    const unitSupply = unitStats[basicUnit].supply;

    if (player.resources >= unitCost && player.supply + unitSupply <= 200) {
      player.resources -= unitCost;
      player.units[basicUnit] = (player.units[basicUnit] || 0) + 1;
      player.supply += unitSupply;
      commentaries.push(`${player.name} 선수 ${basicUnit}을(를) 추가 생산했습니다`);
    }
  }

  // 5. 기술 업그레이드
  if (turnPhase > 0.5 && player.techLevel < 3 && player.resources > 150) {
    if (Math.random() < 0.3) {
      player.resources -= 100;
      player.techLevel++;
      commentaries.push(`${player.name} 선수 기술 레벨을 ${player.techLevel}로 업그레이드했습니다`);
    }
  }

  // 자원이 0이 되면 게임 패배
  if (player.resources <= 0 && player.supply === 0) {
    commentaries.push(`${player.name} 선수 자원이 부족하여 더 이상 유닛을 생산할 수 없습니다`);
    gameState.gameEnded = true;
    gameState.winner = opponent.playerId;
  }

  // 해설 누적
  player.lastCommentaries = commentaries;
  gameState.allCommentaries.push(...commentaries);
}

/**
 * 병력 교전 시뮬레이션
 */
function simulateCombat(gameState: GameState): void {
  const player1Units = Object.entries(gameState.player1.units).filter(([_, count]) => count > 0);
  const player2Units = Object.entries(gameState.player2.units).filter(([_, count]) => count > 0);

  if (player1Units.length === 0 || player2Units.length === 0) {
    return;
  }

  // 병력 규모 비교
  const player1TotalSupply = gameState.player1.supply;
  const player2TotalSupply = gameState.player2.supply;

  if (player1TotalSupply > player2TotalSupply * 1.5) {
    // 플레이어 1이 압도적으로 우위
    const damage = Math.floor((player1TotalSupply - player2TotalSupply) * 0.2);
    gameState.player2.supply = Math.max(0, gameState.player2.supply - damage);
    gameState.player2.resources = Math.max(0, gameState.player2.resources - damage * 3);
    gameState.allCommentaries.push(`[중립] ${gameState.player1.name} 선수의 병력이 ${gameState.player2.name} 선수를 압박합니다!`);
  } else if (player2TotalSupply > player1TotalSupply * 1.5) {
    // 플레이어 2가 압도적으로 우위
    const damage = Math.floor((player2TotalSupply - player1TotalSupply) * 0.2);
    gameState.player1.supply = Math.max(0, gameState.player1.supply - damage);
    gameState.player1.resources = Math.max(0, gameState.player1.resources - damage * 3);
    gameState.allCommentaries.push(`[중립] ${gameState.player2.name} 선수의 병력이 ${gameState.player1.name} 선수를 압박합니다!`);
  } else {
    // 균형잡힌 교전
    gameState.allCommentaries.push(`[중립] 양 선수의 병력이 팽팽한 교전을 벌이고 있습니다`);
  }
}

/**
 * 게임 종료 판정
 */
function checkGameEnd(gameState: GameState): void {
  const player1HasUnits = gameState.player1.supply > 0;
  const player2HasUnits = gameState.player2.supply > 0;

  // 한 플레이어가 병력이 0이고 자원도 부족하면 게임 종료
  if (!player1HasUnits && gameState.player1.resources <= 0) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player2.playerId;
    gameState.allCommentaries.push(`[중립] ${gameState.player2.name} 선수 상대의 허점을 놓치지 않아요`);
    gameState.allCommentaries.push(`[중립] ${gameState.player2.name} 선수 역시 이길 줄 아는 선수입니다`);
    gameState.allCommentaries.push(`[중립] ${gameState.player1.name} 선수 GG를 칠 수 밖에 없네요.`);
  } else if (!player2HasUnits && gameState.player2.resources <= 0) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1.playerId;
    gameState.allCommentaries.push(`[중립] ${gameState.player1.name} 선수 상대의 허점을 놓치지 않아요`);
    gameState.allCommentaries.push(`[중립] ${gameState.player1.name} 선수 역시 이길 줄 아는 선수입니다`);
    gameState.allCommentaries.push(`[중립] ${gameState.player2.name} 선수 GG를 칠 수 밖에 없네요.`);
  } else if (gameState.turn >= 50) {
    // 최대 턴 도달
    gameState.gameEnded = true;
    if (gameState.player1.supply > gameState.player2.supply) {
      gameState.winner = gameState.player1.playerId;
    } else {
      gameState.winner = gameState.player2.playerId;
    }
  }
}

/**
 * 게임 상태를 턴 데이터로 변환
 */
export function gameStateToTurnData(gameState: GameState) {
  return {
    turn: gameState.turn,
    player1Commentary: gameState.player1.lastCommentaries,
    player2Commentary: gameState.player2.lastCommentaries,
    player1Supply: gameState.player1.supply,
    player1Resources: gameState.player1.resources,
    player2Supply: gameState.player2.supply,
    player2Resources: gameState.player2.resources,
    player1Health: gameState.player1.health,
    player2Health: gameState.player2.health,
    allCommentaries: [...gameState.allCommentaries],
  };
}
