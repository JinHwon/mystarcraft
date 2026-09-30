import { describe, it, expect } from "vitest";
import { simulateSet } from "./gameSimulation";
import { initializeGameState, gameStateToTurnData, progressTurn } from "./bw/bwEngine";
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";

const stats = (v: number) => Object.fromEntries(STAT_KEYS.map(key => [key, v])) as Record<StatKey, number>;
const MAP = { rushDistance: 50, resources: 50, complexity: 50 };

describe("simulateSet", () => {
  it("승자·경기 시간·경기 내용을 돌려주고 중계 타임라인을 만든다", () => {
    const r = simulateSet(
      { id: 1, name: "테란왕", race: "terran", stats: stats(500), fatigue: 100 },
      { id: 2, name: "저그킹", race: "zerg", stats: stats(500), fatigue: 100 },
      {}, MAP, true, true
    );
    expect([1, 2]).toContain(r.winnerId);
    expect(r.duration).toBeGreaterThan(0);
    expect(r.content).toHaveLength(2);
    expect(r.timeline?.lines.length).toBeGreaterThan(0);
    expect(r.timeline?.frames[0]).toEqual({ t: 0, army: [0, 0], res: [0, 0] });
    expect(r.highlights.length).toBeLessThanOrEqual(18);
  });

  it("타임라인을 요청하지 않으면 만들지 않는다", () => {
    const r = simulateSet(
      { id: 1, name: "A", race: "protoss", stats: stats(500), fatigue: 100 },
      { id: 2, name: "B", race: "terran", stats: stats(500), fatigue: 100 },
      {}, MAP, false, false
    );
    expect(r.timeline).toBeUndefined();
    expect(r.highlights).toEqual([]);
  });

  it("능력치가 높은 선수가 더 자주 이긴다", () => {
    let wins = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      const r = simulateSet(
        { id: 1, name: "A", race: "zerg", stats: stats(750), fatigue: 100 },
        { id: 2, name: "B", race: "zerg", stats: stats(500), fatigue: 100 },
        {}, MAP, false
      );
      if (r.winnerId === 1) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.6);
  });
});

describe("브루드 워 엔진", () => {
  it("실제 게임처럼 일꾼·기지·인구수가 늘어나고 승패가 결정된다", () => {
    const gs = initializeGameState(1, "A", "protoss", 2, "B", "zerg", stats(500), stats(500), MAP, {});
    let at6: any = null;
    while (!gs.gameEnded && gs.turn < 125) {
      progressTurn(gs);
      if (gs.time === 360) at6 = gameStateToTurnData(gs);
    }
    expect(gs.gameEnded).toBe(true);
    expect([1, 2]).toContain(gs.winner);
    if (at6) {
      expect(at6.p1.workers).toBeGreaterThan(15);
      expect(at6.p1.population).toBeLessThanOrEqual(at6.p1.supplyCap);
      expect(at6.p2.bases).toBeGreaterThanOrEqual(1);
    }
  });

  it("해설에 경기 시간과 선수 이름이 들어간다", () => {
    const gs = initializeGameState(1, "테란왕", "terran", 2, "저그킹", "zerg", stats(500), stats(500));
    const lines: string[] = [];
    while (!gs.gameEnded && gs.turn < 125) {
      progressTurn(gs);
      lines.push(...gs.turnCommentaries);
    }
    expect(lines.every(l => /^\[\d{2}:\d{2}\] /.test(l))).toBe(true);
    expect(lines.some(l => l.includes("테란왕"))).toBe(true);
    expect(lines.some(l => l.includes("GG") || l.includes("판정"))).toBe(true);
  });
});
