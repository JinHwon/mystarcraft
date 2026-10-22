/**
 * 운영 설정 (app_settings 키-값). 자주 읽으므로 메모리에 잠깐 들고 있는다
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { appSettings } from "../drizzle/schema";

const cache = new Map<string, { value: string | null; at: number }>();
const TTL = 30_000;

export async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const value = rows[0]?.value ?? null;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");
  await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
  cache.set(key, { value, at: Date.now() });
}

/** 선수 키우기 모드: 관리자는 항상, 일반 사용자는 공개했을 때만 */
export const ROOKIE_OPEN_KEY = "rookie_open";
export async function rookieOpen() { return (await getSetting(ROOKIE_OPEN_KEY)) === "1"; }

/** 선수 키우기 베타 테스터 (공개 전에도 들어갈 수 있는 사용자 id, 쉼표로 구분) */
export const ROOKIE_BETA_KEY = "rookie_beta";
export async function rookieBeta(): Promise<number[]> {
  const v = await getSetting(ROOKIE_BETA_KEY);
  return (v ?? "").split(",").map(Number).filter(n => Number.isInteger(n) && n > 0);
}
export async function setRookieBeta(ids: number[]) {
  await setSetting(ROOKIE_BETA_KEY, [...new Set(ids)].join(","));
}
/** 선수 키우기에 들어갈 수 있는지: 관리자 · 공개됨 · 베타 테스터 */
export async function rookieAllowed(user: { id: number; role: string }) {
  return user.role === "admin" || (await rookieOpen()) || (await rookieBeta()).includes(user.id);
}
