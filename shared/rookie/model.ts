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
 * (참고: 프로 1군 선수 합 4,500~7,000)
 */
export const STAT_CAP: Record<"amateur" | "semipro" | "pro2" | "pro1", number> = { amateur: 4800, semipro: 5300, pro2: 6300, pro1: 7600 };
export const STAT_MAX_ONE = 1000;
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
/** 날짜는 2026-01-05 (월) 부터 하루씩 (day 0 = 시작일) */
export const START_DATE = Date.UTC(2026, 0, 5);
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
  newbie: { name: "초보", range: [1900, 2600] },
  low: { name: "하수", range: [2500, 3100] },
  mid: { name: "중수", range: [3000, 3700] },
  high: { name: "고수", range: [3600, 4300] },
  elite: { name: "초고수", range: [4200, 5000] },
  pro: { name: "프로급", range: [4800, 5900] },
};
export const TIER_ORDER: Tier[] = ["newbie", "low", "mid", "high", "elite", "pro"];

// ── 사람 (상대) ─────────────────────────────────────────────────
export interface Opp {
  /** 상대 게임 아이디 (소속 클랜이 있으면 아이디[태그]) */
  name: string;
  /** 프로게이머 본명 · 연습생 소속 등 아이디 옆에 같이 보여줄 설명 */
  real?: string;
  /** 컨디션 (%, 능력치에 반영) */
  cond?: number;
  race: Race;
  stats: Stats;
  /** 프로게이머면 원작 선수 번호 (사진) · 소속 팀 */
  pro?: { id: number; team: number };
  /** 준프로 */
  semipro?: boolean;
  /** 래더 점수 (래더 상대) */
  ladder?: number;
  /** 라이벌 */
  rival?: boolean;
}

const NICK_A = ["Dark", "Ice", "Fire", "Storm", "Shadow", "Iron", "Blue", "Red", "Sky", "Moon", "Star", "Wild", "Cool", "Rush", "Nova", "Neo", "Mad", "Lazy", "Silent", "Rapid", "Gold", "Silver", "Crazy", "Happy", "Angry", "Sweet", "Lucky", "Super", "Mega", "Tiny", "Big", "Old", "Young", "Black", "White", "Green", "Night", "Sun", "Wind", "Thunder"];
const NICK_B = ["Boy", "King", "Lord", "Man", "Master", "Kid", "Rider", "Hunter", "Killer", "Slayer", "Wolf", "Fox", "Bear", "Tiger", "Dragon", "Phoenix", "Eagle", "Hawk", "Shark", "Blade", "Knight", "Ghost", "Zero", "One", "Joker", "Star", "Light", "Wing", "Fang", "Rush", "Zealot", "Muta", "Hydra", "Lurker", "Marine", "Tank", "Probe", "Drone", "Reaver", "Carrier"];
const NICK_C = ["sc", "pro", "gosu", "noob", "fan", "love", "zerg", "terran", "toss", "bw"];
const leet = (s: string) => s.replace(/o/g, "0").replace(/i/g, "1").replace(/e/g, "3");
/** 아마추어 아이디: 스타크래프트처럼 영어 (Dark_Wolf, IceKing77, xHydrax ...) */
export function nickname(rnd: () => number = Math.random, used?: Set<string>) {
  const pickOf = (arr: string[]) => arr[Math.floor(rnd() * arr.length)];
  for (let tries = 0; ; tries++) {
    const a = pickOf(NICK_A), b = pickOf(NICK_B), r = rnd();
    let n: string;
    if (r < 0.28) n = `${a}${b}`;
    else if (r < 0.46) n = `${a}_${b}`;
    else if (r < 0.64) n = `${a}${b}${Math.floor(rnd() * 99) + 1}`;
    else if (r < 0.74) n = `x${b}x`;
    else if (r < 0.82) n = `${pickOf(NICK_C)}_${b.toLowerCase()}${Math.floor(rnd() * 9) + 1}`;
    else if (r < 0.9) n = leet(`${a}${b}`);
    else if (r < 0.95) n = `${a.toLowerCase()}${b.toLowerCase()}`;
    else n = `${b}${Math.floor(rnd() * 900) + 100}`;
    // 같은 곳(클랜·대회 등)에서 아이디가 겹치지 않게
    if (!used || !used.has(n) || tries > 40) { used?.add(n); return n; }
  }
}

