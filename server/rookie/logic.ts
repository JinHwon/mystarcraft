/**
 * 선수 키우기 모드 규칙 (서버)
 * 하루 10번(연습·래더·휴식·방송·용돈) + 이벤트 대회(하루) + 커리지 매치(6·12월) + 드래프트(12월) + 프로 구단 생활
 */
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { ORIG_MAPS, ORIG_TEAMS } from "@shared/career/originalData";
import { COND_MAX, COND_MIN, type Race } from "@shared/career/rules";
import { ITEM_BY_KEY, slotOf } from "@shared/career/items";
import { initialPlayers } from "@shared/career/init";
import { mapView } from "@shared/career/view";
import {
  CONCEPTS, DAY_SLOTS, EVENT_NAMES, LADDER_START, RACES, ROOKIE_BONUS, ROOKIE_PRICE, ROOKIE_USES, SEMIPRO_DAYS, STATUS_NAMES,
  STAT_MAX_ONE, STAT_MIN_ONE, TIERS, TIER_ORDER, TRYOUT_MIN, VITA_PER_DAY, capOf, courageDays, dateText, draftDay, isMonthEnd,
  ladderGrade, nickname, statsAround, sumStats, ymd,
  type Concept, type Opp, type RookieEvent, type RookieState, type Stats, type Tier,
} from "@shared/rookie/model";
import { simulateSet } from "../gameSimulation";
import { mapAdvantage } from "../career/core";
import type { SetTimeline } from "../gameSimulation";

export class RookieError extends Error {}
const rand = () => Math.random();
const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const clampStat = (v: number) => Math.max(STAT_MIN_ONE, Math.min(STAT_MAX_ONE, Math.round(v)));
const clampCond = (v: number) => Math.max(COND_MIN, Math.min(COND_MAX, Math.round(v)));

// 프로 선수 (원작 데이터, 능력치 고정)
const PROS = initialPlayers();
const prosOf = (team: number) => PROS.filter(p => p.team === team);
const proOpp = (id: number): Opp => { const p = PROS[id]; return { name: p.name, race: p.race, stats: { ...p.stats }, pro: { id, team: p.team } }; };
const PRO_TEAMS = ORIG_TEAMS.filter(t => t.id < 12);

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
    record: { w: 0, l: 0 }, kicks: 0, inventory: { vitavita: 3 }, equip: {}, events: [], nextEventId: 1, log: [], days: {},
    tryouts: [], offers: [], titles: [], stream: { count: 0, best: 0, fans: 0 }, doneDays: [],
  };
  log(s, "🎮", `${name} (${input.race === "terran" ? "테란" : input.race === "zerg" ? "저그" : "프로토스"} · ${CONCEPTS[input.concept].name}) 게이머의 꿈을 시작했습니다! 6월·12월 커리지 매치에서 우승하면 준프로가 됩니다`);
  ensureEvents(s);
  return s;
}

