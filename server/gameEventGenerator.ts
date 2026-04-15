/**
 * 게임 이벤트 생성기 - v12.0
 * 
 * 게임 진행 중 발생하는 이벤트를 동적으로 생성합니다.
 */

import {
  GameEvent,
  GameEventType,
  EVENT_PROBABILITIES,
  SITUATION_COMMENTARIES,
  TERRAN_BUILDS,
  PROTOSS_BUILDS,
  ZERG_BUILDS,
} from "@shared/gameEvents";

export type { GameEvent };

export interface GameEventContext {
  turn: number;
  player1: {
    id: number;
    name: string;
    race: "terran" | "protoss" | "zerg";
    supply: number;
    resources: number;
    multiCount: number;
  };
  player2: {
    id: number;
    name: string;
    race: "terran" | "protoss" | "zerg";
    supply: number;
    resources: number;
    multiCount: number;
  };
  player1Advantage: number;
}

/**
 * 게임 이벤트 생성
 */
export function generateGameEvent(context: GameEventContext): GameEvent | null {
  // 턴이 너무 초반이면 이벤트 없음
  if (context.turn < 5) return null;

  const random = Math.random();
  let cumulativeProbability = 0;

  // 교전 이벤트
  cumulativeProbability += EVENT_PROBABILITIES.engagement;
  if (random < cumulativeProbability) {
    return generateEngagementEvent(context);
  }

  // 견제 이벤트
  cumulativeProbability += EVENT_PROBABILITIES.harass;
  if (random < cumulativeProbability) {
    return generateHarassEvent(context);
  }

  // 자원 드레인 이벤트
  cumulativeProbability += EVENT_PROBABILITIES.resource_drain;
  if (random < cumulativeProbability) {
    return generateResourceDrainEvent(context);
  }

  // 멀티 파괴 이벤트
  cumulativeProbability += EVENT_PROBABILITIES.multi_destroy;
  if (random < cumulativeProbability) {
    return generateMultiDestroyEvent(context);
  }

  // 기술 업그레이드 이벤트
  cumulativeProbability += EVENT_PROBABILITIES.tech_upgrade;
  if (random < cumulativeProbability) {
    return generateTechUpgradeEvent(context);
  }

  return null;
}

/**
 * 교전 이벤트 생성
 */
function generateEngagementEvent(context: GameEventContext): GameEvent {
  const player1Supply = context.player1.supply;
  const player2Supply = context.player2.supply;
  const supplyDiff = player1Supply - player2Supply;

  // 병력이 많은 쪽이 이기는 확률 높음
  const player1WinChance = supplyDiff > 0 ? 0.65 : 0.35;
  const player1Wins = Math.random() < player1WinChance;

  if (player1Wins) {
    return {
      type: "engagement",
      turn: context.turn,
      playerId: 1,
      data: `${context.player1.name} 선수가 교전에서 승리!`,
      impact: "positive",
      commentary: `${context.player1.name} 선수가 교전을 이겨냅니다! ${context.player2.name} 선수의 병력이 큰 손실을 입었어요.`,
    };
  } else {
    return {
      type: "engagement",
      turn: context.turn,
      playerId: 2,
      data: `${context.player2.name} 선수가 교전에서 승리!`,
      impact: "positive",
      commentary: `${context.player2.name} 선수가 교전을 이겨냅니다! ${context.player1.name} 선수의 병력이 큰 손실을 입었어요.`,
    };
  }
}

/**
 * 견제 이벤트 생성
 */
function generateHarassEvent(context: GameEventContext): GameEvent {
  const isPlayer1Harass = Math.random() > 0.5;

  if (isPlayer1Harass) {
    return {
      type: "harass",
      turn: context.turn,
      playerId: 1,
      data: `${context.player1.name} 선수가 견제를 시작!`,
      impact: "positive",
      commentary: `${context.player1.name} 선수가 ${context.player2.name} 선수의 자원 채취지를 견제합니다! 상대 경제가 흔들리고 있어요.`,
    };
  } else {
    return {
      type: "harass",
      turn: context.turn,
      playerId: 2,
      data: `${context.player2.name} 선수가 견제를 시작!`,
      impact: "positive",
      commentary: `${context.player2.name} 선수가 ${context.player1.name} 선수의 자원 채취지를 견제합니다! 상대 경제가 흔들리고 있어요.`,
    };
  }
}

