/**
 * 간결한 게임 해설 시스템 - 스타크래프트 실제 중계 스타일
 * 실제 게임 흐름을 반영하여 해설 생성
 */

import type { GameState } from "./dynamicGameEngine";
import {
  TERRAN_UNITS,
  TERRAN_BUILD_ORDER,
  PROTOSS_UNITS,
  PROTOSS_BUILD_ORDER,
  ZERG_UNITS,
  ZERG_BUILD_ORDER,
} from "@shared/buildOrder";

export interface CommentaryEvent {
  type: "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack" | "defense" | "situation" | "game_end";
  playerName: string;
  content: string;
}

/**
 * 종족별 유닛 목록 조회
 */
function getRaceUnits(race: "terran" | "zerg" | "protoss"): string[] {
  if (race === "terran") {
    return Object.values(TERRAN_UNITS).flat();
  } else if (race === "protoss") {
    return Object.values(PROTOSS_UNITS).flat();
  } else {
    return Object.values(ZERG_UNITS).flat();
  }
}

/**
 * 종족별 건물 목록 조회
 */
function getRaceBuildings(race: "terran" | "zerg" | "protoss"): string[] {
  if (race === "terran") {
    return Object.values(TERRAN_BUILD_ORDER).flat();
  } else if (race === "protoss") {
    return Object.values(PROTOSS_BUILD_ORDER).flat();
  } else {
    return Object.values(ZERG_BUILD_ORDER).flat();
  }
}

/**
 * 유닛이 해당 종족의 유닛인지 확인
 */
function isValidUnitForRace(unitName: string, race: "terran" | "zerg" | "protoss"): boolean {
  const raceUnits = getRaceUnits(race);
  return raceUnits.includes(unitName);
}

/**
 * 건물이 해당 종족의 건물인지 확인
 */
function isValidBuildingForRace(buildingName: string, race: "terran" | "zerg" | "protoss"): boolean {
  const raceBuildings = getRaceBuildings(race);
  return raceBuildings.includes(buildingName);
}

/**
 * 초반 빌드 선택 해설
 */
export function generateBuildStrategyCommentary(playerName: string, strategy: string, race: "terran" | "zerg" | "protoss"): string {
  if (strategy === "barracks_first" && race === "terran") {
    return `[중립] ${playerName} 선수는 배럭을 먼저 짓는 안전한 플레이를 선택했습니다.`;
  } else if (strategy === "cc_first" && race === "terran") {
    return `[중립] ${playerName} 선수는 커맨드센터를 먼저 지어 경제를 중시하는 플레이입니다.`;
  } else if (strategy === "gateway_first" && race === "protoss") {
    return `[중립] ${playerName} 선수는 게이트웨이를 먼저 지어 초반 견제를 준비합니다.`;
  } else if (strategy === "hatch_first" && race === "zerg") {
    return `[중립] ${playerName} 선수는 해처리를 먼저 지어 드론 경제를 중시합니다.`;
  }
  return `[중립] ${playerName} 선수가 초반 빌드를 선택했습니다.`;
}

/**
 * 유닛 생산 해설 - 일꾼 완전 제거, 병력 1회만 해설
 */
export function generateUnitProducedCommentary(
  playerName: string,
  unitName: string,
  race: "terran" | "zerg" | "protoss",
  isFirstTime: boolean = false
): string | null {
  // 일꾼 유닛 완전 제거
  const workerUnits = ["SCV", "프로브", "드론"];
  if (workerUnits.includes(unitName)) {
    return null; // 일꾼 해설 생략
  }

  // 해당 종족의 유닛이 아니면 생략
  if (!isValidUnitForRace(unitName, race)) {
    return null;
  }

  // 병력 1회만 해설 - 처음 나옴을 때만
  if (!isFirstTime) {
    return null; // 반복 해설 생략
  }

  const commentaries = [
    `${playerName} 선수 ${unitName} 나왔구요!`,
    `${playerName} 선수 ${unitName} 추가!`,
  ];
  return commentaries[Math.floor(Math.random() * commentaries.length)];
}

/**
 * 건물 건설 해설 - 간결하고 짧게
 */
export function generateBuildingCommentary(
  playerName: string,
  buildingName: string,
  race: "terran" | "zerg" | "protoss",
  isProductionFacility: boolean = false
): string | null {
  // 해당 종족의 건물이 아니면 생략
  if (!isValidBuildingForRace(buildingName, race)) {
    return null;
  }

  if (isProductionFacility) {
    return `${playerName} 선수 ${buildingName} 건설!`;
  }
  return `${playerName} 선수 ${buildingName} 건설!`;
}

/**
 * 기술 업그레이드 해설 - 간결하고 짧게
 */
export function generateTechCommentary(playerName: string, techName: string): string {
  if (techName.includes("EMP")) {
    return `${playerName} 선수 EMP 준비!`;
  } else if (techName.includes("리콜")) {
    return `${playerName} 선수 리콜 준비!`;
  } else if (techName.includes("스테이시스")) {
    return `${playerName} 선수 스테이시스필드 준비!`;
  }
  return `${playerName} 선수 ${techName} 업!`;
}

/**
 * 멀티 확장 해설 - 간결하고 짧게
 */
export function generateMultiCommentary(playerName: string, multiCount: string): string {
  const count = parseInt(multiCount);
  if (count === 2) {
    return `${playerName} 선수 2번째 멀티!`;
  } else if (count === 3) {
    return `${playerName} 선수 3번째 멀티!`;
  }
  return `${playerName} 선수 멀티 확장!`;
}

