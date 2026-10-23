/**
 * 선수 키우기 모드 규칙 (서버)
 * 하루는 활동 하나(연습·래더·휴식·방송 등) + 이벤트 대회 + 커리지 매치(매달 말) + 드래프트(12월) + 프로 구단 생활
 */
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ORIG_MAPS, ORIG_TEAMS } from "@shared/career/originalData";
import { COND_MAX, COND_MIN, type Race } from "@shared/career/rules";
import { ITEM_BY_KEY, slotOf } from "@shared/career/items";
import { initialPlayers } from "@shared/career/init";
import { mapView } from "@shared/career/view";
import {
  roundName, type Bracket, type BracketMatch, clanRelations, CONCEPTS, DAY_SLOTS, DAY_GAMES, AUTO_GAMES, WEEK_PICKS, weekStartOf, EVENT_NAMES,
  LADDER_START, RACES, ROOKIE_BONUS, ROOKIE_PRICE, ROOKIE_USES, SEMIPRO_DAYS, STATUS_NAMES, STAT_MAX_ONE, STAT_MIN_ONE, TIERS, TIER_ORDER, TRYOUT_MIN,
  VITA_PER_DAY, capOf, courageDays, dateText, draftDay, isMonthEnd, ladderGrade, nickname, statsAround, sumStats, ymd, ACHIEVEMENTS, STAT_CAP,
  emptyCounts, rollStats, CLAN_BY_ID, mapUnd, LADDER_REQ, MAX_LEVEL, eventReq, levelNeed, withTag, LEVEL_CAP_BONUS, type Concept, type Opp,
  PRO_RULES, FATIGUE, INJURY_PERF, INJURIES, fatiguePerf, type RookieEvent, type RookieState, type Stats, type Tier, type Rival,
} from "@shared/rookie/model";
import { simulateSet } from "../gameSimulation";
import { mapAdvantage } from "../career/core";
import type { SetTimeline } from "../gameSimulation";
import { fanPosts, type FanKind } from "./fans";
import { clanTagOfPro, proGamerId } from "@shared/rookie/pros";
import { dailyMail, expireMails, notify, pressConference, rivalHeatResult } from "./inbox";
import { checkGoals, ensureGoals, ensureWorld, goalProgress, myPeerRank, weeklyWorld, yearReview } from "./world";
import { agentOf } from "@shared/rookie/squad";
import { BIG_KINDS, MOM_RATING, TRAIT_KEYS, TRAITS, emptySeason, kindOf, rollPersona, traitShown, type GameKind, type TraitKey } from "@shared/rookie/persona";
import {
  benchDay, promoDue, promoReady, squadReview, transferLocked, contractEnd, inEntry, loanReturn, marketValue, mentor, monthlySquad, myRole, playInternal, playProleague, playPromo, signContract, squadRank,
  startNego, trustOf,
} from "./pro";
import { autoWar, clanDay, clanPractice, clanRank, clanTest, friendlyGame, rosterOf, startWar, warAt, warSchedule } from "./clan";
export * from "./pro";
export * from "./clan";

/** 클랜 명단 버전 (바뀌면 불러올 때 새 명단으로 교체) */
export const ROSTER_VER = 4;
export class RookieError extends Error {}
export const rand = () => Math.random();
export const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
export const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
export const clampStat = (v: number) => Math.max(STAT_MIN_ONE, Math.min(STAT_MAX_ONE, Math.round(v)));
export const clampCond = (v: number) => Math.max(COND_MIN, Math.min(COND_MAX, Math.round(v)));

// 프로 선수 (원작 데이터, 능력치 고정)
export const PROS = initialPlayers();
export const prosOf = (team: number) => PROS.filter(p => p.team === team);
/** 프로: 게임 아이디(소속 클랜 태그) + 본명 */
export const proOpp = (id: number): Opp => {
  const p = PROS[id], gid = proGamerId(id);
  return { name: withTag(gid, clanTagOfPro(id)), ...(gid !== p.name ? { real: p.name } : {}), race: p.race, stats: { ...p.stats }, pro: { id, team: p.team }, cond: randInt(70, 100) };
};
/** 큰 경기 상대는 내 실력에 맞춰서도 강해짐: 정해진 수준과 내 능력치의 lo~hi배 중 큰 쪽 */
export const nearMe = (s: RookieState, base: number, lo: number, hi: number) => (OPP_SCALE.on ? Math.max(base, Math.round(sumStats(s.stats) * (lo + rand() * (hi - lo)))) : base);
/** 흐름만 확인하는 테스트에서 끌 수 있게 */
export const OPP_SCALE = { on: true };
/** 상대 컨디션을 정해 둠 (화면에 보이는 값과 경기에 쓰는 값이 같게) */
export const withCond = (o: Opp): Opp => { o.cond ??= randInt(65, 100); return o; };
/** 내 게임 아이디: 클랜에 들어가 있으면 아이디[태그] */
const myId = (s: RookieState) => withTag(s.name, s.clan ? CLAN_BY_ID[s.clan.id]?.tag : undefined);
export const PRO_TEAMS = ORIG_TEAMS.filter(t => t.id < 12);

// ── 새로 만들기 ─────────────────────────────────────────────────
export function newRookie(input: { name: string; race: Race; concept: Concept; stats: Stats; photo?: string }): RookieState {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 10) throw new RookieError("이름은 2~10자로 정하세요");
  if (!CONCEPTS[input.concept]) throw new RookieError("컨셉을 고르세요");
  // 주사위 결과 확인 (화면에서 굴린 값이 범위 안인지)
  const total = sumStats(input.stats);
  if (STAT_KEYS.some(k => !(input.stats[k] >= 150 && input.stats[k] <= 560)) || total > 3200 || total < 1900) throw new RookieError("능력치를 다시 굴려 주세요");
  if (input.photo && (input.photo.length > 60_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(input.photo))) throw new RookieError("사진은 작은 이미지 파일만 쓸 수 있습니다");
  const s: RookieState = {
    version: 1, name, photo: input.photo, race: input.race, concept: input.concept,
    stats: { ...input.stats }, startStats: { ...input.stats }, cond: 100, morale: 70, fame: 0, money: 30,
    day: 0, used: 0, vitaToday: 0, status: "amateur", ladder: { score: LADDER_START, w: 0, l: 0, best: LADDER_START },
    record: { w: 0, l: 0 }, inventory: { vitavita: 3 }, equip: {}, events: [], nextEventId: 1, log: [], days: {},
    tryouts: [], offers: [], titles: [], stream: { count: 0, best: 0, fans: 0 }, doneDays: [],
    rival: newRival(input.race, sumStats(input.stats)), streak: 0, fanCafe: { members: 0, posts: [] }, achievements: {}, counts: emptyCounts(),
    level: 1, exp: 0, history: [[0, total]], clanTried: {},
    persona: rollPersona(rand), known: {}, recent: [], seasons: {},
  };
  log(s, "🎮", `${name} (${input.race === "terran" ? "테란" : input.race === "zerg" ? "저그" : "프로토스"} · ${CONCEPTS[input.concept].name}) 게이머의 꿈을 시작했습니다! 매달 마지막 날 열리는 커리지 매치에서 우승하면 준프로가 됩니다`);
  log(s, "⚡", `같은 PC방에서 연습하는 ${s.rival.name}(${raceShort(s.rival.race)} · ${CONCEPTS[s.rival.concept].name})이(가) 라이벌을 선언했습니다! 래더·대회에서 자주 만나게 됩니다`);
  ensureEvents(s);
  noteStop(s);
  ensureWorld(s);
  ensureGoals(s);
  return s;
}

function newRival(myRace: Race, total: number): Rival {
  // 원작 선수와 겹치지 않게 '아마추어 시절 아이디'처럼
  const name = nickname();
  const concept = pick(Object.keys(CONCEPTS) as Concept[]);
  const st = rollStats(concept);
  // 나와 비슷한 수준으로
  const k = Math.max(0.9, Math.min(1.1, (total + randInt(-80, 80)) / sumStats(st)));
  for (const x of STAT_KEYS) st[x] = clampStat(st[x] * k);
  return { name, race: pick(RACES.filter(r => r !== myRace)), concept, stats: st, status: "amateur", w: 0, l: 0 };
}

/** 예전 세이브에 없는 값 채우기 */
export function upgrade(s: RookieState) {
  // 옛 공방 매칭 방식의 흔적 정리
  delete (s as { kicks?: number }).kicks;
  delete (s as { lobby?: unknown }).lobby;
  s.rival ??= newRival(s.race, sumStats(s.startStats));
  s.streak ??= 0;
  s.fanCafe ??= { members: 0, posts: [] };
  s.achievements ??= {};
  s.counts = { ...emptyCounts(), ...(s.counts ?? {}) };
  if (s.team && s.team.contractUntil === undefined) s.team.contractUntil = contractEnd(s.team.joined);
  s.level ??= 1;
  s.exp ??= 0;
  s.history ??= [[s.day, sumStats(s.stats)]];
  s.clanTried ??= {};
  s.persona ??= rollPersona(rand);
  s.known ??= {};
  s.recent ??= [];
  s.seasons ??= {};
  ensureWorld(s);
  ensureGoals(s);
  if (!s.stopLog) { s.stopLog = {}; noteStop(s); }
  // 없어진 클랜 (클랜 목록이 바뀐 경우)
  if (s.clan && !CLAN_BY_ID[s.clan.id]) delete s.clan;
  // 클랜 명단이 새로 짜인 경우 (영어 아이디·강해진 클랜원): 내 점수는 유지하고 명단만 새로
  if (s.clan && (s.clan as { rv?: number }).rv !== ROSTER_VER) {
    s.clan.members = rosterOf(s.clan.id);
    s.clan.vs = {};
    (s.clan as { rv?: number }).rv = ROSTER_VER;
  }
  // 한글이던 라이벌 이름도 영어 아이디로
  if (/[가-힣]/.test(s.rival.name)) s.rival.name = nickname();
  // 예전 클랜원에 전적이 없으면 점수에 맞춰 채움
  for (const m of s.clan?.members ?? []) { m.w ??= Math.round(m.points / 10); m.l ??= Math.round(m.points / 25); }
  return s;
}

// ── 기록 ───────────────────────────────────────────────────────
export function log(s: RookieState, icon: string, text: string) {
  s.log.unshift({ day: s.day, icon, text });
  if (s.log.length > 400) s.log.length = 400;
}
/** 팬카페·커뮤니티 반응 */
export function fan(s: RookieState, kind: FanKind, x = "") {
  const r = fanPosts(s, kind, x);
  s.fanCafe.posts.unshift(...r.posts);
  if (s.fanCafe.posts.length > 80) s.fanCafe.posts.length = 80;
  s.fanCafe.members = Math.max(0, s.fanCafe.members + r.members);
  // 악플은 사기를 조금 깎음
  if (r.mood === "bad") s.morale = Math.max(0, s.morale - 2);
}
export function mark(s: RookieState, icon?: string, won?: boolean) {
  const d = (s.days[s.day] ??= { w: 0, l: 0, icons: [] });
  if (won === true) d.w++;
  if (won === false) d.l++;
  if (icon && !d.icons.includes(icon)) d.icons.push(icon);
}
/** 경험치 → 레벨업 (레벨마다 능력치 조금 + 성장 한계 +20) */
export function gainExp(s: RookieState, n: number) {
  if (s.level >= MAX_LEVEL) return;
  s.exp += Math.round(n);
  while (s.level < MAX_LEVEL && s.exp >= levelNeed(s.level)) {
    s.exp -= levelNeed(s.level);
    s.level++;
    const keys = [...STAT_KEYS].sort(() => rand() - 0.5).slice(0, 3);
    const room = capOf(s) - sumStats(s.stats);
    const gains: string[] = [];
    let budget = Math.max(0, room);
    for (const k of keys) {
      const v = Math.min(budget, randInt(2, 5));
      if (v <= 0) continue;
      s.stats[k] = clampStat(s.stats[k] + v);
      budget -= v;
      gains.push(`${STAT_LABELS[k]} +${v}`);
    }
    log(s, "⭐", `레벨 업! Lv.${s.level}${gains.length ? ` · ${gains.join(", ")}` : ""} · 성장 한계 +${LEVEL_CAP_BONUS}`);
    mark(s, "⭐");
  }
}
/** 부상 중인지 */
export const injured = (s: RookieState) => !!s.injury && s.day <= s.injury.until;

export function useSlots(s: RookieState, n: number) {
  if (s.retired) throw new RookieError(s.retired);
  if (s.used + n > DAY_SLOTS) throw new RookieError(`오늘은 더 할 수 없습니다 (하루 ${DAY_SLOTS}번). 다음 날로 넘어가세요`);
  s.used += n;
}

// ── 경기 ───────────────────────────────────────────────────────
/** 장비 효과 (선수 키우기는 절반) */
function gear(s: RookieState): Stats {
  const out = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Stats;
  for (const e of Object.values(s.equip)) {
    const it = e && ITEM_BY_KEY[e.key];
    if (!it?.bonus) continue;
    for (const [k, v] of Object.entries(it.bonus)) out[k as StatKey] += Math.round((v ?? 0) * ROOKIE_BONUS);
  }
  return out;
}
/** 경기에 쓰는 능력치: 장비 + 컨디션 + 사기 */
export function effective(s: RookieState, perf = 1): Stats {
  const g = gear(s);
  // 아마추어는 하루에 여러 판을 하므로 컨디션 영향은 감독 모드보다 완만하게 (50% → 0.8배)
  const form = s.form?.kind === "slump" ? 0.93 : s.form?.kind === "awake" ? 1.06 : 1;
  const k = (0.6 + 0.4 * (s.cond / 100)) * (0.95 + s.morale / 2000) * form * perf;
  return Object.fromEntries(STAT_KEYS.map(x => [x, Math.round((s.stats[x] + g[x]) * k)])) as Stats;
}
/** 상대도 컨디션이 들쭉날쭉 */
export const oppForm = (o: Opp) => {
  const k = o.cond !== undefined ? 0.6 + 0.4 * (o.cond / 100) : 0.85 + rand() * 0.2;
  return Object.fromEntries(STAT_KEYS.map(x => [x, Math.round(o.stats[x] * k)])) as Stats;
};

