import { describe, expect, it } from "vitest";
import { applyDiff } from "@shared/career/diff";
import { advanceWeek, beginMatch, newCareer, playLiveSet, rosterOf } from "./logic";
import { diffOf, jsonOf, snapshot } from "./diff";

/** 서버 변경분을 적용한 결과가 서버 세이브와 같은지 (해설 빼고 비교) */
function roundTrip(s: ReturnType<typeof newCareer>, fn: () => void) {
  const client = structuredClone(s);
  const before = snapshot(s);
  fn();
  const { after, ...d } = diffOf(before, s);
  // 스냅샷으로 조립한 세이브 JSON 이 그대로 직렬화한 것과 같아야 함 (다음 요청의 비교 기준도 같아야 함)
  expect(jsonOf(s, after)).toBe(JSON.stringify(s));
  expect(after).toEqual(snapshot(s));
  const next = applyDiff(client, JSON.parse(JSON.stringify(d)));
  const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "timeline" ? undefined : v)));
  expect(strip(next)).toEqual(strip(s));
  return JSON.stringify(d).length;
}

describe("세이브 변경분", () => {
  it("경기 시작·세트·주 진행 모두 변경분만으로 같은 세이브가 된다", () => {
    const s = newCareer(0);
    const front = rosterOf(s, 0).slice(0, 4).map(p => p.id);
    const full = JSON.stringify(s).length;
    roundTrip(s, () => beginMatch(s, front)); // 주 1회 선수 행동 반영이라 모든 선수가 바뀜
    let over = false;
    while (!over) {
      const size = roundTrip(s, () => { const r = playLiveSet(s, s.live && s.live.sets.length === 4 ? front[0] : undefined); over = r.matchOver; });
      if (!over) expect(size).toBeLessThan(full / 4);
    }
    roundTrip(s, () => advanceWeek(s, rosterOf(s, 0).slice(0, 5).map(p => p.id)));
  });
});
