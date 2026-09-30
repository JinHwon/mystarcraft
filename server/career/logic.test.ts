import { describe, expect, it } from "vitest";
import { FINAL_SETS, PRO_SETS } from "@shared/career/rules";
import { CareerError, advanceWeek, aiEntry, beginMatch, buyItem, useStockItem, myPendingMatch, newCareer, playLiveSet, proposeTrade, releasePlayer, rosterOf, scoutPlayer, setAction, standings, startNextSeason } from "./logic";

describe("커리어 모드", () => {
  it("원작 데이터로 새 게임을 만든다 (230명, 12팀 2라운드 풀리그 11주 132경기)", () => {
    const s = newCareer(6);
    expect(s.players).toHaveLength(230);
    expect(s.matches).toHaveLength(132);
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
    expect(st.reduce((a, t) => a + t.wins, 0)).toBe(132);
    expect(s.matches.filter(m => m.stage !== "regular").map(m => m.stage)).toEqual(["semi", "po", "final"]);
    rosterOf(s, s.myTeam)[0].contract!.years = 1;
    expect(() => startNextSeason(s)).toThrow(CareerError);
    startNextSeason(s, { releaseExpiring: true });
    expect(s.season).toBe(2);
    expect(s.matches).toHaveLength(132);
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
  it("한 주 2경기: 엔트리 4세트로 시작해 한 세트씩, 2:2 면 ACE 선수를 고르고, 두 경기가 끝나야 다음 주", () => {
    let sawAce = false;
    for (let k = 0; k < 30 && !sawAce; k++) {
      const s = newCareer(k % 12);
      const week = s.week;
      for (let leg = 1; leg <= 2; leg++) {
        const front = aiEntry(s, s.myTeam, PRO_SETS).slice(0, 4);
        beginMatch(s, front);
        expect(() => advanceWeek(s)).toThrow(CareerError);
        let r = playLiveSet(s);
        while (!r.matchOver) {
          if (r.needAce) {
            sawAce = true;
            expect(() => playLiveSet(s)).toThrow(CareerError);
            r = playLiveSet(s, front[0]);
          } else r = playLiveSet(s);
        }
        expect(r.set.timeline?.lines.length).toBeGreaterThan(5);
        const m = s.matches.find(x => x.id === r.playedMatchId)!;
        expect(m.done).toBe(true);
        expect(m.leg).toBe(leg);
        expect(Math.max(m.scoreA!, m.scoreB!)).toBe(3);
        if (leg === 1) { expect(r.week).toBeUndefined(); expect(s.week).toBe(week); }
        else { expect(r.week).toBeDefined(); expect(s.week).toBe(week + 1); }
      }
    }
    expect(sawAce).toBe(true);
  }, 120_000);
});

describe("아이템 상점", () => {
  it("장비는 선수에게 장착되고 경기마다 내구도가 줄며, 경기 능력치에 반영된다", async () => {
    const { gearStats } = await import("@shared/career/items");
    const s = newCareer(0);
    s.teams[0].money = 100_000;
    const p = rosterOf(s, 0)[0];
    buyItem(s, "m3", p.id);
    expect(p.equip?.mouse?.key).toBe("m3");
    expect(() => buyItem(s, "m3", p.id)).toThrow("이미 장착 중입니다");
    expect(gearStats(p).control).toBe(Math.min(1100, p.stats.control + 80));
    const left = p.equip!.mouse!.left;
    const front = [p.id, ...rosterOf(s, 0).filter(x => x.id !== p.id).slice(0, 3).map(x => x.id)];
    beginMatch(s, front);
    playLiveSet(s);
    expect(p.equip!.mouse!.left).toBe(left - 1);
    // 상대 선수별 전적 (우리 선수 쪽에 기록)
    const oppId = s.live!.opp[0];
    expect(p.h2h?.[oppId]?.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("포션은 시즌에 3번까지, 경기 아이템은 보유해야 쓸 수 있고 세트를 치를 때 소모된다", () => {
    const s = newCareer(1);
    s.teams[1].money = 100_000;
    const p = rosterOf(s, 1)[0];
    p.cond = 10;
    for (let i = 0; i < 3; i++) buyItem(s, "p_att", p.id);
    expect(() => buyItem(s, "p_att", p.id)).toThrow("이 선수는 더 사용 할 수 없습니다");
    const front = rosterOf(s, 1).slice(0, 4).map(x => x.id);
    expect(() => beginMatch(s, front, { 0: { key: "cheer" } })).toThrow(CareerError);
    expect(() => buyItem(s, "cheer")).toThrow("구입 불가능 품목입니다");
    s.inventory = { cheer: 1 };
    buyItem(s, "sniping");
    expect(s.inventory).toEqual({ cheer: 1, sniping: 1 });
    beginMatch(s, front, { 0: { key: "cheer" }, 1: { key: "sniping", predict: 0 } });
    const r = playLiveSet(s);
    expect(r.set.item).toBe("cheer");
    expect(r.set.timeline!.lines[0].text).toContain("치어풀");
    expect(s.inventory!.cheer).toBe(0);
    playLiveSet(s);
    expect(s.inventory!.sniping).toBe(0);
  });

  it("소모품은 여러 개를 한 번에 사고, 비타비타는 사 두었다가 선수에게 먹인다", () => {
    const s = newCareer(2);
    s.teams[2].money = 1000;
    buyItem(s, "vitavita", undefined, 5);
    expect(s.inventory!.vitavita).toBe(5);
    expect(s.teams[2].money).toBe(1000 - 40 * 5);
    const p = rosterOf(s, 2)[0];
    p.cond = 4;
    useStockItem(s, "vitavita", p.id);
    expect(p.cond).toBe(7);
    expect(s.inventory!.vitavita).toBe(4);
    p.cond = 10;
    expect(() => useStockItem(s, "vitavita", p.id)).toThrow("컨디션이 최대 입니다");
    expect(() => buyItem(s, "vitavita", undefined, 1000)).toThrow(CareerError);
  });
});

describe("구단 운영", () => {
  it("다른 팀 선수: 이적료 합의 → 선수 계약 협상 → 영입", async () => {
    const { bidPlayer, negotiateContract } = await import("./club");
    const { playerDemand, sellMinimum } = await import("@shared/career/contract");
    const s = newCareer(0);
    s.teams[0].money = 100_000;
    const p = rosterOf(s, 1).sort((a, b) => a.stats.control - b.stats.control)[0];
    const min = sellMinimum(s, p);
    expect(bidPlayer(s, p.id, Math.round(min * 0.5)).result).toBe("rejected");
    expect(() => negotiateContract(s, p.id, { salary: 999, years: 2 })).toThrow("먼저 구단과");
    const r = bidPlayer(s, p.id, min);
    expect(r.result).toBe("agreed");
    const d = playerDemand(s, p, 0);
    expect(negotiateContract(s, p.id, { ...d, salary: Math.round(d.salary * 0.5) }).result).not.toBe("signed");
    expect(negotiateContract(s, p.id, d).result).toBe("signed");
    expect(p.team).toBe(0);
    expect(p.contract?.salary).toBe(d.salary);
    expect(s.teams[0].money).toBe(100_000 - min);
  });

  it("받은 제안: 역제안이 최대 금액 안이면 성사", async () => {
    const { respondOffer } = await import("./club");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[5];
    s.offers = [{ id: 1, player: p.id, team: 3, fee: 500, max: 800, season: 1, week: 1, tries: 0, status: "pending" }];
    const before = s.teams[0].money;
    const r = respondOffer(s, 1, "counter", 700);
    expect(r.result).toBe("sold");
    expect(p.team).toBe(3);
    expect(s.teams[0].money).toBe(before + 700);
  });

  it("3주 연속 적자면 구단 해체, 감독 제의를 받으면 자금과 함께 이동", async () => {
    const { acceptJob } = await import("./club");
    const s = newCareer(4);
    s.teams[4].money = -5000;
    for (let i = 0; i < 3 && !s.gameOver; i++) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, 4, PRO_SETS) : undefined);
    }
    expect(s.gameOver?.reason).toContain("해체");
    const t = newCareer(4);
    t.teams[4].money = 7777;
    t.jobOffers = [0];
    acceptJob(t, 0);
    expect(t.myTeam).toBe(0);
    expect(t.teams[0].money).toBe(7777);
  });
});

describe("세대 교체·2부·스폰서", () => {
  it("2부 영입 → 성장 → 1부 승격 계약", async () => {
    const { signReserve, negotiateContract } = await import("./club");
    const { playerDemand } = await import("@shared/career/contract");
    const { reserveOf } = await import("@shared/career/view");
    const s = newCareer(0);
    s.teams[0].money = 50_000;
    const fa = s.players.filter(p => p.team === 12).sort((a, b) => a.birth - b.birth).at(-1)!;
    signReserve(s, fa.id);
    expect(reserveOf(s, 0).map(p => p.id)).toContain(fa.id);
    expect(rosterOf(s, 0).some(p => p.id === fa.id)).toBe(false);
    const before = Object.values(fa.stats).reduce((a, b) => a + b, 0);
    for (let i = 0; i < 3; i++) { const m = myPendingMatch(s); advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined); }
    expect(Object.values(fa.stats).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(before);
    const r = negotiateContract(s, fa.id, playerDemand(s, fa, 0), { promote: true });
    expect(r.result).toBe("signed");
    expect(fa.reserve).toBe(false);
    expect(rosterOf(s, 0).some(p => p.id === fa.id)).toBe(true);
  });

  it("스폰서 퀘스트 목표를 올리면 보상이 커지고, 달성하면 지급된다", async () => {
    const { chooseSponsor } = await import("./club");
    const { sponsorOffers, questReward } = await import("@shared/career/sponsor");
    const s = newCareer(0);
    const o = sponsorOffers(s)[0];
    const q = o.quests[0];
    expect(questReward(q, q.kind === "rank" ? q.target - 1 : q.target + 1)).toBeGreaterThan(questReward(q, q.target));
    chooseSponsor(s, 0, o.quests.map(x => x.target));
    expect(() => chooseSponsor(s, 1, [])).toThrow(CareerError);
    s.sponsor!.quests[0] = { kind: "teamWins", base: 11, target: 1, baseReward: 100 };
    const money = s.teams[0].money;
    s.teams[0].wins = 1;
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
    expect(s.sponsor!.quests[0].done).toBe(true);
    expect(s.ledger?.items["스폰서 보상"]).toBeGreaterThan(0);
    void money;
  });

  it("시즌이 넘어가면 노장은 은퇴하고 신인이 등장한다", () => {
    const s = newCareer(0);
    for (const p of s.players.slice(0, 20)) p.birth = 1970; // 40세
    s.phase = "offseason";
    const count = s.players.length;
    startNextSeason(s, { releaseExpiring: true });
    expect(s.players.slice(0, 20).every(p => p.team === -1 && p.retired === 2)).toBe(true);
    expect(s.players.length).toBeGreaterThan(count);
    expect(s.players.slice(count).every(p => p.team === 12 && p.potential! > 0)).toBe(true);
  });
});

describe("메인 스폰서·감독 레벨", () => {
  it("메인 스폰서 수당이 경기마다 지급되고, 예산 안의 조건이면 계약, 넘으면 역제안·거절", async () => {
    const { negotiateMainSponsor } = await import("./club");
    const { sponsorBudget, termsValue } = await import("@shared/career/mainSponsor");
    const s = newCareer(0);
    expect(s.mainSponsor?.team).toBe(0);
    const t = { ...s.mainSponsor! };
    const terms = { win: t.win, loss: t.loss, proTitle: t.proTitle, proRunnerUp: t.proRunnerUp, mslTitle: t.mslTitle, mslRunnerUp: t.mslRunnerUp };
    expect(termsValue(terms)).toBeLessThanOrEqual(sponsorBudget(s));
    expect(negotiateMainSponsor(s, { ...terms, win: terms.win * 10 }, 2).result).toBe("rejected");
    const r = negotiateMainSponsor(s, { ...terms, win: Math.round(terms.win * 1.25) }, 2);
    expect(r.result).toBe("countered");
    expect(negotiateMainSponsor(s, { ...terms, win: terms.win + 10, loss: Math.max(0, terms.loss - 20) }, 2).result).toBe("signed");
    const win = s.mainSponsor!.win, loss = s.mainSponsor!.loss;
    const before = s.ledger?.items ?? {};
    void before;
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
    const items = s.ledger!.items;
    expect((items["스폰서 승리 수당"] ?? 0) + (items["스폰서 패배 수당"] ?? 0)).toBeGreaterThanOrEqual(Math.min(win, loss) * 2);
    expect(() => negotiateMainSponsor(s, terms, 1)).toThrow(CareerError);
  });

  it("경기를 하면 감독 경험치가 쌓여 레벨이 오르고, 레벨이 높으면 선수 요구 연봉·이적료가 내려간다", async () => {
    const { addManagerExp } = await import("./club");
    const { playerDemand, sellMinimum } = await import("@shared/career/contract");
    const s = newCareer(0);
    const p = rosterOf(s, 1)[0];
    const d1 = playerDemand(s, p, 0).salary, f1 = sellMinimum(s, p);
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
    expect((s.manager?.exp ?? 0) + (s.manager!.level! - 1) * 100).toBeGreaterThan(0);
    addManagerExp(s, 5000);
    expect(s.manager!.level!).toBeGreaterThan(5);
    expect(playerDemand(s, p, 0).salary).toBeLessThan(d1);
    expect(sellMinimum(s, p)).toBeLessThan(f1);
  });
});