export interface PlayedGame {
  /** 관전하는 경기: 왼쪽 선수 (내 경기가 아닐 때) */
  left?: Opp;
  mapId: number;
  winner: "a" | "b";
  duration: number;
  timeline?: SetTimeline;
  opp: Opp;
  /** 경기 뒤 내 변화 */
  fx: { stats: Partial<Stats>; cond: [number, number]; ladder?: [number, number]; money?: number };
  label: string;
  /** 내 경기 평점 (3.0~10.0) · 경기 종류 */
  rating?: number;
  kind?: GameKind;
}

/** 맵 이해도만큼 내 종족이 불리한 맵의 불리함을 덜어 줌 (이해도 55 → 불리함 55% 감소) */
function understood(s: RookieState, mapId: number, opp: Race) {
  const adv = mapAdvantage(mapId, s.race, opp);
  const mine = adv[s.race];
  if (mine === undefined || mine >= 1) return adv;
  const fixed = mine + (1 - mine) * (mapUnd(s, mapId) / 100);
  return { [s.race]: fixed, [opp]: 2 - fixed };
}

/** 전략 카드 (경기 변수): 한쪽이 이걸 들고 나와 적중하면 실력 차이를 뒤집기도 */
const TRICKS = ["전진 올인 러시", "벙커링·전진 게이트 치즈", "몰래 멀티", "기습 드랍", "심리전 빌드", "타이밍 러시", "초반 일꾼 견제", "역러시"] as const;
/**
 * 경기 변수: 양쪽 그날 경기력 편차(±6% 안팎) + 16% 확률로 한쪽 전략 적중(+10~22%)
 * → 능력치가 10% 앞서도 60~65%, 20% 앞서도 75~80% 정도만 이김 (강하다고 늘 이기지 않음)
 */
function swingOf(): { me: number; opp: number; trick?: "me" | "opp"; name?: string } {
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  let me = 1 + gauss() * SWING.sd, opp = 1 + gauss() * SWING.sd;
  if (rand() < SWING.trick) {
    const side = rand() < 0.5 ? "me" : "opp";
    const k = 1 + SWING.trickMin + rand() * (SWING.trickMax - SWING.trickMin);
    if (side === "me") me *= k; else opp *= k;
    return { me, opp, trick: side, name: pick([...TRICKS]) };
  }
  return { me, opp };
}
export const SWING = { sd: 0.2, trick: 0.32, trickMin: 0.25, trickMax: 0.5 };

/**
 * 경기 엔진은 프로 수준 능력치(한 항목 700 안팎)에서 종족 균형이 맞춰져 있어, 아마추어 능력치(300대)로 돌리면
 * 테란이 크게 불리함 (같은 능력치로 저그·프로토스 상대 25~30%). 그래서 두 선수 능력치를 같은 비율로
 * 프로 수준(평균 합 5,600)에 맞춰 경기를 돌림 — 둘 사이 실력 차이(비율)는 그대로
 */
export function proScale(a: Stats, b: Stats, ka = 1, kb = 1): [Stats, Stats] {
  const k = 5600 / Math.max(1, (sumStats(a) + sumStats(b)) / 2);
  const f = (x: Stats, m: number) => Object.fromEntries(STAT_KEYS.map(key => [key, Math.round(x[key] * k * m)])) as Stats;
  return [f(a, ka), f(b, kb)];
}

/** 한 판 (a = 나). broadcast: 중계 문장까지 */
/** 연속 진행 중 (중계 문장 없이 빠르게) */
let QUIET = false;
/** 결과만 빠르게 (중계 없이): 이전 값을 돌려줌 · restore=true 면 그 값으로 되돌림 */
export function setQuiet(on: boolean, restore = false) { const prev = QUIET; if (on || restore) QUIET = on; return prev; }
export function playOne(s: RookieState, opp: Opp, mapId: number, label: string, broadcastIn = true, growMul = 1): PlayedGame {
  const broadcast = broadcastIn && !QUIET;
  const m = mapView(mapId);
  const kind = kindOf(label);
  const perf = dayPerf(s, kind);
  const sw = swingOf();
  const [myStats, oppStats] = proScale(effective(s, perf * sw.me), oppForm(opp), 1, sw.opp);
  const r = simulateSet(
    { id: 1, name: myId(s), race: s.race, stats: myStats, fatigue: 100 },
    { id: 2, name: opp.name, race: opp.race, stats: oppStats, fatigue: 100 },
    understood(s, mapId, opp.race),
    { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
    false, broadcast,
    // 공방·래더·클랜·팀 연습은 온라인 게임 (치어풀·세리머니 없음)
    /^(공방|래더|팀 내부 연습)|클랜/.test(label),
  );
  const won = r.winnerId === 1;
  (s.mapGames ??= {})[mapId] = (s.mapGames[mapId] ?? 0) + 1;
  const before = { stats: { ...s.stats }, cond: s.cond };
  // 허무한 패배: 나보다 약한 상대의 전략(올인·치즈 등)에 무너짐 → 능력치·컨디션·사기 크게
  const absurd = !won && sw.trick === "opp" && sumStats(opp.stats) < sumStats(s.stats) * 0.92 && rand() < 0.5;
  // 연습(팀 내부·클랜)에서 진 건 실전보다 덜 잃음
  grow(s, opp, won, growMul, absurd, /^팀 내부 연습|클랜/.test(label) ? 0.5 : 1);
  s.cond = clampCond(s.cond - (won ? randInt(1, 3) : randInt(2, 5)) - (absurd ? randInt(4, 8) : 0));
  if (absurd) {
    s.morale = Math.max(0, s.morale - 3);
    if (!QUIET || rand() < 0.3) log(s, "😵", `${opp.name}의 ${sw.name}에 허무하게 무너졌습니다 (${label})`);
  } else if (won && sw.trick === "me" && sumStats(opp.stats) > sumStats(s.stats) * 1.03 && (!QUIET || rand() < 0.3)) {
    log(s, "🎯", `${sw.name}이(가) 적중해 강한 상대 ${opp.name}을(를) 잡았습니다! (${label})`);
  }
  (s.flags ??= {}).lastGame = s.day;
  // 의지가 강하면 져도 사기가 덜 떨어짐
  const det = s.persona?.det ?? 10;
  s.morale = Math.max(0, Math.min(100, s.morale + (won ? 2 : det >= 15 ? -1 : det <= 6 ? -3 : -2)));
  s.record[won ? "w" : "l"]++;
  wearEquip(s);
  afterGame(s, opp, won);
  const rating = rateGame(s, opp, won, r.duration, perf);
  recordRating(s, kind, won, rating, `${label} vs ${opp.name}`);
  s.fatigue = Math.min(100, Math.round(((s.fatigue ?? 0) + FATIGUE.perGame) * 10) / 10);
  const stats: Partial<Stats> = {};
  for (const k of STAT_KEYS) if (s.stats[k] !== before.stats[k]) stats[k] = s.stats[k] - before.stats[k];
  return { mapId, winner: won ? "a" : "b", duration: r.duration, timeline: r.timeline, opp, fx: { stats, cond: [before.cond, s.cond] }, label, rating, kind };
}

/**
 * 그날 경기력 배율 (숨은 성격)
 * - 꾸준함: 낮을수록 경기마다 들쭉날쭉 (꾸준함 1 → ±9%, 20 → ±0.5%)
 * - 강심장: 큰 경기(대회·클랜전·프로리그·테스트)에서 ±6%
 */
function dayPerf(s: RookieState, kind: GameKind) {
  const P = s.persona;
  const swing = P ? ((21 - P.cons) / 20) * 0.09 : 0.05;
  let perf = 1 + (rand() * 2 - 1) * swing;
  if (P && BIG_KINDS.has(kind)) perf *= 1 + (P.pres - 10) * 0.006;
  // 혹사: 피로가 쌓이면 경기력↓, 부상 중이면 더
  perf *= fatiguePerf(s.fatigue);
  if (injured(s)) perf *= INJURY_PERF;
  return perf;
}

/**
 * 경기 평점 (3.0~10.0): 이기면 7.2, 지면 5.8 에서 시작
 * 강한 상대를 이기면 크게 오르고(최대 +1.2) 약한 상대를 이기면 조금 내려감(최대 -0.5),
 * 약한 상대에게 지면 크게 내려가고(최대 -1.2) 강한 상대에게 지면 조금 오름(최대 +0.5)
 * 빠른 승리·접전 끝 패배는 가산, 그날 경기력(기복)도 반영
 */
function rateGame(s: RookieState, opp: Opp, won: boolean, duration: number, perf: number) {
  const ratio = sumStats(opp.stats) / Math.max(1, sumStats(s.stats));
  const gap = ratio - 1;
  let r = won ? 7.2 : 5.8;
  r += won ? (gap > 0 ? Math.min(1.2, gap * 4) : Math.max(-0.5, gap * 2.5)) : gap < 0 ? Math.max(-1.2, gap * 4) : Math.min(0.5, gap * 2.5);
  if (won && duration > 0 && duration < 600) r += 0.4;
  if (!won && duration > 1200) r += 0.4;
  r += (perf - 1) * 6 + (rand() - 0.5) * 0.6;
  return Math.round(Math.max(3, Math.min(10, r)) * 10) / 10;
}

/** 평점 기록: 최근 20경기 · 연도별 시즌 기록 · MOM 이면 사기 조금 */
function recordRating(s: RookieState, kind: GameKind, won: boolean, rating: number, title: string) {
  (s.recent ??= []).unshift(rating);
  if (s.recent.length > 20) s.recent.length = 20;
  const y = ymd(s.day).y;
  const st = ((s.seasons ??= {})[y] ??= emptySeason());
  st.g++; if (won) st.w++;
  st.sum = Math.round((st.sum + rating) * 10) / 10;
  st.best = Math.max(st.best, rating);
  const by = (st.by[kind] ??= [0, 0]);
  by[0]++; if (won) by[1]++;
  if (rating >= MOM_RATING) { st.mom++; s.morale = Math.min(100, s.morale + 1); }
  // 올해의 명경기: 이긴 경기 중 평점 상위 3
  if (won && (!st.top || st.top.length < 3 || rating > st.top[st.top.length - 1].r)) {
    st.top = [...(st.top ?? []), { d: s.day, r: rating, t: title }].sort((a, b) => b.r - a.r).slice(0, 3);
  }
}

/**
 * 성격 리포트: 아직 모르는 성격 하나를 대략(±3) 알게 되거나, 대략 알던 것을 정확히 알게 됨
 * 코치(프로)·클랜장 주간 리포트, 멘토 과외에서
 */
export function revealTrait(s: RookieState, who: string): TraitKey | null {
  const known = (s.known ??= {});
  const unknown = TRAIT_KEYS.filter(k => !known[k]);
  const rough = TRAIT_KEYS.filter(k => known[k] === 1);
  const k = unknown.length ? pick(unknown) : rough.length ? pick(rough) : null;
  if (!k) return null;
  known[k] = known[k] ? 2 : 1;
  const shown = traitShown(s.persona, known, k);
  log(s, "📋", `${who} 리포트: ${TRAITS[k].name}${known[k] === 2 ? " " + shown.text + " (정확)" : " 대략 " + shown.text}`);
  return k;
}

/**
 * 성장: 이기면 오르고 지면 떨어짐. 강한 상대일수록 크게 배우고, 성장 한계(신분별)에 가까우면 거의 안 오름
 */
/** 확률 반올림 (0.3 → 30% 확률로 1): 작은 성장도 평균은 그대로 */
const pround = (x: number) => { const f = Math.floor(x); return f + (rand() < x - f ? 1 : 0); };
/** 성장 배율 (시뮬레이션으로 맞춘 값): 이겼을 때 · 졌을 때 · 프로가 되면 */
export const GROW = { win: 0.5, loss: 1, pro: 0.35, roomSpan: 1200 };
/**
 * 경기 뒤 능력치 변화
 * - 이기면 1~2개가 천천히 오름 (상대가 강할수록 · 한계에서 멀수록 · 프로는 덜)
 * - 지면 1~2개가 떨어짐 (약한 상대에게 · 연패 중 · 슬럼프 · 허무한 패배면 더 많이)
 */
function grow(s: RookieState, opp: Opp, won: boolean, mul = 1, absurd = false, lossMul = 1) {
  const me = sumStats(s.stats), them = sumStats(opp.stats);
  const ratio = Math.max(0.5, Math.min(1.7, them / Math.max(1, me)));
  // 프로의식: 1 → 0.87배, 10 → 1배, 20 → 1.15배 · 각성 중에는 1.5배
  const prof = s.persona ? 0.85 + s.persona.prof * 0.015 : 1;
  const room = Math.max(0.04, Math.min(1, (capOf(s) - me) / GROW.roomSpan)) * (s.form?.kind === "awake" ? 1.5 : 1) * mul * prof * (s.status === "pro" ? GROW.pro : 1);
  const keys = [...STAT_KEYS].sort(() => rand() - 0.5);
  if (won) {
    // 나보다 확실히 약한 상대(90% 미만)는 이겨도 배우는 게 빠르게 줄고, 70% 아래면 없음 (초보방 학살 방지)
    const learn = ratio >= 0.9 ? ratio : Math.max(0, (ratio - 0.7) / 0.2) * 0.9;
    const n = randInt(1, 2);
    for (const k of keys.slice(0, n)) s.stats[k] = clampStat(s.stats[k] + pround(randInt(2, 6) * learn * room * GROW.win));
  } else if (ratio > 1.15 && !absurd && rand() < 0.3) {
    // 훨씬 강한 상대에게 지면 가끔은 배움
    s.stats[keys[0]] = clampStat(s.stats[keys[0]] + pround(randInt(1, 3) * room));
  } else {
    // 지면 능력치 1~2개가 떨어짐: 약한 상대에게 · 연패가 길수록 · 슬럼프 중 · 허무한 패배면 더 (강한 상대에게 진 건 덜)
    // 단, 최고 기록의 80%(처음 능력치보다는 위) 근처에선 덜 떨어짐 — 기본기는 남음 (나이로 떨어지는 건 별개)
    const peak = Math.max(s.flags?.peak ?? 0, me);
    const floor = Math.max(sumStats(s.startStats), peak * (s.status === "pro" ? 0.88 : 0.8));
    const soft = Math.max(0, Math.min(1, (me - floor) / 300));
    const streak = Math.min(0.6, Math.max(0, -s.streak) * 0.1);
    const vs = ratio >= 1 ? 1 / (ratio * ratio) : 1 / Math.sqrt(ratio);
    const k2 = (1 + streak) * (s.form?.kind === "slump" ? 1.5 : 1) * (absurd ? 1.5 : 1) * GROW.loss * vs * soft * lossMul;
    if (k2 > 0) for (const k of keys.slice(0, absurd ? 2 : randInt(1, 2))) s.stats[k] = clampStat(s.stats[k] - pround(randInt(1, 3) * k2));
  }
  if (won) { const t = sumStats(s.stats); if (t > (s.flags?.peak ?? 0)) (s.flags ??= {}).peak = t; }
  // 한계를 넘으면 가장 높은 능력치부터 조금씩 깎음
  let over = sumStats(s.stats) - capOf(s);
  while (over > 0) {
    const top = [...STAT_KEYS].sort((a, b) => s.stats[b] - s.stats[a])[0];
    s.stats[top] -= 1; over--;
  }
}

/** 라이벌 이야기: 맞대결이 쌓일 때마다 (5·10·20·30·50번째) 기자·라이벌이 말을 걸어 옴 */
function rivalStory(s: RookieState, won: boolean) {
  const r = s.rival, n = r.w + r.l;
  if (![5, 10, 20, 30, 50].includes(n)) return;
  const lead = r.w - r.l;
  const line = lead >= 3 ? `${s.name} 선수가 ${r.w}승 ${r.l}패로 확실히 앞서고 있습니다. ${r.name} 쪽에서는 "다음엔 다를 것"이라며 이를 갈고 있다고.`
    : lead <= -3 ? `${r.name} 선수가 ${r.l}승 ${r.w}패로 앞서 있습니다. "${s.name}? 아직 멀었다"는 말이 커뮤니티에 돌고 있습니다.`
    : `${r.w}승 ${r.l}패, 그야말로 팽팽합니다. 둘 중 누가 먼저 프로 무대에 설지 팬들의 관심이 뜨겁습니다.`;
  notify(s, "media", "e스포츠 기자", `라이벌 ${n}번째 맞대결 ${won ? "승리" : "패배"}`, `${s.name} vs ${r.name}, 벌써 ${n}번째 만남. ${line}`);
  s.fame = Math.min(1000, s.fame + Math.min(10, n / 5));
}

/** 연승·연패 · 슬럼프·각성 · 라이벌 전적 */
function afterGame(s: RookieState, opp: Opp, won: boolean) {
  s.streak = won ? Math.max(0, s.streak) + 1 : Math.min(0, s.streak) - 1;
  s.counts.bestStreak = Math.max(s.counts.bestStreak, s.streak);
  if (opp.rival) {
    s.rival[won ? "w" : "l"]++;
    if (won) s.counts.rivalW++;
    // 라이벌도 경기로 배움
    const k = pick([...STAT_KEYS]);
    s.rival.stats[k] = clampStat(s.rival.stats[k] + (won ? 1 : randInt(2, 4)));
    log(s, "⚡", `라이벌 ${s.rival.name}에게 ${won ? "승리!" : "패배…"} (상대 전적 ${s.rival.w}승 ${s.rival.l}패)`);
    const heat = rivalHeatResult(s, won);
    if (heat) log(s, "🔥", heat);
    rivalStory(s, won);
    fan(s, won ? "rivalWin" : "rivalLose");
    s.morale = Math.max(0, Math.min(100, s.morale + (won ? 5 : -4)));
  }
  if (s.form?.kind === "slump") {
    // 슬럼프 중 강한 상대를 꺾으면 각성할 수도
    const strong = sumStats(opp.stats) >= sumStats(s.stats) * 0.97;
    if (won && strong && s.day - (s.flags?.awakeDay ?? -99) >= 30 && rand() < 0.35) awaken(s, "슬럼프를 이겨내고");
  } else if (!s.form) {
    // 의지가 강할수록 슬럼프에 덜 빠짐 (의지 1 → 0.68, 10 → 0.48, 20 → 0.25)
    // 슬럼프가 끝나고 20일 동안은 다시 빠지지 않음 (빠져나올 틈)
    if (s.streak <= -5 && s.day - (s.flags?.slumpEnd ?? -99) >= 20 && rand() < 0.5 * (s.persona ? 1.4 - s.persona.det * 0.045 : 1)) {
      s.form = { kind: "slump", until: s.day + randInt(5, 12) };
      s.morale = Math.max(0, s.morale - 8);
      log(s, "😞", `${-s.streak}연패… 슬럼프에 빠졌습니다 (경기력 조금 하락 · 강한 상대를 꺾으면 벗어날 수도)`);
      fan(s, "slump");
      mark(s, "😞");
    } else if (s.streak >= 7 && sumStats(opp.stats) >= sumStats(s.stats) * 0.9 && s.day - (s.flags?.awakeDay ?? -99) >= 30 && rand() < 0.2) {
      // 연승 각성은 만만치 않은 상대를 이겼을 때만, 한 달에 한 번까지 (약한 상대 학살로 각성 남발 방지)
      awaken(s, `${s.streak}연승 기세로`);
    }
  }
}
function awaken(s: RookieState, how: string) {
  (s.flags ??= {}).awakeDay = s.day;
  s.form = { kind: "awake", until: s.day + 3 };
  s.counts.awakenings++;
  const keys = [...STAT_KEYS].sort(() => rand() - 0.5).slice(0, 3);
  const gain = keys.map(k => { const v = randInt(3, 6); s.stats[k] = clampStat(s.stats[k] + v); return `${STAT_LABELS[k]} +${v}`; });
  let over = sumStats(s.stats) - capOf(s);
  while (over > 0) { const top = [...STAT_KEYS].sort((a, b) => s.stats[b] - s.stats[a])[0]; s.stats[top]--; over--; }
  s.morale = Math.min(100, s.morale + 15);
  log(s, "🦅", `${how} 각성했습니다! ${gain.join(", ")} · 3일 동안 경기력↑ 성장 1.5배`);
  fan(s, "awake");
  mark(s, "🦅");
}

function wearEquip(s: RookieState) {
  for (const [slot, e] of Object.entries(s.equip)) {
    if (!e) continue;
    e.left--;
    if (e.left <= 0) { delete s.equip[slot as keyof typeof s.equip]; log(s, "🔧", `${ITEM_BY_KEY[e.key]?.name ?? "장비"}가 다 닳았습니다`); }
  }
}

/** 다전제 (need 선승) */
export function series(s: RookieState, opp: Opp, need: number, label: string, maps?: number[]): { games: PlayedGame[]; won: boolean } {
  const games: PlayedGame[] = [];
  let w = 0, l = 0;
  for (let i = 0; w < need && l < need; i++) {
    const g = playOne(s, opp, maps?.[i] ?? randomMap(), need > 1 ? `${label} ${i + 1}세트` : label);
    games.push(g);
    if (g.winner === "a") w++; else l++;
  }
  return { games, won: w >= need };
}
export const randomMap = () => randInt(0, ORIG_MAPS.length - 1);

/** 대회에서 나 말고 다른 선수끼리 (능력치로 빠른 판정) */
export function aiWins(a: Opp, b: Opp, need = 1) {
  const eff = (o: Opp) => sumStats(o.stats) * (o.cond !== undefined ? 0.6 + 0.4 * (o.cond / 100) : 1);
  const pa = eff(a), pb = eff(b);
  const p = 1 / (1 + Math.pow(10, (pb - pa) / 900));
  let w = 0, l = 0;
  while (w < need && l < need) { if (rand() < p) w++; else l++; }
  return w >= need;
}

// ── 공방 (연습 게임) ────────────────────────────────────────────
function lobbyOpp(tier: Tier, me?: number): Opp {
  // 초보방에도 가끔 고수가 섞여 나옴
  let i = TIER_ORDER.indexOf(tier);
  const r = rand();
  if (r < 0.06) i += 2; else if (r < 0.2) i += 1; else if (r > 0.9) i -= 1;
  const t = TIERS[TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, i))]];
  // 같은 방 안에서는 대개 나와 비슷한 사람과 붙음 (방 범위 안, 내 능력치 ±12%)
  let [lo, hi] = t.range;
  if (me !== undefined && rand() < 0.7) { const a = Math.max(lo, Math.round(me * 0.88)), b = Math.min(hi, Math.round(me * 1.12)); if (a <= b) { lo = a; hi = b; } }
  return withCond({ name: nickname(), race: pick(RACES), stats: statsAround(randInt(lo, hi)) });
}

