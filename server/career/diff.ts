/** 세이브 변경분 계산 (응답을 작게: 바뀐 항목과 바뀐 선수·경기만) */
import type { CareerState } from "@shared/career/rules";
import type { CareerDiff } from "@shared/career/diff";

// ── 바뀐 부분만 주고받기 ─────────────────────────────────────────
/** 원소 단위로 비교하는 큰 배열 */
const ARRAY_KEYS = ["players", "matches"] as const;
/** 원소 안에서도 바뀐 필드만 보내는 배열 */
const FIELD_KEYS: ReadonlySet<string> = new Set(["players"]);
export type Snapshot = { keys: Map<string, string>; arrays: Record<string, string[]> };

export function snapshot(s: CareerState): Snapshot {
  const keys = new Map<string, string>();
  const arrays: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(s)) {
    if ((ARRAY_KEYS as readonly string[]).includes(k)) arrays[k] = (v as unknown[]).map(x => JSON.stringify(x));
    else keys.set(k, JSON.stringify(v));
  }
  return { keys, arrays };
}

/**
 * 변경분과 변경 뒤 스냅샷 (다음 요청의 비교 기준으로 재사용 → 요청마다 세이브 전체를 한 번만 JSON 으로 바꿈)
 */
export function diffOf(before: Snapshot, s: CareerState): CareerDiff & { after: Snapshot } {
  const d: CareerDiff = { set: {}, del: [], items: {}, len: {} };
  const after: Snapshot = { keys: new Map(), arrays: {} };
  const rec = s as unknown as Record<string, unknown>;
  for (const k of new Set([...before.keys.keys(), ...Object.keys(s)])) {
    if ((ARRAY_KEYS as readonly string[]).includes(k)) continue;
    if (rec[k] === undefined) { if (before.keys.has(k)) d.del.push(k); continue; }
    const j = JSON.stringify(rec[k]);
    after.keys.set(k, j);
    if (before.keys.get(k) !== j) d.set[k] = rec[k];
  }
  for (const k of ARRAY_KEYS) {
    const arr = s[k] as unknown[], old = before.arrays[k] ?? [];
    const items: Array<[number, unknown]> = [];
    const fields: Array<[number, Record<string, unknown>, string[]?]> = [];
    const strs = arr.map((x, i) => {
      const j = JSON.stringify(x);
      if (old[i] === j) return j;
      if (FIELD_KEYS.has(k) && old[i] !== undefined) fields.push(fieldDiff(JSON.parse(old[i]) as Record<string, unknown>, x as Record<string, unknown>, i));
      else items.push([i, x]);
      return j;
    });
    after.arrays[k] = strs;
    if (items.length) d.items[k] = items;
    if (fields.length) (d.fields ??= {})[k] = fields;
    if (arr.length !== old.length) d.len[k] = arr.length;
  }
  // 진행 중 경기: 지난 세트 해설은 화면이 이미 갖고 있으므로 마지막 세트만 통째로
  const live = d.set.live as CareerState["live"];
  if (live) d.set.live = { ...live, sets: live.sets.map((x, k, all) => (k === all.length - 1 ? x : { ...x, timeline: undefined })) };
  return { ...d, after };
}

/** 원소 하나에서 바뀐 필드 (JSON 으로 비교: undefined 필드는 없는 것과 같음) */
function fieldDiff(prev: Record<string, unknown>, next: Record<string, unknown>, i: number): [number, Record<string, unknown>, string[]?] {
  const set: Record<string, unknown> = {};
  const del: string[] = [];
  for (const [f, v] of Object.entries(next)) {
    if (v === undefined) continue;
    if (JSON.stringify(v) !== JSON.stringify(prev[f])) set[f] = v;
  }
  for (const f of Object.keys(prev)) if (next[f] === undefined) del.push(f);
  return del.length ? [i, set, del] : [i, set];
}

/** 스냅샷 조각으로 세이브 JSON 조립 (JSON.stringify(s) 와 같은 결과, 다시 직렬화하지 않음) */
export function jsonOf(s: CareerState, snap: Snapshot): string {
  const parts: string[] = [];
  for (const k of Object.keys(s)) {
    const j = (ARRAY_KEYS as readonly string[]).includes(k) ? `[${(snap.arrays[k] ?? []).join(",")}]` : snap.keys.get(k);
    if (j !== undefined) parts.push(`${JSON.stringify(k)}:${j}`);
  }
  return `{${parts.join(",")}}`;
}

