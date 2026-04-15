/**
 * 간결한 게임 해설 시스템 - 스타크래프트 실제 중계 스타일
 * 실제 게임 흐름을 반영하여 해설 생성
 */

import type { GameState } from "./dynamicGameEngine";

export interface CommentaryEvent {
  type: "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack" | "defense" | "situation" | "game_end";
  playerName: string;
  content: string;
}

/**
 * 초반 빌드 선택 해설
 */
export function generateBuildStrategyCommentary(playerName: string, strategy: string): string {
  if (strategy === "barracks_first") {
    return `[중립] ${playerName} 선수는 배럭을 먼저 짓는 안전한 플레이를 선택했습니다.`;
  } else if (strategy === "cc_first") {
    return `[중립] ${playerName} 선수는 커맨드센터를 먼저 지어 경제를 중시하는 플레이입니다.`;
  } else if (strategy === "gateway_first") {
    return `[중립] ${playerName} 선수는 게이트웨이를 먼저 지어 초반 견제를 준비합니다.`;
  } else if (strategy === "hatch_first") {
    return `[중립] ${playerName} 선수는 해처리를 먼저 지어 드론 경제를 중시합니다.`;
  }
  return `[중립] ${playerName} 선수가 초반 빌드를 선택했습니다.`;
}

/**
 * 유닛 생산 해설 - 일꾼 완전 제거, 병력 1회만 해설
 */
export function generateUnitProducedCommentary(playerName: string, unitName: string, isFirstTime: boolean = false): string | null {
  // 일꾼 유닛 완전 제거
  const workerUnits = ["SCV", "프로브", "드론"];
  if (workerUnits.includes(unitName)) {
    return null; // 일꾼 해설 생략
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
export function generateBuildingCommentary(playerName: string, buildingName: string, isProductionFacility: boolean = false): string {
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
export function generateSituationCommentary(player1Name: string, player2Name: string, player1Advantage: number): string {
  if (player1Advantage > 65) {
    return `[중립] ${player1Name} 선수 우위!`;
  } else if (player1Advantage < 35) {
    return `[중립] ${player2Name} 선수 우위!`;
  }
  return null; // 균d형 상태는 해설 생략
}

/**
 * 게임 종료 해설
 */
export function generateGameEndCommentary(winnerName: string, loserName: string): string[] {
  return [
    `${loserName} 선수 GG를 칠 수 밖에 없지요.`,
    `${winnerName} 선수는 상대 허점을 놓치지 않아요.`,
    `[중립] 경기가 종료되었습니다.`,
  ];
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
      commentaries.push(generateBuildStrategyCommentary(player1Name, gameState.player1.buildStrategy));
    }
    if (gameState.player2.buildStrategy) {
      commentaries.push(generateBuildStrategyCommentary(player2Name, gameState.player2.buildStrategy));
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
      const commentary = generateUnitProducedCommentary(player1Name, action.data, isFirstTime);
      if (commentary) commentaries.push(commentary);
    } else if (action.type === "building_built") {
      // 생산기지인지 확인
      const isProductionFacility = ["배럭", "팩토리", "스타포트", "게이트웨이", "로보틱스", "스타게이트", "스포닝풀", "스파이어", "해처리"].includes(action.data);
      commentaries.push(generateBuildingCommentary(player1Name, action.data, isProductionFacility));
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
      const commentary = generateUnitProducedCommentary(player2Name, action.data, isFirstTime);
      if (commentary) commentaries.push(commentary);
    } else if (action.type === "building_built") {
      // 생산기지인지 확인
      const isProductionFacility = ["배럭", "팩토리", "스타포트", "게이트웨이", "로보틱스", "스타게이트", "스포닝풀", "스파이어", "해처리"].includes(action.data);
      commentaries.push(generateBuildingCommentary(player2Name, action.data, isProductionFacility));
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
