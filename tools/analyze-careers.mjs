#!/usr/bin/env node
/**
 * 운영 DB 감독 모드 세이브(careers) 분석: 돈·능력치 분포와 부정 이용 의심 계정 찾기
 *
 * 입력(표준입력, 한 줄에 한 세이브, 탭으로 구분):
 *   userId \t role \t createdAt \t updatedAt \t state(JSON)
 * 출력: 집계와 의심 계정(숫자 userId 만 — 공개 로그에 계정 이름은 남기지 않음)
 *
 * 사용: mysql ... -e "SELECT c.userId,u.role,c.createdAt,c.updatedAt,c.state FROM careers c JOIN users u ON u.id=c.userId" | node tools/analyze-careers.mjs
 */
import { createInterface } from "node:readline";

const GRADES = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+", "S-", "S", "S+", "SS", "SSS"];
const gradeIdx = total => Math.max(0, Math.min(GRADES.length - 1, Math.floor((total - 4200) / 175)));
const totalOf = stats => Object.values(stats).reduce((a, b) => a + b, 0);
const KEYS = ["attack", "defense", "harass", "control", "supply", "strategy", "scout", "sense"];

const pct = (arr, q) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};
const dist = (name, arr, fmt = v => Math.round(v).toLocaleString()) => {
  console.log(`${name.padEnd(24)} n=${String(arr.length).padStart(3)}  최소 ${fmt(pct(arr, 0))}  25% ${fmt(pct(arr, 0.25))}  중앙 ${fmt(pct(arr, 0.5))}  75% ${fmt(pct(arr, 0.75))}  90% ${fmt(pct(arr, 0.9))}  최대 ${fmt(pct(arr, 1))}`);
};

const rows = [];
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const i1 = line.indexOf("\t"), i2 = line.indexOf("\t", i1 + 1), i3 = line.indexOf("\t", i2 + 1), i4 = line.indexOf("\t", i3 + 1);
  if (i4 < 0) continue;
  try {
    rows.push({
      userId: Number(line.slice(0, i1)), role: line.slice(i1 + 1, i2),
      createdAt: new Date(line.slice(i2 + 1, i3).replace(" ", "T") + "Z").getTime(),
      updatedAt: new Date(line.slice(i3 + 1, i4).replace(" ", "T") + "Z").getTime(),
      s: JSON.parse(line.slice(i4 + 1)),
    });
  } catch (e) { console.log(`읽기 실패 userId=${line.slice(0, i1)}: ${e.message}`); }
}
console.log(`세이브 ${rows.length}개 (관리자 ${rows.filter(r => r.role === "admin").length}개 포함)\n`);

const per = [];
const flags = [];
const catIncome = {}, catExpense = {};
for (const { userId, role, createdAt, updatedAt, s } of rows) {
  const players = (s.players ?? []).filter(p => p.team >= 0 && !p.retired);
  const mine = players.filter(p => p.team === s.myTeam);
  const myTeam = s.teams?.[s.myTeam];
  const money = myTeam?.money ?? 0;
  const seasons = (s.history?.length ?? 0) + 1;
  const hours = Math.max(0.1, (updatedAt - createdAt) / 3600000);
  const totals = players.map(p => totalOf(p.stats));
  const sss = totals.filter(t => gradeIdx(t) >= 17).length;
  const ssUp = totals.filter(t => gradeIdx(t) >= 16).length;
  const sUp = totals.filter(t => gradeIdx(t) >= 14).length;
  const myTotals = mine.map(p => totalOf(p.stats));
  const myAvg = myTotals.length ? myTotals.reduce((a, b) => a + b, 0) / myTotals.length : 0;
  const mySSS = myTotals.filter(t => gradeIdx(t) >= 17).length;
  const cb = s.cashbook ?? [];
  let income = 0, expense = 0, breaks = 0, maxIn = 0;
  for (let i = 0; i < cb.length; i++) {
    const e = cb[i];
    if (e.amount >= 0) { income += e.amount; catIncome[e.cat] = (catIncome[e.cat] ?? 0) + e.amount; maxIn = Math.max(maxIn, e.amount); }
    else { expense += -e.amount; catExpense[e.cat] = (catExpense[e.cat] ?? 0) + -e.amount; }
    // 가계부 연속성: 이전 잔액 + 이번 금액 = 이번 잔액이어야 함
    if (i > 0 && Math.abs(cb[i - 1].balance + e.amount - e.balance) > 1) breaks++;
  }
  const games = mine.reduce((a, p) => a + p.wins + p.losses, 0);
  const wins = mine.reduce((a, p) => a + p.wins, 0);
  const row = {
    userId, role, difficulty: s.difficulty ?? "normal", season: s.season, week: s.week, seasons,
    money, myRoster: mine.length, myAvg, mySSS, worldSSS: sss, worldSSUp: ssUp, worldSUp: sUp, worldPlayers: players.length,
    income, expense, breaks, cbLen: cb.length, games, winRate: games ? wins / games : 0, hours, seasonsPerDay: seasons / (hours / 24),
    gameOver: !!s.gameOver, mgrLevel: s.manager?.level ?? 1,
  };
  per.push(row);

  // ── 부정 이용 의심 ──
  const why = [];
  for (const p of s.players ?? []) {
    for (const k of KEYS) {
      const v = p.stats?.[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 1000) why.push(`능력치 범위 밖(${p.name}/${k}=${v})`);
    }
    if (typeof p.cond === "number" && (p.cond < 1 || p.cond > 100)) why.push(`컨디션 범위 밖(${p.name}=${p.cond})`);
  }
  if (money < 0 && !s.gameOver) why.push(`돈이 음수인데 게임 계속(${money})`);
  if (Math.abs(money) > 1e9) why.push(`돈이 비정상적으로 큼(${money})`);
  if (breaks > 0) why.push(`가계부 불연속 ${breaks}건 (잔액이 금액과 안 맞음 — 값 조작 또는 동시 요청 충돌)`);
  if (maxIn >= 20000) why.push(`한 번에 들어온 수입 ${maxIn}만원`);
  if (row.seasonsPerDay > 60 && seasons >= 8) why.push(`진행 속도 비정상 (하루 ${row.seasonsPerDay.toFixed(0)}시즌, ${seasons}시즌)`);
  if (games >= 60 && row.winRate > 0.92) why.push(`승률 ${(row.winRate * 100).toFixed(0)}% (${games}경기)`);
  const inv = s.inventory ?? {};
  const bigInv = Object.entries(inv).filter(([, n]) => n > 500);
  if (bigInv.length) why.push(`아이템 ${bigInv.map(([k, n]) => `${k}×${n}`).join(",")}`);
  const myDup = new Set(); for (const p of mine) { if (myDup.has(p.id)) why.push("선수 중복"); myDup.add(p.id); }
  if (mine.length > 19) why.push(`선수단 ${mine.length}명 (최대 19)`);
  if (why.length) flags.push({ userId, role, season: s.season, why: [...new Set(why)].slice(0, 6) });
}

