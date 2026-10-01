/**
 * 관전 화면용 선수 상태: 주가 끝난 뒤의 세이브에는 이번 주 개인리그·포스트시즌 결과(컨디션·능력치·우승 기록)가
 * 이미 들어 있으므로, 보고 있는 경기 직전 상태로 되돌려 보여준다 (아직 안 본 결과가 미리 드러나지 않게)
 * - 서버가 경기마다 직전 상태(pre)를 보내고, 세트마다 바뀐 컨디션·능력치(fx)를 더해 간다
 */
import type { CareerState, PlayerSnap, SetResult } from "@shared/career/rules";
import { STAT_KEYS } from "@shared/gameConstants";

export type SnapReport = { sets: SetResult[]; pre?: Record<number, PlayerSnap> };

/** pre 에서 앞의 n세트 결과를 더한 상태 */
function after(pre: PlayerSnap, sets: SetResult[], n: number, id: number): PlayerSnap {
  let cond = pre.cond;
  const stats = { ...pre.stats };
  for (const x of sets.slice(0, n)) {
    const fx = x.a === id ? x.fx?.a : x.b === id ? x.fx?.b : undefined;
    if (!fx) continue;
    cond = fx.cond[1];
    for (const k of STAT_KEYS) stats[k] += fx.stats?.[k] ?? 0;
  }
  return { ...pre, cond, stats };
}

/** reports[k] 의 j세트 직전 (k 가 끝이면 지금 세이브 그대로) */
export function viewStateAt(s: CareerState, reports: SnapReport[], k: number, j = 0): CareerState {
  if (k >= reports.length || !reports.some(r => r.pre)) return s;
  const view = new Map<number, PlayerSnap>();
  const fixed = new Set<number>();
  reports.forEach((r, idx) => {
    if (!r.pre) return;
    for (const [key, pre] of Object.entries(r.pre)) {
      const id = Number(key);
      if (idx < k) { view.set(id, after(pre, r.sets, r.sets.length, id)); fixed.add(id); }
      else if (idx === k) { view.set(id, after(pre, r.sets, j, id)); fixed.add(id); }
      else if (!fixed.has(id) && !view.has(id)) view.set(id, pre);
    }
  });
  const wk = `${s.season}-${s.week}`;
  const players = s.players.map(p => {
    const v = view.get(p.id);
    return v ? { ...p, cond: v.cond, stats: v.stats, titles: v.titles ?? [], burst: v.burst ? { week: wk, mul: v.burst } : undefined } : p;
  });
  return { ...s, players };
}
