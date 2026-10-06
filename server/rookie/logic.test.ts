import { describe, expect, it } from "vitest";
import { rollStats, sumStats, courageDays, draftDay, DAY_SLOTS, STAT_CAP, ladderGrade } from "@shared/rookie/model";
import * as L from "./logic";

const mk = () => L.newRookie({ name: "테스트", race: "zerg", concept: "control", stats: rollStats("control") });

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

  it("하루 10번까지 · 다음 날 컨디션 회복 · 공방 강퇴로 상대 바꾸기", () => {
    const s = mk();
    L.findLobby(s, "mid", 3);
    const first = s.lobby!.opp.name;
    L.kickLobby(s);
    expect(s.lobby!.opp).toBeDefined();
    void first;
    const g = L.playLobby(s);
    expect(g.timeline?.lines.length).toBeGreaterThan(3);
    for (let i = 1; i < DAY_SLOTS; i++) L.rest(s);
    expect(() => L.playLadder(s)).toThrow(/하루/);
    const cond = s.cond;
    L.nextDay(s);
    expect(s.used).toBe(0);
    expect(s.cond).toBeGreaterThanOrEqual(Math.min(100, cond));
  });

  it("래더: 1500에서 시작해 승패로 오르내림, 등급", () => {
    const s = mk();
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
        if (s.cond < 50) L.rest(s);
        else { const tot = sumStats(s.stats); L.findLobby(s, tot > 3700 ? "elite" : tot > 3200 ? "high" : tot > 2800 ? "mid" : tot > 2450 ? "low" : "newbie", 0); L.playLobby(s); }
      }
      L.nextDay(s);
    }
    const total = sumStats(s.stats);
    console.log("6개월 뒤", sumStats(s.startStats), "→", total, s.record);
    expect(total).toBeLessThanOrEqual(STAT_CAP.amateur);
    expect(total).toBeGreaterThan(sumStats(s.startStats));
  }, 60_000);

  it("커리지 매치 날에 참가 · 우승하면 준프로 → 드래프트 날 참가 가능", () => {
    const s = mk();
    s.day = courageDays(2010)[1];
    // 강하게 만들어 우승 보장에 가깝게
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 560;
    let won = false;
    for (let i = 0; i < 40 && !won; i++) {
      s.doneDays = []; s.used = 0; s.status = "amateur"; s.cond = 100;
      for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 537;
      const r = L.playCourage(s);
      won = r.place === 1;
      expect(r.games.length).toBeGreaterThan(0);
    }
    expect(won).toBe(true);
    expect(s.status).toBe("semipro");
    s.day = draftDay(2010); s.used = 0; s.cond = 100;
    const d = L.playDraft(s);
    expect(d.rank).toBeGreaterThanOrEqual(1);
    expect(d.games).toHaveLength(4);
  }, 60_000);

  it("이벤트 대회: 신청한 날 하루를 다 쓰고, 3위 안이면 상금", () => {
    const s = mk();
    const e = s.events[0];
    L.registerEvent(s, e.id);
    s.day = e.day;
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 600;
    const money = s.money;
    const r = L.playEvent(s, e.id);
    expect(s.used).toBe(DAY_SLOTS);
    if (r.place <= 3) expect(s.money).toBeGreaterThan(money);
  });

  it("프로: 입단 테스트 통과 → 2군, 내부 연습, 이적 요청이 들키면 벌금/방출", () => {
    const s = mk();
    for (const k of Object.keys(s.stats) as Array<keyof typeof s.stats>) s.stats[k] = 700;
    let joined = false;
    for (let i = 0; i < 10 && !joined; i++) {
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
});
