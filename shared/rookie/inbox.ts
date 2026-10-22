/**
 * 선수 키우기: 메일함 (FM 의 받은 편지함처럼)
 * 코치·에이전트·기자·팬·클랜·가족·스폰서·라이벌이 메일을 보내고, 답장(선택)에 따라 사기·인지도·돈·능력치·성격이 달라진다
 */

export type MailFrom = "coach" | "agent" | "media" | "fan" | "clan" | "family" | "sponsor" | "rival" | "friend" | "system";
export const MAIL_FROM: Record<MailFrom, { icon: string; name: string }> = {
  coach: { icon: "🧢", name: "코치" },
  agent: { icon: "💼", name: "에이전트" },
  media: { icon: "📰", name: "기자" },
  fan: { icon: "💌", name: "팬" },
  clan: { icon: "🛡️", name: "클랜" },
  family: { icon: "🏠", name: "가족" },
  sponsor: { icon: "🤝", name: "스폰서" },
  rival: { icon: "⚡", name: "라이벌" },
  friend: { icon: "👥", name: "친구" },
  system: { icon: "📢", name: "알림" },
};

export interface MailChoice { id: string; label: string; /** 고르기 전에 보이는 짧은 설명 (결과를 다 알려주지는 않음) */ hint?: string }
export interface Mail {
  id: number;
  day: number;
  from: MailFrom;
  sender: string;
  title: string;
  body: string;
  /** 만든 틀 (선택 처리용) */
  tpl?: string;
  /** 틀이 기억해 둘 값 (능력치·상대 이름 등) */
  data?: Record<string, string | number>;
  choices?: MailChoice[];
  /** 이 날까지 답하지 않으면 자동으로 마지막 선택 */
  until?: number;
  picked?: string;
  /** 답장 결과 */
  result?: string;
  read?: boolean;
}

/** 답을 기다리는 메일 */
export const pendingMail = (m: Mail) => !!m.choices?.length && !m.picked;
export const unreadCount = (inbox: Mail[] | undefined) => (inbox ?? []).filter(m => !m.read || pendingMail(m)).length;
