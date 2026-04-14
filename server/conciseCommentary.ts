/**
 * 간결한 게임 해설 시스템
 * 실제 스타크래프트 해설처럼 간단하고 명확한 해설 생성
 */

import type { GameState } from "./dynamicGameEngine";

export interface CommentaryEvent {
  type: "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack" | "defense" | "situation" | "game_end";
  playerName: string;
  content: string;
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
 * 건물 건설 해설
 */
export function generateBuildingCommentary(playerName: string, buildingName: string): string {
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
  const commentaries = [
    `${playerName} 선수 ${techName} 업그레이드 됐어요.`,
    `${playerName} 선수 ${techName} 준비합니다.`,
    `${playerName} 선수 ${techName} 업 완료!`,
  ];
  return commentaries[Math.floor(Math.random() * commentaries.length)];
}

/**
 * 멀티 확장 해설
 */
export function generateMultiCommentary(playerName: string, multiCount: number): string {
  if (multiCount === 2) {
    return `${playerName} 선수 추가 멀티 더 가져갑니다.`;
  } else if (multiCount === 3) {
    return `${playerName} 선수 3번째 멀티까지 확보합니다.`;
  }
  return `${playerName} 선수 멀티 확장합니다.`;
}

/**
 * 공격 해설
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
 * 상황 해설
 */
export function generateSituationCommentary(player1Name: string, player2Name: string, player1Advantage: number): string {
  const advantageDiff = Math.abs(player1Advantage - 50);

  if (advantageDiff < 10) {
    return `병력들이 돌고 도는 눈치싸움이 치열합니다.`;
  } else if (player1Advantage > 60) {
    return `${player1Name} 선수가 우위를 점하고 있습니다.`;
  } else if (player1Advantage < 40) {
    return `${player2Name} 선수가 우위를 점하고 있습니다.`;
  }

  return `양 선수 모두 집중하고 있습니다.`;
}

/**
 * 게임 종료 해설
 */
export function generateGameEndCommentary(winnerName: string, loserName: string): string[] {
  return [
    `${loserName} 선수 GG를 칠 수 밖에 없지요.`,
    `${winnerName} 선수는 상대 허점을 놓치지 않아요.`,
    `경기가 종료되었습니다.`,
  ];
}

/**
 * 턴별 해설 생성
 */
export function generateTurnCommentary(
  gameState: GameState,
  player1Name: string,
  player2Name: string
): string[] {
  const commentaries: string[] = [];

  // 플레이어 1 액션
  if (gameState.player1.lastAction) {
    const action = gameState.player1.lastAction;
    if (action.type === "unit_produced") {
      commentaries.push(generateUnitProducedCommentary(player1Name, action.data));
    } else if (action.type === "building_built") {
      commentaries.push(generateBuildingCommentary(player1Name, action.data));
    } else if (action.type === "tech_upgraded") {
      commentaries.push(generateTechCommentary(player1Name, action.data));
    } else if (action.type === "multi_taken") {
      commentaries.push(generateMultiCommentary(player1Name, action.data));
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
      commentaries.push(generateBuildingCommentary(player2Name, action.data));
    } else if (action.type === "tech_upgraded") {
      commentaries.push(generateTechCommentary(player2Name, action.data));
    } else if (action.type === "multi_taken") {
      commentaries.push(generateMultiCommentary(player2Name, action.data));
    } else if (action.type === "attack") {
      commentaries.push(generateAttackCommentary(player2Name, action.data));
    }
  }

  // 공격이 있을 때만 상황 해설 추가
  const hasAttack = gameState.player1.lastAction?.type === "attack" || gameState.player2.lastAction?.type === "attack";
  if (hasAttack) {
    const player1Advantage = gameState.player1Advantage;
    commentaries.push(generateSituationCommentary(player1Name, player2Name, player1Advantage));
  }

  return commentaries;
}
