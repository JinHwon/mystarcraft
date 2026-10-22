#!/usr/bin/env node
/**
 * 운영 DB 선수 키우기 세이브(rookie_careers) 분석: 성장 속도·성장 경로(경기/포션/레벨업/각성/과외)·의심 계정
 *
 * 입력(표준입력, 한 줄에 한 세이브, 탭으로 구분):
 *   userId \t role \t createdAt \t updatedAt \t state(JSON)
 * 출력: 집계와 계정별 이력 (숫자 userId 만 — 공개 로그에 계정 이름은 남기지 않음)
 *
 * 사용: mysql ... -e "SELECT r.userId,u.role,r.createdAt,r.updatedAt,r.state FROM rookie_careers r JOIN users u ON u.id=r.userId" | node tools/analyze-rookies.mjs
 */
import { createInterface } from "node:readline";

const CAP = { amateur: 4800, semipro: 5300, pro2: 6300, pro1: 7600 };
const capOf = s => (s.status === "pro" ? (s.team?.squad === 1 ? CAP.pro1 : CAP.pro2) : CAP[s.status] ?? CAP.amateur) + ((s.level ?? 1) - 1) * 40;
const totalOf = st => Object.values(st ?? {}).reduce((a, b) => a + b, 0);
const START = Date.UTC(2026, 0, 1);
const dateOf = d => new Date(START + d * 86_400_000).toISOString().slice(0, 10);

const rows = [];
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const [userId, role, createdAt, updatedAt, ...rest] = line.split("\t");
  try { rows.push({ userId: +userId, role, createdAt, updatedAt, s: JSON.parse(rest.join("\t")) }); } catch { console.log(`#${userId} 세이브를 읽지 못함`); }
}
console.log(`세이브 ${rows.length}개\n`);

/** 로그 한 줄의 능력치 변화 합 (예: "붉은 포션: attack +12" · "레벨 업! … 공격력 +3, 수비력 +4") */
const sumDelta = text => [...text.matchAll(/([+-]\d+)(?!\d*만)/g)].reduce((a, m) => a + Number(m[1]), 0);

const out = [];
for (const { userId, role, createdAt, updatedAt, s } of rows) {
  const total = totalOf(s.stats), start = totalOf(s.startStats), cap = capOf(s);
  const realH = (new Date(updatedAt.replace(" ", "T") + "Z") - new Date(createdAt.replace(" ", "T") + "Z")) / 3_600_000;
  const log = s.log ?? [];
  const potions = log.filter(e => e.icon === "🧪");
  const potionGain = potions.reduce((a, e) => a + sumDelta(e.text.split(":").slice(1).join(":")), 0);
  const buys = log.filter(e => e.icon === "🛒");
  const buyCost = buys.reduce((a, e) => a + Number(e.text.match(/-(\d+)만원/)?.[1] ?? 0), 0);
  const lvUps = log.filter(e => e.icon === "⭐" && e.text.startsWith("레벨 업"));
  const awakes = log.filter(e => e.icon === "🦅" && e.text.includes("각성"));
  const mentor = log.filter(e => e.icon === "📚");
  // 능력치 곡선: 처음으로 4000·4500·한계-100 을 넘긴 게임 날짜
  const hist = s.history ?? [];
  const firstOver = v => hist.find(h => h[1] >= v)?.[0];
  // 하루에 크게 뛴 날 (경기만으로는 보통 하루 +40 이하)
  const jumps = [];
  for (let i = 1; i < hist.length; i++) { const d = hist[i][1] - hist[i - 1][1]; if (d >= 80) jumps.push(`${dateOf(hist[i][0])} +${d}`); }
  const maxOne = Math.max(...Object.values(s.stats ?? {}));
  const flags = [];
  if (total > cap) flags.push(`한계 초과 ${total}>${cap}`);
  if (maxOne > 1000) flags.push(`능력치 하나가 ${maxOne}`);
  if (potions.length >= 20) flags.push(`포션 ${potions.length}회(로그 기준)`);
  if (jumps.length >= 3) flags.push(`하루 +80 이상 급등 ${jumps.length}번`);
  if (s.day > 0 && realH > 0 && s.day / realH > 150) flags.push(`실제 1시간에 게임 ${Math.round(s.day / realH)}일`);
  if ((s.money ?? 0) > 20000) flags.push(`돈 ${s.money}만원`);
  out.push({ userId, role, realH, s, total, start, cap, potions, potionGain, buys, buyCost, lvUps, awakes, mentor, firstOver, jumps, flags });
}

