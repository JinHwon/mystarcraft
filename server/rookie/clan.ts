/**
 * 선수 키우기: 클랜 (입단 시험·연습·피드백·하루 활동) · 클랜전 (일정·엔트리·관전·직책)
 */
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { mapView } from "@shared/career/view";
import { WAR_SETS, clanRelations, type ClanWar, capOf, dateText, draftDay, isMonthEnd, sumStats, ymd, CLANS, CLAN_BY_ID, CLAN_RETRY_DAYS, withTag, type ClanMember, type Opp, type RookieState, type Stats } from "@shared/rookie/model";
import { simulateSet } from "../gameSimulation";
import { mapAdvantage } from "../career/core";
import { clanMembers } from "@shared/rookie/pros";
import { notify, pressConference } from "./inbox";
import { PROS, ROSTER_VER, RookieError, aiWins, clampCond, clampStat, endDay, fan, gainExp, log, mark, oppForm, pick, playOne, proOpp, raceGrowth, rand, randomMap, revealTrait, series, setQuiet, useSlots, withCond } from "./logic";
import type { PlayedGame, Snap } from "./logic";

// ── 클랜 ─────────────────────────────────────────────────────
/** 클랜원 명단 (프로는 원작 선수 정보로 채움) */
export function rosterOf(id: string): ClanMember[] {
  return clanMembers(id);
}
/** 입단 조건을 못 채웠으면 그 이유 */
export function clanLocked(s: RookieState, id: string): string | null {
  const c = CLAN_BY_ID[id];
  if (!c) return "없는 클랜입니다";
  const games = s.record.w + s.record.l, lg = s.ladder.w + s.ladder.l;
  if (games < c.req.games) return `전체 ${c.req.games}경기 이상 (지금 ${games})`;
  if (lg < c.req.ladderGames) return `래더 ${c.req.ladderGames}경기 이상 (지금 ${lg})`;
  if (c.req.ladder && s.ladder.best < c.req.ladder) return `래더 최고 ${c.req.ladder}점 이상 (지금 ${s.ladder.best})`;
  if (sumStats(s.stats) < c.req.total) return `능력치 합 ${c.req.total.toLocaleString()} 이상`;
  const tried = s.clanTried[id];
  if (tried !== undefined && s.day - tried < CLAN_RETRY_DAYS) return `${CLAN_RETRY_DAYS - (s.day - tried)}일 뒤 다시 도전할 수 있습니다`;
  return null;
}
/** 입단 시험: 클랜원과 3판 2선승 (행동 3) */
export function clanTest(s: RookieState, id: string) {
  if (s.clan?.id === id) throw new RookieError("이미 이 클랜 소속입니다");
  const lock = clanLocked(s, id);
  if (lock) throw new RookieError(lock);
  const c = CLAN_BY_ID[id];
  useSlots(s, 3);
  s.clanTried[id] = s.day;
  const roster = rosterOf(id).filter(m => !m.pro).sort((a, b) => sumStats(a.stats) - sumStats(b.stats));
  // 시험관은 클랜원 중 아래쪽~중간 실력
  const ex = roster[Math.floor(roster.length * (0.05 + rand() * 0.3))];
  const opp: Opp = withCond({ name: withTag(ex.name, c.tag), race: ex.race, stats: { ...ex.stats } });
  const res = series(s, opp, 2, `${c.name} 입단 시험`);
  for (const g of res.games) mark(s, "🛡️", g.winner === "a");
  if (res.won) {
    const from = s.clan ? CLAN_BY_ID[s.clan.id]?.name : undefined;
    s.clan = { id, joined: s.day, points: 0, w: 0, l: 0, members: rosterOf(id), ...({ rv: ROSTER_VER } as object) };
    s.fame += c.tier * 6;
    s.titles.unshift(`${dateText(s.day)} 클랜 ${c.name}[${c.tag}] 가입`);
    log(s, "🛡️", `${c.name} 입단 시험 통과! 클랜 [${c.tag}]에 들어갔습니다${from ? ` (${from} 탈퇴)` : ""}`);
    revealTrait(s, "클랜장 첫인상");
    gainExp(s, 80 + c.tier * 40);
  } else log(s, "💧", `${c.name} 입단 시험에서 떨어졌습니다 (${CLAN_RETRY_DAYS}일 뒤 재도전)`);
  return { games: res.games, won: res.won };
}
export function leaveClan(s: RookieState) {
  if (!s.clan) throw new RookieError("클랜 소속이 아닙니다");
  if (s.war) throw new RookieError("클랜전이 진행 중일 때는 탈퇴할 수 없습니다");
  const c = CLAN_BY_ID[s.clan.id];
  // 길드장이 떠나면 부길드장이 자동으로 길드장이 됨
  let successor: string | undefined;
  if (s.clan.role === "master") {
    const heir = s.clan.members.filter(m => m.role === "sub").sort((a, b) => b.points - a.points)[0] ?? [...s.clan.members].filter(m => !m.pro).sort((a, b) => b.points - a.points)[0];
    if (heir) { heir.role = "master"; successor = heir.name; }
  }
  log(s, "🚪", `클랜 ${c?.name}에서 탈퇴했습니다${successor ? ` — 부길드장 ${successor} 님이 새 길드장이 되었습니다` : ""}`);
  delete s.clan;
  return { ok: true, successor };
}
/** 클랜 연습 상대: 클랜 안에서 나와 비슷하거나 더 강한 쪽을 자주 만남 (높은 단계 클랜일수록 강한 상대) */
function clanOpponent(s: RookieState): ClanMember {
  const c = CLAN_BY_ID[s.clan!.id];
  const all = s.clan!.members;
  const pros = all.filter(m => m.pro);
  if (pros.length && rand() < (c.tier >= 4 ? 0.3 : 0.2)) return pick(pros);
  const ams = all.filter(m => !m.pro).sort((a, b) => sumStats(b.stats) - sumStats(a.stats));
  // 상위 절반에서 60%, 나머지는 아무나
  const pool = rand() < 0.6 ? ams.slice(0, Math.max(3, Math.ceil(ams.length / 2))) : ams;
  return pick(pool);
}
/** 클랜 연습: 클랜원(가끔 프로)과 한 판, 조언을 들어 1.3배로 배움 */
export function clanPractice(s: RookieState, target?: string) {
  if (!s.clan) throw new RookieError("클랜에 들어가야 합니다");
  useSlots(s, 1);
  const c = CLAN_BY_ID[s.clan.id];
  const m = (target && s.clan.members.find(x => x.name === target)) || clanOpponent(s);
  const opp: Opp = m.pro ? proOpp(m.pro.id) : withCond({ name: withTag(m.name, c.tag), race: m.race, stats: { ...m.stats } });
  const mapId = randomMap();
  const g = playOne(s, opp, mapId, `${c.name} 클랜 연습`, true, (m.pro ? 1.5 : 1.3) * raceGrowth(mapId, s.race, opp.race));
  const won = g.winner === "a";
  s.clan[won ? "w" : "l"]++;
  // 이기면 점수를 가져오고 지면 잃음 (상대 클랜원도 반대로)
  s.clan.points = Math.max(0, s.clan.points + (won ? 10 : -6));
  m.points = Math.max(0, m.points + (won ? -6 : 10));
  m[won ? "l" : "w"] = (m[won ? "l" : "w"] ?? 0) + 1;
  const vs = ((s.clan.vs ??= {})[m.name] ??= [0, 0]);
  vs[won ? 0 : 1]++;
  addFriend(s, m.name, 3);
  // 진 경기에서 떨어진 능력치는 피드백으로 일부 되돌릴 수 있음
  if (!won) {
    const fb = (s.clan.fb ??= { lost: {}, from: m.name });
    fb.from = m.name;
    for (const [k, v] of Object.entries(g.fx.stats)) if ((v ?? 0) < 0) fb.lost[k as StatKey] = (fb.lost[k as StatKey] ?? 0) + -(v as number);
  }
  gainExp(s, won ? 10 : 4);
  mark(s, "🛡️", won);
  log(s, won ? "🛡️" : "💧", `클랜 연습 vs ${m.pro ? `프로 ${opp.name}` : opp.name} ${won ? "승리" : "패배"}`);
  return g;
}
/** 클랜원과의 친분도 (연습·경기를 같이 할수록 올라감) */
function addFriend(s: RookieState, name: string, n: number) {
  if (!s.clan) return;
  const fr = (s.clan.fr ??= {});
  // 사교성: 1 → 0.73배, 10 → 1배, 20 → 1.3배
  const soc = s.persona ? 0.7 + s.persona.soc * 0.03 : 1;
  fr[name] = Math.min(100, (fr[name] ?? 0) + Math.max(1, Math.round(n * soc)));
}
/** 피드백 받기: 클랜원에게 진 경기에서 떨어진 능력치 일부를 되찾는 대신 컨디션이 줄어듦 */
export function clanFeedback(s: RookieState) {
  const fb = s.clan?.fb;
  if (!s.clan || !fb || !Object.keys(fb.lost).length) throw new RookieError("피드백 받을 패배 경기가 없습니다");
  if (s.cond < 20) throw new RookieError("컨디션이 너무 낮아 피드백을 받을 수 없습니다");
  const cap = capOf(s);
  const back: Partial<Stats> = {};
  const before = s.cond;
  for (const [k, lost] of Object.entries(fb.lost) as Array<[StatKey, number]>) {
    const room = Math.max(0, cap - sumStats(s.stats));
    const v = Math.min(room, Math.max(1, Math.round(lost * (0.5 + rand() * 0.3))));
    if (v <= 0) continue;
    s.stats[k] = clampStat(s.stats[k] + v);
    back[k] = v;
  }
  s.cond = clampCond(s.cond - 10);
  addFriend(s, fb.from, 2);
  delete s.clan.fb;
  log(s, "🗣️", `${fb.from}에게 피드백을 받았습니다 (${Object.entries(back).map(([k, v]) => `${STAT_LABELS[k as StatKey]} +${v}`).join(", ") || "회복할 능력치 없음"} · 컨디션 -10)`);
  mark(s, "🗣️");
  return { back, cond: [before, s.cond] as [number, number] };
}
export function clanDay(s: RookieState, prevDay: number) {
  if (!s.clan) return;
  const c = CLAN_BY_ID[s.clan.id];
  // 다른 클랜원끼리도 하루 몇 판씩: 이기면 +10, 지면 -6
  const ms = s.clan.members;
  for (let i = 0; i < Math.ceil(ms.length * 0.6); i++) {
    const a = pick(ms), b = pick(ms);
    if (a === b) continue;
    const sa = a.pro ? PROS[a.pro.id].stats : a.stats, sb = b.pro ? PROS[b.pro.id].stats : b.stats;
    const aw = aiWins({ name: a.name, race: a.race, stats: sa }, { name: b.name, race: b.race, stats: sb });
    const [w, l] = aw ? [a, b] : [b, a];
    w.points += 10; w.w = (w.w ?? 0) + 1;
    l.points = Math.max(0, l.points - 6); l.l = (l.l ?? 0) + 1;
  }
  void c;
  if (ymd(prevDay + 1).d === 1) clanRoles(s);
  if (isMonthEnd(prevDay) && s.status !== "pro" && !s.team) {
    const rank = clanRank(s);
    const pros = s.clan.members.filter(m => m.pro);
    if (pros.length && rank <= 3 && rand() < 0.3) {
      const p = pick(pros);
      const team = PROS[p.pro!.id].team;
      if (!s.tryouts.some(x => x.team === team)) {
        s.tryouts.push({ team, until: s.day + 14, from: `클랜 선배 ${PROS[p.pro!.id].name} 선수의 추천` });
        notify(s, "agent", "입단 테스트 담당자", `${ORIG_TEAMS[team].name} 입단 테스트 제의`, "입단 테스트 제의가 왔습니다. 2주 안에 구단 화면에서 입단 테스트를 치르세요. 이기면 입단합니다.");
        log(s, "📩", `클랜 선배 ${PROS[p.pro!.id].name} 선수가 ${ORIG_TEAMS[team].name}에 추천해 입단 테스트 제의가 왔습니다!`);
      }
    }
  }
}
export function clanRank(s: RookieState) {
  if (!s.clan) return 0;
  return s.clan.members.filter(m => m.points > s.clan!.points).length + 1;
}
export { CLANS };

