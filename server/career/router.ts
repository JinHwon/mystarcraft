import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getActiveEvents, getDb } from "../db";
import { careers, users } from "../../drizzle/schema";
import { ITEM_BY_KEY } from "@shared/career/items";
import { askingPrice } from "@shared/career/rules";
import { rosterOf as rosterOfView, teamPower } from "@shared/career/view";
import { managerExpNeed } from "@shared/career/mainSponsor";
import type { CareerEventType } from "@shared/career/events";
import { setActiveEvents } from "./events";
import type { CareerState } from "@shared/career/rules";
import { diffOf, jsonOf, snapshot, type Snapshot } from "./diff";
import { nominate } from "./msl";
import { ACTIONS, type ActionKey } from "@shared/career/rules";
import { negotiateMainSponsor } from "./club";
import { acceptJob, bidPlayer, chooseSponsor, listPlayer, negotiateContract, respondJob, respondOffer, unlistPlayer } from "./club";
import { sendToB } from "./divisions";
import {
  CareerError,
  advanceWeek,
  beginMatch,
  buyItem,
  useStockItem,
  playLiveSet,
  migrateCareer,
  newCareer,
  proposeTrade,
  releasePlayer,
  rosterOf,
  scoutPlayer,
  setAction,
  runMyActions,
  completeWeek,
  startNextSeason,
} from "./logic";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
  return db;
}

/**
 * 세이브 메모리 캐시: 요청마다 DB 에서 큰 JSON 을 읽고 파싱하지 않도록 (서버는 한 프로세스)
 * - json 은 마지막으로 저장된 모습: 규칙 오류로 중간에 멈춘 변경은 이것으로 되돌린다
 * - DB 쓰기는 응답 뒤에 (사용자마다 최신 것만, 순서대로). 서버 종료 시 남은 쓰기를 마친다
 */
const cache = new Map<number, { state: CareerState; json: string; snap?: Snapshot }>();
const CACHE_MAX = 300;

async function load(userId: number): Promise<CareerState | null> {
  const hit = cache.get(userId);
  if (hit) return hit.state;
  const db = await requireDb();
  const rows = await db.select().from(careers).where(eq(careers.userId, userId)).limit(1);
  if (!rows[0]) return null;
  const s = JSON.parse(rows[0].state) as CareerState;
  migrateCareer(s);
  remember(userId, s, JSON.stringify(s));
  return s;
}

/** snap: 저장된 모습과 같은 스냅샷 (있으면 다음 변경 때 비교 기준으로 재사용) */
function remember(userId: number, state: CareerState, json: string, snap?: Snapshot) {
  cache.delete(userId);
  cache.set(userId, { state, json, snap });
  if (cache.size > CACHE_MAX) {
    // 아직 DB 에 안 쓴 세이브는 캐시에서 빼지 않음
    for (const k of cache.keys()) {
      if (pendingWrites.has(k)) continue;
      // 캐시에서 빠지는 세이브는 랭킹용 요약만 남김
      try { summaries.set(k, summaryOf(cache.get(k)!.state)); } catch { /* 무시 */ }
      cache.delete(k);
      break;
    }
  }
}

const pendingWrites = new Map<number, string>();
const flushing = new Map<number, Promise<void>>();

async function writeDb(userId: number, json: string) {
  const db = await requireDb();
  const existing = await db.select({ id: careers.id }).from(careers).where(eq(careers.userId, userId)).limit(1);
  if (existing[0]) await db.update(careers).set({ state: json }).where(eq(careers.id, existing[0].id));
  else await db.insert(careers).values({ userId, state: json });
}