// ── 기록 ───────────────────────────────────────────────────────
function log(s: RookieState, icon: string, text: string) {
  s.log.unshift({ day: s.day, icon, text });
  if (s.log.length > 400) s.log.length = 400;
}
function mark(s: RookieState, icon?: string, won?: boolean) {
  const d = (s.days[s.day] ??= { w: 0, l: 0, icons: [] });
  if (won === true) d.w++;
  if (won === false) d.l++;
  if (icon && !d.icons.includes(icon)) d.icons.push(icon);
}
function useSlots(s: RookieState, n: number) {
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
export function effective(s: RookieState): Stats {
  const g = gear(s);
  // 아마추어는 하루에 여러 판을 하므로 컨디션 영향은 감독 모드보다 완만하게 (50% → 0.8배)
  const k = (0.6 + 0.4 * (s.cond / 100)) * (0.95 + s.morale / 2000);
  return Object.fromEntries(STAT_KEYS.map(x => [x, Math.round((s.stats[x] + g[x]) * k)])) as Stats;
}
/** 상대도 컨디션이 들쭉날쭉 */
const oppForm = (o: Opp) => Object.fromEntries(STAT_KEYS.map(k => [k, Math.round(o.stats[k] * (0.85 + rand() * 0.2))])) as Stats;

export interface PlayedGame {
  mapId: number;
  winner: "a" | "b";
  duration: number;
  timeline?: SetTimeline;
  opp: Opp;
  /** 경기 뒤 내 변화 */
  fx: { stats: Partial<Stats>; cond: [number, number]; ladder?: [number, number]; money?: number };
  label: string;
}

/** 한 판 (a = 나). broadcast: 중계 문장까지 */
function playOne(s: RookieState, opp: Opp, mapId: number, label: string, broadcast = true): PlayedGame {
  const m = mapView(mapId);
  const r = simulateSet(
    { id: 1, name: s.name, race: s.race, stats: effective(s), fatigue: 100 },
    { id: 2, name: opp.name, race: opp.race, stats: oppForm(opp), fatigue: 100 },
    mapAdvantage(mapId, s.race, opp.race),
    { rushDistance: m.rush / 2, resources: m.res / 2, complexity: m.complexity / 2 },
    false, broadcast,
  );
  const won = r.winnerId === 1;
  const before = { stats: { ...s.stats }, cond: s.cond };
  grow(s, opp, won);
  s.cond = clampCond(s.cond - (won ? randInt(1, 3) : randInt(2, 5)));
  s.morale = Math.max(0, Math.min(100, s.morale + (won ? 2 : -2)));
  s.record[won ? "w" : "l"]++;
  wearEquip(s);
  const stats: Partial<Stats> = {};
  for (const k of STAT_KEYS) if (s.stats[k] !== before.stats[k]) stats[k] = s.stats[k] - before.stats[k];
  return { mapId, winner: won ? "a" : "b", duration: r.duration, timeline: r.timeline, opp, fx: { stats, cond: [before.cond, s.cond] }, label };
}

/**
 * 성장: 이기면 오르고 지면 떨어짐. 강한 상대일수록 크게 배우고, 성장 한계(신분별)에 가까우면 거의 안 오름
 */
function grow(s: RookieState, opp: Opp, won: boolean) {
  const me = sumStats(s.stats), them = sumStats(opp.stats);
  const ratio = Math.max(0.5, Math.min(1.7, them / Math.max(1, me)));
  const room = Math.max(0.06, Math.min(1, (capOf(s) - me) / 700));
  const keys = [...STAT_KEYS].sort(() => rand() - 0.5);
  if (won) {
    const n = randInt(2, 3);
    for (const k of keys.slice(0, n)) s.stats[k] = clampStat(s.stats[k] + Math.max(0, Math.round(randInt(2, 6) * ratio * room)));
  } else if (ratio > 1.05 && rand() < 0.6) {
    // 강한 상대에게 지면서도 배움
    s.stats[keys[0]] = clampStat(s.stats[keys[0]] + Math.max(1, Math.round(randInt(1, 4) * room)));
  } else {
    // 약한 상대에게 지면 더 많이 떨어짐
    s.stats[keys[0]] = clampStat(s.stats[keys[0]] - Math.max(1, Math.round(randInt(1, 3) / ratio)));
  }
  // 한계를 넘으면 가장 높은 능력치부터 조금씩 깎음
  let over = sumStats(s.stats) - capOf(s);
  while (over > 0) {
    const top = [...STAT_KEYS].sort((a, b) => s.stats[b] - s.stats[a])[0];
    s.stats[top] -= 1; over--;
  }
}

function wearEquip(s: RookieState) {
  for (const [slot, e] of Object.entries(s.equip)) {
    if (!e) continue;
    e.left--;
    if (e.left <= 0) { delete s.equip[slot as keyof typeof s.equip]; log(s, "🔧", `${ITEM_BY_KEY[e.key]?.name ?? "장비"}가 다 닳았습니다`); }
  }
}

/** 다전제 (need 선승) */
function series(s: RookieState, opp: Opp, need: number, label: string, maps?: number[]): { games: PlayedGame[]; won: boolean } {
  const games: PlayedGame[] = [];
  let w = 0, l = 0;
  for (let i = 0; w < need && l < need; i++) {
    const g = playOne(s, opp, maps?.[i] ?? randomMap(), need > 1 ? `${label} ${i + 1}세트` : label);
    games.push(g);
    if (g.winner === "a") w++; else l++;
  }
  return { games, won: w >= need };
}
const randomMap = () => randInt(0, ORIG_MAPS.length - 1);

/** 대회에서 나 말고 다른 선수끼리 (능력치로 빠른 판정) */
function aiWins(a: Opp, b: Opp, need = 1) {
  const pa = sumStats(a.stats), pb = sumStats(b.stats);
  const p = 1 / (1 + Math.pow(10, (pb - pa) / 900));
  let w = 0, l = 0;
  while (w < need && l < need) { if (rand() < p) w++; else l++; }
  return w >= need;
}

// ── 공방 (연습 게임) ────────────────────────────────────────────
function lobbyOpp(tier: Tier): Opp {
  // 초보방에도 가끔 고수가 섞여 나옴
  let i = TIER_ORDER.indexOf(tier);
  const r = rand();
  if (r < 0.06) i += 2; else if (r < 0.2) i += 1; else if (r > 0.9) i -= 1;
  const t = TIERS[TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, i))]];
  return { name: nickname(), race: pick(RACES), stats: statsAround(randInt(t.range[0], t.range[1])) };
}

