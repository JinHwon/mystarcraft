/**
 * 리그 시스템: 프로리그(팀 풀리그) · 개인리그(16강 토너먼트)
 * 유저 팀마다 시즌이 따로 진행되고, 상대는 전역 AI 프로팀/AI 선수들이다.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { leagueMatches, leagueSeasons, players, playerStats, teams } from "../drizzle/schema";
import { STAT_KEYS, StatKey, calcTotalStats } from "@shared/gameConstants";
import { applyCondition } from "@shared/teamConstants";
import {
  AI_TEAMS,
  AI_TEAM_ROSTER,
  INDIVIDUAL_REWARD,
  INDIVIDUAL_ROUNDS,
  INDIVIDUAL_SET_FATIGUE,
  INDIVIDUAL_SIZE,
  MIN_FATIGUE_TO_PLAY,
  PRO_MATCH_GOLD,
  PRO_ROUNDS,
  PRO_SEASON_REWARD,
  PRO_SETS,
  PRO_SET_FATIGUE,
  PRO_TEAMS,
  PRO_WIN_SETS,
  SET_EXP,
} from "@shared/leagueConstants";
import { createBotPlayer, getAllMaps, getDb, getPlayerItems, seedMapsIfEmpty, toMysqlDatetime, updatePlayerExp, updatePlayerGold } from "./db";
import { changeCondition, describePlayers, getPlayerCondition, refreshPlayerDaily } from "./team";
import { simulateSet } from "./gameSimulation";

type Player = typeof players.$inferSelect;
type Team = typeof teams.$inferSelect;
type Season = typeof leagueSeasons.$inferSelect;
type Match = typeof leagueMatches.$inferSelect;
type Race = "terran" | "zerg" | "protoss";
type MapRow = Awaited<ReturnType<typeof getAllMaps>>[number];

export interface SetPlayer { id: number; name: string; race: string; teamId: number }
export interface SetRecord {
  mapId: number;
  mapName: string;
  a: SetPlayer | null;
  b: SetPlayer | null;
  winner?: "a" | "b";
  duration?: number;
  endReason?: string;
  highlights?: string[];
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function asJson<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

// 같은 팀의 요청이 동시에 처리되지 않도록 (한 프로세스 서버)
const locks = new Map<number, Promise<unknown>>();
export async function withTeamLock<T>(teamId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(teamId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(teamId, run);
  try {
    return await run;
  } finally {
    if (locks.get(teamId) === run) locks.delete(teamId);
  }
}

// ── 선수 능력치 ─────────────────────────────────────────────────

async function statsOf(ids: number[]): Promise<Map<number, Record<StatKey, number>>> {
  const out = new Map<number, Record<StatKey, number>>();
  if (!ids.length) return out;
  const db = await requireDb();
  const rows = await db.select().from(playerStats).where(inArray(playerStats.playerId, ids));
  for (const id of ids) {
    const r = rows.find(x => x.playerId === id);
    out.set(id, Object.fromEntries(STAT_KEYS.map(k => [k, (r as any)?.[k] ?? 500])) as Record<StatKey, number>);
  }
  return out;
}

/** 경기용 능력치: 기본 + 착용 아이템 + 컨디션 */
async function simStats(p: Player): Promise<Record<StatKey, number>> {
  const base = (await statsOf([p.id])).get(p.id)!;
  const items = await getPlayerItems(p.id);
  for (const pi of items) {
    if (pi.equipped !== 1 || pi.usageCount <= 0) continue;
    const boosts = asJson<Record<string, number>>(pi.item.statBoosts ?? {});
    for (const [k, v] of Object.entries(boosts)) {
      if (k in base && typeof v === "number") (base as any)[k] = Math.min(1200, (base as any)[k] + v);
    }
  }
  return applyCondition(base, await getPlayerCondition(p.id));
}

async function playersByIds(ids: number[]): Promise<Map<number, Player>> {
  const db = await requireDb();
  const rows = ids.length ? await db.select().from(players).where(inArray(players.id, ids)) : [];
  return new Map(rows.map(r => [r.id, r]));
}