function flush(userId: number): Promise<void> {
  const running = flushing.get(userId);
  if (running) return running;
  const run = (async () => {
    for (let json = pendingWrites.get(userId); json !== undefined; json = pendingWrites.get(userId)) {
      pendingWrites.delete(userId);
      try { await writeDb(userId, json); } catch (e) {
        console.error("[career] 세이브 저장 실패", userId, e);
        if (!pendingWrites.has(userId)) pendingWrites.set(userId, json);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  })().finally(() => flushing.delete(userId));
  flushing.set(userId, run);
  return run;
}

function save(userId: number, state: CareerState, json = JSON.stringify(state), snap?: Snapshot) {
  remember(userId, state, json, snap);
  pendingWrites.set(userId, json);
  void flush(userId);
}

/** 서버 종료 전 남은 세이브 쓰기 */
export async function flushAllCareers() {
  await Promise.all([...new Set([...pendingWrites.keys(), ...flushing.keys()])].map(flush));
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => { void flushAllCareers().finally(() => process.exit(0)); });
}

// 같은 유저의 요청은 순서대로 처리 (세이브 덮어쓰기 방지)
const locks = new Map<number, Promise<unknown>>();
function withLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(userId, run);
  return run.finally(() => { if (locks.get(userId) === run) locks.delete(userId); });
}

// ── 운영 이벤트 (30초마다 DB 에서 갱신) ─────────────────────────
let eventsAt = 0;
async function refreshEvents() {
  if (Date.now() - eventsAt < 30_000) return;
  eventsAt = Date.now();
  try {
    // getActiveEvents 가 켜짐 여부와 시작~종료 시간을 함께 확인한다
    const ev = await getActiveEvents();
    setActiveEvents(ev.map(e => e.type as CareerEventType));
  } catch (e) { console.error("[career] 이벤트 조회 실패", e); }
}
/** 관리자가 이벤트를 바꾸면 바로 반영 */
export function resetEventsCache() { eventsAt = 0; }

/** 세이브를 불러와 수정하고 저장. 바뀐 부분(diff)만 돌려준다. 게임 규칙 오류는 사용자에게 보여줄 메시지로 변환 */
function mutate<T>(userId: number, fn: (s: CareerState) => T) {
  return withLock(userId, async () => {
    await refreshEvents();
    const s = await load(userId);
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "진행 중인 커리어가 없습니다. 새 게임을 시작하세요" });
    const before = cache.get(userId)?.snap ?? snapshot(s);
    try {
      if (s.gameOver) throw new CareerError(`게임이 종료되었습니다: ${s.gameOver.reason}. 새 게임을 시작하세요`);
      const result = fn(s);
      const { after, ...diff } = diffOf(before, s);
      save(userId, s, jsonOf(s, after), after);
      return { result, diff };
    } catch (e) {
      // 중간에 멈춘 변경은 버리고 마지막 저장 상태로
      const hit = cache.get(userId);
      if (hit) remember(userId, JSON.parse(hit.json) as CareerState, hit.json, hit.snap);
      if (e instanceof CareerError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  });
}

/** 관리자용: 게임 오버 세이브도 수정 */
function mutateAny<T>(userId: number, fn: (s: CareerState) => T) {
  return withLock(userId, async () => {
    const s = await load(userId);
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "이 사용자는 커리어가 없습니다" });
    try {
      const result = fn(s);
      save(userId, s);
      return { result };
    } catch (e) {
      const hit = cache.get(userId);
      if (hit) remember(userId, JSON.parse(hit.json) as CareerState, hit.json, hit.snap);
      throw e;
    }
  });
}

/** 결과만 돌려주는 가벼운 변경 (화면은 미리 반영해 둠) */
function mutateLite<T>(userId: number, fn: (s: CareerState) => T) {
  return mutate(userId, fn).then(r => ({ result: r.result }));
}

