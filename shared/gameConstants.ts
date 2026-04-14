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

// 레벨업 경험치 계산 (레벨 * 100)
export function calcExpToNext(level: number): number {
  return level * 100;
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
