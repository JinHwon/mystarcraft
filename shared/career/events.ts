/**
 * 운영 이벤트 (관리자가 켜고 끔). DB 의 이벤트 종류를 커리어 모드 효과로 쓴다
 */
export type CareerEventType = "exp_double" | "fatigue_unlimited" | "gold_double" | "stat_boost";

export const EVENT_INFO: Record<CareerEventType, { label: string; icon: string; desc: string }> = {
  exp_double: { label: "경험치 2배", icon: "⭐", desc: "우리 선수가 경기·레벨업으로 얻는 경험치 2배" },
  gold_double: { label: "수당 2배", icon: "💰", desc: "프로리그 승리·패배 수당(메인 스폰서) 2배" },
  fatigue_unlimited: { label: "컨디션 유지", icon: "⚡", desc: "경기를 뛰어도 우리 선수 컨디션이 떨어지지 않음" },
  stat_boost: { label: "훈련 효과 2배", icon: "💪", desc: "훈련·특별 훈련의 능력치 상승 2배" },
};