export function findLobby(s: RookieState, tier: Tier, mapId: number) {
  if (!TIERS[tier]) throw new RookieError("방을 고르세요");
  if (!(mapId >= 0 && mapId < ORIG_MAPS.length)) throw new RookieError("맵을 고르세요");
  if (s.used >= DAY_SLOTS) throw new RookieError("오늘은 더 할 수 없습니다. 다음 날로 넘어가세요");
  s.lobby = { tier, mapId, opp: lobbyOpp(tier) };
  return { opp: s.lobby.opp };
}
/** 상대가 마음에 안 들면 강퇴 (하루 10번) */
export function kickLobby(s: RookieState) {
  if (!s.lobby) throw new RookieError("먼저 방을 만드세요");
  if (s.kicks >= 10) throw new RookieError("오늘은 더 강퇴할 수 없습니다");
  s.kicks++;
  s.lobby.opp = lobbyOpp(s.lobby.tier);
  return { opp: s.lobby.opp };
}
export function playLobby(s: RookieState): PlayedGame {
  const lb = s.lobby;
  if (!lb) throw new RookieError("먼저 상대를 찾으세요");
  useSlots(s, 1);
  const g = playOne(s, lb.opp, lb.mapId, `공방 ${TIERS[lb.tier].name}방`);
  delete s.lobby;
  mark(s, "🎮", g.winner === "a");
  log(s, g.winner === "a" ? "🎮" : "💧", `공방(${TIERS[lb.tier].name}) ${mapView(lb.mapId).name} vs ${lb.opp.name}(${raceShort(lb.opp.race)}) ${g.winner === "a" ? "승리" : "패배"}`);
  return g;
}
const raceShort = (r: Race) => (r === "terran" ? "T" : r === "zerg" ? "Z" : "P");

// ── 래더 ───────────────────────────────────────────────────────
/** 래더 상대: 강한 아마추어 · 준프로 · 프로가 섞여 있음, 점수가 비슷한 상대 */
function ladderOpp(score: number): Opp {
  const r = rand();
  if (r < 0.32) {
    const p = PROS[randInt(0, PROS.length - 1)];
    const o = proOpp(p.id);
    o.ladder = Math.round(1100 + (sumStats(o.stats) - 3000) * 0.38 + randInt(-80, 80));
    return o;
  }
  const total = Math.max(3300, Math.min(5200, Math.round(3000 + (score - 1100) / 0.38 + randInt(-300, 300))));
  const semipro = r < 0.55;
  return { name: nickname(), race: pick(RACES), stats: statsAround(semipro ? Math.max(4000, total) : total), semipro, ladder: Math.round(score + randInt(-120, 120)) };
}

export function playLadder(s: RookieState) {
  useSlots(s, 1);
  let opp = ladderOpp(s.ladder.score);
  // 점수가 너무 먼 상대는 다시
  for (let i = 0; i < 4 && Math.abs((opp.ladder ?? s.ladder.score) - s.ladder.score) > 300; i++) opp = ladderOpp(s.ladder.score);
  const g = playOne(s, opp, randomMap(), "래더");
  const won = g.winner === "a";
  const exp = 1 / (1 + Math.pow(10, ((opp.ladder ?? s.ladder.score) - s.ladder.score) / 400));
  const before = s.ladder.score;
  s.ladder.score = Math.max(800, Math.round(s.ladder.score + 32 * ((won ? 1 : 0) - exp)));
  s.ladder.best = Math.max(s.ladder.best, s.ladder.score);
  s.ladder[won ? "w" : "l"]++;
  g.fx.ladder = [before, s.ladder.score];
  mark(s, "⚔️", won);
  log(s, won ? "⚔️" : "💧", `래더 vs ${opp.pro ? `${PRO_TEAMS[opp.pro.team]?.short} ` : opp.semipro ? "준프로 " : ""}${opp.name} ${won ? "승리" : "패배"} (${before}→${s.ladder.score} · ${ladderGrade(s.ladder.score)})`);
  if (won) s.fame += opp.pro ? 8 : 2;
  // 프로를 이기면 그 팀에서 입단 테스트 제의 (아직 프로가 아니면)
  if (won && opp.pro && s.status !== "pro" && rand() < 0.35 && !s.tryouts.some(t => t.team === opp.pro!.team)) {
    s.tryouts.push({ team: opp.pro.team, until: s.day + 14, from: `래더에서 ${opp.name} 선수를 꺾음` });
    log(s, "📩", `${PRO_TEAMS[opp.pro.team].name}에서 입단 테스트를 제의했습니다! (${opp.name} 선수를 래더에서 이김 · 2주 안에)`);
    mark(s, "📩");
  }
  return g;
}

