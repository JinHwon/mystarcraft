/**
 * 능력치 동적 변경 시스템 v2.0
 * 
 * 핵심 원칙:
 * 1. 이겼을 때는 능력치가 거의 깎이지 않음 (최소 0)
 * 2. 등급이 높은데 낮은 상대에게 이기면 → 상승 적음
 * 3. 등급이 높은데 낮은 상대에게 지면 → 하락 큼
 * 4. 등급이 낮은데 높은 상대에게 이기면 → 상승 큼
 * 5. 등급이 낮은데 높은 상대에게 지면 → 하락 적음
 */

export interface StatChange {
  attack: number;
  defense: number;
  economy: number;
  intelligence: number;
}

/**
 * 게임 결과에 따른 기본 능력치 변화 계산
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

  const attackDirection = gameEvents.attackSuccess - gameEvents.attackFailure;
  const defenseDirection = gameEvents.defenseSuccess - gameEvents.defenseFailure;
  const economyDirection = gameEvents.multiExpanded - gameEvents.resourceDrained;
  const intelligenceDirection = gameEvents.scoutingSuccess - gameEvents.scoutingFailure;

  if (isWinner) {
    // 승리 시: 0 ~ +5 범위 (깎이지 않음!)
    // 이벤트 방향에 따라 기본값 결정 후 랜덤 요소 추가
    changes.attack = Math.max(0, Math.min(5, attackDirection + Math.floor(Math.random() * 4)));
    changes.defense = Math.max(0, Math.min(5, defenseDirection + Math.floor(Math.random() * 4)));
    changes.economy = Math.max(0, Math.min(5, economyDirection + Math.floor(Math.random() * 4)));
    changes.intelligence = Math.max(0, Math.min(5, intelligenceDirection + Math.floor(Math.random() * 4)));
  } else {
    // 패배 시: -5 ~ +1 범위 (하향 편향)
    changes.attack = Math.max(-5, Math.min(1, attackDirection + Math.floor(Math.random() * 3) - 3));
    changes.defense = Math.max(-5, Math.min(1, defenseDirection + Math.floor(Math.random() * 3) - 3));
    changes.economy = Math.max(-5, Math.min(1, economyDirection + Math.floor(Math.random() * 3) - 3));
    changes.intelligence = Math.max(-5, Math.min(1, intelligenceDirection + Math.floor(Math.random() * 3) - 3));
  }

  return changes;
}

/**
 * 등급 기반 능력치 역전 시스템
 * 
 * playerGradeIndex: 내 등급 인덱스 (0=F, 1=E, ..., 8=SSS)
 * opponentGradeIndex: 상대 등급 인덱스
 * 
 * 등급 차이에 따라 능력치 변동 배율 조정:
 * - 내가 높은데 이김 → 상승 적음 (0.3~0.7배)
 * - 내가 높은데 짐 → 하락 큼 (1.5~2.5배)
 * - 내가 낮은데 이김 → 상승 큼 (1.5~3.0배)
 * - 내가 낮은데 짐 → 하락 적음 (0.3~0.6배)
 * - 등급 같으면 → 1.0배
 */
export function applyReverseSystem(
  isWinner: boolean,
  playerStats: { attack: number; defense: number; economy: number; intelligence: number },
  opponentStats: { attack: number; defense: number; economy: number; intelligence: number },
  baseChanges: StatChange,
  playerGradeIndex?: number,
  opponentGradeIndex?: number
): StatChange {
  const adjustedChanges = { ...baseChanges };

  // 등급 인덱스가 제공되면 등급 기반 배율 적용
  const myGrade = playerGradeIndex ?? 0;
  const oppGrade = opponentGradeIndex ?? 0;
  const gradeDiff = myGrade - oppGrade; // 양수면 내가 높음, 음수면 상대가 높음

  let multiplier = 1.0;

  if (isWinner) {
    if (gradeDiff > 0) {
      // 내가 등급이 높은데 이김 → 상승 적음
      // 등급 차이 1당 0.15씩 감소 (최소 0.3배)
      multiplier = Math.max(0.3, 1.0 - gradeDiff * 0.15);
    } else if (gradeDiff < 0) {
      // 내가 등급이 낮은데 이김 → 상승 큼!
      // 등급 차이 1당 0.4씩 증가 (최대 3.0배)
      multiplier = Math.min(3.0, 1.0 + Math.abs(gradeDiff) * 0.4);
    }
    // 등급 같으면 1.0배

    adjustedChanges.attack = Math.round(baseChanges.attack * multiplier);
    adjustedChanges.defense = Math.round(baseChanges.defense * multiplier);
    adjustedChanges.economy = Math.round(baseChanges.economy * multiplier);
    adjustedChanges.intelligence = Math.round(baseChanges.intelligence * multiplier);

    // 승리 시 최종 범위: 0 ~ +8 (등급 낮은데 이기면 최대 8까지)
    adjustedChanges.attack = Math.max(0, Math.min(8, adjustedChanges.attack));
    adjustedChanges.defense = Math.max(0, Math.min(8, adjustedChanges.defense));
    adjustedChanges.economy = Math.max(0, Math.min(8, adjustedChanges.economy));
    adjustedChanges.intelligence = Math.max(0, Math.min(8, adjustedChanges.intelligence));
  } else {
    if (gradeDiff > 0) {
      // 내가 등급이 높은데 짐 → 하락 큼!
      // 등급 차이 1당 0.3씩 증가 (최대 2.5배)
      multiplier = Math.min(2.5, 1.0 + gradeDiff * 0.3);
    } else if (gradeDiff < 0) {
      // 내가 등급이 낮은데 짐 → 하락 적음
      // 등급 차이 1당 0.15씩 감소 (최소 0.3배)
      multiplier = Math.max(0.3, 1.0 - Math.abs(gradeDiff) * 0.15);
    }
    // 등급 같으면 1.0배

    adjustedChanges.attack = Math.round(baseChanges.attack * multiplier);
    adjustedChanges.defense = Math.round(baseChanges.defense * multiplier);
    adjustedChanges.economy = Math.round(baseChanges.economy * multiplier);
    adjustedChanges.intelligence = Math.round(baseChanges.intelligence * multiplier);

    // 패배 시 최종 범위: -10 ~ +1 (등급 높은데 지면 최대 -10까지)
    adjustedChanges.attack = Math.max(-10, Math.min(1, adjustedChanges.attack));
    adjustedChanges.defense = Math.max(-10, Math.min(1, adjustedChanges.defense));
    adjustedChanges.economy = Math.max(-10, Math.min(1, adjustedChanges.economy));
    adjustedChanges.intelligence = Math.max(-10, Math.min(1, adjustedChanges.intelligence));
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
