/**
 * 커리어 모드(원작 방식) 규칙과 상태 타입
 * 한 유저 = 한 세이브. 세계(선수 230명·12팀·시즌 일정)가 통째로 세이브에 들어간다.
 */
import type { StatKey } from "../gameConstants";

export type Race = "terran" | "zerg" | "protoss";

/** 원작 능력치 저장 순서 (컨트롤, 공격력, 견제, 전략, 물량, 수비력, 정찰, 센스) */
export const ORIG_STAT_ORDER: StatKey[] = ["control", "attack", "harass", "strategy", "supply", "defense", "scout", "sense"];

export const STAT_MIN = 1;
export const STAT_MAX_CAREER = 1000;

// ── 시즌 ────────────────────────────────────────────────────────
export const BASE_YEAR = 2010;
/** 한 경기 세트 수 / 승리 세트 (5세트 = 에이스 결정전) */
export const PRO_SETS = 5;
export const PRO_WIN = 3;
/** 결승은 7전 4선승 */
export const FINAL_SETS = 7;
export const FINAL_WIN = 4;
/** 선수단 최대 인원 (원작 팀 레코드 칸 수) */
export const MAX_ROSTER = 19;
/** 엔트리를 짜려면 최소 인원 (1~4세트는 서로 다른 선수) */
export const MIN_ROSTER = 4;

// ── 돈 (만원) ────────────────────────────────────────────────────
/** 주당 구단 운영비 */
export const OPERATING_COST = 60;
/** 연봉을 나눠 내는 주 수 (정규시즌) */
export const WAGE_WEEKS = 11;
/** 적자가 이만큼 연속되면 구단 해체 */
export const DEBT_LIMIT_WEEKS = 3;
export const START_MONEY = 3000;
export const WEEKLY_SPONSOR = 100;
export const MATCH_MONEY = { win: 120, lose: 30 };
export const POSTSEASON_PRIZE: Record<string, number> = { 우승: 1500, 준우승: 800, 플레이오프: 400, 준플레이오프: 250 };

// ── 컨디션 (원작: 작은 정수 단계, 의욕/짜증) ─────────────────────────
/** 컨디션은 원작처럼 % (1 단위로 움직임) */
export const COND_MIN = 1;
export const COND_MAX = 100;
export const COND_LABELS = ["", "최악", "짜증", "나쁨", "저조", "보통", "양호", "좋음", "의욕", "최상", "절정"];
/** 한 주가 끝날 때 모든 선수 컨디션 회복량 (%) */
export const WEEKLY_COND_RECOVERY = 10;
export const condLabel = (cond: number) => COND_LABELS[Math.max(1, Math.min(10, Math.ceil(cond / 10)))];
/** 컨디션에 따른 경기력 배율: 100% 가 원래 능력치, 낮을수록 줄어듦 (50% → 0.9, 1% → 0.8) */
export function condMultiplier(cond: number): number {
  return 1 - (COND_MAX - Math.max(COND_MIN, Math.min(COND_MAX, cond))) * 0.002;
}

/** 이번 주 포텐셜 폭발 배율 (없으면 undefined) */
export function burstOf(s: { season: number; week: number }, p: CPlayer): number | undefined {
  return p.burst && p.burst.week === `${s.season}-${s.week}` ? p.burst.mul : undefined;
}

/** 포텐셜 폭발 확률 (주마다, 컨디션이 좋을수록 잘 터짐) — 터지면 그 주 경기 능력치 110~120% */
export function burstChance(cond: number): number {
  return cond >= 90 ? 0.08 : cond >= 70 ? 0.05 : cond >= 50 ? 0.03 : 0.01;
}

