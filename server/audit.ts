/**
 * 계정별 활동 기록 (audit_logs). 쓰기 실패가 게임 진행을 막지 않도록 항상 조용히 실패한다
 * - big_money: 한 요청에서 자금이 크게 변한 경우 / season: 시즌 진행 / burst: 요청 폭주 / admin_edit: 관리자 수정
 */
import { desc, eq, lt } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { getDb } from "./db";

export type AuditKind = "big_money" | "season" | "burst" | "admin_edit";

export async function logAudit(userId: number, kind: AuditKind, amount = 0, detail?: string) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({ userId, kind, amount: Math.max(-2_000_000_000, Math.min(2_000_000_000, Math.round(amount))), detail: detail?.slice(0, 250) });
  } catch (e) {
    console.warn("[audit] 기록 실패", e);
  }
}

export async function recentAudit(limit = 100, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(auditLogs);
  return (userId ? q.where(eq(auditLogs.userId, userId)) : q).orderBy(desc(auditLogs.id)).limit(limit);
}

/** 90일이 지난 기록 정리 */
export async function pruneAudit() {
  try {
    const db = await getDb();
    if (!db) return;
    const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 19).replace("T", " ");
    await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
  } catch { /* 무시 */ }
}

/** 요청 폭주 감시: 한 사용자가 60초 안에 이 횟수를 넘기면 기록 (10분에 한 번만) */
const BURST_LIMIT = 120;
const recent = new Map<number, number[]>();
const lastBurst = new Map<number, number>();
export function noteRequest(userId: number, now = Date.now()): boolean {
  const list = (recent.get(userId) ?? []).filter(t => now - t < 60_000);
  list.push(now);
  recent.set(userId, list);
  if (recent.size > 2000) { for (const k of recent.keys()) { recent.delete(k); break; } }
  if (list.length > BURST_LIMIT && now - (lastBurst.get(userId) ?? 0) > 600_000) {
    lastBurst.set(userId, now);
    void logAudit(userId, "burst", list.length, `60초 안에 ${list.length}번 요청`);
    return true;
  }
  return false;
}
