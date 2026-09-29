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
  collapseLoser,
  type GameState,
  type PlayerSnapshot,
} from "./bw/bwEngine";

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
  /** 게임 시간(초) */
  time?: number;
  /** 선수별 상세 현황 (인구수·일꾼·기지·자원·병력 구성) */
  p1?: PlayerSnapshot;
  p2?: PlayerSnapshot;
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

  const sumTotal = player1Total + player2Total;
  let player1WinProb = sumTotal > 0 ? (player1Total / sumTotal) * 100 : 50;

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
  mapTraits?: MapTraits,
  collectTurns: boolean = true
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
  // 한 턴 = 게임 시간 20초, 최대 40분 (엔진이 자체적으로 종료 판정)
  const maxTurns = 125;

  // 승률 추정에서는 턴별 중계 데이터가 필요 없으므로 만들지 않는다
  let turnCount = 0;
  while (!gameState.gameEnded && turnCount < maxTurns) {
    progressTurn(gameState);
    turnCount++;
    if (collectTurns) turns.push(gameStateToTurnData(gameState));
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
  const ratio = LOSER_REMAIN_RATIO_MIN + Math.random() * (LOSER_REMAIN_RATIO_MAX - LOSER_REMAIN_RATIO_MIN);
  const loser = collapseLoser(gameState, ratio);

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
  runs: number = 150
): { winRate: number; runs: number } {
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const { gameState } = runSimulation(
      1, "P1", player1Race, player1Stats, player1Fatigue,
      2, "P2", player2Race, player2Stats, player2Fatigue,
      mapRaceAdvantage, mapTraits, false
    );
    if (gameState.winner === 1) wins++;
  }
  return { winRate: Math.round((wins / runs) * 1000) / 10, runs };
}

/** 우선 처리할 작업(실제 경기 진행) 수. 이 값이 0보다 크면 승률 추정이 잠시 멈춘다 */
let priorityWork = 0;
export async function withPriority<T>(fn: () => Promise<T>): Promise<T> {
  priorityWork++;
  try {
    return await fn();
  } finally {
    priorityWork--;
  }
}

/**
 * estimateWinRate 의 비동기 버전 (서버용)
 * 몇 판마다 이벤트 루프에 양보해서, 계산 중에도 게임 시작 등 다른 요청이 바로 처리되게 한다.
 */
export async function estimateWinRateAsync(
  player1Stats: Record<StatKey, number>,
  player2Stats: Record<StatKey, number>,
  player1Race: Race,
  player2Race: Race,
  mapRaceAdvantage: Record<string, number>,
  player1Fatigue: number,
  player2Fatigue: number,
  mapTraits?: MapTraits,
  runs: number = 80
): Promise<{ winRate: number; runs: number }> {
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const { gameState } = runSimulation(
      1, "P1", player1Race, player1Stats, player1Fatigue,
      2, "P2", player2Race, player2Stats, player2Fatigue,
      mapRaceAdvantage, mapTraits, false
    );
    if (gameState.winner === 1) wins++;
    if (i % 2 === 1) {
      await new Promise(resolve => setImmediate(resolve));
      // 경기 진행 요청이 처리 중이면 끝날 때까지 양보
      while (priorityWork > 0) await new Promise(resolve => setTimeout(resolve, 15));
    }
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

/** 리그 세트 결과 */
export interface SetResult {
  winnerId: number;
  /** 게임 시간(초) */
  duration: number;
  endReason?: string;
  /** 문자중계 하이라이트 ([mm:ss] 포함) */
  highlights: string[];
}

const HIGHLIGHT_RE = /빌드는|공격!|교전 승리|뒤집|역습!|수비 성공|무너|지켜냅|GG|판정|드랍|난입|급습|견제!/;

/**
 * 리그 한 세트 진행 (턴 데이터 없이 하이라이트 문자중계만 수집)
 */
export function simulateSet(
  p1: { id: number; name: string; race: Race; stats: Record<StatKey, number>; fatigue: number },
  p2: { id: number; name: string; race: Race; stats: Record<StatKey, number>; fatigue: number },
  mapRaceAdvantage: Record<string, number>,
  mapTraits: MapTraits,
  withHighlights = true
): SetResult {
  const gs = initializeGameState(
    p1.id, p1.name, p1.race, p2.id, p2.name, p2.race,
    calcEffectiveStatsWithFatigue(p1.stats, p1.fatigue),
    calcEffectiveStatsWithFatigue(p2.stats, p2.fatigue),
    mapTraits, mapRaceAdvantage
  );
  const highlights: string[] = [];
  let turns = 0;
  while (!gs.gameEnded && turns < 125) {
    progressTurn(gs);
    turns++;
    if (withHighlights) {
      // 해설에는 이미 [mm:ss] 시간이 붙어 있음
      for (const c of gs.turnCommentaries) if (HIGHLIGHT_RE.test(c)) highlights.push(c);
    }
  }
  if (!gs.gameEnded) {
    gs.gameEnded = true;
    gs.winner = gs.player1Advantage >= 50 ? gs.player1.id : gs.player2.id;
  }
  // 너무 길면 앞부분(빌드)과 뒷부분(결정적 장면) 위주로 줄임
  const trimmed = highlights.length > 18 ? [...highlights.slice(0, 4), ...highlights.slice(-14)] : highlights;
  return { winnerId: gs.winner ?? p1.id, duration: gs.time, endReason: gs.endReason, highlights: trimmed };
}
