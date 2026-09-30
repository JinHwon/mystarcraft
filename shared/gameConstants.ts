// 능력치 항목 정의 (커리어 모드와 경기 엔진 공용)
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

/**
 * 피로도에 따른 능력치 패널티 (피로도 100 = 최상)
 * 90~100: 0%, 이후 10 단위로 5%씩 늘어나고 0~9 는 50%
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

/** 피로도 패널티를 모든 능력치에 적용 */
export function calcEffectiveStatsWithFatigue(
  stats: Record<StatKey, number>,
  fatigue: number
): Record<StatKey, number> {
  const penalty = calcFatigueStatPenalty(fatigue);
  const result = {} as Record<StatKey, number>;
  STAT_KEYS.forEach((key) => {
    result[key] = Math.floor(stats[key] * (1 - penalty));
  });
  return result;
}