/**
 * 정찰 유닛 해설 - 간결하고 짧게
 */
export function generateScoutCommentary(playerName: string, scoutName: string): string {
  if (scoutName === "옵저버") {
    return `${playerName} 선수 옵저버!`;
  } else if (scoutName === "배슬") {
    return `${playerName} 선수 배슬!`;
  }
  return `${playerName} 선수 정찰 유닛!`;
}

/**
 * 공격 해설 - 간결하고 짧게
 */
export function generateAttackCommentary(playerName: string, targetName: string): string {
  return `${playerName} 선수 상대 공격!`;
}

/**
 * 상황 해설 - 간결하고 짧게
 */
export function generateSituationCommentary(player1Name: string, player2Name: string, player1Advantage: number): string | null {
  if (player1Advantage > 65) {
    return `[중립] ${player1Name} 선수 우위!`;
  } else if (player1Advantage < 35) {
    return `[중립] ${player2Name} 선수 우위!`;
  }
  return null; // 균형 상태는 해설 생략
}

/**
 * 게임 종료 해설
 */
export function generateGameEndCommentary(player1Name: string, player2Name: string, isPlayer1Winner: boolean): string {
  const winnerName = isPlayer1Winner ? player1Name : player2Name;
  const loserName = isPlayer1Winner ? player2Name : player1Name;
  return `[중립] ${winnerName} 선수 승리! 경기가 종료되었습니다.`;
}

/**
 * 턴별 해설 생성 - 실제 게임 흐름 반영
 */
export function generateTurnCommentary(
  gameState: GameState,
  player1Name: string,
  player2Name: string
): string[] {
  const commentaries: string[] = [];

  // 1턴: 초반 빌드 선택 해설
  if (gameState.turn === 1) {
    if (gameState.player1.buildStrategy) {
      commentaries.push(generateBuildStrategyCommentary(player1Name, gameState.player1.buildStrategy, gameState.player1.race));
    }
    if (gameState.player2.buildStrategy) {
      commentaries.push(generateBuildStrategyCommentary(player2Name, gameState.player2.buildStrategy, gameState.player2.race));
    }
    return commentaries;
  }

  // 플레이어 1 액션
  if (gameState.player1.lastAction) {
    const action = gameState.player1.lastAction;
    if (action.type === "unit_produced") {
      const isFirstTime = !gameState.player1.producedUnitsFirstTime.has(action.data);
      if (isFirstTime) {
        gameState.player1.producedUnitsFirstTime.add(action.data);
      }
      const commentary = generateUnitProducedCommentary(player1Name, action.data, gameState.player1.race, isFirstTime);
      if (commentary) commentaries.push(commentary);
    } else if (action.type === "building_built") {
      // 생산기지인지 확인
      const isProductionFacility = ["배럭", "팩토리", "스타포트", "게이트웨이", "로보틱스", "스타게이트", "스포닝풀", "스파이어", "해처리"].includes(action.data);
      const commentary = generateBuildingCommentary(player1Name, action.data, gameState.player1.race, isProductionFacility);
      if (commentary) commentaries.push(commentary);
    } else if (action.type === "tech_upgraded") {
      commentaries.push(generateTechCommentary(player1Name, action.data));
    } else if (action.type === "multi_taken") {
      commentaries.push(generateMultiCommentary(player1Name, action.data));
    } else if (action.type === "scout") {
      commentaries.push(generateScoutCommentary(player1Name, action.data));
    } else if (action.type === "attack") {
      commentaries.push(generateAttackCommentary(player1Name, action.data));
    }
  }

  // 플레이어 2 액션
  if (gameState.player2.lastAction) {
    const action = gameState.player2.lastAction;
    if (action.type === "unit_produced") {
      const isFirstTime = !gameState.player2.producedUnitsFirstTime.has(action.data);
      if (isFirstTime) {
        gameState.player2.producedUnitsFirstTime.add(action.data);
      }
      const commentary = generateUnitProducedCommentary(player2Name, action.data, gameState.player2.race, isFirstTime);
      if (commentary) commentaries.push(commentary);
    } else if (action.type === "building_built") {
      // 생산기지인지 확인
      const isProductionFacility = ["배럭", "팩토리", "스타포트", "게이트웨이", "로보틱스", "스타게이트", "스포닝풀", "스파이어", "해처리"].includes(action.data);
      const commentary = generateBuildingCommentary(player2Name, action.data, gameState.player2.race, isProductionFacility);
      if (commentary) commentaries.push(commentary);
    } else if (action.type === "tech_upgraded") {
      commentaries.push(generateTechCommentary(player2Name, action.data));
    } else if (action.type === "multi_taken") {
      commentaries.push(generateMultiCommentary(player2Name, action.data));
    } else if (action.type === "scout") {
      commentaries.push(generateScoutCommentary(player2Name, action.data));
    } else if (action.type === "attack") {
      commentaries.push(generateAttackCommentary(player2Name, action.data));
    }
  }

  // 공격이 있을 때만 상황 해설 추가
  const hasAttack = gameState.player1.lastAction?.type === "attack" || gameState.player2.lastAction?.type === "attack";
  if (hasAttack && gameState.turn > 5) {
    const player1Advantage = gameState.player1Advantage;
    const situationCommentary = generateSituationCommentary(player1Name, player2Name, player1Advantage);
    if (situationCommentary) commentaries.push(situationCommentary);
  }

  return commentaries.filter(c => c !== null && c !== undefined);
}
