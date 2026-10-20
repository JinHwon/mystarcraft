/**
 * 서버 상태: 디스크 사용률과 DB 백업 현황 (관리자 패널 경고용)
 * 백업은 deploy/backup.sh 가 매일 BACKUP_DIR(기본 ~/backups)에 만든다
 */
import { readdirSync, statSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DISK_WARN = 0.8;
export const DISK_CRIT = 0.9;

export function diskStatus(path = "/") {
  try {
    const st = statfsSync(path);
    const total = st.blocks * st.bsize, free = st.bavail * st.bsize;
    const used = total - free;
    const ratio = total ? used / total : 0;
    return { ok: true as const, totalGB: +(total / 2 ** 30).toFixed(1), usedGB: +(used / 2 ** 30).toFixed(1), freeGB: +(free / 2 ** 30).toFixed(1), ratio: +ratio.toFixed(3), level: ratio >= DISK_CRIT ? ("critical" as const) : ratio >= DISK_WARN ? ("warn" as const) : ("ok" as const) };
  } catch (e) {
    return { ok: false as const, error: String((e as Error).message) };
  }
}

export function backupStatus(dir = process.env.BACKUP_DIR || join(homedir(), "backups")) {
  try {
    const files = readdirSync(dir).filter(f => /^mystarcraft-.*\.sql\.gz$/.test(f)).map(f => ({ f, st: statSync(join(dir, f)) })).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    if (!files.length) return { ok: true as const, count: 0, latestAt: null as number | null, latestMB: 0, stale: true };
    const newest = files[0];
    return { ok: true as const, count: files.length, latestAt: newest.st.mtimeMs, latestMB: +(newest.st.size / 2 ** 20).toFixed(1), stale: Date.now() - newest.st.mtimeMs > 36 * 3600_000 };
  } catch {
    return { ok: false as const, error: "백업 폴더를 읽을 수 없습니다" };
  }
}
