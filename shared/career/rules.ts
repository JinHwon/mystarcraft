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
/** 선수단 최소 인원 (방출·이적·트레이드로 이보다 줄일 수 없음, 계약 만료·은퇴로 모자라면 무소속 선수가 배정됨) */
export const SQUAD_MIN = 8;

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
export const POSTSEASON_PRIZE: Record<string, number> = { 우승: 1500, 준우승: 800, 플레이오프: 400, 준플레이오프: 250, 승격: 600, "2부 우승": 400 };

// ── 2부 리그 (구단마다 B팀, 1부 11·12위 ↔ 2부 1·2위 승강전) ─────────────────
/** B팀 번호 = 1부 구단 번호 + B_TEAM_OFFSET (무소속 12번 다음부터) */
export const B_TEAM_OFFSET = 13;
/** 2부 팀 최소 인원 (리그 규정) */
export const B_MIN_ROSTER = 8;
/** 2부 팀 기본 인원 (새로 채울 때) */
export const B_ROSTER_TARGET = 9;
/** 2부 팀 최대 인원 */
export const B_MAX_ROSTER = 14;
export const B_START_MONEY = 1500;
export const B_WEEKLY_SPONSOR = 60;
export const B_MATCH_MONEY = { win: 60, lose: 15 };
export const B_OPERATING_COST = 35;
/** 2부(B팀)가 1부로 선수를 보낼 때 리그가 이적료에 더 주는 육성 지원금 비율: 같은 구단 1군 50%, 다른 1부 구단 20% */
export const B_DEVELOPMENT_BONUS = 0.5;
export const B_DEVELOPMENT_BONUS_OTHER = 0.2;
/** 1부에서 승강전에 나가는 순위 (12팀 중 11·12위) */
export const PROMO_SLOTS = 2;

// ── 컨디션 (원작: 작은 정수 단계, 의욕/짜증) ─────────────────────────
/** 컨디션은 원작처럼 % (1 단위로 움직임) */
export const COND_MIN = 1;
export const COND_MAX = 100;
export const COND_LABELS = ["", "최악", "짜증", "나쁨", "저조", "보통", "양호", "좋음", "의욕", "최상", "절정"];
/** 한 주가 끝날 때 모든 선수 컨디션 회복량 (%) */
export const WEEKLY_COND_RECOVERY = 10;
export const condLabel = (cond: number) => COND_LABELS[Math.max(1, Math.min(10, Math.ceil(cond / 10)))];
/**
 * 컨디션에 따른 경기력 배율: 100% 가 원래 능력치. 조금만 떨어져도 바로 줄고(90% → 87%), 낮아질수록 완만하게 (50~60% → 절반 언저리)
 * 표의 점 사이는 직선으로 이음
 */
const COND_CURVE: Array<[number, number]> = [[100, 1], [90, 0.87], [80, 0.76], [70, 0.65], [60, 0.55], [50, 0.47], [40, 0.4], [20, 0.3], [1, 0.25]];
export function condMultiplier(cond: number): number {
  const c = Math.max(COND_MIN, Math.min(COND_MAX, cond));
  for (let k = 1; k < COND_CURVE.length; k++) {
    const [c0, m0] = COND_CURVE[k - 1], [c1, m1] = COND_CURVE[k];
    if (c >= c1) return m1 + ((c - c1) / (c0 - c1)) * (m0 - m1);
  }
  return COND_CURVE[COND_CURVE.length - 1][1];
}

/** 시즌 중 영입한 선수의 프로리그 적응기간 (주) */
export const ADAPT_WEEKS = 2;
/** 적응기간이라 이번 주 프로리그에 못 나가는지 (남은 주, 아니면 0) */
export function adaptWeeksLeft(s: { season: number; week: number; phase?: string }, p: CPlayer): number {
  const n = p.newcomer;
  if (!n || n.season !== s.season || s.phase === "offseason") return 0;
  return Math.max(0, n.until - s.week);
}