/** 공방 한 판 (방 등급·맵을 골라서) */
export function playLobby(s: RookieState, tier: Tier, mapId: number): PlayedGame {
  if (!TIERS[tier]) throw new RookieError("방을 고르세요");
  if (!(mapId >= 0 && mapId < ORIG_MAPS.length)) throw new RookieError("맵을 고르세요");
  const lb = { tier, mapId, opp: lobbyOpp(tier, sumStats(s.stats)) };
  useSlots(s, 1);
  const mul = raceGrowth(lb.mapId, s.race, lb.opp.race);
  const g = playOne(s, lb.opp, lb.mapId, `공방 ${TIERS[lb.tier].name}방`, true, mul);
  if (g.winner === "a") s.counts.lobbyW++;
  gainExp(s, g.winner === "a" ? 6 : 2);
  mark(s, "🎮", g.winner === "a");
  log(s, g.winner === "a" ? "🎮" : "💧", `공방(${TIERS[lb.tier].name}) ${mapView(lb.mapId).name} vs ${lb.opp.name}(${raceShort(lb.opp.race)}) ${g.winner === "a" ? "승리" : "패배"}`);
  return g;
}
/** 내 종족이 불리한 맵에서 연습하면 더 많이 배움 (불리 10% → 1.3배) */
export function raceGrowth(mapId: number, me: Race, opp: Race) {
  const adv = mapAdvantage(mapId, me, opp)[me] ?? 1;
  return adv < 1 ? Math.min(1.6, 1 + (1 - adv) * 3) : 1;
}
const raceShort = (r: Race) => (r === "terran" ? "T" : r === "zerg" ? "Z" : "P");

// ── 래더 ───────────────────────────────────────────────────────
/** 래더 상대: 강한 아마추어 · 준프로 · 프로가 섞여 있음, 점수가 비슷한 상대 */
/** 래더 점수 ↔ 능력치 합 (상대를 고를 때): 800 → 2,000 · 1,500 → 3,540 · 2,500 → 5,740 · 3,000 → 6,840 */
export const ladderStrength = (score: number) => Math.round(2000 + (score - 800) * 2.2);
/** 능력치 합 → 그 실력의 래더 점수 (ladderStrength 의 반대) */
export const ladderScoreOf = (total: number) => 800 + (total - 2000) / 2.2;
function ladderOpp(score: number): Opp {
  const r = rand();
  // 프로게이머는 점수가 높은 구간(1,800~)부터 가끔, 3,300 이상이면 32%
  if (r < Math.max(0, Math.min(0.32, (score - 1800) / 1500 * 0.32))) {
    const p = PROS[randInt(0, PROS.length - 1)];
    const o = proOpp(p.id);
    o.ladder = Math.round(ladderScoreOf(sumStats(o.stats)) + randInt(-80, 80));
    return o;
  }
  const total = Math.max(1800, Math.min(7800, ladderStrength(score) + randInt(-250, 300)));
  const semipro = total >= 4700 && rand() < 0.35;
  return withCond({ name: nickname(), race: pick(RACES), stats: statsAround(total), semipro, ladder: Math.round(score + randInt(-120, 120)) });
}

/** 래더 맵: 한 달마다 새로 5개 (같은 달에는 늘 같은 맵) */
export function ladderPool(s: RookieState) {
  const x = ymd(s.day), month = x.y * 12 + x.m;
  if (s.ladderMaps?.month !== month) {
    let seed = (month * 2654435761 + [...s.name].reduce((a, c) => a + c.charCodeAt(0), 0) * 40503) >>> 0;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const all = ORIG_MAPS.map((_, i) => i);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const maps = all.slice(0, 5);
    s.ladderMaps = { month, maps, sel: [...maps] };
  }
  return s.ladderMaps;
}
export function setLadderMaps(s: RookieState, sel: number[]) {
  const pool = ladderPool(s);
  const ok = pool.maps.filter(m => sel.includes(m));
  if (!ok.length) throw new RookieError("래더 맵을 하나 이상 고르세요");
  pool.sel = ok;
  return { sel: ok };
}

