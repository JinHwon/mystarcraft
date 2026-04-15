import {
  STAT_KEYS,
  StatKey,
  DIFFICULTY_RANGES,
  GAME_REWARDS,
  FATIGUE_COST,
  calcGradeIndex,
  calcTotalStats,
  calcEffectiveStatsWithFatigue,
} from "@shared/gameConstants";
import { getPlayerStats } from "./db";
import { type MapCharacteristic } from "./buildSystem";
import {
  initializeGameState,
  progressTurn,
  gameStateToTurnData,
  type GameState,
} from "./dynamicGameEngine";

/**
 * 게임 턴 데이터 구조
 */
export interface GameTurn {
  turn: number;
  player1Commentary: string[];
  player2Commentary: string[];
  player1Supply: number;
  player1Resources: number;
  player2Supply: number;
  player2Resources: number;
  player1Health: number;
  player2Health: number;
  allCommentaries: string[];
}

/**
 * 게임 시뮬레이션 결과
 */
export interface GameSimulationResult {
  winnerId: number;
  turns: GameTurn[];
  player1FinalScore: number;
  player2FinalScore: number;
  player1Events: any[];
  player2Events: any[];
}

/**
 * 맵 유불리를 고려한 승률 계산
 */
export function calculateWinProbability(
  player1Stats: Record<StatKey, number>,
  player2Stats: Record<StatKey, number>,
  player1Race: "terran" | "zerg" | "protoss",
  player2Race: "terran" | "zerg" | "protoss",
  mapRaceAdvantage: Record<string, number>
): number {
  const player1Total = calcTotalStats(player1Stats);
  const player2Total = calcTotalStats(player2Stats);

  let player1WinProb = (player1Total / (player1Total + player2Total)) * 100;

  const player1Advantage = mapRaceAdvantage[player1Race] || 0;
  const player2Advantage = mapRaceAdvantage[player2Race] || 0;

  player1WinProb += (player1Advantage - player2Advantage) * 5;

  return Math.max(5, Math.min(95, Math.round(player1WinProb)));
}

/**
 * 게임 시뮬레이션 실행
 */
export async function simulateGame(
  player1Id: number,
  player2Id: number,
  player1Name: string,
  player2Name: string,
  player1Race: "terran" | "zerg" | "protoss",
  player2Race: "terran" | "zerg" | "protoss",
  difficulty: "beginner" | "intermediate" | "advanced",
  mapRaceAdvantage: Record<string, number>,
  player1Fatigue: number,
  player2Fatigue: number,
  mapCharacteristic: MapCharacteristic = "balanced"
): Promise<GameSimulationResult> {
  // 선수 능력치 조회
  const player1Stats = await getPlayerStats(player1Id);
  const player2Stats = await getPlayerStats(player2Id);

  if (!player1Stats || !player2Stats) {
    throw new Error("선수 능력치를 조회할 수 없습니다");
  }

  // 피로도 적용
  const player1EffectiveStats = calcEffectiveStatsWithFatigue(
    Object.fromEntries(
      STAT_KEYS.map(key => [key, (player1Stats as any)[key]])
    ) as Record<StatKey, number>,
    player1Fatigue
  );

  const player2EffectiveStats = calcEffectiveStatsWithFatigue(
    Object.fromEntries(
      STAT_KEYS.map(key => [key, (player2Stats as any)[key]])
    ) as Record<StatKey, number>,
    player2Fatigue
  );

   // 게임 진행
  const gameState = initializeGameState(
    player1Id,
    player1Name,
    player1Race,
    player2Id,
    player2Name,
    player2Race,
    player1EffectiveStats,
    player2EffectiveStats
  );

  // 게임 진행
  const turns: GameTurn[] = [];
  const maxTurns = 200; // 병력/자원이 계속 변화할 수 있도록 늘림

  while (!gameState.gameEnded && turns.length < maxTurns) {
    progressTurn(gameState);
    turns.push(gameStateToTurnData(gameState));
  }

  if (!gameState.gameEnded) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1Advantage >= 50 ? gameState.player1.id : gameState.player2.id;
  }

  // 최종 스코어 계산
  const player1FinalScore = Math.round(
    gameState.player1.supply * 2 + gameState.player1.resources / 10 + gameState.player1.health
  );
  const player2FinalScore = Math.round(
    gameState.player2.supply * 2 + gameState.player2.resources / 10 + gameState.player2.health
  );

  return {
    winnerId: gameState.winner || player1Id,
    turns,
    player1FinalScore,
    player2FinalScore,
    player1Events: gameState.player1Events || [],
    player2Events: gameState.player2Events || [],
  };
}