/** 이번 주 포텐셜 폭발 배율 (없으면 undefined) */
export function burstOf(s: { season: number; week: number }, p: CPlayer): number | undefined {
  return p.burst && p.burst.week === `${s.season}-${s.week}` ? p.burst.mul : undefined;
}

/** 이번 주 포텐셜 폭발 표시 */
export function burstLabel(mul: number): { icon: string; name: string; color: string } {
  return mul >= 1 ? { icon: "🔥", name: "포텐셜 폭발", color: "#ffb84d" } : { icon: "😵", name: "컨디션 난조", color: "#8fb8ff" };
}

/** 컨디션 난조: 주마다 컨디션과 관계없이 이 확률로 걸림 (포텐셜 폭발과 겹치지 않음) */
export const SLUMP_CHANCE = 0.05;
/** 컨디션 난조면 그 주 경기 컨디션이 이만큼 떨어짐 (최저 10) — 100 → 60, 90 → 50, 40 이하 → 10 */
export const SLUMP_COND = 40;
export const SLUMP_MIN_COND = 10;
/** 이번 주 컨디션 난조인지 */
export function slumpOn(s: { season: number; week: number }, p: CPlayer): boolean {
  return p.slump === `${s.season}-${s.week}`;
}
/** 난조를 반영한 컨디션 */
export const slumpCond = (cond: number) => Math.max(SLUMP_MIN_COND, cond - SLUMP_COND);

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
  { key: "event", name: "이벤트", emoji: "🎤", ap: 20, money: 0, desc: "팬미팅을 합니다. 구단 자금을 벌고, 인기가 많을수록 치어풀을 받을 확률이 높습니다. 한 주에 여러 명이 열면 팬이 나뉘어 수익이 줄어듭니다. 연습을 못 해 능력치도 조금 떨어집니다. (컨디션 -3~5)" },
];
/** 선수별 주당 행동력 (선수마다 매주 받고, 쓰지 않으면 시즌 동안 계속 쌓임. 새 시즌에 다시 시작) */
export const WEEKLY_AP = 20;
export const actionOf = (key: string | null | undefined) => ACTIONS.find(a => a.key === key);
/** 컨디션이 이미 100% 면 휴식은 할 필요가 없음 (실행에서 자동으로 빠지고 행동력도 쓰지 않음) */
export const restNotNeeded = (p: { cond: number; action?: string | null }) => p.action === "rest" && p.cond >= 100;

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
  /** 이번 주 포텐셜 폭발(배율 1.1~1.2) 또는 컨디션 난조(0.6~0.9) — 주 시작 때 정해짐, 그 주 경기 동안 능력치 배율 */
  burst?: { week: string; mul: number };
  /** 시즌 중 새로 온 선수: until 주 전까지 프로리그 출전 불가 (적응기간, 개인리그는 가능) */
  newcomer?: { season: number; until: number };
  /** 컨디션 난조인 주 (시즌-주): 그 주 경기 컨디션 -40 (최저 10) */
  slump?: string;
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
  /** 연봉 협상이 틀어져 불만: 이 주(시즌-주)까지 주간 컨디션 회복이 없음 */
  sulkUntil?: string;
  /** 계약 */
  contract?: Contract;
  /** 사기 0~100 (출전이 적으면 떨어짐) */
  morale?: number;
  /** 이적 희망 */
  wantsOut?: boolean;
  /** 이번 시즌 프로리그 출전 경기 수 */
  sApps?: number;
  /** 프로리그(1부·2부·승강전·포스트시즌)에 연속으로 못 나간 주 수 (정규시즌만 셈, 개인리그 출전은 제외) */
  benchWeeks?: number;
  /** 마지막으로 프로리그에 나간 주 (시즌-주) */
  lastProWeek?: string;
  /** 성장 한계 (능력치 합) */
  potential?: number;
  /** 은퇴한 시즌 (팀 번호는 -1) */
  retired?: number;
  /** 다시 등장한 신인이면 원래 선수 번호 (사진) */
  photoOf?: number;
  /** 이미 어린 선수로 다시 등장함 */
  reborn?: boolean;
  /** (예전 세이브) 구단 안의 2부 육성 선수 — 이제는 B팀 소속으로 옮김 */
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
/** 우리가 다른 구단·선수에게 보낸 요청: 보낸 다음 주에 답이 오고, 답이 온 주에는 바로 이어서 협상 */
export interface OutRequest {
  id: number;
  kind: "bid" | "trade" | "scout";
  /** 상대 구단 (스카웃은 무소속) */
  team: number;
  /** 영입 요청·스카웃 대상 */
  player?: number;
  /** 영입 요청 이적료 */
  fee?: number;
  /** 트레이드: 내줄 선수·받을 선수·현금 */
  give?: number[];
  take?: number[];
  cash?: number;
  season: number;
  week: number;
  /** 상대의 답 (온 주) */
  reply?: { ok: boolean; result: string; message: string; fee?: number; season: number; week: number };
}

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
  /** 이적시장에 내놓은 선수에게 온 제안 */
  listed?: boolean;
  /** 선수가 먼저 그 팀으로 가고 싶다고 요청한 제안 (거절하면 사기가 떨어짐) */
  byPlayer?: boolean;
  /** 우리가 마지막으로 부른 역제안 금액 (상대가 다시 역제안해도 그대로 보여줌) */
  myCounter?: number;
}

