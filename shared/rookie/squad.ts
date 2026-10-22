/**
 * 선수 키우기: 팀 내 입지 (코치 신뢰도·역할), 에이전트, 계약 조건, 임대 (FM 의 선수 경력 관리처럼)
 */

export type Role = "ace" | "starter" | "rotation" | "backup";
export const ROLES: Record<Role, { name: string; icon: string; entry: number; desc: string }> = {
  ace: { name: "에이스", icon: "⭐", entry: 1, desc: "팀이 가장 믿는 카드. 프로리그 엔트리에 항상 듭니다" },
  starter: { name: "주전", icon: "🟢", entry: 0.85, desc: "대부분의 경기에 나갑니다" },
  rotation: { name: "로테이션", icon: "🔄", entry: 0.5, desc: "상대·맵에 따라 나갑니다 (절반쯤)" },
  backup: { name: "후보", icon: "🪑", entry: 0.18, desc: "주전이 빠질 때만 기회가 옵니다" },
};

/**
 * 1군 안에서의 역할: 나보다 확실히 강한 1군 동료 수(rank)와 코치 신뢰도(0~100)로
 * - 에이스: 나보다 강한 동료가 없고 신뢰 60 이상
 * - 주전: 강한 동료 3명 미만이거나 신뢰 78 이상
 * - 로테이션: 강한 동료 6명 미만이거나 신뢰 55 이상
 */
export function roleOf(rank: number, trust: number): Role {
  if (rank === 0 && trust >= 60) return "ace";
  if (rank < 3 || trust >= 78) return "starter";
  if (rank < 6 || trust >= 55) return "rotation";
  return "backup";
}

/** 출전 보장 조항·면담 약속이 있으면 엔트리 확률이 이만큼 더 */
export const PROMISE_BONUS = 0.3;
/** 출전 보장 조항: 한 달 프로리그 출전이 이보다 적으면 약속 위반 */
export const PROMISE_MIN = 2;

export interface AgentDef { tier: 1 | 2 | 3; name: string; fame: number; hire: number; fee: number; nego: number; offers: number; desc: string }
export const AGENTS: AgentDef[] = [
  { tier: 1, name: "동네 에이전트", fame: 40, hire: 30, fee: 0.05, nego: 0.1, offers: 1.3, desc: "연봉 협상 한도 +10% · 제안 1.3배 · 수수료 월급의 5%" },
  { tier: 2, name: "중견 에이전시", fame: 180, hire: 120, fee: 0.08, nego: 0.2, offers: 1.6, desc: "연봉 협상 한도 +20% · 제안 1.6배 · 수수료 8%" },
  { tier: 3, name: "톱 에이전시", fame: 400, hire: 300, fee: 0.12, nego: 0.3, offers: 2.0, desc: "연봉 협상 한도 +30% · 제안 2배 · 수수료 12%" },
];
export const agentOf = (s: { agent?: { tier: 1 | 2 | 3 } }) => (s.agent ? AGENTS[s.agent.tier - 1] : undefined);

/** 계약 조건 */
export type Clause = "none" | "promise" | "bonus";
export const CLAUSES: Record<Clause, { name: string; desc: string; salary: number }> = {
  none: { name: "기본 계약", desc: "월급만", salary: 1 },
  promise: { name: "출전 보장", desc: "1군이면 프로리그 엔트리 확률 +30% · 한 달 2경기 미만이면 약속 위반 (자유롭게 이적 요청) · 월급 10% 낮춤", salary: 0.9 },
  bonus: { name: "승리 수당", desc: "프로리그 1승마다 월급의 25% 추가 · 월급 5% 낮춤", salary: 0.95 },
};

/** 면담(출전 요구) 다시 할 수 있기까지 (일) */
export const TALK_COOLDOWN = 14;
/** 임대 기간 (일) */
export const LOAN_DAYS = 60;
