/**
 * 팀 운영 · 컨디션 · 육성(훈련/휴식) 로직
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { players, playerStats, teams, gameResults } from "../drizzle/schema";
import { STAT_KEYS, StatKey, STAT_MAX, calcTotalStats, calcGrade, calcExpToNext } from "@shared/gameConstants";
import {
  clampCondition,
  calcRecruitPrice,
  MAX_ROSTER,
  SCOUT_LIST_SIZE,
  TRAINING_MENUS,
  TrainingKey,
  TRAINING_CONDITION_COST,
  trainingGrowthFactor,
  REST_FATIGUE,
  REST_CONDITION,
} from "@shared/teamConstants";
import { getDb, getTodayDateString, toMysqlDatetime, createBotPlayer, countBotPlayers } from "./db";

type Player = typeof players.$inferSelect;
type Team = typeof teams.$inferSelect;

const AI_PREFIX = "AI_";

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

function kstDate(date: Date): string {
  const k = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}

// ── 컨디션 / 피로도 일일 갱신 ────────────────────────────────────

/** 새 날의 컨디션: 전날 컨디션을 조금 이어받고 무작위로 변동 */
function rollDailyCondition(prev: number): number {
  return clampCondition(100 + (prev - 100) * 0.3 + randInt(-14, 14));
}

/**
 * 선수의 컨디션(매일 갱신)과, 팀 소속 선수(본인 선수 제외)의 피로도 자동 회복을 반영한다.
 * 본인 선수의 피로도는 기존 방식(클라이언트 10분 틱)을 그대로 쓴다.
 */
export async function refreshPlayerDaily(p: Player): Promise<Player> {
  const db = await requireDb();
  const today = getTodayDateString();
  const update: Partial<Player> = {};

  if (p.conditionDate !== today) {
    update.condition = rollDailyCondition(p.condition ?? 100);
    update.conditionDate = today;
  }

  const isRosterMember = p.teamId > 0 && p.userId === 0;
  if (isRosterMember) {
    const now = new Date();
    const last = p.lastFatigueRecovery ? new Date(p.lastFatigueRecovery) : new Date(0);
    if (Number.isNaN(last.getTime()) || kstDate(last) < today) {
      update.fatigue = 100;
      update.lastFatigueRecovery = toMysqlDatetime(now)!;
    } else {
      const ticks = Math.floor((now.getTime() - last.getTime()) / (10 * 60 * 1000));
      if (ticks > 0) {
        update.fatigue = Math.min(100, p.fatigue + ticks * 5);
        const next = p.fatigue >= 100 ? now : new Date(last.getTime() + ticks * 10 * 60 * 1000);
        update.lastFatigueRecovery = toMysqlDatetime(next)!;
      }
    }
  }

  if (Object.keys(update).length === 0) return p;
  await db.update(players).set(update).where(eq(players.id, p.id));
  return { ...p, ...update };
}

/** 오늘 컨디션 조회 (필요하면 갱신) */
export async function getPlayerCondition(playerId: number): Promise<number> {
  const db = await requireDb();
  const rows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!rows[0]) return 100;
  return (await refreshPlayerDaily(rows[0])).condition;
}

/** 경기 결과 등으로 컨디션 변동 */
export async function changeCondition(playerId: number, delta: number) {
  const db = await requireDb();
  await db.update(players)
    .set({ condition: sql`LEAST(120, GREATEST(80, ${players.condition} + ${delta}))` })
    .where(eq(players.id, playerId));
}

// ── 팀 ──────────────────────────────────────────────────────────

/** 유저의 팀을 가져오고, 없으면 만든다 (본인 선수를 팀에 소속시킴) */
export async function ensureTeam(userId: number, mainPlayer: Player): Promise<Team> {
  const db = await requireDb();
  let rows = await db.select().from(teams).where(and(eq(teams.userId, userId), eq(teams.isAi, 0))).limit(1);
  if (!rows[0]) {
    await db.insert(teams).values({ userId, name: `${mainPlayer.name} 팀`.slice(0, 50), emblem: "🛡️" });
    rows = await db.select().from(teams).where(and(eq(teams.userId, userId), eq(teams.isAi, 0))).limit(1);
  }
  const team = rows[0];
  if (mainPlayer.teamId !== team.id) {
    await db.update(players).set({ teamId: team.id }).where(eq(players.id, mainPlayer.id));
  }
  return team;
}

