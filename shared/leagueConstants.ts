// ── 프로리그 (팀 리그) ───────────────────────────────────────────

/** 리그 참가 팀 수 (내 팀 + AI 팀) */
export const PRO_TEAMS = 8;
/** 정규 시즌 라운드 수 (풀 리그 1회전) */
export const PRO_ROUNDS = PRO_TEAMS - 1;
/** 한 경기 세트 수 (먼저 3세트 이기면 승리, 5세트는 에이스 결정전) */
export const PRO_SETS = 5;
export const PRO_WIN_SETS = 3;
/** 세트 출전 시 피로도 소모 */
export const PRO_SET_FATIGUE = 8;
/** 출전에 필요한 최소 피로도 */
export const MIN_FATIGUE_TO_PLAY = 15;
/** 경기 보상 (팀 운영 자금) */
export const PRO_MATCH_GOLD = { win: 150, lose: 50 };
/** 세트 출전 경험치 */
export const SET_EXP = { win: 60, lose: 25 };
/** 시즌 최종 순위 상금 (1위부터) */
export const PRO_SEASON_REWARD = [2000, 1200, 800, 500, 300, 200, 150, 100];

// ── 개인리그 (토너먼트) ─────────────────────────────────────────

export const INDIVIDUAL_SIZE = 16;
/** 라운드별 이름과 다전제 (결승은 5전 3선승) */
export const INDIVIDUAL_ROUNDS = [
  { name: "16강", bestOf: 3 },
  { name: "8강", bestOf: 3 },
  { name: "4강", bestOf: 3 },
  { name: "결승", bestOf: 5 },
];
export const INDIVIDUAL_SET_FATIGUE = 5;
/** 최종 성적별 상금 */
export const INDIVIDUAL_REWARD: Record<string, number> = {
  "우승": 2500,
  "준우승": 1200,
  "4강": 600,
  "8강": 300,
  "16강": 100,
};

// ── AI 프로팀 ──────────────────────────────────────────────────

/** 가상의 AI 프로팀 (평균 능력치 합계가 서로 달라 리그마다 수준에 맞는 팀들이 편성됨) */
export const AI_TEAMS = [
  { name: "그린 바이퍼스", emblem: "🐍", avg: 3700 },
  { name: "실버 울브즈", emblem: "🐺", avg: 3950 },
  { name: "퍼플 레이븐즈", emblem: "🐦", avg: 4200 },
  { name: "블루 드래곤즈", emblem: "🐉", avg: 4450 },
  { name: "썬더 볼츠", emblem: "⚡", avg: 4700 },
  { name: "레드 피닉스", emblem: "🔥", avg: 4950 },
  { name: "나이트 호크스", emblem: "🦅", avg: 5250 },
  { name: "아이언 타이탄즈", emblem: "🛡️", avg: 5550 },
  { name: "스톰 워리어스", emblem: "🌀", avg: 5850 },
  { name: "골든 이글스", emblem: "👑", avg: 6150 },
  { name: "블레이즈 게이밍", emblem: "🚀", avg: 6450 },
  { name: "블랙 코브라즈", emblem: "💎", avg: 6800 },
];
export const AI_TEAM_ROSTER = 6;
