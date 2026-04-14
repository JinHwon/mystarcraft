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

/**
 * 게임 턴 데이터 구조
 */
export interface GameTurn {
  turn: number;
  commentary: string;
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
  
  const baseWinProb = player1Total / (player1Total + player2Total);
  
  // 맵 유불리 적용 (±5%)
  const player1MapBonus = (mapRaceAdvantage[player1Race] - 50) / 1000;
  const player2MapBonus = (mapRaceAdvantage[player2Race] - 50) / 1000;
  
  let adjustedWinProb = baseWinProb + player1MapBonus - player2MapBonus;
  adjustedWinProb = Math.max(0.2, Math.min(0.8, adjustedWinProb)); // 20~80% 범위
  
  return Math.round(adjustedWinProb * 100);
}

/**
 * 게임 시뮬레이션 실행
 * 턴 기반 시뮬레이션으로 해설과 함께 병력/자원 변화를 표현
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
  
  // buildActions 임포트 추가
  const { generatePlayerActions: genActions, generateGameCommentary: genCommentary } = await import("./buildActions");
  
  // 게임 진행 시뮬레이션
  const allCommentaries: string[] = [];
  for (let turn = 1; turn <= maxTurns; turn++) {
    const commentary = generateCommentary(
      turn,
      maxTurns,
      player1Race,
      player2Race,
      player1WinProb,
      player1Supply,
      player2Supply,
      player1Resources,
      player2Resources
    );
    
    // 빌드 기반 플레이어 액션 생성
    const player1Action = genActions(
      player1Name,
      player1Race,
      player1Build.type,
      turn,
      maxTurns
    );
    
    const player2Action = genActions(
      player2Name,
      player2Race,
      player2Build.type,
      turn,
      maxTurns
    );
    
    // 두 플레이어의 액션을 조합하여 해설 생성
    const gameCommentary = genCommentary(
      player1Action,
      player2Action,
      turn,
      maxTurns
    );
    
    allCommentaries.push(gameCommentary);
    
    // 턴별 자원/병력 변화
    const changeData = calculateTurnChanges(
      turn,
      maxTurns,
      player1Race,
      player2Race,
      player1EffectiveStats,
      player2EffectiveStats,
      player1WinProb,
      difficulty
    );
    
    player1Supply += changeData.player1SupplyChange;
    player2Supply += changeData.player2SupplyChange;
    player1Resources += changeData.player1ResourceChange;
    player2Resources += changeData.player2ResourceChange;
    player1Health -= changeData.player1HealthLoss;
    player2Health -= changeData.player2HealthLoss;
    
    // 범위 제한
    player1Supply = Math.max(0, Math.min(200, player1Supply));
    player2Supply = Math.max(0, Math.min(200, player2Supply));
    player1Resources = Math.max(0, Math.min(500, player1Resources));
    player2Resources = Math.max(0, Math.min(500, player2Resources));
    player1Health = Math.max(0, Math.min(100, player1Health));
    player2Health = Math.max(0, Math.min(100, player2Health));
    
    turns.push({
      turn,
      commentary,
      player1Supply,
      player1Resources,
      player2Supply,
      player2Resources,
      player1Health,
      player2Health,
      allCommentaries: [...allCommentaries],
    });
    
    // 게임 종료 조건
    if (player1Health <= 0 || player2Health <= 0) {
      break;
    }
  }
  
  // 승자 결정
  const winnerId = player1Health > player2Health ? player1Id : player2Id;
  
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

/**
 * 해설 생성
 */
