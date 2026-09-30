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

export interface CareerPatch {
  money: number;
  inventory: Record<string, number>;
  ledger?: CareerState["ledger"];
  player?: CareerState["players"][number];
}
/** 서버가 돌려준 바뀐 부분만 캐시에 반영 (세이브 전체를 다시 받지 않음) */
export function useCareerPatch() {
  const utils = trpc.useUtils();
  return (patch: CareerPatch) => utils.career.get.setData(undefined, old => {
    if (!old?.state) return old;
    const s = structuredClone(old.state) as CareerState;
    s.teams[s.myTeam].money = patch.money;
    s.inventory = patch.inventory;
    if (patch.ledger) s.ledger = patch.ledger;
    if (patch.player) s.players[patch.player.id] = patch.player;
    return { state: s };
  });
}
