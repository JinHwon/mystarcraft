import { describe, it, expect } from "vitest";
import { calculateWinProbability, estimateWinRate, applyLoserPenalty, LOSER_REMAIN_RATIO_MAX } from "./gameSimulation";
import { initializeGameState, gameStateToTurnData, progressTurn } from "./bw/bwEngine";
import { STAT_KEYS } from "@shared/gameConstants";

describe("Game Simulation", () => {
  describe("calculateWinProbability", () => {
    it("should calculate win probability based on stats", () => {
      const player1Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 500])
      ) as Record<string, number>;
      const player2Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 500])
      ) as Record<string, number>;
      const mapRaceAdvantage = { terran: 50, zerg: 50, protoss: 50 };

      const winProb = calculateWinProbability(
        player1Stats,
        player2Stats,
        "terran",
        "terran",
        mapRaceAdvantage
      );

      expect(winProb).toBe(50);
    });

    it("should favor player with higher stats", () => {
      const player1Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 600])
      ) as Record<string, number>;
      const player2Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 500])
      ) as Record<string, number>;
      const mapRaceAdvantage = { terran: 50, zerg: 50, protoss: 50 };

      const winProb = calculateWinProbability(
        player1Stats,
        player2Stats,
        "terran",
        "terran",
        mapRaceAdvantage
      );

      expect(winProb).toBeGreaterThan(50);
    });

    it("should apply map race advantage", () => {
      const player1Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 500])
      ) as Record<string, number>;
      const player2Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 500])
      ) as Record<string, number>;
      
      // 테란에 유리한 맵
      const mapRaceAdvantage = { terran: 60, zerg: 40, protoss: 50 };

      const winProb = calculateWinProbability(
        player1Stats,
        player2Stats,
        "terran",
        "zerg",
        mapRaceAdvantage
      );

      expect(winProb).toBeGreaterThan(50);
    });

    it("should keep win probability between 20 and 80", () => {
      const player1Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 1200])
      ) as Record<string, number>;
      const player2Stats = Object.fromEntries(
        STAT_KEYS.map(key => [key, 500])
      ) as Record<string, number>;
      const mapRaceAdvantage = { terran: 50, zerg: 50, protoss: 50 };

      const winProb = calculateWinProbability(
        player1Stats,
        player2Stats,
        "terran",
        "terran",
        mapRaceAdvantage
      );

      expect(winProb).toBeLessThanOrEqual(80);
      expect(winProb).toBeGreaterThanOrEqual(20);
    });
  });

  describe("estimateWinRate", () => {
    const stats = (v: number) => Object.fromEntries(STAT_KEYS.map(key => [key, v])) as Record<any, number>;
    const mapRaceAdvantage = { terran: 0, zerg: 0, protoss: 0 };

    it("returns a percentage between 0 and 100 with the requested run count", () => {
      const result = estimateWinRate(stats(500), stats(500), "terran", "terran", mapRaceAdvantage, 100, 100, undefined, 50);
      expect(result.runs).toBe(50);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it("favors the much stronger, rested player", () => {
      const strong = estimateWinRate(stats(1000), stats(200), "terran", "terran", mapRaceAdvantage, 100, 100, undefined, 200);
      const weak = estimateWinRate(stats(200), stats(1000), "terran", "terran", mapRaceAdvantage, 100, 100, undefined, 200);
      expect(strong.winRate).toBeGreaterThan(weak.winRate);
    });
  });

  describe("loser penalty", () => {
    it("sharply reduces the loser's army and resources in the final turn", () => {
      const gs = initializeGameState(1, "A", "terran", 2, "B", "zerg");
      gs.gameEnded = true;
      gs.winner = 1;
      gs.player2.units = { zergling: 40, hydralisk: 20 };
      gs.player2.minerals = 1000;
      gs.player1.units = { marine: 30, medic: 8 };
      const turns: any[] = [{ ...gameStateToTurnData(gs), commentaries: ["GG"] }];
      const before = turns[0].player2Supply;

      applyLoserPenalty(gs, turns);

      const last = turns[0];
      expect(before).toBe(40);
      expect(last.player2Supply).toBeLessThanOrEqual(Math.ceil(before * LOSER_REMAIN_RATIO_MAX));
      expect(last.player1Supply).toBe(38);
      expect(gs.player2.minerals).toBeLessThanOrEqual(1000 * LOSER_REMAIN_RATIO_MAX);
      expect(last.commentaries[0]).toBe("GG");
      expect(last.commentaries.some((c: string) => c.includes("병력과 자원이 크게 무너졌습니다"))).toBe(true);
    });
  });

  describe("브루드 워 엔진", () => {
    const stats = (v: number) => Object.fromEntries(STAT_KEYS.map(key => [key, v])) as Record<any, number>;

    it("실제 게임처럼 일꾼·기지·인구수가 늘어나고 승패가 결정된다", () => {
      const gs = initializeGameState(1, "A", "protoss", 2, "B", "zerg", stats(500), stats(500), { rushDistance: 50, resources: 50, complexity: 50 }, {});
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

    it("능력치가 높은 선수가 더 자주 이긴다", () => {
      let wins = 0;
      for (let i = 0; i < 120; i++) {
        const gs = initializeGameState(1, "A", "terran", 2, "B", "terran", stats(700), stats(500));
        while (!gs.gameEnded && gs.turn < 125) progressTurn(gs);
        if (gs.winner === 1) wins++;
      }
      expect(wins / 120).toBeGreaterThan(0.6);
    });
  });
});
