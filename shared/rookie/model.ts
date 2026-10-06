/**
 * 선수 키우기 모드: 아마추어 → 준프로(커리지 매치) → 프로 2군 → 1군
 * 감독 모드와 별개의 세이브 (rookie_careers). 경기 엔진·중계는 감독 모드와 같은 것을 쓴다.
 */
import { STAT_KEYS, type StatKey } from "../gameConstants";
import type { Race } from "../career/rules";

// ── 기본 ───────────────────────────────────────────────────────
export type Stats = Record<StatKey, number>;
export type Concept = "macro" | "strategy" | "control" | "defense" | "balance" | "harass";
export const CONCEPTS: Record<Concept, { name: string; desc: string; weights: Partial<Record<StatKey, number>> }> = {
  macro: { name: "물량형", desc: "물량·수비 위주로 힘싸움", weights: { supply: 1.35, defense: 1.15, attack: 1.05, harass: 0.8, scout: 0.85 } },
  strategy: { name: "전략형", desc: "전략·센스·정찰로 상대를 속인다", weights: { strategy: 1.35, sense: 1.2, scout: 1.15, supply: 0.85, defense: 0.85 } },
  control: { name: "컨트롤형", desc: "컨트롤·공격력으로 교전에서 이긴다", weights: { control: 1.35, attack: 1.2, harass: 1.05, strategy: 0.85, scout: 0.85 } },
  defense: { name: "수비형", desc: "단단하게 막고 후반을 노린다", weights: { defense: 1.35, supply: 1.15, sense: 1.05, attack: 0.85, harass: 0.8 } },
  harass: { name: "견제형", desc: "드랍·견제로 상대를 흔든다", weights: { harass: 1.35, control: 1.15, scout: 1.05, defense: 0.85, supply: 0.85 } },
  balance: { name: "밸런스형", desc: "모든 능력이 고르게", weights: {} },
};
export const RACE_NAMES: Record<Race, string> = { terran: "테란", zerg: "저그", protoss: "프로토스" };

/** 신분: 아마추어 → 준프로(커리지 매치 우승) → 프로 (2군/1군) */
export type Status = "amateur" | "semipro" | "pro";
export const STATUS_NAMES: Record<Status, string> = { amateur: "아마추어", semipro: "준프로", pro: "프로게이머" };

/**
 * 능력치 성장 한계 (능력치 합). 아마추어·준프로는 고만고만하게, 프로가 되면 프로 수준까지
 * (참고: 프로 1군 선수 합 4,500~6,500)
 */
export const STAT_CAP: Record<"amateur" | "semipro" | "pro2" | "pro1", number> = { amateur: 4300, semipro: 4800, pro2: 5800, pro1: 7000 };
export const STAT_MAX_ONE = 950;
export const STAT_MIN_ONE = 100;

export const sumStats = (st: Stats) => STAT_KEYS.reduce((a, k) => a + st[k], 0);

/** 처음 능력치: 합 2,400~3,000 정도, 컨셉에 따라 분배 (주사위로 다시 굴릴 수 있음) */
export function rollStats(concept: Concept, rnd: () => number = Math.random): Stats {
  const w = CONCEPTS[concept].weights;
  const out = {} as Stats;
  for (const k of STAT_KEYS) {
    const base = 300 + rnd() * 80 - 40;
    out[k] = Math.round(base * (w[k] ?? 1) + (rnd() - 0.5) * 60);
    out[k] = Math.max(180, Math.min(520, out[k]));
  }
  return out;
}

// ── 날짜 ───────────────────────────────────────────────────────
/** 날짜는 2010-01-04 부터 하루씩 (day 0 = 시작일) */
export const START_DATE = Date.UTC(2010, 0, 4);
export const dateOf = (day: number) => new Date(START_DATE + day * 86_400_000);
export const ymd = (day: number) => { const d = dateOf(day); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() }; };
export const dayOf = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - START_DATE) / 86_400_000);
export const dateText = (day: number) => { const x = ymd(day); return `${x.y}.${String(x.m).padStart(2, "0")}.${String(x.d).padStart(2, "0")}`; };
export const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** 그 달의 마지막 날인지 */
export const isMonthEnd = (day: number) => ymd(day + 1).m !== ymd(day).m;

/** 하루에 할 수 있는 일 (연습·래더·휴식·방송 등, 이벤트 경기 제외) */
export const DAY_SLOTS = 10;

