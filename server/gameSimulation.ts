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
import { determineBuild, generateBuildCommentary, type MapCharacteristic } from "./buildSystem";
import { generateDynamicCommentary, calculateActionImpact, type PlayerActionInfo, type GameAction } from "./dynamicCommentary";

/**
 * 게임 턴 데이터 구조
 */
export interface GameTurn {
  turn: number;
  player1Commentary: string[]; // 플레이어 1 해설
  player2Commentary: string[]; // 플레이어 2 해설
  player1Supply: number;
  player1Resources: number;
  player2Supply: number;
  player2Resources: number;
  player1Health: number;
  player2Health: number;
  allCommentaries: string[]; // 누적 해설
}

/**
 * 게임 시뮬레이션 결과
 */
export interface GameSimulationResult {
  winnerId: number;
  turns: GameTurn[];
  player1FinalScore: number;
  player2FinalScore: number;
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
  // 기본 능력치 기반 승률
  const player1Total = calcTotalStats(player1Stats);
  const player2Total = calcTotalStats(player2Stats);
  
  // 기본 승률 계산
  let player1WinProb = (player1Total / (player1Total + player2Total)) * 100;
  
  // 맵 종족 유불리 적용
  const player1Advantage = mapRaceAdvantage[player1Race] || 0;
  const player2Advantage = mapRaceAdvantage[player2Race] || 0;
  
  player1WinProb += (player1Advantage - player2Advantage) * 5;
  
  // 범위 제한
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
  
  // 승률 계산
  const player1WinProb = calculateWinProbability(
    player1EffectiveStats,
    player2EffectiveStats,
    player1Race,
    player2Race,
    mapRaceAdvantage
  );
  
  // 난이도별 턴 수
  const turnCounts = {
    beginner: 8,
    intermediate: 12,
    advanced: 15,
  };
  const maxTurns = turnCounts[difficulty];
  
  // 게임 시뮬레이션
  const turns: GameTurn[] = [];
  let player1Supply = 12;
  let player2Supply = 12;
  let player1Resources = 50;
  let player2Resources = 50;
  let player1Health = 100;
  let player2Health = 100;
  
  // 빌드 결정
  const player1Build = determineBuild(player1EffectiveStats, mapCharacteristic);
  const player2Build = determineBuild(player2EffectiveStats, mapCharacteristic);
  
  // buildActions 임포트
  const { generatePlayerActions: genActions, shouldGameEnd } = await import("./buildActions");
  
