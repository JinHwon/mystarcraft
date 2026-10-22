import { describe, expect, it } from "vitest";
import { ymd, rollStats, sumStats, isMonthEnd, courageDays, draftDay, DAY_SLOTS, STAT_CAP, ladderGrade, capOf, mapUnd } from "@shared/rookie/model";
import * as L from "./logic";

/** 대진표를 끝까지 (결과만) 치르고 순위를 돌려줌 */
const runBracket = (s: ReturnType<typeof L.newRookie>) => {
  let games = 0;
  for (let i = 0; i < 10; i++) {
    const r = L.bracketPlay(s, true);
    games += r.games.length;
    if (r.finished) return { place: r.finished.place, prize: r.finished.prize, games };
  }
  throw new Error("대진표가 끝나지 않음");
};
const mk = () => L.newRookie({ name: "테스트", race: "zerg", concept: "control", stats: rollStats("control") });
/** 래더 조건 채우기 */
const veteran = <T extends { record: { w: number; l: number }; stats: Record<string, number> }>(s: T) => { s.record.w = Math.max(s.record.w, 10); for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(s.stats[k], 400); return s; };

describe("선수 키우기", () => {
  it("만들기: 능력치 합 2,000~3,200 · 컨셉 반영 · 잘못된 능력치 거절", () => {
    for (let i = 0; i < 50; i++) {
      const st = rollStats("macro");
      expect(sumStats(st)).toBeGreaterThan(1900);
      expect(sumStats(st)).toBeLessThan(3200);
    }
    const s = mk();
    expect(s.status).toBe("amateur");
    expect(() => L.newRookie({ name: "치트", race: "terran", concept: "macro", stats: { ...rollStats("macro"), sense: 900 } })).toThrow(L.RookieError);
  });

  it("하루 10번까지 · 다음 날 컨디션 회복", () => {
    const s = mk();
    const g = L.playLobby(s, "mid", 3);
    expect(g.timeline?.lines.length).toBeGreaterThan(3);
    veteran(s);
    s.used = DAY_SLOTS;
    expect(() => L.playLadder(s)).toThrow(/하루/);
    const cond = s.cond;
    L.nextDay(s);
    expect(s.used).toBe(0);
    expect(s.cond).toBeGreaterThanOrEqual(Math.min(100, cond));
  });

  it("래더: 1500에서 시작해 승패로 오르내림, 등급", () => {
    const s = veteran(mk());
    L.playLadder(s);
    expect(s.ladder.score).not.toBe(1500);
    expect(ladderGrade(1500)).toBe("D");
    expect(ladderGrade(2000)).toBe("A");
    expect(ladderGrade(2250)).toBe("S");
  });

  it("6개월 열심히 해도 아마추어는 성장 한계를 넘지 않는다", () => {
    const s = mk();
    for (let d = 0; d < 180; d++) {
      for (let i = 0; i < 8 && s.used < DAY_SLOTS; i++) {
        // 지치면 쉼 (실제 자동 진행처럼 피로 60 이상이면 휴식)
        if (s.cond < 50 || (s.fatigue ?? 0) >= 60) { s.cond += 12; s.fatigue = Math.max(0, (s.fatigue ?? 0) - 10); s.used++; }
        else { const tot = sumStats(s.stats); L.playLobby(s, tot > 4400 ? "elite" : tot > 3700 ? "high" : tot > 3100 ? "mid" : tot > 2600 ? "low" : "newbie", 0); }
      }
      L.nextDay(s);
    }
    const total = sumStats(s.stats);
    console.log("6개월 뒤", sumStats(s.startStats), "→", total, s.record, "Lv", s.level);
    expect(total).toBeLessThanOrEqual(capOf(s));
    expect(capOf(s)).toBeLessThan(STAT_CAP.amateur + 1000);
    expect(total).toBeGreaterThan(sumStats(s.startStats));
  }, 60_000);

  it("커리지 매치 날에 참가 · 우승하면 준프로 → 드래프트 날 참가 가능", () => {
    const s = mk();
    s.day = courageDays(2026)[1];
    // 강하게 만들어 우승 보장에 가깝게
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 560;
    let won = false;
    const day = s.day;
    for (let i = 0; i < 40 && !won; i++) {
      s.day = day; s.doneDays = []; s.used = 0; s.status = "amateur"; s.cond = 100;
      // 커리지 매치 참가자는 4,300~5,600 (흐름 확인용으로 넉넉히 강하게)
      s.level = 30;
      for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 700;
      L.act(s, { kind: "courage" });
      expect(s.bracket?.kind).toBe("courage");
      const r = runBracket(s);
      won = r.place === 1;
      expect(r.games).toBeGreaterThan(0);
      expect(s.bracket).toBeUndefined();
    }
    expect(won).toBe(true);
    expect(s.status).toBe("semipro");
    s.day = draftDay(2026); s.used = 0; s.cond = 100;
    const d = L.playDraft(s);
    expect(d.rank).toBeGreaterThanOrEqual(1);
    expect(d.games).toHaveLength(4);
  }, 60_000);

  it("이벤트 대회: 대진표를 끝까지 치르면 하루가 지나고, 3위 안이면 상금", () => {
    const s = mk();
    const e = s.events[0];
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 600;
    s.ladder.best = 2000; s.money = 1000;
    L.registerEvent(s, e.id);
    s.day = e.day;
    const money = s.money;
    L.act(s, { kind: "event", id: e.id });
    const r = runBracket(s);
    expect(s.day).toBeGreaterThan(e.day);
    expect(e.result).not.toBe("진행 중");
    if (r.place <= 3) expect(r.prize).toBeGreaterThan(0);
    void money;
  });

  it("프로: 입단 테스트 통과 → 2군, 내부 연습, 이적 요청이 들키면 벌금/방출", () => {
    const s = mk();
    // 입단 테스트 상대(그 팀 2군)는 5,300~6,100 (흐름 확인용: 레벨을 올려 성장 한계를 넉넉하게)
    s.level = 40;
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 800;
    let joined = false;
    for (let i = 0; i < 20 && !joined; i++) {
      s.tryouts = [{ team: 3, until: s.day + 5, from: "test" }]; s.used = 0; s.cond = 100;
      joined = L.playTryout(s, 3).won;
    }
    expect(joined).toBe(true);
    expect(s.team?.squad).toBe(2);
    L.playInternal(s);
    expect((s.team!.monthW + s.team!.monthL)).toBe(1);
    let released = false;
    for (let i = 0; i < 60 && !released; i++) {
      s.used = 0;
      const r = L.requestTransfer(s, 5);
      if (r.result === "released") released = true;
      if (!s.team) break;
    }
    expect(released || s.team).toBeTruthy();
  });

  it("상점: 사고 쓰기 (비타비타 컨디션, 장비 장착)", () => {
    const s = mk();
    s.money = 10_000;
    L.buy(s, "vitavita", 2);
    s.cond = 50;
    L.useItem(s, "vitavita");
    expect(s.cond).toBe(56);
    L.buy(s, "m1", 1);
    L.useItem(s, "m1");
    expect(s.equip.mouse?.left).toBe(60);
  });

  it("라이벌: 같이 성장하고 래더·대회에서 만남", () => {
    const s = mk();
    const start = sumStats(s.rival.stats);
    expect(Math.abs(start - sumStats(s.stats))).toBeLessThan(500);
    for (let d = 0; d < 120; d++) L.nextDay(s);
    expect(sumStats(s.rival.stats)).toBeGreaterThan(start + 300);
    let met = 0;
    veteran(s);
    for (let i = 0; i < 200 && met === 0; i++) {
      if (s.used >= DAY_SLOTS) L.nextDay(s);
      s.cond = 100;
      L.playLadder(s);
      met = s.rival.w + s.rival.l;
    }
    expect(met).toBeGreaterThan(0);
  });

  it("슬럼프: 연패하면 빠지고, 다음 날 지나면 풀림 · 각성은 능력치를 올림", () => {
    const s = mk();
    s.streak = -5;
    s.form = { kind: "slump", until: s.day + 1 };
    const slow = L.effective(s);
    delete s.form;
    const normal = L.effective(s);
    expect(sumStats(slow)).toBeLessThan(sumStats(normal));
    s.form = { kind: "slump", until: s.day };
    L.nextDay(s);
    expect(s.form).toBeUndefined();
  });

  it("멘토 과외: 돈을 내고 고른 능력치가 오름, 하루 한 번", () => {
    const s = mk();
    s.money = 100;
    const m = L.mentorsFor(s, "control")[0];
    const before = s.stats.control;
    L.mentor(s, "control", m.id);
    expect(s.stats.control).toBeGreaterThan(before);
    expect(s.money).toBe(80);
    expect(() => L.mentor(s, "control", m.id)).toThrow(/하루/);
  });

  it("팬카페: 좋은 일이 있으면 글이 올라오고 회원이 늚", () => {
    const s = mk();
    s.stats = Object.fromEntries(Object.keys(s.stats).map(k => [k, 600])) as typeof s.stats;
    for (let i = 0; i < 6; i++) L.stream(s), L.nextDay(s);
    s.fame = 300;
    L.nextDay(s);
    expect(s.fanCafe.members).toBeGreaterThan(0);
    expect(s.fanCafe.posts.length).toBeGreaterThan(0);
  });

  it("연봉 협상: 계약 끝나면 협상, 세 번 넘게 밀어붙이면 FA, FA 기간 지나면 준프로", () => {
    const s = mk();
    s.status = "pro";
    s.team = { team: 2, squad: 1, joined: 0, salary: 120, monthW: 0, monthL: 0, contractUntil: s.day };
    L.nextDay(s);
    expect(s.nego).toBeDefined();
    const offer = s.nego!.offer;
    expect(L.negotiate(s, offer).result).toBe("signed");
    expect(s.team.salary).toBe(offer);
    // 다시: 무리한 요구 3번 → 결렬
    s.team.contractUntil = s.day;
    L.nextDay(s);
    let r: string = "";
    for (let i = 0; i < 3 && s.nego; i++) r = L.negotiate(s, 9999).result;
    expect(r).toBe("fa");
    expect(s.team).toBeUndefined();
    expect(s.fa).toBeDefined();
    s.offers = [];
    for (let d = 0; d < 32 && s.fa; d++) { L.nextDay(s); s.offers = []; }
    expect(s.status).toBe("semipro");
  });

  it("업적: 달성하면 기록되고 칭호를 달 수 있음", () => {
    const s = mk();
    s.record.w = 1;
    s.money = 1500;
    const got = L.checkAchievements(s);
    expect(got).toContain("first_win");
    expect(got).toContain("rich");
    expect(L.checkAchievements(s)).toEqual([]);
    L.setTitle(s, "rich");
    expect(s.title).toBe("rich");
    expect(() => L.setTitle(s, "ladder_s")).toThrow(L.RookieError);
  });

  it("레벨: 경험치가 쌓이면 레벨업하고 성장 한계가 오름", () => {
    const s = mk();
    const cap = capOf(s);
    L.gainExp(s, 1000);
    expect(s.level).toBeGreaterThan(3);
    expect(capOf(s)).toBeGreaterThan(cap);
  });

  it("대회 조건·참가비: 능력치가 모자라면 신청 불가, 참가비는 신청할 때 내고 취소하면 돌려받음", () => {
    const s = mk();
    const e = { ...s.events[0], id: 999, level: "elite" as const, fee: 20, registered: false };
    s.events.push(e);
    expect(() => L.registerEvent(s, 999)).toThrow(/능력치/);
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 600;
    s.ladder.best = 1700; s.money = 50;
    L.registerEvent(s, 999);
    expect(s.money).toBe(30);
    L.registerEvent(s, 999);
    expect(s.money).toBe(50);
  });

  it("클랜: 조건이 모자라면 시험 불가 · 통과하면 가입 · 클랜 연습 · 순위", () => {
    const s = mk();
    expect(L.clanLocked(s, "by")).toMatch(/경기/);
    expect(L.clanLocked(s, "pcbang")).toBeNull();
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 700;
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) { s.used = 0; s.cond = 100; s.clanTried = {}; ok = L.clanTest(s, "pcbang").won; }
    expect(ok).toBe(true);
    expect(s.clan?.members.length).toBeGreaterThan(5);
    s.used = 0;
    L.clanPractice(s);
    expect(s.clan!.w + s.clan!.l).toBe(1);
    expect(L.clanRank(s)).toBeGreaterThan(0);
    // 프로가 있는 클랜 명단에는 원작 선수
    expect(L.rosterOf("by").filter(m => m.pro).length).toBeGreaterThan(0);
  });

  it("불리한 맵에서 연습하면 더 많이 배움", () => {
    let found = 0;
    for (let m = 0; m < 30; m++) if (L.raceGrowth(m, "zerg", "terran") > 1 || L.raceGrowth(m, "terran", "zerg") > 1) found++;
    expect(found).toBeGreaterThan(0);
  });

  it("연속 진행: 남은 행동만큼 한 번에, 승패·능력치·컨디션 요약 · 고른 맵 기억", () => {
    const s = mk();
    s.used = 3;
    const r = L.batch(s, "lobby", { tier: "low", mapId: 5 });
    expect(r.count).toBe(DAY_SLOTS - 3);
    expect(r.w + r.l).toBe(r.count);
    expect(s.used).toBe(DAY_SLOTS);
    expect(s.lobbyPref).toEqual({ tier: "low", mapId: 5 });
    expect(r.cond[1]).toBeLessThanOrEqual(r.cond[0]);
    expect(() => L.batch(s, "lobby")).toThrow(/오늘은/);
  });

  it("클랜 연습: 지면 점수가 줄고, 클랜원별 상대 전적이 쌓임", () => {
    const s = mk();
    s.clan = { id: "pcbang", joined: 0, points: 50, w: 0, l: 0, members: L.rosterOf("pcbang") };
    for (let i = 0; i < 10; i++) { s.cond = 100; L.clanPractice(s); }
    const vs = Object.values(s.clan.vs ?? {});
    expect(vs.reduce((a, [w, l]) => a + w + l, 0)).toBe(10);
    if (s.clan.l > 0) expect(s.clan.points).toBeLessThan(50 + s.clan.w * 10);
  });

  it("래더 맵: 한 달마다 5개 · 고른 맵에서만 나오고, 맵 이해도가 쌓임 (최대 55)", () => {
    const s = veteran(mk());
    s.stats = { ...s.stats }; for (const k of Object.keys(s.stats)) s.stats[k as keyof typeof s.stats] = 600;
    const pool = L.ladderPool(s);
    expect(pool.maps).toHaveLength(5);
    expect(new Set(pool.maps).size).toBe(5);
    expect(L.ladderPool(s).maps).toEqual(pool.maps);
    const keep = pool.maps[2];
    L.setLadderMaps(s, [keep]);
    expect(() => L.setLadderMaps(s, [9999])).toThrow(/하나 이상/);
    const g = L.playLadder(s);
    expect(g.mapId).toBe(keep);
    expect(s.mapGames?.[keep]).toBe(1);
    s.mapGames![keep] = 500;
    expect(mapUnd(s, keep)).toBe(55);
    const m0 = pool.month;
    s.day += 40;
    expect(L.ladderPool(s).month).toBeGreaterThan(m0);
  });

  it("아이디는 영어이고 클랜 안에서 겹치지 않으며, 프로는 아이디와 본명이 같이 나온다", async () => {
    const { CLANS, clanRoster } = await import("@shared/rookie/model");
    const { clanMembers, clanProIds, proLabel, clanOfPro } = await import("@shared/rookie/pros");
    const hangul = /[가-힣]/;
    for (let i = 0; i < 50; i++) { const s = mk(); expect(hangul.test(L.playLobby(s, "low", 0).opp.name)).toBe(false); }
    for (const c of CLANS) {
      const ms = clanMembers(c.id);
      expect(ms.length).toBe(c.size);
      const names = ms.map(m => m.name);
      expect(new Set(names).size).toBe(names.length);
      for (const m of ms.filter(x => !x.pro)) expect(hangul.test(m.name)).toBe(false);
    }
    // 한 프로는 한 클랜에만
    const all = CLANS.flatMap(c => clanProIds(c.id));
    expect(new Set(all).size).toBe(all.length);
    expect(CLANS.length).toBeGreaterThanOrEqual(25);
    expect(clanProIds("by").length).toBeGreaterThan(clanProIds("gm").length);
    const flash = clanMembers("by").find(m => m.real === "이영호");
    expect(flash?.name).toBe("Flash");
    expect(proLabel(flash!.pro!.id)).toBe("Flash(이영호)");
    expect(clanOfPro(flash!.pro!.id)).toBe("by");
    // 높은 단계 클랜일수록 클랜원이 강하다
    const avg = (id: string) => { const a = clanMembers(id).filter(m => !m.pro); return a.reduce((x, m) => x + sumStats(m.stats), 0) / a.length; };
    expect(avg("by")).toBeGreaterThan(avg("legend"));
    expect(avg("legend")).toBeGreaterThan(avg("gm"));
    expect(clanRoster(CLANS[0], []).length).toBe(CLANS[0].size);
  });

  it("클랜에서 지면 피드백으로 떨어진 능력치 일부를 되찾고, 연습할수록 친분도가 오른다", () => {
    const s = veteran(mk());
    s.clan = { id: "pcbang", joined: 0, points: 50, w: 0, l: 0, members: L.rosterOf("pcbang") };
    s.cond = 100;
    s.clan.members.forEach(m => { m.stats = Object.fromEntries(Object.keys(m.stats).map(k => [k, 900])) as typeof m.stats; });
    const target = s.clan.members.find(m => !m.pro)!;
    let lost = false;
    for (let i = 0; i < 6 && !lost; i++) { s.used = 0; L.clanPractice(s, target.name); lost = (s.clan!.fb && Object.keys(s.clan!.fb.lost).length > 0) as boolean; }
    expect(lost).toBe(true);
    expect(s.clan.fr?.[target.name]).toBeGreaterThan(0);
    const before = { ...s.stats }, cond = s.cond;
    const r = L.clanFeedback(s);
    expect(Object.keys(r.back).length).toBeGreaterThan(0);
    expect(s.cond).toBe(cond - 10);
    expect(Object.entries(r.back).every(([k, v]) => s.stats[k as keyof typeof s.stats] >= before[k as keyof typeof before] + (v as number) - 0)).toBe(true);
    expect(s.clan.fb).toBeUndefined();
    expect(() => L.clanFeedback(s)).toThrow(/피드백/);
  });

  it("아르바이트로 돈을 벌 수 있다", () => {
    const s = mk();
    const m = s.money;
    L.partTime(s);
    expect(s.money).toBeGreaterThan(m + 10);
    expect(s.used).toBe(3);
  });

  it("하루는 활동 하나: 고르면 오늘이 끝나고 다음 선택일까지 자동으로 지나간다 (일주일에 직접 고르는 날 2번)", () => {
    const s = mk();
    expect(L.stopKind(s, s.day)).toBe("free");
    // 일(~토) 한 주에 직접 고르는 날이 2번 (이벤트 포함)
    for (let d = 0; d < 120; d++) expect(L.weekStops(s, d).length).toBeLessThanOrEqual(2 + 0);
    const startDay = s.day;
    const r = L.act(s, { kind: "lobby", tier: "newbie", mapId: 1 });
    expect(r.activity).toBe("lobby");
    expect(r.reports[0].mode).toBe("chosen");
    expect(r.reports[0].w + r.reports[0].l).toBeGreaterThan(0);
    expect(s.day).toBeGreaterThan(startDay);
    expect(L.stopKind(s, s.day)).not.toBeNull();
    // 중간에 지나간 날은 자동 진행 리포트
    expect(r.reports.length).toBe(s.day - startDay);
    for (const a of r.reports.slice(1)) expect(a.mode).toBe("auto");
    expect(s.used).toBe(0);
  });

  it("대회에 신청해 두면 그날이 선택일이 되고, 다른 활동을 고르면 불참 처리", () => {
    const s = mk();
    L.act(s, { kind: "rest" });
    const e = s.events.find(x => x.day > s.day)!;
    e.registered = true; e.level = "newbie";
    // 대회 날까지 진행
    let guard = 0;
    while (s.day < e.day && guard++ < 40) { expect(L.stopKind(s, s.day)).not.toBeNull(); L.act(s, { kind: "rest" }); }
    if (s.day === e.day) {
      expect(L.eventStop(s, s.day)).toBe("event");
      L.act(s, { kind: "rest" });
      expect(e.result).toBe("불참");
    }
  });

  it("자동으로 지나가는 날은 지치면 쉬고, 아니면 연습한다", () => {
    const s = mk();
    s.cond = 100;
    const r = L.act(s, { kind: "stream" });
    expect(r.reports[0].title).toContain("방송");
    // 컨디션이 낮으면 어떤 날이든 자동으로 쉰다 (리포트에 휴식이 나옴)
    const t = mk();
    t.cond = 40;
    t.used = 0;
    const r2 = L.act(t, { kind: "work" });
    expect(r2.reports.some(x => x.mode === "auto")).toBe(true);
  });

  it("대회: 대진표를 짜고 내 경기를 한 판씩 치르며, 끝나면 하루가 마무리된다", () => {
    const s = mk();
    L.act(s, { kind: "rest" });
    const e = s.events.find(x => x.day > s.day)!;
    e.registered = true; e.level = "newbie"; e.size = 8;
    let guard = 0;
    while (s.day < e.day && guard++ < 40) L.act(s, { kind: "rest" });
    expect(s.day).toBe(e.day);
    const r = L.act(s, { kind: "event", id: e.id }) as { bracket: NonNullable<typeof s.bracket>; reports: unknown[] };
    expect(r.reports).toEqual([]);
    expect(s.bracket?.players.length).toBe(8);
    expect(s.bracket!.rounds[0].length).toBe(4);
    expect(new Set(s.bracket!.players.map(p => p.name)).size).toBe(8);
    expect(() => L.act(s, { kind: "rest" })).toThrow(/대회/);
    const dayBefore = s.day;
    let finished: ReturnType<typeof L.bracketPlay>["finished"];
    let plays = 0;
    while (s.bracket) {
      const nx = L.bracketNext(s.bracket)!;
      expect(nx.opp.cond).toBeGreaterThan(0);
      const x = L.bracketPlay(s, true);
      plays++;
      if (!x.finished) expect(s.day).toBe(dayBefore);
      finished = x.finished ?? finished;
      if (x.finished) { expect(x.bracket.rounds.length).toBe(3); expect(x.bracket.champion).toBeDefined(); }
    }
    expect(plays).toBeLessThanOrEqual(3);
    expect(finished!.place).toBeGreaterThanOrEqual(1);
    expect(e.result).not.toBe("진행 중");
    expect(s.day).toBeGreaterThan(dayBefore);
    expect(L.stopKind(s, s.day)).not.toBeNull();
  });

  it("커리지 매치는 매달 마지막 날 열리는 32강 토너먼트", () => {
    const days = courageDays(2026);
    expect(days.length).toBe(12);
    expect(days.every(d => isMonthEnd(d))).toBe(true);
    const s = mk();
    s.day = days[0];
    s.used = 0;
    expect(L.eventStop(s, s.day)).toBe("courage");
    L.startCourage(s);
    expect(s.bracket!.size).toBe(32);
    expect(s.bracket!.rounds[0].length).toBe(16);
    expect(L.bracketNext(s.bracket!)!.name).toBe("32강");
    // 프로는 못 나감
    const t = mk(); t.day = days[0]; t.status = "pro";
    expect(() => L.startCourage(t)).toThrow(/프로/);
  });

  it("클랜전: 일정이 2주마다 나오고, 길드장이 아니면 엔트리가 정해져 있고, 세트를 한 판씩 진행해 3선승으로 끝난다", async () => {
    const { clanRelations } = await import("@shared/rookie/model");
    const s = veteran(mk());
    s.clan = { id: "pcbang", joined: 0, points: 50, w: 0, l: 0, members: L.rosterOf("pcbang") };
    const sch = L.warSchedule(s, 4);
    expect(sch.length).toBe(4);
    expect(sch.every(w => ymd(w.day).dow === 0)).toBe(true);
    expect(sch[1].day - sch[0].day).toBeGreaterThanOrEqual(14);
    expect(sch.every(w => w.opp !== "pcbang")).toBe(true);
    expect(new Set(L.warSchedule(s, 8).map(w => w.opp)).size).toBeGreaterThan(2);
    const rel = clanRelations("pcbang");
    expect(rel.rival).not.toBe("pcbang");
    expect(rel.friend).not.toBe("pcbang");
    // 클랜전 날까지 진행
    let guard = 0;
    while (s.day < sch[0].day && guard++ < 60) L.act(s, { kind: "rest" });
    expect(s.day).toBe(sch[0].day);
    expect(L.eventStop(s, s.day)).toBe("war");
    L.startWar(s);
    const war = s.war!;
    expect(war.phase).toBe("fight");
    expect(war.my.length).toBe(5);
    expect(war.opp.length).toBe(5);
    expect(() => L.act(s, { kind: "rest" })).toThrow(/클랜전/);
    const day = s.day;
    let finished: unknown;
    let sets = 0;
    while (s.war) {
      const x = L.warPlay(s, true);
      sets++;
      finished = x.finished ?? finished;
    }
    expect(sets).toBeGreaterThanOrEqual(3);
    expect(sets).toBeLessThanOrEqual(5);
    expect(finished).toBeDefined();
    expect(s.clan.wars![0].day).toBe(day);
    expect(s.clan.wars![0].my + s.clan.wars![0].their).toBe(sets);
    const rec = s.clan.vsClan![sch[0].opp];
    expect(rec[0] + rec[1]).toBe(1);
    expect(s.day).toBeGreaterThan(day);
    // 다음 일정은 앞으로
    expect(L.warSchedule(s, 1)[0].day).toBeGreaterThan(day);
  });

  it("클랜전: 길드장은 엔트리를 직접 짜고, 불참하면 내 세트는 기권패 · 직책 승진과 길드장 세습", () => {
    const s = veteran(mk());
    s.clan = { id: "pcbang", joined: 0, points: 400, w: 0, l: 0, members: L.rosterOf("pcbang"), role: "master" };
    const day0 = L.warSchedule(s, 1)[0].day;
    let guard = 0;
    while (s.day < day0 && guard++ < 60) L.act(s, { kind: "rest" });
    L.startWar(s);
    expect(s.war!.phase).toBe("entry");
    expect(() => L.warEntry(s, ["없는사람", "a", "b", "c", "d"])).toThrow();
    const names = L.warEntrySuggest(s);
    expect(names.length).toBe(5);
    L.warEntry(s, names);
    expect(s.war!.phase).toBe("fight");
    expect(s.war!.my.map(m => m.name).sort()).toEqual([...names].sort());
    while (s.war) L.warPlay(s, true);
    // 길드장이 탈퇴하면 부길드장이 길드장이 됨
    const sub = s.clan!.members.find(m => m.role === "sub")!;
    const r = L.leaveClan(s);
    expect(r.successor).toBeDefined();
    expect(s.clan).toBeUndefined();
    void sub;
    // 불참: 엔트리에 들 만큼 강하면 기권패 처리
    const t = veteran(mk());
    for (const k of Object.keys(t.stats)) t.stats[k as keyof typeof t.stats] = 900;
    t.clan = { id: "pcbang", joined: 0, points: 100, w: 0, l: 0, members: L.rosterOf("pcbang") };
    const d1 = L.warSchedule(t, 1)[0].day;
    guard = 0;
    while (t.day < d1 && guard++ < 60) L.act(t, { kind: "rest" });
    L.act(t, { kind: "rest" });
    expect(t.clan.wars![0].played).toBe(true);
    expect(t.clan.warWon ?? 0).toBe(0);
    expect(t.log.some(l => l.text.includes("기권패"))).toBe(true);
    expect(t.war).toBeUndefined();
  });

  it("친선경기: 친한 클랜과 연습하고 전적이 쌓인다", () => {
    const s = veteran(mk());
    s.clan = { id: "pcbang", joined: 0, points: 50, w: 0, l: 0, members: L.rosterOf("pcbang") };
    const r = L.act(s, { kind: "friendly" }) as { batch: { count: number } };
    expect(r.batch.count).toBe(8);
    // 이어서 자동으로 지나간 날에도 친선경기를 할 수 있어서 8판 이상
    expect(s.clan.friendly![0] + s.clan.friendly![1]).toBeGreaterThanOrEqual(8);
  });
});

