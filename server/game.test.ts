import { describe, expect, it } from "vitest";
import {
  calcGrade,
  calcGradeIndex,
  calcTotalStats,
  calcExpToNext,
  GRADES,
  GRADE_BASE,
  GRADE_STEP,
  STAT_DEFAULT,
  STAT_KEYS,
} from "../shared/gameConstants";

describe("calcGrade", () => {
  it("기본 능력치 합산(4000)은 F 등급이다", () => {
    expect(calcGrade(4000)).toBe("F");
  });

  it("4599점은 F 등급이다", () => {
    expect(calcGrade(4599)).toBe("F");
  });

  it("4600점은 E 등급이다", () => {
    expect(calcGrade(4600)).toBe("E");
  });

  it("5200점은 D 등급이다", () => {
    expect(calcGrade(5200)).toBe("D");
  });

  it("5800점은 C 등급이다", () => {
    expect(calcGrade(5800)).toBe("C");
  });

  it("6400점은 B 등급이다", () => {
    expect(calcGrade(6400)).toBe("B");
  });

  it("7000점은 A 등급이다", () => {
    expect(calcGrade(7000)).toBe("A");
  });

  it("7600점은 S 등급이다", () => {
    expect(calcGrade(7600)).toBe("S");
  });

  it("8200점은 SS 등급이다", () => {
    expect(calcGrade(8200)).toBe("SS");
  });

  it("8800점은 SSS 등급이다", () => {
    expect(calcGrade(8800)).toBe("SSS");
  });

  it("최대치(9600)도 SSS 등급이다", () => {
    expect(calcGrade(9600)).toBe("SSS");
  });

  it("3000점처럼 기준 이하도 F 등급이다", () => {
    expect(calcGrade(3000)).toBe("F");
  });
});

describe("calcGradeIndex", () => {
  it("F 등급은 인덱스 0이다", () => {
    expect(calcGradeIndex(4000)).toBe(0);
  });

  it("SSS 등급은 인덱스 8이다", () => {
    expect(calcGradeIndex(9600)).toBe(8);
  });

  it("인덱스는 GRADES 배열 범위를 초과하지 않는다", () => {
    expect(calcGradeIndex(99999)).toBe(GRADES.length - 1);
  });
});

describe("calcTotalStats", () => {
  it("기본 능력치(500 x 8)의 합산은 4000이다", () => {
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, STAT_DEFAULT])) as Record<typeof STAT_KEYS[number], number>;
    expect(calcTotalStats(stats)).toBe(4000);
  });

  it("모든 능력치 최대(1200 x 8)의 합산은 9600이다", () => {
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 1200])) as Record<typeof STAT_KEYS[number], number>;
    expect(calcTotalStats(stats)).toBe(9600);
  });

  it("개별 능력치 합산이 정확하다", () => {
    const stats = {
      sense: 600,
      control: 700,
      attack: 500,
      harass: 500,
      strategy: 500,
      supply: 500,
      defense: 500,
      scout: 500,
    };
    expect(calcTotalStats(stats)).toBe(4300);
  });
});

describe("calcExpToNext", () => {
  it("레벨 1의 다음 레벨 경험치는 100이다", () => {
    expect(calcExpToNext(1)).toBe(100);
  });

  it("레벨 5의 다음 레벨 경험치는 500이다", () => {
    expect(calcExpToNext(5)).toBe(500);
  });

  it("레벨 10의 다음 레벨 경험치는 1000이다", () => {
    expect(calcExpToNext(10)).toBe(1000);
  });
});

describe("등급 시스템 상수 검증", () => {
  it("GRADE_BASE는 4000이다", () => {
    expect(GRADE_BASE).toBe(4000);
  });

  it("GRADE_STEP은 600이다", () => {
    expect(GRADE_STEP).toBe(600);
  });

  it("GRADES 배열은 9개 등급을 포함한다", () => {
    expect(GRADES).toHaveLength(9);
    expect(GRADES[0]).toBe("F");
    expect(GRADES[GRADES.length - 1]).toBe("SSS");
  });

  it("GRADES 순서가 F, E, D, C, B, A, S, SS, SSS이다", () => {
    expect(Array.from(GRADES)).toEqual(["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"]);
  });
});
