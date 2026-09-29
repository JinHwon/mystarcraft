import { StatKey, STAT_KEYS } from "./gameConstants";

// ── 팀 운영 ──────────────────────────────────────────────────────

/** 팀 최대 선수 수 (본인 선수 포함) */
export const MAX_ROSTER = 6;
/** 영입 후보 수 (하루 단위로 바뀜) */
export const SCOUT_LIST_SIZE = 5;
/** 신인 발굴 비용 */
export const ROOKIE_SCOUT_COST = 200;

export const TEAM_EMBLEMS = ["🛡️", "⚔️", "🔥", "⚡", "🐉", "🦅", "🐺", "🌟", "👑", "💎", "🚀", "🌀"];

/** 영입 비용: 능력치가 높을수록 가파르게 비싸짐 (합계 4000 ≈ 450G, 5000 ≈ 1400G, 7000 ≈ 4800G) */
export function calcRecruitPrice(totalStats: number, level: number): number {
  const x = Math.max(0, totalStats - 3600);
  return Math.round((200 + x * 0.5 + x * x * 0.00025 + level * 10) / 10) * 10;
}

// ── 컨디션 ───────────────────────────────────────────────────────

export const CONDITION_MIN = 80;
export const CONDITION_MAX = 120;

export function clampCondition(v: number): number {
  return Math.max(CONDITION_MIN, Math.min(CONDITION_MAX, Math.round(v)));
}

/** 컨디션에 따른 능력치 배율 (80% → 0.9배, 100% → 1배, 120% → 1.1배) */
export function conditionMultiplier(condition: number): number {
  return 1 + (clampCondition(condition) - 100) / 200;
}

export function applyCondition<T extends Record<StatKey, number>>(stats: T, condition: number): T {
  const m = conditionMultiplier(condition);
  const out = { ...stats };
  STAT_KEYS.forEach(key => { out[key] = Math.round(stats[key] * m) as any; });
  return out;
}

/** 컨디션 등급 표시 (마이스타크래프트 스타일 화살표) */
export function conditionLabel(condition: number): { label: string; arrow: string; color: string } {
  if (condition >= 113) return { label: "최상", arrow: "⇈", color: "text-red-400" };
  if (condition >= 105) return { label: "좋음", arrow: "↑", color: "text-orange-400" };
  if (condition >= 96) return { label: "보통", arrow: "→", color: "text-yellow-300" };
  if (condition >= 88) return { label: "나쁨", arrow: "↓", color: "text-sky-400" };
  return { label: "최악", arrow: "⇊", color: "text-blue-500" };
}

// ── 훈련 ─────────────────────────────────────────────────────────

export type TrainingKey =
  | "control" | "macro" | "build" | "harass" | "defense" | "scout" | "attack" | "camp";

export interface TrainingMenu {
  key: TrainingKey;
  name: string;
  emoji: string;
  description: string;
  /** 능력치별 성장 가중치 */
  stats: Partial<Record<StatKey, number>>;
  fatigue: number;
  gold: number;
}

const ALL_STATS = Object.fromEntries(STAT_KEYS.map(k => [k, 0.5])) as Record<StatKey, number>;

export const TRAINING_MENUS: TrainingMenu[] = [
  { key: "control", name: "컨트롤 훈련", emoji: "🎯", description: "마린·뮤탈 컨트롤 반복 연습", stats: { control: 1, attack: 0.4 }, fatigue: 15, gold: 0 },
  { key: "macro", name: "운영 연습", emoji: "🏭", description: "멀티 운영과 물량 뽑기 연습", stats: { supply: 1, strategy: 0.4 }, fatigue: 15, gold: 0 },
  { key: "build", name: "빌드 연구", emoji: "📖", description: "빌드오더와 전략 분석", stats: { strategy: 1, sense: 0.4 }, fatigue: 15, gold: 0 },
  { key: "harass", name: "견제 훈련", emoji: "⚡", description: "드랍·게릴라 견제 연습", stats: { harass: 1, control: 0.4 }, fatigue: 15, gold: 0 },
  { key: "defense", name: "수비 훈련", emoji: "🛡️", description: "러쉬 방어와 심시티 연습", stats: { defense: 1, supply: 0.4 }, fatigue: 15, gold: 0 },
  { key: "scout", name: "정찰 훈련", emoji: "🔭", description: "정찰 타이밍과 상대 빌드 읽기", stats: { scout: 1, sense: 0.4 }, fatigue: 15, gold: 0 },
  { key: "attack", name: "타이밍 공격 훈련", emoji: "⚔️", description: "타이밍 러쉬와 한방 병력 운용", stats: { attack: 1, sense: 0.4 }, fatigue: 15, gold: 0 },
  { key: "camp", name: "특별 합숙", emoji: "🔥", description: "모든 능력치를 골고루 끌어올리는 강도 높은 합숙", stats: ALL_STATS, fatigue: 30, gold: 150 },
];

/** 휴식: 하루 1회, 피로도·컨디션 회복 */
export const REST_FATIGUE = 40;
export const REST_CONDITION = 8;
/** 훈련 1회마다 컨디션 감소 */
export const TRAINING_CONDITION_COST = 2;

/** 능력치가 높을수록 훈련 효율이 떨어짐 (500 → 1배, 900 → 0.5배, 최소 0.15배) */
export function trainingGrowthFactor(stat: number): number {
  return Math.max(0.15, 1 - (stat - 500) / 800);
}