export function ladderLocked(s: RookieState): string | null {
  const games = s.record.w + s.record.l;
  if (games < LADDER_REQ.games) return `래더는 경기 ${LADDER_REQ.games}판 이상 해본 선수만 (지금 ${games}판)`;
  if (sumStats(s.stats) < LADDER_REQ.total) return `래더는 능력치 합 ${LADDER_REQ.total.toLocaleString()} 이상부터`;
  return null;
}
export function playLadder(s: RookieState) {
  const lock = ladderLocked(s);
  if (lock) throw new RookieError(lock);
  useSlots(s, 1);
  let opp = ladderOpp(s.ladder.score);
  // 점수가 너무 먼 상대는 다시
  for (let i = 0; i < 4 && Math.abs((opp.ladder ?? s.ladder.score) - s.ladder.score) > 300; i++) opp = ladderOpp(s.ladder.score);
  // 라이벌과 점수가 비슷하면 가끔 만남
  const rv = rivalOpp(s);
  if (Math.abs((rv.ladder ?? 0) - s.ladder.score) < 350 && rand() < 0.12) opp = rv;
  const pool = ladderPool(s);
  const mapId = pick(pool.sel.length ? pool.sel : pool.maps);
  const g = playOne(s, opp, mapId, "래더");
  const won = g.winner === "a";
  const exp = 1 / (1 + Math.pow(10, ((opp.ladder ?? s.ladder.score) - s.ladder.score) / 400));
  const before = s.ladder.score;
  s.ladder.score = Math.max(800, Math.round(s.ladder.score + 32 * ((won ? 1 : 0) - exp)));
  s.ladder.best = Math.max(s.ladder.best, s.ladder.score);
  s.ladder[won ? "w" : "l"]++;
  g.fx.ladder = [before, s.ladder.score];
  mark(s, "⚔️", won);
  log(s, won ? "⚔️" : "💧", `래더 vs ${opp.pro ? `${PRO_TEAMS[opp.pro.team]?.short} ` : opp.semipro ? "준프로 " : ""}${opp.name} ${won ? "승리" : "패배"} (${before}→${s.ladder.score} · ${ladderGrade(s.ladder.score)})`);
  gainExp(s, won ? (opp.pro ? 25 : 15) : 5);
  // 래더 승리 수당: 점수가 높을수록 많이 (프로를 이기면 두 배)
  if (won) {
    const prize = (1 + Math.round(Math.max(0, s.ladder.score - 1300) / 250)) * (opp.pro ? 2 : 1);
    s.money += prize;
    g.fx.money = (g.fx.money ?? 0) + prize;
  }
  if (s.clan) s.clan.points = Math.max(0, s.clan.points + (won ? 5 : -3));
  if (won) {
    s.fame += opp.pro ? 8 : 2;
    s.counts.ladderW++;
    if (opp.pro) { s.counts.proBeaten++; fan(s, "proBeat", opp.name); }
  }
  // 프로를 이기면 그 팀에서 입단 테스트 제의 (아직 프로가 아니면)
  // (무소속 프로를 이겼을 때는 입단 제의 없음)
  // 준프로이면서 능력치가 입단 기준 이상일 때만 (아마추어는 인지도만)
  if (won && opp.pro && opp.pro.team < 12 && s.status === "semipro" && sumStats(s.stats) >= TRYOUT_MIN && rand() < 0.15 && !s.tryouts.some(t => t.team === opp.pro!.team)) {
    s.tryouts.push({ team: opp.pro.team, until: s.day + 14, from: `래더에서 ${opp.name} 선수를 꺾음` });
    notify(s, "agent", "입단 테스트 담당자", `${ORIG_TEAMS[opp.pro.team].name} 입단 테스트 제의`, "입단 테스트 제의가 왔습니다. 2주 안에 구단 화면에서 입단 테스트를 치르세요. 이기면 입단합니다.");
    log(s, "📩", `${PRO_TEAMS[opp.pro.team].name}에서 입단 테스트를 제의했습니다! (${opp.name} 선수를 래더에서 이김 · 2주 안에)`);
    mark(s, "📩");
  }
  return g;
}

// ── 휴식 · 방송 · 용돈 ──────────────────────────────────────────
/** 개인 방송: 능력치·인지도·래더가 높을수록 시청자·별풍선이 많음 (2번 분량) */
export function stream(s: RookieState) {
  useSlots(s, 2);
  const total = sumStats(s.stats);
  const base = Math.max(0, (total - 2500) / 9 + s.fame * 0.5 + s.fanCafe.members / 10 + Math.max(0, s.ladder.score - 1500) / 4 + (s.status === "pro" ? 150 : s.status === "semipro" ? 40 : 0));
  const viewers = Math.max(0, Math.round(base * (0.55 + rand() * 0.9) + randInt(0, 6)));
  const balloons = viewers < 15 ? randInt(0, 3) : Math.round(viewers * (0.4 + rand() * 1.6));
  const money = Math.round(balloons / 40);
  s.money += money;
  s.stream.count++;
  s.stream.best = Math.max(s.stream.best, viewers);
  const fans = Math.round(viewers / 25);
  s.stream.fans += fans;
  s.fame = Math.min(1000, s.fame + Math.max(0, Math.round(viewers / 40)));
  s.cond = clampCond(s.cond - 2);
  let mood = "";
  if (viewers < 15) { s.morale = Math.max(0, s.morale - 6); mood = " · 시청자가 거의 없어 사기가 떨어졌습니다"; if (rand() < 0.3) fan(s, "streamFlop"); }
  else if (viewers > 150) { s.morale = Math.min(100, s.morale + 4); mood = " · 반응이 좋아 신이 납니다!"; fan(s, "streamHit", String(viewers)); }
  mark(s, "📺");
  log(s, "📺", `개인 방송: 시청자 ${viewers}명 · 별풍선 ${balloons}개 (+${money}만원)${mood}`);
  return { viewers, balloons, money };
}

/** 아르바이트: 컨디션을 쓰는 대신 돈을 번다 (행동 3) */
export function partTime(s: RookieState) {
  if (s.status === "pro") throw new RookieError("프로게이머는 월급과 수당이 있습니다");
  useSlots(s, 3);
  const money = randInt(14, 26) + Math.round(s.level / 4);
  s.money += money;
  s.cond = clampCond(s.cond - 8);
  s.morale = Math.max(0, s.morale - 1);
  mark(s, "💼");
  log(s, "💼", `PC방 아르바이트로 ${money}만원을 벌었습니다`);
  return { money };
}

/** 부모님 용돈: 2주에 한 번 (프로가 되면 없음) */
export function allowance(s: RookieState) {
  if (s.status === "pro") throw new RookieError("프로게이머는 월급을 받습니다");
  if (s.allowanceDay !== undefined && s.day - s.allowanceDay < 14) throw new RookieError(`용돈은 2주에 한 번 (${14 - (s.day - s.allowanceDay)}일 뒤)`);
  useSlots(s, 1);
  s.allowanceDay = s.day;
  const lecture = s.record.l > s.record.w * 2 && rand() < 0.4;
  const money = lecture ? randInt(2, 5) : randInt(5, 12);
  s.money += money;
  if (lecture) s.morale = Math.max(0, s.morale - 3);
  mark(s, "💵");
  log(s, "💵", lecture ? `부모님: "게임만 하지 말고 공부도 좀 해라…" 용돈 ${money}만원` : `부모님께 용돈 ${money}만원을 받았습니다`);
  return { money };
}

// ── 상점 ───────────────────────────────────────────────────────
/** 능력치 포션을 다시 마시기까지 (일) */
export const POTION_COOLDOWN = 3;
export const rookiePrice = (key: string) => Math.max(1, Math.round((ITEM_BY_KEY[key]?.price ?? 0) * ROOKIE_PRICE));
const SHOP_KINDS = new Set(["stock", "equip", "potion"]);
export function buy(s: RookieState, key: string, qty: number) {
  const it = ITEM_BY_KEY[key];
  if (!it || !SHOP_KINDS.has(it.kind) || it.notForSale) throw new RookieError("살 수 없는 아이템입니다");
  const n = Math.max(1, Math.min(99, Math.floor(qty)));
  const cost = rookiePrice(key) * n;
  if (s.money < cost) throw new RookieError(`돈이 부족합니다 (${cost}만원 필요)`);
  s.money -= cost;
  s.inventory[key] = (s.inventory[key] ?? 0) + n;
  log(s, "🛒", `${it.name} ${n}개 구입 (-${cost}만원)`);
  return { cost };
}
export function useItem(s: RookieState, key: string) {
  const it = ITEM_BY_KEY[key];
  if (!it || !(s.inventory[key] > 0)) throw new RookieError("가진 아이템이 아닙니다");
  if (it.kind === "stock") {
    if (s.vitaToday >= VITA_PER_DAY) throw new RookieError(`회복 아이템은 하루 ${VITA_PER_DAY}개까지`);
    if (s.cond >= COND_MAX) throw new RookieError("컨디션이 이미 최고입니다");
    s.vitaToday++;
    s.cond = clampCond(s.cond + (it.cond ?? 3) * 2);
  } else if (it.kind === "equip") {
    const slot = slotOf(it);
    if (!slot) throw new RookieError("장착할 수 없습니다");
    s.equip[slot] = { key, left: (it.uses ?? 10) * ROOKIE_USES };
  } else if (it.kind === "potion" && it.potion) {
    // 포션은 사흘에 한 번, 성장 한계는 넘지 못함 (돈으로 능력치를 사지 못하게)
    const last = s.flags?.potionDay ?? -99;
    if (s.day - last < POTION_COOLDOWN) throw new RookieError(`능력치 포션은 ${POTION_COOLDOWN}일에 한 번 마실 수 있습니다 (${last + POTION_COOLDOWN - s.day}일 뒤)`);
    (s.flags ??= {}).potionDay = s.day;
    const keys = it.potion.stat ? [it.potion.stat] : [...STAT_KEYS];
    const d: Partial<Stats> = {};
    for (const k of keys) {
      const v = Math.round(randInt(it.potion.min, it.potion.max) * 0.5);
      s.stats[k] = clampStat(s.stats[k] + v);
      d[k] = v;
    }
    let over = sumStats(s.stats) - capOf(s);
    while (over > 0) { const top = [...STAT_KEYS].sort((a, b) => s.stats[b] - s.stats[a])[0]; s.stats[top]--; d[top] = (d[top] ?? 0) - 1; over--; }
    s.cond = clampCond(s.cond - it.potion.condCost);
    s.inventory[key]--;
    log(s, "🧪", `${it.name}: ${Object.entries(d).map(([k, v]) => `${k} ${v! >= 0 ? "+" : ""}${v}`).join(", ")}`);
    return { delta: d };
  } else throw new RookieError("쓸 수 없는 아이템입니다");
  s.inventory[key]--;
  return { ok: true };
}

// ── 이벤트 대회 ────────────────────────────────────────────────
function ensureEvents(s: RookieState) {
  s.events = s.events.filter(e => e.day >= s.day - 30);
  const upcoming = s.events.filter(e => e.day >= s.day && !e.result);
  for (let i = upcoming.length; i < 2; i++) {
    const last = Math.max(s.day, ...s.events.map(e => e.day));
    const day = last + randInt(9, 20);
    if (courageDays(ymd(day).y).includes(day) || draftDay(ymd(day).y) === day) continue;
    // 절반은 내 수준에 맞는 대회 (참가 조건을 채울 수 있게), 나머지는 아무 수준
    const mineTier = [...TIER_ORDER].reverse().find(x => eventReq({ level: x }).total <= sumStats(s.stats)) ?? "newbie";
    const level = rand() < 0.5 ? mineTier : pick<Tier>(["newbie", "low", "low", "mid", "mid", "high", "high", "elite"]);
    const big = level === "high" || level === "elite";
    const size: 8 | 16 = big || rand() < 0.4 ? 16 : 8;
    const first = Math.round((size === 16 ? 36 : 18) * (big ? 2 : 1) * (0.8 + rand() * 0.6));
    // 큰 대회와 절반쯤은 참가비
    const fee = big || rand() < 0.5 ? Math.max(2, Math.round(first * (0.08 + rand() * 0.07))) : 0;
    s.events.push({ id: s.nextEventId++, name: pick(EVENT_NAMES), day, size, prize: [first, Math.round(first * 0.5), Math.round(first * 0.25)], level, ...(fee ? { fee } : {}) });
  }
  s.events.sort((a, b) => a.day - b.day);
}

/** 대회 참가 조건을 못 채웠으면 그 이유 */
export function eventLocked(s: RookieState, e: RookieEvent): string | null {
  const r = eventReq(e);
  if (sumStats(s.stats) < r.total) return `능력치 합 ${r.total.toLocaleString()} 이상만 참가 가능`;
  if (r.ladder && s.ladder.best < r.ladder) return `래더 ${r.ladder}점(${ladderGrade(r.ladder)}) 이상 달성한 선수만`;
  return null;
}
export function registerEvent(s: RookieState, id: number) {
  const e = s.events.find(x => x.id === id);
  if (!e || e.day < s.day || e.result) throw new RookieError("신청할 수 없는 대회입니다");
  if (!e.registered) {
    const lock = eventLocked(s, e);
    if (lock) throw new RookieError(lock);
    if (s.clan && warAt(s, e.day)) throw new RookieError("그날은 클랜전이 있습니다");
    if (s.team) throw new RookieError("프로게이머는 아마추어 대회에 나갈 수 없습니다");
    if (e.fee) {
      if (s.money < e.fee) throw new RookieError(`참가비 ${e.fee}만원이 부족합니다`);
      s.money -= e.fee;
      log(s, "🎫", `${e.name} 참가 신청 (참가비 ${e.fee}만원)`);
    }
    e.registered = true;
  } else {
    // 취소하면 참가비 돌려받음
    if (e.fee) s.money += e.fee;
    e.registered = false;
  }
  return { registered: e.registered };
}