// ── 선수 행동 (행동력) ──────────────────────────────────────────────
export type ActionKey = "train" | "rest" | "event";
export interface ActionDef { key: ActionKey; name: string; emoji: string; ap: number; money: number; desc: string }
export const ACTIONS: ActionDef[] = [
  { key: "train", name: "훈련", emoji: "🏋️", ap: 20, money: 0, desc: "연습을 열심히 합니다. 능력치가 오르지만 지칩니다. (컨디션 -3~5)" },
  { key: "rest", name: "휴식", emoji: "😴", ap: 10, money: 0, desc: "휴식을 취합니다. 쉬면서 컨디션을 회복합니다. (컨디션 +5)" },
  { key: "event", name: "이벤트", emoji: "🎤", ap: 20, money: 0, desc: "팬미팅을 합니다. 구단 자금을 벌고, 인기가 많을수록 치어풀을 받을 확률이 높습니다. (컨디션 -3~5)" },
];
/** 선수별 주당 행동력 (선수마다 매주 받고, 쓰지 않으면 시즌 동안 계속 쌓임. 새 시즌에 다시 시작) */
export const WEEKLY_AP = 20;
export const actionOf = (key: string | null | undefined) => ACTIONS.find(a => a.key === key);

// ── 세이브 상태 ─────────────────────────────────────────────────
export interface CPlayer {
  id: number;
  name: string;
  race: Race;
  team: number;
  stats: Record<StatKey, number>;
  level: number;
  exp: number;
  cond: number;
  birth: number;
  gender: "M" | "F";
  /** 통산 전적 */
  wins: number;
  losses: number;
  /** 이번 시즌 전적 */
  sWins: number;
  sLosses: number;
  /** 이번 주 행동 (내 팀 선수만) */
  action?: ActionKey | null;
  /** 선수 행동력 (우리 팀) */
  ap?: number;
  /** 이번 주 포텐셜 폭발 (주 시작 때 정해짐, 그 주 경기 동안 능력치 배율) */
  burst?: { week: string; mul: number };
  /** 우승 경력 */
  titles?: string[];
  /** 종족별 통산 전적 [승, 패] */
  vs?: Partial<Record<Race, [number, number]>>;
  /** 상대 선수별 전적 [승, 패] (우리 팀 선수만 기록 — 상대 쪽은 뒤집어서 본다) */
  h2h?: Record<number, [number, number]>;
  /** 장착 장비 (남은 경기 수) */
  equip?: Partial<Record<"mouse" | "keyboard" | "monitor" | "etc", { key: string; left: number }>>;
  /** 이번 시즌 마신 포션 수 */
  potions?: number;
  /** 계약 */
  contract?: Contract;
  /** 사기 0~100 (출전이 적으면 떨어짐) */
  morale?: number;
  /** 이적 희망 */
  wantsOut?: boolean;
  /** 이번 시즌 프로리그 출전 경기 수 */
  sApps?: number;
  /** 성장 한계 (능력치 합) */
  potential?: number;
  /** 은퇴한 시즌 (팀 번호는 -1) */
  retired?: number;
  /** 다시 등장한 신인이면 원래 선수 번호 (사진) */
  photoOf?: number;
  /** 이미 어린 선수로 다시 등장함 */
  reborn?: boolean;
  /** 2부 팀 소속 (우리 구단) */
  reserve?: boolean;
  /** 신인으로 등장한 시즌 */
  rookie?: number;
}

/** 보너스 조건: 프로리그 우승 · 개인리그 우승 · 다승왕 · 시즌 다승 10위 안 */
export type BonusKey = "proTitle" | "mslTitle" | "mostWins" | "topRank";
export const BONUS_NAMES: Record<BonusKey, string> = { proTitle: "프로리그 우승", mslTitle: "개인리그 우승", mostWins: "다승왕", topRank: "다승 랭킹 10위 이내" };

/** 선수 계약 (금액: 만원) */
export interface Contract {
  /** 시즌 연봉 (정규시즌 주마다 나눠 지급) */
  salary: number;
  /** 남은 시즌 수 (이번 시즌 포함) */
  years: number;
  /** 출전 보장: 시즌 프로리그 최소 출전 경기 수 */
  minApps?: number;
  /** 성과 보너스 */
  bonus?: Partial<Record<BonusKey, number>>;
}

