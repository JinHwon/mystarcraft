/**
 * 게임 이벤트 시스템 - v12.0
 * 
 * 게임을 진행하는 중요한 이벤트들을 정의합니다:
 * - 교전 (Engagement): 병력이 충돌하는 전투
 * - 견제 (Harass): 상대 자원 채취지 공격
 * - 자원 드레인 (Resource Drain): 상대 경제 약화
 * - 멀티 파괴 (Multi Destroy): 상대 확장 기지 파괴
 * - 기술 업그레이드 (Tech Upgrade): 새로운 기술 습득
 */

export type GameEventType = 
  | "engagement"      // 교전
  | "harass"          // 견제
  | "resource_drain"  // 자원 드레인
  | "multi_destroy"   // 멀티 파괴
  | "tech_upgrade"    // 기술 업그레이드
  | "production_hit"  // 생산기지 타격
  | "unit_produced"   // 유닛 생산
  | "building_built"  // 건물 건설
  | "situation";      // 상황 설명

export interface GameEvent {
  type: GameEventType;
  turn: number;
  playerId: 1 | 2;
  data: string;
  impact: "positive" | "negative" | "neutral";
  commentary: string;
}

/**
 * 종족별 빌드 전략
 */
export type BuildStrategy = 
  | "aggressive"      // 공격적 빌드 (초반 견제)
  | "economic"        // 경제 중심 빌드 (멀티 확장)
  | "balanced"        // 균형잡힌 빌드
  | "defensive";      // 방어적 빌드

export interface RaceSpecificBuild {
  race: "terran" | "protoss" | "zerg";
  strategy: BuildStrategy;
  description: string;
  earlyUnits: string[];
  midUnits: string[];
  lateUnits: string[];
}

/**
 * 테란 빌드
 */
export const TERRAN_BUILDS: Record<BuildStrategy, RaceSpecificBuild> = {
  aggressive: {
    race: "terran",
    strategy: "aggressive",
    description: "초반 마린 러쉬로 상대 견제",
    earlyUnits: ["마린", "SCV"],
    midUnits: ["마린", "벌쳐"],
    lateUnits: ["탱크", "골리앗", "배틀크루저"],
  },
  economic: {
    race: "terran",
    strategy: "economic",
    description: "커맨드센터 먼저 경제 중심",
    earlyUnits: ["SCV"],
    midUnits: ["마린", "탱크"],
    lateUnits: ["탱크", "골리앗", "배틀크루저"],
  },
  balanced: {
    race: "terran",
    strategy: "balanced",
    description: "배럭과 경제의 균형",
    earlyUnits: ["마린", "SCV"],
    midUnits: ["마린", "벌쳐", "탱크"],
    lateUnits: ["탱크", "골리앗", "배틀크루저"],
  },
  defensive: {
    race: "terran",
    strategy: "defensive",
    description: "방어 중심 플레이",
    earlyUnits: ["SCV", "터렛"],
    midUnits: ["마린", "탱크"],
    lateUnits: ["탱크", "골리앗", "배슬"],
  },
};

/**
 * 프로토스 빌드
 */
export const PROTOSS_BUILDS: Record<BuildStrategy, RaceSpecificBuild> = {
  aggressive: {
    race: "protoss",
    strategy: "aggressive",
    description: "초반 질럿 러쉬로 상대 견제",
    earlyUnits: ["질럿", "프로브"],
    midUnits: ["질럿", "드래군"],
    lateUnits: ["다크템플러", "하이템플러", "리버", "케리어"],
  },
  economic: {
    race: "protoss",
    strategy: "economic",
    description: "넥서스 먼저 경제 중심",
    earlyUnits: ["프로브"],
    midUnits: ["드래군", "질럿"],
    lateUnits: ["다크템플러", "하이템플러", "리버", "케리어"],
  },
  balanced: {
    race: "protoss",
    strategy: "balanced",
    description: "게이트웨이와 경제의 균형",
    earlyUnits: ["질럿", "프로브"],
    midUnits: ["질럿", "드래군"],
    lateUnits: ["다크템플러", "하이템플러", "리버", "케리어"],
  },
  defensive: {
    race: "protoss",
    strategy: "defensive",
    description: "방어 중심 플레이",
    earlyUnits: ["프로브", "포톤캐논"],
    midUnits: ["질럿", "드래군"],
    lateUnits: ["다크템플러", "하이템플러", "리버", "아비터"],
  },
};

