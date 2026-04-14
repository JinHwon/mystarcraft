import { describe, expect, it } from "vitest";
import { FATIGUE_MAX, FATIGUE_NORMAL_THRESHOLD, calcFatigueStatPenalty } from "../shared/gameConstants";

describe("Fatigue System", () => {
  describe("calcFatigueStatPenalty", () => {
    it("should return 0 penalty when fatigue is 100 (normal)", () => {
      expect(calcFatigueStatPenalty(100)).toBe(0);
    });

    it("should return 0 penalty when fatigue is 90 (threshold)", () => {
      expect(calcFatigueStatPenalty(FATIGUE_NORMAL_THRESHOLD)).toBe(0);
    });

    it("should return penalty when fatigue is below threshold", () => {
      const penalty = calcFatigueStatPenalty(80);
      expect(penalty).toBeGreaterThan(0);
    });

    it("should increase penalty as fatigue decreases", () => {
      const penalty80 = calcFatigueStatPenalty(80);
      const penalty50 = calcFatigueStatPenalty(50);
      const penalty0 = calcFatigueStatPenalty(0);
      
      expect(penalty50).toBeGreaterThan(penalty80);
      expect(penalty0).toBeGreaterThan(penalty50);
    });

    it("should return maximum penalty at 0 fatigue", () => {
      const maxPenalty = calcFatigueStatPenalty(0);
      expect(maxPenalty).toBeLessThanOrEqual(1); // Max 100% penalty
      expect(maxPenalty).toBeGreaterThan(0);
    });

    it("should calculate penalty correctly at specific points", () => {
      // 피로도 80: 5% 패널티
      const penalty80 = calcFatigueStatPenalty(80);
      expect(Math.round(penalty80 * 100)).toBe(5);

      // 피로도 70: 10% 패널티
      const penalty70 = calcFatigueStatPenalty(70);
      expect(Math.round(penalty70 * 100)).toBe(10);

      // 피로도 50: 20% 패널티
      const penalty50 = calcFatigueStatPenalty(50);
      expect(Math.round(penalty50 * 100)).toBe(20);
    });
  });

  describe("Fatigue Constants", () => {
    it("should have correct fatigue max value", () => {
      expect(FATIGUE_MAX).toBe(100);
    });

    it("should have correct normal threshold", () => {
      expect(FATIGUE_NORMAL_THRESHOLD).toBe(90);
    });

    it("threshold should be less than max", () => {
      expect(FATIGUE_NORMAL_THRESHOLD).toBeLessThan(FATIGUE_MAX);
    });
  });
});