/** 다른 팀이 우리 선수에게 낸 영입 제안 */
export interface TransferOffer {
  id: number;
  player: number;
  team: number;
  fee: number;
  season: number;
  week: number;
  /** 제안한 팀이 낼 수 있는 최대 금액 (협상용, 화면에는 안 보임) */
  max: number;
  /** 협상 횟수 */
  tries: number;
  status: "pending" | "countered";
}

export interface CTeam {
  id: number;
  name: string;
  short: string;
  color: string;
  money: number;
  /** 시즌 성적 */
  wins: number;
  losses: number;
  setWins: number;
  setLosses: number;
}

/** 세트 뒤 선수 변화 (중계 끝에 보여줌) */
export interface PlayerFx {
  /** 컨디션 [전, 후] */
  cond: [number, number];
  /** 바뀐 능력치 */
  stats?: Partial<Record<StatKey, number>>;
  exp: number;
  /** 레벨 업 했으면 새 레벨 */
  level?: number;
}
export interface SetResult {
  mapId: number;
  a: number;
  b: number;
  winner: "a" | "b";
  duration: number;
  highlights?: string[];
  /** 이 세트에 쓴 경기 아이템 (우리 선수) */
  item?: string;
  /** 스나이핑 적중 */
  sniped?: boolean;
  /** 세트 뒤 두 선수 변화 */
  fx?: { a: PlayerFx; b: PlayerFx };
  /** 세레모니 보너스 (만원) */
  ceremony?: number;
  /** 포텐셜 폭발 (그 세트 능력치 배율, 예: 1.15) */
  burst?: { a?: number; b?: number };
}

export interface CMatch {
  id: number;
  week: number;
  /** regular | semi(준PO) | po | final */
  stage: "regular" | "semi" | "po" | "final";
  /** 정규시즌 주 안의 순서 (1경기·2경기) */
  leg?: 1 | 2;
  a: number;
  b: number;
  maps: number[];
  done?: boolean;
  scoreA?: number;
  scoreB?: number;
  winner?: number;
  sets?: SetResult[];
  /** 양 팀 엔트리 (경기 후 공개) */
  entryA?: number[];
  entryB?: number[];
}

/** 원작식 중계 화면 데이터 (세이브에는 저장하지 않고 경기 직후에만 내려줌) */
export interface SetTimeline {
  lines: Array<{ t: number; side: 0 | 1 | 2; text: string }>;
  frames: Array<{ t: number; army: [number, number]; res: [number, number] }>;
}

/** 진행 중인 우리 경기 */
export interface LiveMatch {
  matchId: number;
  /** 우리 엔트리 (처음엔 1~(n-1)세트, ACE 결정전 때 마지막 선수가 붙음) */
  mine: number[];
  /** 상대(AI) 엔트리 전체 (마지막 = ACE, 화면에서는 그 세트 전까지 숨김) */
  opp: number[];
  /** 지금까지 치른 세트 (중계 포함, 경기가 끝나면 지움) */
  sets: Array<SetResult & { timeline?: SetTimeline }>;
  /** 세트별 경기 아이템 (세트 번호 → 아이템, 스나이핑은 예측한 상대 선수) */
  items?: Record<number, { key: string; predict?: number }>;
}

/** 시즌 맵 추첨 개수 (원작 "맵 추첨 결과" 7개, 결승 7세트) */
export const MAP_POOL_SIZE = 7;

// ── 마이스타리그 (개인리그, MSL 방식) ───────────────────────────────
/** 진행 단계 */
export type MslStage = "pc" | "dual" | "nom" | "group" | "ro16" | "ro8" | "ro4" | "final" | "done";
/**
 * 주차별 개인리그 일정 (원작 정규 시즌 일정표): PC방 예선 → 듀얼(3주) → 조지명식 → 32강(2주) → 16강(2주) → 8강(2주) → 4강·결승(포스트시즌)
 */