async function teamRoster(teamId: number): Promise<Player[]> {
  const db = await requireDb();
  return db.select().from(players).where(eq(players.teamId, teamId));
}

/** 팀 전력: 상위 5명 능력치 합계 평균 */
async function teamStrength(teamId: number): Promise<number> {
  const roster = await teamRoster(teamId);
  if (!roster.length) return 0;
  const stats = await statsOf(roster.map(p => p.id));
  const totals = roster.map(p => calcTotalStats(stats.get(p.id)!)).sort((a, b) => b - a).slice(0, 5);
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
}

// ── AI 프로팀 ──────────────────────────────────────────────────

let aiTeamsOnce: Promise<void> | null = null;
export function ensureAiTeams(): Promise<void> {
  if (!aiTeamsOnce) aiTeamsOnce = ensureAiTeamsImpl().catch(e => { aiTeamsOnce = null; throw e; });
  return aiTeamsOnce;
}

async function ensureAiTeamsImpl() {
  const db = await requireDb();
  const existing = await db.select().from(teams).where(eq(teams.isAi, 1));
  for (const def of AI_TEAMS) {
    let team = existing.find(t => t.name === def.name);
    if (!team) {
      await db.insert(teams).values({ userId: 0, name: def.name, emblem: def.emblem, isAi: 1 });
      team = (await db.select().from(teams).where(and(eq(teams.isAi, 1), eq(teams.name, def.name))).limit(1))[0];
    }
    const roster = await teamRoster(team.id);
    for (let i = roster.length; i < AI_TEAM_ROSTER; i++) {
      // 에이스 1명은 팀 평균보다 강하게
      const center = def.avg + (i === 0 ? 350 : Math.round((Math.random() - 0.5) * 300));
      const bot = await createBotPlayer("intermediate", { min: center - 120, max: center + 120 });
      await db.update(players)
        .set({ teamId: team.id, name: bot.name.replace(/^AI_/, "") })
        .where(eq(players.id, bot.id));
    }
  }
}

/** AI 팀 엔트리: 1~4세트는 상위 5명 중 무작위, 5세트(에이스 결정전)는 최강 선수 */
async function aiEntry(teamId: number): Promise<number[]> {
  const roster = await teamRoster(teamId);
  const stats = await statsOf(roster.map(p => p.id));
  const sorted = roster
    .map(p => ({ p, total: calcTotalStats(stats.get(p.id)!) + (p.condition - 100) * 20 }))
    .sort((a, b) => b.total - a.total)
    .map(x => x.p.id);
  const top = sorted.slice(0, 5);
  const firstFour = shuffle(top).slice(0, 4);
  while (firstFour.length < 4) firstFour.push(top[firstFour.length % Math.max(1, top.length)]);
  return [...firstFour, sorted[0]];
}

function toSetPlayer(p: Player | undefined): SetPlayer | null {
  return p ? { id: p.id, name: p.name, race: p.race, teamId: p.teamId } : null;
}

// ── 세트 진행 ──────────────────────────────────────────────────

async function activeMaps(): Promise<MapRow[]> {
  await seedMapsIfEmpty();
  const maps = await getAllMaps();
  const active = maps.filter(m => (m as any).isActive !== 0);
  return active.length ? active : maps;
}

async function playOneSet(a: Player, b: Player, map: MapRow, withHighlights: boolean, isUser: (p: Player) => boolean) {
  const [sa, sb] = await Promise.all([simStats(a), simStats(b)]);
  const adv = asJson<Record<string, number>>(map.raceAdvantage ?? {});
  const res = simulateSet(
    { id: a.id, name: a.name, race: a.race as Race, stats: sa, fatigue: isUser(a) ? a.fatigue : 100 },
    { id: b.id, name: b.name, race: b.race as Race, stats: sb, fatigue: isUser(b) ? b.fatigue : 100 },
    adv,
    { rushDistance: map.rushDistance, resources: map.resources, complexity: map.complexity },
    withHighlights
  );
  return { winner: res.winnerId === a.id ? "a" as const : "b" as const, res };
}