// ── 랭킹·관리자 ───────────────────────────────────────────────
/** 커리어 한 줄 요약 (랭킹·관리자 화면) */
function summaryOf(s: CareerState) {
  const me = s.teams[s.myTeam];
  const players = rosterOfView(s, s.myTeam);
  const playerValue = players.reduce((sum, p) => sum + askingPrice(p, s.season), 0);
  return {
    team: { id: s.myTeam, name: me.name, short: me.short, color: me.color, div: me.div ?? 1 },
    level: s.manager?.level ?? 1,
    exp: s.manager?.exp ?? 0,
    expNeed: managerExpNeed(s.manager?.level ?? 1),
    reputation: s.manager?.reputation ?? 50,
    season: s.season,
    week: s.week,
    phase: s.phase,
    money: me.money,
    playerValue,
    clubValue: me.money + playerValue,
    power: teamPower(s, s.myTeam),
    players: players.length,
    record: { wins: me.wins, losses: me.losses },
    // 감독 통산 우승 (팀을 옮겨도 그 시즌 맡았던 팀 기준으로 셈)
    proTitles: s.history.filter(h => h.champion === (h.team ?? s.myTeam)).length,
    mslTitles: s.players.reduce((n, p) => n + (p.team === s.myTeam ? (p.titles ?? []).filter(x => x.includes("스타리그") || x.includes("MSL")).length : 0), 0),
    gameOver: s.gameOver?.reason,
    lastLeagueAt: s.lastLeagueAt ?? null,
  };
}
export type CareerSummary = ReturnType<typeof summaryOf>;

/**
 * 모든 커리어 요약 (랭킹·관리자)
 * - 메모리 캐시에 있는 세이브는 바로 요약, 없는 세이브는 요약만 기억 (summaries)
 * - DB 에서 세이브 전체를 읽는 건 요약이 없는 사용자만, 처음 한 번
 */
const summaries = new Map<number, CareerSummary>();
/** 커리어가 없는 사용자 (매번 DB 에 묻지 않도록) — 커리어를 만들면 메모리 캐시에 먼저 들어가므로 안전 */
const noCareer = new Set<number>();
let usersCache: { at: number; rows: Array<{ id: number; name: string | null; role: string; lastSignedIn: Date | null }> } | null = null;
async function allSummaries(force = false) {
  const db = await requireDb();
  if (force || !usersCache || Date.now() - usersCache.at > 60_000) {
    usersCache = { at: Date.now(), rows: await db.select({ id: users.id, name: users.name, role: users.role, lastSignedIn: users.lastSignedIn }).from(users) };
  }
  const us = usersCache.rows;
  const missing = us.map(u => u.id).filter(id => !cache.has(id) && !summaries.has(id) && !noCareer.has(id));
  if (missing.length) {
    const rows = await db.select({ userId: careers.userId, state: careers.state }).from(careers).where(inArray(careers.userId, missing));
    for (const r of rows) { try { summaries.set(r.userId, summaryOf(JSON.parse(r.state) as CareerState)); } catch { /* 깨진 세이브는 건너뜀 */ } }
    for (const id of missing) if (!rows.some(r => r.userId === id)) noCareer.add(id);
  }
  return us.map(u => {
    const hit = cache.get(u.id)?.state;
    let summary: CareerSummary | null = null;
    try { summary = hit ? summaryOf(hit) : summaries.get(u.id) ?? null; } catch { summary = null; }
    return { userId: u.id, name: u.name || `감독${u.id}`, role: u.role, lastSignedIn: u.lastSignedIn, summary };
  });
}

// 서버가 뜬 뒤 랭킹 요약을 미리 만들어 둠 (첫 랭킹 요청도 빠르게)
if (process.env.NODE_ENV !== "test") setTimeout(() => { void allSummaries().catch(() => {}); }, 5000).unref();

const actionKeys = ACTIONS.map(a => a.key) as [string, ...string[]];
/** 리그를 진행한 요청: 진행 시각을 남김 (감독 랭킹의 "마지막 리그 진행") */
const league = <T,>(s: CareerState, result: T): T => { s.lastLeagueAt = Date.now(); return result; };

