import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { RookieState } from "@shared/rookie/model";

export type RookieToday = { courage: boolean; draft: boolean; proleague: boolean; promo: boolean; events: number[]; status: string; grade: string; cap: number };

/** 선수 키우기 세이브 */
export function useRookie() {
  const q = trpc.rookie.get.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  return { state: (q.data?.state ?? null) as RookieState | null, today: (q.data?.today ?? null) as RookieToday | null, loading: q.isLoading };
}

/** 변경 결과(새 상태)를 캐시에 바로 반영 */
export function useRookieSync() {
  const utils = trpc.useUtils();
  return {
    onSuccess: (r: { state: RookieState; today: RookieToday }) => utils.rookie.get.setData(undefined, { state: r.state, today: r.today }),
    onError: (e: { message: string }) => toast.error(e.message),
  };
}