/** 능력치 합이 total 근처인 무작위 선수 */
export function statsAround(total: number, rnd: () => number = Math.random): Stats {
  const raw = STAT_KEYS.map(() => 0.75 + rnd() * 0.5);
  const sum = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(STAT_KEYS.map((k, i) => [k, Math.max(STAT_MIN_ONE, Math.min(STAT_MAX_ONE, Math.round((raw[i] / sum) * total)))])) as Stats;
}

export const RACES: Race[] = ["terran", "zerg", "protoss"];
/** 화면 표기: 아이디(본명) */
export const oppLabel = (o: Pick<Opp, "name" | "real">) => (o.real ? `${o.name}(${o.real})` : o.name);

// ── 이벤트 경기 (하루 대회) ──────────────────────────────────────
export const EVENT_NAMES = [
  "인천시장배 스타리그", "경기도민 한마음 스타대회", "삼성전자 KHAN 주최 아마추어 스타대회", "부산 해운대 e스포츠 페스티벌",
  "대전 과학도시 게임대축제", "광주 빛고을 스타 챔피언십", "대구 달구벌 PC방 연합대회", "KT 롤스터배 아마추어 오픈",
  "SK텔레콤 T1 팬 초청전", "전국 대학생 스타크래프트 대회", "청소년 e스포츠 꿈나무 대회", "강원 설악 겨울 스타대전",
  "제주 한라 스타 페스티벌", "CJ 엔투스 루키 발굴전", "웅진 스타즈 아마추어 챌린지", "수원 화성 PC방 대항전",
  "서울시장배 e스포츠 대회", "울산 공업도시 스타 리그", "전주 비빔 스타 챔피언십", "MBC게임 아마추어 열전",
];
/** 상금 (만원) 1·2·3위 */
export interface RookieEvent { id: number; name: string; day: number; size: 8 | 16; prize: [number, number, number]; level: Tier; registered?: boolean; result?: string; fee?: number }
/** 대회 참가 조건: 능력치 합 · (큰 대회는) 래더 점수 */
export function eventReq(e: Pick<RookieEvent, "level">): { total: number; ladder?: number } {
  const total = { newbie: 0, low: 2300, mid: 2700, high: 3100, elite: 3500, pro: 3900 }[e.level];
  return e.level === "elite" || e.level === "pro" ? { total, ladder: 1650 } : { total };
}
/** 래더 참가 조건: 공방 경기 수 · 능력치 합 */
export const LADDER_REQ = { games: 10, total: 2700 };

// ── 레벨 ───────────────────────────────────────────────────────
/** 다음 레벨까지 필요한 경험치 */
export const levelNeed = (lv: number) => 100 + (lv - 1) * 60;
export const MAX_LEVEL = 60;
/** 레벨이 오를 때마다 성장 한계도 조금씩 */
export const LEVEL_CAP_BONUS = 40;

// ── 클랜 ───────────────────────────────────────────────────────
export interface ClanDef {
  id: string; name: string; tag: string; tier: 1 | 2 | 3 | 4 | 5; desc: string;
  /** 입단 조건: 전체 경기 수 · 래더 경기 수 · 래더 점수 · 능력치 합 */
  req: { games: number; ladderGames: number; ladder: number; total: number };
  size: number;
  /** 소속(출신) 프로게이머 이름 (원작 선수 데이터에서 찾음) */
  pros: string[];
  /** 실제로 있던 클랜인지 (아니면 게임용으로 만든 클랜) */
  real?: boolean;
}
/**
 * 클랜: 실제 스타1 배틀넷(웨스트·아시아) 클랜과 그 클랜 출신 프로게이머, 그리고 게임에서 만든 클랜.
 * 클랜에 소속된 프로는 shared/rookie/pros.ts 의 clanProIds 가 정한다 (여기 pros 는 먼저 넣을 선수)
 */
const mk = (id: string, name: string, tag: string, tier: ClanDef["tier"], desc: string, req: [number, number, number, number], size: number, pros: string[] = [], real = false): ClanDef =>
  ({ id, name, tag, tier, desc, req: { games: req[0], ladderGames: req[1], ladder: req[2], total: req[3] }, size, pros, ...(real ? { real: true } : {}) });