// ── 커리지 매치 · 드래프트 ───────────────────────────────────────
/** 커리지 매치: 6월·12월 셋째 토요일 근처 (매년 6/20, 12/20 로 고정) */
export const courageDays = (y: number) => [dayOf(y, 6, 20), dayOf(y, 12, 20)];
/** 드래프트: 12월 커리지 매치 뒤 12/27 */
export const draftDay = (y: number) => dayOf(y, 12, 27);
/** 준프로 자격 기간 (드래프트 참가 가능) */
export const SEMIPRO_DAYS = 730;
/** 커리지 매치 우승 후 입단 경기를 제의받을 만한 능력치 합 */
export const TRYOUT_MIN = 4100;

// ── 래더 ───────────────────────────────────────────────────────
export const LADDER_START = 1500;
/** 래더 등급 (점수만 있고 +/- 등급은 없음) */
export function ladderGrade(score: number): string {
  if (score >= 2200) return "S";
  if (score >= 2000) return "A";
  if (score >= 1800) return "B";
  if (score >= 1650) return "C";
  if (score >= 1500) return "D";
  if (score >= 1350) return "E";
  return "F";
}
export const GRADE_COLOR: Record<string, string> = { S: "#ff6bd5", A: "#ffe45c", B: "#8fd0ff", C: "#8fe07a", D: "#e0e0e0", E: "#b0a090", F: "#909090" };

// ── 공방 (연습 게임) ─────────────────────────────────────────────
export type Tier = "newbie" | "low" | "mid" | "high" | "elite" | "pro";
export const TIERS: Record<Tier, { name: string; range: [number, number] }> = {
  newbie: { name: "초보", range: [1900, 2500] },
  low: { name: "하수", range: [2400, 2900] },
  mid: { name: "중수", range: [2800, 3400] },
  high: { name: "고수", range: [3300, 3900] },
  elite: { name: "초고수", range: [3800, 4400] },
  pro: { name: "프로급", range: [4300, 5200] },
};
export const TIER_ORDER: Tier[] = ["newbie", "low", "mid", "high", "elite", "pro"];

// ── 사람 (상대) ─────────────────────────────────────────────────
export interface Opp {
  /** 상대 이름 (아이디) */
  name: string;
  race: Race;
  stats: Stats;
  /** 프로게이머면 원작 선수 번호 (사진) · 소속 팀 */
  pro?: { id: number; team: number };
  /** 준프로 */
  semipro?: boolean;
  /** 래더 점수 (래더 상대) */
  ladder?: number;
}

const NICK_A = ["불꽃", "질럿", "저글링", "마린", "드랍", "캐리어", "벌처", "뮤탈", "하이템플러", "탱크", "럴커", "스카웃", "레이스", "울트라", "다크", "옵저버", "커세어", "디파일러", "아비터", "고스트"];
const NICK_B = ["킹", "장인", "마스터", "러버", "신", "중독", "소년", "전사", "왕자", "대장", "요정", "괴물", "천재", "덕후", "명가", "의신", "형", "짱", "님", "킬러"];
/** 아마추어 아이디 */
export function nickname(rnd: () => number = Math.random) {
  const a = NICK_A[Math.floor(rnd() * NICK_A.length)], b = NICK_B[Math.floor(rnd() * NICK_B.length)];
  return rnd() < 0.35 ? `${a}${b}${Math.floor(rnd() * 99) + 1}` : `${a}${b}`;
}

/** 능력치 합이 total 근처인 무작위 선수 */
export function statsAround(total: number, rnd: () => number = Math.random): Stats {
  const raw = STAT_KEYS.map(() => 0.75 + rnd() * 0.5);
  const sum = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(STAT_KEYS.map((k, i) => [k, Math.max(STAT_MIN_ONE, Math.min(STAT_MAX_ONE, Math.round((raw[i] / sum) * total)))])) as Stats;
}

export const RACES: Race[] = ["terran", "zerg", "protoss"];