export async function renameTeam(teamId: number, name: string, emblem: string) {
  const db = await requireDb();
  await db.update(teams).set({ name, emblem }).where(eq(teams.id, teamId));
}

export async function getTeamById(teamId: number): Promise<Team | null> {
  const db = await requireDb();
  const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  return rows[0] ?? null;
}

/** 선수 목록 + 능력치/등급/전적을 붙여 반환 */
export async function describePlayers(list: Player[]) {
  if (list.length === 0) return [];
  const db = await requireDb();
  const ids = list.map(p => p.id);
  const statRows = await db.select().from(playerStats).where(inArray(playerStats.playerId, ids));
  const recordRows = await db
    .select({
      playerId: gameResults.playerId,
      wins: sql<number>`sum(${gameResults.isWinner})`,
      total: sql<number>`count(*)`,
    })
    .from(gameResults)
    .where(inArray(gameResults.playerId, ids))
    .groupBy(gameResults.playerId);

  return list.map(p => {
    const s = statRows.find(r => r.playerId === p.id);
    const stats = Object.fromEntries(STAT_KEYS.map(k => [k, (s as any)?.[k] ?? 500])) as Record<StatKey, number>;
    const totalStats = calcTotalStats(stats);
    const rec = recordRows.find(r => r.playerId === p.id);
    const wins = Number(rec?.wins ?? 0);
    const total = Number(rec?.total ?? 0);
    return {
      id: p.id,
      name: p.name,
      race: p.race,
      level: p.level,
      photoUrl: p.photoUrl,
      fatigue: p.fatigue,
      condition: p.condition,
      rested: p.lastRestDate === getTodayDateString(),
      isMain: p.userId !== 0,
      stats,
      totalStats,
      grade: calcGrade(totalStats),
      wins,
      losses: total - wins,
      price: calcRecruitPrice(totalStats, p.level),
    };
  });
}

export async function getRoster(team: Team) {
  const db = await requireDb();
  const rows = await db.select().from(players).where(eq(players.teamId, team.id));
  const refreshed = await Promise.all(rows.map(refreshPlayerDaily));
  // 본인 선수 먼저, 그다음 능력치 순
  const described = await describePlayers(refreshed);
  return described.sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.totalStats - a.totalStats);
}

/** 선수가 이 팀 소속인지 확인하고 반환 */
export async function getOwnedPlayer(team: Team, playerId: number): Promise<Player> {
  const db = await requireDb();
  const rows = await db.select().from(players).where(and(eq(players.id, playerId), eq(players.teamId, team.id))).limit(1);
  if (!rows[0]) throw new Error("우리 팀 선수가 아닙니다");
  return refreshPlayerDaily(rows[0]);
}

// ── 영입 / 방출 ─────────────────────────────────────────────────

/** 문자열로 만든 간단한 시드 난수 (하루 동안 같은 영입 후보를 보여주기 위함) */
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** 오늘의 영입 후보 (자유계약 AI 선수 중에서) */
export async function getScoutList(team: Team) {
  const db = await requireDb();
  const freeAgents = () => db.select().from(players).where(and(eq(players.isBot, 1), eq(players.teamId, 0)));
  let pool = await freeAgents();
  if (pool.length < SCOUT_LIST_SIZE * 2 && (await countBotPlayers()) < 120) {
    const diffs = ["beginner", "intermediate", "advanced"];
    for (let i = pool.length; i < SCOUT_LIST_SIZE * 2; i++) {
      await createBotPlayer(diffs[i % diffs.length]);
    }
    pool = await freeAgents();
  }
  // 능력치 순으로 3구간(하위/중위/상위)으로 나눠 2 / 2 / 1명씩 뽑는다 → 저렴한 선수도 항상 후보에 포함
  const rand = seededRandom(`${team.id}:${getTodayDateString()}`);
  const all = (await describePlayers([...pool].sort((a, b) => a.id - b.id)))
    .sort((a, b) => a.totalStats - b.totalStats || a.id - b.id);
  const third = Math.ceil(all.length / 3);
  const tiers = [all.slice(0, third), all.slice(third, third * 2), all.slice(third * 2)];
  const quota = [2, 2, 1];
  const picked: typeof all = [];
  tiers.forEach((tier, i) => {
    const shuffled = tier.map(p => ({ p, r: rand() })).sort((a, b) => a.r - b.r).map(x => x.p);
    picked.push(...shuffled.slice(0, quota[i]));
  });
  for (const p of all) {
    if (picked.length >= SCOUT_LIST_SIZE) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked.slice(0, SCOUT_LIST_SIZE).sort((a, b) => a.price - b.price);
}

async function rosterCount(teamId: number) {
  const db = await requireDb();
  const rows = await db.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, teamId));
  return Number(rows[0]?.n ?? 0);
}