export const CLANS: ClanDef[] = [
  // 1단계: 처음 시작하는 선수를 위해 게임에서 만든 클랜
  mk("pcbang", "동네PC방연합", "PCB", 1, "누구나 환영! 동네 형들이 모인 친목 클랜", [0, 0, 0, 0], 14),
  mk("newbie", "새싹스타", "SPR", 1, "초보끼리 같이 성장해요", [5, 0, 0, 2200], 12),
  mk("night", "야간작업반", "NGT", 1, "밤새 연습하는 올빼미들", [10, 0, 0, 2400], 14),
  mk("campus", "캠퍼스스타", "CMP", 1, "대학 동아리에서 시작한 친목 클랜", [15, 0, 0, 2500], 16),
  // 2단계
  mk("gm", "gm 길드", "gm", 2, "웨스트 서버의 오래된 길드 · 꾸준히 연습하는 중수들", [30, 5, 0, 2900], 18, [], true),
  mk("yg", "yG 길드", "yG", 2, "국내 대표 명문 길드 중 하나 · 클랜전이 활발", [40, 10, 1450, 3100], 20, [], true),
  mk("nexus", "Nexus", "NXS", 2, "프로토스 유저가 많은 신생 클랜", [35, 8, 1400, 3000], 18),
  mk("gateway", "Gateway", "GTW", 2, "게이트웨이 앞에서 모이던 동네 고수들", [45, 10, 1450, 3200], 18),
  mk("swarm", "Swarm", "SWM", 2, "저그 유저들이 모인 물량 클랜", [40, 8, 1450, 3300], 18),
  mk("bunker", "Bunker", "BKR", 2, "수비가 단단한 테란 클랜", [50, 12, 1500, 3300], 20),
  // 3단계
  mk("legend", "레전드", "LGD", 3, "이름처럼 전통 있는 명문 클랜", [60, 15, 1550, 3700], 20, [], true),
  mk("miracle", "Miracle", "Mc", 3, "2005년 창단 · 훗날 s2Mc의 뿌리가 된 클랜", [70, 20, 1600, 3800], 18, [], true),
  mk("kal", "KaL", "KaL", 3, "Siz 클랜이 갈라질 때 생긴 클랜 (Siz·KaL·By)", [80, 25, 1650, 3900], 18, [], true),
  mk("siz", "Siz", "Siz", 3, "Siz)FlaSh·Siz)FanTaSy가 쓰던 바로 그 클랜 · By의 뿌리", [90, 30, 1700, 4000], 20, [], true),
  mk("phoenix", "Phoenix", "PHX", 3, "불사조처럼 지고도 다시 일어나는 클랜", [70, 20, 1600, 3800], 18),
  mk("reaver", "Reaver", "RVR", 3, "리버 드랍이 특기인 견제 클랜", [80, 25, 1650, 4000], 18),
  mk("valkyrie", "Valkyrie", "VLK", 3, "공중전을 즐기는 클랜", [85, 25, 1650, 4100], 20),
  mk("ironwall", "철벽", "IRN", 3, "뚫리지 않는 수비로 유명한 클랜", [90, 30, 1700, 4100], 20),
  // 4단계
  mk("sg", "S.G", "S.G", 4, "2000년 전부터 이어진 가장 전통 있는 클랜 · 각종 대회 우승 단골", [120, 40, 1800, 4400], 24, ["박지호"], true),
  mk("fou", "fOu", "fOu", 4, "for Our utopia · 김정우·구성훈·조병세·이철민을 배출한 네임드 클랜", [140, 50, 1850, 4500], 22, ["조병세", "구성훈"], true),
  mk("nsp", "NsP", "NsP", 4, "대회 우승을 휩쓴 A급 클랜", [160, 60, 1900, 4600], 22, ["김대엽", "김성대", "신노열", "박대호"], true),
  mk("moo", "Moo", "Moo", 4, "아프리카TV 클랜리그 강호 · 이제동이 저그 라인을 지킨 클랜", [160, 60, 1900, 4600], 20, ["이제동"], true),
  mk("overlord", "Overlord", "OVL", 4, "하늘을 지배한다는 프라이드의 클랜", [150, 50, 1850, 4500], 22),
  mk("carrier", "Carrier", "CRR", 4, "후반 운영으로 이기는 클랜", [170, 60, 1900, 4700], 22),
  mk("dropship", "Dropship", "DRP", 4, "다양한 견제와 기습의 클랜", [170, 65, 1950, 4800], 22),
  // 5단계: 최상위 (프로게이머가 가장 많이 소속)
  mk("white", "WHITE", "WHITE", 5, "1998년 MiN 서버에서 시작한 명문 · 도재욱·김윤중 등 인기 전프로", [220, 80, 2000, 5000], 24, ["도재욱", "김윤중", "방태수"], true),
  mk("shield", "Shield", "Shield", 5, "Bisu[Shield]·Sea[Shield] · 김택용·염보성·김정우 '쉴드 삼대장'", [250, 90, 2050, 5100], 24, ["김택용", "염보성", "김정우"], true),
  mk("by", "By", "By", 5, "이영호·정명훈을 배출한 웨스트 최강 클랜 · 프로게이머만 20명 넘게", [300, 100, 2150, 5200], 28, ["이영호", "정명훈", "장윤철", "조일장", "박수범", "진영화", "황병영", "전태양", "김구현"], true),
  mk("zenith", "Zenith", "ZNT", 5, "정점을 노리는 신흥 강호", [260, 90, 2050, 5200], 24),
  mk("titan", "Titan", "TTN", 5, "프로게이머 지망생들의 최종 목적지", [280, 95, 2100, 5300], 26),
];
export const CLAN_BY_ID = Object.fromEntries(CLANS.map(c => [c.id, c])) as Record<string, ClanDef>;
/** 클랜원 수준 (능력치 합 범위) */
export const CLAN_STRENGTH: Record<ClanDef["tier"], [number, number]> = { 1: [2000, 3200], 2: [3000, 4100], 3: [3800, 4900], 4: [4600, 5600], 5: [5400, 6500] };
export interface ClanMember {
  /** 게임 아이디 (프로는 게임 아이디, 모르면 본명) */
  name: string;
  /** 프로의 본명 (아이디와 다를 때) */
  real?: string;
  race: Race; stats: Stats; points: number; pro?: { id: number; team: number }; w?: number; l?: number;
  /** 직책: 길드장 · 부길드장 (없으면 일반) */
  role?: "master" | "sub";
}
/** 친분도 단계 */
export const FRIEND_LEVELS: Array<[number, string, string]> = [[0, "처음 보는 사이", "🙂"], [10, "아는 사이", "😀"], [30, "친한 사이", "😄"], [60, "절친", "🤝"], [90, "의형제", "💞"]];
export const friendLevel = (n: number) => [...FRIEND_LEVELS].reverse().find(l => n >= l[0])!;
/** 클랜 재시험 대기 (일) */
export const CLAN_RETRY_DAYS = 7;

