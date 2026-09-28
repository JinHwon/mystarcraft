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
  player1Advantage: number;
  commentaries: string[];
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

type Race = "terran" | "zerg" | "protoss";
type MapTraits = { rushDistance: number; resources: number; complexity: number };

/**
 * 게임 엔진을 끝까지 진행 (DB 접근 없음)
 */
function runSimulation(
  player1Id: number, player1Name: string, player1Race: Race,
  player1StatsRaw: Record<StatKey, number>, player1Fatigue: number,
  player2Id: number, player2Name: string, player2Race: Race,
  player2StatsRaw: Record<StatKey, number>, player2Fatigue: number,
  mapRaceAdvantage: Record<string, number>,
  mapTraits?: MapTraits
): { gameState: GameState; turns: GameTurn[] } {
  // 피로도 적용
  const player1EffectiveStats = calcEffectiveStatsWithFatigue(player1StatsRaw, player1Fatigue);
  const player2EffectiveStats = calcEffectiveStatsWithFatigue(player2StatsRaw, player2Fatigue);

  const gameState = initializeGameState(
    player1Id,
    player1Name,
    player1Race,
    player2Id,
    player2Name,
    player2Race,
    player1EffectiveStats,
    player2EffectiveStats,
    mapTraits,
    mapRaceAdvantage
  );

  const turns: GameTurn[] = [];
  const maxTurns = 120;

  while (!gameState.gameEnded && turns.length < maxTurns) {
    progressTurn(gameState);
    turns.push(gameStateToTurnData(gameState));
  }

  if (!gameState.gameEnded) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1Advantage >= 50 ? gameState.player1.id : gameState.player2.id;
  }

  return { gameState, turns };
}

/** 패배 시 남는 병력/자원 비율 (10~20%) */
export const LOSER_REMAIN_RATIO_MIN = 0.1;
export const LOSER_REMAIN_RATIO_MAX = 0.2;

/**
 * 경기 종료 후 패자의 병력과 자원을 대폭 감소시키고 마지막 턴 데이터에 반영
 */
export function applyLoserPenalty(gameState: GameState, turns: GameTurn[]): void {
  const loser = gameState.winner === gameState.player1.id ? gameState.player2 : gameState.player1;
  const ratio = LOSER_REMAIN_RATIO_MIN + Math.random() * (LOSER_REMAIN_RATIO_MAX - LOSER_REMAIN_RATIO_MIN);
  loser.supply = Math.floor(loser.supply * ratio);
  loser.resources = Math.floor(loser.resources * ratio);

  const last = turns[turns.length - 1];
  const penaltyCommentary = `패배한 ${loser.name} 선수의 병력과 자원이 크게 무너졌습니다!`;
  turns[turns.length - 1] = {
    ...gameStateToTurnData(gameState),
    commentaries: [...(last?.commentaries ?? []), penaltyCommentary],
  };
}

/**
 * 실제 게임 엔진을 여러 번 돌려 player1의 실제 승률(%)을 추정
 * - playGame과 동일한 입력(아이템 반영 능력치, 피로도, 맵)을 사용
 */
export function estimateWinRate(
  player1Stats: Record<StatKey, number>,
  player2Stats: Record<StatKey, number>,
  player1Race: Race,
  player2Race: Race,
  mapRaceAdvantage: Record<string, number>,
  player1Fatigue: number,
  player2Fatigue: number,
  mapTraits?: MapTraits,
  runs: number = 300
): { winRate: number; runs: number } {
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const { gameState } = runSimulation(
      1, "P1", player1Race, player1Stats, player1Fatigue,
      2, "P2", player2Race, player2Stats, player2Fatigue,
      mapRaceAdvantage, mapTraits
    );
    if (gameState.winner === 1) wins++;
  }
  return { winRate: Math.round((wins / runs) * 1000) / 10, runs };
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
  mapCharacteristic: MapCharacteristic = "balanced",
  overridePlayer1Stats?: Record<StatKey, number>,
  overridePlayer2Stats?: Record<StatKey, number>,
  mapTraits?: { rushDistance: number; resources: number; complexity: number }
): Promise<GameSimulationResult> {
  // 선수 능력치 조회 (override가 있으면 사용)
  let player1StatsRaw = overridePlayer1Stats || null;
  let player2StatsRaw = overridePlayer2Stats || null;
  
  if (!player1StatsRaw) {
    const stats = await getPlayerStats(player1Id);
    if (!stats) throw new Error("선수 능력치를 조회할 수 없습니다");
    player1StatsRaw = Object.fromEntries(
      STAT_KEYS.map(key => [key, (stats as any)[key]])
    ) as Record<StatKey, number>;
  }
  
  if (!player2StatsRaw) {
    const stats = await getPlayerStats(player2Id);
    if (!stats) throw new Error("선수 능력치를 조회할 수 없습니다");
    player2StatsRaw = Object.fromEntries(
      STAT_KEYS.map(key => [key, (stats as any)[key]])
    ) as Record<StatKey, number>;
  }

  const { gameState, turns } = runSimulation(
    player1Id, player1Name, player1Race, player1StatsRaw, player1Fatigue,
    player2Id, player2Name, player2Race, player2StatsRaw, player2Fatigue,
    mapRaceAdvantage, mapTraits
  );

  // 패배 페널티: 경기 종료 후 패자의 병력과 자원을 대폭 감소
  applyLoserPenalty(gameState, turns);

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