export const MSL_PLAN: Array<{ week: number; stage: Exclude<MslStage, "done">; part: number; label: string }> = [
  { week: 1, stage: "pc", part: 0, label: "PC방 예선전" },
  { week: 2, stage: "dual", part: 0, label: "듀얼토너먼트" },
  { week: 3, stage: "dual", part: 1, label: "듀얼토너먼트" },
  { week: 4, stage: "dual", part: 2, label: "듀얼토너먼트" },
  { week: 5, stage: "nom", part: 0, label: "조지명식" },
  { week: 6, stage: "group", part: 0, label: "32강" },
  { week: 7, stage: "group", part: 1, label: "32강" },
  { week: 8, stage: "ro16", part: 0, label: "16강" },
  { week: 9, stage: "ro16", part: 1, label: "16강" },
  { week: 10, stage: "ro8", part: 0, label: "8강" },
  { week: 11, stage: "ro8", part: 1, label: "8강" },
  { week: 12, stage: "ro4", part: 0, label: "4강" },
  { week: 13, stage: "final", part: 0, label: "결승" },
];
/** 단계가 시작하는 주 */
export const MSL_WEEK: Record<Exclude<MslStage, "done">, number> = { pc: 1, dual: 2, nom: 5, group: 6, ro16: 8, ro8: 10, ro4: 12, final: 13 };
export const MSL_STAGE_NAMES: Record<MslStage, string> = {
  pc: "PC방 예선", dual: "듀얼 토너먼트", nom: "조 지명식", group: "32강", ro16: "16강", ro8: "8강", ro4: "4강", final: "결승", done: "종료",
};
/** 최종 성적별 상금 (만원, 소속 팀에 지급) */
export const MSL_PRIZE: Record<string, number> = { 우승: 1500, 준우승: 800, "4강": 400, "8강": 250, "16강": 150, "32강": 80 };

/** 다전제 한 경기 (스타리그는 선수 대 선수) */
export interface MslSeries {
  a: number;
  b: number;
  bestOf: number;
  sa: number;
  sb: number;
  winner: number;
  label: string;
  sets: SetResult[];
}
/** 듀얼 방식 4인 조 (1·2경기 → 승자전·패자전 → 최종전, 2명 통과) */
export interface MslGroup {
  name: string;
  players: number[];
  games: MslSeries[];
  qualified: number[];
}
export interface MslState {
  season: number;
  stage: MslStage;
  seeds: number[];
  pcQualifiers: number[];
  /** PC방 예선 참가 인원 */
  pcEntrants: number;
  /** PC방 예선 중 우리 선수 경기 */
  pcGames?: MslSeries[];
  duals: MslGroup[];
  nominations: Array<{ by: number; pick: number; group: string }>;
  /** 진행 중인 조 지명식 (우리 선수가 조장이면 그 차례에 직접 지명) */
  draft?: { groups: number[][]; pool: number[]; step: number };
  groups: MslGroup[];
  bracket: Array<{ round: "ro16" | "ro8" | "ro4" | "final"; series: MslSeries[] }>;
  /** 선수별 최종 성적 */
  placements: Record<number, string>;
  champion?: number;
  runnerUp?: number;
  /** 다음에 치를 일정 (MSL_PLAN 번호) */
  planIdx?: number;
}

