import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { eq, inArray, or } from "drizzle-orm";
import { getDb, getUserById, isConfiguredAdmin, updateUserRole } from "../db";
import { ROOKIE_OPEN_KEY, ROOKIE_PICKS_KEY, rookieBeta, rookieOpen, rookiePicks, setRookieBeta, setSetting } from "../settings";
import { rookieCareers, users } from "../../drizzle/schema";
import { DAILY_PICKS, dayOf, sumStats, type RookieState } from "@shared/rookie/model";
import { backupStatus, diskStatus } from "../serverStatus";

/** 사용자 계정 관리 (커리어 세이브 관리는 career.admin* 에 있음) */
export const adminRouter = router({
  /** 서버 상태: 디스크 사용률·DB 백업 현황 (디스크가 80% 넘으면 경고) */
  serverStatus: adminProcedure.query(() => ({ disk: diskStatus(), backup: backupStatus(), uptimeHours: +(process.uptime() / 3600).toFixed(1) })),
  /** 선수 키우기 모드 공개 여부 */
  rookieOpen: adminProcedure.query(async () => ({ open: await rookieOpen() })),
  setRookieOpen: adminProcedure.input(z.object({ open: z.boolean() })).mutation(async ({ input }) => {
    await setSetting(ROOKIE_OPEN_KEY, input.open ? "1" : "0");
    return { open: input.open };
  }),
  /** 선수 키우기: 실제 하루에 직접 고를 수 있는 횟수 (0 = 제한 없음) */
  rookiePicks: adminProcedure.query(async () => ({ picks: await rookiePicks(DAILY_PICKS), fallback: DAILY_PICKS })),
  setRookiePicks: adminProcedure.input(z.object({ picks: z.number().int().min(0).max(500) })).mutation(async ({ input }) => {
    await setSetting(ROOKIE_PICKS_KEY, String(input.picks));
    return { picks: input.picks, fallback: DAILY_PICKS };
  }),
  /** 선수 키우기 베타 테스터 명단 (공개 전에도 들어갈 수 있음) */
  rookieBeta: adminProcedure.query(async () => {
    const ids = await rookieBeta();
    if (!ids.length) return [];
    const d = await getDb();
    if (!d) return ids.map(id => ({ id, name: `#${id}` }));
    const rows = await d.select({ id: users.id, name: users.name, managerName: users.managerName }).from(users).where(inArray(users.id, ids));
    return ids.map(id => { const u = rows.find(r => r.id === id); return { id, name: u ? u.managerName ?? u.name ?? `#${id}` : `#${id} (없는 계정)` }; });
  }),
  /** 베타 테스터 추가: 사용자 번호 또는 감독명·이름 */
  rookieBetaAdd: adminProcedure.input(z.object({ who: z.string().trim().min(1).max(40) })).mutation(async ({ input }) => {
    const d = await getDb();
    if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const n = Number(input.who.replace(/^#/, ""));
    const rows = Number.isInteger(n) && n > 0
      ? await d.select({ id: users.id }).from(users).where(eq(users.id, n)).limit(1)
      : await d.select({ id: users.id }).from(users).where(or(eq(users.managerName, input.who), eq(users.name, input.who))).limit(2);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "그런 사용자를 찾을 수 없습니다" });
    if (rows.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: "같은 이름이 여럿입니다. 사용자 번호로 추가하세요" });
    await setRookieBeta([...(await rookieBeta()), rows[0].id]);
    return { id: rows[0].id };
  }),
  rookieBetaRemove: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    await setRookieBeta((await rookieBeta()).filter(x => x !== input.id));
    return { id: input.id };
  }),
  /** 선수 키우기 난이도 체감: 신분별 인원 · 평균 능력치·승률 · 준프로/프로까지 걸린 날 */
  rookieStats: adminProcedure.query(async () => {
    const d = await getDb();
    if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const rows = await d.select({ state: rookieCareers.state }).from(rookieCareers);
    const by: Record<string, number> = { amateur: 0, semipro: 0, pro: 0, fa: 0, retired: 0 };
    let total = 0, ladder = 0, days = 0, w = 0, l = 0, injured = 0, fatigue = 0, n = 0;
    const toSemi: number[] = [], toPro: number[] = [];
    /** 칭호 "2026.03.31 커리지 매치 우승" 에서 날짜 (예전 세이브용) */
    const titleDay = (s: RookieState, re: RegExp) => {
      const hits = s.titles.filter(x => re.test(x)).map(x => x.match(/^(\d{4})\.(\d{2})\.(\d{2})/)).filter(Boolean).map(m => dayOf(+m![1], +m![2], +m![3]));
      return hits.length ? Math.min(...hits) : undefined;
    };
    for (const r of rows) {
      let s: RookieState;
      try { s = JSON.parse(r.state) as RookieState; } catch { continue; }
      n++;
      by[s.retired ? "retired" : s.fa ? "fa" : s.status]++;
      total += sumStats(s.stats); ladder += s.ladder.score; days += s.day; w += s.record.w; l += s.record.l;
      fatigue += s.fatigue ?? 0;
      if (s.injury && s.day <= s.injury.until) injured++;
      const semi = s.milestones?.semipro ?? titleDay(s, /커리지 매치 우승/);
      const pro = s.milestones?.pro ?? titleDay(s, /입단/);
      if (semi !== undefined) toSemi.push(semi);
      if (pro !== undefined) toPro.push(pro);
    }
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
    return {
      n, by,
      avgTotal: n ? Math.round(total / n) : 0, avgLadder: n ? Math.round(ladder / n) : 0, avgDays: n ? Math.round(days / n) : 0,
      winRate: w + l ? Math.round((w / (w + l)) * 1000) / 10 : 0,
      avgFatigue: n ? Math.round(fatigue / n) : 0, injured,
      semipro: { count: toSemi.length, avg: avg(toSemi), median: med(toSemi), fastest: toSemi.length ? Math.min(...toSemi) : null },
      pro: { count: toPro.length, avg: avg(toPro), median: med(toPro), fastest: toPro.length ? Math.min(...toPro) : null },
    };
  }),
  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number().int(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.role === "user") {
        // 관리자가 모두 사라지는 실수를 막는다
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "자기 자신의 관리자 권한은 해제할 수 없습니다" });
        }
        const target = await getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다" });
        if (isConfiguredAdmin(target.openId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "서버 설정(ADMIN_USERNAMES)으로 지정된 관리자는 해제할 수 없습니다" });
        }
      }
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
});
