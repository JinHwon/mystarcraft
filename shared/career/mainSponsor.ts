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

/** 메인 스폰서(모기업) 이름: B팀은 모구단 모기업 */
export function mainSponsorName(s: CareerState, team = s.myTeam): string {
  const t = s.teams[team];
  return MAIN_SPONSORS[t?.div === 2 ? t.parent ?? -1 : team]?.name ?? "모기업";
}

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

/** 지난 시즌 프로리그 성적에 따른 예산 증감 */
const RESULT_BONUS: Record<string, number> = { 우승: 0.3, 준우승: 0.15, 플레이오프: 0.08, 준플레이오프: 0.04, 승격: 0.1, "2부 우승": 0.05, 잔류: -0.2, 강등: -0.45 };

/**
 * 감독 협상력: 감독 평판과 지난 시즌 성적(프로리그·개인리그 우승)에 따라 스폰서가 더 쓰거나 덜 씀
 * 지난 시즌이 아주 나쁘면 (강등·하위권) 크게 깎인다
 */
export function sponsorFactors(s: CareerState): { items: Array<{ label: string; v: number }>; mul: number } {
  const items: Array<{ label: string; v: number }> = [];
  const rep = s.manager?.reputation ?? 50;
  const repV = Math.round(((rep - 50) / 250) * 100) / 100;
  if (repV) items.push({ label: `감독 평판 ${rep}`, v: repV });
  const h = s.history[0];
  if (h) {
    const r = RESULT_BONUS[h.myResult];
    if (r !== undefined) items.push({ label: `${h.season}시즌 프로리그 ${h.myResult}`, v: r });
    else if (h.myResult === "포스트시즌 진출 실패" && h.myRank >= 9) items.push({ label: `${h.season}시즌 프로리그 ${h.myRank}위`, v: -0.15 });
    else if (/^2부 (\d+)위$/.test(h.myResult) && Number(h.myResult.match(/\d+/)![0]) >= 4) items.push({ label: `${h.season}시즌 ${h.myResult}`, v: -0.1 });
    const msl = h.myMsl ?? (h.mslChampion !== undefined && s.players[h.mslChampion]?.team === s.myTeam ? 1 : h.mslRunnerUp !== undefined && s.players[h.mslRunnerUp]?.team === s.myTeam ? 2 : undefined);
    if (msl === 1) items.push({ label: `${h.season}시즌 개인리그 우승 배출`, v: 0.2 });
    if (msl === 2) items.push({ label: `${h.season}시즌 개인리그 준우승 배출`, v: 0.08 });
  }
  const mul = Math.max(0.5, Math.min(1.8, 1 + items.reduce((a, x) => a + x.v, 0)));
  return { items, mul };
}

/** 메인 스폰서 예산 (이 안이면 계약 수락): 모기업 규모 × 감독 레벨 × 감독 협상력 */
export function sponsorBudget(s: CareerState, team = s.myTeam): number {
  // B팀(2부)은 모구단 모기업이 작게 후원
  const t = s.teams[team];
  const size = t?.div === 2 ? (MAIN_SPONSORS[t.parent ?? -1]?.size ?? 1) * 0.5 : MAIN_SPONSORS[team]?.size ?? 1;
  return Math.round(termsValue(DEFAULT_TERMS) * size * levelPerks(managerLevel(s)).sponsor * (team === s.myTeam ? sponsorFactors(s).mul : 1));
}
/** 협상 여유: 예산보다 이만큼까지 높게 불러도 계약 */
export const SPONSOR_STRETCH = 1.15;
/** 이 이하면 거절하지 않고 역제안 */
export const SPONSOR_COUNTER = 1.4;

/** 예산에 맞춘 기본 제안 */
export function defaultOffer(s: CareerState, team = s.myTeam): MainSponsorTerms {
  const k = sponsorBudget(s, team) / termsValue(DEFAULT_TERMS);
  return Object.fromEntries(Object.entries(DEFAULT_TERMS).map(([key, v]) => [key, Math.round((v * k) / 10) * 10])) as unknown as MainSponsorTerms;
}

/**
 * 감독 영입 계약금: 다른 구단이 감독을 데려갈 때 내는 돈 (새 구단 운영 자금에 더해짐)
 * 감독 레벨·명성이 높을수록, 모기업이 클수록 많이 준다
 */
export function jobSigningFee(s: CareerState, team: number): number {
  const t = s.teams[team];
  const size = t?.div === 2 ? 0.5 : MAIN_SPONSORS[team]?.size ?? 1;
  const rep = s.manager?.reputation ?? 50;
  return Math.round(((400 + managerLevel(s) * 150 + rep * 10) * size) / 10) * 10;
}
