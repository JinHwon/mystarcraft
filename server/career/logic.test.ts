import { describe, expect, it } from "vitest";
import { FINAL_SETS, PRO_SETS } from "@shared/career/rules";
import { CareerError, advanceWeek, aiEntry, beginMatch, myPendingMatch, newCareer, playLiveSet, proposeTrade, releasePlayer, rosterOf, scoutPlayer, setAction, standings, startNextSeason } from "./logic";

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
    // 마이스타리그도 정규시즌 안에 끝난다
    expect(s.msl?.stage).toBe("done");
    expect(s.msl?.duals).toHaveLength(8);
    expect(s.msl?.groups.every(g => g.players.length === 4 && g.qualified.length === 2)).toBe(true);
    expect(s.msl?.bracket.map(b => b.round)).toEqual(["ro16", "ro8", "ro4", "final"]);
    expect(s.history[0].mslChampion).toBe(s.msl?.champion);
    expect(Object.values(s.msl!.placements).filter(r => r === "16강")).toHaveLength(8);
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

  it("트레이드: 가치가 부족하면 거절, 현금을 얹으면 성사", () => {
    const s = newCareer(0);
    const target = rosterOf(s, 1).sort((a, b) => a.stats.control - b.stats.control)[0];
    expect(() => proposeTrade(s, 1, [], [target.id], 0)).toThrow(CareerError);
    s.teams[0].money = 1_000_000;
    const before = rosterOf(s, 0).length;
    proposeTrade(s, 1, [], [target.id], 50_000);
    expect(s.players[target.id].team).toBe(0);
    expect(rosterOf(s, 0).length).toBe(before + 1);
  });

  it("우리 경기는 양 팀 엔트리와 세트별 중계 타임라인을 돌려준다", () => {
    const s = newCareer(3);
    expect(s.mapPool).toHaveLength(7);
    const m = myPendingMatch(s)!;
    expect(m.maps.every(id => s.mapPool!.includes(id))).toBe(true);
    const r = advanceWeek(s, aiEntry(s, 3, PRO_SETS));
    const done = s.matches.find(x => x.id === r.playedMatchId)!;
    expect(done.entryA).toHaveLength(PRO_SETS);
    expect(done.entryB).toHaveLength(PRO_SETS);
    expect(r.broadcast?.length).toBe(done.sets?.length);
    const tl = r.broadcast![0].timeline!;
    expect(tl.lines.length).toBeGreaterThan(5);
    expect(tl.frames.length).toBeGreaterThan(2);
    expect(tl.lines.some(l => l.side === 1) && tl.lines.some(l => l.side === 2)).toBe(true);
    // 세이브에는 타임라인이 남지 않는다
    expect(JSON.stringify(s)).not.toContain("frames");
  });
});

describe("원작 해설 중계", () => {
  it("중계 타임라인은 원작 문장과 선수 이름으로 채워진다", async () => {
    const { LEGACY_LINES } = await import("../bw/legacyLines");
    const all = new Set(Object.values(LEGACY_LINES).flat(2).map(s => s.replace(/^,\s*|^ ?선수\s*/, "").trim()));
    const s = newCareer(2);
    const r = advanceWeek(s, aiEntry(s, 2, PRO_SETS));
    const set = r.broadcast![0];
    const names = [s.players[set.a].name, s.players[set.b].name];
    const lines = set.timeline!.lines;
    expect(lines.length).toBeGreaterThan(10);
    // 모든 줄이 원작 문장 (앞의 "이름 선수" 만 붙음)
    for (const l of lines) {
      const body = l.text.replace(new RegExp(`^(${names.join("|")})( 선수)?(, |\\.\\. | )?`), "").replace(/^선수[, ]*/, "").trim();
      expect([...all].some(x => x.endsWith(body) || body.endsWith(x))).toBe(true);
    }
    expect(lines.at(-2)?.text).toMatch(/경기가 종료되었습니다|승리|댄스|돌진|윙크/);
  });
});

describe("세트별 경기 진행", () => {
  it("엔트리 4세트로 시작해 한 세트씩 진행, 2:2 면 ACE 선수를 골라야 한다", () => {
    let sawAce = false;
    for (let k = 0; k < 40 && !sawAce; k++) {
      const s = newCareer(k % 12);
      const front = aiEntry(s, s.myTeam, PRO_SETS).slice(0, 4);
      beginMatch(s, front);
      expect(() => advanceWeek(s)).toThrow(CareerError);
      const week = s.week;
      let r = playLiveSet(s);
      while (!r.week) {
        if (r.needAce) {
          sawAce = true;
          expect(() => playLiveSet(s)).toThrow(CareerError);
          r = playLiveSet(s, front[0]);
        } else r = playLiveSet(s);
      }
      expect(r.set.timeline?.lines.length).toBeGreaterThan(5);
      expect(s.live).toBeUndefined();
      expect(s.week).toBe(week + 1);
      const m = s.matches.find(x => x.id === r.week!.playedMatchId)!;
      expect(m.done).toBe(true);
      expect(Math.max(m.scoreA!, m.scoreB!)).toBe(3);
    }
    expect(sawAce).toBe(true);
  }, 120_000);
});
