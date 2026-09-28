import { describe, it, expect } from "vitest";
import { calculateWinProbability, estimateWinRate, applyLoserPenalty, LOSER_REMAIN_RATIO_MAX } from "./gameSimulation";
import { initializeGameState, gameStateToTurnData } from "./dynamicGameEngine";
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
    it("sharply reduces the loser's supply and resources in the final turn", () => {
      const gs = initializeGameState(1, "A", "terran", 2, "B", "zerg");
      gs.gameEnded = true;
      gs.winner = 1;
      gs.player1.supply = 150; gs.player1.resources = 5000;
      gs.player2.supply = 100; gs.player2.resources = 4000;
      const turns: any[] = [{ ...gameStateToTurnData(gs), commentaries: ["GG"] }];

      applyLoserPenalty(gs, turns);

      const last = turns[0];
      expect(last.player1Supply).toBe(150);
      expect(last.player1Resources).toBe(5000);
      expect(last.player2Supply).toBeLessThanOrEqual(100 * LOSER_REMAIN_RATIO_MAX);
      expect(last.player2Resources).toBeLessThanOrEqual(4000 * LOSER_REMAIN_RATIO_MAX);
      expect(last.commentaries[0]).toBe("GG");
      expect(last.commentaries.some((c: string) => c.includes("병력과 자원이 크게 무너졌습니다"))).toBe(true);
    });
  });
});