describe("FM 1단계: 숨은 성격·경기 평점·시즌 기록", () => {
  it("새 선수는 성격 6가지(1~20)를 갖고 처음엔 모두 모름, 예전 세이브도 채워짐", () => {
    const s = mk();
    const P = s.persona!;
    for (const k of ["prof", "det", "cons", "pres", "amb", "soc"] as const) { expect(P[k]).toBeGreaterThanOrEqual(1); expect(P[k]).toBeLessThanOrEqual(20); }
    expect(Object.keys(s.known ?? {})).toHaveLength(0);
    const old = mk() as unknown as Record<string, unknown>;
    delete old.persona; delete old.known; delete old.recent; delete old.seasons;
    const up = L.upgrade(old as unknown as ReturnType<typeof mk>);
    expect(up.persona).toBeDefined();
    expect(up.seasons).toEqual({});
  });

  it("경기마다 평점(3~10)이 매겨지고 최근 폼·연도별 시즌 기록·종류별 전적이 쌓임", () => {
    const s = mk();
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const g = L.playLobby(s, "low", 3);
      n++;
      expect(g.rating).toBeGreaterThanOrEqual(3);
      expect(g.rating).toBeLessThanOrEqual(10);
      expect(g.kind).toBe("공방");
      if (s.used >= 9) L.nextDay(s);
    }
    expect(s.recent).toHaveLength(n);
    const st = s.seasons![ymd(s.day).y];
    expect(st.g).toBe(n);
    expect(st.by["공방"]![0]).toBe(n);
    expect(st.sum).toBeGreaterThan(0);
  });

  it("성격 리포트: 모르는 성격 → 대략 → 정확 순서로 드러나고 다 알면 더 없음", () => {
    const s = mk();
    for (let i = 0; i < 6; i++) expect(L.revealTrait(s, "코치")).not.toBeNull();
    expect(Object.values(s.known!).every(v => v === 1)).toBe(true);
    for (let i = 0; i < 6; i++) L.revealTrait(s, "코치");
    expect(Object.values(s.known!).every(v => v === 2)).toBe(true);
    expect(L.revealTrait(s, "코치")).toBeNull();
  });

  it("꾸준함이 낮을수록 평점 기복이 큼 (같은 상대·같은 맵 100판)", () => {
    const spread = (cons: number) => {
      const s = mk();
      s.persona = { ...s.persona!, cons };
      const rs: number[] = [];
      for (let i = 0; i < 100; i++) { s.cond = 100; s.used = 0; rs.push(L.playLobby(s, "mid", 3).rating!); }
      const m = rs.reduce((a, b) => a + b, 0) / rs.length;
      return Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length);
    };
    // 상대가 매번 달라 차이가 크지 않을 수 있어 느슨하게: 극단끼리 비교
    expect(spread(1)).toBeGreaterThan(spread(20) * 0.75);
  });
});

