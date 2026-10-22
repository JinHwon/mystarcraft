/**
 * 선수 키우기: 살아있는 세계 (또래 선수들도 크고 이적하고 입단함), 시즌 목표, 명예의 전당·후배 이어하기
 */
import type { Race } from "../career/rules";

/** 같은 세대 또래 선수 (나와 함께 크는 경쟁자들) */
export interface Peer {
  id: number;
  name: string;
  race: Race;
  /** 능력치 합 */
  total: number;
  /** 크는 속도 (주마다 대략 이만큼) */
  pot: number;
  status: "amateur" | "semipro" | "pro";
  team?: number;
  squad?: 1 | 2;
  fame: number;
  /** 우승 횟수 */
  titles: number;
  /** 괴물 유망주 */
  star?: boolean;
  /** 세계에 처음 나온 날 */
  since: number;
}
export interface WorldNews { day: number; icon: string; text: string }
export interface World { peers: Peer[]; news: WorldNews[]; nextId: number }

/** 또래 성장 한계 (신분별, 내 한계와 같은 기준) */
export const PEER_CAP = { amateur: 4800, semipro: 5300, pro2: 6300, pro1: 7600 } as const;

// ── 시즌 목표 ────────────────────────────────────────────────────
export type GoalKind = "ladder" | "wins" | "semipro" | "clan" | "rating" | "podium" | "pro" | "squad1" | "proW" | "mom" | "starter";
export interface Goal { kind: GoalKind; text: string; target: number; done?: boolean; reward: { fame: number; money: number; exp: number } }
/** 해마다 시작할 때의 기준값 (진행도 계산용) */
export interface GoalBase { ladderBest: number; wins: number; proW: number; podiums: number }
export interface Goals { year: number; list: Goal[]; base: GoalBase; graded?: boolean }

/** 연말 평가 등급 */
export const goalGrade = (done: number, n: number) => (n === 0 ? "-" : done === n ? "A" : done >= n - 1 ? "B" : done >= 1 ? "C" : "D");

// ── 명예의 전당 ──────────────────────────────────────────────────
export interface HofEntry {
  name: string;
  race: Race;
  /** 경력 점수 */
  score: number;
  /** 최고 능력치 합 · 우승 · 프로리그 승 · 인지도 · 업적 · 뛴 햇수 · 마지막 신분 */
  peak: number; titles: number; proW: number; fame: number; badges: number; years: number; status: string;
  team?: number;
  /** 선배 이름 (후배로 이어 했으면) */
  from?: string;
}
/** 경력 점수: 최고 능력치·우승·프로리그 승·인지도·업적·뛴 햇수 */
export function legacyScore(e: Omit<HofEntry, "score" | "name" | "race" | "status" | "team" | "from">) {
  return Math.round(Math.max(0, e.peak - 2500) / 10 + e.titles * 40 + e.proW * 6 + e.fame / 4 + e.badges * 8 + e.years * 15);
}
/** 후배에게 물려주는 것: 돈 20% (최대 300만), 인지도 10%, 선배의 조언 (성격 하나 공개 · 프로의식 +1) */
export const LEGACY_MONEY = { rate: 0.2, max: 300 };
export const LEGACY_FAME = 0.1;
/** 은퇴는 데뷔 1년이 지나야 */
export const RETIRE_MIN_DAYS = 365;
