/**
 * 로그인한 사용자가 바뀌면 (로그아웃 → 다른 아이디로 로그인) 이전 사용자의 화면 데이터를 모두 지움
 * - 서버 데이터 캐시(세이브·랭킹 등), 관전 중이던 경기, 엔트리 편성 임시 저장, 본 세트 기록
 * - 지우지 않으면 새 사용자에게 이전 사용자의 구단이 보이고, 그 위에 변경분이 잘못 적용될 수 있음
 */
import type { QueryClient } from "@tanstack/react-query";

export const USER_CHANGE_EVENT = "mysc-user-change";

export function resetUserSession(queryClient: QueryClient) {
  // 로그인 정보(auth.me)는 남기고 나머지 서버 데이터 캐시를 비움
  queryClient.removeQueries({ predicate: q => !JSON.stringify(q.queryKey).includes('"auth"') });
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("mysc-") && k !== "mysc-chunk-reload") sessionStorage.removeItem(k);
  } catch { /* 저장소를 못 써도 진행 */ }
  window.dispatchEvent(new Event(USER_CHANGE_EVENT));
}