// ── 휴식 · 방송 · 용돈 ──────────────────────────────────────────
export function rest(s: RookieState) {
  useSlots(s, 1);
  const before = s.cond;
  s.cond = clampCond(s.cond + 12);
  s.morale = Math.min(100, s.morale + 2);
  mark(s, "💤");
  return { cond: [before, s.cond] };
}

/** 개인 방송: 능력치·인지도·래더가 높을수록 시청자·별풍선이 많음 (2번 분량) */
export function stream(s: RookieState) {
  useSlots(s, 2);
  const total = sumStats(s.stats);
  const base = Math.max(0, (total - 2500) / 9 + s.fame * 0.5 + Math.max(0, s.ladder.score - 1500) / 4 + (s.status === "pro" ? 150 : s.status === "semipro" ? 40 : 0));
  const viewers = Math.max(0, Math.round(base * (0.55 + rand() * 0.9) + randInt(0, 6)));
  const balloons = viewers < 15 ? randInt(0, 3) : Math.round(viewers * (0.4 + rand() * 1.6));
  const money = Math.round(balloons / 100);
  s.money += money;
  s.stream.count++;
  s.stream.best = Math.max(s.stream.best, viewers);
  const fans = Math.round(viewers / 25);
  s.stream.fans += fans;
  s.fame = Math.min(1000, s.fame + Math.max(0, Math.round(viewers / 40)));
  s.cond = clampCond(s.cond - 2);
  let mood = "";
  if (viewers < 15) { s.morale = Math.max(0, s.morale - 6); mood = " · 시청자가 거의 없어 사기가 떨어졌습니다"; }
  else if (viewers > 150) { s.morale = Math.min(100, s.morale + 4); mood = " · 반응이 좋아 신이 납니다!"; }
  mark(s, "📺");
  log(s, "📺", `개인 방송: 시청자 ${viewers}명 · 별풍선 ${balloons}개 (+${money}만원)${mood}`);
  return { viewers, balloons, money };
}

/** 부모님 용돈: 일주일에 한 번 (프로가 되면 없음) */
export function allowance(s: RookieState) {
  if (s.status === "pro") throw new RookieError("프로게이머는 월급을 받습니다");
  if (s.allowanceDay !== undefined && s.day - s.allowanceDay < 7) throw new RookieError(`용돈은 일주일에 한 번 (${7 - (s.day - s.allowanceDay)}일 뒤)`);
  useSlots(s, 1);
  s.allowanceDay = s.day;
  const lecture = s.record.l > s.record.w * 2 && rand() < 0.4;
  const money = lecture ? randInt(2, 5) : randInt(5, 15);
  s.money += money;
  if (lecture) s.morale = Math.max(0, s.morale - 3);
  mark(s, "💵");
  log(s, "💵", lecture ? `부모님: "게임만 하지 말고 공부도 좀 해라…" 용돈 ${money}만원` : `부모님께 용돈 ${money}만원을 받았습니다`);
  return { money };
}

