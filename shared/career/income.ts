/**
 * 구단 수입원 계산 (서버 지급·화면 안내 공용)
 * - 관중 수입: 홈 경기마다 (팬 인기가 높을수록, 포스트시즌·승강전 2배·결승 3배)
 * - 굿즈 판매: 매주 (선수 인기)
 * - 중계권 분배금: 시즌 시작 때 리그가 나눠 줌
 * - 정규시즌 순위 상금: 정규시즌이 끝나면
 */
import type { CareerState, CMatch } from "./rules";
import { popularity } from "./contract";
import { divOf, rosterOf } from "./view";

const r10 = (v: number) => Math.round(v / 10) * 10;

/** 팬 인기 (0~100): 인기 많은 선수 3명 평균 */
export function fanPower(s: CareerState, team: number): number {
  const top = rosterOf(s, team).map(popularity).sort((a, b) => b - a).slice(0, 3);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
}

/** 홈 경기 관중 수입: 1부 50 + 인기 × 0.8, 2부 20 + 인기 × 0.4 */
export function gateAmount(s: CareerState, team: number, stage: CMatch["stage"] = "regular"): number {
  const fans = fanPower(s, team);
  const base = divOf(s, team) === 2 ? 20 + fans * 0.4 : 50 + fans * 0.8;
  return r10(base * (stage === "final" ? 3 : stage === "regular" ? 1 : 2));
}

/** 주간 굿즈 판매: 1부 20 + 인기 × 0.6, 2부 10 + 인기 × 0.3 */
export function goodsAmount(s: CareerState, team: number): number {
  const fans = fanPower(s, team);
  return r10(divOf(s, team) === 2 ? 10 + fans * 0.3 : 20 + fans * 0.6);
}

/** 중계권 분배금 (시즌 시작) */
export const BROADCAST_RIGHTS = { 1: 500, 2: 150 } as const;

/** 정규시즌 순위 상금 */
export const RANK_PRIZE = {
  1: [500, 350, 250, 200, 120, 120, 80, 80, 50, 50, 0, 0],
  2: [250, 150, 100, 80, 50, 50, 30, 30, 0, 0, 0, 0],
} as const;
