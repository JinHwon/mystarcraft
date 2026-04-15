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

  // 공격 능력치: 공격 성공 시 +5, 실패 시 -3
  changes.attack = gameEvents.attackSuccess * 5 - gameEvents.attackFailure * 3;

  // 방어 능력치: 방어 성공 시 +5, 실패 시 -3
  changes.defense = gameEvents.defenseSuccess * 5 - gameEvents.defenseFailure * 3;

  // 경제 능력치: 멀티 확장 시 +5, 자원 드레인 당할 시 -3
  changes.economy = gameEvents.multiExpanded * 5 - gameEvents.resourceDrained * 3;

  // 정찰 능력치: 정찰 성공 시 +5, 실패 시 -2
  changes.intelligence = gameEvents.scoutingSuccess * 5 - gameEvents.scoutingFailure * 2;

  // 승리 시 모든 능력치에 보너스 +10
  if (isWinner) {
    changes.attack += 10;
    changes.defense += 10;
    changes.economy += 10;
    changes.intelligence += 10;
  } else {
    // 패배 시 모든 능력치에 페널티 -5
    changes.attack -= 5;
    changes.defense -= 5;
    changes.economy -= 5;
    changes.intelligence -= 5;
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