// 기존 generateCommentary 함수는 유지하되, 빌드 기반 해설로 보강
function generateCommentary(
  turn: number,
  maxTurns: number,
  player1Race: "terran" | "zerg" | "protoss",
  player2Race: "terran" | "zerg" | "protoss",
  player1WinProb: number,
  player1Supply: number,
  player2Supply: number,
  player1Resources: number,
  player2Resources: number
): string {
  const turnPhase = turn / maxTurns;
  const commentaries: string[] = [];
  
  // 게임 진행 단계별 해설
  if (turnPhase < 0.3) {
    // 초반: 빌드 오더 및 초기 병력
    if (player1Supply > player2Supply) {
      commentaries.push(`${getRaceKorean(player1Race)}이 초반 빌드 오더를 잘 펼쳤습니다!`);
    } else if (player2Supply > player1Supply) {
      commentaries.push(`${getRaceKorean(player2Race)}이 초반 빌드 오더를 잘 펼쳤습니다!`);
    } else {
      commentaries.push("양 선수 모두 균형잡힌 초반 빌드를 보여주고 있습니다!");
    }
  } else if (turnPhase < 0.6) {
    // 중반: 확장 및 병력 구성
    if (player1Resources > player2Resources) {
      commentaries.push(`${getRaceKorean(player1Race)}이 자원 수급을 잘 관리하고 있습니다!`);
    } else if (player2Resources > player1Resources) {
      commentaries.push(`${getRaceKorean(player2Race)}이 자원 수급을 잘 관리하고 있습니다!`);
    } else {
      commentaries.push("양 선수의 자원 관리가 팽팽합니다!");
    }
  } else {
    // 후반: 최종 전투
    if (player1Supply > player2Supply) {
      commentaries.push(`${getRaceKorean(player1Race)}이 병력 우위를 확보했습니다!`);
    } else if (player2Supply > player1Supply) {
      commentaries.push(`${getRaceKorean(player2Race)}이 병력 우위를 확보했습니다!`);
    } else {
      commentaries.push("최종 전투가 펼쳐지고 있습니다!");
    }
  }
  
  // 확률 기반 추가 해설
  if (player1WinProb > 60) {
    commentaries.push(`${getRaceKorean(player1Race)} 선수가 우위를 점하고 있습니다!`);
  } else if (player1WinProb < 40) {
    commentaries.push(`${getRaceKorean(player2Race)} 선수가 우위를 점하고 있습니다!`);
  } else {
    commentaries.push("경기가 팽팽합니다!");
  }
  
  return commentaries.join(" ");
}

/**
 * 턴별 변화 계산
 */
function calculateTurnChanges(
  turn: number,
  maxTurns: number,
  player1Race: string,
  player2Race: string,
  player1Stats: Record<StatKey, number>,
  player2Stats: Record<StatKey, number>,
  player1WinProb: number,
  difficulty: "beginner" | "intermediate" | "advanced"
): {
  player1SupplyChange: number;
  player2SupplyChange: number;
  player1ResourceChange: number;
  player2ResourceChange: number;
  player1HealthLoss: number;
  player2HealthLoss: number;
} {
  const turnPhase = turn / maxTurns;
  
  // 난이도별 변화 배수
  const difficultyMultiplier = {
    beginner: 0.8,
    intermediate: 1.0,
    advanced: 1.2,
  }[difficulty];
  
  // 능력치별 영향도
  const player1SupplyRate = (player1Stats.supply / 500) * difficultyMultiplier;
  const player2SupplyRate = (player2Stats.supply / 500) * difficultyMultiplier;
  const player1ResourceRate = (player1Stats.strategy / 500) * difficultyMultiplier;
  const player2ResourceRate = (player2Stats.strategy / 500) * difficultyMultiplier;
  const player1AttackRate = (player1Stats.attack / 500) * difficultyMultiplier;
  const player2AttackRate = (player2Stats.attack / 500) * difficultyMultiplier;
  
  // 턴별 변화
  let player1SupplyChange = Math.round(1 + player1SupplyRate);
  let player2SupplyChange = Math.round(1 + player2SupplyRate);
  let player1ResourceChange = Math.round(2 + player1ResourceRate);
  let player2ResourceChange = Math.round(2 + player2ResourceRate);
  
  // 후반부 전투 강화
  if (turnPhase > 0.6) {
    const combatIntensity = (turnPhase - 0.6) / 0.4;
    player1SupplyChange = Math.round(player1SupplyChange * (1 + combatIntensity * 0.5));
    player2SupplyChange = Math.round(player2SupplyChange * (1 + combatIntensity * 0.5));
  }
  
  // 승률 기반 손실 계산
  const player1HealthLoss = Math.round(
    (2 + (100 - player1WinProb) / 20) * difficultyMultiplier
  );
  const player2HealthLoss = Math.round(
    (2 + player1WinProb / 20) * difficultyMultiplier
  );
  
  return {
    player1SupplyChange,
    player2SupplyChange,
    player1ResourceChange,
    player2ResourceChange,
    player1HealthLoss,
    player2HealthLoss,
  };
}

/**
 * 종족명 한글화
 */
function getRaceKorean(race: string): string {
  const raceMap: Record<string, string> = {
    terran: "테란",
    zerg: "저그",
    protoss: "프로토스",
  };
  return raceMap[race] || race;
}
