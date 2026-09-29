import { describe, expect, it } from "vitest";
import { FINAL_SETS, PRO_SETS } from "@shared/career/rules";
import { CareerError, advanceWeek, aiEntry, myPendingMatch, newCareer, releasePlayer, rosterOf, scoutPlayer, setAction, standings, startNextSeason } from "./logic";

describe("커리어 모드", () => {
  it("원작 데이터로 새 게임을 만든다 (230명, 12팀 풀리그 11주 66경기)", () => {
    const s = newCareer(6);
    expect(s.players).toHaveLength(230);
    expect(s.matches).toHaveLength(66);
    expect(rosterOf(s, 6).some(p => p.name === "이제동")).toBe(true);
  });

  it("엔트리 1~4세트에 같은 선수를 두 번 넣으면 거부한다", () => {
    const s = newCareer(0);
    const id = rosterOf(s, 0)[0].id;
    expect(() => advanceWeek(s, [id, id, id, id, id])).toThrow(CareerError);
  });

  it("행동력을 넘게 행동을 지정할 수 없다", () => {
    const s = newCareer(0);
    const r = rosterOf(s, 0);
    setAction(s, r[0].id, "best");
    setAction(s, r[1].id, "best");
    expect(() => setAction(s, r[2].id, "best")).toThrow(CareerError);
  });

  it("정규시즌 → 포스트시즌 → 시즌 종료 → 다음 시즌까지 진행된다", () => {
    const s = newCareer(4);
    let guard = 0;
    while (s.phase !== "offseason" && guard++ < 30) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
    }
    expect(s.phase).toBe("offseason");
    expect(s.history).toHaveLength(1);
    const st = standings(s);
    expect(st.reduce((a, t) => a + t.wins, 0)).toBe(66);
    expect(s.matches.filter(m => m.stage !== "regular").map(m => m.stage)).toEqual(["semi", "po", "final"]);
    startNextSeason(s);
    expect(s.season).toBe(2);
    expect(s.matches).toHaveLength(66);
  }, 60_000);

  it("무소속 선수 영입과 방출", () => {
    const s = newCareer(10);
    const fa = s.players.find(p => p.team === 12)!;
    const before = s.teams[10].money;
    const { price } = scoutPlayer(s, fa.id);
    expect(s.players[fa.id].team).toBe(10);
    expect(s.teams[10].money).toBe(before - price);
    releasePlayer(s, fa.id);
    expect(s.players[fa.id].team).toBe(12);
  });
});
