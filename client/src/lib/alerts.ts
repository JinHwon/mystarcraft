/**
 * 감독에게 알릴 일 (영입 제안·감독 제의·자금 위기·이적 희망 등) — 상단 알림과 감독실이 함께 씀
 * key 는 내용이 바뀌면 달라져서 새 알림으로 잡힌다 (제안이 새로 오면 다시 알림)
 */
import { BENCH_DECAY_WEEKS, difficultyOf, isWinnersSeason, type CareerState } from "@shared/career/rules";
import { activeSponsors, maxSponsors } from "@shared/career/sponsor";
import { rosterOf } from "@shared/career/view";

export interface CareerAlert {
  key: string;
  icon: string;
  text: string;
  /** 눌렀을 때 갈 화면 */
  to: string;
  /** 중요 (자금 위기·제안 등): 새로 생기면 어느 화면에서든 팝업 */
  urgent?: boolean;
}

export function careerAlerts(s: CareerState): CareerAlert[] {
  const out: CareerAlert[] = [];
  const me = s.teams[s.myTeam];
  if (!me || s.gameOver) return out;
  if ((s.debtWeeks ?? 0) > 0 || me.money < 0) {
    out.push({ key: `debt-${s.season}-${s.week}`, icon: "⚠️", text: `운영 자금 적자 ${s.debtWeeks ?? 0}주째 — ${difficultyOf(s).debtWeeks}주 연속이면 구단 해체`, to: "/finance", urgent: true });
  }
  if (s.weekHold?.msl) out.push({ key: `msl-${s.season}-${s.week}`, icon: "🎮", text: "이번 주 개인리그 경기 전 — 컨디션·아이템을 챙기고 진행하세요", to: "/league", urgent: true });
  else if (s.weekHold) out.push({ key: `nom-${s.season}`, icon: "🎤", text: "마이스타리그 조 지명식 — 우리 선수가 지명할 차례입니다", to: "/league", urgent: true });
  for (const g of s.gifts ?? []) out.push({ key: `gift-${g.id}`, icon: "🎁", text: `${g.from}에서 후원이 도착했습니다 — 받기를 눌러 주세요`, to: "/club?tab=sponsor" });
  for (const o of s.offers ?? []) {
    const p = s.players[o.player];
    out.push({ key: `offer-${o.id}-${o.fee}`, icon: o.byPlayer ? "🙋" : "📨", text: o.byPlayer ? `${p?.name} 선수가 ${s.teams[o.team]?.name} 이적을 원합니다 (${o.fee.toLocaleString()}만원)` : `${s.teams[o.team]?.name}: ${p?.name} 선수 영입 제안 ${o.fee.toLocaleString()}만원`, to: "/club?tab=offers", urgent: true });
  }
  // 보낸 영입·트레이드·스카웃 요청에 온 답장 (거절 포함): 구단 운영 > 제안에서 처리
  for (const r of s.outbox ?? []) {
    if (!r.reply || r.reply.season !== s.season || r.reply.week !== s.week) continue;
    const who = r.kind === "trade" ? `${s.teams[r.team]?.name} 트레이드` : r.kind === "scout" ? `무소속 ${s.players[r.player!]?.name}` : `${s.teams[r.team]?.name} ${s.players[r.player!]?.name} 영입`;
    out.push({ key: `reply-${r.id}`, icon: r.reply.ok ? "📬" : r.reply.result === "countered" ? "🤝" : "📪", text: `${who} 답장: ${r.reply.message}`, to: "/club?tab=offers", urgent: true });
  }
  if (s.raiseRequest && s.players[s.raiseRequest.player]?.team === s.myTeam) {
    const r = s.raiseRequest, p = s.players[r.player];
    out.push({ key: `raise-${r.season}-${r.week}-${r.player}`, icon: "💼", text: `${p.name} 선수 연봉 인상 요구: ${(p.contract?.salary ?? 0).toLocaleString()}만 → ${r.salary.toLocaleString()}만원`, to: "/club?tab=offers", urgent: true });
  }
  for (const r of s.joinRequests ?? []) {
    const p = s.players[r.player];
    if (p && p.team !== s.myTeam) out.push({ key: `join-${r.id}`, icon: "🙋", text: `${s.teams[p.team]?.name} ${p.name} 선수 입단 요청 (이적료 ${r.fee.toLocaleString()}만원)`, to: "/club?tab=offers", urgent: true });
  }
  for (const o of s.jobOffers ?? []) {
    out.push({ key: `job-${s.season}-${o.team}`, icon: "🤵", text: `${s.teams[o.team]?.name}에서 감독 제의 (계약금 ${o.fee.toLocaleString()}만원)`, to: "/club?tab=manager", urgent: true });
  }
  // 프로리그 결장: 1주째면 경고, 2주 이상이면 실전 감각 저하 중 (능력치 하락)
  if (s.phase === "regular" && !isWinnersSeason(s.season)) {
    const roster = rosterOf(s, s.myTeam);
    const decaying = roster.filter(p => (p.benchWeeks ?? 0) >= BENCH_DECAY_WEEKS);
    const warn = roster.filter(p => (p.benchWeeks ?? 0) === BENCH_DECAY_WEEKS - 1);
    if (decaying.length) out.push({ key: `bench-${s.season}-${s.week}-${decaying.map(p => p.id).join(",")}`, icon: "📉", text: `실전 감각 저하 중 (프로리그 ${BENCH_DECAY_WEEKS}주 이상 결장 · 능력치 하락): ${decaying.map(p => `${p.name}(${p.benchWeeks}주)`).join(", ")}`, to: "/team", urgent: true });
    if (warn.length) out.push({ key: `benchwarn-${s.season}-${s.week}-${warn.map(p => p.id).join(",")}`, icon: "⏳", text: `이번 주도 프로리그에 못 나가면 실전 감각이 떨어집니다: ${warn.map(p => p.name).join(", ")}`, to: "/league" });
  }
  const wantOut = rosterOf(s, s.myTeam).filter(p => p.wantsOut);
  if (wantOut.length) out.push({ key: `out-${wantOut.map(p => p.id).join(",")}`, icon: "😤", text: `이적 희망: ${wantOut.map(p => p.name).join(", ")}`, to: "/team", urgent: true });
  const expiring = s.players.filter(p => p.team === s.myTeam && (p.contract?.years ?? 9) <= 1);
  if (s.phase === "offseason" && expiring.length) {
    out.push({ key: `exp-${s.season}-${expiring.length}`, icon: "📄", text: `계약 만료 예정 (재계약 안 하면 떠남): ${expiring.map(p => p.name).join(", ")}`, to: "/club?tab=contracts", urgent: true });
  }
  if (activeSponsors(s).length < maxSponsors(s) && s.phase !== "offseason") {
    const n = activeSponsors(s).length;
    out.push({ key: `sponsor-${s.season}-${n}`, icon: "🤝", text: n ? `서브 스폰서를 ${maxSponsors(s) - n}곳 더 계약할 수 있습니다` : "이번 시즌 서브 스폰서를 아직 정하지 않았습니다 (후원금 없음)", to: "/club?tab=sponsor" });
  }
  if (s.phase !== "offseason" && s.week === 1 && !s.matches.some(m => m.done && (m.a === s.myTeam || m.b === s.myTeam))) {
    out.push({ key: `main-${s.season}`, icon: "🏢", text: "첫 경기 전: 메인 스폰서와 승리·패배·우승 수당을 재협상할 수 있습니다", to: "/club?tab=sponsor" });
  }
  if (s.live) out.push({ key: `live-${s.live.matchId}`, icon: "⚔️", text: "진행 중인 우리 경기가 있습니다", to: "/league" });
  return out;
}