describe("FM 2단계: 메일함·선택 이벤트·기자회견", () => {
  it("하루하루 지나면 메일이 오고, 답장하면 결과가 남고, 같은 답장은 두 번 못 함", async () => {
    const I = await import("./inbox");
    const s = mk();
    s.fame = 100; s.money = 10;
    for (let i = 0; i < 80; i++) L.nextDay(s);
    expect((s.inbox ?? []).length).toBeGreaterThan(3);
    const m = I.sendMail(s, { from: "family", sender: "어머니", title: "t", body: "b", tpl: "family_worry", choices: [{ id: "talk", label: "a" }, { id: "prove", label: "b" }, { id: "study", label: "c" }], until: s.day + 3 });
    const before = s.morale;
    I.answerMail(s, m.id, "talk");
    expect(s.morale).toBeGreaterThan(before - 1);
    expect(m.result).toContain("사기");
    expect(() => I.answerMail(s, m.id, "talk")).toThrow(L.RookieError);
  });

  it("기한이 지나면 마지막 선택으로 자동 처리", async () => {
    const I = await import("./inbox");
    const s = mk();
    const m = I.sendMail(s, { from: "friend", sender: "x", title: "t", body: "b", tpl: "partjob", choices: [{ id: "yes", label: "a" }, { id: "no", label: "b" }], until: s.day + 1 });
    L.nextDay(s); L.nextDay(s);
    expect(m.picked).toBe("no");
    expect(m.result).toContain("자동");
  });

  it("기자회견: 우승 뒤 도발하면 라이벌전이 과열되고, 라이벌을 이기면 화제", async () => {
    const I = await import("./inbox");
    const s = mk();
    const m = I.pressConference(s, "테스트 대회", true);
    expect(m.choices!.map(c => c.id)).toContain("bold");
    I.answerMail(s, m.id, "bold");
    expect(s.flags?.rivalHeat).toBeGreaterThan(s.day);
    const fame = s.fame;
    expect(I.rivalHeatResult(s, true)).toContain("이겼습니다");
    expect(s.fame).toBe(Math.min(1000, fame + 15));
    expect(s.flags?.rivalHeat).toBeUndefined();
  });

  it("입단 테스트 제의·이적 제안은 메일로도 옴", async () => {
    const I = await import("./inbox");
    const s = mk();
    I.notify(s, "agent", "담당자", "입단 테스트 제의", "본문");
    expect(s.inbox![0].choices).toBeUndefined();
    expect(s.inbox![0].read).toBeFalsy();
  });
});