/** 다른 팀 선수가 우리 팀으로 오고 싶다는 요청 (수락하면 그 이적료·선수 요구 조건으로 바로 계약) */
export interface JoinRequest {
  id: number;
  player: number;
  /** 원 소속 구단이 받아들인 이적료 (선수가 원해서 시세보다 쌈) */
  fee: number;
  salary: number;
  years: number;
  season: number;
  week: number;
}

/** 가계부 한 줄 */
export interface CashEntry {
  season: number;
  week: number;
  /** 항목 (연봉·운영비·스폰서 승리 수당·아이템 …) */
  cat: string;
  /** 수입 +, 지출 - (만원) */
  amount: number;
  /** 이 거래 뒤 잔액 */
  balance: number;
  /** 자세한 내용 (상대 팀·선수·아이템 이름) */
  note?: string;
}
/** 가계부에 남기는 최대 건수 */
export const CASHBOOK_MAX = 400;

/** 다른 구단끼리의 이적·트레이드·방출·무소속 영입 소식 */
export interface MarketMove {
  season: number;
  week: number;
  kind: "transfer" | "trade" | "release" | "sign";
  /** 움직인 선수 (트레이드는 두 명) */
  players: number[];
  /** transfer: [판 팀, 산 팀] · trade: [팀A, 팀B] · release: [팀] · sign: [팀] */
  teams: number[];
  fee?: number;
}
export const MARKET_LOG_MAX = 60;

/** 이적시장에 내놓은 우리 선수 (희망 이적료) */
export interface TransferListing {
  player: number;
  price: number;
  season: number;
  week: number;
}

/** 끝난 영입 제안 기록 (받은 제안의 합의·거절·결렬·만료, 우리가 한 영입) */
export interface OfferLog {
  id: number;
  season: number;
  week: number;
  player: number;
  /** 상대 구단 */
  team: number;
  fee: number;
  /** out: 우리 선수를 보냄(받은 제안) · in: 다른 팀 선수를 데려옴 */
  dir: "out" | "in";
  result: "sold" | "rejected" | "withdrawn" | "expired" | "closed" | "signed";
  note?: string;
}

