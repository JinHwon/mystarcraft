import { describe, expect, it } from "vitest";
import { FINAL_SETS, PRO_SETS, PRO_WEEK_PATTERN, totalOf, type CareerState, type CMatch } from "@shared/career/rules";
import { CareerError, advanceWeek as advanceOnly, completeWeek, aiEntry, beginMatch, buyItem, equipItem, migrateCareer, useStockItem, myPendingMatch, newCareer, playLiveSet, proposeTrade, releasePlayer, rosterOf, scoutPlayer, setAction, standings, startNextSeason } from "./logic";

/** 한 주 진행 (우리 선수가 조장인 조 지명식에서 멈추면 자동 지명으로 마저 진행) */
function advanceWeek(s: CareerState, entry?: number[]) {
  const r = advanceOnly(s, entry);
  if (!s.weekHold) return r;
  const c = completeWeek(s);
  return { ...c, broadcast: r.broadcast, proReports: [...(r.proReports ?? []), ...(c.proReports ?? [])] };
}

describe("다른 구단 아이템 구입", () => {
  it("여유 자금 안에서 주전에게 컨디션 아이템·장비를 사 주고, 남길 자금은 남긴다", async () => {
    const { aiShopping, equippedCount } = await import("./aiShop");
    const s = newCareer(0);
    const t = s.teams[1];
    t.money = 5000;
    for (const p of rosterOf(s, 1)) p.cond = 50;
    aiShopping(s);
    expect(t.money).toBeLessThan(5000);
    expect(t.money).toBeGreaterThanOrEqual(1500);
    const core = rosterOf(s, 1);
    expect(core.some(p => p.cond > 50)).toBe(true);
    expect(core.some(p => equippedCount(p) > 0)).toBe(true);
    // 우리 팀은 건드리지 않음
    expect(rosterOf(s, 0).every(p => equippedCount(p) === 0)).toBe(true);
    // 돈이 없으면 사지 않음
    const poor = s.teams[2];
    poor.money = 1000;
    aiShopping(s);
    expect(poor.money).toBe(1000);
  });
});

describe("등급", () => {
  it("F, D-, D, D+, C- … 순서이고 SS 이상은 지면 더 크게 떨어진다", async () => {
    const { legacyGrade } = await import("@shared/career/rules");
    const { topGradeLossMul } = await import("./growth");
    expect([4200, 4380, 4560, 4740, 4920].map(legacyGrade)).toEqual(["F", "D-", "D", "D+", "C-"]);
    expect(legacyGrade(5850)).toBe("B+");
    expect(legacyGrade(9000)).toBe("SSS");
    const p = rosterOf(newCareer(0), 0)[0];
    for (const k of Object.keys(p.stats) as (keyof typeof p.stats)[]) p.stats[k] = 600;
    expect(topGradeLossMul(p)).toBe(1);
    for (const k of Object.keys(p.stats) as (keyof typeof p.stats)[]) p.stats[k] = 880; // 7040 → SS
    expect(legacyGrade(totalOf(p.stats))).toBe("SS");
    expect(topGradeLossMul(p)).toBeGreaterThan(1.5);
    // S 가 A 에게 지면 훨씬 크게, 차이가 클수록 더
    const set = (x: typeof p, v: number) => { for (const k of Object.keys(x.stats) as (keyof typeof x.stats)[]) x.stats[k] = v; };
    const [sp, a, b] = rosterOf(newCareer(0), 0);
    set(sp, 835); // 6680 → S
    set(a, 770); // 6160 → A
    set(b, 710); // 5680 → B
    expect(legacyGrade(totalOf(sp.stats))).toBe("S");
    expect(legacyGrade(totalOf(a.stats))).toBe("A");
    expect(topGradeLossMul(sp, sp)).toBe(1);
    expect(topGradeLossMul(sp, a)).toBeGreaterThanOrEqual(5);
    expect(topGradeLossMul(sp, b)).toBeGreaterThan(topGradeLossMul(sp, a));
  });
});

describe("2부 리그 (B팀)", () => {
  it("구단마다 B팀이 2부 리그에서 같은 일정으로 경기하고, 2부 팀은 8명 이상", () => {
    const s = newCareer(0);
    const b = s.teams.filter(t => t.div === 2);
    expect(b).toHaveLength(12);
    expect(b.every(t => t.name.endsWith(" B") && t.parent !== undefined && s.teams[t.parent].div === 1)).toBe(true);
    expect(b.every(t => rosterOf(s, t.id).length >= 9)).toBe(true);
    expect(s.matches.filter(m => m.div === 2)).toHaveLength(132);
    expect(s.matches.filter(m => m.div === 1)).toHaveLength(132);
    // 2부 경기는 1부 감독이면 자동 진행
    const m = myPendingMatch(s);
    advanceWeek(s, aiEntry(s, 0, PRO_SETS));
    void m;
    expect(s.matches.filter(x => x.div === 2 && x.week === 1).every(x => x.done)).toBe(true);
    expect(standings(s, 2).reduce((a, t) => a + t.wins, 0)).toBe(12);
  });

  it("시즌이 끝나면 1부 11·12위와 2부 2·1위가 승강전, 이긴 2부 팀은 다음 시즌 1부", () => {
    const s = newCareer(4);
    let guard = 0;
    let promo: CMatch[] = [];
    while (s.phase !== "offseason" && guard++ < 30) {
      // 포스트시즌은 한 주에 한 경기: 승강전 1 (11위 vs 2부 2위) → 승강전 2 (12위 vs 2부 1위) → 준PO …
      if (s.phase === "postseason" && promo.length < 2) {
        const st1 = standings(s, 1), st2 = standings(s, 2);
        const now = s.matches.filter(x => x.week === s.week && x.stage !== "regular");
        expect(now).toHaveLength(1);
        promo = s.matches.filter(x => x.stage === "promo");
        expect(promo.map(x => [x.a, x.b])).toEqual([[st1[10].id, st2[1].id], [st1[11].id, st2[0].id]].slice(0, promo.length));
      }
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
    }
    expect(promo).toHaveLength(2);
    const moves = s.promo!.moves;
    expect(s.history[0].promo).toEqual(moves);
    startNextSeason(s, { releaseExpiring: true });
    for (const mv of moves) { expect(s.teams[mv.up].div).toBe(1); expect(s.teams[mv.down].div).toBe(2); }
    expect(s.teams.filter(t => t.div === 1)).toHaveLength(12);
    expect(s.teams.filter(t => t.div === 2)).toHaveLength(12);
    expect(s.matches.filter(x => x.div === 1)).toHaveLength(132);
    expect(s.matches.filter(x => x.div === 2)).toHaveLength(132);
    expect(s.teams.filter(t => t.div === 2).every(t => rosterOf(s, t.id).length >= 8)).toBe(true);
  }, 60_000);

  it("2부 팀 감독: 2부 경기를 직접 하고, 스폰서 1곳, 최소 8명, 1부로 팔면 육성 지원금", async () => {
    const { chooseSponsor, respondOffer } = await import("./club");
    const { sponsorOffers } = await import("@shared/career/sponsor");
    const s = newCareer(13); // KT 롤스터 B
    expect(s.teams[13].div).toBe(2);
    const m = myPendingMatch(s)!;
    expect(m.div).toBe(2);
    const offers = sponsorOffers(s);
    chooseSponsor(s, offers[0].name, offers[0].quests.map(q => q.target));
    if (offers[1]) expect(() => chooseSponsor(s, offers[1].name, offers[1].quests.map(q => q.target))).toThrow(CareerError);
    // 8명 아래로는 방출 불가
    while (rosterOf(s, 13).length > 8) releasePlayer(s, rosterOf(s, 13)[0].id);
    expect(() => releasePlayer(s, rosterOf(s, 13)[0].id)).toThrow(CareerError);
    // 같은 구단 1군이 사 가면 이적료 + 50% 육성 지원금
    const p = rosterOf(s, 13)[0];
    const sc = s; sc.teams[0].money = 50_000;
    s.offers = [{ id: 999, player: p.id, team: 0, fee: 500, max: 600, season: s.season, week: s.week, tries: 0, status: "pending" }];
    // 9명으로 늘려서 팔 수 있게
    const fa = s.players.find(x => x.team === 12)!;
    fa.team = 13;
    const before = s.teams[13].money;
    respondOffer(s, 999, "accept");
    expect(s.teams[13].money - before).toBe(750);
    expect(p.team).toBe(0);
    // 다른 구단 1군에 팔면 육성 지원금 20%
    const q = rosterOf(s, 13)[0];
    s.players.find(x => x.team === 12)!.team = 13;
    s.teams[3].money = 50_000;
    s.offers = [{ id: 998, player: q.id, team: 3, fee: 500, max: 600, season: s.season, week: s.week, tries: 0, status: "pending" }];
    const before2 = s.teams[13].money;
    respondOffer(s, 998, "accept");
    expect(s.teams[13].money - before2).toBe(600);
  });

  it("예전 세이브: B팀이 생기고, 구단 2부 육성 선수는 그 구단 B팀으로, 시즌 중이면 남은 주 2부 일정", () => {
    const s = newCareer(0);
    // B팀이 없던 예전 세이브 흉내
    for (const p of s.players) if (p.team > 12) { p.team = 12; delete p.contract; }
    s.teams = s.teams.slice(0, 13);
    for (const t of s.teams) delete t.div;
    s.matches = s.matches.filter(m => m.div !== 2);
    for (const m of s.matches) delete m.div;
    const kid = rosterOf(s, 0)[0];
    kid.reserve = true;
    s.week = 3;
    migrateCareer(s);
    expect(s.teams.filter(t => t.div === 2)).toHaveLength(12);
    expect(kid.team).toBe(13);
    expect(kid.reserve).toBe(false);
    // 3주차부터 남은 라운드 (18주 일정: 1·2주에 3라운드)
    expect(s.matches.filter(m => m.div === 2)).toHaveLength((22 - PRO_WEEK_PATTERN[0] - PRO_WEEK_PATTERN[1]) * 6);
    expect(s.teams.filter(t => t.div === 2).every(t => rosterOf(s, t.id).length >= 9)).toBe(true);
    // 두 번 해도 그대로
    migrateCareer(s);
    expect(s.teams).toHaveLength(25);
  });

  it("1부 감독은 선수를 우리 B팀으로 보내고, 다시 데려올 때는 시세의 절반", async () => {
    const { sendToB } = await import("./divisions");
    const { bidPlayer } = await import("./club");
    const { sellMinimum } = await import("@shared/career/contract");
    const s = newCareer(0);
    s.teams[0].money = 100_000;
    const p = rosterOf(s, 0).sort((a, b) => totalOf(a.stats) - totalOf(b.stats))[0];
    sendToB(s, p.id);
    expect(p.team).toBe(13);
    const half = Math.round(sellMinimum(s, p) * 0.5 / 10) * 10;
    expect(bidPlayer(s, p.id, half).result).toBe("agreed");
  });

  it("2부 경기는 어린 선수일수록 크게 성장", async () => {
    const { withStageGrowth, quickSet } = await import("./core");
    const gain = (age: number) => {
      let sum = 0;
      for (let k = 0; k < 200; k++) {
        const s = newCareer(0);
        const [a, b] = rosterOf(s, 13);
        a.birth = 2011 - age; // 1시즌 한국 나이
        a.stats = { ...b.stats };
        const before = totalOf(a.stats);
        withStageGrowth(1, () => quickSet(s, a, b, s.mapPool![0]), true);
        sum += totalOf(a.stats) - before;
      }
      return sum;
    };
    expect(gain(17)).toBeGreaterThan(gain(28));
  });
});

