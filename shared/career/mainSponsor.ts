/**
 * 메인 스폰서 (팀마다 반드시 있는 모기업 스폰서)와 감독 레벨
 * - 메인 스폰서와 계약으로 승리·패배 수당, 프로리그·개인리그 우승·준우승 수당을 정한다
 * - 스폰서가 쓸 수 있는 예산(기대 지급액)은 모기업 규모 × 감독 레벨로 정해진다
 */
import type { CareerState } from "./rules";

export interface MainSponsorTerms {
  /** 프로리그 경기 승리 수당 */
  win: number;
  /** 프로리그 경기 패배 수당 */
  loss: number;
  proTitle: number;
  proRunnerUp: number;
  mslTitle: number;
  mslRunnerUp: number;
}
export interface MainSponsorContract extends MainSponsorTerms {
  /** 남은 시즌 (이번 시즌 포함) */
  years: number;
  season: number;
  team: number;
}
export const TERM_NAMES: Record<keyof MainSponsorTerms, string> = {
  win: "승리 수당", loss: "패배 수당", proTitle: "프로리그 우승", proRunnerUp: "프로리그 준우승", mslTitle: "개인리그 우승", mslRunnerUp: "개인리그 준우승",
};

/** 팀 번호 → 모기업 이름·규모 */
export const MAIN_SPONSORS: Record<number, { name: string; size: number }> = {
  0: { name: "KT", size: 1.15 }, 1: { name: "삼성전자", size: 1.15 }, 2: { name: "STX", size: 1.0 }, 3: { name: "웅진", size: 0.95 },
  4: { name: "SK텔레콤", size: 1.15 }, 5: { name: "MBC게임", size: 1.0 }, 6: { name: "화승", size: 0.95 }, 7: { name: "CJ", size: 1.1 },
  8: { name: "하이트", size: 1.0 }, 9: { name: "eSTRO", size: 0.9 }, 10: { name: "공군", size: 0.8 }, 11: { name: "위메이드", size: 1.0 },
};

/** 한 시즌 기대치 (지급액 계산용): 22경기 중 승·패 절반, 우승 확률 등 */
const EXPECT: Record<keyof MainSponsorTerms, number> = { win: 11, loss: 11, proTitle: 0.1, proRunnerUp: 0.1, mslTitle: 0.08, mslRunnerUp: 0.08 };

export const DEFAULT_TERMS: MainSponsorTerms = { win: 120, loss: 30, proTitle: 800, proRunnerUp: 400, mslTitle: 500, mslRunnerUp: 250 };

/** 계약의 시즌 기대 지급액 */
export function termsValue(t: MainSponsorTerms): number {
  return Math.round((Object.keys(EXPECT) as Array<keyof MainSponsorTerms>).reduce((sum, k) => sum + (t[k] ?? 0) * EXPECT[k], 0));
}

// ── 감독 레벨 ────────────────────────────────────────────────────
export const managerLevel = (s: CareerState) => s.manager?.level ?? 1;
export const managerExpNeed = (level: number) => 100 + level * 60;
/** 레벨 혜택 배율 */
export const levelPerks = (level: number) => ({
  /** 메인·서브 스폰서 예산 */
  sponsor: 1 + (level - 1) * 0.06,
  /** 선수가 요구하는 연봉 (명장 밑에서 뛰고 싶어함) */
  salary: Math.max(0.75, 1 - (level - 1) * 0.015),
  /** 다른 팀이 요구하는 이적료 */
  fee: Math.max(0.75, 1 - (level - 1) * 0.02),
  /** 무소속 영입 금액 */
  scout: Math.max(0.8, 1 - (level - 1) * 0.015),
});

/** 메인 스폰서 예산 (이 안이면 계약 수락) */
export function sponsorBudget(s: CareerState, team = s.myTeam): number {
  const size = MAIN_SPONSORS[team]?.size ?? 1;
  return Math.round(termsValue(DEFAULT_TERMS) * size * levelPerks(managerLevel(s)).sponsor);
}

/** 예산에 맞춘 기본 제안 */
export function defaultOffer(s: CareerState, team = s.myTeam): MainSponsorTerms {
  const k = sponsorBudget(s, team) / termsValue(DEFAULT_TERMS);
  return Object.fromEntries(Object.entries(DEFAULT_TERMS).map(([key, v]) => [key, Math.round((v * k) / 10) * 10])) as unknown as MainSponsorTerms;
}