/** 다른 구단의 감독 제의 (영입 계약금 협상) */
export interface JobOffer {
  team: number;
  /** 지금 제시한 영입 계약금 (만원) */
  fee: number;
  /** 그 구단이 낼 수 있는 최대 계약금 (화면에는 안 보임) */
  max: number;
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
  /** 소속 리그 (없으면 1부) */
  div?: 1 | 2;
  /** B팀이면 모구단 번호 */
  parent?: number;
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
  /** 포텐셜 폭발 배율 [전, 후] (후 0 = 끝남) — 떨어진 컨디션만큼 줄어듦 */
  burst?: [number, number];
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
  /** 다른 팀(컴퓨터)이 이 세트에 쓴 경기 아이템 (쪽별), 스나이핑 적중 여부 */
  aiItems?: { a?: string; b?: string };
  aiSniped?: { a?: boolean; b?: boolean };
  /** 포텐셜 폭발 (그 세트 능력치 배율, 예: 1.15) */
  burst?: { a?: number; b?: number };
  /** 컨디션 난조였던 쪽 */
  slump?: { a?: boolean; b?: boolean };
}

export interface CMatch {
  id: number;
  week: number;
  /** regular | semi(준PO) | po | final | promo(승강전: 1부 11·12위 vs 2부 2·1위) */
  stage: "regular" | "semi" | "po" | "final" | "promo";
  /** 리그 (없으면 1부, 승강전은 1부 팀이 a) */
  div?: 1 | 2;
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
  /** 양 팀 엔트리 (경기 후 공개, 위너스리그는 세트마다 나온 선수) */
  entryA?: number[];
  entryB?: number[];
  /** 위너스리그 방식 (3의 배수 시즌): 이긴 선수가 질 때까지 계속, 진 팀이 다음 선수를 내보냄 */
  winners?: boolean;
}

