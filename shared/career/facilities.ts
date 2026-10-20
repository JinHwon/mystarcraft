/**
 * 구단 시설 투자 (돈 쓸 곳): 시설마다 1~5단계, 올릴 때 큰돈이 들고 매주 유지비가 듦
 * 효과는 작고 꾸준해서, 돈이 남는 구단이 장기적으로 조금씩 앞서가는 용도 (자금·유지비는 시즌이 지날수록 물가가 반영됨)
 */
import { costInflation, priceInflation, type CareerState } from "./rules";

export type FacilityKey = "train" | "dorm" | "lab" | "fan";
export const FACILITY_KEYS: FacilityKey[] = ["train", "dorm", "lab", "fan"];
export const FACILITY_MAX = 5;
/** 단계를 올리는 비용 (만원, 1→5단계). 시즌 물가가 곱해짐 */
export const FACILITY_COST = [800, 1600, 3000, 5500, 9000];
/** 한 단계당 주간 유지비 (만원) */
export const FACILITY_UPKEEP = 6;

export interface FacilityDef { key: FacilityKey; name: string; emoji: string; desc: string; perLevel: string }
export const FACILITIES: Record<FacilityKey, FacilityDef> = {
  train: { key: "train", name: "훈련장", emoji: "🏋️", desc: "훈련으로 오르는 능력치가 늘어납니다", perLevel: "훈련 상승 +5%" },
  dorm: { key: "dorm", name: "선수 숙소", emoji: "🛏️", desc: "매주 모든 선수의 컨디션이 더 회복됩니다", perLevel: "주간 컨디션 회복 +1%p" },
  lab: { key: "lab", name: "전력 분석실", emoji: "📊", desc: "무소속 영입비와 다른 구단 선수 이적료가 줄어듭니다", perLevel: "영입비 -2% · 이적료 -1%" },
  fan: { key: "fan", name: "팬 서비스", emoji: "📣", desc: "홈 경기 관중 수입과 굿즈 판매가 늘어납니다", perLevel: "관중·굿즈 수입 +6%" },
};

export const facilityLevel = (s: Pick<CareerState, "facilities">, k: FacilityKey) => Math.max(0, Math.min(FACILITY_MAX, s.facilities?.[k] ?? 0));

/** 다음 단계 비용 (최고 단계면 null) */
export function upgradeCost(s: CareerState, k: FacilityKey): number | null {
  const lv = facilityLevel(s, k);
  if (lv >= FACILITY_MAX) return null;
  return Math.round((FACILITY_COST[lv] * priceInflation(s.season)) / 10) * 10;
}
/** 한 주 유지비 (모든 시설 단계 합 × 6만원, 운영비 물가 반영) */
export function upkeepWeekly(s: CareerState): number {
  const levels = FACILITY_KEYS.reduce((n, k) => n + facilityLevel(s, k), 0);
  return Math.round(levels * FACILITY_UPKEEP * costInflation(s.season));
}

/** 훈련 상승 배율 */
export const trainMul = (s: CareerState) => 1 + 0.05 * facilityLevel(s, "train");
/** 주간 컨디션 회복 추가량 (%p) */
export const dormBonus = (s: CareerState) => facilityLevel(s, "dorm");
/** 무소속 영입비 배율 / 다른 구단 선수 이적료 배율 */
export const labScoutMul = (s: CareerState) => 1 - 0.02 * facilityLevel(s, "lab");
export const labFeeMul = (s: CareerState) => 1 - 0.01 * facilityLevel(s, "lab");
/** 관중·굿즈 수입 배율 */
export const fanMul = (s: CareerState) => 1 + 0.06 * facilityLevel(s, "fan");
