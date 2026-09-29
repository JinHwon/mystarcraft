import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { CareerState } from "@shared/career/rules";

/** 커리어 세이브 조회 */
export function useCareer() {
  const q = trpc.career.get.useQuery(undefined, { staleTime: 30_000 });
  return { state: (q.data?.state ?? null) as CareerState | null, loading: q.isLoading };
}

/** 커리어 변경 결과(state)로 캐시를 바로 갱신하는 공통 처리 */
export function useCareerUpdater() {
  const utils = trpc.useUtils();
  return {
    onSuccess: (r: { state: CareerState }) => utils.career.get.setData(undefined, { state: r.state }),
    onError: (e: { message: string }) => toast.error(e.message),
  };
}
