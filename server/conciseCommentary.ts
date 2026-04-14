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
 * 유닛 생산 해설
 */
export function generateUnitProducedCommentary(playerName: string, unitName: string): string {
  const commentaries = [
    `${playerName} 선수 ${unitName} 나왔구요!`,
    `${playerName} 선수 ${unitName} 뽑았습니다.`,
    `${playerName} 선수 ${unitName} 생산 완료!`,
  ];
  return commentaries[Math.floor(Math.random() * commentaries.length)];
}

/**
 * 건물 건설 해설 - 생산기지 추가 시 병력 생산 속도 증가
 */
export function generateBuildingCommentary(playerName: string, buildingName: string, isProductionFacility: boolean = false): string {
  if (isProductionFacility) {
    const commentaries = [
      `${playerName} 선수 ${buildingName} 건설합니다. 이제 병력 생산이 빨라질 거 같습니다.`,
      `${playerName} 선수 ${buildingName} 올라갑니다. 생산 속도가 증가하겠네요.`,
      `${playerName} 선수 ${buildingName} 추가됩니다. 더 많은 병력을 뽑을 수 있겠습니다.`,
    ];
    return commentaries[Math.floor(Math.random() * commentaries.length)];
  }

  const commentaries = [
    `${playerName} 선수 ${buildingName} 건설합니다.`,
    `${playerName} 선수 ${buildingName} 짓습니다.`,
    `${playerName} 선수 ${buildingName} 소환합니다.`,
  ];
  return commentaries[Math.floor(Math.random() * commentaries.length)];
}

/**
 * 기술 업그레이드 해설
 */
export function generateTechCommentary(playerName: string, techName: string): string {
  if (techName.includes("EMP")) {
    return `${playerName} 선수 배슬 EMP를 준비합니다. 이건 프로토스 상대로 강력한 기술이죠.`;
  } else if (techName.includes("리콜")) {
    return `${playerName} 선수 아비터 리콜을 준비합니다. 상대 본진 타격이 가능해집니다!`;
  } else if (techName.includes("스테이시스")) {
    return `${playerName} 선수 스테이시스필드를 준비합니다. 전투에서 유리해질 것 같습니다.`;
  }

  const commentaries = [
    `${playerName} 선수 ${techName} 업그레이드 됐어요.`,
    `${playerName} 선수 ${techName} 준비합니다.`,
    `${playerName} 선수 ${techName} 업 완료!`,
  ];
  return commentaries[Math.floor(Math.random() * commentaries.length)];
}

/**
 * 멀티 확장 해설 - 자원 증가량이 크게 증가
 */
export function generateMultiCommentary(playerName: string, multiCount: string): string {
  const count = parseInt(multiCount);
  if (count === 2) {
    return `${playerName} 선수 추가 멀티를 확보합니다. 자원 수급이 크게 증가할 것 같습니다!`;
  } else if (count === 3) {
    return `${playerName} 선수 3번째 멀티까지 확보합니다. 이제 병력을 많이 뽑을 수 있겠네요.`;
  }
  return `${playerName} 선수 멀티 확장합니다.`;
}

/**
 * 정찰 유닛 해설
 */
export function generateScoutCommentary(playerName: string, scoutName: string): string {
  if (scoutName === "옵저버") {
    return `${playerName} 선수 옵저버를 준비합니다. 상대 유닛을 정찰할 수 있겠습니다.`;
  } else if (scoutName === "배슬") {
    return `${playerName} 선수 배슬을 준비합니다. 상대 위치를 파악할 수 있겠네요.`;
  }
  return `${playerName} 선수 정찰 유닛을 준비합니다.`;
}

/**
 * 공격 해설 - 실제 교전 시에만 표시
 */
export function generateAttackCommentary(playerName: string, targetName: string): string {
  const commentaries = [
    `${playerName} 선수 상대 ${targetName} 타격합니다!`,
    `${playerName} 선수 상대 ${targetName} 부쉈어요!`,
    `${playerName} 선수 상대 ${targetName} 파괴합니다!`,
  ];
  return commentaries[Math.floor(Math.random() * commentaries.length)];
}

/**
 * 상황 해설 - 실제 교전이 있을 때만 표시
 */
export function generateSituationCommentary(player1Name: string, player2Name: string, player1Advantage: number): string {
  const advantageDiff = Math.abs(player1Advantage - 50);

  if (advantageDiff < 10) {
    return `[중립] 병력들이 돌고 도는 눈치싸움이 치열합니다.`;
  } else if (player1Advantage > 65) {
    return `[중립] ${player1Name} 선수가 우위를 점하고 있습니다.`;
  } else if (player1Advantage < 35) {
    return `[중립] ${player2Name} 선수가 우위를 점하고 있습니다.`;
  }

  return `[중립] 양 선수 모두 집중하고 있습니다.`;
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
      commentaries.push(generateUnitProducedCommentary(player1Name, action.data));
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
      commentaries.push(generateUnitProducedCommentary(player2Name, action.data));
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
    commentaries.push(generateSituationCommentary(player1Name, player2Name, player1Advantage));
  }

  return commentaries;
}
