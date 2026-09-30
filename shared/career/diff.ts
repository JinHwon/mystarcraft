/**
 * 서버가 돌려주는 세이브 변경분: 바뀐 최상위 항목(set), 없어진 항목(del),
 * 큰 배열(선수·경기)은 바뀐 원소만(items) + 새 길이(len)
 */
import type { CareerState } from "./rules";

export interface CareerDiff {
  set: Record<string, unknown>;
  del: string[];
  items: Record<string, Array<[number, unknown]>>;
  len: Record<string, number>;
}

/** 변경분을 적용한 새 세이브 (원본은 그대로) */
export function applyDiff(old: CareerState, d: CareerDiff): CareerState {
  const s = { ...old } as unknown as Record<string, unknown>;
  for (const k of d.del) delete s[k];
  for (const [k, v] of Object.entries(d.set)) {
    // 진행 중 경기: 지난 세트 해설은 이미 가진 것을 유지
    if (k === "live" && v && s.live) {
      const prev = s.live as NonNullable<CareerState["live"]>, next = v as NonNullable<CareerState["live"]>;
      s.live = { ...next, sets: next.sets.map((x, i) => (x.timeline || !prev.sets[i] ? x : { ...x, timeline: prev.sets[i].timeline })) };
    } else s[k] = v;
  }
  for (const k of new Set([...Object.keys(d.items), ...Object.keys(d.len)])) {
    const arr = [...((s[k] as unknown[]) ?? [])];
    for (const [i, v] of d.items[k] ?? []) arr[i] = v;
    if (d.len[k] !== undefined) arr.length = d.len[k];
    s[k] = arr;
  }
  return s as unknown as CareerState;
}