export interface CareerState {
  version: 1;
  myTeam: number;
  season: number;
  week: number;
  phase: "regular" | "postseason" | "offseason";
  ap: number;
  players: CPlayer[];
  teams: CTeam[];
  matches: CMatch[];
  /** 다음 경기 번호 */
  nextMatchId: number;
  /** 소식 (최근 순) */
  news: Array<{ season: number; week: number; text: string }>;
  /** 지난 시즌 기록 */
  history: Array<{ season: number; champion: number; myRank: number; myResult: string; mslChampion?: number; mslRunnerUp?: number }>;
  /** 이번 시즌 마이스타리그 */
  msl?: MslState;
  /** 이번 시즌 맵 추첨 결과 */
  mapPool?: number[];
  /** 받은 영입 제안 */
  offers?: TransferOffer[];
  nextOfferId?: number;
  /** 이적료 합의된 영입 대상 (선수 → 합의 내용, 이번 주만 유효) */
  agreements?: Record<number, { team: number; fee: number; season: number; week: number }>;
  /** 이번 주 협상 횟수 (키: 선수-종류) */
  tries?: Record<string, number>;
  triesWeek?: string;
  /** 감독 */
  manager?: { reputation: number; moves?: number; level?: number; exp?: number };
  /** 메인 스폰서 (모기업) 계약 */
  mainSponsor?: import("./mainSponsor").MainSponsorContract;
  /** 다른 팀의 감독 제의 */
  jobOffers?: number[];
  /** 적자 주 수 (3주 연속이면 구단 해체) */
  debtWeeks?: number;
  /** 게임 종료 */
  gameOver?: { season: number; week: number; reason: string };
  /** 이번 시즌 수입·지출 (항목별, 지출은 음수) */
  ledger?: { season: number; items: Record<string, number> };
  /** 이번 시즌 스폰서 */
  /** (예전 세이브) 서브 스폰서 한 곳 */
  sponsor?: import("./sponsor").Sponsor & { season: number };
  /** 이번 시즌 계약한 서브 스폰서 (최대 3곳) */
  sponsors?: Array<import("./sponsor").Sponsor & { season: number }>;
  /** 포텐셜 폭발을 정한 주 */
  burstWeek?: string;
  /** 컨디션 단위 (100 = % 단위. 없으면 예전 1~10 단위 세이브) */
  condScale?: 100;
  /** 선수 행동을 반영한 주 (한 주 한 번) */
  actionsWeek?: string;
  /** 우리 선수 행동을 진행한 주 (선수 행동 화면 "진행하기") */
  myActionsWeek?: string;
  /** 보유 경기 아이템 (츄잉껌·세레모니·스나이핑·치어풀) */
  inventory?: Record<string, number>;
  /** 진행 중인 우리 경기 (세트마다 하나씩 진행, 2:2 면 ACE 결정전 선수를 그때 고름) */
  live?: LiveMatch;
}

export function ageOf(p: Pick<CPlayer, "birth">, season: number): number {
  // 한국식 나이
  return BASE_YEAR + season - 1 - p.birth + 1;
}

/** 원작식 등급 (F ~ SSS, +). 강현우 4650 → E, 허영무 5850 → B+ 에 맞춘 근사치 */
const LEGACY_GRADES = ["F", "F+", "E", "E+", "D", "D+", "C", "C+", "B", "B+", "A", "A+", "S", "S+", "SS", "SSS"];
export function legacyGrade(total: number): string {
  return LEGACY_GRADES[Math.max(0, Math.min(LEGACY_GRADES.length - 1, Math.floor((total - 4200) / 175)))];
}

export function totalOf(stats: Record<StatKey, number>): number {
  return Object.values(stats).reduce((a, b) => a + b, 0);
}

/** 영입 요구 금액 (만원): 능력치·레벨·나이 반영 */
export function askingPrice(p: CPlayer, season: number): number {
  const total = totalOf(p.stats);
  const age = ageOf(p, season);
  const base = Math.max(0, total - 3800) * 0.6 + p.level * 60;
  const ageMul = age <= 22 ? 1.2 : age >= 28 ? 0.6 : 1;
  return Math.max(50, Math.round((base * ageMul) / 10) * 10);
}

// ── 트레이드 ────────────────────────────────────────────────────
/** 트레이드용 선수 가치 (요구 금액 기준) */
export function tradeValue(p: CPlayer, season: number): number {
  return askingPrice(p, season);
}
/** AI 가 요구하는 가치 배율 (에이스를 내줄 때는 훨씬 높게) */
export const TRADE_PREMIUM = 1.1;
export const TRADE_ACE_PREMIUM = 1.4;
/** 트레이드 후 AI 팀 최소 인원 */
export const AI_MIN_ROSTER = 6;