/** 3의 배수 시즌은 위너스리그 */
export const isWinnersSeason = (season: number) => season % 3 === 0;
/** 경기 세트 수·이겨야 하는 세트 수: 보통 5전 3선승(결승 7전 4선승), 위너스리그 7전 4선승(결승 9전 5선승) */
export const matchSets = (m: Pick<CMatch, "stage" | "winners">) => (m.winners ? (m.stage === "final" ? 9 : 7) : m.stage === "final" ? FINAL_SETS : PRO_SETS);
export const matchNeed = (m: Pick<CMatch, "stage" | "winners">) => Math.ceil(matchSets(m) / 2);
export const matchFormatName = (m: Pick<CMatch, "stage" | "winners">) => `${matchSets(m)}전 ${matchNeed(m)}선승${m.winners ? " · 위너스" : ""}`;

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
  /** 위너스리그: 상대가 내보낼 순서 (진 선수는 빠짐) */
  oppOrder?: number[];
  winners?: boolean;
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
/** 관전용: 경기 직전 선수 상태 (아직 안 본 경기 결과가 미리 드러나지 않게) */
export interface PlayerSnap {
  cond: number;
  stats: Record<StatKey, number>;
  titles?: string[];
  /** 그 주 포텐셜 폭발 배율 */
  burst?: number;
  /** 그 주 컨디션 난조 */
  slump?: boolean;
}
export function snapOf(p: CPlayer, s?: { season: number; week: number }): PlayerSnap {
  const out: PlayerSnap = { cond: p.cond, stats: { ...p.stats } };
  if (p.titles?.length) out.titles = [...p.titles];
  const b = s ? burstOf(s, p) : undefined;
  if (b) out.burst = b;
  if (s && slumpOn(s, p)) out.slump = true;
  return out;
}

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
  history: Array<{
    season: number; champion: number; myRank: number; myResult: string; mslChampion?: number; mslRunnerUp?: number; /** 그 시즌 우리(감독) 팀 */ team?: number; /** 우리 팀 선수가 개인리그 1 우승·2 준우승 */ myMsl?: 1 | 2;
    /** 그 시즌 우리 팀 리그 */ div?: 1 | 2; /** 2부 1위 */ champion2?: number; /** 승강전 결과 (올라간 팀 → 내려간 팀) */ promo?: Array<{ up: number; down: number }>;
  }>;
  /** 이번 시즌 마이스타리그 */
  msl?: MslState;
  /** 마지막으로 리그를 진행한 때 (경기·주 진행·다음 시즌, ms) — 감독 랭킹 표시용 */
  lastLeagueAt?: number;
  /** 이번 시즌 승강전 결과 (다음 시즌 시작 때 리그를 바꿈) */
  promo?: { season: number; moves: Array<{ up: number; down: number }> };
  /** 이번 시즌 맵 추첨 결과 */
  mapPool?: number[];
  /** 받은 영입 제안 */
  offers?: TransferOffer[];
  nextOfferId?: number;
  /** 이적시장에 내놓은 우리 선수 */
  listings?: TransferListing[];
  /** 끝난 영입 제안 기록 (최근 순, 최대 40건) */
  offerLog?: OfferLog[];
  /** 우리가 보낸 영입 요청·트레이드·스카웃 (시즌 중엔 다음 주에 상대가 답함) */
  outbox?: OutRequest[];
  /** 이적료 합의된 영입 대상 (선수 → 합의 내용, 이번 주만 유효) */
  agreements?: Record<number, { team: number; fee: number; season: number; week: number }>;
  /** 이번 주 협상 횟수 (키: 선수-종류) */
  tries?: Record<string, number>;
  triesWeek?: string;
  /** 감독 */
  manager?: { reputation: number; moves?: number; level?: number; exp?: number; /** 맡았던 팀 (부임 순) */ teams?: number[] };
  /** 메인 스폰서 (모기업) 계약 */
  mainSponsor?: import("./mainSponsor").MainSponsorContract;
  /** 다른 팀의 감독 제의 (예전 세이브는 팀 번호 배열 → ensureClub 에서 변환) */
  jobOffers?: JobOffer[];
  /** 시즌 중에 수락한 감독 제의: 시즌이 끝나면 이 팀으로 옮김 */
  pendingJob?: { team: number; fee: number; season: number };
  /** 다른 팀 선수의 입단 요청 */
  joinRequests?: JoinRequest[];
  /** 우리 스타 선수의 연봉 인상(재계약) 요구 (한 번에 한 명, 2주 안에 답하지 않으면 거절로 봄) */
  raiseRequest?: { player: number; salary: number; years: number; season: number; week: number };
  /** 적자 주 수 (3주 연속이면 구단 해체) */
  debtWeeks?: number;
  /** 게임 종료 */
  gameOver?: { season: number; week: number; reason: string };
  /** 이번 시즌 수입·지출 (항목별, 지출은 음수) */
  ledger?: { season: number; items: Record<string, number> };
  /** 가계부: 우리 구단 돈이 움직인 기록 (오래된 순, 최근 CASHBOOK_MAX 건) */
  cashbook?: CashEntry[];
  /** 다른 구단끼리 선수 이동 기록 (최근 순) */
  marketLog?: MarketMove[];
  /** 이번 시즌 스폰서 */
  /** (예전 세이브) 서브 스폰서 한 곳 */
  sponsor?: import("./sponsor").Sponsor & { season: number };
  /** 이번 시즌 계약한 서브 스폰서 (최대 3곳) */
  sponsors?: Array<import("./sponsor").Sponsor & { season: number }>;
  /** 프로리그 경기는 끝났지만 조 지명식(우리 선수 지명)을 기다리며 주 마무리를 멈춤 */
  /** 주 마무리 대기: 조 지명식 (msl 없음) 또는 개인리그 경기 전 준비 (msl: 이번 주 개인리그에 나가는 우리 선수) */
  weekHold?: { playedMatchId?: number; msl?: number[] };
  /** 포텐셜 폭발을 정한 주 */
  burstWeek?: string;
  /** 컨디션 단위 (100 = % 단위. 없으면 예전 1~10 단위 세이브) */
  condScale?: 100;
  /** 이번 주 우리 팀 팬미팅 횟수 (많이 열수록 수익이 줄어듦) */
  eventCount?: { week: string; n: number };
  /** 선수 행동을 반영한 주 (한 주 한 번) */
  actionsWeek?: string;
  /** 우리 선수 행동을 진행한 주 (선수 행동 화면 "진행하기") */
  myActionsWeek?: string;
  /** 보유 경기 아이템 (츄잉껌·세레모니·스나이핑·치어풀) */
  inventory?: Record<string, number>;
  /** 진행 중인 우리 경기 (세트마다 하나씩 진행, 2:2 면 ACE 결정전 선수를 그때 고름) */
  live?: LiveMatch;
}