async function spendGold(walletPlayerId: number, amount: number) {
  if (amount <= 0) return;
  const db = await requireDb();
  const res = await db.update(players)
    .set({ gold: sql`${players.gold} - ${amount}` })
    .where(and(eq(players.id, walletPlayerId), sql`${players.gold} >= ${amount}`));
  if (Number((res as any)?.[0]?.affectedRows ?? 0) === 0) throw new Error(`골드가 부족합니다 (필요: ${amount}G)`);
}

function stripAiPrefix(name: string) {
  return name.startsWith(AI_PREFIX) ? name.slice(AI_PREFIX.length) : name;
}

export async function recruitPlayer(team: Team, wallet: Player, playerId: number) {
  const db = await requireDb();
  if ((await rosterCount(team.id)) >= MAX_ROSTER) throw new Error(`선수는 최대 ${MAX_ROSTER}명까지 보유할 수 있습니다`);
  const scoutList = await getScoutList(team);
  const target = scoutList.find(p => p.id === playerId);
  if (!target) throw new Error("오늘의 영입 후보가 아닙니다");

  await spendGold(wallet.id, target.price);
  const res = await db.update(players)
    .set({ teamId: team.id, isBot: 0, name: stripAiPrefix(target.name), lastFatigueRecovery: toMysqlDatetime(new Date())! })
    .where(and(eq(players.id, playerId), eq(players.isBot, 1), eq(players.teamId, 0)));
  if (Number((res as any)?.[0]?.affectedRows ?? 0) === 0) {
    // 동시에 다른 팀이 먼저 영입한 경우 환불
    await db.update(players).set({ gold: sql`${players.gold} + ${target.price}` }).where(eq(players.id, wallet.id));
    throw new Error("이미 다른 팀에 영입된 선수입니다");
  }
  return { name: stripAiPrefix(target.name), price: target.price };
}

const ROOKIE_NAMES = [
  "Flash", "Jaedong", "Bisu", "Stork", "Jangbi", "Fantasy", "Leta", "Hydra", "Movie", "Sea",
  "Rush", "Mind", "Soulkey", "Effort", "Last", "Sharp", "Snow", "Shuttle", "Light", "Rain",
  "Mini", "Zero", "Killer", "Hero", "Action", "Ample", "Horang", "Kwanro", "Sky", "Nal_rA",
];

/** 신인 발굴: 비용을 내고 무작위 신인을 바로 팀에 합류시킨다 (재능은 운) */
export async function scoutRookie(team: Team, wallet: Player, cost: number) {
  const db = await requireDb();
  if ((await rosterCount(team.id)) >= MAX_ROSTER) throw new Error(`선수는 최대 ${MAX_ROSTER}명까지 보유할 수 있습니다`);
  await spendGold(wallet.id, cost);

  // 능력치 합계 3700~4500 (가끔 대형 신인)
  const talent = Math.random() < 0.12 ? randInt(4400, 4800) : randInt(3700, 4400);
  const stats: Record<string, number> = {};
  let remaining = talent;
  const avg = talent / STAT_KEYS.length;
  STAT_KEYS.forEach((key, i) => {
    if (i === STAT_KEYS.length - 1) stats[key] = Math.max(300, remaining);
    else {
      stats[key] = Math.max(300, Math.round(avg + randInt(-70, 70)));
      remaining -= stats[key];
    }
  });
  const races = ["terran", "zerg", "protoss"] as const;
  const race = races[randInt(0, 2)];
  const name = `${ROOKIE_NAMES[randInt(0, ROOKIE_NAMES.length - 1)]}${randInt(1, 99)}`;
  const result = await db.insert(players).values({
    userId: 0,
    teamId: team.id,
    name,
    race,
    level: 1,
    exp: 0,
    expToNext: calcExpToNext(1),
    statPoints: 0,
    gold: 0,
    fatigue: 100,
    grade: "D",
    isBot: 0,
    lastFatigueRecovery: toMysqlDatetime(new Date())!,
  });
  const playerId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
  await db.insert(playerStats).values({ playerId, ...(stats as any) });
  return { playerId, name, race, totalStats: calcTotalStats(stats as Record<StatKey, number>) };
}

