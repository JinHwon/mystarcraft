import { describe, expect, it } from "vitest";
import { FINAL_SETS, PRO_SETS, totalOf, type CareerState } from "@shared/career/rules";
import { CareerError, advanceWeek as advanceOnly, completeWeek, aiEntry, beginMatch, buyItem, migrateCareer, useStockItem, myPendingMatch, newCareer, playLiveSet, proposeTrade, releasePlayer, rosterOf, scoutPlayer, setAction, standings, startNextSeason } from "./logic";

/** 한 주 진행 (우리 선수가 조장인 조 지명식에서 멈추면 자동 지명으로 마저 진행) */
function advanceWeek(s: CareerState, entry?: number[]) {
  const r = advanceOnly(s, entry);
  return s.weekHold ? { ...completeWeek(s), broadcast: r.broadcast } : r;
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

describe("2부 리그", () => {
  it("정규시즌 매주 2경기, 우리 2부 선수는 항상 참가, 어릴수록 크게 성장, 끝나면 우승자", async () => {
    const { ageOf } = await import("@shared/career/rules");
    const s = newCareer(0);
    const young = s.players.filter(p => p.team === 12).sort((a, b) => ageOf(a, s.season) - ageOf(b, s.season))[0];
    young.team = 0; young.reserve = true;
    const before = totalOf(young.stats);
    let guard = 0;
    while (s.phase === "regular" && guard++ < 20) {
      const m = myPendingMatch(s);
      advanceWeek(s, m ? aiEntry(s, 0, PRO_SETS) : undefined);
      if (guard === 1) {
        const L = s.reserveLeague!;
        expect(L.field).toContain(young.id);
        expect(L.field.length).toBeGreaterThanOrEqual(16);
        expect(L.last.length).toBe(Math.floor(L.field.length / 2) * 2); // 한 주 2경기
        // 다른 구단 2부 선수도 참가
        expect(L.field.some(id => s.players[id].reserve && s.players[id].team !== 0 && s.players[id].team !== 12)).toBe(true);
      }
    }
    const L = s.reserveLeague!;
    const [w, l] = L.table[young.id];
    expect(w + l).toBeGreaterThanOrEqual(20); // 홀수 인원이면 가끔 쉼
    expect(L.champion).toBeDefined();
    expect(s.players[L.champion!].titles?.some(t => t.includes("2부리그 우승"))).toBe(true);
    // 16세 유망주는 한 시즌에 크게 성장
    expect(totalOf(young.stats) - before).toBeGreaterThan(150);
  });
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

  it("선수마다 행동력 20: 훈련 20·이벤트 20·휴식 10, 모자라면 진행되지 않는다", async () => {
    const { runMyActions } = await import("./logic");
    const s = newCareer(0);
    const r = rosterOf(s, 0);
    setAction(s, r[0].id, "train");
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
    // 포텐셜 폭발 해설은 우리가 붙이는 문장이라 제외
    for (const l of lines.filter(x => !x.text.includes("포텐셜이 터졌어요"))) {
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
    p.cond = 100;
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

  it("감독 제의 계약금 역제안: 한도 안이면 합의, 너무 높으면 철회 · 옮겨도 감독 레벨 유지", async () => {
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
    // 너무 높으면 철회
    expect(respondJob(s, 1, "counter", 5000).result).toBe("withdrawn");
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
    // 2부 훈련으로 크지만, 개인리그 예선에서 지면 떨어질 수도 있음
    const after = Object.values(fa.stats).reduce((a, b) => a + b, 0);
    expect(after >= before || fa.losses > 0).toBe(true);
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
    // 컨디션은 1 단위: 승자 0~3, 패자 3~10 하락
    const [w, l] = r.set.winner === "a" ? [r.set.fx!.a, r.set.fx!.b] : [r.set.fx!.b, r.set.fx!.a];
    expect(w.cond[0] - w.cond[1]).toBeGreaterThanOrEqual(0);
    expect(w.cond[0] - w.cond[1]).toBeLessThanOrEqual(3);
    if (l.cond[0] > 12) { expect(l.cond[0] - l.cond[1]).toBeGreaterThanOrEqual(3); expect(l.cond[0] - l.cond[1]).toBeLessThanOrEqual(10); }
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
    for (let i = 0; i < 3 && (s.offers ?? []).filter(o => o.player === p.id).length < 2; i++) weeklyClub(s);
    const mine = s.offers!.filter(o => o.player === p.id);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every(o => o.listed)).toBe(true);
    expect(new Set(mine.map(o => o.team)).size).toBe(mine.length);
    const r = respondOffer(s, mine[0].id, "accept");
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