/** 클랜 아이디 표기: 아이디[태그] */
export const withTag = (name: string, tag?: string) => (tag ? `${name}[${tag}]` : name);

/**
 * 클랜원 명단 (클랜마다 늘 같은 명단, 아이디는 클랜 안에서 겹치지 않음)
 * proIds: 이 클랜에 소속된 프로 (원작 선수 번호) — 능력치·본명은 부르는 쪽에서 채움
 */
export function clanRoster(c: ClanDef, proIds: number[]): ClanMember[] {
  let seed = [...c.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const [lo, hi] = CLAN_STRENGTH[c.tier];
  const used = new Set<string>();
  const out: ClanMember[] = [];
  for (let i = 0; i < c.size - proIds.length; i++) {
    const total = Math.round(lo + rnd() * (hi - lo));
    const points = Math.round(rnd() * 300 * c.tier);
    out.push({ name: nickname(rnd, used), race: RACES[Math.floor(rnd() * 3)], stats: statsAround(total, rnd), points, w: Math.round(points / 10 + rnd() * 10), l: Math.round(rnd() * 12 + points / 25) });
  }
  for (const id of proIds) {
    const points = Math.round(400 * c.tier + rnd() * 400);
    out.push({ name: `pro${id}`, race: "terran", stats: {} as Stats, points, pro: { id, team: -1 }, w: Math.round(points / 9), l: Math.round(points / 40) });
  }
  return out;
}

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
  /** 이번 시즌 프로리그 전적 (시즌 우승 확률) */
  seasonW?: number;
  seasonL?: number;
  /** 계약 끝나는 날 (그 다음 날 연봉 협상) */
  contractUntil?: number;
}

