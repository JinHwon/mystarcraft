// 능력치 항목 정의
export const STAT_KEYS = [
  "sense",
  "control",
  "attack",
  "harass",
  "strategy",
  "supply",
  "defense",
  "scout",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  sense: "센스",
  control: "컨트롤",
  attack: "공격력",
  harass: "견제",
  strategy: "전략",
  supply: "물량",
  defense: "수비력",
  scout: "정찰",
};

export const STAT_DEFAULT = 500;
export const STAT_MAX = 1200;
export const STAT_POINT_PER_LEVEL = 20;

// 게임 상수 - v11.0
export const GAME_MAX_TROOPS = 200;
export const GAME_MAX_RESOURCES = 20000;
export const GAME_INITIAL_TROOPS = 50;
export const GAME_INITIAL_RESOURCES = 50;

// 빌드별 증가률
export const BUILD_RESOURCE_RATES: Record<string, number> = {
  cc_first: 150,
  barracks_first: 100,
  gateway_first: 100,
  hatch_first: 100,
};

export const BUILD_TROOP_RATES: Record<string, number> = {
  cc_first: 0.8,
  barracks_first: 1.2,
  gateway_first: 1.0,
  hatch_first: 1.0,
};

// 등급 시스템
// 기본 합산 4000 = F, 이후 600점마다 승급
export const GRADES = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_BASE = 4000;
export const GRADE_STEP = 600;

export function calcGrade(totalStats: number): Grade {
  const idx = Math.min(
    Math.floor((totalStats - GRADE_BASE) / GRADE_STEP),
    GRADES.length - 1
  );
  return GRADES[Math.max(0, idx)];
}

export function calcGradeIndex(totalStats: number): number {
  return Math.min(
    Math.max(0, Math.floor((totalStats - GRADE_BASE) / GRADE_STEP)),
    GRADES.length - 1
  );
}

