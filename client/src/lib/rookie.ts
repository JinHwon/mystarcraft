import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ACH_BY_ID, type RookieState } from "@shared/rookie/model";

export type RookieToday = { courage: boolean; draft: boolean; proleague: boolean; promo: boolean; events: number[]; status: string; grade: string; cap: number };

/** 선수 키우기 세이브 */
export function useRookie() {
  const q = trpc.rookie.get.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  return { state: (q.data?.state ?? null) as RookieState | null, today: (q.data?.today ?? null) as RookieToday | null, loading: q.isLoading };
}

/** 선수 키우기를 쓸 수 있는지 (공개 전에는 관리자만) */
export function useRookieAccess() {
  const q = trpc.rookie.access.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false, retry: false });
  return { allowed: !!q.data?.allowed, open: !!q.data?.open, loading: q.isLoading };
}

/** 변경 결과(새 상태)를 캐시에 바로 반영 */
export function useRookieSync() {
  const utils = trpc.useUtils();
  return {
    onSuccess: (r: { state: RookieState; today: RookieToday; gained?: string[] }) => {
      utils.rookie.get.setData(undefined, { state: r.state, today: r.today });
      // 새 업적
      for (const id of r.gained ?? []) {
        const a = ACH_BY_ID[id];
        if (a) toast.success(`${a.icon} 업적 달성: ${a.name}`, { description: `칭호 「${a.title}」 획득 · 인지도 +10` });
      }
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
}