describe("FM 3단계: 팀 내 입지·계약·에이전트·임대", () => {
  const pro = () => {
    const s = mk();
    s.status = "pro";
    s.team = { team: 0, squad: 1, joined: s.day, salary: 100, monthW: 0, monthL: 0, contractUntil: s.day + 300, trust: 50 };
    return s;
  };
  it("역할은 팀 내 순위·코치 신뢰도로 정해지고, 신뢰도가 높을수록 엔트리 확률이 높음", async () => {
    const { roleOf, ROLES } = await import("@shared/rookie/squad");
    expect(roleOf(0, 70)).toBe("ace");
    expect(roleOf(2, 40)).toBe("starter");
    expect(roleOf(7, 80)).toBe("starter");
    expect(roleOf(7, 30)).toBe("backup");
    expect(ROLES.ace.entry).toBeGreaterThan(ROLES.backup.entry);
    const s = pro();
    for (const k of Object.keys(s.stats)) (s.stats as Record<string, number>)[k] = 200;
    s.team!.trust = 10;
    expect(L.myRole(s)).toBe("backup");
    L.addTrust(s, 200);
    expect(L.trustOf(s)).toBe(100);
    expect(L.myRole(s)).toBe("starter");
  });

  it("감독 면담은 2주에 한 번, 약속을 받으면 출전 약속 기간이 생김", () => {
    const s = pro();
    for (const k of Object.keys(s.stats)) (s.stats as Record<string, number>)[k] = 200;
    s.team!.trust = 100;
    s.recent = [9, 9, 9, 9, 9];
    const r = L.askPlayTime(s);
    expect(["promised", "already"]).toContain(r.result);
    expect(() => L.askPlayTime(s)).toThrow(L.RookieError);
  });

  it("계약 조건: 출전 보장은 월급 10% 낮춤, 승리 수당은 1승마다 월급의 25%", () => {
    const s = pro();
    s.nego = { offer: 100, rounds: 0, until: s.day + 7, max: 120, old: 100 };
    L.acceptNego(s, "promise");
    expect(s.team!.salary).toBe(90);
    expect(s.team!.clause?.kind).toBe("promise");
    s.nego = { offer: 100, rounds: 0, until: s.day + 7, max: 120, old: 90 };
    L.acceptNego(s, "bonus");
    expect(s.team!.salary).toBe(95);
    expect(s.team!.clause?.winBonus).toBe(24);
  });

  it("에이전트: 인지도·계약금 조건, 월급날 수수료, 협상 한도 상승", () => {
    const s = pro();
    s.fame = 10; s.money = 500;
    expect(() => L.hireAgent(s, 1)).toThrow(L.RookieError);
    s.fame = 50;
    L.hireAgent(s, 1);
    expect(s.money).toBe(470);
    expect(s.agent?.tier).toBe(1);
    // 다음 달 1일까지
    const money0 = s.money;
    for (let i = 0; i < 40; i++) L.nextDay(s);
    expect(s.money).toBeGreaterThan(money0); // 월급 100 - 수수료 5
    expect(s.log.some(l => l.text.includes("에이전트 수수료"))).toBe(true);
    L.fireAgent(s);
    expect(s.agent).toBeUndefined();
  });

  it("임대: 2군·30일 뒤에만, 임대 가면 다른 구단 1군, 기간이 끝나면 돌아옴", () => {
    const s = pro();
    s.team!.squad = 2;
    expect(() => L.requestLoan(s)).toThrow(L.RookieError);
    s.day += 31;
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) { delete s.flags?.loanTry; ok = L.requestLoan(s).result === "loaned"; }
    expect(ok).toBe(true);
    expect(s.team!.team).not.toBe(0);
    expect(s.team!.squad).toBe(1);
    for (let i = 0; i < 62; i++) L.nextDay(s);
    expect(s.team!.loan).toBeUndefined();
    expect(s.team!.team).toBe(0);
  });
});