// ── 상점 ───────────────────────────────────────────────────────
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
    const keys = it.potion.stat ? [it.potion.stat] : [...STAT_KEYS];
    const d: Partial<Stats> = {};
    for (const k of keys) {
      const v = Math.round(randInt(it.potion.min, it.potion.max) * 0.5);
      s.stats[k] = clampStat(s.stats[k] + v);
      d[k] = v;
    }
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
  for (let i = upcoming.length; i < 3; i++) {
    const last = Math.max(s.day, ...s.events.map(e => e.day));
    const day = last + randInt(4, 11);
    if (courageDays(ymd(day).y).includes(day) || draftDay(ymd(day).y) === day) continue;
    const level = pick<Tier>(["low", "mid", "mid", "high", "high", "elite"]);
    const big = level === "high" || level === "elite";
    const size: 8 | 16 = big || rand() < 0.4 ? 16 : 8;
    const first = Math.round((size === 16 ? 60 : 30) * (big ? 2 : 1) * (0.8 + rand() * 0.6));
    s.events.push({ id: s.nextEventId++, name: pick(EVENT_NAMES), day, size, prize: [first, Math.round(first * 0.5), Math.round(first * 0.25)], level });
  }
  s.events.sort((a, b) => a.day - b.day);
}

export function registerEvent(s: RookieState, id: number) {
  const e = s.events.find(x => x.id === id);
  if (!e || e.day < s.day || e.result) throw new RookieError("신청할 수 없는 대회입니다");
  e.registered = !e.registered;
  return { registered: e.registered };
}

/** 토너먼트 (나 포함 size명, 단판 · 결승 3판 2선승). 내 경기만 중계 · 내가 떨어지면 거기서 끝 (4강 패배 = 공동 3위) */
function tournament(s: RookieState, size: number, field: Opp[], label: string): { games: PlayedGame[]; place: number } {
  let round: Array<Opp | "me"> = (["me", ...field.slice(0, size - 1)] as Array<Opp | "me">).sort(() => rand() - 0.5);
  const games: PlayedGame[] = [];
  while (round.length > 1) {
    const final = round.length === 2;
    const rname = final ? "결승" : round.length === 4 ? "4강" : `${round.length}강`;
    const next: Array<Opp | "me"> = [];
    for (let i = 0; i < round.length; i += 2) {
      const [x, y] = [round[i], round[i + 1]];
      if (x === "me" || y === "me") {
        const opp = (x === "me" ? y : x) as Opp;
        const res = series(s, opp, final ? 2 : 1, `${label} ${rname}`);
        games.push(...res.games);
        if (!res.won) return { games, place: final ? 2 : round.length === 4 ? 3 : round.length };
        next.push("me");
      } else next.push(aiWins(x, y, final ? 2 : 1) ? x : y);
    }
    round = next;
  }
  return { games, place: 1 };
}

export function playEvent(s: RookieState, id: number) {
  const e = s.events.find(x => x.id === id);
  if (!e || e.day !== s.day) throw new RookieError("오늘 열리는 대회가 아닙니다");
  if (!e.registered) throw new RookieError("참가 신청을 하지 않은 대회입니다");
  if (e.result) throw new RookieError("이미 참가한 대회입니다");
  if (s.used > 0) throw new RookieError("대회는 하루 종일 걸립니다 — 다른 일을 하지 않은 날에만 참가할 수 있습니다");
  const r = TIERS[e.level].range;
  const field = Array.from({ length: e.size - 1 }, () => ({ name: nickname(), race: pick(RACES), stats: statsAround(randInt(r[0], r[1] + 300)) } as Opp));
  const { games, place } = tournament(s, e.size, field, e.name);
  s.used = DAY_SLOTS;
  e.result = place <= 3 ? `${place}위` : `${place}강`;
  const prize = place <= 3 ? e.prize[place - 1] : 0;
  s.money += prize;
  if (place <= 3) { s.fame += [30, 15, 8][place - 1]; s.titles.unshift(`${dateText(s.day)} ${e.name} ${place === 1 ? "우승" : place === 2 ? "준우승" : "3위"}`); }
  for (const g of games) mark(s, "🏆", g.winner === "a");
  log(s, "🏆", `${e.name}: ${e.result}${prize ? ` · 상금 ${prize}만원` : ""}`);
  return { games, place, prize, name: e.name };
}

// ── 커리지 매치 · 드래프트 · 입단 테스트 ────────────────────────
export function courageToday(s: RookieState) { return courageDays(ymd(s.day).y).includes(s.day); }
export function draftToday(s: RookieState) { return draftDay(ymd(s.day).y) === s.day; }