/**
 * 자원 드레인 이벤트 생성
 */
function generateResourceDrainEvent(context: GameEventContext): GameEvent {
  const isPlayer1Drain = Math.random() > 0.5;

  if (isPlayer1Drain) {
    return {
      type: "resource_drain",
      turn: context.turn,
      playerId: 1,
      data: `${context.player1.name} 선수가 상대 자원을 드레인!`,
      impact: "positive",
      commentary: `${context.player1.name} 선수의 지속적인 견제로 ${context.player2.name} 선수의 자원 수급이 크게 줄어들고 있습니다.`,
    };
  } else {
    return {
      type: "resource_drain",
      turn: context.turn,
      playerId: 2,
      data: `${context.player2.name} 선수가 상대 자원을 드레인!`,
      impact: "positive",
      commentary: `${context.player2.name} 선수의 지속적인 견제로 ${context.player1.name} 선수의 자원 수급이 크게 줄어들고 있습니다.`,
    };
  }
}

/**
 * 멀티 파괴 이벤트 생성
 */
function generateMultiDestroyEvent(context: GameEventContext): GameEvent {
  const isPlayer1Destroy = Math.random() > 0.5;

  if (isPlayer1Destroy && context.player2.multiCount > 1) {
    return {
      type: "multi_destroy",
      turn: context.turn,
      playerId: 1,
      data: `${context.player1.name} 선수가 상대 멀티를 파괴!`,
      impact: "positive",
      commentary: `${context.player1.name} 선수가 ${context.player2.name} 선수의 멀티 기지를 파괴했습니다! 상대의 경제가 큰 타격을 입었어요.`,
    };
  } else if (context.player1.multiCount > 1) {
    return {
      type: "multi_destroy",
      turn: context.turn,
      playerId: 2,
      data: `${context.player2.name} 선수가 상대 멀티를 파괴!`,
      impact: "positive",
      commentary: `${context.player2.name} 선수가 ${context.player1.name} 선수의 멀티 기지를 파괴했습니다! 상대의 경제가 큰 타격을 입었어요.`,
    };
  } else {
    // 멀티가 없으면 견제 이벤트로 대체
    return generateHarassEvent(context);
  }
}

/**
 * 기술 업그레이드 이벤트 생성
 */
function generateTechUpgradeEvent(context: GameEventContext): GameEvent {
  const isPlayer1Tech = Math.random() > 0.5;

  const techNames = {
    terran: ["공격력 업그레이드", "방어력 업그레이드", "이동속도 업그레이드"],
    protoss: ["공격력 업그레이드", "방어력 업그레이드", "에너지 업그레이드"],
    zerg: ["공격력 업그레이드", "방어력 업그레이드", "이동속도 업그레이드"],
  };

  if (isPlayer1Tech) {
    const tech = techNames[context.player1.race][Math.floor(Math.random() * 3)];
    return {
      type: "tech_upgrade",
      turn: context.turn,
      playerId: 1,
      data: `${context.player1.name} 선수가 ${tech} 완료!`,
      impact: "positive",
      commentary: `${context.player1.name} 선수가 ${tech}를 완료했습니다! 이제 더욱 강해질 것 같습니다.`,
    };
  } else {
    const tech = techNames[context.player2.race][Math.floor(Math.random() * 3)];
    return {
      type: "tech_upgrade",
      turn: context.turn,
      playerId: 2,
      data: `${context.player2.name} 선수가 ${tech} 완료!`,
      impact: "positive",
      commentary: `${context.player2.name} 선수가 ${tech}를 완료했습니다! 이제 더욱 강해질 것 같습니다.`,
    };
  }
}

/**
 * 상황 해설 생성
 */
export function generateSituationCommentary(): string {
  return SITUATION_COMMENTARIES[Math.floor(Math.random() * SITUATION_COMMENTARIES.length)];
}