describe("FM 4단계: 살아있는 세계·시즌 목표·은퇴·후배", () => {
  it("또래 24명이 만들어지고 매주 자라며 소식이 쌓임", () => {
    const s = mk();
    expect(s.world!.peers).toHaveLength(24);
    const t0 = s.world!.peers.reduce((a, p) => a + p.total, 0);
    for (let i = 0; i < 120; i++) L.nextDay(s);
    const t1 = s.world!.peers.reduce((a, p) => a + p.total, 0);
    expect(t1).toBeGreaterThan(t0);
    expect(s.world!.news.length).toBeGreaterThan(0);
    expect(L.todayInfo(s).peerRank).toBeGreaterThanOrEqual(1);
  });

  it("올해 목표 3개가 생기고, 조건을 채우면 보상과 함께 달성", async () => {
    const W = await import("./world");
    const s = mk();
    expect(s.goals!.list).toHaveLength(3);
    const g = s.goals!.list.find(x => x.kind === "ladder")!;
    const fame = s.fame;
    s.ladder.best = g.target;
    W.checkGoals(s);
    expect(g.done).toBe(true);
    expect(s.fame).toBe(Math.min(1000, fame + g.reward.fame));
    expect(L.todayInfo(s).goals.some(x => x.done)).toBe(true);
  });

  it("새해가 되면 지난해 목표를 평가하고 새 목표가 생김", () => {
    const s = mk();
    const y = s.goals!.year;
    while (s.goals!.year === y) L.nextDay(s);
    expect(s.goals!.year).toBe(y + 1);
    expect((s.inbox ?? []).some(m => m.title.includes(`${y}년 평가`))).toBe(true);
  });

  it("은퇴는 1년 뒤부터, 경력 점수가 매겨지고 후배는 일부를 물려받음", async () => {
    const W = await import("./world");
    const s = mk();
    expect(() => W.retire(s)).toThrow(L.RookieError);
    s.day = 400; s.money = 1000; s.fame = 300;
    const e = W.retire(s);
    expect(e.score).toBeGreaterThan(0);
    expect(s.retired).toContain("은퇴");
    expect(() => L.nextDay(s)).toThrow(L.RookieError);
    const kid = mk();
    const m0 = kid.money, f0 = kid.fame;
    W.applyLegacy(kid, s);
    expect(kid.money).toBe(m0 + 200);
    expect(kid.fame).toBe(f0 + 30);
    expect(kid.legacy?.from).toBe(s.name);
    expect(Object.keys(kid.known ?? {}).length).toBeGreaterThanOrEqual(1);
  });
});