/** 방출: 자유계약 AI 선수로 돌아간다 (본인 선수는 방출 불가) */
export async function releasePlayer(team: Team, playerId: number) {
  const db = await requireDb();
  const p = await getOwnedPlayer(team, playerId);
  if (p.userId !== 0) throw new Error("본인 선수는 방출할 수 없습니다");
  await db.update(players)
    .set({ teamId: 0, isBot: 1, name: `${AI_PREFIX}${stripAiPrefix(p.name)}`.slice(0, 100) })
    .where(eq(players.id, p.id));
  return { name: p.name };
}

// ── 훈련 / 휴식 ─────────────────────────────────────────────────

export type TrainingOutcome = "great" | "normal" | "poor";

export async function trainPlayer(team: Team, wallet: Player, playerId: number, menuKey: TrainingKey) {
  const db = await requireDb();
  const menu = TRAINING_MENUS.find(m => m.key === menuKey);
  if (!menu) throw new Error("알 수 없는 훈련입니다");
  const p = await getOwnedPlayer(team, playerId);
  if (p.fatigue < menu.fatigue + 1) throw new Error(`피로도가 부족합니다 (현재 ${p.fatigue}, 필요 ${menu.fatigue + 1} 이상)`);
  await spendGold(wallet.id, menu.gold);

  const statRow = (await db.select().from(playerStats).where(eq(playerStats.playerId, p.id)).limit(1))[0];
  const current = Object.fromEntries(STAT_KEYS.map(k => [k, (statRow as any)?.[k] ?? 500])) as Record<StatKey, number>;

  // 대성공 12%, 부진 12% (컨디션이 좋을수록 대성공이 잘 나옴)
  const roll = Math.random();
  const greatChance = 0.12 + (p.condition - 100) / 400;
  const outcome: TrainingOutcome = roll < greatChance ? "great" : roll > 0.88 ? "poor" : "normal";
  const outcomeMul = outcome === "great" ? 2 : outcome === "poor" ? 0.35 : 1;
  const conditionMul = p.condition / 100;

  const gains: Partial<Record<StatKey, number>> = {};
  const next: Record<string, number> = {};
  for (const [key, weight] of Object.entries(menu.stats) as [StatKey, number][]) {
    const base = randInt(3, 6) * weight * trainingGrowthFactor(current[key]) * outcomeMul * conditionMul;
    let gain = Math.round(base);
    if (gain === 0 && weight >= 1 && outcome !== "poor") gain = 1;
    gain = Math.min(gain, STAT_MAX - current[key]);
    if (gain > 0) {
      gains[key] = gain;
      next[key] = current[key] + gain;
    }
  }
  if (Object.keys(next).length > 0) {
    if (statRow) await db.update(playerStats).set(next as any).where(eq(playerStats.playerId, p.id));
    else await db.insert(playerStats).values({ playerId: p.id, ...current, ...next } as any);
  }
  const fatigue = Math.max(0, p.fatigue - menu.fatigue);
  const condition = clampCondition(p.condition - TRAINING_CONDITION_COST);
  await db.update(players).set({ fatigue, condition }).where(eq(players.id, p.id));

  return { playerName: p.name, menu: menu.name, outcome, gains, fatigue, condition, goldSpent: menu.gold };
}

export async function restPlayer(team: Team, playerId: number) {
  const db = await requireDb();
  const p = await getOwnedPlayer(team, playerId);
  const today = getTodayDateString();
  if (p.lastRestDate === today) throw new Error("오늘은 이미 휴식했습니다");
  const fatigue = Math.min(100, p.fatigue + REST_FATIGUE);
  const condition = clampCondition(p.condition + REST_CONDITION);
  await db.update(players).set({ fatigue, condition, lastRestDate: today }).where(eq(players.id, p.id));
  return { playerName: p.name, fatigue, condition };
}