const normal = per.filter(r => r.role !== "admin");
console.log("── 진행 정도 ──");
dist("진행 시즌 수", normal.map(r => r.seasons));
dist("접속 기간(일)", normal.map(r => r.hours / 24), v => v.toFixed(1));
console.log(`난이도: ${["easy", "normal", "hard"].map(d => `${d} ${normal.filter(r => r.difficulty === d).length}명`).join(" / ")}, 구단 해체 ${normal.filter(r => r.gameOver).length}명`);

console.log("\n── 돈 (만원) ──");
dist("보유 자금", normal.map(r => r.money));
for (const [lo, hi] of [[0, 1], [1, 3], [3, 6], [6, 10]]) {
  const g = normal.filter(r => r.seasons > lo && r.seasons <= hi);
  if (g.length) dist(`시즌 ${lo + 1}~${hi}`, g.map(r => r.money));
}
const longp = normal.filter(r => r.seasons > 10);
if (longp.length) dist("시즌 11 이상", longp.map(r => r.money));
const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${Math.round(v).toLocaleString()}`).join(" · ");
console.log("가계부 수입 상위(전체 합):", top(catIncome));
console.log("가계부 지출 상위(전체 합):", top(catExpense));
const sumIn = Object.values(catIncome).reduce((a, b) => a + b, 0), sumEx = Object.values(catExpense).reduce((a, b) => a + b, 0);
console.log(`수입 합 ${Math.round(sumIn).toLocaleString()} / 지출 합 ${Math.round(sumEx).toLocaleString()} (가계부 최근 ${400}건 기준)`);

console.log("\n── 능력치 ──");
dist("우리 선수 평균 합계", normal.map(r => r.myAvg));
dist("우리 팀 SSS 선수 수", normal.map(r => r.mySSS), v => v.toFixed(0));
dist("리그 전체 SSS 선수 수", normal.map(r => r.worldSSS), v => v.toFixed(0));
dist("리그 전체 SS 이상", normal.map(r => r.worldSSUp), v => v.toFixed(0));
dist("리그 전체 S- 이상", normal.map(r => r.worldSUp), v => v.toFixed(0));
console.log(`SSS 선수가 3명 이상인 유저: ${normal.filter(r => r.worldSSS >= 3).length}/${normal.length}명, 우리 팀에 SSS가 있는 유저: ${normal.filter(r => r.mySSS >= 1).length}명`);
// 시즌별 인플레이션: 진행 시즌 대비 평균 합계
console.log("진행 시즌별 우리 선수 평균 합계 / 리그 SSS 수 (중앙값):");
for (const [lo, hi] of [[1, 2], [3, 4], [5, 8], [9, 15], [16, 999]]) {
  const g = normal.filter(r => r.seasons >= lo && r.seasons <= hi);
  if (g.length) console.log(`  시즌 ${lo}~${hi === 999 ? "" : hi} (${g.length}명): 평균 ${Math.round(pct(g.map(r => r.myAvg), 0.5))} · 리그 SSS ${pct(g.map(r => r.worldSSS), 0.5)}명 · 자금 중앙 ${Math.round(pct(g.map(r => r.money), 0.5)).toLocaleString()}`);
}

console.log(`\n── 부정 이용·오류 의심 (${flags.length}건) ──`);
for (const f of flags.sort((a, b) => b.why.length - a.why.length).slice(0, 40)) console.log(`userId ${f.userId}${f.role === "admin" ? "(관리자)" : ""} · 시즌 ${f.season}: ${f.why.join(" | ")}`);
if (!flags.length) console.log("없음");

console.log("\n── 상위 자금 10명 ──");
for (const r of [...normal].sort((a, b) => b.money - a.money).slice(0, 10)) console.log(`userId ${r.userId}: ${r.money.toLocaleString()}만원 · 시즌 ${r.seasons} · 난이도 ${r.difficulty} · 우리 평균 ${Math.round(r.myAvg)} · 리그 SSS ${r.worldSSS}`);