/** 대회 결과 처리: 상금·인지도·경험치·소식 (상금을 돌려줌) */
function rewardEvent(s: RookieState, e: RookieEvent, place: number) {
  e.result = place <= 3 ? `${place}위` : `${place}강`;
  const prize = place <= 3 ? e.prize[place - 1] : 0;
  s.money += prize;
  if (place <= 3) { s.fame += [30, 15, 8][place - 1]; s.titles.unshift(`${dateText(s.day)} ${e.name} ${place === 1 ? "우승" : place === 2 ? "준우승" : "3위"}`); }
  if (place === 1) s.counts.eventWins++;
  if (place <= 2) pressConference(s, e.name, place === 1);
  gainExp(s, place === 1 ? 150 : place === 2 ? 90 : place === 3 ? 60 : 20);
  if (s.clan) s.clan.points += place === 1 ? 30 : place <= 3 ? 15 : 3;
  fan(s, place === 1 ? "eventWin" : place <= 3 ? "eventPodium" : "eventOut", e.name);
  log(s, "🏆", `${e.name}: ${e.result}${prize ? ` · 상금 ${prize}만원` : ""}`);
  return prize;
}

// ── 커리지 매치 · 드래프트 · 입단 테스트 ────────────────────────
export function courageToday(s: RookieState) { return courageDays(ymd(s.day).y).includes(s.day); }
export function draftToday(s: RookieState) { return draftDay(ymd(s.day).y) === s.day; }

/** 커리지 매치 결과 처리: 우승하면 준프로 */
function rewardCourage(s: RookieState, place: number) {
  let note = "";
  if (place <= 2) pressConference(s, "커리지 매치", place === 1);
  if (place === 1) {
    s.status = "semipro";
    s.semiproUntil = s.day + SEMIPRO_DAYS;
    (s.milestones ??= {}).semipro ??= s.day;
    s.fame += 40;
    s.titles.unshift(`${dateText(s.day)} 커리지 매치 우승`);
    note = " — 준프로 자격 획득! (2년 동안 드래프트 참가 가능)";
    if (sumStats(s.stats) >= TRYOUT_MIN) {
      const t = pick(PRO_TEAMS);
      s.tryouts.push({ team: t.id, until: s.day + 14, from: "커리지 매치 우승" });
      notify(s, "agent", "입단 테스트 담당자", `${ORIG_TEAMS[t.id].name} 입단 테스트 제의`, "입단 테스트 제의가 왔습니다. 2주 안에 구단 화면에서 입단 테스트를 치르세요. 이기면 입단합니다.");
      note += ` · ${t.name}에서 입단 경기 제의!`;
    }
  }
  log(s, "🎓", `커리지 매치 ${place === 1 ? "우승" : place <= 3 ? `${place}위` : `${place}강`}${note}`);
  fan(s, place === 1 ? "courageWin" : "courageLose");
  gainExp(s, place === 1 ? 300 : 40);
}

/** 드래프트: 준프로 16명 스위스 4라운드 → 상위 8명을 구단이 지명할 수도 */
export function playDraft(s: RookieState) {
  if (!draftToday(s)) throw new RookieError("오늘은 드래프트가 없습니다 (12/27)");
  if (s.status !== "semipro") throw new RookieError("준프로만 드래프트에 나갈 수 있습니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("이미 참가했습니다");
  if (s.used > 0) throw new RookieError("드래프트는 하루 종일 걸립니다 — 다른 일을 하지 않은 날에만 참가할 수 있습니다");
  s.doneDays.push(s.day);
  const used = new Set<string>();
  const field = Array.from({ length: 15 }, () => withCond({ name: nickname(Math.random, used), race: pick(RACES), stats: statsAround(nearMe(s, randInt(5200, 6300), 0.92, 1.15)), semipro: true } as Opp));
  const score = new Map<Opp | "me", number>([["me", 0], ...field.map(o => [o, 0] as [Opp, number])]);
  const games: PlayedGame[] = [];
  for (let r = 0; r < 4; r++) {
    const order = [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)! || rand() - 0.5);
    for (let i = 0; i < order.length; i += 2) {
      const [x, y] = [order[i], order[i + 1]];
      if (x === "me" || y === "me") {
        const opp = (x === "me" ? y : x) as Opp;
        const g = playOne(s, opp, randomMap(), `드래프트 ${r + 1}라운드`);
        games.push(g);
        const won = g.winner === "a";
        score.set(won ? "me" : opp, score.get(won ? "me" : opp)! + 1);
        mark(s, "📋", won);
      } else {
        const w = aiWins(x as Opp, y as Opp) ? x : y;
        score.set(w, score.get(w)! + 1);
      }
    }
  }
  s.used = DAY_SLOTS;
  const ranking = [...score.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "me" ? -0.5 : 0) + rand() - 0.5);
  const rank = ranking.findIndex(([k]) => k === "me") + 1;
  let picked: number | undefined;
  if (rank <= 8) {
    const total = sumStats(s.stats);
    // 지명은 쉽지 않음: 1위도 능력치가 충분해야 (6,500 이상이면 최대) 35% 남짓
    const p = (0.35 - (rank - 1) * 0.04) * Math.max(0.15, Math.min(1, (total - 4500) / 2000)) + Math.min(0.04, s.fame / 10000);
    if (rand() < p) picked = pick(PRO_TEAMS).id;
  }
  if (picked !== undefined) {
    joinTeam(s, picked, "드래프트 지명");
    log(s, "📋", `드래프트 ${rank}위 → ${ORIG_TEAMS[picked].name}에 지명되었습니다! 🎉`);
    fan(s, "draftPick", ORIG_TEAMS[picked].name);
    gainExp(s, 300);
  } else { log(s, "📋", `드래프트 ${rank}위${rank <= 8 ? " — 상위 8명에 들었지만 지명받지 못했습니다" : ""}`); fan(s, "draftMiss"); }
  return { games, rank, team: picked };
}

/** 입단 테스트: 그 팀 2군 선수와 3판 2선승 */
export function playTryout(s: RookieState, team: number) {
  const t = s.tryouts.find(x => x.team === team && x.until >= s.day);
  if (!t) throw new RookieError("받은 입단 테스트가 아닙니다");
  if (s.status === "pro") throw new RookieError("이미 프로게이머입니다");
  useSlots(s, 3);
  const opp: Opp = withCond({ name: withTag(nickname(), ORIG_TEAMS[team].short), real: "2군 선수", race: pick(RACES), stats: statsAround(nearMe(s, randInt(5600, 6400), 0.95, 1.15)) });
  const res = series(s, opp, 2, `${ORIG_TEAMS[team].name} 입단 테스트`);
  s.tryouts = s.tryouts.filter(x => x !== t);
  for (const g of res.games) mark(s, "📝", g.winner === "a");
  if (res.won) {
    joinTeam(s, team, "입단 테스트 통과");
    log(s, "📝", `${ORIG_TEAMS[team].name} 입단 테스트 통과! 프로게이머가 되었습니다 🎉`);
    fan(s, "join", ORIG_TEAMS[team].name);
  } else log(s, "📝", `${ORIG_TEAMS[team].name} 입단 테스트에서 떨어졌습니다`);
  return { games: res.games, won: res.won };
}

function joinTeam(s: RookieState, team: number, how: string) {
  s.status = "pro";
  (s.milestones ??= {}).pro ??= s.day;
  delete s.semiproUntil;
  s.team = { team, squad: 2, joined: s.day, salary: 40, monthW: 0, monthL: 0, contractUntil: contractEnd(s.day), squadSince: s.day };
  delete s.fa;
  delete s.nego;
  s.tryouts = [];
  s.offers = [];
  s.fame += 50;
  s.titles.unshift(`${dateText(s.day)} ${ORIG_TEAMS[team].name} 입단 (${how})`);
  mark(s, "🏢");
  gainExp(s, 300);
  revealTrait(s, "코치 첫인상");
}

// ── 라이벌 ─────────────────────────────────────────────────────
function rivalCap(r: Rival) {
  if (r.status === "pro") return r.squad === 1 ? STAT_CAP.pro1 : STAT_CAP.pro2;
  return r.status === "semipro" ? STAT_CAP.semipro : STAT_CAP.amateur;
}
export function rivalLadder(r: Rival) { return Math.max(1200, Math.round(ladderScoreOf(sumStats(r.stats)))); }
export function rivalOpp(s: RookieState): Opp {
  const r = s.rival;
  return withCond({ name: r.name, race: r.race, stats: { ...r.stats }, semipro: r.status === "semipro", rival: true, ladder: rivalLadder(r) });
}
/** 라이벌의 하루: 꾸준히 성장, 커리지 매치·드래프트·승강전도 스스로 */
function rivalDay(s: RookieState, prevDay: number) {
  const r = s.rival;
  const total = sumStats(r.stats);
  const room = Math.max(0, Math.min(1, (rivalCap(r) - total) / 700));
  const gain = Math.round(randInt(0, 15) * room);
  const w = CONCEPTS[r.concept].weights;
  for (let i = 0; i < gain; i++) {
    const k = rand() < 0.5 ? pick([...STAT_KEYS]) : pick(STAT_KEYS.filter(x => (w[x] ?? 1) > 1).concat(STAT_KEYS[0]));
    r.stats[k] = clampStat(r.stats[k] + 1);
  }
  const y = ymd(prevDay).y;
  if (r.status !== "pro" && courageDays(y).includes(prevDay)) {
    // 내가 우승했으면 라이벌은 우승 못 함
    const meWon = s.titles.some(t => t.startsWith(dateText(prevDay)) && t.includes("커리지 매치 우승"));
    if (!meWon && rand() < Math.max(0.01, Math.min(0.12, (sumStats(r.stats) - 3700) / 6000))) {
      r.status = "semipro";
      r.semiproUntil = prevDay + SEMIPRO_DAYS;
      log(s, "⚡", `라이벌 ${r.name}이(가) 커리지 매치에서 우승해 준프로가 되었습니다!`);
      s.morale = Math.max(0, s.morale - 3);
    }
  }
  if (r.status === "semipro" && draftDay(y) === prevDay && rand() < Math.min(0.7, sumStats(r.stats) / 7000)) {
    const t = pick(PRO_TEAMS);
    r.status = "pro"; r.team = t.id; r.squad = 2; delete r.semiproUntil;
    log(s, "⚡", `라이벌 ${r.name}이(가) 드래프트에서 ${t.name}에 지명되었습니다!`);
  }
  if (r.status === "semipro" && r.semiproUntil !== undefined && prevDay > r.semiproUntil) { r.status = "amateur"; delete r.semiproUntil; }
  if (r.status === "pro" && r.squad === 2 && isMonthEnd(prevDay) && sumStats(r.stats) > 5200 && rand() < 0.35) {
    r.squad = 1;
    log(s, "⚡", `라이벌 ${r.name}이(가) ${ORIG_TEAMS[r.team!].short} 1군으로 승격했습니다`);
  }
}

export type BatchKind = "lobby" | "ladder" | "clan" | "internal" | "friendly";
/**
 * 남은 행동만큼 한 번에 (중계 없이). 하다가 조건이 안 되면 거기서 멈춤
 * 결과: 몇 판 · 승패 · 능력치 변화 · 컨디션 · 래더/클랜 점수 · 레벨
 */
export function batch(s: RookieState, kind: BatchKind, opts: { tier?: Tier; mapId?: number; max?: number; /** 처음 몇 판은 중계로 볼 수 있게 (최대 3) */ watch?: number } = {}) {
  if (s.retired) throw new RookieError(s.retired);
  const left = DAY_SLOTS - s.used;
  if (left < 1) throw new RookieError("오늘은 더 할 수 없습니다. 다음 날로 넘어가세요");
  const n = Math.max(1, Math.min(left, opts.max ?? left));
  const before = { stats: { ...s.stats }, cond: s.cond, ladder: s.ladder.score, clan: s.clan?.points, level: s.level, exp: s.exp, rank: clanRank(s) };
  const tier = opts.tier ?? s.lobbyPref?.tier ?? "low";
  const mapId = opts.mapId ?? s.lobbyPref?.mapId ?? 0;
  if (kind === "lobby") { if (!TIERS[tier]) throw new RookieError("방을 고르세요"); s.lobbyPref = { tier, mapId }; }
  const results: Array<{ won: boolean; opp: string; map: string }> = [];
  const watched: PlayedGame[] = [];
  const watchN = Math.max(0, Math.min(3, opts.watch ?? 0));
  let stop: string | undefined;
  try {
    for (let i = 0; i < n; i++) {
      QUIET = i >= watchN;
      try {
        let g: PlayedGame;
        if (kind === "lobby") g = playLobby(s, tier, mapId);
        else if (kind === "ladder") g = playLadder(s);
        else if (kind === "clan") g = clanPractice(s);
        else if (kind === "friendly") g = friendlyGame(s);
        else g = playInternal(s);
        if (i < watchN) watched.push(g);
        results.push({ won: g.winner === "a", opp: g.opp.real ? `${g.opp.name}(${g.opp.real})` : g.opp.name, map: mapView(g.mapId).name });
      } catch (e) {
        if (e instanceof RookieError) { stop = e.message; break; }
        throw e;
      }
    }
  } finally { QUIET = false; }
  if (!results.length) throw new RookieError(stop ?? "진행할 수 없습니다");
  const stats: Partial<Stats> = {};
  for (const k of STAT_KEYS) if (s.stats[k] !== before.stats[k]) stats[k] = s.stats[k] - before.stats[k];
  const w = results.filter(r => r.won).length;
  return {
    kind, count: results.length, w, l: results.length - w, results, stats,
    cond: [before.cond, s.cond] as [number, number],
    ladder: kind === "ladder" ? [before.ladder, s.ladder.score] as [number, number] : undefined,
    clan: s.clan && before.clan !== undefined ? { points: [before.clan, s.clan.points] as [number, number], rank: [before.rank, clanRank(s)] as [number, number] } : undefined,
    level: [before.level, s.level] as [number, number],
    stop,
    games: watched.length ? watched : undefined,
  };
}