export function playCourage(s: RookieState) {
  if (!courageToday(s)) throw new RookieError("오늘은 커리지 매치가 없습니다 (6/20 · 12/20)");
  if (s.status === "pro") throw new RookieError("프로게이머는 커리지 매치에 나갈 수 없습니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("이미 참가했습니다");
  if (s.used > 0) throw new RookieError("커리지 매치는 하루 종일 걸립니다 — 다른 일을 하지 않은 날에만 참가할 수 있습니다");
  s.doneDays.push(s.day);
  const field = Array.from({ length: 31 }, () => ({ name: nickname(), race: pick(RACES), stats: statsAround(randInt(3200, 4300)) } as Opp));
  const { games, place } = tournament(s, 32, field, "커리지 매치");
  s.used = DAY_SLOTS;
  for (const g of games) mark(s, "🎓", g.winner === "a");
  let note = "";
  if (place === 1) {
    s.status = "semipro";
    s.semiproUntil = s.day + SEMIPRO_DAYS;
    s.fame += 40;
    s.titles.unshift(`${dateText(s.day)} 커리지 매치 우승`);
    note = " — 준프로 자격 획득! (2년 동안 드래프트 참가 가능)";
    if (sumStats(s.stats) >= TRYOUT_MIN) {
      const t = pick(PRO_TEAMS);
      s.tryouts.push({ team: t.id, until: s.day + 14, from: "커리지 매치 우승" });
      note += ` · ${t.name}에서 입단 경기 제의!`;
    }
  }
  log(s, "🎓", `커리지 매치 ${place === 1 ? "우승" : place <= 3 ? `${place}위` : `${place}강`}${note}`);
  return { games, place };
}

/** 드래프트: 준프로 16명 스위스 4라운드 → 상위 8명을 구단이 지명할 수도 */
export function playDraft(s: RookieState) {
  if (!draftToday(s)) throw new RookieError("오늘은 드래프트가 없습니다 (12/27)");
  if (s.status !== "semipro") throw new RookieError("준프로만 드래프트에 나갈 수 있습니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("이미 참가했습니다");
  if (s.used > 0) throw new RookieError("드래프트는 하루 종일 걸립니다 — 다른 일을 하지 않은 날에만 참가할 수 있습니다");
  s.doneDays.push(s.day);
  const field = Array.from({ length: 15 }, () => ({ name: nickname(), race: pick(RACES), stats: statsAround(randInt(3900, 4800)), semipro: true } as Opp));
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
    const p = (0.72 - (rank - 1) * 0.07) * Math.max(0.5, Math.min(1.25, total / 4500)) + Math.min(0.08, s.fame / 6000);
    if (rand() < p) picked = pick(PRO_TEAMS).id;
  }
  if (picked !== undefined) {
    joinTeam(s, picked, "드래프트 지명");
    log(s, "📋", `드래프트 ${rank}위 → ${ORIG_TEAMS[picked].name}에 지명되었습니다! 🎉`);
  } else log(s, "📋", `드래프트 ${rank}위${rank <= 8 ? " — 상위 8명에 들었지만 지명받지 못했습니다" : ""}`);
  return { games, rank, team: picked };
}

/** 입단 테스트: 그 팀 2군 선수와 3판 2선승 */
export function playTryout(s: RookieState, team: number) {
  const t = s.tryouts.find(x => x.team === team && x.until >= s.day);
  if (!t) throw new RookieError("받은 입단 테스트가 아닙니다");
  if (s.status === "pro") throw new RookieError("이미 프로게이머입니다");
  useSlots(s, 3);
  const opp: Opp = { name: `${ORIG_TEAMS[team].short} 2군 ${nickname()}`, race: pick(RACES), stats: statsAround(randInt(4300, 4900)) };
  const res = series(s, opp, 2, `${ORIG_TEAMS[team].name} 입단 테스트`);
  s.tryouts = s.tryouts.filter(x => x !== t);
  for (const g of res.games) mark(s, "📝", g.winner === "a");
  if (res.won) {
    joinTeam(s, team, "입단 테스트 통과");
    log(s, "📝", `${ORIG_TEAMS[team].name} 입단 테스트 통과! 프로게이머가 되었습니다 🎉`);
  } else log(s, "📝", `${ORIG_TEAMS[team].name} 입단 테스트에서 떨어졌습니다`);
  return { games: res.games, won: res.won };
}

function joinTeam(s: RookieState, team: number, how: string) {
  s.status = "pro";
  delete s.semiproUntil;
  s.team = { team, squad: 2, joined: s.day, salary: 40, monthW: 0, monthL: 0 };
  s.tryouts = [];
  s.offers = [];
  s.fame += 50;
  s.titles.unshift(`${dateText(s.day)} ${ORIG_TEAMS[team].name} 입단 (${how})`);
  mark(s, "🏢");
}

// ── 프로 구단 ─────────────────────────────────────────────────
/** 팀 동료 (1군은 원작 선수, 2군은 연습생) */
function teammate(s: RookieState): Opp {
  const t = s.team!;
  if (rand() < 0.6) return proOpp(pick(prosOf(t.team)).id);
  return { name: `${ORIG_TEAMS[t.team].short} 연습생 ${nickname()}`, race: pick(RACES), stats: statsAround(randInt(4200, 5100)) };
}
/** 팀 내부 연습 경기 (월말 승강전 순위에 들어감) */
export function playInternal(s: RookieState) {
  if (s.status !== "pro" || !s.team) throw new RookieError("구단에 입단해야 합니다");
  useSlots(s, 1);
  const opp = teammate(s);
  const g = playOne(s, opp, randomMap(), "팀 내부 연습");
  s.team[g.winner === "a" ? "monthW" : "monthL"]++;
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
  if (t.squad === 2 && !(t.monthW >= 3 && t.monthW > t.monthL)) throw new RookieError("이번 달 내부 연습에서 2군 1위를 해야 승강전에 나갈 수 있습니다 (3승 이상, 승이 패보다 많게)");
  useSlots(s, 3);
  s.doneDays.push(s.day);
  const opp = t.squad === 2 ? proOpp(weakestFirst(t.team).id) : { name: `2군 1위 ${nickname()}`, race: pick(RACES), stats: statsAround(randInt(4600, 5300)) } as Opp;
  const res = series(s, opp, 2, `${ORIG_TEAMS[t.team].short} 승강전`);
  for (const g of res.games) mark(s, "⬆️", g.winner === "a");
  if (t.squad === 2 && res.won) { t.squad = 1; t.salary = Math.max(t.salary, 120); s.fame += 30; log(s, "⬆️", `승강전 승리! 1군으로 올라갔습니다 (월급 ${t.salary}만원)`); }
  else if (t.squad === 1 && !res.won) { t.squad = 2; t.salary = 40; log(s, "⬇️", "승강전 패배… 2군으로 내려갔습니다"); }
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
  const mine = sumStats(effective(s));
  const better = prosOf(s.team.team).filter(p => sumStats(p.stats) * 0.95 > mine).length;
  // 같은 날 다시 물어도 같은 답 (날짜로 고정)
  const luck = ((s.day * 9301 + 49297) % 233280) / 233280;
  return better < 4 || luck < 0.25;
}
/** auto: 다음 날로 넘길 때 안 치른 경기를 자동으로 (하루 행동 수와 상관없이) */
export function playProleague(s: RookieState, auto = false) {
  if (!inEntry(s)) throw new RookieError("오늘은 프로리그 엔트리에 들지 못했습니다");
  if (s.doneDays.includes(s.day)) throw new RookieError("오늘 경기는 이미 치렀습니다");
  if (!auto) useSlots(s, 2);
  s.doneDays.push(s.day);
  const others = PRO_TEAMS.filter(t => t.id !== s.team!.team);
  const vsTeam = others[s.day % others.length];
  const opp = proOpp(pick(prosOf(vsTeam.id)).id);
  const g = playOne(s, opp, randomMap(), `프로리그 vs ${vsTeam.name}`, !auto);
  const won = g.winner === "a";
  s.team!.proW = (s.team!.proW ?? 0) + (won ? 1 : 0);
  s.team!.proL = (s.team!.proL ?? 0) + (won ? 0 : 1);
  if (won) { s.money += 30; s.fame += 10; g.fx.money = 30; }
  mark(s, "🏟️", won);
  log(s, "🏟️", `프로리그 vs ${vsTeam.name} ${opp.name} ${won ? "승리! (승리 수당 30만원)" : "패배"}`);
  return g;
}

/** 다른 구단에 직접 이적 요청 (구단에 들키면 벌금·사기 하락, 두 번 들키면 방출) */
export function requestTransfer(s: RookieState, team: number) {
  if (!s.team) throw new RookieError("구단 소속이 아닙니다");
  if (team === s.team.team || !PRO_TEAMS.some(t => t.id === team)) throw new RookieError("이적할 구단을 고르세요");
  useSlots(s, 1);
  const caught = rand() < 0.25;
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
  const p = Math.min(0.75, Math.max(0.05, (sumStats(s.stats) - 4300) / 2000 + s.fame / 3000));
  if (rand() < p) {
    const salary = Math.round(s.team.salary * (1.1 + rand() * 0.3));
    s.offers.push({ team, salary, until: s.day + 7 });
    log(s, "📨", `${ORIG_TEAMS[team].name}: "좋습니다, 월급 ${salary}만원에 모시겠습니다" (일주일 안에 결정)`);
    return { result: "offer" as const, salary };
  }
  log(s, "📨", `${ORIG_TEAMS[team].name}: "지금은 영입 계획이 없습니다"`);
  return { result: "rejected" as const };
}
export function acceptOffer(s: RookieState, team: number) {
  const o = s.offers.find(x => x.team === team && x.until >= s.day);
  if (!o || !s.team) throw new RookieError("받은 이적 제안이 아닙니다");
  const from = ORIG_TEAMS[s.team.team].name;
  s.team = { team, squad: 2, joined: s.day, salary: o.salary, monthW: 0, monthL: 0 };
  s.offers = [];
  s.titles.unshift(`${dateText(s.day)} ${from} → ${ORIG_TEAMS[team].name} 이적`);
  log(s, "✈️", `${ORIG_TEAMS[team].name}(으)로 이적했습니다 (월급 ${o.salary}만원 · 2군부터)`);
  mark(s, "✈️");
  return { ok: true };
}

// ── 다음 날 ───────────────────────────────────────────────────
export function nextDay(s: RookieState) {
  if (s.retired) throw new RookieError(s.retired);
  // 오늘 1군 프로리그 엔트리였는데 안 했으면 자동으로 치름
  if (inEntry(s) && !s.doneDays.includes(s.day)) playProleague(s, true);
  s.day++;
  s.used = 0;
  s.kicks = 0;
  s.vitaToday = 0;
  delete s.lobby;
  s.cond = clampCond(s.cond + 15);
  s.morale = Math.round(s.morale + (60 - s.morale) * 0.05);
  s.doneDays = s.doneDays.filter(d => d >= s.day - 2);
  const x = ymd(s.day);
  // 월급 (매달 1일)
  if (s.team && x.d === 1) { s.money += s.team.salary; s.team.monthW = 0; s.team.monthL = 0; log(s, "💰", `월급 ${s.team.salary}만원 (${ORIG_TEAMS[s.team.team].name})`); }
  // 프로: 가끔 다른 구단에서 스카웃 제안
  if (s.team && x.d === 15 && rand() < Math.min(0.5, (sumStats(s.stats) - 4800) / 1500 + s.fame / 4000)) {
    const t = pick(PRO_TEAMS.filter(t => t.id !== s.team!.team));
    const salary = Math.round(s.team.salary * (1.2 + rand() * 0.4));
    s.offers.push({ team: t.id, salary, until: s.day + 7 });
    log(s, "📨", `${t.name}에서 스카웃 제안! 월급 ${salary}만원 (일주일 안에 결정)`);
  }
  // 준프로 기간 끝
  if (s.status === "semipro" && s.semiproUntil !== undefined && s.day > s.semiproUntil) {
    s.status = "amateur";
    delete s.semiproUntil;
    log(s, "⌛", "준프로 자격(2년)이 끝났습니다. 다시 커리지 매치에서 우승해야 합니다");
  }
  s.tryouts = s.tryouts.filter(t => t.until >= s.day);
  s.offers = s.offers.filter(o => o.until >= s.day);
  ensureEvents(s);
  // 알림: 오늘 일정
  if (courageToday(s) && s.status !== "pro") log(s, "🎓", "오늘은 커리지 매치 날입니다!");
  if (draftToday(s) && s.status === "semipro") log(s, "📋", "오늘은 드래프트 날입니다!");
  for (const e of s.events.filter(e => e.day === s.day && e.registered)) log(s, "🏆", `오늘은 ${e.name} 날입니다 (참가 신청함)`);
  return { day: s.day };
}

/** 화면용 요약 */
export function todayInfo(s: RookieState) {
  return {
    courage: courageToday(s) && s.status !== "pro" && !s.doneDays.includes(s.day),
    draft: draftToday(s) && s.status === "semipro" && !s.doneDays.includes(s.day),
    proleague: inEntry(s) && !s.doneDays.includes(s.day),
    promo: !!s.team && isMonthEnd(s.day) && !s.doneDays.includes(s.day),
    events: s.events.filter(e => e.day === s.day && e.registered && !e.result).map(e => e.id),
    status: STATUS_NAMES[s.status],
    grade: ladderGrade(s.ladder.score),
    cap: capOf(s),
  };
}