/** 세트 결과 반영: 유저 선수는 피로도·경험치·컨디션, AI 선수는 컨디션만 */
async function applySetEffects(p: Player, won: boolean, isUser: boolean, fatigueCost: number) {
  const db = await requireDb();
  if (isUser) {
    const fatigue = Math.max(0, p.fatigue - fatigueCost);
    await db.update(players).set({ fatigue }).where(eq(players.id, p.id));
    p.fatigue = fatigue;
    await updatePlayerExp(p.id, won ? SET_EXP.win : SET_EXP.lose);
  }
  await changeCondition(p.id, won ? 2 : -2);
}

// ── 프로리그 ───────────────────────────────────────────────────

/** 원형 방식 풀리그 대진 (n 팀, n-1 라운드) */
function roundRobin(ids: number[]): Array<Array<[number, number]>> {
  const list = [...ids];
  const n = list.length;
  const rounds: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

async function latestSeason(teamId: number, kind: "proleague" | "individual"): Promise<Season | null> {
  const db = await requireDb();
  const rows = await db.select().from(leagueSeasons)
    .where(and(eq(leagueSeasons.teamId, teamId), eq(leagueSeasons.kind, kind)))
    .orderBy(desc(leagueSeasons.id)).limit(1);
  return rows[0] ?? null;
}

async function insertSeason(teamId: number, kind: "proleague" | "individual", data: unknown): Promise<Season> {
  const db = await requireDb();
  const prev = await latestSeason(teamId, kind);
  if (prev && prev.status === "active") return prev;
  const seasonNo = (prev?.seasonNo ?? 0) + 1;
  await db.insert(leagueSeasons).values({ teamId, kind, seasonNo, data: JSON.stringify(data), round: 1 });
  return (await latestSeason(teamId, kind))!;
}

export async function createProSeason(team: Team): Promise<Season> {
  await ensureAiTeams();
  const db = await requireDb();
  const aiTeams = await db.select().from(teams).where(eq(teams.isAi, 1));
  const myPower = (await teamStrength(team.id)) || 4000;
  // 내 전력과 가까운 AI 팀 7개 (약간 강한 팀 위주)
  const withPower = await Promise.all(aiTeams.map(async t => ({ t, power: await teamStrength(t.id) })));
  const chosen = withPower.sort((a, b) => Math.abs(a.power - myPower - 150) - Math.abs(b.power - myPower - 150)).slice(0, PRO_TEAMS - 1);
  const teamIds = shuffle([team.id, ...chosen.map(c => c.t.id)]);
  const maps = await activeMaps();
  const mapPool = shuffle(maps).slice(0, 7).map(m => m.id);

  const season = await insertSeason(team.id, "proleague", { teamIds, mapPool });
  const existing = await db.select().from(leagueMatches).where(eq(leagueMatches.seasonId, season.id)).limit(1);
  if (existing.length) return season;

  const schedule = roundRobin(teamIds);
  for (let r = 0; r < schedule.length; r++) {
    for (let slot = 0; slot < schedule[r].length; slot++) {
      const [a, b] = schedule[r][slot];
      await db.insert(leagueMatches).values({ seasonId: season.id, round: r + 1, slot, sideA: a, sideB: b });
    }
  }
  return season;
}

function roundMaps(mapPool: number[], round: number): number[] {
  return Array.from({ length: PRO_SETS }, (_, i) => mapPool[(round - 1 + i) % mapPool.length]);
}

interface ProData { teamIds: number[]; mapPool: number[]; planned?: Record<number, number[]> }

export interface Standing { teamId: number; wins: number; losses: number; setWins: number; setLosses: number }

function computeStandings(teamIds: number[], matches: Match[]): Standing[] {
  const table = new Map<number, Standing>(teamIds.map(id => [id, { teamId: id, wins: 0, losses: 0, setWins: 0, setLosses: 0 }]));
  for (const m of matches) {
    if (m.status !== "done") continue;
    const a = table.get(m.sideA), b = table.get(m.sideB);
    if (!a || !b) continue;
    a.setWins += m.scoreA; a.setLosses += m.scoreB;
    b.setWins += m.scoreB; b.setLosses += m.scoreA;
    if (m.winner === m.sideA) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  }
  return Array.from(table.values()).sort((x, y) =>
    y.wins - x.wins || (y.setWins - y.setLosses) - (x.setWins - x.setLosses) || y.setWins - x.setWins);
}

/** 프로리그 화면 데이터 */
export async function getProleague(team: Team) {
  let season = await latestSeason(team.id, "proleague");
  if (!season) season = await createProSeason(team);
  const db = await requireDb();
  const data = asJson<ProData>(season.data);
  const matches = await db.select().from(leagueMatches).where(eq(leagueMatches.seasonId, season.id));
  const teamRows = await db.select().from(teams).where(inArray(teams.id, data.teamIds));
  const teamInfo = await Promise.all(teamRows.map(async t => ({
    id: t.id, name: t.name, emblem: t.emblem, isAi: t.isAi === 1, isMine: t.id === team.id, power: await teamStrength(t.id),
  })));
  const standings = computeStandings(data.teamIds, matches);
  const maps = await getAllMaps();
  const mapInfo = (id: number) => {
    const m = maps.find(x => x.id === id);
    return m ? { id: m.id, name: m.name, emoji: m.iconEmoji, rushDistance: m.rushDistance, complexity: m.complexity, resources: m.resources, raceAdvantage: asJson<Record<string, number>>(m.raceAdvantage ?? {}) } : null;
  };

  let next = null;
  if (season.status === "active") {
    const mine = matches.find(m => m.round === season!.round && (m.sideA === team.id || m.sideB === team.id));
    if (mine) {
      const oppId = mine.sideA === team.id ? mine.sideB : mine.sideA;
      // 상대 엔트리는 미리 공개되고 경기 때까지 바뀌지 않음
      let oppEntryIds = data.planned?.[mine.id];
      if (!oppEntryIds) {
        oppEntryIds = await aiEntry(oppId);
        data.planned = { ...(data.planned ?? {}), [mine.id]: oppEntryIds };
        await db.update(leagueSeasons).set({ data: JSON.stringify(data) }).where(eq(leagueSeasons.id, season.id));
      }
      const oppPlayers = await playersByIds(oppEntryIds);
      const oppDescribed = await describePlayers(await Promise.all(oppEntryIds.map(id => refreshPlayerDaily(oppPlayers.get(id)!))));
      next = {
        matchId: mine.id,
        round: season.round,
        opponent: teamInfo.find(t => t.id === oppId),
        sets: roundMaps(data.mapPool, season.round).map((mapId, i) => ({
          set: i + 1,
          ace: i === PRO_SETS - 1,
          map: mapInfo(mapId),
          opponent: oppDescribed[i] ?? null,
        })),
      };
    }
  }

  const playersMap = await playersByIds(matches.flatMap(m => (asJson<SetRecord[] | null>(m.sets) ?? []).flatMap(s => [s.a?.id, s.b?.id]).filter((x): x is number => !!x)));
  return {
    season: { id: season.id, seasonNo: season.seasonNo, status: season.status, round: season.round, totalRounds: PRO_ROUNDS, result: season.result ? asJson(season.result) : null },
    teams: teamInfo,
    standings,
    matches: matches
      .sort((a, b) => a.round - b.round || a.slot - b.slot)
      .map(m => ({
        id: m.id, round: m.round, sideA: m.sideA, sideB: m.sideB, scoreA: m.scoreA, scoreB: m.scoreB, status: m.status, winner: m.winner,
        sets: m.sideA === team.id || m.sideB === team.id ? asJson<SetRecord[] | null>(m.sets) : null,
      })),
    next,
    playerNames: Object.fromEntries(Array.from(playersMap.values()).map(p => [p.id, p.name])),
  };
}

/** 한 경기(최대 5세트) 진행 */
async function playProMatch(
  match: Match, round: number, mapPool: number[], entries: Map<number, number[]>, userTeamId: number, withHighlights: boolean
) {
  const db = await requireDb();
  const maps = await getAllMaps();
  const entryA = entries.get(match.sideA) ?? await aiEntry(match.sideA);
  const entryB = entries.get(match.sideB) ?? await aiEntry(match.sideB);
  const all = await playersByIds([...entryA, ...entryB]);
  const isUser = (p: Player) => p.teamId === userTeamId;
  const sets: SetRecord[] = [];
  let scoreA = 0, scoreB = 0;
  const mapIds = roundMaps(mapPool, round);
  for (let i = 0; i < PRO_SETS && scoreA < PRO_WIN_SETS && scoreB < PRO_WIN_SETS; i++) {
    const map = maps.find(m => m.id === mapIds[i]) ?? maps[0];
    const a = all.get(entryA[i])!, b = all.get(entryB[i])!;
    const { winner, res } = await playOneSet(a, b, map, withHighlights, isUser);
    if (winner === "a") scoreA++; else scoreB++;
    await applySetEffects(a, winner === "a", isUser(a), PRO_SET_FATIGUE);
    await applySetEffects(b, winner === "b", isUser(b), PRO_SET_FATIGUE);
    sets.push({
      mapId: map.id, mapName: map.name, a: toSetPlayer(a), b: toSetPlayer(b), winner,
      duration: res.duration, endReason: res.endReason, highlights: withHighlights ? res.highlights : undefined,
    });
  }
  const winner = scoreA > scoreB ? match.sideA : match.sideB;
  await db.update(leagueMatches).set({
    scoreA, scoreB, winner, status: "done", sets: JSON.stringify(sets), playedAt: toMysqlDatetime(new Date())!,
  }).where(eq(leagueMatches.id, match.id));
  return { scoreA, scoreB, winner, sets };
}

export async function playProRound(team: Team, wallet: Player, entry: number[]) {
  const db = await requireDb();
  const season = await latestSeason(team.id, "proleague");
  if (!season || season.status !== "active") throw new Error("진행 중인 프로리그 시즌이 없습니다");
  if (entry.length !== PRO_SETS) throw new Error(`${PRO_SETS}세트 엔트리를 모두 정해주세요`);

  // 엔트리 검증: 우리 팀 선수, 최소 피로도
  const roster = await teamRoster(team.id);
  for (const id of new Set(entry)) {
    const p = roster.find(r => r.id === id);
    if (!p) throw new Error("우리 팀 선수만 출전할 수 있습니다");
    const fresh = await refreshPlayerDaily(p);
    if (fresh.fatigue < MIN_FATIGUE_TO_PLAY) throw new Error(`${p.name} 선수의 피로도가 부족합니다 (${fresh.fatigue}, 최소 ${MIN_FATIGUE_TO_PLAY})`);
  }

  const data = asJson<ProData>(season.data);
  const roundMatches = (await db.select().from(leagueMatches)
    .where(and(eq(leagueMatches.seasonId, season.id), eq(leagueMatches.round, season.round))))
    .filter(m => m.status === "scheduled");
  const mine = roundMatches.find(m => m.sideA === team.id || m.sideB === team.id);
  if (!mine) throw new Error("이번 라운드 경기가 없습니다");

  const entries = new Map<number, number[]>([[team.id, entry]]);
  const oppId = mine.sideA === team.id ? mine.sideB : mine.sideA;
  const planned = data.planned?.[mine.id];
  if (planned) {
    // 공개된 엔트리 중 팀을 떠난 선수가 있으면 새로 편성
    const stillThere = (await playersByIds(planned));
    if (planned.every(id => stillThere.get(id)?.teamId === oppId)) entries.set(oppId, planned);
  }
  const myResult = await playProMatch(mine, season.round, data.mapPool, entries, team.id, true);
  for (const m of roundMatches.filter(x => x.id !== mine.id)) {
    await playProMatch(m, season.round, data.mapPool, new Map(), team.id, false);
  }

  const won = myResult.winner === team.id;
  const gold = won ? PRO_MATCH_GOLD.win : PRO_MATCH_GOLD.lose;
  await updatePlayerGold(wallet.id, gold);

  // 다음 라운드 또는 시즌 종료
  let finished = null;
  if (season.round >= PRO_ROUNDS) {
    const matches = await db.select().from(leagueMatches).where(eq(leagueMatches.seasonId, season.id));
    const standings = computeStandings(data.teamIds, matches);
    const rank = standings.findIndex(s => s.teamId === team.id) + 1;
    const reward = PRO_SEASON_REWARD[rank - 1] ?? 0;
    await updatePlayerGold(wallet.id, reward);
    const championTeam = (await db.select().from(teams).where(eq(teams.id, standings[0].teamId)).limit(1))[0];
    finished = { rank, reward, champion: { id: championTeam.id, name: championTeam.name, emblem: championTeam.emblem } };
    await db.update(leagueSeasons).set({
      status: "finished", result: JSON.stringify(finished), finishedAt: toMysqlDatetime(new Date())!,
    }).where(eq(leagueSeasons.id, season.id));
  } else {
    await db.update(leagueSeasons).set({ round: season.round + 1 }).where(eq(leagueSeasons.id, season.id));
  }

  const mySide = mine.sideA === team.id ? "a" : "b";
  return {
    round: season.round,
    opponentTeamId: mySide === "a" ? mine.sideB : mine.sideA,
    mySide,
    myScore: mySide === "a" ? myResult.scoreA : myResult.scoreB,
    oppScore: mySide === "a" ? myResult.scoreB : myResult.scoreA,
    won,
    gold,
    sets: myResult.sets,
    finished,
  };
}

export async function newProSeason(team: Team) {
  const season = await latestSeason(team.id, "proleague");
  if (season && season.status === "active") throw new Error("아직 시즌이 진행 중입니다");
  return createProSeason(team);
}

// ── 개인리그 ───────────────────────────────────────────────────

export async function createIndividualSeason(team: Team): Promise<Season> {
  await ensureAiTeams();
  const db = await requireDb();
  const roster = await teamRoster(team.id);
  const myPower = (await teamStrength(team.id)) || 4000;
  const mine = roster.slice(0, INDIVIDUAL_SIZE / 2);

  // 나머지는 실력이 비슷한 AI 선수들로 채움 (AI 팀 선수 + 자유계약 선수)
  const lo = myPower - 500, hi = myPower + 900;
  const total = sql<number>`(${playerStats.sense} + ${playerStats.control} + ${playerStats.attack} + ${playerStats.harass} + ${playerStats.strategy} + ${playerStats.supply} + ${playerStats.defense} + ${playerStats.scout})`;
  const pool = await db.select({ id: players.id }).from(players)
    .innerJoin(playerStats, eq(playerStats.playerId, players.id))
    .where(and(eq(players.isBot, 1), sql`${total} BETWEEN ${lo} AND ${hi}`))
    .limit(200);
  const others = shuffle(pool.map(p => p.id)).slice(0, INDIVIDUAL_SIZE - mine.length);
  while (mine.length + others.length < INDIVIDUAL_SIZE) {
    const bot = await createBotPlayer("intermediate", { min: lo, max: hi });
    others.push(bot.id);
  }
  const entrants = shuffle([...mine.map(p => p.id), ...others]);
  const mapPool = shuffle(await activeMaps()).slice(0, 7).map(m => m.id);
  const season = await insertSeason(team.id, "individual", { entrants, mapPool });
  const existing = await db.select().from(leagueMatches).where(eq(leagueMatches.seasonId, season.id)).limit(1);
  if (!existing.length) {
    for (let slot = 0; slot < INDIVIDUAL_SIZE / 2; slot++) {
      await db.insert(leagueMatches).values({ seasonId: season.id, round: 1, slot, sideA: entrants[slot * 2], sideB: entrants[slot * 2 + 1] });
    }
  }
  return season;
}

export async function getIndividual(team: Team) {
  let season = await latestSeason(team.id, "individual");
  if (!season) season = await createIndividualSeason(team);
  const db = await requireDb();
  const data = asJson<{ entrants: number[]; mapPool: number[] }>(season.data);
  const matches = await db.select().from(leagueMatches).where(eq(leagueMatches.seasonId, season.id));
  const ids = data.entrants;
  const pmap = await playersByIds(ids);
  const described = await describePlayers(ids.map(id => pmap.get(id)!).filter(Boolean));
  const teamIds = Array.from(new Set(Array.from(pmap.values()).map(p => p.teamId).filter(Boolean)));
  const teamRows = teamIds.length ? await db.select().from(teams).where(inArray(teams.id, teamIds)) : [];
  return {
    season: {
      id: season.id, seasonNo: season.seasonNo, status: season.status, round: season.round,
      roundName: INDIVIDUAL_ROUNDS[season.round - 1]?.name ?? "종료",
      result: season.result ? asJson(season.result) : null,
    },
    rounds: INDIVIDUAL_ROUNDS,
    entrants: described.map(d => {
      const p = pmap.get(d.id)!;
      const t = teamRows.find(x => x.id === p.teamId);
      return { ...d, isMine: p.teamId === team.id, teamName: t?.name ?? null, teamEmblem: t?.emblem ?? null };
    }),
    matches: matches
      .sort((a, b) => a.round - b.round || a.slot - b.slot)
      .map(m => {
        const involvesMine = [m.sideA, m.sideB].some(id => pmap.get(id)?.teamId === team.id);
        return {
          id: m.id, round: m.round, slot: m.slot, sideA: m.sideA, sideB: m.sideB, scoreA: m.scoreA, scoreB: m.scoreB,
          status: m.status, winner: m.winner, sets: involvesMine ? asJson<SetRecord[] | null>(m.sets) : null,
        };
      }),
  };
}

function placementName(round: number, won: boolean): string {
  if (round === 4) return won ? "우승" : "준우승";
  return INDIVIDUAL_ROUNDS[round - 1].name;
}

export async function playIndividualRound(team: Team, wallet: Player) {
  const db = await requireDb();
  const season = await latestSeason(team.id, "individual");
  if (!season || season.status !== "active") throw new Error("진행 중인 개인리그가 없습니다");
  const data = asJson<{ entrants: number[]; mapPool: number[] }>(season.data);
  const round = season.round;
  const bestOf = INDIVIDUAL_ROUNDS[round - 1].bestOf;
  const need = Math.ceil(bestOf / 2);
  const maps = await getAllMaps();
  const matches = (await db.select().from(leagueMatches)
    .where(and(eq(leagueMatches.seasonId, season.id), eq(leagueMatches.round, round))))
    .sort((a, b) => a.slot - b.slot);
  const isUser = (p: Player) => p.teamId === team.id;

  const results: Array<{ matchId: number; a: SetPlayer | null; b: SetPlayer | null; scoreA: number; scoreB: number; winner: number; sets: SetRecord[] }> = [];
  const placements: Array<{ playerId: number; name: string; place: string; gold: number }> = [];

  for (const m of matches) {
    if (m.status === "done") continue;
    const pm = await playersByIds([m.sideA, m.sideB]);
    const a = pm.get(m.sideA)!, b = pm.get(m.sideB)!;
    const mineInvolved = isUser(a) || isUser(b);
    let scoreA = 0, scoreB = 0;
    const sets: SetRecord[] = [];
    for (let i = 0; scoreA < need && scoreB < need; i++) {
      const map = maps.find(x => x.id === data.mapPool[(round + i) % data.mapPool.length]) ?? maps[0];
      const { winner, res } = await playOneSet(a, b, map, mineInvolved, isUser);
      if (winner === "a") scoreA++; else scoreB++;
      await applySetEffects(a, winner === "a", isUser(a), INDIVIDUAL_SET_FATIGUE);
      await applySetEffects(b, winner === "b", isUser(b), INDIVIDUAL_SET_FATIGUE);
      sets.push({ mapId: map.id, mapName: map.name, a: toSetPlayer(a), b: toSetPlayer(b), winner, duration: res.duration, endReason: res.endReason, highlights: mineInvolved ? res.highlights : undefined });
    }
    const winnerId = scoreA > scoreB ? a.id : b.id;
    await db.update(leagueMatches).set({
      scoreA, scoreB, winner: winnerId, status: "done", sets: JSON.stringify(sets), playedAt: toMysqlDatetime(new Date())!,
    }).where(eq(leagueMatches.id, m.id));
    results.push({ matchId: m.id, a: toSetPlayer(a), b: toSetPlayer(b), scoreA, scoreB, winner: winnerId, sets: mineInvolved ? sets : [] });

    // 탈락한 우리 선수 / 결승 결과 상금
    for (const p of [a, b]) {
      if (!isUser(p)) continue;
      const won = p.id === winnerId;
      if (!won || round === INDIVIDUAL_ROUNDS.length) {
        const place = placementName(round, won);
        placements.push({ playerId: p.id, name: p.name, place, gold: INDIVIDUAL_REWARD[place] ?? 0 });
      }
    }
  }

  const reward = placements.reduce((s, p) => s + p.gold, 0);
  if (reward > 0) await updatePlayerGold(wallet.id, reward);

  let finished = null;
  if (round >= INDIVIDUAL_ROUNDS.length) {
    const final = results[0] ?? null;
    const done = await db.select().from(leagueMatches).where(and(eq(leagueMatches.seasonId, season.id), eq(leagueMatches.round, round)));
    const championId = final?.winner ?? done[0]?.winner ?? 0;
    const champ = (await playersByIds([championId])).get(championId);
    const prevResult = asJson<{ placements?: typeof placements } | null>(season.result) ?? {};
    finished = {
      champion: champ ? { id: champ.id, name: champ.name, race: champ.race, isMine: champ.teamId === team.id } : null,
      placements: [...(prevResult.placements ?? []), ...placements],
    };
    await db.update(leagueSeasons).set({
      status: "finished", result: JSON.stringify(finished), finishedAt: toMysqlDatetime(new Date())!,
    }).where(eq(leagueSeasons.id, season.id));
  } else {
    // 다음 라운드 대진: 인접한 경기 승자끼리
    const winners = matches.map(m => results.find(r => r.matchId === m.id)?.winner ?? m.winner!);
    for (let slot = 0; slot < winners.length / 2; slot++) {
      await db.insert(leagueMatches).values({ seasonId: season.id, round: round + 1, slot, sideA: winners[slot * 2], sideB: winners[slot * 2 + 1] });
    }
    const prevResult = asJson<{ placements?: typeof placements } | null>(season.result) ?? {};
    await db.update(leagueSeasons).set({
      round: round + 1, result: JSON.stringify({ placements: [...(prevResult.placements ?? []), ...placements] }),
    }).where(eq(leagueSeasons.id, season.id));
  }

  return {
    round,
    roundName: INDIVIDUAL_ROUNDS[round - 1].name,
    results: results.filter(r => r.sets.length > 0),
    placements,
    reward,
    finished,
  };
}

export async function newIndividualSeason(team: Team) {
  const season = await latestSeason(team.id, "individual");
  if (season && season.status === "active") throw new Error("아직 개인리그가 진행 중입니다");
  return createIndividualSeason(team);
}

/** 지난 시즌 기록 */
export async function getLeagueHistory(team: Team) {
  const db = await requireDb();
  const rows = await db.select().from(leagueSeasons)
    .where(and(eq(leagueSeasons.teamId, team.id), eq(leagueSeasons.status, "finished")))
    .orderBy(desc(leagueSeasons.id)).limit(20);
  return rows.map(r => ({ id: r.id, kind: r.kind, seasonNo: r.seasonNo, result: r.result ? asJson(r.result) : null, finishedAt: r.finishedAt }));
}
