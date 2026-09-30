import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { InsertUser, users, events, localCredentials } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * MySQL DATETIME/TIMESTAMP 형식(UTC, "YYYY-MM-DD HH:MM:SS")으로 변환
 * MySQL 8은 ISO 문자열의 "T"/"Z"를 거부하므로 저장 전에 변환한다.
 */
export function toMysqlDatetime(value: Date | string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === "") return value as null | undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value as string;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      _db = drizzle(ENV.databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

// ── 사용자 ──────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    const value = user[field];
    if (value === undefined) continue;
    values[field] = value ?? null;
    updateSet[field] = value ?? null;
  }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

/** 마지막 접속 시각 갱신 (요청마다 쓰지 않도록 호출하는 쪽에서 간격을 둔다) */
export async function touchLastSignedIn(userId: number, at = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: at }).where(eq(users.id, userId));
}

/**
 * 자체 로그인 계정 생성. 중복 아이디면 false 반환 (기존 계정을 덮어쓰지 않도록 upsert 대신 insert 사용)
 */
export async function createLocalUser(openId: string, name: string, passwordHash: string): Promise<boolean> {
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      await tx.insert(localCredentials).values({ openId, passwordHash });
      await tx.insert(users).values({
        openId,
        name,
        loginMethod: "local",
        role: adminOpenIds().includes(openId) ? "admin" : "user",
        lastSignedIn: new Date(),
      });
    });
    return true;
  } catch (error: any) {
    const code = error?.code ?? error?.cause?.code;
    if (code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

/** ADMIN_USERNAMES 에 지정된 로컬 계정의 openId 목록 */
function adminOpenIds(): string[] {
  return ENV.adminUsernames.map(name => `local_${name.toLowerCase()}`);
}

/** ADMIN_USERNAMES 에 지정된 기존 계정을 관리자로 승격 (서버 시작 시 실행, 여러 번 실행해도 안전) */
export async function promoteConfiguredAdmins(): Promise<number> {
  const ids = adminOpenIds();
  if (ids.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(users).set({ role: "admin" }).where(and(inArray(users.openId, ids), ne(users.role, "admin")));
  return Number((result as any)?.[0]?.affectedRows ?? 0);
}

/** ADMIN_USERNAMES 로 지정된 계정인지 (관리자 화면에서 강등하지 못하게) */
export function isConfiguredAdmin(openId: string): boolean {
  return adminOpenIds().includes(openId);
}

export async function getLocalPasswordHash(openId: string): Promise<string | null> {
  const db = await requireDb();
  const result = await db.select().from(localCredentials).where(eq(localCredentials.openId, openId)).limit(1);
  return result[0]?.passwordHash ?? null;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? null;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}

export async function updateUserRole(userId: number, role: "admin" | "user") {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ── 운영 이벤트 ──────────────────────────────────────────────────

export type EventInput = {
  type?: "exp_double" | "fatigue_unlimited" | "gold_double" | "stat_boost";
  name?: string;
  description?: string;
  isActive?: boolean;
  startTime?: Date;
  endTime?: Date;
};

function eventValues(input: EventInput) {
  const { isActive, startTime, endTime, ...rest } = input;
  return {
    ...rest,
    ...(isActive !== undefined ? { isActive: isActive ? 1 : 0 } : {}),
    ...(startTime !== undefined ? { startTime: toMysqlDatetime(startTime) } : {}),
    ...(endTime !== undefined ? { endTime: toMysqlDatetime(endTime) } : {}),
  };
}

export async function createEvent(input: EventInput & Required<Pick<EventInput, "type" | "name">>) {
  const db = await requireDb();
  const result = await db.insert(events).values({ ...eventValues(input), type: input.type, name: input.name });
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateEvent(eventId: number, input: EventInput) {
  const db = await requireDb();
  const values = eventValues(input);
  if (Object.keys(values).length === 0) return;
  await db.update(events).set(values).where(eq(events.id, eventId));
}

export async function deleteEvent(eventId: number) {
  const db = await requireDb();
  await db.delete(events).where(eq(events.id, eventId));
}

export async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(events);
}

/** 켜져 있고 지금이 시작~종료 시간 안에 드는 이벤트 (시간이 비어 있으면 제한 없음) */
export async function getActiveEvents() {
  const db = await getDb();
  if (!db) return [];
  const now = toMysqlDatetime(new Date())!;
  return await db
    .select()
    .from(events)
    .where(and(
      eq(events.isActive, 1),
      or(isNull(events.startTime), lte(events.startTime, now)),
      or(isNull(events.endTime), gte(events.endTime, now)),
    ));
}