/** 클랜 하루: 다른 클랜원도 점수를 쌓고, 프로 클랜원이 상위권 아마추어를 구단에 추천하기도 */
// ── 업적 ─────────────────────────────────────────────────────
/** 새로 달성한 업적 (인지도 +10씩) */
export function checkAchievements(s: RookieState): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] !== undefined || !a.check(s)) continue;
    s.achievements[a.id] = s.day;
    s.fame += 10;
    gainExp(s, 30);
    log(s, a.icon, `업적 달성: ${a.name} — 칭호 「${a.title}」를 얻었습니다`);
    mark(s, "🏅");
    out.push(a.id);
  }
  return out;
}
export function setTitle(s: RookieState, id: string | null) {
  if (id === null) { delete s.title; return { ok: true }; }
  if (s.achievements[id] === undefined) throw new RookieError("아직 얻지 못한 칭호입니다");
  s.title = id;
  return { ok: true };
}

// ── 다음 날 ───────────────────────────────────────────────────
/**
 * 능력치가 떨어지는 흐름
 * - 감각: 4일 넘게 경기를 안 하면 가끔 능력치 하나 -1
 * - 정체기: 매달 8% 확률로 슬럼프 (1~2주)
 * - 나이: 데뷔 8년째부터 매달 조금씩 (해마다 더 많이)
 */
function decline(s: RookieState) {
  const idle = s.day - (s.flags?.lastGame ?? s.day);
  if (idle >= 4 && rand() < 0.4) { const k = pick([...STAT_KEYS]); s.stats[k] = clampStat(s.stats[k] - 1); }
  if (ymd(s.day).d !== 1) return;
  if (!s.form && s.day - (s.flags?.slumpEnd ?? -99) >= 20 && rand() < 0.08) {
    s.form = { kind: "slump", until: s.day + randInt(7, 14) };
    s.morale = Math.max(0, s.morale - 5);
    log(s, "😶", "이유 없이 손이 안 풀립니다… 정체기에 빠졌습니다 (1~2주 · 경기력↓ · 지면 더 떨어짐)");
  }
  const years = s.day / 365;
  if (years >= 7) {
    const n = Math.round((years - 6) * randInt(2, 5));
    for (let i = 0; i < n; i++) { const k = pick([...STAT_KEYS]); s.stats[k] = clampStat(s.stats[k] - 1); }
    if (n) log(s, "⌛", `데뷔 ${Math.floor(years) + 1}년째, 반응 속도가 조금씩 떨어집니다 (능력치 -${n})`);
  }
}

/** 하루가 지날 때 몸 관리: 피로가 풀리고, 많이 지쳐 있으면 부상 위험 */
function bodyCare(s: RookieState) {
  s.fatigue = Math.max(0, Math.round(((s.fatigue ?? 0) - FATIGUE.daily) * 10) / 10);
  if (s.injury && s.day > s.injury.until) {
    log(s, "💪", `${s.injury.name}이(가) 다 나았습니다`);
    delete s.injury;
  }
  const f = s.fatigue;
  if (!s.injury && f >= FATIGUE.risk && rand() < (f - FATIGUE.risk + 5) * 0.006) {
    const name = pick([...INJURIES]);
    const days = randInt(3, 7) + (f >= 90 ? 3 : 0);
    s.injury = { until: s.day + days - 1, name };
    s.morale = Math.max(0, s.morale - 6);
    notify(s, s.team ? "coach" : "family", s.team ? "팀 트레이너" : "부모님", `부상: ${name}`,
      `무리한 연습으로 ${name}이(가) 생겼습니다. ${days}일 동안 연습 경기를 할 수 없고, 큰 경기에 나가도 경기력이 떨어집니다. 푹 쉬세요.`);
    log(s, "🩹", `부상: ${name} (${days}일)`);
  } else if (!s.injury && f >= FATIGUE.risk - 10 && (s.flags?.fatigueWarn ?? -99) < s.day - 14) {
    (s.flags ??= {}).fatigueWarn = s.day;
    notify(s, s.team ? "coach" : "family", s.team ? "팀 트레이너" : "부모님", "너무 무리하고 있어요",
      `피로가 ${Math.round(f)}까지 쌓였습니다. 경기력이 떨어지고 있고, ${FATIGUE.risk}을 넘으면 부상 위험이 생깁니다. 하루 쉬는 걸 고려하세요.`);
  }
}

export function nextDay(s: RookieState) {
  if (s.retired) throw new RookieError(s.retired);
  // 오늘 1군 프로리그 엔트리였는데 안 했으면 자동으로 치름
  if (inEntry(s) && !s.doneDays.includes(s.day)) playProleague(s, true);
  else benchDay(s);
  s.day++;
  s.used = 0;
  s.vitaToday = 0;
  s.cond = clampCond(s.cond + 15);
  // 사기는 하루마다 60 쪽으로 (오래 바닥에 머물지 않게)
  s.morale = Math.round(s.morale + (60 - s.morale) * 0.1);
  s.doneDays = s.doneDays.filter(d => d >= s.day - 2);
  rivalDay(s, s.day - 1);
  clanDay(s, s.day - 1);
  s.history.push([s.day, sumStats(s.stats)]);
  if (s.history.length > 400) s.history.splice(0, s.history.length - 400);
  // 프로리그 시즌 끝 (6/30 · 12/31): 소속팀 우승?
  const pd = ymd(s.day - 1);
  if (s.team && ((pd.m === 6 && pd.d === 30) || (pd.m === 12 && pd.d === 31))) {
    const t = s.team;
    const w = t.seasonW ?? 0, l = t.seasonL ?? 0;
    const p = Math.min(0.4, Math.max(0.05, 0.09 + (w - l) * 0.015 + (t.squad === 1 ? 0.03 : 0)));
    const season = `${pd.y} ${pd.m === 6 ? "전기" : "후기"}`;
    if (rand() < p) {
      s.titles.unshift(`${season} 프로리그 우승 (${ORIG_TEAMS[t.team].name})`);
      s.fame += 40;
      s.money += 100;
      log(s, "🏆", `${ORIG_TEAMS[t.team].name}이(가) ${season} 프로리그에서 우승했습니다! 우승 보너스 100만원 (내 시즌 전적 ${w}승 ${l}패)`);
      fan(s, "plWin", "프로리그 결승");
      gainExp(s, t.squad === 1 ? 600 : 250);
    } else log(s, "🏟️", `${season} 프로리그 종료 · 내 시즌 전적 ${w}승 ${l}패`);
    t.seasonW = 0; t.seasonL = 0;
  }
  // 슬럼프·각성 끝
  if (s.form && s.day > s.form.until) {
    if (s.form.kind === "slump") (s.flags ??= {}).slumpEnd = s.day;
    log(s, s.form.kind === "slump" ? "🌤️" : "🦅", s.form.kind === "slump" ? "슬럼프에서 조금씩 벗어났습니다" : "각성 기운이 가라앉았습니다");
    delete s.form;
  }
  // 팬카페: 인지도를 따라 회원이 천천히 늘거나 줄고, 회원이 많으면 인지도도 조금씩
  const target = s.fame * 2 + s.stream.fans;
  s.fanCafe.members = Math.max(0, s.fanCafe.members + Math.round((target - s.fanCafe.members) * 0.03));
  if (s.fanCafe.members >= 300 && rand() < 0.3) s.fame = Math.min(1000, s.fame + 1);
  const x = ymd(s.day);
  // 인지도가 쌓이면 후원 (매달 1일)
  if (ymd(s.day).d === 1 && s.fame >= 50 && s.status !== "pro") {
    const sponsor = Math.min(30, Math.round(s.fame / 20));
    s.money += sponsor;
    log(s, "🤝", `인지도 ${s.fame}: 후원금 ${sponsor}만원이 들어왔습니다`);
  }
  // 월급 (매달 1일)
  if (s.team && x.d === 1) { s.money += s.team.salary; s.team.monthW = 0; s.team.monthL = 0; log(s, "💰", `월급 ${s.team.salary}만원 (${ORIG_TEAMS[s.team.team].name})`); }
  if (x.d === 1) { monthlySquad(s, ymd(s.day - 1).m); squadReview(s); }
  if (s.team?.loan && s.day > s.team.loan.until) loanReturn(s);
  // 코치 신뢰도는 매주 조금씩 50 쪽으로
  if (s.team && x.dow === 0) s.team.trust = Math.round(trustOf(s) + (50 - trustOf(s)) * 0.05);
  // 계약 만료 → 연봉 협상 (기한 안에 답이 없으면 구단 제시액으로)
  if (s.team && !s.nego && s.day > (s.team.contractUntil ?? Infinity)) startNego(s);
  if (s.nego && s.day > s.nego.until) signContract(s, s.nego.offer, "답을 미루다");
  // FA: 가끔 구단에서 연락, 기한이 지나면 준프로로
  if (s.fa) {
    if (rand() < Math.min(0.5, Math.max(0.05, (sumStats(s.stats) - 4300) / 3000 + s.fame / 3000) * (agentOf(s)?.offers ?? 1))) {
      const t = pick(PRO_TEAMS.filter(t => !s.offers.some(o => o.team === t.id)));
      if (t) {
        const salary = Math.round(marketValue(s) * (0.7 + rand() * 0.35));
        s.offers.push({ team: t.id, salary, until: s.day + 7 });
        notify(s, "agent", `${ORIG_TEAMS[t.id].short} 스카우트`, `${ORIG_TEAMS[t.id].name} 영입 제안`, `월급 ${salary}만원으로 영입하고 싶다는 제안입니다. 일주일 안에 구단 화면에서 결정하세요.`);
        log(s, "📨", `FA 영입 제안: ${t.name} 월급 ${salary}만원 (일주일 안에 결정)`);
      }
    }
    if (s.day > s.fa.until) {
      delete s.fa;
      s.status = "semipro";
      s.semiproUntil = s.day + SEMIPRO_DAYS;
      s.offers = [];
      log(s, "⌛", "FA 기간이 끝나 준프로로 돌아갔습니다. 드래프트·입단 테스트로 다시 도전하세요");
    }
  }
  // 프로: 가끔 다른 구단에서 스카웃 제안
  // 프로: 가끔 다른 구단에서 스카웃 제안 (입단·이적 뒤 반년은 없음, 많아야 달마다 20%)
  if (s.team && !s.team.loan && x.d === 15 && !transferLocked(s) && rand() < Math.min(0.2, ((sumStats(s.stats) - 5500) / 4000 + s.fame / 8000) * (agentOf(s)?.offers ?? 1))) {
    const t = pick(PRO_TEAMS.filter(t => t.id !== s.team!.team));
    // 제안 월급은 지금 월급이 아니라 시장 가치 기준 (이적을 반복해 월급이 불어나지 않게)
    const salary = Math.round(marketValue(s) * (1 + rand() * 0.25));
    s.offers.push({ team: t.id, salary, until: s.day + 7 });
    notify(s, "agent", `${ORIG_TEAMS[t.id].short} 스카우트`, `${ORIG_TEAMS[t.id].name} 영입 제안`, `월급 ${salary}만원으로 영입하고 싶다는 제안입니다. 일주일 안에 구단 화면에서 결정하세요.`);
    log(s, "📨", `${t.name}에서 스카웃 제안! 월급 ${salary}만원 (일주일 안에 결정)`);
  }
  bodyCare(s);
  decline(s);
  // 준프로 기간이 얼마 안 남았으면 미리 알림 (90·30·7일 전)
  if (s.status === "semipro" && s.semiproUntil !== undefined) {
    const left = s.semiproUntil - s.day;
    if (left === 90 || left === 30 || left === 7) {
      const draft = draftDay(ymd(s.day).y) >= s.day && draftDay(ymd(s.day).y) <= s.semiproUntil;
      notify(s, "agent", "에이전트 (준프로 관리)", `준프로 자격 ${left}일 남음`,
        `준프로 자격이 ${dateText(s.semiproUntil)}에 끝납니다.${draft ? " 올해 드래프트가 사실상 마지막 기회일 수 있습니다." : ""} 그 전에 드래프트에 뽑히거나 입단 테스트를 통과하지 못하면 아마추어로 돌아가 커리지 매치부터 다시 해야 합니다.`);
      log(s, "⏳", `준프로 자격 ${left}일 남음`);
    }
  }
  // 준프로 기간 끝
  if (s.status === "semipro" && s.semiproUntil !== undefined && s.day > s.semiproUntil) {
    s.status = "amateur";
    delete s.semiproUntil;
    log(s, "⌛", "준프로 자격(2년)이 끝났습니다. 다시 커리지 매치에서 우승해야 합니다");
  }
  // 매주 일요일: 코치(프로) 또는 클랜장이 성격 리포트 (절반 확률) · 야망이 크면 인지도가 조금씩
  if (x.dow === 0) {
    if ((s.team || s.clan) && rand() < 0.5) { revealTrait(s, s.team ? "코치" : "클랜장"); s.reportDay = s.day; }
    const amb = s.persona?.amb ?? 10;
    if (amb >= 14) s.fame = Math.min(1000, s.fame + Math.round((amb - 12) / 3));
  }
  s.tryouts = s.tryouts.filter(t => t.until >= s.day);
  s.offers = s.offers.filter(o => o.until >= s.day);
  ensureEvents(s);
  // 새해: 지난해 목표 평가·또래 시상 → 올해 목표
  if (x.m === 1 && x.d === 1) { yearReview(s); ensureGoals(s); }
  checkGoals(s);
  // 매주 일요일: 또래 세계가 움직임
  if (x.dow === 0) weeklyWorld(s);
  // 메일함: 기한 지난 답장은 자동 처리, 새 메일 (하루 한 통 확률)
  expireMails(s);
  dailyMail(s);
  // 알림: 오늘 일정
  if (courageToday(s) && s.status !== "pro") log(s, "🎓", "오늘은 커리지 매치 날입니다!");
  if (draftToday(s) && s.status === "semipro") log(s, "📋", "오늘은 드래프트 날입니다!");
  for (const e of s.events.filter(e => e.day === s.day && e.registered)) log(s, "🏆", `오늘은 ${e.name} 날입니다 (참가 신청함)`);
  return { day: s.day };
}