// ── 집계 ──
const pct = (a, q) => { const x = [...a].sort((p, r) => p - r); return x.length ? x[Math.min(x.length - 1, Math.floor(q * x.length))] : 0; };
const dist = (name, a) => console.log(`${name.padEnd(22)} 최소 ${pct(a, 0)}  중앙 ${pct(a, 0.5)}  90% ${pct(a, 0.9)}  최대 ${pct(a, 1)}`);
dist("게임 진행 일수", out.map(o => o.s.day));
dist("실제 플레이 시간(h)", out.map(o => Math.round(o.realH * 10) / 10));
dist("능력치 합", out.map(o => o.total));
dist("한계 대비 %", out.map(o => Math.round((o.total / o.cap) * 100)));
dist("레벨", out.map(o => o.s.level ?? 1));
dist("포션 사용(로그)", out.map(o => o.potions.length));
const by = {}; for (const o of out) by[o.s.status] = (by[o.s.status] ?? 0) + 1;
console.log("신분", JSON.stringify(by));
console.log(`한계 95% 이상: ${out.filter(o => o.total >= o.cap * 0.95).length}명\n`);

// ── 계정별 (능력치 높은 순) ──
for (const o of out.sort((a, b) => b.total / b.cap - a.total / a.cap)) {
  const s = o.s;
  console.log(`#${o.userId}${o.role === "admin" ? " (관리자)" : ""} · ${s.status}${s.team ? ` 팀${s.team.team} ${s.team.squad}군` : ""} · 게임 ${s.day}일(${dateOf(s.day)}) · 실제 ${o.realH.toFixed(1)}시간 · Lv${s.level ?? 1}`);
  console.log(`   능력치 ${o.start} → ${o.total} (한계 ${o.cap}, ${Math.round((o.total / o.cap) * 100)}%) · 전적 ${s.record?.w}승 ${s.record?.l}패 · 래더 최고 ${s.ladder?.best} · 돈 ${s.money}만`);
  console.log(`   4000 돌파 ${o.firstOver(4000) ?? "-"}일 · 4500 돌파 ${o.firstOver(4500) ?? "-"}일 · 한계-100 도달 ${o.firstOver(o.cap - 100) ?? "-"}일`);
  console.log(`   로그(최근 ${s.log?.length ?? 0}줄): 포션 ${o.potions.length}회(합 ${o.potionGain >= 0 ? "+" : ""}${o.potionGain}) · 구입 ${o.buys.length}회 ${o.buyCost}만 · 레벨업 ${o.lvUps.length} · 각성 ${o.awakes.length}(누적 ${s.counts?.awakenings ?? 0}) · 과외 ${o.mentor.length}(누적 ${s.counts?.mentors ?? 0})`);
  const inv = Object.entries(s.inventory ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(" ");
  if (inv) console.log(`   보유: ${inv}`);
  if (o.jumps.length) console.log(`   급등: ${o.jumps.slice(0, 8).join(", ")}${o.jumps.length > 8 ? " …" : ""}`);
  if ((s.titles ?? []).length) console.log(`   칭호: ${s.titles.slice(0, 4).join(" / ")}`);
  if (o.flags.length) console.log(`   ⚠️ ${o.flags.join(" · ")}`);
}
