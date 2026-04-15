import { describe, it, expect } from "vitest";
import { calculateWinProbability } from "./gameSimulation";
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
});