export const careerRouter = router({
  /** 감독 랭킹 (커리어가 있는 사용자) */
  ranking: protectedProcedure.query(async ({ ctx }) => {
    const rows = await allSummaries();
    return {
      me: ctx.user.id,
      rows: rows.filter(r => r.summary).map(r => ({ userId: r.userId, name: r.name, lastSignedIn: r.lastSignedIn ? new Date(r.lastSignedIn).getTime() : null, ...r.summary! })),
    };
  }),

  /** 감독 랭킹: 그 감독이 진행 중인 세이브의 선수단 (읽기 전용) */
  managerRoster: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ input }) => {
      const s = await load(input.userId);
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "진행 중인 커리어가 없습니다" });
      const players = rosterOfView(s, s.myTeam).map(p => ({
        id: p.id, name: p.name, race: p.race, team: p.team, level: p.level, exp: p.exp, birth: p.birth, gender: p.gender,
        stats: p.stats, cond: p.cond, titles: p.titles, photoOf: p.photoOf, potential: p.potential,
        wins: p.wins, losses: p.losses, sWins: p.sWins, sLosses: p.sLosses, sApps: p.sApps,
        equip: p.equip, potions: p.potions, contract: p.contract, morale: p.morale, wantsOut: p.wantsOut, action: null,
      }));
      return { season: s.season, week: s.week, myTeam: s.myTeam, teams: s.teams, players };
    }),

  /** 관리자: 사용자 목록 + 커리어 요약 */
  adminUsers: adminProcedure.query(async () => (await allSummaries(true)).map(r => ({ ...r, lastSignedIn: r.lastSignedIn ? String(r.lastSignedIn) : null }))),

  /** 관리자: 커리어 수정 (자금·감독 레벨·명성·아이템 지급·컨디션 회복) */
  adminEdit: adminProcedure
    .input(z.object({
      userId: z.number().int(),
      money: z.number().int().min(-1_000_000).max(10_000_000).optional(),
      level: z.number().int().min(1).max(50).optional(),
      reputation: z.number().int().min(0).max(100).optional(),
      items: z.record(z.string(), z.number().int().min(0).max(999)).optional(),
      healAll: z.boolean().optional(),
      clearGameOver: z.boolean().optional(),
    }))
    .mutation(({ input }) => mutateAny(input.userId, s => {
      if (input.money !== undefined) s.teams[s.myTeam].money = input.money;
      if (input.level !== undefined || input.reputation !== undefined) {
        s.manager = { reputation: 50, level: 1, exp: 0, ...s.manager };
        if (input.level !== undefined) { s.manager.level = input.level; s.manager.exp = 0; }
        if (input.reputation !== undefined) s.manager.reputation = input.reputation;
      }
      for (const [k, n] of Object.entries(input.items ?? {})) if (ITEM_BY_KEY[k]) s.inventory = { ...s.inventory, [k]: n };
      if (input.healAll) for (const p of rosterOfView(s, s.myTeam)) p.cond = 100;
      if (input.clearGameOver) { delete s.gameOver; s.debtWeeks = 0; }
      return summaryOf(s);
    })),

  /** 관리자: 커리어 초기화 (세이브 삭제) */
  adminResetCareer: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(({ input }) => withLock(input.userId, async () => {
      const db = await requireDb();
      pendingWrites.delete(input.userId);
      await flushing.get(input.userId);
      await db.delete(careers).where(eq(careers.userId, input.userId));
      cache.delete(input.userId);
      summaries.delete(input.userId);
      return { ok: true };
    })),

  get: protectedProcedure.query(async ({ ctx }) => {
    return { state: await load(ctx.user.id) };
  }),

  newGame: protectedProcedure
    .input(z.object({ teamId: z.number().int() }))
    .mutation(({ ctx, input }) => withLock(ctx.user.id, async () => {
      try {
        const state = newCareer(input.teamId);
        save(ctx.user.id, state);
        return { state };
      } catch (e) {
        if (e instanceof CareerError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        throw e;
      }
    })),

  setAction: protectedProcedure
    .input(z.object({ playerId: z.number().int(), action: z.enum(actionKeys).nullable() }))
    .mutation(({ ctx, input }) => mutateLite(ctx.user.id, s => { setAction(s, input.playerId, input.action as any); return { ok: true }; })),

  /** 컨디션 낮은(60% 이하) 선수는 휴식, 나머지는 훈련으로 자동 배정 */
  autoActions: protectedProcedure.mutation(({ ctx }) => mutateLite(ctx.user.id, s => {
    if (s.live) throw new CareerError("경기 중에는 행동을 바꿀 수 없습니다");
    const roster = rosterOf(s, s.myTeam);
    for (const p of roster) p.action = p.cond <= 60 ? "rest" : "train";
    return { actions: Object.fromEntries(roster.map(p => [p.id, p.action ?? null])) as Record<number, string | null> };
  })),

  /** 우리 선수 행동 바로 진행 (선수별 행동력 사용) */
  runActions: protectedProcedure
    .input(z.object({ playerId: z.number().int().optional() }).optional())
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => runMyActions(s, input?.playerId))),

  /** 조 지명식을 마치고 이번 주 마무리 (남은 지명은 자동) */
  completeWeek: protectedProcedure.mutation(({ ctx }) => mutate(ctx.user.id, s => league(s, completeWeek(s)))),

  /** 마이스타리그 조 지명식: 우리 조장 차례까지 진행, pick 이 있으면 그 선수를 지명 */
  nominate: protectedProcedure
    .input(z.object({ pick: z.number().int().optional() }).optional())
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => nominate(s, input?.pick))),

  /** 우리 선수 전원 같은 행동으로 지정 (훈련·휴식·이벤트) */
  setAllActions: protectedProcedure
    .input(z.object({ action: z.enum(actionKeys) }))
    .mutation(({ ctx, input }) => mutateLite(ctx.user.id, s => {
      if (s.live) throw new CareerError("경기 중에는 행동을 바꿀 수 없습니다");
      for (const p of rosterOf(s, s.myTeam)) setAction(s, p.id, input.action as ActionKey);
      return { ok: true };
    })),

  /** 우리 선수 행동 모두 해제 (행동은 바꾸거나 초기화할 때까지 매주 유지) */
  clearActions: protectedProcedure.mutation(({ ctx }) => mutateLite(ctx.user.id, s => {
    if (s.live) throw new CareerError("경기 중에는 행동을 바꿀 수 없습니다");
    for (const p of rosterOf(s, s.myTeam)) p.action = null;
    return { ok: true };
  })),

  advance: protectedProcedure
    .input(z.object({ entry: z.array(z.number().int()).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => league(s, advanceWeek(s, input.entry)))),

  nextSeason: protectedProcedure
    .input(z.object({ releaseExpiring: z.boolean().optional() }).optional())
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => league(s, startNextSeason(s, { releaseExpiring: input?.releaseExpiring })))),

  scout: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => scoutPlayer(s, input.playerId))),

  release: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => releasePlayer(s, input.playerId))),

  trade: protectedProcedure
    .input(z.object({
      teamId: z.number().int(),
      give: z.array(z.number().int()).max(5),
      take: z.array(z.number().int()).min(1).max(5),
      cash: z.number().int().min(0).max(1_000_000),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => proposeTrade(s, input.teamId, input.give, input.take, input.cash))),

  /** 우리 경기 시작 (1~(n-1)세트 엔트리) */
  beginMatch: protectedProcedure
    .input(z.object({
      entry: z.array(z.number().int()).min(1).max(8),
      items: z.record(z.string(), z.object({ key: z.string(), predict: z.number().int().optional() })).optional(),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => league(s, beginMatch(s, input.entry, Object.fromEntries(Object.entries(input.items ?? {}).map(([k, v]) => [Number(k), v])))))),

  /** 아이템 구입 (장비·즉시·포션은 target 선수에게 바로 사용) */
  buyItem: protectedProcedure
    .input(z.object({ key: z.string(), target: z.number().int().optional(), qty: z.number().int().min(1).max(99).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => buyItem(s, input.key, input.target, input.qty ?? 1))),

  /** 보관한 아이템 사용 (비타비타) */
  useItem: protectedProcedure
    .input(z.object({ key: z.string(), target: z.number().int(), qty: z.number().int().min(1).max(99).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => useStockItem(s, input.key, input.target, input.qty ?? 1))),

  /** 다음 세트 진행 (ACE 결정전이면 ace 선수) */
  playSet: protectedProcedure
    .input(z.object({ ace: z.number().int().optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => league(s, playLiveSet(s, input.ace)))),

  /** 받은 영입 제안: 수락·거절·역제안(금액) */
  respondOffer: protectedProcedure
    .input(z.object({ offerId: z.number().int(), action: z.enum(["accept", "reject", "counter"]), fee: z.number().int().min(0).max(1_000_000).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => respondOffer(s, input.offerId, input.action, input.fee))),

  /** 다른 팀 선수 영입 요청 (이적료 제시) */
  bid: protectedProcedure
    .input(z.object({ playerId: z.number().int(), fee: z.number().int().min(0).max(1_000_000) }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => bidPlayer(s, input.playerId, input.fee))),

  /** 계약 협상 (영입 합의 후 또는 재계약) */
  contract: protectedProcedure
    .input(z.object({
      playerId: z.number().int(),
      salary: z.number().int().min(1).max(100_000),
      years: z.number().int().min(1).max(20),
      minApps: z.number().int().min(0).max(22).optional(),
      promote: z.boolean().optional(),
      bonus: z.object({
        proTitle: z.number().int().min(0).max(100_000).optional(),
        mslTitle: z.number().int().min(0).max(100_000).optional(),
        mostWins: z.number().int().min(0).max(100_000).optional(),
        topRank: z.number().int().min(0).max(100_000).optional(),
      }).optional(),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => negotiateContract(s, input.playerId, {
      salary: input.salary, years: input.years, minApps: input.minApps || undefined,
      bonus: Object.fromEntries(Object.entries(input.bonus ?? {}).filter(([, v]) => (v ?? 0) > 0)),
    }, { promote: input.promote }))),

  /** 다른 팀 감독 제의 수락 */
  acceptJob: protectedProcedure
    .input(z.object({ teamId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => acceptJob(s, input.teamId))),

  /** 스폰서 선택 (퀘스트 목표 조정). 제의 이름으로 고른다 */
  chooseSponsor: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(40), targets: z.array(z.number().int()).max(5) }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => chooseSponsor(s, input.name, input.targets))),

  /** 감독 제의 거절·계약금 역제안 */
  respondJob: protectedProcedure
    .input(z.object({ teamId: z.number().int(), action: z.enum(["reject", "counter"]), fee: z.number().int().min(0).max(1_000_000).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => respondJob(s, input.teamId, input.action, input.fee))),

  /** 우리 선수를 희망 이적료에 이적시장에 내놓기 / 내리기 */
  listPlayer: protectedProcedure
    .input(z.object({ playerId: z.number().int(), price: z.number().int().min(10).max(1_000_000) }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => listPlayer(s, input.playerId, input.price))),
  unlistPlayer: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => unlistPlayer(s, input.playerId))),

  /** 우리 선수를 우리 구단 B팀(2부)으로 (다시 데려올 때는 영입 요청, 시세의 절반) */
  sendToB: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => sendToB(s, input.playerId))),

  /** 메인 스폰서(모기업) 계약 협상 */
  mainSponsor: protectedProcedure
    .input(z.object({
      years: z.number().int().min(1).max(3),
      terms: z.object({ win: z.number().int().min(0).max(100_000), loss: z.number().int().min(0).max(100_000), proTitle: z.number().int().min(0).max(1_000_000), proRunnerUp: z.number().int().min(0).max(1_000_000), mslTitle: z.number().int().min(0).max(1_000_000), mslRunnerUp: z.number().int().min(0).max(1_000_000) }),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => negotiateMainSponsor(s, input.terms, input.years))),
});