/** 같은 시기에 시작한 라이벌 (AI, 같이 성장) */
export interface Rival {
  name: string;
  race: Race;
  concept: Concept;
  stats: Stats;
  status: Status;
  team?: number;
  squad?: 1 | 2;
  semiproUntil?: number;
  /** 나와의 상대 전적 (내 기준) */
  w: number;
  l: number;
}
/** 슬럼프 · 각성 */
export interface Form { kind: "slump" | "awake"; until: number }
export interface FanPost { day: number; author: string; text: string; likes: number; src: "cafe" | "sns"; mood: "good" | "bad" | "neutral" }
/** 연봉 협상 (구단 제시액 · 남은 협상 · 기한) */
export interface Nego { offer: number; rounds: number; until: number; max: number; old: number }
export interface Counts {
  lobbyW: number; ladderW: number; proBeaten: number; eventWins: number; proW: number;
  mentors: number; rivalW: number; awakenings: number; bestStreak: number; raises: number;
}
export const emptyCounts = (): Counts => ({ lobbyW: 0, ladderW: 0, proBeaten: 0, eventWins: 0, proW: 0, mentors: 0, rivalW: 0, awakenings: 0, bestStreak: 0, raises: 0 });

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
  rival: Rival;
  /** 연승(+) · 연패(-) */
  streak: number;
  form?: Form;
  /** 마지막 멘토 과외 날 */
  mentorDay?: number;
  fanCafe: { members: number; posts: FanPost[] };
  /** 업적 (id → 달성한 날) */
  achievements: Record<string, number>;
  /** 이름 옆에 다는 칭호 (업적 id) */
  title?: string;
  counts: Counts;
  nego?: Nego;
  /** 자유계약 (FA): 이 날까지 구단을 못 찾으면 준프로로 */
  fa?: { until: number };
  level: number;
  exp: number;
  /** 날짜별 능력치 합 (그래프) */
  history: Array<[number, number]>;
  clan?: {
    id: string; joined: number; points: number; w: number; l: number; members: ClanMember[];
    /** 클랜원별 상대 전적 [내 승, 내 패] */
    vs?: Record<string, [number, number]>;
    /** 클랜원별 친분도 0~100 */
    fr?: Record<string, number>;
    /** 클랜원에게 진 경기에서 떨어진 능력치 (피드백으로 일부 되찾음) */
    fb?: { lost: Partial<Stats>; from: string };
  };
  /** 공방에서 마지막으로 고른 방·맵 */
  lobbyPref?: { tier: Tier; mapId: number };
  /** 이번 달 래더 맵 5개 (month = 연*12+월) 와 그중 내가 고른 맵 */
  ladderMaps?: { month: number; maps: number[]; sel: number[] };
  /** 맵별 출전 횟수 (맵 이해도) */
  mapGames?: Record<number, number>;
  /** 클랜 입단 시험 본 날 (재시험 대기) */
  clanTried: Record<string, number>;
}

