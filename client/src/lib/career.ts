import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { CareerState } from "@shared/career/rules";
import { applyDiff, type CareerDiff } from "@shared/career/diff";

/** 커리어 세이브 조회 */
export function useCareer() {
  // 화면 캐시는 서버 변경분으로 계속 맞춰지므로, 앱 전환 때마다 세이브 전체를 다시 받지 않음
  const q = trpc.career.get.useQuery(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  return { state: (q.data?.state ?? null) as CareerState | null, loading: q.isLoading };
}

/** 서버가 돌려준 변경분(diff)을 캐시에 반영 (세이브 전체를 다시 받지 않음) */
export function useCareerPatch() {
  const utils = trpc.useUtils();
  return (diff: CareerDiff) => utils.career.get.setData(undefined, old => (old?.state ? { state: applyDiff(old.state as CareerState, diff) } : old));
}

/** 커리어 변경 결과(state 또는 diff)로 캐시를 바로 갱신하는 공통 처리 */
export function useCareerUpdater() {
  const utils = trpc.useUtils();
  const patch = useCareerPatch();
  return {
    onSuccess: (r: { state?: CareerState; diff?: CareerDiff }) => {
      if (r.state) utils.career.get.setData(undefined, { state: r.state });
      else if (r.diff) patch(r.diff);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
}
