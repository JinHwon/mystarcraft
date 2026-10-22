/**
 * 선수 키우기: 프로 구단 생활 (입단·2군/1군·프로리그·팀 내 입지·이적·연봉 협상·멘토)
 */
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { RACES, SEMIPRO_DAYS, capOf, dateText, isMonthEnd, nickname, statsAround, sumStats, ymd, MENTOR_PRICE, dayOf, withTag, type Opp, type RookieState, type Stats } from "@shared/rookie/model";
import { clanProIds } from "@shared/rookie/pros";
import { notify, sendMail } from "./inbox";
import { AGENTS, CLAUSES, LOAN_DAYS, PROMISE_BONUS, PROMISE_MIN, ROLES, TALK_COOLDOWN, agentOf, roleOf, type Clause, type Role } from "@shared/rookie/squad";
import { formAvg } from "@shared/rookie/persona";
import { PROS, PRO_TEAMS, RookieError, clampCond, clampStat, fan, gainExp, log, mark, pick, playOne, proOpp, prosOf, rand, randInt, randomMap, revealTrait, rivalOpp, series, useSlots, withCond, injured } from "./logic";

// ── 프로 구단 ─────────────────────────────────────────────────
/** 팀 동료 (1군은 원작 선수, 2군은 연습생) */
function teammate(s: RookieState): Opp {
  const t = s.team!;
  if (s.rival.team === t.team && rand() < 0.15) return rivalOpp(s);
  if (rand() < 0.6) return proOpp(pick(prosOf(t.team)).id);
  return withCond({ name: withTag(nickname(), ORIG_TEAMS[t.team].short), real: "연습생", race: pick(RACES), stats: statsAround(randInt(5200, 6300)) });
}
/** 팀 내부 연습 경기 (월말 승강전 순위에 들어감) */
export function playInternal(s: RookieState) {
  if (s.status !== "pro" || !s.team) throw new RookieError("구단에 입단해야 합니다");
  useSlots(s, 1);
  const opp = teammate(s);
  const g = playOne(s, opp, randomMap(), "팀 내부 연습");
  s.team[g.winner === "a" ? "monthW" : "monthL"]++;
  trustFromRating(s, g.rating, false);
  gainExp(s, g.winner === "a" ? 10 : 3);
  mark(s, "🏢", g.winner === "a");
  log(s, g.winner === "a" ? "🏢" : "💧", `내부 연습 vs ${opp.name} ${g.winner === "a" ? "승리" : "패배"}`);
  return g;
}

/** 1군 꼴찌 (능력치 기준) */
const weakestFirst = (team: number) => [...prosOf(team)].sort((a, b) => sumStats(a.stats) - sumStats(b.stats))[0];