// ── 업적 · 칭호 ─────────────────────────────────────────────────
export interface Achievement { id: string; name: string; desc: string; title: string; icon: string; check: (s: RookieState) => boolean }
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_win", icon: "🐣", name: "첫 승리", desc: "아무 경기에서나 처음 이기기", title: "새내기", check: s => s.record.w >= 1 },
  { id: "lobby_100", icon: "🎮", name: "공방 100승", desc: "공방에서 100번 이기기", title: "공방 터줏대감", check: s => s.counts.lobbyW >= 100 },
  { id: "streak_10", icon: "🔥", name: "10연승", desc: "10판 연속으로 이기기", title: "연승 머신", check: s => s.counts.bestStreak >= 10 },
  { id: "ladder_a", icon: "🅰️", name: "래더 A", desc: "래더 2000점 달성", title: "래더 강자", check: s => s.ladder.best >= 2000 },
  { id: "ladder_s", icon: "👑", name: "래더 S", desc: "래더 2200점 달성", title: "래더 황제", check: s => s.ladder.best >= 2200 },
  { id: "beat_pro", icon: "🎯", name: "프로 사냥", desc: "래더에서 프로게이머 꺾기", title: "프로 사냥꾼", check: s => s.counts.proBeaten >= 1 },
  { id: "event_win", icon: "🏆", name: "첫 대회 우승", desc: "이벤트 대회에서 우승", title: "동네 챔피언", check: s => s.counts.eventWins >= 1 },
  { id: "event_3", icon: "🏅", name: "대회 3관왕", desc: "이벤트 대회 3번 우승", title: "대회 사냥꾼", check: s => s.counts.eventWins >= 3 },
  { id: "courage", icon: "🎓", name: "커리지 매치 우승", desc: "준프로 자격 얻기", title: "준프로", check: s => s.titles.some(t => t.includes("커리지 매치 우승")) },
  { id: "pro", icon: "🏢", name: "프로 입단", desc: "프로 구단에 입단", title: "프로게이머", check: s => s.titles.some(t => t.includes("입단")) },
  { id: "squad1", icon: "⬆️", name: "1군 승격", desc: "승강전에서 이겨 1군으로", title: "1군 멤버", check: s => s.team?.squad === 1 },
  { id: "pl_10", icon: "🏟️", name: "프로리그 10승", desc: "프로리그에서 10번 이기기", title: "에이스", check: s => s.counts.proW >= 10 },
  { id: "viewers_500", icon: "📺", name: "인기 방송", desc: "방송 시청자 500명", title: "인기 BJ", check: s => s.stream.best >= 500 },
  { id: "cafe_1000", icon: "💌", name: "팬카페 1000명", desc: "팬카페 회원 1000명", title: "스타", check: s => s.fanCafe.members >= 1000 },
  { id: "rival_10", icon: "⚡", name: "라이벌 제압", desc: "라이벌을 10번 이기기", title: "라이벌 킬러", check: s => s.counts.rivalW >= 10 },
  { id: "awaken", icon: "🦅", name: "각성", desc: "슬럼프를 이겨내고 각성", title: "불사조", check: s => s.counts.awakenings >= 1 },
  { id: "mentor_10", icon: "📚", name: "모범생", desc: "멘토 과외 10번", title: "모범생", check: s => s.counts.mentors >= 10 },
  { id: "raise", icon: "💼", name: "연봉 인상", desc: "연봉 협상에서 월급 올리기", title: "협상의 달인", check: s => s.counts.raises >= 1 },
  { id: "rich", icon: "💰", name: "부자 게이머", desc: "돈 1000만원 모으기", title: "재벌 게이머", check: s => s.money >= 1000 },
  { id: "stat_5000", icon: "💪", name: "괴물 신인", desc: "능력치 합 5000", title: "괴물 신인", check: s => sumStats(s.stats) >= 5000 },
  { id: "clan", icon: "🛡️", name: "클랜 가입", desc: "클랜 입단 시험 통과", title: "클랜원", check: s => !!s.clan },
  { id: "clan_top", icon: "🏰", name: "명문 클랜", desc: "4단계 이상 클랜 가입", title: "명문 클랜원", check: s => !!s.clan && (CLAN_BY_ID[s.clan.id]?.tier ?? 0) >= 4 },
  { id: "level_20", icon: "⭐", name: "레벨 20", desc: "선수 레벨 20 달성", title: "베테랑", check: s => s.level >= 20 },
  { id: "pl_champ", icon: "🏆", name: "프로리그 우승", desc: "소속팀 프로리그 시즌 우승", title: "우승 멤버", check: s => s.titles.some(t => t.includes("프로리그") && t.includes("우승")) },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a])) as Record<string, Achievement>;

/** 멘토 과외 가격 (만원): 같은 팀 선배는 싸게 */
export const MENTOR_PRICE = { outside: 20, teammate: 8 };

/** 랭킹 보드 정렬 기준 */
export const RANK_SORTS = { ladder: "래더", total: "능력치", fame: "인지도", badges: "업적" } as const;
export type RankSort = keyof typeof RANK_SORTS;

/** 지금 성장 한계 */
export function capOf(s: Pick<RookieState, "status" | "team"> & { level?: number }): number {
  const lv = ((s.level ?? 1) - 1) * LEVEL_CAP_BONUS;
  if (s.status === "pro") return (s.team?.squad === 1 ? STAT_CAP.pro1 : STAT_CAP.pro2) + lv;
  return (s.status === "semipro" ? STAT_CAP.semipro : STAT_CAP.amateur) + lv;
}

/** 맵 이해도 (0~55): 출전 횟수가 쌓일수록 올라 불리한 종족전 맵의 불리함을 줄여 줌 */
export const MAP_UND_MAX = 55;
export const mapUnd = (s: Pick<RookieState, "mapGames">, mapId: number) => Math.min(MAP_UND_MAX, Math.floor((s.mapGames?.[mapId] ?? 0) * 1.5));
