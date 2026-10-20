/**
 * 세이브 분석: 돈·능력치 분포와 부정 이용·오류 의심 계정 (관리자 화면용)
 * tools/analyze-careers.mjs 와 같은 기준 (운영 DB 를 직접 읽지 않고 받은 행만 분석하는 순수 함수)
 */
import { gradeIndex, totalOf, type CareerState } from "@shared/career/rules";
import { STAT_KEYS } from "@shared/gameConstants";

export interface AnalysisRow { userId: number; role: string; name?: string; createdAt: number; updatedAt: number; state: CareerState }
export interface Flag { userId: number; name?: string; role: string; season: number; why: string[] }
export interface Dist { n: number; min: number; p25: number; median: number; p75: number; p90: number; max: number }

const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))] : 0);
export const distOf = (a: number[]): Dist => ({ n: a.length, min: pct(a, 0), p25: pct(a, 0.25), median: pct(a, 0.5), p75: pct(a, 0.75), p90: pct(a, 0.9), max: pct(a, 1) });

/** 한 번에 들어온 수입이 이 이상이면 의심 (만원) */
export const BIG_INCOME = 20_000;

export function analyzeCareers(rows: AnalysisRow[]) {
  const per: Array<{ userId: number; name?: string; role: string; season: number; money: number; myAvg: number; mySSS: number; worldSSS: number; difficulty: string; seasonsPerDay: number; days: number }> = [];
  const flags: Flag[] = [];
  const catIncome: Record<string, number> = {};
  for (const { userId, role, name, createdAt, updatedAt, state: s } of rows) {
    const players = (s.players ?? []).filter(p => p.team >= 0 && !p.retired);
    const mine = players.filter(p => p.team === s.myTeam);
    const money = s.teams?.[s.myTeam]?.money ?? 0;
    const seasons = (s.history?.length ?? 0) + 1;
    const days = Math.max(0.01, (updatedAt - createdAt) / 86400000);
    const myTotals = mine.map(p => totalOf(p.stats));
    const myAvg = myTotals.length ? myTotals.reduce((a, b) => a + b, 0) / myTotals.length : 0;
    const worldSSS = players.filter(p => gradeIndex(totalOf(p.stats)) >= 17).length;
    per.push({ userId, name, role, season: seasons, money, myAvg, mySSS: myTotals.filter(t => gradeIndex(t) >= 17).length, worldSSS, difficulty: s.difficulty ?? "normal", seasonsPerDay: seasons / days, days });

    const why: string[] = [];
    const cb = s.cashbook ?? [];
    let breaks = 0, maxIn = 0;
    cb.forEach((e, i) => {
      if (e.amount > 0) { catIncome[e.cat] = (catIncome[e.cat] ?? 0) + e.amount; maxIn = Math.max(maxIn, e.amount); }
      if (i > 0 && e.cat !== "관리자 조정" && Math.abs(cb[i - 1].balance + e.amount - e.balance) > 1) breaks++;
    });
    for (const p of s.players ?? []) {
      for (const k of STAT_KEYS) { const v = p.stats?.[k]; if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 1000) why.push(`능력치 범위 밖(${p.name}/${k}=${v})`); }
      if (typeof p.cond === "number" && (p.cond < 1 || p.cond > 100)) why.push(`컨디션 범위 밖(${p.name}=${p.cond})`);
    }
    if (money < 0 && !s.gameOver) why.push(`자금이 음수인데 게임 계속 (${money})`);
    if (Math.abs(money) > 1e9) why.push(`자금이 비정상적으로 큼 (${money})`);
    if (breaks) why.push(`가계부 불연속 ${breaks}건 (관리자 수정 외에 돈이 기록 없이 바뀜)`);
    if (maxIn >= BIG_INCOME) why.push(`한 번에 들어온 수입 ${maxIn.toLocaleString()}만원`);
    if (seasons >= 8 && seasons / days > 30) why.push(`진행 속도 비정상 (하루 ${Math.round(seasons / days)}시즌, ${seasons}시즌)`);
    const games = mine.reduce((a, p) => a + p.wins + p.losses, 0), wins = mine.reduce((a, p) => a + p.wins, 0);
    if (games >= 60 && wins / games > 0.92) why.push(`승률 ${Math.round((wins / games) * 100)}% (${games}경기)`);
    const bigInv = Object.entries(s.inventory ?? {}).filter(([, n]) => n > 999);
    if (bigInv.length) why.push(`보유 한도 초과 아이템 ${bigInv.map(([k, n]) => `${k}×${n}`).join(", ")}`);
    if (mine.length > 19) why.push(`선수단 ${mine.length}명 (최대 19)`);
    if (why.length) flags.push({ userId, name, role, season: seasons, why: [...new Set(why)].slice(0, 6) });
  }
  const normal = per.filter(r => r.role !== "admin");
  const bySeasons = ([[1, 2], [3, 4], [5, 8], [9, 15], [16, 9999]] as const).map(([lo, hi]) => {
    const g = normal.filter(r => r.season >= lo && r.season <= hi);
    return { label: hi === 9999 ? `${lo}시즌~` : `${lo}~${hi}시즌`, n: g.length, money: pct(g.map(r => r.money), 0.5), avg: Math.round(pct(g.map(r => r.myAvg), 0.5)), sss: pct(g.map(r => r.worldSSS), 0.5) };
  }).filter(x => x.n);
  return {
    total: rows.length,
    admins: rows.filter(r => r.role === "admin").length,
    money: distOf(normal.map(r => r.money)),
    seasons: distOf(normal.map(r => r.season)),
    myAvg: distOf(normal.map(r => r.myAvg)),
    worldSSS: distOf(normal.map(r => r.worldSSS)),
    sssUsers: normal.filter(r => r.mySSS >= 1).length,
    bySeasons,
    incomeTop: Object.entries(catIncome).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, amount]) => ({ cat, amount })),
    flags: flags.sort((a, b) => b.why.length - a.why.length).slice(0, 60),
    topMoney: [...normal].sort((a, b) => b.money - a.money).slice(0, 8).map(r => ({ userId: r.userId, name: r.name, money: r.money, season: r.season, difficulty: r.difficulty })),
  };
}
export type CareerAnalysis = ReturnType<typeof analyzeCareers>;