// ── 일정: 직접 고르는 날(선택일) · 자동 진행 ─────────────────────
/**
 * 하루는 활동 하나로 끝난다. 일주일(일~토)에 직접 고르는 날은 2번 (대회·커리지 매치 같은 이벤트도 여기 포함),
 * 나머지 날은 휴식과 연습을 알아서 하며 지나간다.
 */
export type StopKind = "event" | "free";
/** 직접 나가야 하는 이벤트가 있는 날인지 (대회·커리지 매치·드래프트·팀 내 승강전) */
export function eventStop(s: RookieState, day: number): "event" | "courage" | "draft" | "promo" | "war" | null {
  if (s.events.some(e => e.day === day && e.registered && !e.result)) return "event";
  if (warAt(s, day)) return "war";
  const y = ymd(day).y;
  if (s.status !== "pro" && courageDays(y).includes(day) && !s.doneDays.includes(day)) return "courage";
  if (s.status === "semipro" && draftDay(y) === day && !s.doneDays.includes(day)) return "draft";
  if (s.team && isMonthEnd(day) && !s.doneDays.includes(day) && promoDue(s)) return "promo";
  return null;
}
/** 이벤트가 없는 주에 직접 고르게 되는 요일 (수·토 먼저). 맨 처음 주는 월·목 */
const FREE_PREF = [3, 6, 1, 5, 2, 4, 0];
const FIRST_WEEK_PREF = [1, 4, 2, 5, 3, 6];
/** 그 주(일~토)에서 직접 고르는 날들 */
export function weekStops(s: RookieState, day: number): Array<{ day: number; kind: StopKind }> {
  const ws = weekStartOf(day);
  const days = Array.from({ length: 7 }, (_, i) => ws + i).filter(d => d >= 0);
  // 이미 도착한 선택일(오늘 포함)은 그대로, 앞으로의 날만 새로 계산 (중간에 대회를 신청해도 선택 횟수는 2번)
  const frozen = days.filter(d => d <= s.day && s.stopLog?.[d]);
  const future = days.filter(d => d > s.day || !s.stopLog?.[d] && d === s.day);
  const ev = future.filter(d => eventStop(s, d));
  const out: Array<{ day: number; kind: StopKind }> = [
    ...frozen.map(d => ({ day: d, kind: s.stopLog![d] as StopKind })),
    ...ev.filter(d => !frozen.includes(d)).map(d => ({ day: d, kind: "event" as const })),
  ];
  const pref = ws < 0 ? FIRST_WEEK_PREF : FREE_PREF;
  for (const dow of pref) {
    if (out.length >= WEEK_PICKS) break;
    const d = future.find(x => ymd(x).dow === dow);
    if (d !== undefined && !ev.includes(d) && !frozen.includes(d)) out.push({ day: d, kind: "free" });
  }
  return out.sort((a, b) => a.day - b.day);
}
/** 오늘이 직접 고르는 날이면 기록 (그 주의 선택 횟수에 셈) */
function noteStop(s: RookieState) {
  const k = stopKind(s, s.day);
  if (k) (s.stopLog ??= {})[s.day] = k;
  // 오래된 기록은 정리
  if (s.stopLog) for (const d of Object.keys(s.stopLog)) if (Number(d) < s.day - 30) delete s.stopLog[Number(d)];
}
export const stopKind = (s: RookieState, day: number): StopKind | null => weekStops(s, day).find(x => x.day === day)?.kind ?? null;
/** 앞으로 직접 고르는 날들 (오늘부터 n일) */
export function upcomingStops(s: RookieState, n = 21) {
  const out: Array<{ day: number; kind: StopKind }> = [];
  for (let d = s.day; d < s.day + n; d += 1) {
    const k = stopKind(s, d);
    if (k) out.push({ day: d, kind: k });
  }
  return out;
}

/** 하루 리포트 (직접 한 날 · 자동으로 지나간 날) */
export interface DayReport {
  day: number;
  mode: "chosen" | "auto" | "event";
  title: string;
  w: number; l: number;
  stats: Partial<Stats>;
  cond: [number, number];
  money: number;
  notes: string[];
}
export type Snap = { stats: Stats; cond: number; money: number; w: number; l: number; top?: RookieState["log"][number] };
const snapOf = (s: RookieState): Snap => ({ stats: { ...s.stats }, cond: s.cond, money: s.money, w: s.record.w, l: s.record.l, top: s.log[0] });
function reportOf(s: RookieState, b: Snap, day: number, mode: DayReport["mode"], title: string): DayReport {
  const stats: Partial<Stats> = {};
  for (const k of STAT_KEYS) if (s.stats[k] !== b.stats[k]) stats[k] = s.stats[k] - b.stats[k];
  const notes: string[] = [];
  // 여러 번에 나눠 한 날(대회)은 그날 쓴 소식을 모두
  for (const e of s.log) { if (b.top ? e === b.top : e.day < day) break; notes.push(`${e.icon} ${e.text}`); }
  return { day, mode, title, w: s.record.w - b.w, l: s.record.l - b.l, stats, cond: [b.cond, s.cond], money: s.money - b.money, notes: notes.reverse().slice(0, 8) };
}

/** 하루 쉬기: 컨디션을 크게 회복 */
export function restDay(s: RookieState, amount = 35) {
  if (s.retired) throw new RookieError(s.retired);
  const before = s.cond;
  s.cond = clampCond(s.cond + amount);
  s.fatigue = Math.max(0, (s.fatigue ?? 0) - FATIGUE.rest);
  s.morale = Math.min(100, s.morale + 3);
  mark(s, "💤");
  log(s, "💤", `푹 쉬었습니다 (컨디션 ${before}% → ${s.cond}%)`);
  return { cond: [before, s.cond] as [number, number] };
}
/** 자동으로 연습할 방 (직접 고른 방이 없으면 내 실력에 맞는 방) */
function autoTier(s: RookieState): Tier {
  const total = sumStats(s.stats);
  return [...TIER_ORDER].reverse().find(t => (TIERS[t].range[0] + TIERS[t].range[1]) / 2 <= total) ?? "newbie";
}
/** 직접 고르지 않는 날: 지쳤으면 쉬고, 아니면 연습 (공방·래더·클랜·팀 연습 중) */
function autoDay(s: RookieState): string {
  s.used = 0;
  if (s.status !== "pro" && (s.allowanceDay === undefined || s.day - s.allowanceDay >= 14)) { try { allowance(s); } catch { /* 무시 */ } s.used = 0; }
  if (s.cond < 45 || injured(s) || (s.fatigue ?? 0) >= FATIGUE.autoRest) { restDay(s, 30); return injured(s) ? "🩹 치료·휴식" : "💤 휴식"; }
  // 구단 소속 프로는 팀 연습 위주 (공방·래더 없음)
  const kinds: Array<[BatchKind, number]> = s.team ? [] : [["lobby", 5]];
  if (!s.team && !ladderLocked(s)) kinds.push(["ladder", 3]);
  if (s.clan) { kinds.push(["clan", 2]); kinds.push(["friendly", 1]); }
  if (s.team) kinds.push(["internal", 6]);
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total, kind: BatchKind = "lobby";
  for (const [k, w] of kinds) { if ((r -= w) < 0) { kind = k; break; } }
  const pref = s.lobbyPref;
  try {
    batch(s, kind, { max: AUTO_GAMES, tier: pref?.tier ?? autoTier(s), mapId: pref?.mapId ?? randomMap() });
  } finally {
    // 자동 연습이 내가 고른 방·맵을 덮어쓰지 않게
    if (pref) s.lobbyPref = pref; else delete s.lobbyPref;
    s.used = 0;
  }
  return `${{ lobby: "🎮 공방 연습", ladder: "⚔️ 래더", clan: "🛡️ 클랜 연습", internal: "🏢 팀 내부 연습", friendly: "🤝 친선경기" }[kind]} ${AUTO_GAMES}판`;
}

export type Activity =
  | { kind: "lobby"; tier?: Tier; mapId?: number; watch?: number }
  | { kind: "ladder"; watch?: number }
  | { kind: "clan"; target?: string; watch?: number }
  | { kind: "internal"; watch?: number }
  | { kind: "stream" } | { kind: "rest" } | { kind: "work" }
  | { kind: "mentor"; stat: StatKey; pro: number }
  | { kind: "clanTest"; id: string }
  | { kind: "tryout"; team: number }
  | { kind: "friendly"; watch?: number }
  | { kind: "event"; id: number } | { kind: "courage" } | { kind: "draft" } | { kind: "promo" } | { kind: "war" };
const ACT_TITLE: Record<Activity["kind"], string> = {
  lobby: "🎮 공방 연습", ladder: "⚔️ 래더", clan: "🛡️ 클랜 연습", internal: "🏢 팀 내부 연습", stream: "📺 방송", rest: "💤 휴식", work: "💼 아르바이트",
  mentor: "📚 멘토 과외", clanTest: "📝 클랜 입단 시험", tryout: "📝 입단 테스트", event: "🏆 대회", courage: "🎓 커리지 매치", draft: "📋 드래프트", promo: "⬆️ 팀 내 승강전",
  friendly: "🤝 친선경기", war: "⚔️ 클랜전",
};

/**
 * 오늘 할 일 하나를 고르면 오늘이 끝나고, 다음 선택일까지 자동으로 지나간다
 * 결과: 고른 활동의 결과 + 날마다 리포트
 */
/** 실제 하루 선택 횟수를 하나 씀 (다 썼으면 오류) */
export function spendPick(s: RookieState, date: string, limit: number) {
  if (limit <= 0) return;
  if (s.quota?.date !== date) s.quota = { date, used: 0 };
  if (s.quota.used >= limit) throw new RookieError(`오늘 고를 수 있는 ${limit}번을 모두 썼습니다. 내일(한국 시간 자정) 다시 이어서 할 수 있어요`);
  s.quota.used++;
}

/** 구단 소속 프로가 할 수 없는 활동 */
export const PRO_BLOCKED = new Set<Activity["kind"]>(["lobby", "ladder", "stream", "event"]);

export function act(s: RookieState, a: Activity) {
  if (s.retired) throw new RookieError(s.retired);
  if (s.bracket) throw new RookieError("진행 중인 대회가 있습니다. 먼저 끝까지 치르세요");
  if (s.war) throw new RookieError("진행 중인 클랜전이 있습니다. 먼저 끝까지 치르세요");
  const day = s.day;
  const b = snapOf(s);
  s.used = 0;
  let res: Record<string, unknown> = {};
  // 대회·커리지 매치: 대진표를 짜고 시작 (하루는 대회를 마친 뒤에 끝남)
  if (a.kind === "event" || a.kind === "courage") {
    if (a.kind === "event") startEvent(s, a.id); else startCourage(s);
    return { activity: a.kind, title: ACT_TITLE[a.kind], bracket: s.bracket, reports: [] as DayReport[] };
  }
  if (a.kind === "war") {
    startWar(s);
    return { activity: a.kind, title: ACT_TITLE[a.kind], war: s.war, reports: [] as DayReport[] };
  }
  if (s.team && PRO_BLOCKED.has(a.kind)) throw new RookieError("프로게이머는 팀 연습·클랜 활동·휴식 위주로 생활합니다 (공방·래더·방송·아마추어 대회는 할 수 없어요)");
  if (injured(s) && ["lobby", "ladder", "clan", "internal", "friendly"].includes(a.kind)) {
    throw new RookieError(`부상(${s.injury!.name}) 중이라 연습 경기를 할 수 없습니다 (${s.injury!.until - s.day + 1}일 남음). 쉬거나 방송·아르바이트를 하세요`);
  }
  switch (a.kind) {
    case "lobby": case "ladder": case "clan": case "internal": case "friendly": {
      if (a.kind === "clan" && a.target) {
        // 특정 클랜원과 연습: 처음 판은 그 사람, 나머지는 평소처럼
        const first = clanPractice(s, a.target);
        const rest = batch(s, "clan", { max: DAY_GAMES - 1 });
        res = { batch: mergeFirst(first, rest), games: a.watch ? [first] : undefined };
        break;
      }
      const r = batch(s, a.kind, { max: DAY_GAMES, tier: a.kind === "lobby" ? a.tier : undefined, mapId: a.kind === "lobby" ? a.mapId : undefined, watch: a.watch });
      res = { batch: r, games: r.games };
      break;
    }
    case "stream": res = { stream: stream(s) }; break;
    case "rest": res = { rest: restDay(s) }; break;
    case "work": res = { work: partTime(s) }; break;
    case "mentor": res = { mentor: mentor(s, a.stat, a.pro) }; break;
    case "clanTest": { const r = clanTest(s, a.id); res = { games: r.games, won: r.won }; break; }
    case "tryout": { const r = playTryout(s, a.team); res = { games: r.games, won: r.won }; break; }
    case "draft": res = playDraft(s) as unknown as Record<string, unknown>; break;
    case "promo": res = playPromo(s) as unknown as Record<string, unknown>; break;
  }
  s.used = 0;
  // 클랜전 날 다른 걸 골랐으면 불참 (엔트리에 들었으면 기권패)
  if (warAt(s, day)) { autoWar(s); }
  // 오늘 열리는 대회에 신청해 놓고 다른 걸 골랐으면 불참 처리
  for (const e of s.events.filter(x => x.day === day && x.registered && !x.result)) { e.result = "불참"; log(s, "🚫", `${e.name}에 나가지 않았습니다 (불참)`); }
  const reports = endDay(s, b, day, ["draft", "promo"].includes(a.kind) ? "event" : "chosen", ACT_TITLE[a.kind]);
  return { activity: a.kind, title: ACT_TITLE[a.kind], ...res, reports };
}
/** 오늘을 마치고 다음 선택일까지 자동으로 지나감 (날마다 리포트) */
export function endDay(s: RookieState, b: Snap, day: number, mode: DayReport["mode"], title: string): DayReport[] {
  nextDay(s);
  const reports: DayReport[] = [reportOf(s, b, day, mode, title)];
  for (let guard = 0; guard < 15 && !stopKind(s, s.day); guard++) {
    const d = s.day, nb = snapOf(s);
    const t = autoDay(s);
    nextDay(s);
    reports.push(reportOf(s, nb, d, "auto", t));
  }
  noteStop(s);
  return reports;
}

