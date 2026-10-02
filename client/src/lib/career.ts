import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { CareerState } from "@shared/career/rules";
import { applyDiff, type CareerDiff } from "@shared/career/diff";

/** 커리어 세이브 조회 */
export function useCareer() {
  // 화면 캐시는 서버 변경분으로 계속 맞춰지므로, 앱 전환 때마다 세이브 전체를 다시 받지 않음
  // structuralSharing 끔: 변경분 적용(applyDiff)이 이미 바뀌지 않은 부분의 참조를 유지하므로, 매번 세이브 전체를 깊게 비교할 필요가 없음
  const q = trpc.career.get.useQuery(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false, structuralSharing: false });
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

/**
 * 관리자가 세이브를 고치면 (돈·아이템 지급 등) 열려 있는 화면도 곧바로 다시 받음
 * 가벼운 번호(career.rev)만 15초마다·화면으로 돌아올 때 묻고, 바뀌었을 때만 세이브 전체를 받는다
 */
export function useCareerRevWatch(enabled: boolean) {
  const utils = trpc.useUtils();
  const q = trpc.career.rev.useQuery(undefined, { enabled, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 0 });
  const last = useRef<number | null>(null);
  const rev = q.data?.rev;
  useEffect(() => {
    if (rev === undefined) return;
    if (last.current !== null && last.current !== rev) void utils.career.get.invalidate();
    last.current = rev;
  }, [rev]);
}
