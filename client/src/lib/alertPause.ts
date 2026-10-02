/**
 * 관전 중(우리 경기·포스트시즌·개인리그)에는 상단 알림 팝업·뱃지를 잠시 멈춤
 * 관전을 마치고 화면을 나오면 그동안 생긴 제안 등이 그때 뜬다
 */
import { useEffect, useSyncExternalStore } from "react";

let paused = false;
const subs = new Set<() => void>();
const set = (v: boolean) => { if (paused !== v) { paused = v; subs.forEach(f => f()); } };

export function useAlertsPaused(): boolean {
  return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => paused);
}

/** 이 화면이 떠 있는 동안 (on 이면) 알림을 멈춤 */
export function usePauseAlerts(on: boolean) {
  useEffect(() => {
    set(on);
    return () => set(false);
  }, [on]);
}
