/**
 * 스타크래프트 빌드 오더 및 유닛 데이터베이스
 * 실제 프로 경기에서 사용되는 빌드와 유닛 조합
 */

export type Race = "terran" | "zerg" | "protoss";
export type Unit = string;

export interface BuildOrder {
  name: string;
  race: Race;
  vsRace: Race;
  description: string;
  earlyUnits: Unit[];
  midUnits: Unit[];
  lateUnits: Unit[];
  techPath: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface UnitStats {
  name: string;
  race: Race;
  cost: number;
  buildTime: number;
  supply: number;
  attack: number;
  defense: number;
  speed: number;
  counters: string[]; // 이 유닛을 카운터하는 유닛들
  countersTo: string[]; // 이 유닛이 카운터하는 유닛들
}

/**
 * 테란 vs 프로토스 빌드
 */
export const terranVsProtossBuild: BuildOrder[] = [
  {
    name: "8배럭 마린",
    race: "terran",
    vsRace: "protoss",
    description: "초반 공격 빌드. 8개 배럭에서 마린을 뽑아 초반 러쉬",
    earlyUnits: ["마린", "마린", "마린", "마린"],
    midUnits: ["마린", "메딕", "골리앗"],
    lateUnits: ["골리앗", "배틀크루저"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "beginner",
  },
  {
    name: "터렛 방어",
    race: "terran",
    vsRace: "protoss",
    description: "터렛으로 초반 방어 후 경제 확보",
    earlyUnits: ["터렛", "터렛"],
    midUnits: ["마린", "메딕", "골리앗"],
    lateUnits: ["골리앗", "배틀크루저", "야마토"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "intermediate",
  },
  {
    name: "팩토리 빌드",
    race: "terran",
    vsRace: "protoss",
    description: "팩토리에서 골리앗과 탱크 생산",
    earlyUnits: ["마린", "골리앗"],
    midUnits: ["골리앗", "시즈탱크"],
    lateUnits: ["배틀크루저", "야마토"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "intermediate",
  },
];

/**
 * 테란 vs 저그 빌드
 */
export const terranVsZergBuild: BuildOrder[] = [
  {
    name: "초반 마린",
    race: "terran",
    vsRace: "zerg",
    description: "초반 마린으로 저그 드론 압박",
    earlyUnits: ["마린", "마린", "마린"],
    midUnits: ["마린", "메딕", "골리앗"],
    lateUnits: ["골리앗", "배틀크루저"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "beginner",
  },
  {
    name: "시즈 모드",
    race: "terran",
    vsRace: "zerg",
    description: "시즈탱크로 저그 저글링 방어",
    earlyUnits: ["마린", "시즈탱크"],
    midUnits: ["시즈탱크", "골리앗"],
    lateUnits: ["배틀크루저", "야마토"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "intermediate",
  },
];

/**
 * 프로토스 vs 테란 빌드
 */
export const protossVsTerranBuild: BuildOrder[] = [
  {
    name: "세빠닥 (3프로브 다크템플러)",
    race: "protoss",
    vsRace: "terran",
    description: "초반 다크템플러로 테란 일꾼 처치",
    earlyUnits: ["다크템플러", "다크템플러"],
    midUnits: ["질럿", "다크템플러", "고스트"],
    lateUnits: ["리버", "하이템플러", "아칸"],
    techPath: ["게이트웨이", "사이버네틱스", "다크쉬라인"],
    difficulty: "beginner",
  },
  {
    name: "질럿 러쉬",
    race: "protoss",
    vsRace: "terran",
    description: "초반 질럿으로 빠른 공격",
    earlyUnits: ["질럿", "질럿", "질럿"],
    midUnits: ["질럿", "드라군"],
    lateUnits: ["리버", "하이템플러", "케리어"],
    techPath: ["게이트웨이", "사이버네틱스", "로보틱스"],
    difficulty: "beginner",
  },
  {
    name: "고급 유닛 조합",
    race: "protoss",
    vsRace: "terran",
    description: "리버, 하이템플러, 아칸 조합",
    earlyUnits: ["질럿", "드라군"],
    midUnits: ["리버", "하이템플러"],
    lateUnits: ["아칸", "케리어", "리버"],
    techPath: ["게이트웨이", "로보틱스", "스타게이트"],
    difficulty: "advanced",
  },
];

/**
 * 프로토스 vs 저그 빌드
 */
export const protossVsZergBuild: BuildOrder[] = [
  {
    name: "질럿 러쉬",
    race: "protoss",
    vsRace: "zerg",
    description: "초반 질럿으로 저그 드론 압박",
    earlyUnits: ["질럿", "질럿"],
    midUnits: ["질럿", "드라군"],
    lateUnits: ["리버", "하이템플러"],
    techPath: ["게이트웨이", "사이버네틱스"],
    difficulty: "beginner",
  },
];

/**
 * 저그 vs 테란 빌드
 */
export const zergVsTerranBuild: BuildOrder[] = [
  {
    name: "4드론 (초반 공격)",
    race: "zerg",
    vsRace: "terran",
    description: "4개 드론으로 초반 공격",
    earlyUnits: ["드론", "드론", "드론", "드론"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["뮤탈리스크", "울트라리스크"],
    techPath: ["스포닝풀", "에어", "그레이터스파이어"],
    difficulty: "beginner",
  },
  {
    name: "5드론",
    race: "zerg",
    vsRace: "terran",
    description: "5개 드론으로 초반 공격",
    earlyUnits: ["드론", "드론", "드론", "드론", "드론"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["뮤탈리스크", "울트라리스크"],
    techPath: ["스포닝풀", "에어", "그레이터스파이어"],
    difficulty: "beginner",
  },
  {
    name: "저글링 러쉬",
    race: "zerg",
    vsRace: "terran",
    description: "저글링으로 빠른 공격",
    earlyUnits: ["저글링", "저글링"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["뮤탈리스크", "울트라리스크"],
    techPath: ["스포닝풀", "에어"],
    difficulty: "intermediate",
  },
];

/**
 * 저그 vs 프로토스 빌드
 */
export const zergVsProtossBuild: BuildOrder[] = [
  {
    name: "저글링 러쉬",
    race: "zerg",
    vsRace: "protoss",
    description: "저글링으로 프로토스 초반 압박",
    earlyUnits: ["저글링", "저글링"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["뮤탈리스크", "울트라리스크"],
    techPath: ["스포닝풀", "에어"],
    difficulty: "beginner",
  },
];

/**
 * 유닛 상세 정보
 */
export const unitStats: Record<string, UnitStats> = {
  // 테란 유닛
  마린: {
    name: "마린",
    race: "terran",
    cost: 50,
    buildTime: 24,
    supply: 1,
    attack: 6,
    defense: 0,
    speed: 3,
    counters: ["저글링", "질럿", "드라군"],
    countersTo: ["드론", "드라군"],
  },
  메딕: {
    name: "메딕",
    race: "terran",
    cost: 50,
    buildTime: 30,
    supply: 1,
    attack: 0,
    defense: 0,
    speed: 3,
    counters: [],
    countersTo: [],
  },
  골리앗: {
    name: "골리앗",
    race: "terran",
    cost: 100,
    buildTime: 56,
    supply: 2,
    attack: 12,
    defense: 1,
    speed: 2,
    counters: ["뮤탈리스크", "케리어"],
    countersTo: ["케리어", "뮤탈리스크"],
  },
  시즈탱크: {
    name: "시즈탱크",
    race: "terran",
    cost: 150,
    buildTime: 60,
    supply: 2,
    attack: 30,
    defense: 1,
    speed: 1,
    counters: ["뮤탈리스크", "드라군"],
    countersTo: ["저글링", "울트라리스크"],
  },
  배틀크루저: {
    name: "배틀크루저",
    race: "terran",
    cost: 400,
    buildTime: 120,
    supply: 6,
    attack: 25,
    defense: 3,
    speed: 2,
    counters: [],
    countersTo: ["모든 유닛"],
  },
  터렛: {
    name: "터렛",
    race: "terran",
    cost: 100,
    buildTime: 40,
    supply: 0,
    attack: 20,
    defense: 2,
    speed: 0,
    counters: [],
    countersTo: ["공중유닛"],
  },

  // 프로토스 유닛
  질럿: {
    name: "질럿",
    race: "protoss",
    cost: 100,
    buildTime: 38,
    supply: 2,
    attack: 16,
    defense: 1,
    speed: 2,
    counters: ["마린", "저글링"],
    countersTo: ["마린", "드론"],
  },
  드라군: {
    name: "드라군",
    race: "protoss",
    cost: 125,
    buildTime: 50,
    supply: 2,
    attack: 20,
    defense: 1,
    speed: 2,
    counters: ["마린", "저글링"],
    countersTo: ["마린", "저글링"],
  },
  리버: {
    name: "리버",
    race: "protoss",
    cost: 300,
    buildTime: 80,
    supply: 4,
    attack: 35,
    defense: 2,
    speed: 1,
    counters: [],
    countersTo: ["모든 유닛"],
  },
  하이템플러: {
    name: "하이템플러",
    race: "protoss",
    cost: 50,
    buildTime: 50,
    supply: 2,
    attack: 0,
    defense: 0,
    speed: 2,
    counters: [],
    countersTo: ["마린", "저글링"],
  },
  다크템플러: {
    name: "다크템플러",
    race: "protoss",
    cost: 125,
    buildTime: 50,
    supply: 2,
    attack: 20,
    defense: 1,
    speed: 2,
    counters: ["디텍터"],
    countersTo: ["드론", "마린"],
  },
  아칸: {
    name: "아칸",
    race: "protoss",
    cost: 300,
    buildTime: 100,
    supply: 4,
    attack: 40,
    defense: 2,
    speed: 2,
    counters: [],
    countersTo: ["모든 유닛"],
  },
  케리어: {
    name: "케리어",
    race: "protoss",
    cost: 350,
    buildTime: 120,
    supply: 6,
    attack: 30,
    defense: 2,
    speed: 2,
    counters: ["골리앗", "스카우지"],
    countersTo: ["공중유닛"],
  },

  // 저그 유닛
  드론: {
    name: "드론",
    race: "zerg",
    cost: 50,
    buildTime: 12,
    supply: 1,
    attack: 5,
    defense: 0,
    speed: 2,
    counters: ["마린", "질럿"],
    countersTo: [],
  },
  저글링: {
    name: "저글링",
    race: "zerg",
    cost: 50,
    buildTime: 12,
    supply: 1,
    attack: 5,
    defense: 0,
    speed: 3,
    counters: ["마린", "질럿"],
    countersTo: ["마린", "질럿"],
  },
  뮤탈리스크: {
    name: "뮤탈리스크",
    race: "zerg",
    cost: 100,
    buildTime: 40,
    supply: 2,
    attack: 12,
    defense: 1,
    speed: 3,
    counters: ["골리앗", "터렛"],
    countersTo: ["골리앗", "배틀크루저"],
  },
  울트라리스크: {
    name: "울트라리스크",
    race: "zerg",
    cost: 200,
    buildTime: 60,
    supply: 4,
    attack: 20,
    defense: 1,
    speed: 2,
    counters: ["시즈탱크", "리버"],
    countersTo: ["마린", "질럿"],
  },
};

/**
 * 빌드 오더 선택
 */
export function selectBuildOrder(
  playerRace: Race,
  opponentRace: Race,
  difficulty: "beginner" | "intermediate" | "advanced"
): BuildOrder {
  let builds: BuildOrder[] = [];

  if (playerRace === "terran" && opponentRace === "protoss") {
    builds = terranVsProtossBuild;
  } else if (playerRace === "terran" && opponentRace === "zerg") {
    builds = terranVsZergBuild;
  } else if (playerRace === "protoss" && opponentRace === "terran") {
    builds = protossVsTerranBuild;
  } else if (playerRace === "protoss" && opponentRace === "zerg") {
    builds = protossVsZergBuild;
  } else if (playerRace === "zerg" && opponentRace === "terran") {
    builds = zergVsTerranBuild;
  } else if (playerRace === "zerg" && opponentRace === "protoss") {
    builds = zergVsProtossBuild;
  }

  // 난이도에 맞는 빌드 필터링
  const filteredBuilds = builds.filter(b => b.difficulty <= difficulty);
  return filteredBuilds[Math.floor(Math.random() * filteredBuilds.length)] || builds[0];
}

/**
 * 유닛 상성 확인
 */
export function getUnitCounters(unit: string): string[] {
  return unitStats[unit]?.counters || [];
}

export function getUnitCountersTo(unit: string): string[] {
  return unitStats[unit]?.countersTo || [];
}

/**
 * 유닛 추천
 */
export function recommendUnit(
  opponentUnits: string[],
  availableResources: number,
  playerRace: Race
): string | null {
  // 상대 유닛을 카운터하는 유닛 찾기
  const allUnits = Object.values(unitStats).filter(u => u.race === playerRace);
  
  for (const opponentUnit of opponentUnits) {
    const counters = getUnitCounters(opponentUnit);
    for (const counter of counters) {
      const unit = unitStats[counter];
      if (unit && unit.race === playerRace && unit.cost <= availableResources) {
        return counter;
      }
    }
  }

  // 기본 유닛 추천
  if (playerRace === "terran") return "마린";
  if (playerRace === "protoss") return "질럿";
  if (playerRace === "zerg") return "저글링";
  
  return null;
}