describe("관전 화면용 경기 직전 상태·수입원·새 시즌 컨디션", () => {
  it("개인리그·포스트시즌 중계에 경기 직전 선수 상태(pre)가 오고, 세트 결과(fx)를 더하면 지금 상태가 된다", () => {
    const s = newCareer(4);
    let checked = 0;
    for (let w = 0; w < 16 && s.phase !== "offseason"; w++) {
      const m = myPendingMatch(s);
      const r = advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
      for (const rep of [...(r.mslReports ?? []), ...(r.proReports ?? [])]) {
        expect(rep.pre).toBeDefined();
        for (const set of rep.sets) {
          expect(rep.pre![set.a]).toBeDefined();
          expect(set.fx).toBeDefined();
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 60_000);

  it("관전 위치의 선수 상태: 결승을 보기 전엔 우승 기록이 없고, 경기 전 컨디션이 보인다", async () => {
    const { viewStateAt } = await import("../../client/src/components/legacy/match/viewState");
    const s = newCareer(4);
    let final: ReturnType<typeof advanceWeek> | undefined;
    for (let w = 0; w < 25 && s.phase !== "offseason" && !final; w++) {
      const m = myPendingMatch(s);
      const r = advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
      if (r.mslReports.some(x => x.stage === "결승" && !x.league)) final = r;
    }
    expect(final).toBeDefined();
    const all = [...(final!.proReports ?? []), ...final!.mslReports];
    const k = all.findIndex(x => (x as { stage: string; league?: string }).stage === "결승" && !(x as { league?: string }).league);
    const champ = s.msl!.champion!;
    const title = `${s.season}시즌 마이스타리그 우승`;
    expect(s.players[champ].titles).toContain(title);
    const before = viewStateAt(s, all, k, 0);
    expect(before.players[champ].titles ?? []).not.toContain(title);
    expect(before.players[champ].cond).toBe(all[k].pre![champ].cond);
    // 다 보면 지금 세이브 그대로
    expect(viewStateAt(s, all, all.length).players[champ].titles).toContain(title);
  }, 60_000);

  it("홈 경기 관중 수입·굿즈 판매가 가계부에 들어오고, 정규시즌이 끝나면 순위 상금, 새 시즌엔 중계권 분배금", () => {
    const s = newCareer(0);
    while (s.phase === "regular") { const m = myPendingMatch(s); advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined); if (s.weekHold) completeWeek(s); }
    const items = s.ledger!.items;
    expect(items["관중 수입"]).toBeGreaterThan(0);
    expect(items["굿즈 판매"]).toBeGreaterThan(0);
    const rank = standings(s, 1).findIndex(t => t.id === 0);
    if (rank < 10) expect(items["정규시즌 순위 상금"]).toBeGreaterThan(0);
    s.phase = "offseason";
    for (const p of rosterOf(s, 0)) p.cond = 40;
    startNextSeason(s, { releaseExpiring: true });
    expect(s.ledger!.items["중계권 분배금"]).toBe(500);
    // 새 시즌은 모든 선수 컨디션 100%
    expect(s.players.filter(p => p.team >= 0).every(p => p.cond === 100)).toBe(true);
  }, 60_000);
});

describe("비타비타 여러 개", () => {
  it("컨디션이 가득 차거나 가진 수량이 떨어질 때까지 한 번에 먹인다", () => {
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    p.cond = 80;
    s.inventory = { vitavita: 10 };
    const r = useStockItem(s, "vitavita", p.id, 7);
    expect(p.cond).toBe(100);
    expect(r.used).toBe(7);
    expect(s.inventory.vitavita).toBe(3);
    p.cond = 50;
    const r2 = useStockItem(s, "vitavita", p.id, 17);
    expect(r2.used).toBe(3);
    expect(p.cond).toBe(59);
    expect(s.inventory.vitavita).toBe(0);
  });
});

describe("큰 무대 성장", () => {
  it("포스트시즌·개인리그 8강 이상은 오르는 능력치가 크게 늘어난다", async () => {
    const { withStageGrowth, quickSet } = await import("./core");
    const gain = (mul: number) => {
      let sum = 0;
      for (let k = 0; k < 200; k++) {
        const s = newCareer(0);
        const [a, b] = rosterOf(s, 0);
        const before = totalOf(a.stats) + totalOf(b.stats);
        withStageGrowth(mul, () => quickSet(s, a, b, s.mapPool![0]));
        sum += totalOf(a.stats) + totalOf(b.stats) - before;
      }
      return sum;
    };
    expect(gain(2.2)).toBeGreaterThan(gain(1));
  });
});

describe("조 지명식", () => {
  it("우리 선수가 조장이면 주 마무리 전에 멈추고, 직접 지명한 뒤 마저 진행한다", async () => {
    const { nominate } = await import("./msl");
    let checked = false;
    for (let t = 0; t < 12 && !checked; t++) {
      const s = newCareer(t);
      let guard = 0;
      while (!s.weekHold && s.msl!.groups.length === 0 && guard++ < 20) {
        const m = myPendingMatch(s);
        advanceOnly(s, m ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
        // 개인리그 준비 대기는 바로 진행
        if (s.weekHold?.msl) completeWeek(s);
      }
      // 우리 선수가 조장이 아니면 멈추지 않고 조 편성까지 끝남
      const mineHead = s.msl!.seeds.slice(0, 8).some(id => s.players[id]?.team === s.myTeam);
      // 조장이면 반드시 우리 차례가 옴 (조장이 아니어도 지명받으면 다음 차례에 지명)
      if (mineHead) expect(s.weekHold).toBeDefined();
      if (!s.weekHold) continue;
      const week = s.week;
      expect(() => advanceOnly(s)).toThrow(CareerError);
      // 우리 차례까지 진행 → 직접 지명
      const first = nominate(s);
      const d = s.msl!.draft!;
      expect(first.waiting).not.toBeNull();
      {
        const pick = d.pool[d.pool.length - 1];
        nominate(s, pick);
        expect(d.groups.some(g => g.includes(pick))).toBe(true);
      }
      // 지명받은 선수가 다음 차례에 지명 (조마다 앞 선수 → 뒤 선수)
      const draft = s.msl!.draft!;
      for (const n of s.msl!.nominations) {
        const g = draft.groups.find(x => x.includes(n.pick))!;
        expect(g.indexOf(n.pick)).toBe(g.indexOf(n.by) + 1);
      }
      const r = completeWeek(s);
      expect(s.weekHold).toBeUndefined();
      expect(s.week).toBe(week + 1);
      expect(r.needNomination).toBeUndefined();
      expect(s.msl!.stage).not.toBe("nom");
      checked = true;
    }
    expect(checked).toBe(true);
  });
});

describe("커리어 모드", () => {
  it("원작 데이터로 새 게임을 만든다 (원작 230명 + 2부 신예, 1부·2부 12팀씩 2라운드 풀리그 11주 132경기)", () => {
    const s = newCareer(6);
    expect(s.players.length).toBeGreaterThanOrEqual(230);
    expect(s.players.slice(0, 230).every((p, i) => p.id === i)).toBe(true);
    expect(s.matches).toHaveLength(264);
    expect(s.players.filter(p => p.team === 12).length).toBeGreaterThanOrEqual(15);
    expect(rosterOf(s, 6).some(p => p.name === "이제동")).toBe(true);
  });

  it("엔트리 1~4세트에 같은 선수를 두 번 넣으면 거부한다", () => {
    const s = newCareer(0);
    const id = rosterOf(s, 0)[0].id;
    expect(() => advanceWeek(s, [id, id, id, id, id])).toThrow(CareerError);
  });

  it("선수마다 행동력 20: 훈련 20·이벤트 20·휴식 10, 모자라면 진행되지 않는다", async () => {
    const { runMyActions } = await import("./logic");
    const s = newCareer(0);
    const r = rosterOf(s, 0);
    setAction(s, r[0].id, "train");
    r[1].cond = 60; // 컨디션 100% 면 휴식은 건너뜀
    setAction(s, r[1].id, "rest");
    const first = runMyActions(s);
    expect(first.results.map(x => x.id).sort()).toEqual([r[0].id, r[1].id].sort());
    expect(r[0].ap).toBe(0);
    expect(r[1].ap).toBe(10);
    // 휴식은 한 번 더 가능, 훈련은 행동력 부족
    const second = runMyActions(s);
    expect(second.results.map(x => x.id)).toEqual([r[1].id]);
    expect(second.skipped).toContain(r[0].id);
    expect(() => runMyActions(s)).toThrow(CareerError);
    // 선수 한 명만 실행, 행동력은 선수마다 따로 쌓임 (최대치 없음)
    r[1].ap = 10; r[2].ap = 70;
    setAction(s, r[2].id, "train");
    const one = runMyActions(s, r[2].id);
    expect(one.results.map(x => x.id)).toEqual([r[2].id]);
    expect(r[2].ap).toBe(50);
    expect(r[1].ap).toBe(10);
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
    expect(s.matches.filter(m => ["semi", "po", "final"].includes(m.stage)).map(m => m.stage)).toEqual(["semi", "po", "final"]);
    expect(s.matches.filter(m => m.stage === "promo")).toHaveLength(2);
    rosterOf(s, s.myTeam)[0].contract!.years = 1;
    expect(() => startNextSeason(s)).toThrow(CareerError);
    startNextSeason(s, { releaseExpiring: true });
    expect(s.season).toBe(2);
    expect(s.matches).toHaveLength(264);
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
    // 포텐셜 폭발·컨디션 난조·경기 아이템 해설은 우리가 붙이는 문장이라 제외
    for (const l of lines.filter(x => !/포텐셜이 터졌어요|컨디션 난조입니다|빌드에서 앞서며|치어풀이 보이네요|노리고 나온 것 같은데요/.test(x.text))) {
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
    expect(s.inventory?.m3).toBe(0);
    // 이미 끼고 있어도 더 사서 보관할 수 있고 (최대 99개), 보관함에서 다른 장비로 바꿔 끼울 수 있음
    buyItem(s, "m3", undefined, 3);
    buyItem(s, "m1", undefined, 96);
    // 소모품은 999개까지, 츄잉껌은 한 번에 3개 (50만)
    const money = s.teams[0].money;
    buyItem(s, "gum", undefined, 300);
    expect(s.inventory?.gum).toBe(900);
    expect(money - s.teams[0].money).toBe(50 * 300);
    expect(() => buyItem(s, "gum", undefined, 34)).toThrow("최대 999개");
    buyItem(s, "vitavita", undefined, 2);
    expect(s.inventory?.vitavita).toBe(2);
    expect(s.inventory).toMatchObject({ m3: 3, m1: 96 });
    expect(() => buyItem(s, "m3", undefined, 97)).toThrow("최대 99개");
    // 다른 장비: 지우고 덮어씀 / 같은 장비: 사용 횟수가 더해짐
    equipItem(s, "m1", p.id);
    expect(p.equip?.mouse).toEqual({ key: "m1", left: 30 });
    expect(s.inventory?.m1).toBe(95);
    equipItem(s, "m1", p.id, 2);
    expect(p.equip?.mouse).toEqual({ key: "m1", left: 90 });
    expect(s.inventory?.m1).toBe(93);
    equipItem(s, "m3", p.id);
    expect(p.equip?.mouse).toEqual({ key: "m3", left: 30 });
    expect(s.inventory?.m3).toBe(2);
    // 선수를 골라 사면 산 만큼 바로 장착
    buyItem(s, "m3", p.id, 2);
    expect(p.equip?.mouse).toEqual({ key: "m3", left: 90 });
    expect(s.inventory?.m3).toBe(2);
    expect(() => equipItem(s, "k1", p.id)).toThrow("보유한 장비가 없습니다");
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

  it("포션은 횟수 제한 없이, 경기 아이템은 보유해야 쓸 수 있고 세트를 치를 때 소모된다", () => {
    const s = newCareer(1);
    s.teams[1].money = 100_000;
    const p = rosterOf(s, 1)[0];
    p.cond = 100;
    for (let i = 0; i < 5; i++) buyItem(s, "p_att", p.id);
    expect(p.potions).toBe(5);
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
    p.cond = 40;
    useStockItem(s, "vitavita", p.id);
    expect(p.cond).toBe(43);
    expect(s.inventory!.vitavita).toBe(4);
    p.cond = 100;
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

  it("3주 연속 적자면 구단 해체, 감독 제의를 받으면 새 구단이 영입 계약금을 내고 감독 레벨은 유지", async () => {
    const { acceptJob } = await import("./club");
    const s = newCareer(4);
    s.teams[4].money = -5000;
    for (let i = 0; i < 3 && !s.gameOver; i++) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, 4, PRO_SETS) : undefined);
    }
    expect(s.gameOver?.reason).toContain("해체");
    const { jobSigningFee } = await import("@shared/career/mainSponsor");
    const t = newCareer(4);
    t.teams[4].money = 7777;
    t.manager = { reputation: 70, level: 3, exp: 40 };
    const before = t.teams[0].money, fee = jobSigningFee(t, 0);
    t.phase = "offseason";
    t.jobOffers = [{ team: 0, fee, max: fee * 2, tries: 0, status: "pending" }];
    acceptJob(t, 0);
    expect(t.myTeam).toBe(0);
    expect(t.teams[0].money).toBe(before + fee);
    expect(t.teams[4].money).toBe(7777);
    expect(t.manager).toMatchObject({ level: 3, exp: 40, reputation: 70, teams: [4, 0] });
  });

  it("감독 제의 계약금 역제안: 한도 안이면 합의, 계속 협상 가능 · 옮겨도 감독 레벨 유지", async () => {
    const { respondJob, acceptJob } = await import("./club");
    const s = newCareer(4);
    s.phase = "offseason";
    s.manager = { reputation: 80, level: 5, exp: 120, teams: [4] };
    s.jobOffers = [{ team: 0, fee: 1000, max: 1500, tries: 0, status: "pending" }, { team: 1, fee: 1000, max: 1200, tries: 0, status: "pending" }];
    // 한도 넘게 → 중간값 역제안
    const r1 = respondJob(s, 0, "counter", 1700);
    expect(r1.result).toBe("countered");
    expect(s.jobOffers.find(o => o.team === 0)!.fee).toBe(1250);
    // 한도 안 → 합의 (아직 옮기지 않음)
    const r2 = respondJob(s, 0, "counter", 1400);
    expect(r2.result).toBe("agreed");
    expect(s.myTeam).toBe(4);
    // 너무 높게 불러도 제의는 남고 (횟수 제한 없이 계속 협상), 구단은 조금만 올림
    for (let i = 0; i < 5; i++) expect(respondJob(s, 1, "counter", 5000).result).toBe("countered");
    expect(s.jobOffers.find(o => o.team === 1)!.fee).toBeLessThanOrEqual(1200);
    expect(s.jobOffers.find(o => o.team === 1)!.fee).toBeGreaterThan(1000);
    respondJob(s, 1, "reject");
    expect(s.jobOffers.map(o => o.team)).toEqual([0]);
    const money = s.teams[0].money;
    acceptJob(s, 0);
    expect(s.teams[0].money).toBe(money + 1400);
    expect(s.manager).toMatchObject({ level: 5, exp: 120, reputation: 80 });
    // 다음 시즌을 시작해도 그대로
    startNextSeason(s, { releaseExpiring: true });
    expect(s.manager).toMatchObject({ level: 5, exp: 120 });
  });

  it("예전 세이브의 감독 제의(팀 번호)는 계약금 제의로 바뀐다", () => {
    const s = newCareer(4);
    (s as any).jobOffers = [0, 1];
    migrateCareer(s);
    expect(s.jobOffers!.map(o => o.team)).toEqual([0, 1]);
    expect(s.jobOffers!.every(o => o.max >= o.fee && o.fee > 0)).toBe(true);
  });
});

describe("세대 교체·2부·스폰서", () => {
  it("스폰서 퀘스트 목표를 올리면 보상이 커지고, 달성하면 지급된다", async () => {
    const { chooseSponsor } = await import("./club");
    const { sponsorOffers, questReward } = await import("@shared/career/sponsor");
    const s = newCareer(0);
    const o = sponsorOffers(s)[0];
    const q = o.quests[0];
    expect(questReward(q, q.kind === "rank" ? q.target - 1 : q.target + 1)).toBeGreaterThan(questReward(q, q.target));
    chooseSponsor(s, o.name, o.quests.map(x => x.target));
    // 같은 스폰서는 두 번 계약 못 하고, 최대 3곳까지
    expect(() => chooseSponsor(s, o.name, [])).toThrow(CareerError);
    s.manager = { reputation: 100, level: 10, exp: 0 };
    const list = sponsorOffers(s);
    expect(list.length).toBeGreaterThanOrEqual(4);
    // 4번째 이후 제의도 고를 수 있다 (예전에는 번호 0~2 만 받아 오류)
    const rest = list.filter(x => x.name !== o.name);
    chooseSponsor(s, rest[3].name, []); chooseSponsor(s, rest[0].name, []);
    expect(() => chooseSponsor(s, rest[1].name, [])).toThrow(CareerError);
    expect(() => chooseSponsor(newCareer(0), "없는스폰서", [])).toThrow(CareerError);
    s.sponsors![0].quests[0] = { kind: "teamWins", base: 11, target: 1, baseReward: 100 };
    const money = s.teams[0].money;
    s.teams[0].wins = 1;
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
    expect(s.sponsors![0].quests[0].done).toBe(true);
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
    // 신인은 무소속으로 나오고, 선수가 모자란 구단(2부 B팀 등)이 데려가기도 함
    expect(s.players.slice(count).every(p => p.team >= 0 && p.potential! > 0)).toBe(true);
    expect(s.players.slice(count).some(p => p.team === 12)).toBe(true);
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
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
    expect((s.manager?.exp ?? 0) + (s.manager!.level! - 1) * 100).toBeGreaterThan(0);
    // 한 주 동안 다른 구단끼리 선수가 움직일 수 있으므로, 비교할 선수는 주가 지난 뒤 고른다
    const p = rosterOf(s, 1).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
    const d1 = playerDemand(s, p, 0).salary, f1 = sellMinimum(s, p);
    addManagerExp(s, 5000);
    expect(s.manager!.level!).toBeGreaterThan(5);
    expect(playerDemand(s, p, 0).salary).toBeLessThan(d1);
    expect(sellMinimum(s, p)).toBeLessThan(f1);
  });
});

describe("경기 뒤 변화", () => {
  it("선수 행동은 주가 지나도 유지되고, 세트마다 두 선수 컨디션·경험치 변화가 기록된다", () => {
    const s = newCareer(3);
    const roster = rosterOf(s, 3);
    setAction(s, roster[6].id, "rest");
    const front = roster.slice(0, 4).map(p => p.id);
    beginMatch(s, front);
    expect(s.players[roster[6].id].action).toBe("rest");
    const r = playLiveSet(s);
    // 컨디션은 1 단위: 승자 0~3, 패자 1~6 하락
    const [w, l] = r.set.winner === "a" ? [r.set.fx!.a, r.set.fx!.b] : [r.set.fx!.b, r.set.fx!.a];
    expect(w.cond[0] - w.cond[1]).toBeGreaterThanOrEqual(0);
    expect(w.cond[0] - w.cond[1]).toBeLessThanOrEqual(3);
    if (l.cond[0] > 7) { expect(l.cond[0] - l.cond[1]).toBeGreaterThanOrEqual(1); expect(l.cond[0] - l.cond[1]).toBeLessThanOrEqual(6); }
    expect(r.set.fx!.a.exp + r.set.fx!.b.exp).toBe(40);
  });
});

describe("선수 행동 진행", () => {
  it("휴식 +5, 이벤트는 자금, 주가 끝나면 컨디션 +10·행동력 +20", async () => {
    const { runMyActions } = await import("./logic");
    const s = newCareer(5);
    const r = rosterOf(s, 5);
    r[0].cond = 50; r[1].cond = 50;
    setAction(s, r[0].id, "rest");
    setAction(s, r[1].id, "event");
    const money = s.teams[5].money;
    runMyActions(s);
    expect(r[0].cond).toBe(55);
    expect(r[1].cond).toBeLessThan(50);
    expect(s.teams[5].money).toBeGreaterThan(money);
    // 주가 끝나면 경기(프로리그·개인리그)에 안 나간 선수는 컨디션 +10, 행동력 +20
    for (const p of r) p.cond = 40;
    const front = r.slice(0, 5).map(p => p.id);
    const played = new Set<number>();
    const before = r.map(p => p.wins + p.losses);
    advanceWeek(s, front);
    r.forEach((p, i) => { if (p.wins + p.losses !== before[i]) played.add(p.id); });
    const rested = r.filter(p => !played.has(p.id));
    expect(rested.length).toBeGreaterThan(0);
    for (const p of rested) expect(p.cond).toBe(50);
    expect(r[1].ap).toBe(20);
  });
});

describe("조 지명식", () => {
  it("우리 조장 차례에서 멈추고 직접 지명, 주가 끝나면 조 편성", async () => {
    const { nominate } = await import("./msl");
    // 강한 팀으로 시작해 시드 상위에 우리 선수가 있도록
    const s = newCareer(0);
    for (let w = 0; w < 4; w++) advanceWeek(s, aiEntry(s, 0, PRO_SETS));
    expect(s.msl?.stage).toBe("nom");
    const heads = s.msl!.seeds.slice(0, 8);
    const mineHead = heads.find(id => s.players[id].team === 0);
    const r = nominate(s);
    if (mineHead !== undefined) {
      expect(r.waiting?.head).toBe(mineHead);
      const pick = s.msl!.draft!.pool[0];
      nominate(s, pick);
      expect(s.msl!.draft!.groups.some(g => g[0] === mineHead && g.includes(pick))).toBe(true);
    }
    advanceWeek(s, aiEntry(s, 0, PRO_SETS));
    expect(s.msl!.groups).toHaveLength(8);
    expect(s.msl!.groups.every(g => g.players.length === 4)).toBe(true);
    expect(s.msl!.draft).toBeUndefined();
  });
});

describe("이적시장 등록·여러 제안·제안 기록", () => {
  it("희망가에 내놓으면 여러 구단이 제안하고, 한 건을 받으면 나머지는 기록으로 남는다", async () => {
    const { listPlayer, respondOffer, weeklyClub } = await import("./club");
    const { askingPrice } = await import("@shared/career/rules");
    const s = newCareer(0);
    for (const t of s.teams) t.money = 100_000;
    const p = rosterOf(s, 0).sort((a, b) => b.level - a.level)[0];
    // 시세의 절반이면 거의 모든 구단이 관심
    listPlayer(s, p.id, Math.round(askingPrice(p, s.season) * 0.5));
    for (let i = 0; i < 8 && (s.offers ?? []).filter(o => o.player === p.id).length < 2; i++) weeklyClub(s);
    const mine = s.offers!.filter(o => o.player === p.id);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every(o => o.listed)).toBe(true);
    expect(new Set(mine.map(o => o.team)).size).toBe(mine.length);
    const r = respondOffer(s, mine[0].id, "accept", undefined, "now");
    expect(r.result).toBe("sold");
    expect(p.team).toBe(mine[0].team);
    expect((s.offers ?? []).some(o => o.player === p.id)).toBe(false);
    expect(s.listings ?? []).toHaveLength(0);
    expect(s.offerLog![0]).toMatchObject({ player: p.id, result: "closed" });
    expect(s.offerLog!.some(e => e.result === "sold" && e.player === p.id && e.team === mine[0].team)).toBe(true);
  });

  it("역제안이 받아들여지면 완료 기록이 남는다", async () => {
    const { respondOffer } = await import("./club");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    s.teams[3].money = 50_000;
    s.offers = [{ id: 99, player: p.id, team: 3, fee: 500, max: 900, season: 1, week: 1, tries: 0, status: "pending" }];
    const r = respondOffer(s, 99, "counter", 800);
    expect(r.result).toBe("sold");
    expect(s.offerLog![0]).toMatchObject({ result: "sold", fee: 800, team: 3, player: p.id, dir: "out" });
  });

  it("개인리그 시드는 시즌 시작부터 정해져 일정표에서 미리 볼 수 있다", () => {
    const s = newCareer(0);
    expect(s.msl?.season).toBe(1);
    expect(s.msl?.seeds).toHaveLength(16);
    expect(s.msl?.stage).toBe("pc");
  });
});

describe("가계부·다른 구단 이적·치어풀", () => {
  it("돈이 움직일 때마다 항목·내용·잔액이 가계부에 남는다", () => {
    const s = newCareer(0);
    const start = s.teams[0].money;
    buyItem(s, "gum", undefined, 2);
    const last = s.cashbook!.at(-1)!;
    expect(last).toMatchObject({ cat: "아이템", balance: s.teams[0].money, week: 1 });
    expect(last.amount).toBeLessThan(0);
    expect(last.note).toContain("×2");
    expect(last.balance).toBe(start + last.amount);
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
    // 주간 연봉·운영비·경기 수당이 기록되고, 마지막 잔액 = 지금 자금
    const cats = new Set(s.cashbook!.map(e => e.cat));
    expect(cats.has("연봉")).toBe(true);
    expect(cats.has("운영비")).toBe(true);
    expect([...cats].some(c => c.startsWith("스폰서 승리 수당") || c.startsWith("스폰서 패배 수당"))).toBe(true);
    expect(s.cashbook!.find(e => e.cat.startsWith("스폰서") && e.note?.includes("vs"))).toBeTruthy();
    expect(s.cashbook!.at(-1)!.balance).toBe(s.teams[0].money);
  });

  it("다른 구단끼리 이적·트레이드·방출·영입이 일어나고, 팀 인원은 최소 기준을 지킨다", async () => {
    const { aiMarket } = await import("./club");
    const s = newCareer(0);
    for (const t of s.teams) t.money = 100_000;
    const mine = rosterOf(s, 0).map(p => p.id).sort();
    aiMarket(s, 60);
    const kinds = new Set((s.marketLog ?? []).map(m => m.kind));
    expect(kinds.has("transfer")).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    // 우리 팀은 건드리지 않음
    expect(rosterOf(s, 0).map(p => p.id).sort()).toEqual(mine);
    for (const t of s.teams.slice(0, 12)) if (t.id !== 0) expect(rosterOf(s, t.id).length).toBeGreaterThanOrEqual(6);
  });

  it("치어풀은 그 세트 실제 능력치에 모든 능력치 +75 로 들어간다", async () => {
    const { effStats } = await import("./core");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    const base = effStats(p), cheer = effStats(p, { all: 75 });
    const sum = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(base) as Array<keyof typeof base>) expect(cheer[k]).toBeGreaterThanOrEqual(base[k]);
    expect(sum(cheer)).toBeGreaterThan(sum(base) + 300);
  });
});

describe("개인리그 전 준비·능력치 변동", () => {
  it("우리 경기를 치른 주에 우리 선수가 개인리그에 나가면, 개인리그 전에 멈췄다가 확인하면 진행한다", async () => {
    const { mslPlayersThisWeek } = await import("./msl");
    let checked = false;
    for (let t = 0; t < 12 && !checked; t++) {
      const s = newCareer(t);
      for (let g = 0; g < 9 && !checked; g++) {
        const m = myPendingMatch(s);
        const r = advanceOnly(s, m ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
        if (s.weekHold?.msl?.length) {
          checked = true;
          expect(r.needMsl).toEqual(s.weekHold.msl);
          expect(mslPlayersThisWeek(s)).toEqual(s.weekHold.msl);
          const week = s.week;
          expect(() => advanceOnly(s)).toThrow("이번 주 개인리그를 먼저 진행하세요");
          // 대기 중에도 비타비타는 먹일 수 있음
          const pid = s.weekHold.msl[0];
          s.inventory = { vitavita: 1 };
          s.players[pid].cond = 80;
          useStockItem(s, "vitavita", pid);
          expect(s.players[pid].cond).toBe(83);
          const c = completeWeek(s);
          expect(c.mslReports.length + (c.mslPlans?.length ?? 0)).toBeGreaterThan(0);
          expect(s.week).toBe(week + 1);
        } else if (s.weekHold) completeWeek(s);
      }
    }
    expect(checked).toBe(true);
  });

  it("실제 능력치가 더 높은 상대에게 지면 거의 안 떨어지고, 츄잉껌이면 더 덜 떨어진다", async () => {
    const { setDeltas, lossScale } = await import("./growth");
    expect(lossScale(500)).toBeCloseTo(0.1);
    expect(lossScale(0)).toBe(1);
    expect(lossScale(-700)).toBe(2);
    const s = newCareer(0);
    const [me, opp] = rosterOf(s, 1);
    const mk = (base: number) => ({ ...me, sWins: 0, sLosses: 0, stats: Object.fromEntries(Object.keys(me.stats).map(k => [k, base])) as typeof me.stats, equip: {} });
    const sum = (d: Record<string, number | undefined>) => Object.values(d).reduce((a: number, v) => a + (v ?? 0), 0);
    const avgLoss = (p: typeof me, o: typeof me, gum = false) => {
      let total = 0;
      for (let i = 0; i < 300; i++) total += sum(setDeltas(p, o, false, undefined, 600, gum));
      return total / 300;
    };
    const weak = mk(650), strong = { ...mk(750), id: opp.id };
    const vsStrong = avgLoss(weak, strong), vsEqual = avgLoss(weak, { ...mk(650), id: opp.id }), vsStrongGum = avgLoss(weak, strong, true);
    expect(vsStrong).toBeGreaterThan(vsEqual * 0.25);
    expect(Math.abs(vsStrong)).toBeLessThan(3);
    expect(Math.abs(vsStrongGum)).toBeLessThanOrEqual(Math.abs(vsStrong));
    // 장비를 껴서 등급이 높아 보여도 최상위 등급 패널티는 실제 능력치 기준
    const { topGradeLossMul } = await import("./growth");
    const geared = { ...mk(650), equip: { etc: { key: "e3", left: 10 }, mouse: { key: "m2", left: 10 } } };
    expect(topGradeLossMul(geared as typeof me, mk(600))).toBe(1);
  });

  it("평균보다 많이 낮은 능력치는 잘 오르고 덜 떨어지며, 훈련은 가장 낮은 능력치를 꼭 올린다", async () => {
    const { catchUp } = await import("./growth");
    const { gainStats } = await import("./core");
    const s = newCareer(0);
    const p = rosterOf(s, 1)[0];
    for (const k of Object.keys(p.stats) as (keyof typeof p.stats)[]) p.stats[k] = 700;
    p.stats.defense = 560;
    const cu = catchUp(p, "defense");
    expect(cu.up).toBeGreaterThan(1.9);
    expect(cu.down).toBeLessThan(0.6);
    expect(catchUp(p, "attack").up).toBe(1);
    for (let i = 0; i < 5; i++) {
      const before = p.stats.defense;
      const keys = gainStats(p, 2, 2, 6);
      expect(keys[0]).toBe("defense");
      expect(p.stats.defense).toBeGreaterThan(before);
    }
  });
});

describe("선수 가격·감독 제의·선수 요청", () => {
  it("능력치가 높을수록 가파르게 비싸고, 이번 시즌 활약이 좋으면 더 비싸다", async () => {
    const { askingPrice, formMul } = await import("@shared/career/rules");
    const s = newCareer(0);
    const p = { ...rosterOf(s, 1)[0], sWins: 0, sLosses: 0, level: 10 };
    const at = (v: number) => askingPrice({ ...p, stats: Object.fromEntries(Object.keys(p.stats).map(k => [k, v])) as typeof p.stats }, s.season);
    expect(at(1000)).toBeGreaterThan(10_000);
    expect(at(1000) / at(700)).toBeGreaterThan(3);
    expect(formMul({ ...p, sWins: 10, sLosses: 2 })).toBeGreaterThan(1.2);
    expect(formMul({ ...p, sWins: 2, sLosses: 10 })).toBeLessThan(0.95);
    expect(formMul({ ...p, sWins: 1, sLosses: 0 })).toBe(1);
  });

  it("시즌 중에 감독 제의를 수락하면 시즌이 끝날 때 그 팀으로 옮긴다", async () => {
    const { acceptJob } = await import("./club");
    const s = newCareer(0);
    const target = 3;
    s.jobOffers = [{ team: target, fee: 500, max: 700, tries: 0, status: "pending" }];
    const r = acceptJob(s, target);
    expect(r.pending).toBe(true);
    expect(s.myTeam).toBe(0);
    expect(s.pendingJob?.team).toBe(target);
    let g = 0;
    while (s.phase !== "offseason" && g++ < 40) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
    }
    expect(s.phase).toBe("offseason");
    expect(s.myTeam).toBe(target);
    expect(s.pendingJob).toBeUndefined();
  });

  it("다른 팀 선수의 입단 요청을 수락하면 그 조건으로 바로 계약하고, 우리 선수가 원한 이적을 거절하면 사기가 떨어진다", async () => {
    const { respondJoin, respondOffer } = await import("./club");
    const s = newCareer(0);
    s.teams[0].money = 50_000;
    const p = rosterOf(s, 2)[5];
    s.joinRequests = [{ id: 99, player: p.id, fee: 300, salary: 50, years: 2, season: s.season, week: s.week }];
    const before = s.teams[2].money;
    respondJoin(s, 99, "accept");
    expect(p.team).toBe(0);
    expect(p.contract?.salary).toBe(50);
    expect(s.teams[2].money).toBeGreaterThanOrEqual(before + 300);
    expect(s.joinRequests).toEqual([]);
    const mine = rosterOf(s, 0)[0];
    mine.morale = 60;
    s.offers = [{ id: 7, player: mine.id, team: 4, fee: 500, max: 600, season: s.season, week: s.week, tries: 0, status: "pending", byPlayer: true }];
    respondOffer(s, 7, "reject");
    expect(mine.morale).toBe(45);
  });
});

describe("작전 메모", () => {
  it("그 세트 경기 능력치에 센스 +100·전략 +60 이 들어가고, 화면 계산과 같다", async () => {
    const { effStats } = await import("./core");
    const { setItemExtra, gearStats, ITEM_BY_KEY } = await import("@shared/career/items");
    const s = newCareer(0);
    const p = { ...rosterOf(s, 0)[0], cond: 100, equip: {} };
    const base = effStats(p);
    const boosted = effStats(p, { bonus: ITEM_BY_KEY.memo.setBonus });
    expect(boosted.sense - base.sense).toBe(100);
    expect(boosted.strategy - base.strategy).toBe(60);
    expect(boosted.attack).toBe(base.attack);
    expect(gearStats(p, setItemExtra("memo")).sense).toBe(boosted.sense);
    expect(setItemExtra("cheer").attack).toBe(75);
    // 실제 경기: 보유해야 쓰고, 쓰면 소모
    s.inventory = { memo: 1 };
    const front = rosterOf(s, 0).slice(0, 4).map(x => x.id);
    beginMatch(s, front, { 0: { key: "memo" } });
    const r = playLiveSet(s);
    expect(r.set.item).toBe("memo");
    expect(s.inventory.memo).toBe(0);
  });
});

describe("휴식: 컨디션 100%", () => {
  it("컨디션 100% 선수의 휴식은 실행에서 빠지고 행동력도 그대로", async () => {
    const { runMyActions } = await import("./logic");
    const s = newCareer(0);
    const [full, tired] = rosterOf(s, 0);
    full.cond = 100; tired.cond = 70;
    for (const p of rosterOf(s, 0)) p.action = null;
    full.action = "rest"; tired.action = "rest";
    const r = runMyActions(s);
    expect(r.full).toEqual([full.id]);
    expect(r.results.map(x => x.id)).toEqual([tired.id]);
    expect(full.ap ?? 20).toBe(20);
    tired.action = null;
    expect(() => runMyActions(s)).toThrow("컨디션이 이미 100%라 휴식할 필요가 없습니다");
  });
});

describe("스타 선수 연봉", () => {
  it("스타가 많은 팀일수록 스타의 요구 연봉이 크게 오른다", async () => {
    const { playerDemand, isStar } = await import("@shared/career/contract");
    const s = newCareer(0);
    const ace = rosterOf(s, 0).find(isStar)!;
    const alone = playerDemand(s, ace, 0).salary;
    for (const p of s.players.filter(p => p.team > 0 && p.team < 12 && isStar(p)).slice(0, 4)) p.team = 0;
    expect(playerDemand(s, ace, 0).salary).toBeGreaterThan(alone * 1.6);
  });

  it("연봉 인상 요구: 수락하면 연봉이 오르고, 너무 낮은 역제안·거절이면 부진·능력치 하락·이적 희망 중 하나", async () => {
    const { respondRaise } = await import("./club");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    s.raiseRequest = { player: p.id, salary: 900, years: 3, season: s.season, week: s.week };
    respondRaise(s, "accept");
    expect(p.contract?.salary).toBe(900);
    expect(s.raiseRequest).toBeUndefined();
    for (let i = 0; i < 20; i++) {
      const before = { cond: 100, total: totalOf(p.stats) };
      p.cond = 100; p.wantsOut = false; delete p.sulkUntil;
      s.raiseRequest = { player: p.id, salary: 1000, years: 3, season: s.season, week: s.week };
      const r = respondRaise(s, "counter", 500);
      expect(r.result).toBe("refused");
      expect(p.cond < before.cond || totalOf(p.stats) < before.total || p.wantsOut).toBe(true);
    }
    expect(() => respondRaise(s, "accept")).toThrow("받은 연봉 요구가 없습니다");
  });
});

describe("위너스리그 (3의 배수 시즌)", () => {
  const winnersRule = (sets: { a: number; b: number; winner: "a" | "b" }[]) => {
    for (let i = 1; i < sets.length; i++) {
      const prev = sets[i - 1];
      // 이긴 쪽은 같은 선수, 진 쪽은 새 선수
      if (prev.winner === "a") { expect(sets[i].a).toBe(prev.a); expect(sets[i].b).not.toBe(prev.b); }
      else { expect(sets[i].b).toBe(prev.b); expect(sets[i].a).not.toBe(prev.a); }
    }
  };

  it("3시즌 일정은 위너스리그 (7전 4선승), 다른 팀 경기도 이긴 선수가 계속 나온다", async () => {
    const { scheduleDivision } = await import("./divisions");
    const s = newCareer(0);
    s.season = 3;
    s.matches = [];
    scheduleDivision(s, 1);
    expect(s.matches.length).toBeGreaterThan(0);
    expect(s.matches.every(m => m.winners && m.maps.length === 7)).toBe(true);
    s.season = 4; s.matches = [];
    scheduleDivision(s, 1);
    expect(s.matches.every(m => !m.winners)).toBe(true);
    // AI 경기
    s.season = 3; s.matches = []; s.week = 1;
    scheduleDivision(s, 1);
    const { matchNeed } = await import("@shared/career/rules");
    // 주를 진행하면 다른 팀 경기도 위너스 방식으로 치러짐 (우리 팀은 선봉만 냄)
    advanceWeek(s, aiEntry(s, 0, 7).slice(0, 1));
    const played = s.matches.filter(x => x.done && x.winners && x.a !== 0 && x.b !== 0);
    expect(played.length).toBeGreaterThan(0);
    for (const x of played) {
      expect(Math.max(x.scoreA!, x.scoreB!)).toBe(matchNeed(x));
      winnersRule(x.sets!);
    }
  });

  it("우리 경기: 선봉만 내고, 지면 다음 선수를 고르며 진 선수는 다시 못 나온다", async () => {
    const s = newCareer(0);
    const m = myPendingMatch(s)!;
    m.winners = true;
    m.maps = [...m.maps, ...m.maps].slice(0, 7);
    const roster = rosterOf(s, 0);
    expect(() => beginMatch(s, roster.slice(0, 4).map(p => p.id))).toThrow("선봉");
    beginMatch(s, [roster[0].id]);
    const meA = m.a === 0;
    let guard = 0;
    let over = false;
    const lost = new Set<number>();
    let r = playLiveSet(s);
    while (!over && guard++ < 20) {
      const set = r.set;
      const mineId = meA ? set.a : set.b;
      const myWin = (set.winner === "a") === meA;
      if (!myWin) lost.add(mineId);
      over = r.matchOver;
      if (over) break;
      expect(r.needAce).toBe(!myWin);
      if (r.needAce) {
        expect(() => playLiveSet(s)).toThrow("다음 세트에 나갈 선수");
        if (lost.size < roster.length) expect(() => playLiveSet(s, [...lost][0])).toThrow("진 선수는");
        const next = roster.find(p => !lost.has(p.id))!;
        r = playLiveSet(s, next.id);
      } else r = playLiveSet(s);
    }
    expect(over).toBe(true);
    const done = s.matches.find(x => x.id === m.id)!;
    expect(Math.max(done.scoreA!, done.scoreB!)).toBe(4);
    winnersRule(done.sets!);
  });
});

describe("팬미팅 수익·인기", () => {
  it("인기가 높을수록 수익이 크고 최대 150만, 개인리그 우승이 프로리그 우승보다 인기에 크게 반영", async () => {
    const { eventIncome, popularity, EVENT_INCOME_MAX } = await import("@shared/career/contract");
    const s = newCareer(0);
    const byPop = rosterOf(s, 0).sort((a, b) => popularity(b) - popularity(a));
    const star = byPop[0], rookie = byPop[byPop.length - 1];
    expect(eventIncome(star)).toBeGreaterThan(eventIncome(rookie) * 3);
    const maxed = { ...star, level: 15, wins: 300, titles: ["1시즌 마이스타리그 우승", "2시즌 마이스타리그 우승"] };
    expect(eventIncome(maxed)).toBe(EVENT_INCOME_MAX);
    const base = { ...rookie, titles: [] as string[] };
    const msl = popularity({ ...base, titles: ["1시즌 마이스타리그 우승"] }) - popularity(base);
    const pro = popularity({ ...base, titles: ["1시즌 프로리그 우승"] }) - popularity(base);
    expect(msl).toBeGreaterThan(pro * 3);
  });
});

describe("컨디션 난조", () => {
  it("주마다 컨디션과 관계없이 일부 선수가 난조: 그 주 경기 컨디션 -40 (최저 10), 다음 주엔 풀림", async () => {
    const { rollWeekBursts, effStats } = await import("./core");
    const { slumpOn, slumpCond, SLUMP_CHANCE } = await import("@shared/career/rules");
    const { matchCond } = await import("@shared/career/items");
    expect(slumpCond(100)).toBe(60);
    expect(slumpCond(90)).toBe(50);
    expect(slumpCond(40)).toBe(10);
    expect(slumpCond(25)).toBe(10);
    const s = newCareer(0);
    for (const p of s.players) p.cond = 100;
    s.burstWeek = undefined;
    rollWeekBursts(s);
    const slumped = s.players.filter(p => p.team >= 0 && slumpOn(s, p));
    const n = s.players.filter(p => p.team >= 0).length;
    expect(slumped.length).toBeGreaterThan(n * SLUMP_CHANCE * 0.3);
    const p = { ...slumped[0], equip: {} };
    expect(matchCond(p, s)).toBe(60);
    expect(effStats(p, { slump: true }).attack).toBeLessThan(effStats(p).attack);
    s.week++;
    expect(slumpOn(s, p)).toBe(false);
    expect(matchCond(p, s)).toBe(100);
  });
});

describe("결장 감각 저하·팬미팅 능력치", () => {
  it("프로리그에 2주 이상 연속 못 나간 선수는 능력치가 줄고, 나간 선수는 결장 주 수가 0", async () => {
    const { benchDecay } = await import("./logic");
    const s = newCareer(0);
    const m = myPendingMatch(s);
    advanceWeek(s, m ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
    const played = s.players.filter(p => p.team >= 0 && p.lastProWeek === `${s.season}-${s.week - 1}`);
    expect(played.length).toBeGreaterThan(0);
    for (const p of played) expect(p.benchWeeks).toBe(0);
    // 결장 1주째인 선수가 이번 주도 못 나가면 2주째 → 능력치 하락
    const p = rosterOf(s, 1)[0];
    p.benchWeeks = 1; p.lastProWeek = undefined;
    const before = totalOf(p.stats);
    benchDecay(s);
    expect(p.benchWeeks).toBe(2);
    expect(totalOf(p.stats)).toBeLessThan(before);
    // 이번 주에 나간 선수는 그대로
    const q = rosterOf(s, 2)[0];
    q.lastProWeek = `${s.season}-${s.week}`; q.benchWeeks = 5;
    const qb = totalOf(q.stats);
    benchDecay(s);
    expect(totalOf(q.stats)).toBe(qb);
  });

  it("위너스리그 시즌에는 결장해도 실전 감각이 떨어지지 않는다", async () => {
    const { benchDecay } = await import("./logic");
    const s = newCareer(0);
    s.season = 3;
    const p = rosterOf(s, 1)[0];
    p.benchWeeks = 4; p.lastProWeek = undefined;
    const before = totalOf(p.stats);
    benchDecay(s);
    expect(totalOf(p.stats)).toBe(before);
    expect(p.benchWeeks).toBe(0);
  });

  it("팬미팅(이벤트)을 하면 능력치가 조금 떨어진다", async () => {
    const { runMyActions } = await import("./logic");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    for (const x of rosterOf(s, 0)) x.action = null;
    p.action = "event";
    const before = totalOf(p.stats);
    runMyActions(s);
    expect(totalOf(p.stats)).toBeLessThan(before);
    expect(before - totalOf(p.stats)).toBeLessThanOrEqual(4);
  });
});

describe("다른 팀(컴퓨터) 경기 아이템", () => {
  it("다른 팀도 세트마다 가끔 경기 아이템을 쓰고, 산 아이템은 구단 자금에서 나간다", () => {
    const s = newCareer(0);
    for (const t of s.teams) t.money = 100_000;
    for (let w = 0; w < 6; w++) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
    }
    const sets = s.matches.filter(m => m.done).flatMap(m => m.sets ?? []);
    const used = sets.filter(x => x.aiItems);
    expect(used.length).toBeGreaterThan(0);
    const keys = new Set(used.flatMap(x => Object.values(x.aiItems!)));
    expect([...keys].every(k => ["cheer", "memo", "gum", "sniping", "ceremony"].includes(k!))).toBe(true);
    // 우리 팀 쪽에는 컴퓨터 아이템이 붙지 않음
    for (const m of s.matches.filter(x => x.done && (x.a === 0 || x.b === 0))) {
      for (const x of m.sets ?? []) expect(x.aiItems?.[m.a === 0 ? "a" : "b"]).toBeUndefined();
    }
  });
});

describe("컨디션·스나이핑·스폰서 협상력", () => {
  it("컨디션이 낮을수록 능력치가 크게 깎인다 (난조 -40 이면 큰 차이)", async () => {
    const { condMultiplier } = await import("@shared/career/rules");
    expect(condMultiplier(100)).toBe(1);
    expect(condMultiplier(90)).toBeGreaterThanOrEqual(0.85);
    expect(condMultiplier(90)).toBeLessThanOrEqual(0.9);
    expect(condMultiplier(60)).toBeGreaterThan(0.5);
    expect(condMultiplier(50)).toBeGreaterThan(0.44);
    expect(condMultiplier(10)).toBeLessThan(0.3);
    expect(condMultiplier(90)).toBeGreaterThan(condMultiplier(80));
  });

  it("스나이핑이 적중하면 훨씬 약한 선수로도 65% 이상 이긴다", async () => {
    const { quickWin, playSet } = await import("./core");
    const s = newCareer(0);
    const [a] = s.players.filter(p => p.team >= 0).sort((x, y) => totalOf(x.stats) - totalOf(y.stats));
    const strong = s.players.filter(p => p.team >= 0).sort((x, y) => totalOf(y.stats) - totalOf(x.stats))[0];
    let quick = 0, live = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      a.cond = 100; strong.cond = 100;
      if (quickWin(s, a, strong, 0, { a: { snipe: true } })) quick++;
    }
    for (let i = 0; i < 60; i++) {
      a.cond = 100; strong.cond = 100;
      if (playSet(s, a, strong, 0, false, false, { a: { snipe: true } }).winner === "a") live++;
    }
    expect(quick / N).toBeGreaterThan(0.57);
    expect(live / 60).toBeGreaterThan(0.5);
  });

  it("메인 스폰서 예산: 지난 시즌 우승·개인리그 우승이면 크게 오르고, 강등이면 크게 깎인다", async () => {
    const { sponsorBudget, sponsorFactors, SPONSOR_STRETCH } = await import("@shared/career/mainSponsor");
    const { negotiateMainSponsor } = await import("./club");
    const s = newCareer(0);
    const base = sponsorBudget(s);
    s.history.unshift({ season: 1, champion: 0, myRank: 1, myResult: "우승", team: 0, myMsl: 1 });
    const good = sponsorBudget(s);
    expect(good).toBeGreaterThan(base * 1.4);
    expect(sponsorFactors(s).items.length).toBeGreaterThan(0);
    s.history[0] = { season: 1, champion: 3, myRank: 12, myResult: "강등", team: 0 };
    expect(sponsorBudget(s)).toBeLessThan(base * 0.6);
    // 예산보다 조금 높은 제안도 계약
    s.history.shift();
    s.phase = "offseason";
    const k = (base * (SPONSOR_STRETCH - 0.03)) / base;
    const { defaultOffer } = await import("@shared/career/mainSponsor");
    const d = defaultOffer(s);
    const terms = Object.fromEntries(Object.entries(d).map(([key, v]) => [key, Math.floor(v * k)])) as typeof d;
    expect(negotiateMainSponsor(s, terms, 1).result).toBe("signed");
  });
});

describe("경기마다 바뀌는 상태·컨디션·이적 자금·아이템 세트", () => {
  it("승리 0~3·패배 1~6 컨디션 하락, 다전제는 바뀐 컨디션으로 다음 세트를 치른다", async () => {
    const { playSet } = await import("./core");
    const s = newCareer(0);
    const [a, b] = rosterOf(s, 1);
    for (let i = 0; i < 30; i++) {
      a.cond = 100; b.cond = 100;
      const r = playSet(s, a, b, 0, false);
      const w = r.winner === "a" ? a : b;
      expect(100 - w.cond).toBeGreaterThanOrEqual(0);
      expect(100 - w.cond).toBeLessThanOrEqual(3);
      // 다음 세트 기록의 시작 컨디션은 직전 세트 끝 컨디션
      const r2 = playSet(s, a, b, 1, false);
      expect(r2.fx!.a.cond[0]).toBe(r.fx!.a.cond[1]);
    }
  });

  it("경기를 마친 선수는 포텐셜 폭발·컨디션 난조를 새로 정한다 (같은 주라도)", () => {
    const s = newCareer(0);
    const wk = `${s.season}-${s.week}`;
    for (const p of s.players) { if (p.team >= 0) { p.slump = wk; delete p.burst; } }
    // 우리 1경기 (한 주 2경기라 주는 그대로)
    const entry = aiEntry(s, s.myTeam, PRO_SETS).slice(0, PRO_SETS - 1);
    beginMatch(s, entry);
    let r;
    do r = playLiveSet(s, entry[0]); while (!r.matchOver);
    expect(s.week).toBe(1);
    const played = [...new Set(r.set ? s.matches.find(x => x.id === r.playedMatchId)!.sets!.flatMap(x => [x.a, x.b]) : [])];
    const stillSlumped = played.filter(id => s.players[id].slump === wk).length;
    expect(played.length).toBeGreaterThan(0);
    expect(stillSlumped).toBeLessThan(played.length * 0.4);
    // 안 나온 선수는 그대로
    const rest = s.players.filter(p => p.team >= 0 && !played.includes(p.id) && p.team !== s.myTeam && !s.matches.some(m => m.done && m.week === 1 && (m.a === p.team || m.b === p.team)));
    expect(rest.every(p => p.slump === wk)).toBe(true);
  });

  it("다른 팀은 ACE 결정전·위너스리그 2세트부터는 아이템을 쓰지 않는다", () => {
    const s = newCareer(0);
    for (const t of s.teams) t.money = 100_000;
    for (let w = 0; w < 8; w++) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
    }
    for (const m of s.matches.filter(x => x.done)) {
      (m.sets ?? []).forEach((x, i) => { if (i >= PRO_SETS - 1) expect(x.aiItems).toBeUndefined(); });
    }
  });

  it("우리 선수 이적료가 조금 모자라면 AI 구단이 이적 희망·잘 안 쓰는 선수를 정리해 맞춘다", async () => {
    const { respondOffer } = await import("./club");
    const s = newCareer(0);
    const p = rosterOf(s, 0).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[5];
    const buyer = s.teams[3];
    const before = rosterOf(s, 3).length;
    const extra = rosterOf(s, 3).sort((a, b) => totalOf(a.stats) - totalOf(b.stats))[0];
    extra.wantsOut = true;
    s.offers = [{ id: 1, player: p.id, team: 3, fee: 1000, max: 1200, season: 1, week: 1, tries: 0, status: "pending" }];
    buyer.money = 850;
    const r = respondOffer(s, 1, "accept");
    expect(r.result).toBe("sold");
    expect(p.team).toBe(3);
    expect(extra.team).not.toBe(3);
    expect(rosterOf(s, 3).length).toBe(before);
    // 크게 모자라면 그대로 거절
    const q = rosterOf(s, 0).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[4];
    s.offers = [{ id: 2, player: q.id, team: 3, fee: 3000, max: 3000, season: 1, week: 1, tries: 0, status: "pending" }];
    buyer.money = 500;
    expect(() => respondOffer(s, 2, "accept")).toThrow();
  });

  it("다른 구단은 우리 선수에게 낸 제안 금액을 다른 데 쓰지 않는다", async () => {
    const { freeMoney } = await import("./core");
    const s = newCareer(0);
    s.teams[3].money = 2000;
    s.offers = [{ id: 1, player: rosterOf(s, 0)[0].id, team: 3, fee: 1500, max: 1800, season: 1, week: 1, tries: 0, status: "pending" }];
    expect(freeMoney(s, 3)).toBe(200);
  });
});

describe("포텐셜 폭발도 컨디션처럼 줄어듦", () => {
  it("포텐셜 114% 선수가 경기하면 떨어진 컨디션만큼 배율도 줄고, 100% 이하면 끝난다", async () => {
    const { playSet } = await import("./core");
    const s = newCareer(0);
    const [a, b] = rosterOf(s, 1);
    const wk = `${s.season}-${s.week}`;
    a.cond = 100; b.cond = 100;
    a.burst = { week: wk, mul: 1.14 };
    delete a.slump;
    const r = playSet(s, a, b, 0, false);
    const lost = 100 - a.cond;
    expect(r.fx!.a.burst).toEqual([1.14, Math.round((1.14 - lost / 100) * 100) / 100]);
    expect(a.burst?.mul).toBeCloseTo(1.14 - lost / 100, 5);
    a.burst = { week: wk, mul: 1.02 };
    // 쉽게 이기면 컨디션이 안 떨어질 수도 있으므로 몇 세트
    for (let i = 0; i < 20 && a.burst; i++) playSet(s, a, b, i % 10, false);
    expect(a.burst).toBeUndefined();
  });
});

describe("선수단 최소 8명 · 떠난 선수 제안 정리", () => {
  it("방출·이적으로 8명 아래로 줄일 수 없다", async () => {
    const { respondOffer } = await import("./club");
    const s = newCareer(0);
    while (rosterOf(s, 0).length > 8) releasePlayer(s, rosterOf(s, 0).at(-1)!.id);
    expect(rosterOf(s, 0).length).toBe(8);
    expect(() => releasePlayer(s, rosterOf(s, 0)[0].id)).toThrow(/최소 8명/);
    const p = rosterOf(s, 0)[0];
    s.offers = [{ id: 7, player: p.id, team: 3, fee: 100, max: 100, season: 1, week: 1, tries: 0, status: "pending" }];
    s.teams[3].money = 100_000;
    expect(() => respondOffer(s, 7, "accept")).toThrow(/최소 8명/);
    expect(p.team).toBe(0);
  });

  it("팀을 떠난 선수에게 남은 제안은 정리된다", async () => {
    const { pruneOffers } = await import("./club");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    s.offers = [{ id: 8, player: p.id, team: 3, fee: 100, max: 100, season: 1, week: 1, tries: 0, status: "pending" }];
    releasePlayer(s, p.id);
    pruneOffers(s);
    expect(s.offers).toEqual([]);
  });

  it("계약 만료·은퇴로 8명보다 적어지면 새 시즌에 무소속 선수가 배정된다", () => {
    const s = newCareer(0);
    while (rosterOf(s, 0).length > 8) releasePlayer(s, rosterOf(s, 0).at(-1)!.id);
    s.phase = "offseason";
    for (const p of rosterOf(s, 0).slice(0, 3)) p.contract = { salary: p.contract?.salary ?? 100, years: 1 };
    startNextSeason(s, { releaseExpiring: true });
    expect(rosterOf(s, 0).length).toBeGreaterThanOrEqual(8);
  });
});

describe("컨디션 하락: 실력 차이·경기 길이", () => {
  it("쉽게 이기면 0~2, 비슷하면 1~3 / 크게 지거나 장기전 3~6, 비슷한 실력 패배 1~4", async () => {
    const { playSet } = await import("./core");
    const s = newCareer(0);
    const ps = s.players.filter(p => p.team >= 0 && p.team < 12).sort((x, y) => totalOf(y.stats) - totalOf(x.stats));
    const strong = ps[0], weak = ps.at(-1)!;
    const loss = { easyWin: [] as number[], bigLoss: [] as number[] };
    for (let i = 0; i < 40; i++) {
      strong.cond = 100; weak.cond = 100;
      const r = playSet(s, strong, weak, i % 10, false);
      if (r.winner === "a") { loss.easyWin.push(100 - strong.cond); loss.bigLoss.push(100 - weak.cond); }
    }
    expect(loss.easyWin.length).toBeGreaterThan(10);
    expect(Math.max(...loss.easyWin)).toBeLessThanOrEqual(2);
    expect(Math.min(...loss.bigLoss)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...loss.bigLoss)).toBeLessThanOrEqual(6);
  });
});

describe("역제안 금액 유지", () => {
  it("우리가 부른 역제안 금액은 상대가 다시 역제안해도 제안에 그대로 남는다", async () => {
    const { respondOffer } = await import("./club");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    s.teams[3].money = 100_000;
    s.offers = [{ id: 5, player: p.id, team: 3, fee: 500, max: 800, season: 1, week: 1, tries: 0, status: "pending" }];
    const r = respondOffer(s, 5, "counter", 950);
    expect(r.result).toBe("countered");
    const o = s.offers!.find(x => x.id === 5)!;
    expect(o.myCounter).toBe(950);
    expect(o.fee).toBeGreaterThan(500);
  });
});

describe("이적 요청은 다음 주에 답 · 적응기간 · 개인리그 컨디션", () => {
  it("시즌 중 영입 요청·스카웃은 다음 주에 답이 오고, 답이 온 주에는 바로 협상한다", async () => {
    const { requestBid, requestScout, requestTrade } = await import("./logic");
    const s = newCareer(0);
    s.teams[0].money = 100_000;
    const target = rosterOf(s, 3).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[3];
    const r = requestBid(s, target.id, 50_000);
    expect(r.result).toBe("sent");
    expect(() => requestBid(s, target.id, 50_000)).toThrow(/이미/);
    const fa = rosterOf(s, 12).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
    expect(requestScout(s, fa.id).result).toBe("sent");
    expect(fa.team).toBe(12);
    const give = rosterOf(s, 0).sort((a, b) => totalOf(a.stats) - totalOf(b.stats))[0];
    expect(requestTrade(s, 5, [give.id], [rosterOf(s, 5)[0].id], 0).result).toBe("sent");
    advanceWeek(s, aiEntry(s, s.myTeam, PRO_SETS));
    // 답이 옴: 충분한 이적료면 합의 (이번 주 계약 가능), 스카웃은 영입
    const bid = s.outbox!.find(x => x.kind === "bid")!;
    expect(bid.reply?.week).toBe(s.week);
    expect(bid.reply?.result).toBe("agreed");
    expect(s.agreements?.[target.id]?.week).toBe(s.week);
    expect(fa.team).toBe(0);
    expect(s.outbox!.find(x => x.kind === "trade")!.reply).toBeDefined();
    // 시즌 중 영입 선수는 적응기간: 프로리그 엔트리에 못 넣음
    const { adaptWeeksLeft } = await import("@shared/career/rules");
    expect(adaptWeeksLeft(s, fa)).toBeGreaterThan(0);
    expect(aiEntry(s, 0, PRO_SETS)).not.toContain(fa.id);
    expect(() => beginMatch(s, [fa.id, ...aiEntry(s, 0, PRO_SETS).filter(id => id !== fa.id).slice(0, PRO_SETS - 2)])).toThrow(/적응기간/);
    // 답이 온 주에는 바로 협상 (영입 요청이 즉시 결과)
    const other = rosterOf(s, 4).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[3];
    s.outbox!.push({ id: 999, kind: "bid", team: 4, player: other.id, fee: 1, season: s.season, week: s.week - 1, reply: { ok: false, result: "countered", message: "", season: s.season, week: s.week } });
    expect(requestBid(s, other.id, 1).result).not.toBe("sent");
    // 2주가 지나면 출전 가능, 적응기간 동안은 결장 감소 없음
    advanceWeek(s, myPendingMatch(s) ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
    expect(fa.benchWeeks ?? 0).toBe(0);
  });

  it("비시즌엔 영입 요청·스카웃이 바로 처리된다", async () => {
    const { requestScout } = await import("./logic");
    const s = newCareer(0);
    s.phase = "offseason";
    s.teams[0].money = 100_000;
    const fa = rosterOf(s, 12)[0];
    expect(requestScout(s, fa.id).result).toBe("signed");
    expect(fa.team).toBe(0);
    expect(fa.newcomer).toBeUndefined();
  });

  it("개인리그에서는 이기고 진 선수의 컨디션 하락이 비슷하다 (진 선수가 같거나 1 더)", async () => {
    const { playSet, withEvenFatigue } = await import("./core");
    const s = newCareer(0);
    const ps = s.players.filter(p => p.team >= 0 && p.team < 12).sort((x, y) => totalOf(y.stats) - totalOf(x.stats));
    const [a, b] = [ps[0], ps.at(-1)!];
    for (let i = 0; i < 30; i++) {
      a.cond = 100; b.cond = 100;
      const r = withEvenFatigue(() => playSet(s, a, b, i % 10, false));
      const [w, l] = r.winner === "a" ? [a, b] : [b, a];
      const dw = 100 - w.cond, dl = 100 - l.cond;
      expect(dl - dw).toBeGreaterThanOrEqual(0);
      expect(dl - dw).toBeLessThanOrEqual(1);
    }
  });
});

describe("난이도", () => {
  it("초급은 시작 자금·수입이 많고, 고급은 적으며 비타비타가 경기 전 선수당 1개", async () => {
    const { pay } = await import("./club");
    const { useStockItem } = await import("./logic");
    const easy = newCareer(0, "easy"), normal = newCareer(0), hard = newCareer(0, "hard");
    expect(easy.teams[0].money).toBeGreaterThan(normal.teams[0].money);
    expect(hard.teams[0].money).toBeLessThan(normal.teams[0].money);
    for (const s of [easy, normal, hard]) { s.teams[0].money = 0; pay(s, "상금", 1000); pay(s, "연봉", -100); pay(s, "이적료 수입", 500); }
    expect(easy.teams[0].money).toBe(1300 - 85 + 500);
    expect(normal.teams[0].money).toBe(1000 - 100 + 500);
    expect(hard.teams[0].money).toBe(800 - 115 + 500);
    // 고급: 비타비타는 다음 경기 전까지 선수당 1개
    const p = rosterOf(hard, 0)[0];
    p.cond = 50;
    hard.inventory = { vitavita: 10, vita_s: 5 };
    const r = useStockItem(hard, "vitavita", p.id, 5);
    expect(r.used).toBe(1);
    expect(() => useStockItem(hard, "vita_s", p.id, 1)).toThrow(/1개까지/);
    // 경기를 치르면 다시 먹일 수 있음
    const { rerollAfterMatch } = await import("./core");
    rerollAfterMatch(hard, [p.id]);
    expect(useStockItem(hard, "vitavita", p.id, 1).used).toBe(1);
    // 중급은 제한 없음
    const q = rosterOf(normal, 0)[0];
    q.cond = 50;
    normal.inventory = { vitavita: 10 };
    expect(useStockItem(normal, "vitavita", q.id, 5).used).toBe(5);
  });

  it("동족전은 능력치가 꽤 낮은 선수도 빌드가 맞으면 이긴다", async () => {
    const { quickWin } = await import("./core");
    const s = newCareer(0);
    const ps = s.players.filter(p => p.team >= 0 && p.team < 12 && p.race === "zerg").sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
    const strong = ps[0], weak = ps[Math.floor(ps.length * 0.6)];
    delete weak.slump; delete strong.slump; delete weak.burst; delete strong.burst;
    let w = 0;
    for (let i = 0; i < 400; i++) { weak.cond = 100; strong.cond = 100; if (quickWin(s, weak, strong, i % 10)) w++; }
    expect(w).toBeGreaterThan(8);
  });
});

describe("후원 · 시즌 후 이적 · 감독 이적 신청 · 스폰서 종류", () => {
  it("후원을 받으면 자금이나 소모품(1~5개)이 들어온다", async () => {
    const { claimGift } = await import("./gifts");
    const s = newCareer(0);
    s.gifts = [{ id: 1, from: "익명의 팬", money: 120, season: 1, week: 1 }, { id: 2, from: "팬클럽", item: { key: "vitavita", qty: 4 }, season: 1, week: 1 }];
    const money = s.teams[0].money;
    claimGift(s, 1);
    expect(s.teams[0].money).toBeGreaterThan(money);
    const before = s.inventory?.vitavita ?? 0;
    claimGift(s, 2);
    expect(s.inventory!.vitavita).toBe(before + 4);
    expect(s.gifts).toHaveLength(0);
    expect(s.giftLog!.map(g => g.id)).toEqual([2, 1]);
    expect(() => claimGift(s, 2)).toThrow(CareerError);
  });

  it("시즌 후 이적: 이적료는 바로 받고 선수는 새 시즌에 옮긴다 (그 전엔 방출·트레이드 불가)", async () => {
    const { respondOffer } = await import("./club");
    const { AFTER_SEASON_FEE } = await import("@shared/career/rules");
    const s = newCareer(0);
    const p = rosterOf(s, 0)[0];
    s.teams[3].money = 50_000;
    s.offers = [{ id: 7, player: p.id, team: 3, fee: 1000, max: 1500, season: 1, week: 1, tries: 0, status: "pending" }];
    const money = s.teams[0].money;
    const r = respondOffer(s, 7, "accept", undefined, "after");
    expect(r.result).toBe("sold");
    expect(p.team).toBe(0);
    expect(s.teams[0].money).toBe(money + Math.round((1000 * AFTER_SEASON_FEE) / 10) * 10);
    expect(() => releasePlayer(s, p.id)).toThrow(/시즌이 끝나면/);
    s.phase = "offseason";
    startNextSeason(s, { releaseExpiring: false });
    // 새 시즌에 3번 구단으로 옮김 (그 뒤 비시즌 이적시장에서 또 움직일 수는 있음)
    if (p.retired === undefined) {
      expect(p.team).not.toBe(0);
      expect(s.news.some(n => n.text.includes(`${p.name} 선수가 ${s.teams[3].name}`))).toBe(true);
    }
    expect(s.pendingMoves ?? []).toHaveLength(0);
  });

  it("시즌 후 합류 영입: 이적료를 내고 새 시즌에 우리 팀으로 온다", async () => {
    const { bidPlayer, negotiateContract } = await import("./club");
    const { playerDemand } = await import("@shared/career/contract");
    const s = newCareer(0);
    s.teams[0].money = 100_000;
    const target = rosterOf(s, 3).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[4];
    expect(bidPlayer(s, target.id, 50_000, "after").result).toBe("agreed");
    const d = playerDemand(s, target, 0);
    expect(negotiateContract(s, target.id, { salary: d.salary * 2, years: 2 }).result).toBe("signed");
    expect(target.team).toBe(3);
    expect(s.pendingMoves).toHaveLength(1);
    s.phase = "offseason";
    startNextSeason(s, { releaseExpiring: false });
    if (target.retired === undefined) {
      expect(target.team).toBe(0);
      expect(target.contract?.years).toBe(2);
      expect(s.news.some(n => n.text.includes(`${target.name} 선수가 우리 팀에 합류`))).toBe(true);
    }
  });

  it("감독 이적 신청: 평판이 되면 구단이 계약금을 제시하고, 시즌 중 합의는 취소할 수 있다", async () => {
    const { requestJob, acceptJob, cancelPendingJob } = await import("./club");
    const s = newCareer(4);
    s.manager = { reputation: 100, teams: [4] };
    const r = requestJob(s, 0);
    expect(r.result).toBe("countered");
    expect(s.jobOffers!.find(o => o.team === 0)?.applied).toBe(true);
    expect(() => requestJob(s, 0)).toThrow(CareerError);
    acceptJob(s, 0);
    expect(s.pendingJob?.team).toBe(0);
    cancelPendingJob(s);
    expect(s.pendingJob).toBeUndefined();
    expect(s.myTeam).toBe(4);
    s.manager.reputation = 0;
    expect(requestJob(s, 1).result).toBe("rejected");
  });

  it("계약금형 스폰서는 계약하자마자 계약금을 준다", async () => {
    const { chooseSponsor } = await import("./club");
    const { sponsorOffers } = await import("@shared/career/sponsor");
    for (let team = 0; team < 12; team++) {
      const s = newCareer(team);
      const o = sponsorOffers(s).find(x => x.signing);
      if (!o) continue;
      const money = s.teams[team].money;
      chooseSponsor(s, o.name, o.quests.map(q => q.target));
      expect(s.teams[team].money).toBeGreaterThan(money);
      return;
    }
  });
});

describe("18주 시즌 · MSL/OSL", () => {
  it("정규시즌 18주: 주마다 0~2경기 (NO MATCH 주 포함), 팀당 22경기, 개인리그 두 개가 끝까지 진행된다", async () => {
    const { REGULAR_WEEKS, secondLeagueOf } = await import("@shared/career/rules");
    const s = newCareer(0);
    expect(s.regularWeeks).toBe(REGULAR_WEEKS);
    const mine = (w: number) => s.matches.filter(m => m.week === w && m.div === 1 && (m.a === 0 || m.b === 0)).length;
    for (let w = 1; w <= REGULAR_WEEKS; w++) expect(mine(w)).toBe(PRO_WEEK_PATTERN[w - 1]);
    expect(s.matches.filter(m => m.a === 0 || m.b === 0)).toHaveLength(22);
    expect(PRO_WEEK_PATTERN.some(c => c === 0)).toBe(true);
    expect(s.msl2?.league).toBe(secondLeagueOf(1));
    let guard = 0;
    while (s.phase !== "offseason" && guard++ < 40) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
    }
    expect(s.phase).toBe("offseason");
    expect(s.msl!.champion).toBeDefined();
    expect(s.msl2!.champion).toBeDefined();
    const h = s.history[0];
    expect(h.indiv?.map(x => x.league).sort()).toEqual(["msl", "mysl"]);
    expect(s.players[s.msl2!.champion!].titles?.some(t => t.includes("MSL 우승"))).toBe(true);
    // 다음 시즌은 OSL
    startNextSeason(s, { releaseExpiring: true });
    expect(s.msl2?.league).toBe("osl");
  }, 120_000);

  it("예전 11주 세이브는 그 시즌을 11주 일정으로 마치고, 다음 시즌부터 18주", async () => {
    const { scheduleDivision } = await import("./divisions");
    const s = newCareer(0);
    delete s.regularWeeks;
    delete s.msl2;
    delete s.msl!.v2;
    s.matches = [];
    scheduleDivision(s, 1);
    scheduleDivision(s, 2);
    expect(Math.max(...s.matches.map(m => m.week))).toBe(11);
    let guard = 0;
    while (s.phase === "regular" && guard++ < 20) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, PRO_SETS) : undefined);
    }
    expect(s.week).toBe(12);
    expect(s.msl2).toBeUndefined();
    while (s.phase !== "offseason" && guard++ < 40) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, s.myTeam, m.stage === "final" ? FINAL_SETS : PRO_SETS) : undefined);
    }
    expect(s.msl!.champion).toBeDefined();
    startNextSeason(s, { releaseExpiring: true });
    expect(s.regularWeeks).toBe(18);
    expect(s.msl!.v2).toBe(true);
    expect(s.msl2).toBeDefined();
  }, 120_000);
});