// ── 클랜전 ───────────────────────────────────────────────────
const SUNDAY = 0;
const hashOf = (str: string) => {
  let x = [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  // 이웃한 값이 같은 결과가 되지 않게 섞음
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
};
/** 클랜원을 경기 상대(Opp)로: 프로는 원작 능력치, 아마추어는 클랜 태그를 붙인 아이디 */
function memberOpp(m: ClanMember, tag: string): Opp {
  if (m.pro) return proOpp(m.pro.id);
  return withCond({ name: withTag(m.name, tag), race: m.race, stats: { ...m.stats } });
}
const strengthOf = (m: ClanMember) => sumStats(m.stats);

/** 클랜전 날짜들: 가입하고 일주일 뒤 첫 일요일부터 2주마다 (월말·드래프트·신청한 대회와 겹치면 일주일 뒤로) */
function warBase(s: RookieState, k: number): number {
  const start = s.clan!.joined + 7;
  const first = start + ((7 + SUNDAY - ymd(start).dow) % 7);
  return first + 14 * k;
}
function warConflict(s: RookieState, day: number) {
  const y = ymd(day).y;
  return isMonthEnd(day) || draftDay(y) === day || s.events.some(e => e.day === day && e.registered);
}
export function warDayOf(s: RookieState, k: number): number {
  let d = warBase(s, k);
  for (let i = 0; i < 4 && warConflict(s, d); i++) d += 7;
  return d;
}
/** 몇 번째 클랜전의 상대 클랜: 40%는 라이벌 클랜, 나머지는 비슷한 단계의 다른 클랜 */
export function warOpponent(clanId: string, k: number): string {
  const c = CLAN_BY_ID[clanId];
  const rel = clanRelations(clanId);
  const h = hashOf(`${clanId}-${k}`);
  if (h % 10 < 4) return rel.rival;
  const pool = CLANS.filter(x => x.id !== clanId && x.id !== rel.friend && x.id !== rel.rival && Math.abs(x.tier - c.tier) <= 1);
  return pool[(h >>> 3) % pool.length].id;
}
/** 앞으로의 클랜전 일정 (오늘 이후) */
export function warSchedule(s: RookieState, n = 4): Array<{ k: number; day: number; opp: string }> {
  if (!s.clan) return [];
  const out: Array<{ k: number; day: number; opp: string }> = [];
  for (let k = 0; k < 400 && out.length < n; k++) {
    const day = warDayOf(s, k);
    if (day < s.day) continue;
    if (s.clan.wars?.some(w => w.k === k)) continue;
    out.push({ k, day, opp: warOpponent(s.clan.id, k) });
  }
  return out;
}
/** 그 날 클랜전이 있는지 */
export function warAt(s: RookieState, day: number) {
  if (!s.clan || day < s.clan.joined + 7) return null;
  // day 가 속한 k 후보만 확인 (가입 후 일수로 계산)
  const approx = Math.floor((day - (s.clan.joined + 7)) / 14);
  for (let k = Math.max(0, approx - 1); k <= approx + 1; k++) {
    if (warDayOf(s, k) === day && !s.clan.wars?.some(w => w.k === k)) return { k, day, opp: warOpponent(s.clan.id, k) };
  }
  return null;
}

/** 엔트리: 능력치(운 약간)가 높은 5명, 순서는 섞음 */
function pickEntry(cands: ClanMember[]): ClanMember[] {
  const scored = cands.map(m => ({ m, v: strengthOf(m) * (0.94 + rand() * 0.12) })).sort((a, b) => b.v - a.v).slice(0, WAR_SETS).map(x => x.m);
  return scored.sort(() => rand() - 0.5);
}
const meMember = (s: RookieState): ClanMember => ({ name: s.name, race: s.race, stats: { ...s.stats }, points: s.clan?.points ?? 0, w: s.clan?.w, l: s.clan?.l });

/** 클랜전 시작: 길드장이면 내가 엔트리를 짜고, 아니면 길드장이 짠 엔트리를 보고 시작 */
export function startWar(s: RookieState) {
  if (!s.clan) throw new RookieError("클랜에 들어가야 합니다");
  if (s.war) throw new RookieError("진행 중인 클랜전이 있습니다");
  const w = warAt(s, s.day);
  if (!w) throw new RookieError("오늘은 클랜전이 없습니다");
  const masterIsMe = s.clan.role === "master";
  const oppMembers = clanMembers(w.opp);
  const war: ClanWar = {
    day: s.day, k: w.k, oppClan: w.opp, phase: masterIsMe ? "entry" : "fight", masterIsMe,
    my: [], opp: pickEntry(oppMembers), meIdx: -1,
    sets: Array.from({ length: WAR_SETS }, () => ({ mapId: randomMap() })), score: [0, 0],
    before: { stats: { ...s.stats }, cond: s.cond, money: s.money, w: s.record.w, l: s.record.l },
  };
  if (!masterIsMe) {
    // 길드장이 짠 엔트리 (내 능력이 5위 안이면 나도 들어감)
    const me = meMember(s);
    const entry = pickEntry([...s.clan.members, me]);
    war.my = entry;
    war.meIdx = entry.findIndex(m => m === me);
  }
  s.war = war;
  const oc = CLAN_BY_ID[w.opp];
  log(s, "⚔️", `클랜전 [${CLAN_BY_ID[s.clan.id].tag}] vs [${oc.tag}] ${oc.name}${w.opp === clanRelations(s.clan.id).rival ? " (라이벌 클랜!)" : ""} — ${masterIsMe ? "길드장이 직접 엔트리를 짭니다" : war.meIdx >= 0 ? `엔트리에 들었습니다 (${war.meIdx + 1}세트)` : "엔트리에는 못 들었지만 관전합니다"}`);
  return war;
}
/** 길드장이 엔트리 제출: names 에 내 이름(s.name)을 넣으면 내가 직접 뜀 */
export function warEntry(s: RookieState, names: string[]) {
  const w = s.war;
  if (!s.clan || !w || w.phase !== "entry") throw new RookieError("엔트리를 짤 차례가 아닙니다");
  if (names.length !== WAR_SETS || new Set(names).size !== WAR_SETS) throw new RookieError(`서로 다른 ${WAR_SETS}명을 고르세요`);
  const me = meMember(s);
  const entry: ClanMember[] = [];
  for (const n of names) {
    const m = n === s.name ? me : s.clan.members.find(x => x.name === n);
    if (!m) throw new RookieError("클랜원이 아닌 사람이 있습니다");
    entry.push(m);
  }
  w.my = entry;
  w.meIdx = entry.indexOf(me);
  w.phase = "fight";
  log(s, "📋", `엔트리 제출: ${entry.map(m => m.name).join(" · ")}`);
  return w;
}
/** 추천 엔트리 (능력치 높은 순) */
export function warEntrySuggest(s: RookieState): string[] {
  if (!s.clan) return [];
  return [...s.clan.members, meMember(s)].sort((a, b) => strengthOf(b) - strengthOf(a)).slice(0, WAR_SETS).map(m => m.name);
}
/** AI 끼리의 세트를 중계로 볼 수 있는 경기로 */
function spectateSet(a: Opp, b: Opp, mapId: number, label: string, broadcast: boolean): PlayedGame {
  const m = mapView(mapId);
  const r = simulateSet(
    { id: 1, name: a.name, race: a.race, stats: oppForm(a), fatigue: 100 },
    { id: 2, name: b.name, race: b.race, stats: oppForm(b), fatigue: 100 },
    mapAdvantage(mapId, a.race, b.race),
    { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
    false, broadcast, true,
  );
  return { left: a, mapId, winner: r.winnerId === 1 ? "a" : "b", duration: r.duration, timeline: r.timeline, opp: b, fx: { stats: {}, cond: [0, 0] }, label };
}
/** 다음 세트: 내 세트면 내가 뛰고, 아니면 관전(또는 결과만) */
export function warPlay(s: RookieState, quick = false) {
  const w = s.war;
  if (!s.clan || !w) throw new RookieError("진행 중인 클랜전이 없습니다");
  if (w.phase !== "fight") throw new RookieError("먼저 엔트리를 제출하세요");
  const i = w.sets.findIndex(x => !x.winner);
  const my = CLAN_BY_ID[s.clan.id], oc = CLAN_BY_ID[w.oppClan];
  const label = `클랜전 ${i + 1}세트`;
  let g: PlayedGame | undefined;
  let winner: "a" | "b";
  const prevQuiet = setQuiet(quick);
  try {
    if (i === w.meIdx) {
      const opp = memberOpp(w.opp[i], oc.tag);
      g = playOne(s, opp, w.sets[i].mapId, label, true, 1.2 * raceGrowth(w.sets[i].mapId, s.race, opp.race));
      winner = g.winner;
    } else {
      const ao = memberOpp(w.my[i], my.tag), bo = memberOpp(w.opp[i], oc.tag);
      if (quick) winner = aiWins(ao, bo) ? "a" : "b";
      else { g = spectateSet(ao, bo, w.sets[i].mapId, label, true); winner = g.winner; }
    }
  } finally { setQuiet(prevQuiet, true); }
  w.sets[i].winner = winner;
  w.score[winner === "a" ? 0 : 1]++;
  const done = w.score[0] >= 3 || w.score[1] >= 3;
  const games = g ? [g] : [];
  if (!done) return { games, war: w, finished: undefined };
  return { games, ...finishWar(s) };
}
/** 클랜전이 끝남: 기록 · 보상 · 하루 마무리 */
function finishWar(s: RookieState, extraNote?: string, end = true) {
  const w = s.war!;
  const clan = s.clan!;
  const my = CLAN_BY_ID[clan.id], oc = CLAN_BY_ID[w.oppClan];
  const win = w.score[0] > w.score[1];
  const played = w.meIdx >= 0;
  const myWon = played && w.sets[w.meIdx].winner === "a";
  (clan.wars ??= []).unshift({ day: w.day, opp: w.oppClan, my: w.score[0], their: w.score[1], played, k: w.k });
  if (clan.wars.length > 30) clan.wars.length = 30;
  const v = ((clan.vsClan ??= {})[w.oppClan] ??= [0, 0]);
  v[win ? 0 : 1]++;
  if (played) { clan.warPlayed = (clan.warPlayed ?? 0) + 1; if (myWon) clan.warWon = (clan.warWon ?? 0) + 1; }
  // 뛴 클랜전은 끝나고 기자회견 (커뮤니티 인터뷰)
  if (played && end) pressConference(s, `${oc?.name ?? "상대 클랜"}와의 클랜전`, win);
  // 보상: 뛴 사람은 점수·경험치, 이긴 클랜은 인지도·수당, 같이 이긴 엔트리와 친해짐
  clan.points = Math.max(0, clan.points + (played ? (myWon ? 15 : 3) : win ? 5 : 0));
  gainExp(s, played ? (myWon ? 50 : 15) : 6);
  if (win) {
    s.fame += my.tier + (played ? 2 : 0);
    const pay = 3 * my.tier + (myWon ? 5 : 0);
    s.money += pay;
    for (const m of w.my) if (m.name !== s.name) addFriend(s, m.name, played ? 3 : 1);
    fan(s, "plWin", `클랜전 vs ${oc.name}`);
  }
  mark(s, "⚔️", played ? myWon : undefined);
  const res = win ? "승리" : "패배";
  log(s, win ? "🏆" : "💧", `클랜전 [${my.tag}] ${w.score[0]} : ${w.score[1]} [${oc.tag}] ${res}${played ? ` · 내 ${w.meIdx + 1}세트 ${myWon ? "승" : "패"}` : " · 관전"}${extraNote ?? ""}`);
  const before = w.before as Snap;
  const day = w.day;
  const war = w;
  delete s.war;
  s.used = 0;
  // 불참으로 자동 처리할 때는 오늘 활동과 함께 하루를 마무리하므로 여기서는 끝내지 않음
  const reports = end ? endDay(s, before, day, "event", "⚔️ 클랜전") : [];
  return { war, finished: { activity: "war" as const, title: "⚔️ 클랜전", win, score: war.score, oppClan: war.oppClan, played, myWon, reports } };
}
/** 클랜전 날 다른 활동을 골라 불참: 내가 엔트리에 있으면 내 세트는 기권패, 나머지는 자동으로 진행 */
export function autoWar(s: RookieState) {
  const w = warAt(s, s.day);
  if (!w || !s.clan || s.war) return;
  const war = startWar(s);
  if (war.phase === "entry") { warEntry(s, warEntrySuggest(s)); }
  const cur = s.war!;
  const my = CLAN_BY_ID[s.clan.id], oc = CLAN_BY_ID[cur.oppClan];
  for (let i = 0; i < cur.sets.length && cur.score[0] < 3 && cur.score[1] < 3; i++) {
    let winner: "a" | "b";
    if (i === cur.meIdx) winner = "b";   // 기권패
    else winner = aiWins(memberOpp(cur.my[i], my.tag), memberOpp(cur.opp[i], oc.tag)) ? "a" : "b";
    cur.sets[i].winner = winner;
    cur.score[winner === "a" ? 0 : 1]++;
  }
  if (cur.meIdx >= 0) { s.morale = Math.max(0, s.morale - 8); s.clan.points = Math.max(0, s.clan.points - 10); }
  finishWar(s, cur.meIdx >= 0 ? " · 엔트리에 들었는데 나가지 않아 기권패 (사기 -8, 점수 -10)" : " · 불참", false);
}

/** 직책: 오래 활동하고 클랜 안에서 순위가 높으면 부길드장 → 길드장 (매달 1일 심사) */
function clanRoles(s: RookieState) {
  const c = s.clan;
  if (!c) return;
  const tenure = s.day - c.joined;
  const rank = clanRank(s);
  const wars = c.warPlayed ?? 0;
  const tag = CLAN_BY_ID[c.id].tag;
  if (!c.role && tenure >= 60 && rank <= 4 && wars >= 2 && rand() < 0.6) {
    c.role = "sub";
    // 부길드장은 두 명까지: 점수가 가장 낮은 부길드장은 일반 클랜원으로
    const subs = c.members.filter(m => m.role === "sub").sort((a, b) => a.points - b.points);
    if (subs.length >= 2) delete subs[0].role;
    log(s, "🎖️", `[${tag}] 길드장이 나를 부길드장으로 임명했습니다! (함께한 지 ${tenure}일 · 클랜 내 ${rank}위)`);
    s.fame += 5;
  } else if (c.role === "sub" && tenure >= 180 && rank <= 2 && wars >= 6 && rand() < 0.5) {
    c.role = "master";
    const old = c.members.find(m => m.role === "master");
    if (old) old.role = "sub";
    log(s, "👑", `[${tag}] 새 길드장으로 추대되었습니다!${old ? ` ${old.name} 님은 부길드장이 됩니다` : ""} 이제 클랜전 엔트리를 직접 짭니다`);
    s.fame += 15;
  }
}

/** 친선경기: 친한 클랜의 클랜원과 한 판 (점수가 깎이지 않고 편하게 배움) */
export function friendlyGame(s: RookieState): PlayedGame {
  if (!s.clan) throw new RookieError("클랜에 들어가야 합니다");
  useSlots(s, 1);
  const rel = clanRelations(s.clan.id);
  const fc = CLAN_BY_ID[rel.friend];
  const ms = clanMembers(rel.friend);
  const ams = ms.filter(m => !m.pro).sort((a, b) => strengthOf(b) - strengthOf(a));
  const m = ms.some(x => x.pro) && rand() < 0.2 ? pick(ms.filter(x => x.pro)) : pick(rand() < 0.5 ? ams.slice(0, Math.ceil(ams.length / 2)) : ams);
  const opp = memberOpp(m, fc.tag);
  const mapId = randomMap();
  const g = playOne(s, opp, mapId, `클랜 친선경기 [${fc.tag}]`, true, 1.3 * raceGrowth(mapId, s.race, opp.race));
  const won = g.winner === "a";
  const f = (s.clan.friendly ??= [0, 0]);
  f[won ? 0 : 1]++;
  addFriend(s, `${fc.tag}:${m.name}`, 2);
  s.clan.points = Math.max(0, s.clan.points + (won ? 3 : 0));
  gainExp(s, won ? 8 : 4);
  mark(s, "🤝", won);
  log(s, "🤝", `친선경기 [${fc.tag}] ${opp.name}${m.real ? `(${m.real})` : ""} ${won ? "승리" : "패배"}`);
  return g;
}