  // 게임 진행 시뮬레이션
  const allCommentaries: string[] = [];
  for (let turn = 1; turn <= maxTurns; turn++) {
    const turnPhase = turn / maxTurns;
    
    // 빌드 기반 플레이어 액션 생성
    const player1ActionData = genActions(
      player1Name,
      player1Race,
      player1Build.type,
      turn,
      maxTurns
    );
    
    const player2ActionData = genActions(
      player2Name,
      player2Race,
      player2Build.type,
      turn,
      maxTurns
    );
    
    // 동적 해설 생성
    const player1ActionInfo: PlayerActionInfo = {
      playerName: player1Name,
      race: player1Race,
      buildType: player1Build.type,
      action: player1ActionData.action as GameAction,
      stats: player1EffectiveStats,
      turn,
      maxTurns,
    };
    
    const player2ActionInfo: PlayerActionInfo = {
      playerName: player2Name,
      race: player2Race,
      buildType: player2Build.type,
      action: player2ActionData.action as GameAction,
      stats: player2EffectiveStats,
      turn,
      maxTurns,
    };
    
    // 플레이어별 동적 해설
    const player1Commentary = generateDynamicCommentary(player1ActionInfo);
    const player2Commentary = generateDynamicCommentary(player2ActionInfo);
    
    // 누적 해설에 추가
    allCommentaries.push(...player1Commentary);
    allCommentaries.push(...player2Commentary);
    
    // 액션별 병력/자원 변화 계산
    const player1Impact = calculateActionImpact(
      player1ActionData.action as GameAction,
      player1EffectiveStats,
      player1Supply,
      player1Resources,
      player1Build.type
    );
    
    const player2Impact = calculateActionImpact(
      player2ActionData.action as GameAction,
      player2EffectiveStats,
      player2Supply,
      player2Resources,
      player2Build.type
    );
    
    // 병력/자원 변화 적용
    player1Supply += player1Impact.supplyChange;
    player1Resources += player1Impact.resourceChange;
    player2Supply += player2Impact.supplyChange;
    player2Resources += player2Impact.resourceChange;
    
    // 멀티 확장 로직
    if (turnPhase > 0.2 && turnPhase < 0.7) {
      if (player1Resources > 200 && Math.random() < (player1EffectiveStats.sense / 1000)) {
        player1Resources += 30;
        allCommentaries.push(`[중립] ${player1Name} 선수 멀티지역 리소스를 확보했습니다!`);
      }
      if (player2Resources > 200 && Math.random() < (player2EffectiveStats.sense / 1000)) {
        player2Resources += 30;
        allCommentaries.push(`[중립] ${player2Name} 선수 멀티지역 리소스를 확보했습니다!`);
      }
    }
    
    // 병력 교전 시뮬레이션
    if (turnPhase > 0.4) {
      const combatIntensity = Math.min(1, (turnPhase - 0.4) / 0.3);
      
      if (player1Supply > player2Supply) {
        const damageToPlayer2 = Math.round((player1Supply - player2Supply) * combatIntensity * 0.3);
        player2Supply = Math.max(0, player2Supply - damageToPlayer2);
        player2Resources = Math.max(0, player2Resources - damageToPlayer2 * 2);
        
        if (damageToPlayer2 > 0) {
          allCommentaries.push(`[중립] ${player1Name} 선수의 병력이 ${player2Name} 선수의 병력을 압박합니다!`);
        }
      } else if (player2Supply > player1Supply) {
        const damageToPlayer1 = Math.round((player2Supply - player1Supply) * combatIntensity * 0.3);
        player1Supply = Math.max(0, player1Supply - damageToPlayer1);
        player1Resources = Math.max(0, player1Resources - damageToPlayer1 * 2);
        
        if (damageToPlayer1 > 0) {
          allCommentaries.push(`[중립] ${player2Name} 선수의 병력이 ${player1Name} 선수의 병력을 압박합니다!`);
        }
      }
    }
    
    // 범위 제한
    player1Supply = Math.max(0, Math.min(200, player1Supply));
    player2Supply = Math.max(0, Math.min(200, player2Supply));
    player1Resources = Math.max(0, Math.min(500, player1Resources));
    player2Resources = Math.max(0, Math.min(500, player2Resources));
    player1Health = Math.max(0, player1Health);
    player2Health = Math.max(0, player2Health);
    
    // 게임 종료 판정
    if (shouldGameEnd(player1Supply, player1Resources, player1Health, player2Supply, player2Resources, player2Health, turn)) {
      break;
    }
    
    // 턴 데이터 저장
    turns.push({
      turn,
      player1Commentary,
      player2Commentary,
      player1Supply,
      player1Resources,
      player2Supply,
      player2Resources,
      player1Health,
      player2Health,
      allCommentaries: [...allCommentaries],
    });
  }
  
  // 최종 승자 판정
  let winnerId = player1Id;
  if (player2Supply > player1Supply || player2Resources > player1Resources) {
    winnerId = player2Id;
  }
  
  // 최종 해설 추가
  if (winnerId === player1Id) {
    allCommentaries.push(`[중립] ${player1Name} 선수 상대의 허점을 놓치지 않아요`);
    allCommentaries.push(`[중립] ${player1Name} 선수 역시 이길 줄 아는 선수입니다`);
    allCommentaries.push(`[중립] ${player2Name} 선수 GG를 칠 수 밖에 없네요.`);
  } else if (winnerId === player2Id) {
    allCommentaries.push(`[중립] ${player2Name} 선수 상대의 허점을 놓치지 않아요`);
    allCommentaries.push(`[중립] ${player2Name} 선수 역시 이길 줄 아는 선수입니다`);
    allCommentaries.push(`[중립] ${player1Name} 선수 GG를 칠 수 밖에 없네요.`);
  }
  
  // 최종 턴에 모든 해설 추가
  if (turns.length > 0) {
    turns[turns.length - 1].allCommentaries = allCommentaries;
  }
  
  // 최종 스코어 계산
  const player1FinalScore = Math.round(
    (player1Supply + player1Resources / 5 + player1Health) / 3
  );
  const player2FinalScore = Math.round(
    (player2Supply + player2Resources / 5 + player2Health) / 3
  );
  
  return {
    winnerId,
    turns,
    player1FinalScore,
    player2FinalScore,
  };
}