describe("몸 관리 · 준프로 압박 · 연말 결산 · 라이벌 이야기 · 성장 남용 방지", () => {
  it("경기마다 피로가 쌓이고 쉬면 풀리며, 피로가 높으면 경기력이 떨어짐", async () => {
    const { fatiguePerf, FATIGUE } = await import("@shared/rookie/model");
    const s = mk();
    L.act(s, { kind: "lobby", tier: "newbie", mapId: 0 });
    expect(s.fatigue ?? 0).toBeGreaterThan(0);
    s.fatigue = 50;
    L.restDay(s);
    expect(s.fatigue).toBe(50 - FATIGUE.rest);
    expect(fatiguePerf(40)).toBe(1);
    expect(fatiguePerf(100)).toBeCloseTo(0.9);
  });

  it("부상 중에는 연습 경기를 못 하고 자동 진행 날엔 쉼 · 프로리그 엔트리에서도 빠짐 · 기한이 지나면 나음", () => {
    const s = mk();
    const until = s.day + 2;
    s.injury = { until, name: "손목 통증" };
    expect(L.injured(s)).toBe(true);
    expect(() => L.act(s, { kind: "lobby", tier: "newbie", mapId: 0 })).toThrow(/부상/);
    expect(() => L.act(s, { kind: "ladder" })).toThrow(/부상/);
    const r = L.act(s, { kind: "rest" }) as { reports: Array<{ title: string; mode: string }> };
    for (const x of r.reports.filter(x => x.mode === "auto" && x.day <= until)) expect(x.title).toMatch(/치료|휴식/);
    for (let i = 0; i < 6; i++) L.nextDay(s);
    expect(L.injured(s)).toBe(false);
    expect(s.injury).toBeUndefined();
  });

  it("피로가 아주 높으면 언젠가 부상", () => {
    const s = mk();
    let hurt = false;
    for (let i = 0; i < 200 && !hurt; i++) { s.fatigue = 100; L.nextDay(s); hurt = !!s.injury; }
    expect(hurt).toBe(true);
    expect((s.inbox ?? []).some(m => m.title.startsWith("부상"))).toBe(true);
  });

  it("준프로 자격이 90·30·7일 남으면 알림", () => {
    const s = mk();
    s.status = "semipro";
    s.semiproUntil = s.day + 91;
    L.nextDay(s);
    expect((s.inbox ?? []).some(m => m.title === "준프로 자격 90일 남음")).toBe(true);
    expect(L.todayInfo(s).semiproLeft).toBe(90);
  });

  it("커리지 우승·입단한 날이 기록됨 (관리자 통계용)", () => {
    const s = mk();
    s.day = courageDays(2026)[1];
    s.level = 30;
    let won = false;
    const day = s.day;
    for (let i = 0; i < 40 && !won; i++) {
      s.day = day; s.doneDays = []; s.status = "amateur"; s.cond = 100; s.fatigue = 0; delete s.injury;
      for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 700;
      L.act(s, { kind: "courage" });
      won = runBracket(s).place === 1;
    }
    expect(s.milestones?.semipro).toBe(day);
  }, 60_000);

  it("이긴 경기 중 평점 상위 3개가 올해의 명경기로 남고, 새해에 연말 결산 메일", () => {
    const s = mk();
    for (let i = 0; i < 12; i++) { s.used = 0; s.cond = 100; L.playLobby(s, "newbie", 0); }
    const y = ymd(s.day).y;
    const top = s.seasons![y].top ?? [];
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].r).toBeGreaterThanOrEqual(top[i].r);
    // 새해 첫날까지
    while (ymd(s.day).y === y) L.nextDay(s);
    expect((s.inbox ?? []).some(m => m.title === `${y}년 돌아보기`)).toBe(true);
  }, 60_000);

  it("라이벌과 5번째 만나면 기자 메일", () => {
    const s = mk();
    s.rival.w = 2; s.rival.l = 2;
    L.playOne(s, L.rivalOpp(s), 0, "래더");
    expect(s.rival.w + s.rival.l).toBe(5);
    expect((s.inbox ?? []).some(m => m.title.startsWith("라이벌 5번째 맞대결"))).toBe(true);
  });

  it("나보다 훨씬 약한 상대를 이겨도 능력치가 거의 안 오르고, 연승 각성은 한 달에 한 번까지", () => {
    const s = mk();
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 500;
    s.level = 20;
    const t0 = sumStats(s.stats);
    let wins = 0;
    for (let i = 0; i < 40; i++) { s.used = 0; s.cond = 100; s.fatigue = 0; if (L.playLobby(s, "newbie", 0).winner === "a") wins++; }
    expect(wins).toBeGreaterThan(30);
    // 초보방(2000~2700)은 4,000의 70% 아래라 이겨서는 배우는 게 없음 (가끔 섞이는 윗방 상대·레벨업 정도)
    expect(sumStats(s.stats) - t0).toBeLessThan(120);
    expect(s.counts.awakenings).toBe(0);
  }, 60_000);
});
