/**
 * 능력치 동적 변경 시스템
 * 게임 진행 방식에 따라 플레이어의 능력치를 동적으로 변경
 */

export interface StatChange {
  attack: number;
  defense: number;
  economy: number;
  intelligence: number;
}

/**
 * 게임 결과에 따른 능력치 변화 계산
 * @param isWinner 승리 여부
 * @param gameEvents 게임 진행 중 발생한 이벤트들
 * @returns 변화된 능력치
 */
export function calculateStatChanges(
  isWinner: boolean,
  gameEvents: {
    attackSuccess: number;
    attackFailure: number;
    defenseSuccess: number;
    defenseFailure: number;
    multiExpanded: number;
    resourceDrained: number;
    scoutingSuccess: number;
    scoutingFailure: number;
  }
): StatChange {
  const changes: StatChange = {
    attack: 0,
    defense: 0,
    economy: 0,
    intelligence: 0,
  };

  // 이벤트 기반으로 능력치 변동 방향 결정 (성공 많으면 +, 실패 많으면 -)
  const attackDirection = gameEvents.attackSuccess - gameEvents.attackFailure;
  const defenseDirection = gameEvents.defenseSuccess - gameEvents.defenseFailure;
  const economyDirection = gameEvents.multiExpanded - gameEvents.resourceDrained;
  const intelligenceDirection = gameEvents.scoutingSuccess - gameEvents.scoutingFailure;

  if (isWinner) {
    // 승리 시: -5 ~ +5 범위
    // 이벤트 방향에 따라 기본값 결정 후 랜덤 요소 추가
    changes.attack = Math.max(-5, Math.min(5, attackDirection + Math.floor(Math.random() * 5) - 2));
    changes.defense = Math.max(-5, Math.min(5, defenseDirection + Math.floor(Math.random() * 5) - 2));
    changes.economy = Math.max(-5, Math.min(5, economyDirection + Math.floor(Math.random() * 5) - 2));
    changes.intelligence = Math.max(-5, Math.min(5, intelligenceDirection + Math.floor(Math.random() * 5) - 2));
  } else {
    // 패배 시: -5 ~ +2 범위
    // 이벤트 방향에 따라 기본값 결정 후 랜덤 요소 추가 (패배이므로 하향 편향)
    changes.attack = Math.max(-5, Math.min(2, attackDirection + Math.floor(Math.random() * 4) - 3));
    changes.defense = Math.max(-5, Math.min(2, defenseDirection + Math.floor(Math.random() * 4) - 3));
    changes.economy = Math.max(-5, Math.min(2, economyDirection + Math.floor(Math.random() * 4) - 3));
    changes.intelligence = Math.max(-5, Math.min(2, intelligenceDirection + Math.floor(Math.random() * 4) - 3));
  }

  return changes;
}

/**
 * 능력치 역전 시스템
 * 낮은 능력치 플레이어가 높은 능력치 플레이어를 이기면 더 많은 능력치 획득
 * @param isWinner 승리 여부
 * @param winnerStats 승자의 현재 능력치
 * @param loserStats 패자의 현재 능력치
 * @param baseChanges 기본 능력치 변화
 * @returns 역전 시스템이 적용된 능력치 변화
 */
export function applyReverseSystem(
  isWinner: boolean,
  winnerStats: { attack: number; defense: number; economy: number; intelligence: number },
  loserStats: { attack: number; defense: number; economy: number; intelligence: number },
  baseChanges: StatChange
): StatChange {
  const adjustedChanges = { ...baseChanges };

  if (isWinner) {
    // 승자의 평균 능력치
    const winnerAvg = (winnerStats.attack + winnerStats.defense + winnerStats.economy + winnerStats.intelligence) / 4;
    // 패자의 평균 능력치
    const loserAvg = (loserStats.attack + loserStats.defense + loserStats.economy + loserStats.intelligence) / 4;

    // 낮은 능력치가 높은 능력치를 이긴 경우
    if (winnerAvg < loserAvg) {
      const diff = loserAvg - winnerAvg;
      const multiplier = 1 + diff / 100; // 능력치 차이에 따른 배수 (최대 1.5배)
      adjustedChanges.attack = Math.round(baseChanges.attack * multiplier);
      adjustedChanges.defense = Math.round(baseChanges.defense * multiplier);
      adjustedChanges.economy = Math.round(baseChanges.economy * multiplier);
      adjustedChanges.intelligence = Math.round(baseChanges.intelligence * multiplier);
    }

    // 승리 시 최종 범위 클램핑: -5 ~ +5
    adjustedChanges.attack = Math.max(-5, Math.min(5, adjustedChanges.attack));
    adjustedChanges.defense = Math.max(-5, Math.min(5, adjustedChanges.defense));
    adjustedChanges.economy = Math.max(-5, Math.min(5, adjustedChanges.economy));
    adjustedChanges.intelligence = Math.max(-5, Math.min(5, adjustedChanges.intelligence));
  } else {
    // 패자의 평균 능력치
    const winnerAvg = (winnerStats.attack + winnerStats.defense + winnerStats.economy + winnerStats.intelligence) / 4;
    // 승자의 평균 능력치
    const loserAvg = (loserStats.attack + loserStats.defense + loserStats.economy + loserStats.intelligence) / 4;

    // 높은 능력치가 낮은 능력치에게 진 경우
    if (loserAvg > winnerAvg) {
      const diff = loserAvg - winnerAvg;
      const multiplier = 1 + diff / 100; // 능력치 차이에 따른 배수 (최대 1.5배)
      adjustedChanges.attack = Math.round(baseChanges.attack * multiplier);
      adjustedChanges.defense = Math.round(baseChanges.defense * multiplier);
      adjustedChanges.economy = Math.round(baseChanges.economy * multiplier);
      adjustedChanges.intelligence = Math.round(baseChanges.intelligence * multiplier);
    }

    // 패배 시 최종 범위 클램핑: -5 ~ +2
    adjustedChanges.attack = Math.max(-5, Math.min(2, adjustedChanges.attack));
    adjustedChanges.defense = Math.max(-5, Math.min(2, adjustedChanges.defense));
    adjustedChanges.economy = Math.max(-5, Math.min(2, adjustedChanges.economy));
    adjustedChanges.intelligence = Math.max(-5, Math.min(2, adjustedChanges.intelligence));
  }

  return adjustedChanges;
}

/**
 * 능력치 히스토리 항목
 */
export interface StatHistory {
  gameId: number;
  playerId: number;
  timestamp: Date;
  isWinner: boolean;
  opponentName: string;
  opponentRace: string;
  difficulty: string;
  statChanges: StatChange;
  beforeStats: {
    attack: number;
    defense: number;
    economy: number;
    intelligence: number;
  };
  afterStats: {
    attack: number;
    defense: number;
    economy: number;
    intelligence: number;
  };
}