// ── 토너먼트 (대진표를 보고 내 경기를 한 판씩) ───────────────────
function newBracket(s: RookieState, kind: Bracket["kind"], title: string, size: number, field: Opp[], eventId?: number): Bracket {
  const me: Opp = { name: myId(s), race: s.race, stats: { ...s.stats }, cond: s.cond };
  const players = [me, ...field.slice(0, size - 1)].sort(() => rand() - 0.5);
  const first = Array.from({ length: size / 2 }, (_, i) => ({ a: 2 * i, b: 2 * i + 1 }));
  return {
    kind, title, eventId, day: s.day, size, players, me: players.indexOf(me), rounds: [first], round: 0, games: 0,
    before: { stats: { ...s.stats }, cond: s.cond, money: s.money, w: s.record.w, l: s.record.l },
  };
}
/** 신청해 둔 대회를 시작: 대진표를 짬 */
export function startEvent(s: RookieState, id: number) {
  const e = s.events.find(x => x.id === id);
  if (!e || e.day !== s.day) throw new RookieError("오늘 열리는 대회가 아닙니다");
  if (!e.registered) throw new RookieError("참가 신청을 하지 않은 대회입니다");
  if (e.result) throw new RookieError("이미 참가한 대회입니다");
  const r = TIERS[e.level].range;
  const used = new Set<string>();
  const field = Array.from({ length: e.size - 1 }, () => withCond({ name: nickname(Math.random, used), race: pick(RACES), stats: statsAround(nearMe(s, randInt(r[0] + 200, r[1] + 500), 0.88, 1.1)) } as Opp));
  if (s.rival.status !== "pro" && rand() < 0.5) { field[0] = rivalOpp(s); log(s, "⚡", `라이벌 ${s.rival.name}도 ${e.name}에 나왔습니다!`); }
  e.result = "진행 중";
  s.bracket = newBracket(s, "event", e.name, e.size, field, e.id);
  log(s, "🏆", `${e.name} 대진표가 나왔습니다 (${e.size}강)`);
  return s.bracket;
}
/** 월말 커리지 매치를 시작 (32명) */
export function startCourage(s: RookieState) {
  if (!courageToday(s)) throw new RookieError("오늘은 커리지 매치가 없습니다 (매달 마지막 날)");
  if (s.status === "pro") throw new RookieError("프로게이머는 커리지 매치에 나갈 수 없습니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("이미 참가했습니다");
  s.doneDays.push(s.day);
  const used = new Set<string>();
  // 커리지 참가자는 정해진 수준 (4,000~5,200) + 강한 시드 3명 (5,200~5,700): 내가 클수록 우승 가능성이 오름
  const field = Array.from({ length: 31 }, (_, i) => withCond({ name: nickname(Math.random, used), race: pick(RACES), stats: statsAround(i < 3 ? randInt(5200, 5700) : randInt(4000, 5200)) } as Opp));
  if (s.rival.status !== "pro") { field[0] = rivalOpp(s); log(s, "⚡", `라이벌 ${s.rival.name}도 커리지 매치에 나왔습니다!`); }
  s.bracket = newBracket(s, "courage", "커리지 매치", 32, field);
  log(s, "🎓", "커리지 매치 대진표가 나왔습니다 (32강)");
  return s.bracket;
}
/** 내 다음 상대 (대진표에서) */
export function bracketNext(b: Bracket) {
  const round = b.rounds[b.round];
  const m = round?.find(x => x.a === b.me || x.b === b.me);
  if (!m || b.done) return null;
  const oppI = m.a === b.me ? m.b : m.a;
  return { match: m, opp: b.players[oppI], oppIndex: oppI, name: roundName(b.size, b.round), final: round.length === 1 };
}
/**
 * 내 경기 하나를 치르고(결승은 3판 2선승) 같은 라운드의 다른 경기도 진행.
 * 지거나 우승하면 대회가 끝나 하루를 마침
 */
export function bracketPlay(s: RookieState, quick = false) {
  const b = s.bracket;
  if (!b || b.done) throw new RookieError("진행 중인 대회가 없습니다");
  if (s.retired) throw new RookieError(s.retired);
  const nx = bracketNext(b)!;
  const round = b.rounds[b.round];
  const prevQuiet = QUIET;
  if (quick) QUIET = true;
  let res: ReturnType<typeof series>;
  try { res = series(s, nx.opp, nx.final ? 2 : 1, `${b.title} ${nx.name}`); } finally { QUIET = prevQuiet; }
  b.games += res.games.length;
  const mine = res.games.filter(g => g.winner === "a").length;
  nx.match.w = res.won ? b.me : nx.oppIndex;
  nx.match.sets = nx.match.a === b.me ? [mine, res.games.length - mine] : [res.games.length - mine, mine];
  for (const m of round) if (m !== nx.match) m.w = aiWins(b.players[m.a], b.players[m.b], nx.final ? 2 : 1) ? m.a : m.b;
  // 다음 라운드
  const nextRound = (r: BracketMatch[]): BracketMatch[] | null => {
    const ws = r.map(m => m.w!);
    if (ws.length <= 1) return null;
    return Array.from({ length: ws.length / 2 }, (_, i) => ({ a: ws[2 * i], b: ws[2 * i + 1] }));
  };
  const left = b.size / 2 ** b.round;
  if (!res.won) {
    b.place = nx.final ? 2 : left === 4 ? 3 : left;
    // 남은 라운드는 다른 선수끼리 끝까지
    let cur = round;
    for (let nr = nextRound(cur); nr; nr = nextRound(cur)) {
      for (const m of nr) m.w = aiWins(b.players[m.a], b.players[m.b], nr.length === 1 ? 2 : 1) ? m.a : m.b;
      b.rounds.push(nr);
      cur = nr;
    }
    b.champion = cur[cur.length - 1].w;
    b.done = true;
  } else if (nx.final) {
    b.place = 1; b.champion = b.me; b.done = true;
  } else {
    b.rounds.push(nextRound(round)!);
    b.round++;
  }
  for (const g of res.games) mark(s, b.kind === "courage" ? "🎓" : "🏆", g.winner === "a");
  if (!b.done) return { games: res.games, bracket: b, finished: undefined };
  // 대회 끝: 보상 · 하루 마무리
  const before = b.before as Snap;
  const day = b.day;
  let prize = 0;
  if (b.kind === "event") {
    const e = s.events.find(x => x.id === b.eventId)!;
    prize = rewardEvent(s, e, b.place!);
  } else rewardCourage(s, b.place!);
  b.prize = prize;
  const bracket = b;
  delete s.bracket;
  s.used = 0;
  const reports = endDay(s, before, day, "event", b.kind === "courage" ? "🎓 커리지 매치" : `🏆 ${b.title}`);
  return {
    games: res.games, bracket,
    finished: { activity: b.kind, title: b.kind === "courage" ? "🎓 커리지 매치" : `🏆 ${b.title}`, place: b.place!, prize, name: b.title, reports },
  };
}
/** 특정 클랜원과 먼저 한 판 + 이어서 연속 → 하나의 결과로 */
function mergeFirst(first: PlayedGame, r: ReturnType<typeof batch> | null) {
  const won = first.winner === "a";
  const one = { won, opp: first.opp.real ? `${first.opp.name}(${first.opp.real})` : first.opp.name, map: mapView(first.mapId).name };
  if (!r) return { kind: "clan" as const, count: 1, w: won ? 1 : 0, l: won ? 0 : 1, results: [one], stats: first.fx.stats, cond: first.fx.cond, level: [0, 0] as [number, number] };
  const stats: Partial<Stats> = { ...r.stats };
  for (const [k, v] of Object.entries(first.fx.stats)) stats[k as StatKey] = (stats[k as StatKey] ?? 0) + (v ?? 0);
  return { ...r, count: r.count + 1, w: r.w + (won ? 1 : 0), l: r.l + (won ? 0 : 1), results: [one, ...r.results], stats, cond: [first.fx.cond[0], r.cond[1]] as [number, number] };
}

/** 화면용 요약 */
export function todayInfo(s: RookieState) {
  return {
    courage: courageToday(s) && s.status !== "pro" && !s.doneDays.includes(s.day),
    draft: draftToday(s) && s.status === "semipro" && !s.doneDays.includes(s.day),
    proleague: inEntry(s) && !s.doneDays.includes(s.day),
    promo: !!s.team && isMonthEnd(s.day) && !s.doneDays.includes(s.day) && promoDue(s),
    events: s.events.filter(e => e.day === s.day && e.registered && !e.result).map(e => e.id),
    status: s.fa ? "FA" : STATUS_NAMES[s.status],
    grade: ladderGrade(s.ladder.score),
    cap: capOf(s),
    ladderLock: ladderLocked(s),
    ladderMaps: ladderPool(s),
    clanRank: clanRank(s),
    /** 팀 내 입지: 역할·코치 신뢰도·나보다 강한 1군 동료 수 */
    squad: s.team ? { role: myRole(s), trust: trustOf(s), rank: squadRank(s) } : null,
    /** 올해 목표 진행도 · 또래 순위 */
    goals: (s.goals?.list ?? []).map(g => { const [now, target] = goalProgress(s, g); return { text: g.text, done: !!g.done, now, target, reward: g.reward }; }),
    peerRank: s.retired ? 0 : myPeerRank(s),
    /** 몸 상태: 피로 · 부상 (남은 날) · 준프로 남은 날 */
    body: { fatigue: Math.round(s.fatigue ?? 0), injury: injured(s) ? { name: s.injury!.name, left: s.injury!.until - s.day + 1 } : null },
    semiproLeft: s.status === "semipro" && s.semiproUntil !== undefined ? s.semiproUntil - s.day : null,
    /** 프로 생활: 승강전 조건 · 명단 제외 누적 · 이적 가능까지 남은 날 */
    pro: s.team ? { promoDue: promoDue(s), promoReady: promoReady(s), missed: s.team.missed ?? 0, transferIn: transferLocked(s) ? s.team.joined + PRO_RULES.transferLock - s.day : 0, squadDays: s.day - (s.team.squadSince ?? s.team.joined) } : null,
    /** 준프로·FA: 입단 테스트 신청까지 남은 날 */
    applyIn: !s.team && s.status !== "amateur" ? Math.max(0, (s.flags?.applyDay ?? -999) + PRO_RULES.applyCooldown - s.day) : null,
    ...scheduleInfo(s),
  };
}
/** 클랜전 화면용: 일정 · 관계 · 직책 */
function clanWarInfo(s: RookieState) {
  const c = s.clan!;
  const rel = clanRelations(c.id);
  const tenure = s.day - c.joined;
  return {
    schedule: warSchedule(s, 4),
    rival: rel.rival, friend: rel.friend,
    role: c.role ?? null,
    tenure,
    warPlayed: c.warPlayed ?? 0,
  };
}
/** 일정 화면용: 직접 고르는 날 · 신청할 수 있는 대회 */
function scheduleInfo(s: RookieState) {
  const stops = upcomingStops(s, 21);
  const ws = weekStartOf(s.day);
  const thisWeek = weekStops(s, s.day);
  // 구단 소속 프로는 아마추어 대회에 못 나감
  const open = s.team ? 0 : s.events.filter(e => e.day >= s.day && e.day <= s.day + 21 && !e.result && !e.registered && !eventLocked(s, e) && (!e.fee || s.money >= e.fee)).length;
  return {
    stops,
    /** 오늘이 직접 고르는 날인지 (아니면 자동으로 지나가는 날 — 보통은 오늘이 항상 선택일) */
    stopToday: stopKind(s, s.day),
    /** 이번 주에 직접 고르는 날 (오늘 포함, 이미 지난 날 포함) */
    weekPicks: thisWeek.map(x => x.day),
    weekStart: ws,
    /** 지금 신청할 수 있는 대회 수 */
    openEvents: open,
    todayEvent: eventStop(s, s.day),
    clanWar: s.clan ? clanWarInfo(s) : null,
  };
}