// ── 이벤트 경기 (하루 대회) ──────────────────────────────────────
export const EVENT_NAMES = [
  "인천시장배 스타리그", "경기도민 한마음 스타대회", "삼성전자 KHAN 주최 아마추어 스타대회", "부산 해운대 e스포츠 페스티벌",
  "대전 과학도시 게임대축제", "광주 빛고을 스타 챔피언십", "대구 달구벌 PC방 연합대회", "KT 롤스터배 아마추어 오픈",
  "SK텔레콤 T1 팬 초청전", "전국 대학생 스타크래프트 대회", "청소년 e스포츠 꿈나무 대회", "강원 설악 겨울 스타대전",
  "제주 한라 스타 페스티벌", "CJ 엔투스 루키 발굴전", "웅진 스타즈 아마추어 챌린지", "수원 화성 PC방 대항전",
  "서울시장배 e스포츠 대회", "울산 공업도시 스타 리그", "전주 비빔 스타 챔피언십", "MBC게임 아마추어 열전",
];
/** 상금 (만원) 1·2·3위 */
export interface RookieEvent { id: number; name: string; day: number; size: 8 | 16; prize: [number, number, number]; level: Tier; registered?: boolean; result?: string }

// ── 아이템 (감독 모드 아이템을 아마추어 값으로) ───────────────────
/** 선수 키우기 상점 가격 배율 · 장비 사용 횟수 배율 · 장비 효과 배율 */
export const ROOKIE_PRICE = 0.3;
export const ROOKIE_USES = 2;
export const ROOKIE_BONUS = 0.5;
/** 하루에 먹을 수 있는 컨디션 회복 아이템 수 */
export const VITA_PER_DAY = 10;

// ── 세이브 ─────────────────────────────────────────────────────
export interface DayLog { day: number; icon: string; text: string }
export interface DaySummary { w: number; l: number; icons: string[] }

export interface RookieTeam {
  /** 구단 (원작 팀 번호) */
  team: number;
  /** 1군 / 2군 */
  squad: 1 | 2;
  joined: number;
  /** 월급 (만원) */
  salary: number;
  /** 이번 달 내부 연습 전적 (승강전 순위용) */
  monthW: number;
  monthL: number;
  /** 이적 시도가 들킨 횟수 */
  caught?: number;
  /** 프로리그 출전 · 전적 */
  proW?: number;
  proL?: number;
}

export interface RookieState {
  version: 1;
  name: string;
  /** 사진 (작게 줄인 data URL) */
  photo?: string;
  race: Race;
  concept: Concept;
  stats: Stats;
  /** 처음 능력치 (성장 비교용) */
  startStats: Stats;
  cond: number;
  /** 사기 0~100 (경기력에 조금 영향) */
  morale: number;
  /** 인지도 0~1000 */
  fame: number;
  money: number;
  day: number;
  /** 오늘 쓴 행동 수 (DAY_SLOTS 까지) */
  used: number;
  /** 오늘 먹은 회복 아이템 */
  vitaToday: number;
  status: Status;
  /** 준프로 자격 끝나는 날 */
  semiproUntil?: number;
  team?: RookieTeam;
  ladder: { score: number; w: number; l: number; best: number };
  record: { w: number; l: number };
  /** 연습 상대를 강퇴한 수 (오늘) */
  kicks: number;
  /** 지금 매칭된 공방 상대 */
  lobby?: { tier: Tier; mapId: number; opp: Opp };
  inventory: Record<string, number>;
  equip: Partial<Record<"mouse" | "keyboard" | "monitor" | "etc", { key: string; left: number }>>;
  events: RookieEvent[];
  nextEventId: number;
  /** 날짜별 기록 (최근 400일) */
  log: DayLog[];
  /** 날짜별 요약 (달력) */
  days: Record<number, DaySummary>;
  /** 마지막으로 용돈 받은 날 */
  allowanceDay?: number;
  /** 받은 입단 테스트 제의 (팀, 만료일) */
  tryouts: Array<{ team: number; until: number; from: string }>;
  /** 프로 구단의 이적 제안 */
  offers: Array<{ team: number; salary: number; until: number }>;
  titles: string[];
  /** 방송 통계 */
  stream: { count: number; best: number; fans: number };
  /** 커리지 매치·드래프트 참가 기록 (그 날 이미 치렀는지) */
  doneDays: number[];
  /** 게임 오버 (은퇴 등) */
  retired?: string;
}

/** 지금 성장 한계 */
export function capOf(s: Pick<RookieState, "status" | "team">): number {
  if (s.status === "pro") return s.team?.squad === 1 ? STAT_CAP.pro1 : STAT_CAP.pro2;
  return s.status === "semipro" ? STAT_CAP.semipro : STAT_CAP.amateur;
}
