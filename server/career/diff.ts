/** 세이브 변경분 계산 (응답을 작게: 바뀐 항목과 바뀐 선수·경기만) */
import type { CareerState } from "@shared/career/rules";
import type { CareerDiff } from "@shared/career/diff";

// ── 바뀐 부분만 주고받기 ─────────────────────────────────────────
/** 원소 단위로 비교하는 큰 배열 */
const ARRAY_KEYS = ["players", "matches"] as const;
type Snapshot = { keys: Map<string, string>; arrays: Record<string, string[]> };

export function snapshot(s: CareerState): Snapshot {
  const keys = new Map<string, string>();
  const arrays: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(s)) {
    if ((ARRAY_KEYS as readonly string[]).includes(k)) arrays[k] = (v as unknown[]).map(x => JSON.stringify(x));
    else keys.set(k, JSON.stringify(v));
  }
  return { keys, arrays };
}

export function diffOf(before: Snapshot, s: CareerState): CareerDiff {
  const d: CareerDiff = { set: {}, del: [], items: {}, len: {} };
  const rec = s as unknown as Record<string, unknown>;
  for (const k of new Set([...before.keys.keys(), ...Object.keys(s)])) {
    if ((ARRAY_KEYS as readonly string[]).includes(k)) continue;
    if (rec[k] === undefined) { if (before.keys.has(k)) d.del.push(k); continue; }
    if (before.keys.get(k) !== JSON.stringify(rec[k])) d.set[k] = rec[k];
  }
  for (const k of ARRAY_KEYS) {
    const arr = s[k] as unknown[], old = before.arrays[k] ?? [];
    const items: Array<[number, unknown]> = [];
    arr.forEach((x, i) => { if (old[i] !== JSON.stringify(x)) items.push([i, x]); });
    if (items.length) d.items[k] = items;
    if (arr.length !== old.length) d.len[k] = arr.length;
  }
  // 진행 중 경기: 지난 세트 해설은 화면이 이미 갖고 있으므로 마지막 세트만 통째로
  const live = d.set.live as CareerState["live"];
  if (live) d.set.live = { ...live, sets: live.sets.map((x, k, all) => (k === all.length - 1 ? x : { ...x, timeline: undefined })) };
  return d;
}