export function calcTotalStats(stats: Record<StatKey, number>): number {
  return STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

// 레벨업 경험치 계산 (레벨이 높을수록 더 많은 경험치 필요)
// 레벨 1~10: level * 100
// 레벨 11~20: level * 150
// 레벨 21~30: level * 200
// 레벨 31~40: level * 300
// 레벨 41~50: level * 400
export const LEVEL_MAX = 50;

export function calcExpToNext(level: number): number {
  if (level >= LEVEL_MAX) return Infinity; // 최대 레벨
  if (level <= 10) return level * 100;
  if (level <= 20) return level * 150;
  if (level <= 30) return level * 200;
  if (level <= 40) return level * 300;
  return level * 400;
}

// 종족 정보
export const RACE_LABELS: Record<string, string> = {
  terran: "테란",
  zerg: "저그",
  protoss: "프로토스",
};

export const RACE_COLORS: Record<string, string> = {
  terran: "#4A9EFF",
  zerg: "#9B59B6",
  protoss: "#F1C40F",
};

// 등급별 색상
export const GRADE_COLORS: Record<Grade, string> = {
  F: "#9CA3AF",
  E: "#6EE7B7",
  D: "#60A5FA",
  C: "#A78BFA",
  B: "#F472B6",
  A: "#FBBF24",
  S: "#F97316",
  SS: "#EF4444",
  SSS: "#EC4899",
};

// 아이템 희귀도 색상
export const RARITY_COLORS: Record<string, string> = {
  common: "#9CA3AF",
  rare: "#60A5FA",
  epic: "#A78BFA",
  legendary: "#FBBF24",
};

export const RARITY_LABELS: Record<string, string> = {
  common: "일반",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

// 피로도 시스템
export const FATIGUE_MAX = 100;
export const FATIGUE_NORMAL_THRESHOLD = 90; // 90 이상은 정상

/**
 * 피로도에 따른 능력치 패널티 계산
 * 90~100: 0% (정상)
 * 80~89: 5% 차감
 * 70~79: 10% 차감
 * 60~69: 15% 차감
 * 50~59: 20% 차감
 * 40~49: 25% 차감
 * 30~39: 30% 차감
 * 20~29: 35% 차감
 * 10~19: 40% 차감
 * 0~9: 50% 차감
 */
export function calcFatigueStatPenalty(fatigue: number): number {
  if (fatigue >= 90) return 0;
  if (fatigue >= 80) return 0.05;
  if (fatigue >= 70) return 0.1;
  if (fatigue >= 60) return 0.15;
  if (fatigue >= 50) return 0.2;
  if (fatigue >= 40) return 0.25;
  if (fatigue >= 30) return 0.3;
  if (fatigue >= 20) return 0.35;
  if (fatigue >= 10) return 0.4;
  return 0.5;
}

/**
 * 피로도에 따른 실제 능력치 계산
 */
export function calcEffectiveStatWithFatigue(
  baseStat: number,
  fatigue: number
): number {
  const penalty = calcFatigueStatPenalty(fatigue);
  return Math.floor(baseStat * (1 - penalty));
}

/**
 * 피로도에 따른 총 능력치 패널티 계산 (모든 능력치에 적용)
 */
export function calcEffectiveStatsWithFatigue(
  stats: Record<StatKey, number>,
  fatigue: number
): Record<StatKey, number> {
  const penalty = calcFatigueStatPenalty(fatigue);
  const result: Record<StatKey, number> = {} as Record<StatKey, number>;
  STAT_KEYS.forEach((key) => {
    result[key] = Math.floor(stats[key] * (1 - penalty));
  });
  return result;
}

/**
 * 매일 자정에 피로도 회복 여부 확인
 */
export function shouldRecoverFatigue(lastRecoveryTime: Date): boolean {
  const now = new Date();
  const lastRecovery = new Date(lastRecoveryTime);

  // 같은 날짜인지 확인 (자정 기준)
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDate = new Date(
    lastRecovery.getFullYear(),
    lastRecovery.getMonth(),
    lastRecovery.getDate()
  );

  return nowDate.getTime() > lastDate.getTime();
}


// ──────────────────────────────────────────────────────────────────────────────
// 맵 데이터
// ──────────────────────────────────────────────────────────────────────────────

export const MAPS = [
  {
    id: 1,
    name: "네오일드트릭셋",
    description: "균형잡힌 맵",
    raceAdvantage: { terran: 50, zerg: 50, protoss: 50 },
    rushDistance: 50,
    resources: 50,
    complexity: 50,
    iconEmoji: "🗺️",
  },
  {
    id: 2,
    name: "스카이 테라스",
    description: "높이 차이가 많은 맵",
    raceAdvantage: { terran: 55, zerg: 45, protoss: 50 },
    rushDistance: 60,
    resources: 45,
    complexity: 65,
    iconEmoji: "⛰️",
  },
  {
    id: 3,
    name: "용암 분화구",
    description: "자원이 풍부한 맵",
    raceAdvantage: { terran: 48, zerg: 52, protoss: 50 },
    rushDistance: 40,
    resources: 70,
    complexity: 45,
    iconEmoji: "🌋",
  },
  {
    id: 4,
    name: "얼음 계곡",
    description: "좁은 통로, 빠른 러쉬",
    raceAdvantage: { terran: 45, zerg: 55, protoss: 50 },
    rushDistance: 30,
    resources: 40,
    complexity: 60,
    iconEmoji: "❄️",
  },
];

// 난이도별 상대 등급 범위 (상대방의 등급 기준)
export const DIFFICULTY_RANGES = {
  beginner: { minGrade: "F", maxGrade: "D", minIndex: 0, maxIndex: 2 },
  intermediate: { minGrade: "D", maxGrade: "B", minIndex: 2, maxIndex: 4 },
  advanced: { minGrade: "B", maxGrade: "SSS", minIndex: 4, maxIndex: 8 },
};

// 게임 보상 (난이도별)
export const GAME_REWARDS = {
  beginner: { expWin: 50, expLose: 20, goldWin: 100, goldLose: 30 },
  intermediate: { expWin: 100, expLose: 50, goldWin: 200, goldLose: 80 },
  advanced: { expWin: 200, expLose: 100, goldWin: 400, goldLose: 150 },
};

// 피로도 사용 (난이도별)
export const FATIGUE_COST = {
  beginner: 3,
  intermediate: 5,
  advanced: 5,
};

// 연습게임 최소 피로도 (이 값 이하면 게임 불가)
export const FATIGUE_MIN_TO_PLAY = 10;