/** 월말 팀 내 승강전 (2군 1위 vs 1군 꼴찌) */
export function playPromo(s: RookieState) {
  if (!s.team || !isMonthEnd(s.day)) throw new RookieError("승강전은 달마다 마지막 날입니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("이미 치렀습니다");
  const t = s.team;
  if (t.loan) throw new RookieError("임대 중에는 팀 내 승강전이 없습니다");
  if (t.squad === 2 && !(t.monthW >= 3 && t.monthW > t.monthL)) throw new RookieError("이번 달 내부 연습에서 2군 1위를 해야 승강전에 나갈 수 있습니다 (3승 이상, 승이 패보다 많게)");
  useSlots(s, 3);
  s.doneDays.push(s.day);
  const opp = t.squad === 2 ? proOpp(weakestFirst(t.team).id) : withCond({ name: withTag(nickname(), ORIG_TEAMS[t.team].short), real: "2군 1위", race: pick(RACES), stats: statsAround(randInt(5700, 6500)) } as Opp);
  const res = series(s, opp, 2, `${ORIG_TEAMS[t.team].short} 승강전`);
  for (const g of res.games) mark(s, "⬆️", g.winner === "a");
  addTrust(s, res.won ? 6 : -4);
  if (t.squad === 2 && res.won) { gainExp(s, 250); t.squad = 1; t.salary = Math.max(t.salary, 120); s.fame += 30; log(s, "⬆️", `승강전 승리! 1군으로 올라갔습니다 (월급 ${t.salary}만원)`); fan(s, "promoUp", ORIG_TEAMS[t.team].short); }
  else if (t.squad === 1 && !res.won) { t.squad = 2; t.salary = Math.min(t.salary, 60); log(s, "⬇️", `승강전 패배… 2군으로 내려갔습니다 (월급 ${t.salary}만원)`); fan(s, "promoDown"); }
  else log(s, t.squad === 1 ? "🛡️" : "💧", t.squad === 1 ? "승강전에서 1군 자리를 지켰습니다" : "승강전 패배, 2군에 남습니다");
  return { games: res.games, won: res.won, squad: t.squad };
}

/** 프로리그 경기일 (3~6월, 9~12월 토·일) */
export function proleagueDay(day: number) {
  const x = ymd(day);
  return [3, 4, 5, 6, 9, 10, 11, 12].includes(x.m) && (x.dow === 0 || x.dow === 6);
}
/** 1군이면 오늘 프로리그 엔트리에 드는지 (능력치·컨디션 순위 + 운) */
export function inEntry(s: RookieState) {
  if (!s.team || s.team.squad !== 1 || !proleagueDay(s.day)) return false;
  // 역할(신뢰도·팀 내 순위)에 따른 출전 확률 + 출전 보장 조항·면담 약속, 컨디션이 바닥이면 빠짐
  let p = ROLES[myRole(s)!].entry;
  if (s.team.clause?.kind === "promise" || (s.team.promiseUntil ?? -1) >= s.day) p += PROMISE_BONUS;
  if (s.cond < 35) p -= 0.25;
  // 부상 중이면 감독이 빼 줌
  if (injured(s)) return false;
  // 같은 날 다시 물어도 같은 답 (날짜로 고정)
  const luck = ((s.day * 9301 + 49297) % 233280) / 233280;
  return luck < p;
}

// ── 팀 내 입지 (FM 3단계) ─────────────────────────────────────────
/** 코치 신뢰도 (0~100, 처음 50) */
export const trustOf = (s: RookieState) => s.team?.trust ?? 50;
/** 신뢰도 올리기·내리기 */
export function addTrust(s: RookieState, n: number) {
  if (!s.team) return;
  s.team.trust = Math.max(0, Math.min(100, Math.round(trustOf(s) + n)));
}
/** 1군 동료 중 나보다 확실히(5% 넘게) 강한 선수 수 */
export function squadRank(s: RookieState) {
  if (!s.team) return 0;
  const mine = sumStats(s.stats);
  return prosOf(s.team.team).filter(p => sumStats(p.stats) * 0.95 > mine).length;
}
/** 1군에서의 역할 (2군·무소속이면 null) */
export function myRole(s: RookieState): Role | null {
  if (!s.team || s.team.squad !== 1) return null;
  return roleOf(squadRank(s), trustOf(s));
}
/** 경기 평점으로 신뢰도 (프로리그는 크게, 내부 연습은 작게) */
function trustFromRating(s: RookieState, rating: number | undefined, big: boolean) {
  if (rating === undefined || !s.team) return;
  const k = big ? 1 : 0.5;
  addTrust(s, (rating >= 8 ? 5 : rating >= 7.2 ? 3 : rating >= 6.3 ? 0 : rating >= 5.5 ? -2 : -4) * k);
}

/** 감독 면담: 출전 기회 요구 (2주에 한 번). 신뢰·폼이 좋으면 한 달 출전 약속, 아니면 신뢰·사기 하락 */
export function askPlayTime(s: RookieState) {
  const t = s.team;
  if (!t) throw new RookieError("구단 소속이 아닙니다");
  if (t.loan) throw new RookieError("임대 중에는 원 소속 감독과 면담할 수 없습니다");
  const last = s.flags?.talk ?? -999;
  if (s.day - last < TALK_COOLDOWN) throw new RookieError(`면담은 ${TALK_COOLDOWN}일에 한 번 할 수 있습니다 (${last + TALK_COOLDOWN - s.day}일 뒤)`);
  (s.flags ??= {}).talk = s.day;
  const role = myRole(s);
  const coach = `${ORIG_TEAMS[t.team].short} 감독`;
  if (role === "ace" || role === "starter") {
    s.morale = Math.min(100, s.morale + 2);
    log(s, "🗣️", `${coach}: "넌 이미 우리 팀 ${ROLES[role].name}이야. 지금처럼만 해." 사기 +2`);
    return { result: "already" as const, role };
  }
  const form = formAvg(s.recent) ?? 6.5;
  const chance = Math.max(0.05, Math.min(0.9, trustOf(s) / 100 + (form - 6.8) * 0.25 + (t.squad === 2 ? -0.15 : 0)));
  if (rand() < chance) {
    t.promiseUntil = s.day + 30;
    s.morale = Math.min(100, s.morale + 5);
    addTrust(s, 2);
    const what = t.squad === 1 ? "앞으로 한 달 동안 프로리그에 더 자주 내보내 주겠다" : "이번 달 승강전에서 좋은 모습을 보이면 1군으로 올려 주겠다";
    log(s, "🗣️", `${coach}: "그래, ${what}." (사기 +5)`);
    sendMail(s, { from: "coach", sender: coach, title: "면담 결과: 출전 약속", body: `면담에서 감독님이 약속했습니다: "${what}." (${dateText(t.promiseUntil).slice(5)}까지)` });
    return { result: "promised" as const };
  }
  addTrust(s, -5);
  const amb = s.persona?.amb ?? 10;
  const drop = amb >= 14 ? 6 : 3;
  s.morale = Math.max(0, s.morale - drop);
  log(s, "🗣️", `${coach}: "아직은 아니다. 연습에서 먼저 보여줘." 신뢰도 -5, 사기 -${drop}${amb >= 14 ? " (야망이 커서 실망이 큽니다)" : ""}`);
  return { result: "denied" as const };
}

/** 임대 요청 (2군, 입단 30일 뒤): 다른 구단 1군에서 두 달 동안 뛰고 돌아옴. 임대 평점이 좋으면 1군으로 복귀 */
export function requestLoan(s: RookieState) {
  const t = s.team;
  if (!t) throw new RookieError("구단 소속이 아닙니다");
  if (t.loan) throw new RookieError("이미 임대 중입니다");
  if (t.squad !== 2) throw new RookieError("임대는 2군 선수만 요청할 수 있습니다");
  if (s.day - t.joined < 30) throw new RookieError("입단하고 30일이 지나야 임대를 요청할 수 있습니다");
  const last = s.flags?.loanTry ?? -999;
  if (s.day - last < 14) throw new RookieError(`임대 요청은 2주에 한 번 할 수 있습니다 (${last + 14 - s.day}일 뒤)`);
  (s.flags ??= {}).loanTry = s.day;
  const form = formAvg(s.recent) ?? 6.5;
  if (rand() < Math.min(0.85, 0.45 + (form - 6.8) * 0.2 + s.fame / 3000)) {
    const to = pick(PRO_TEAMS.filter(x => x.id !== t.team));
    const from = t.team;
    t.loan = { from, until: s.day + LOAN_DAYS, sum: 0, n: 0 };
    t.team = to.id; t.squad = 1; t.trust = 55;
    log(s, "🔁", `${to.name}(으)로 ${LOAN_DAYS}일 임대를 떠납니다! 1군에서 뛰며 평점을 쌓으세요 (평균 7.0 이상이면 원 소속 1군으로 복귀)`);
    sendMail(s, { from: "agent", sender: `${ORIG_TEAMS[from].short} 사무국`, title: `${to.name} 임대 확정`, body: `${dateText(t.loan.until)}까지 ${to.name}에서 뜁니다. 월급은 원 소속 구단이 그대로 줍니다. 임대 기간 평균 평점 7.0 이상이면 돌아와서 1군에 합류합니다.` });
    mark(s, "🔁");
    return { result: "loaned" as const, team: to.id };
  }
  s.morale = Math.max(0, s.morale - 2);
  log(s, "🔁", "임대를 원하는 구단이 없었습니다 (사기 -2 · 2주 뒤 다시)");
  return { result: "none" as const };
}
/** 임대 복귀 (nextDay) */
export function loanReturn(s: RookieState) {
  const t = s.team!, l = t.loan!;
  const avg = l.n ? l.sum / l.n : 0;
  const from = l.from, was = ORIG_TEAMS[t.team].name;
  delete t.loan;
  t.team = from;
  const good = l.n >= 3 && avg >= 7;
  t.squad = good ? 1 : 2;
  t.trust = good ? 62 : 48;
  if (good) t.salary = Math.max(t.salary, 120);
  const text = l.n ? `임대 ${l.n}경기 평균 평점 ${avg.toFixed(2)}` : "임대 기간에 출전하지 못했습니다";
  log(s, "🔁", `${was} 임대를 마치고 돌아왔습니다. ${text} → ${good ? "1군 합류!" : "2군에서 다시 시작"}`);
  sendMail(s, { from: "coach", sender: `${ORIG_TEAMS[from].short} 감독`, title: "임대 복귀", body: `${text}. ${good ? "잘했다. 이제 1군에서 보자." : "아직 부족하다. 2군에서 더 다듬자."}` });
}

/** 에이전트 고용 (인지도 조건 · 계약금). 연봉 협상 한도·영입 제안이 늘고, 월급날마다 수수료 */
export function hireAgent(s: RookieState, tier: 1 | 2 | 3) {
  const a = AGENTS[tier - 1];
  if (!a) throw new RookieError("에이전트를 고르세요");
  if (s.agent?.tier === tier) throw new RookieError("이미 고용한 에이전트입니다");
  if (s.fame < a.fame) throw new RookieError(`${a.name}은(는) 인지도 ${a.fame} 이상인 선수만 맡습니다`);
  if (s.money < a.hire) throw new RookieError(`계약금 ${a.hire}만원이 필요합니다`);
  s.money -= a.hire;
  s.agent = { tier, since: s.day };
  log(s, "💼", `${a.name}과(와) 계약했습니다 (계약금 ${a.hire}만원 · ${a.desc})`);
  sendMail(s, { from: "agent", sender: a.name, title: "잘 부탁드립니다", body: "앞으로 연봉 협상과 이적 제안은 제가 챙기겠습니다. 좋은 소식 있으면 바로 연락드리죠." });
  return { tier };
}
export function fireAgent(s: RookieState) {
  const a = agentOf(s);
  if (!a) throw new RookieError("고용한 에이전트가 없습니다");
  delete s.agent;
  log(s, "💼", `${a.name}과(와) 계약을 끝냈습니다`);
  return { ok: true };
}

/** 매달 1일: 에이전트 수수료 · 출전 보장 약속 점검 · 감독 월간 평가 메일 */
export function monthlySquad(s: RookieState, prevMonth: number) {
  const t = s.team;
  const a = agentOf(s);
  if (a && t) {
    const fee = Math.round(t.salary * a.fee);
    if (fee > 0) { s.money = Math.max(0, s.money - fee); log(s, "💼", `에이전트 수수료 ${fee}만원 (${a.name})`); }
  }
  if (!t) return;
  const plMonth = [3, 4, 5, 6, 9, 10, 11, 12].includes(prevMonth);
  if (t.clause?.kind === "promise" && t.squad === 1 && plMonth && (t.monthPro ?? 0) < PROMISE_MIN) {
    s.morale = Math.max(0, s.morale - 6);
    (s.flags ??= {}).freeTransfer = s.day + 30;
    sendMail(s, { from: "agent", sender: a?.name ?? "선수협", title: "출전 보장 약속 위반", body: `지난달 프로리그 출전이 ${t.monthPro ?? 0}경기뿐이었습니다. 계약의 출전 보장 조항 위반이라 앞으로 30일 동안은 구단에 들킬 걱정 없이 이적을 알아볼 수 있습니다.` });
    log(s, "⚠️", "출전 보장 약속이 지켜지지 않았습니다 (사기 -6 · 30일 동안 자유롭게 이적 요청)");
  }
  // 감독 월간 평가
  const role = myRole(s);
  const form = formAvg(s.recent);
  const tr = trustOf(s);
  const mood = tr >= 75 ? "아주 만족한다" : tr >= 55 ? "괜찮게 보고 있다" : tr >= 35 ? "좀 더 보여줘야 한다" : "실망스럽다";
  sendMail(s, {
    from: "coach", sender: `${ORIG_TEAMS[t.team].short} 감독`, title: "월간 평가",
    body: `${t.squad}군 · ${role ? `역할: ${ROLES[role].icon} ${ROLES[role].name}` : "2군 유망주"} · 코치 신뢰도 ${tr}\n최근 폼 ${form !== null ? form.toFixed(1) : "-"} · 지난달 프로리그 ${t.monthPro ?? 0}경기\n\n"${mood}."`,
  });
  t.monthPro = 0;
}
/** auto: 다음 날로 넘길 때 안 치른 경기를 자동으로 (하루 행동 수와 상관없이) */
export function playProleague(s: RookieState, auto = false) {
  if (!inEntry(s)) throw new RookieError("오늘은 프로리그 엔트리에 들지 못했습니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("오늘 경기는 이미 치렀습니다");
  if (!auto) useSlots(s, 2);
  s.doneDays.push(s.day);
  const others = PRO_TEAMS.filter(t => t.id !== s.team!.team);
  const vsTeam = others[s.day % others.length];
  const rivalHere = s.rival.team === vsTeam.id && s.rival.squad === 1 && rand() < 0.4;
  const opp = rivalHere ? rivalOpp(s) : proOpp(pick(prosOf(vsTeam.id)).id);
  const g = playOne(s, opp, randomMap(), `프로리그 vs ${vsTeam.name}`, !auto);
  const won = g.winner === "a";
  s.team!.proW = (s.team!.proW ?? 0) + (won ? 1 : 0);
  s.team!.proL = (s.team!.proL ?? 0) + (won ? 0 : 1);
  s.team!.seasonW = (s.team!.seasonW ?? 0) + (won ? 1 : 0);
  s.team!.seasonL = (s.team!.seasonL ?? 0) + (won ? 0 : 1);
  gainExp(s, won ? 40 : 10);
  if (won) { s.money += 30; s.fame += 10; g.fx.money = 30; s.counts.proW++; }
  // 계약 조건: 승리 수당
  const bonus = won ? s.team!.clause?.winBonus ?? 0 : 0;
  if (bonus) { s.money += bonus; g.fx.money = 30 + bonus; }
  s.team!.monthPro = (s.team!.monthPro ?? 0) + 1;
  trustFromRating(s, g.rating, true);
  if (s.team!.loan && g.rating !== undefined) { s.team!.loan.sum += g.rating; s.team!.loan.n++; }
  if (!opp.rival) fan(s, won ? "plWin" : "plLose", vsTeam.name);
  mark(s, "🏟️", won);
  log(s, "🏟️", `프로리그 vs ${vsTeam.name} ${opp.name} ${won ? "승리! (승리 수당 30만원)" : "패배"}`);
  return g;
}

/** 다른 구단에 직접 이적 요청 (구단에 들키면 벌금·사기 하락, 두 번 들키면 방출) */
export function requestTransfer(s: RookieState, team: number) {
  if (s.fa) return faRequest(s, team);
  if (!s.team) throw new RookieError("구단 소속이 아닙니다");
  if (team === s.team.team || !PRO_TEAMS.some(t => t.id === team)) throw new RookieError("이적할 구단을 고르세요");
  if (s.team.loan) throw new RookieError("임대 중에는 이적을 알아볼 수 없습니다");
  useSlots(s, 1);
  // 출전 보장 약속을 어긴 구단이면 들킬 걱정 없음, 에이전트가 있으면 덜 들킴
  const free = (s.flags?.freeTransfer ?? -1) >= s.day;
  const caught = !free && rand() < (s.agent ? 0.12 : 0.25);
  if (caught) {
    s.team.caught = (s.team.caught ?? 0) + 1;
    if (s.team.caught >= 2) {
      const from = ORIG_TEAMS[s.team.team].name;
      delete s.team;
      s.status = "semipro";
      s.semiproUntil = s.day + SEMIPRO_DAYS;
      s.morale = Math.max(0, s.morale - 25);
      log(s, "🚫", `이적 시도가 또 들켜 ${from}에서 방출되었습니다… (준프로로 돌아가 드래프트·입단 테스트를 노려야 합니다)`);
      return { result: "released" as const };
    }
    s.morale = Math.max(0, s.morale - 15);
    const fine = Math.min(s.money, 30);
    s.money -= fine;
    log(s, "⚠️", `${ORIG_TEAMS[team].name}에 이적을 알아본 게 구단에 들켰습니다! 벌금 ${fine}만원 · 사기 하락 (한 번 더 들키면 방출)`);
    return { result: "caught" as const };
  }
  const p = Math.min(0.85, Math.max(0.05, (sumStats(s.stats) - 4300) / 2000 + s.fame / 3000) * (agentOf(s)?.offers ?? 1));
  if (rand() < p) {
    // 시장 가치 기준 (지금 월급 기준이면 이적할 때마다 월급이 불어남)
    const salary = Math.round(marketValue(s) * (0.95 + rand() * 0.25 + (agentOf(s)?.nego ?? 0) / 2));
    s.offers.push({ team, salary, until: s.day + 7 });
    notify(s, "agent", `${ORIG_TEAMS[team].short} 스카우트`, `${ORIG_TEAMS[team].name} 영입 제안`, `월급 ${salary}만원으로 영입하고 싶다는 제안입니다. 일주일 안에 구단 화면에서 결정하세요.`);
    log(s, "📨", `${ORIG_TEAMS[team].name}: "좋습니다, 월급 ${salary}만원에 모시겠습니다" (일주일 안에 결정)`);
    return { result: "offer" as const, salary };
  }
  log(s, "📨", `${ORIG_TEAMS[team].name}: "지금은 영입 계획이 없습니다"`);
  return { result: "rejected" as const };
}
export function acceptOffer(s: RookieState, team: number) {
  const o = s.offers.find(x => x.team === team && x.until >= s.day);
  if (!o || (!s.team && !s.fa)) throw new RookieError("받은 이적 제안이 아닙니다");
  const from = s.team ? ORIG_TEAMS[s.team.team].name : "FA";
  s.team = { team, squad: 2, joined: s.day, salary: o.salary, monthW: 0, monthL: 0, contractUntil: contractEnd(s.day), trust: 50 };
  s.status = "pro";
  s.offers = [];
  delete s.fa;
  delete s.nego;
  s.titles.unshift(`${dateText(s.day)} ${from} → ${ORIG_TEAMS[team].name} ${from === "FA" ? "입단" : "이적"}`);
  log(s, "✈️", `${ORIG_TEAMS[team].name}(으)로 ${from === "FA" ? "입단" : "이적"}했습니다 (월급 ${o.salary}만원 · 2군부터)`);
  fan(s, "transfer", ORIG_TEAMS[team].name);
  mark(s, "✈️");
  return { ok: true };
}

// ── 연봉 협상 · FA ─────────────────────────────────────────────
/** 계약 만료일: 최소 4달은 뛰는 12/31 */
export function contractEnd(day: number) {
  const y = ymd(day).y;
  const end = dayOf(y, 12, 31);
  return end - day >= 120 ? end : dayOf(y + 1, 12, 31);
}
/** 내 몸값 (월급, 만원) */
export function marketValue(s: RookieState) {
  const total = sumStats(s.stats);
  const base = s.team?.squad === 1 ? 120 : 45;
  return Math.round(base + Math.max(0, total - 4600) / 10 + (s.team?.proW ?? 0) * 4 + s.fame / 12 + s.fanCafe.members / 60);
}
export function startNego(s: RookieState) {
  const v = marketValue(s);
  const old = s.team!.salary;
  const offer = Math.round(Math.max(old * 0.8, v * (0.82 + rand() * 0.15)));
  const ag = agentOf(s)?.nego ?? 0;
  s.nego = { offer: Math.round(offer * (1 + ag / 2)), rounds: 0, until: s.day + 7, max: Math.round(v * (1.08 + Math.min(0.15, s.fame / 4000) + ag) + rand() * 10), old };
  log(s, "💼", `계약이 끝났습니다. ${ORIG_TEAMS[s.team!.team].name}의 재계약 제시액: 월급 ${offer}만원 (지금 ${old}만원 · 일주일 안에 협상)`);
  mark(s, "💼");
}
export function signContract(s: RookieState, base: number, how: string, clause: Clause = "none") {
  const t = s.team!;
  const old = s.nego?.old ?? t.salary;
  // 계약 조건: 출전 보장(월급 -10%) · 승리 수당(월급 -5%, 1승마다 월급의 25%)
  const salary = Math.max(1, Math.round(base * CLAUSES[clause].salary));
  t.salary = salary;
  if (clause === "none") delete t.clause;
  else t.clause = { kind: clause, ...(clause === "bonus" ? { winBonus: Math.max(5, Math.round(salary * 0.25)) } : {}) };
  t.contractUntil = dayOf(ymd(s.day).y, 12, 31) >= s.day + 120 ? dayOf(ymd(s.day).y, 12, 31) : dayOf(ymd(s.day).y + 1, 12, 31);
  delete s.nego;
  if (salary > old) s.counts.raises++;
  log(s, "💼", `${how} 월급 ${old}만원 → ${salary}만원으로 재계약 (${dateText(t.contractUntil)}까지)${clause !== "none" ? ` · ${CLAUSES[clause].name}${t.clause?.winBonus ? ` (1승마다 ${t.clause.winBonus}만원)` : ""}` : ""}`);
  fan(s, "contract", String(salary));
}
/** 연봉 요구: 구단 제시액보다 높게 부르면 받아들이거나 다시 제시. 세 번 넘게 밀어붙이면 결렬 → FA */
export function negotiate(s: RookieState, ask: number, clause: Clause = "none") {
  const n = s.nego;
  if (!n || !s.team) throw new RookieError("진행 중인 연봉 협상이 없습니다");
  const a = Math.round(ask);
  if (!(a >= 1 && a <= 9999)) throw new RookieError("금액을 입력하세요");
  if (a <= n.offer) { signContract(s, a, "협상 타결!", clause); return { result: "signed" as const, salary: s.team.salary }; }
  n.rounds++;
  if (a <= n.max && rand() < 1 - ((a - n.offer) / Math.max(1, n.max - n.offer)) * 0.75) {
    signContract(s, a, "요구액을 받아냈습니다!", clause);
    return { result: "signed" as const, salary: s.team!.salary };
  }
  if (n.rounds >= 3) {
    const from = ORIG_TEAMS[s.team.team].name;
    delete s.team;
    delete s.nego;
    s.fa = { until: s.day + 30 };
    s.morale = Math.max(0, s.morale - 10);
    s.titles.unshift(`${dateText(s.day)} ${from}와 협상 결렬 (FA)`);
    log(s, "💔", `${from}와의 연봉 협상이 결렬되었습니다. FA가 되어 30일 안에 새 구단을 찾아야 합니다 (못 찾으면 준프로로)`);
    fan(s, "fa");
    mark(s, "💔");
    return { result: "fa" as const };
  }
  const counter = Math.round(n.offer + (Math.min(a, n.max) - n.offer) * (0.35 + rand() * 0.3));
  n.offer = Math.max(n.offer + 1, counter);
  log(s, "💼", `구단: "${a}만원은 어렵습니다. ${n.offer}만원까지 드리겠습니다" (협상 ${n.rounds}/3 · 더 밀어붙이면 결렬될 수도)`);
  return { result: "counter" as const, offer: n.offer };
}
export function acceptNego(s: RookieState, clause: Clause = "none") {
  if (!s.nego || !s.team) throw new RookieError("진행 중인 연봉 협상이 없습니다");
  const v = s.nego.offer;
  signContract(s, v, "구단 제시액에", clause);
  return { salary: s.team.salary };
}
/** FA: 구단에 직접 연락 (들킬 걱정 없음) */
function faRequest(s: RookieState, team: number) {
  if (!PRO_TEAMS.some(t => t.id === team)) throw new RookieError("구단을 고르세요");
  if (s.offers.some(o => o.team === team)) throw new RookieError("이미 제안을 받은 구단입니다");
  useSlots(s, 1);
  const p = Math.min(0.8, Math.max(0.1, (sumStats(s.stats) - 4300) / 1800 + s.fame / 2500));
  if (rand() < p) {
    const salary = Math.round(marketValue(s) * (0.75 + rand() * 0.3));
    s.offers.push({ team, salary, until: s.day + 7 });
    notify(s, "agent", `${ORIG_TEAMS[team].short} 스카우트`, `${ORIG_TEAMS[team].name} 영입 제안`, `월급 ${salary}만원으로 영입하고 싶다는 제안입니다. 일주일 안에 구단 화면에서 결정하세요.`);
    log(s, "📨", `${ORIG_TEAMS[team].name}: "월급 ${salary}만원에 함께하죠" (일주일 안에 결정)`);
    return { result: "offer" as const, salary };
  }
  log(s, "📨", `${ORIG_TEAMS[team].name}: "지금은 자리가 없습니다"`);
  return { result: "rejected" as const };
}

// ── 멘토 과외 ─────────────────────────────────────────────────
/** 그 능력치가 뛰어난 프로 선수들 (같은 팀이면 그 팀 선배부터) */
export function mentorsFor(s: RookieState, stat: StatKey) {
  const pool = s.team ? prosOf(s.team.team) : PROS.filter(p => p.team < 12);
  return [...pool].sort((a, b) => b.stats[stat] - a.stats[stat]).slice(0, 3).map(p => ({ id: p.id, name: p.name, team: p.team, value: p.stats[stat] }));
}
/** 같은 팀 선배 · 명문 클랜(프로 소속) 이면 싸게 */
export function mentorPrice(s: RookieState) { return s.team || (s.clan && clanProIds(s.clan.id).length > 0) ? MENTOR_PRICE.teammate : MENTOR_PRICE.outside; }
/** 프로에게 과외: 고른 능력치를 집중적으로 (하루 한 번 · 행동 3) */
export function mentor(s: RookieState, stat: StatKey, proId: number) {
  if (!STAT_KEYS.includes(stat)) throw new RookieError("배울 능력치를 고르세요");
  const m = mentorsFor(s, stat).find(x => x.id === proId);
  if (!m) throw new RookieError("과외 받을 선수를 고르세요");
  if (s.mentorDay === s.day) throw new RookieError("과외는 하루 한 번만 받을 수 있습니다");
  const price = mentorPrice(s);
  if (s.money < price) throw new RookieError(`과외비가 부족합니다 (${price}만원)`);
  useSlots(s, 3);
  s.money -= price;
  s.mentorDay = s.day;
  s.counts.mentors++;
  gainExp(s, 8);
  const me = sumStats(s.stats);
  // 한계 근처에서도 조금은 오르고, 대신 가장 높은 다른 능력치가 깎여 균형이 바뀜
  const room = Math.max(0.3, Math.min(1, (capOf(s) - me) / 700));
  const gap = Math.max(0, m.value - s.stats[stat]);
  const gain = Math.max(2, Math.round((randInt(5, 9) + gap / 60) * room));
  const before = { ...s.stats };
  s.stats[stat] = clampStat(s.stats[stat] + gain);
  let over = sumStats(s.stats) - capOf(s);
  while (over > 0) { const top = [...STAT_KEYS].filter(k => k !== stat).sort((a, b) => s.stats[b] - s.stats[a])[0]; s.stats[top]--; over--; }
  s.cond = clampCond(s.cond - 4);
  const delta: Partial<Stats> = {};
  for (const k of STAT_KEYS) if (s.stats[k] !== before[k]) delta[k] = s.stats[k] - before[k];
  log(s, "📚", `${ORIG_TEAMS[m.team].short} ${m.name} 선수에게 ${STAT_LABELS[stat]} 과외 (${STAT_LABELS[stat]} +${s.stats[stat] - before[stat]} · ${price}만원)`);
  mark(s, "📚");
  // 멘토가 내 성격 하나를 짚어 줌 (반은 확률)
  if (rand() < 0.5) revealTrait(s, `${m.name} 멘토`);
  return { mentor: m.name, delta, price };
}