/** 2부 리그 경기 나이별 성장 배율: 어릴수록 크게 (오르는 쪽) */
export function youthGrowth(age: number) {
  return age <= 17 ? 2.2 : age <= 19 ? 1.8 : age <= 21 ? 1.4 : age <= 23 ? 1 : age <= 25 ? 0.7 : 0.5;
}

export function ageOf(p: Pick<CPlayer, "birth">, season: number): number {
  // 한국식 나이
  return BASE_YEAR + season - 1 - p.birth + 1;
}

/** 원작식 등급 (F, D-, D, D+, C- … S+, SS, SSS). 능력치 합 4200 부터 175 마다 한 등급 (허영무 5850 → B+) */
export const LEGACY_GRADES = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+", "S-", "S", "S+", "SS", "SSS"];
export function gradeIndex(total: number): number {
  return Math.max(0, Math.min(LEGACY_GRADES.length - 1, Math.floor((total - 4200) / 175)));
}
export function legacyGrade(total: number): string {
  return LEGACY_GRADES[gradeIndex(total)];
}
/** 등급 글자색: S 계열은 분홍빛 빨강, A 계열은 빨강, B 계열은 노랑 */
export function gradeColor(grade: string): string {
  if (grade.startsWith("S")) return "#ff4f8b";
  if (grade.startsWith("A")) return "#ff3b30";
  if (grade.startsWith("B")) return "#ffe45c";
  return "#dcdcdc";
}

export function totalOf(stats: Record<StatKey, number>): number {
  return Object.values(stats).reduce((a, b) => a + b, 0);
}

/**
 * 이번 시즌 활약 배율 (0.85~1.4): 승률이 높고 많이 이길수록 비싸고, 많이 지면 싸짐 (경기 수가 적으면 덜 반영)
 * 우리가 팔 때(영입 제안 금액)·살 때(이적료) 모두 시세에 들어감
 */
export function formMul(p: CPlayer): number {
  const games = p.sWins + p.sLosses;
  if (games < 2) return 1;
  const wr = p.sWins / games;
  const weight = Math.min(1, games / 10);
  const v = 1 + ((wr - 0.5) * 0.8 + Math.min(0.15, p.sWins * 0.01)) * weight;
  return Math.max(0.85, Math.min(1.4, v));
}

/**
 * 영입 요구 금액 (만원): 능력치·레벨·나이·이번 시즌 활약 반영
 * 능력치가 높을수록 비싸짐 (능력치 합 5500 ≈ 1,400만 · 6500 ≈ 3,200만 · 8000 ≈ 9,300만, 레벨·나이 전 · 예전엔 8000 도 2,500만)
 */
export function askingPrice(p: CPlayer, season: number): number {
  const total = totalOf(p.stats);
  const age = ageOf(p, season);
  const x = Math.max(0, total - 3800) / 1000;
  const base = 600 * x + 60 * Math.pow(x, 3.3) + p.level * 60;
  const ageMul = age <= 22 ? 1.2 : age >= 28 ? 0.6 : 1;
  return Math.max(50, Math.round((base * ageMul * formMul(p)) / 10) * 10);
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