/**
 * 저그 빌드
 */
export const ZERG_BUILDS: Record<BuildStrategy, RaceSpecificBuild> = {
  aggressive: {
    race: "zerg",
    strategy: "aggressive",
    description: "초반 저글링 러쉬로 상대 견제",
    earlyUnits: ["저글링", "드론"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["울트라, 럴커", "가디언"],
  },
  economic: {
    race: "zerg",
    strategy: "economic",
    description: "드론 경제 중심",
    earlyUnits: ["드론"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["울트라", "럴커", "가디언"],
  },
  balanced: {
    race: "zerg",
    strategy: "balanced",
    description: "저글링과 경제의 균형",
    earlyUnits: ["저글링", "드론"],
    midUnits: ["저글링", "뮤탈리스크", "히드라"],
    lateUnits: ["울트라", "럴커", "가디언"],
  },
  defensive: {
    race: "zerg",
    strategy: "defensive",
    description: "방어 중심 플레이",
    earlyUnits: ["드론", "선충충"],
    midUnits: ["저글링", "히드라"],
    lateUnits: ["울트라", "럴커", "디파일러"],
  },
};

/**
 * 게임 이벤트 기본 확률 (턴마다)
 * 병력이 100 이상이면 교전 확률이 동적으로 증가함 (getEngagementProbability 참조)
 */
export const EVENT_PROBABILITIES = {
  engagement: 0.22,      // 22% 교전 발생 (기본값, 병력 100+ 시 동적 증가)
  harass: 0.18,          // 18% 견제 발생
  resource_drain: 0.06,  // 6% 자원 드레인
  multi_destroy: 0.10,   // 10% 멀티/앞마당 파괴
  production_hit: 0.10,  // 10% 생산기지 타격
  tech_upgrade: 0.08,    // 8% 기술 업그레이드
};

/**
 * 병력 수에 따른 동적 교전 확률 계산
 * 한쪽이라도 병력 100 이상이면 교전이 더 자주 발생
 * 양쪽 모두 150 이상이면 거의 매 턴 교전
 */
export function getEngagementProbability(player1Supply: number, player2Supply: number): number {
  const maxSupply = Math.max(player1Supply, player2Supply);
  const minSupply = Math.min(player1Supply, player2Supply);
  
  let baseProb = EVENT_PROBABILITIES.engagement; // 0.22
  
  // 한쪽이라도 병력 100 이상: 교전 확률 증가
  if (maxSupply >= 100) {
    // 100~150 구간: 0.22 → 0.40 (선형 증가)
    const bonus1 = Math.min(1.0, (maxSupply - 100) / 50) * 0.18;
    baseProb += bonus1;
  }
  
  // 양쪽 모두 100 이상: 추가 교전 확률
  if (minSupply >= 100) {
    // 양쪽 100 이상이면 추가 +0.10~0.20
    const bonus2 = Math.min(1.0, (minSupply - 100) / 50) * 0.20;
    baseProb += bonus2;
  }
  
  // 병력 150 이상: 대규모 전면전 확률 급증
  if (maxSupply >= 150) {
    baseProb += 0.10;
  }
  
  // 최대 70% (나머지 이벤트도 발생해야 하므로)
  return Math.min(0.70, baseProb);
}

/**
 * 상황 해설 템플릿
 */
export const SITUATION_COMMENTARIES = [
  "경기가 팽팽하게 진행 중입니다.",
  "양 선수 모두 신중하게 플레이하고 있네요.",
  "아직 결정적인 순간이 없습니다.",
  "경기가 균형을 이루고 있습니다.",
  "현재 상황은 팽팽한 상태네요.",
  "양 팀 모두 기회를 노리고 있습니다.",
  "아직 승패가 결정되지 않았습니다.",
];
