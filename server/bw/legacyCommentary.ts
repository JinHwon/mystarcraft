/**
 * 원작식 중계 해설: 엔진 경기 이벤트(FeedEvent)를 보고 원작 해설 문장(legacyLines.ts)을 고른다.
 * 원작은 상황마다 문장 3개 중 하나를 무작위로 고르므로, 여기서도 상황(종족·유닛·유불리)에 맞는 묶음을 찾아 하나를 뽑는다.
 */
import { LEGACY_LINES } from "./legacyLines";
import type { FeedEvent } from "./bwEngine";

type Race = "terran" | "zerg" | "protoss";
type Side = 1 | 2;
export interface CastPlayer { side: Side; name: string; race: Race }
export interface CastLine { t: number; side: 0 | 1 | 2; text: string }

const rand = () => Math.random();
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
const L = (k: string) => LEGACY_LINES[k] ?? [];
const flat = (k: string) => L(k).flat();
const find = (k: string, part: string) => flat(k).find(s => s.includes(part));

// ── 상황 문장 분류 ─────────────────────────────────────────────────
/** 해설 속 낱말 → 종족·엔진 유닛 (빈 배열 = 건물·일꾼 등 항상 있는 것) */
const WORDS: Array<[RegExp, Race, string[]]> = [
  [/저글링/, "zerg", ["zergling"]], [/히드라/, "zerg", ["hydralisk"]], [/뮤탈/, "zerg", ["mutalisk"]],
  [/러커|럴커/, "zerg", ["lurker"]], [/울트라/, "zerg", ["ultralisk"]], [/디파|스웜/, "zerg", ["defiler"]],
  [/스커지/, "zerg", ["scourge"]], [/드론|성큰|해처리|저그/, "zerg", []], [/오버로드|오버가/, "zerg", ["overlord"]],
  [/마린|머린/, "terran", ["marine"]], [/메딕/, "terran", ["medic"]], [/파벳|파이어벳/, "terran", ["firebat"]],
  [/벌처|마인/, "terran", ["vulture"]], [/탱크|시즈/, "terran", ["siege_tank"]], [/골리앗/, "terran", ["goliath"]],
  [/레이스|클로킹/, "terran", ["wraith"]], [/배틀|야마토/, "terran", ["battlecruiser"]], [/드랍쉽/, "terran", ["dropship"]],
  [/베슬|EMP/, "terran", ["science_vessel"]], [/메카닉/, "terran", ["siege_tank", "goliath", "vulture"]],
  [/SCV|터렛|벙커|스캔|커맨드|디팟|테란|바락/, "terran", []],
  [/질럿/, "protoss", ["zealot"]], [/드라군/, "protoss", ["dragoon"]], [/리버|스캐럽/, "protoss", ["reaver"]],
  [/셔틀/, "protoss", ["shuttle", "reaver"]], [/다크(?!스웜)/, "protoss", ["dark_templar"]], [/커세어|웹/, "protoss", ["corsair"]],
  [/캐리어/, "protoss", ["carrier"]], [/아칸/, "protoss", ["archon"]], [/스톰|템플러|하템/, "protoss", ["high_templar", "archon"]],
  [/옵저버/, "protoss", ["observer"]], [/아비터|리콜|스테시스/, "protoss", ["arbiter"]],
  [/캐논|포토|프로브|게이트|넥서스|토스/, "protoss", []],
];
/** 당하는 쪽이 하는 말 (부정적인 상황) */
const NEG = /못 ?버|못 ?막|못밀|못지|못가|안되|안돼|힘들|위험|부족|큰일|역부족|휘둘|속수무책|뭘로|망했|어렵|밀리나|졌어요|도망|포기|후퇴|취소|안좋|손해|뚫리|누적|너무 큰|피해를 너무|일 ?못|못해요|안듣|흔들리면|잃으면|없어요|버티긴|남아나질|없어요|수 가 없|막기 힘|빨리 나와야|더 뽑아야|더 늘려야|더 지어야|막아야|나와야/;
/** 당하는 쪽 자산 (부정 문장에서 이 낱말이 있으면 그 종족이 말하는 사람) */
const OWN: Array<[RegExp, Race]> = [[/성큰|드론|해처리/, "zerg"], [/SCV|터렛|벙커|커맨드|디팟|입구/, "terran"], [/프로브|캐논|포토|넥서스|게이트/, "protoss"]];
const RACE_NAMES: Array<[RegExp, Race]> = [[/테란/, "terran"], [/토스/, "protoss"], [/저그/, "zerg"]];
/** 문장에 나오는 종족이 이번 경기 두 종족 안에 드는지 */
function fitsRaces(line: string, a: Race, b: Race) {
  return WORDS.every(([re, race]) => race === a || race === b || !re.test(line));
}
const ADVANCE = /진출|전진|압박|돌진|난입|달려|몰아|진격|입성|공략|타격|들이닥|보냅|밀어|찔러|파고|드랍|강행|러쉬|덮|몰아치/;

interface Mention { race: Race; units: string[]; idx: number }
interface Situation { lines: string[]; text: string; mentions: Mention[]; races: Set<Race>; neg: boolean; actor: Race | null; neutral: boolean }

function analyze(lines: string[]): Situation {
  const text = lines.join(" / ");
  const mentions: Mention[] = [];
  for (const [re, race, units] of WORDS) {
    const m = re.exec(text);
    if (m) mentions.push({ race, units, idx: m.index });
  }
  mentions.sort((a, b) => a.idx - b.idx);
  const races = new Set(mentions.map(m => m.race));
  const negLines = lines.filter(l => NEG.test(l));
  let neg = negLines.length * 2 > lines.length;
  const byGrammar = actorByGrammar(text, races);
  let actor: Race | null = byGrammar ?? mentions[0]?.race ?? null;
  // "테란진영", "토스병력"처럼 상대 종족 이름이 나오면 말하는 쪽은 그 반대 종족 (공격하는 쪽)
  const named = RACE_NAMES.find(([re]) => re.test(text))?.[1];
  const ownNeg = OWN.find(([re]) => re.test(negLines.join(" ")))?.[1];
  if (named && races.size === 2) {
    actor = [...races].find(r => r !== named) ?? actor;
    if (neg && ownNeg !== actor) neg = false;
  } else if (neg) {
    if (ownNeg) actor = ownNeg;
    else if (races.size === 2 && actor && !byGrammar) actor = [...races].find(r => r !== actor) ?? actor;
  }
  return { lines, text, mentions, races, neg, actor, neutral: !lines[0].startsWith(",") };
}

/**
 * 조사로 누가 하는 말인지 추정: "드라군으로 탱크 일점사" → 드라군 쪽(도구), 탱크는 대상.
 * "X으로/로" 는 말하는 쪽 유닛, "X 잡아/줄여/녹여/일점사/격추…" 는 상대 유닛.
 */
function actorByGrammar(text: string, races: Set<Race>): Race | null {
  if (races.size !== 2) return null;
  const score: Partial<Record<Race, number>> = {};
  for (const [re, race] of WORDS) {
    const g = new RegExp(re.source + "[^ ,!.]*", "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const tail = text.slice(m.index + m[0].length - 2, m.index + m[0].length + 8);
      const word = m[0];
      if (/(으로|로)$/.test(word) || /^(으로|로)/.test(text.slice(m.index + m[0].length))) score[race] = (score[race] ?? 0) + 2;
      else if (/^\s*((한|두|세|\d+)\s*기\s*)?(만|까지)?\s*(잡|줄여|녹|일점사|격추|떨구|떨궈|제거|제압|몰아|요리|파괴|전멸|쫓|사냥|깨고|둘러|덮)/.test(text.slice(m.index + word.length))) {
        for (const r of races) if (r !== race) score[r] = (score[r] ?? 0) + 1.5;
      } else if (/(이|가|들)$/.test(word)) score[race] = (score[race] ?? 0) + 0.5;
      void tail;
    }
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (!best.length || (best[1] && best[0][1] === best[1][1])) return null;
  return best[0][0] as Race;
}

const SITUATIONS = L("situations").map(analyze);
/** 테스트·점검용 */
export const __SITUATIONS = SITUATIONS;

// ── 빌드 해설 ──────────────────────────────────────────────────
type BuildRule = (ev: FeedEvent, ctx: { plan?: string; seen: Set<string>; t: number }) => string | undefined;
const P = (part: string) => find("buildP", part) ?? find("techP", part) ?? find("unitP", part) ?? find("techP2", part) ?? find("techP3", part);
const Z = (part: string) => find("buildZ", part) ?? find("buildZ2", part);
const T = (part: string) => find("buildT", part) ?? find("buildT2", part);

const BUILD: Record<Race, BuildRule> = {
  protoss: (ev, c) => {
    if (ev.k === "build") {
      if (ev.key === "gateway") return ev.count === 1 ? P("게이트 소환") : P("두 번째 게이트");
      const m: Record<string, string> = {
        forge: "포지 소환", cybernetics_core: "코어 건설", robotics_facility: "로보틱스 올라갑니다", stargate: "스타 게이트 건설",
        fleet_beacon: "캐리어 준비", arbiter_tribunal: "아비터 준비", photon_cannon: "캐논 건설", observatory: "옵저버토리부터",
        robotics_support_bay: "리버를 준비하죠", templar_archives: c.seen.has("u:high_templar") ? "" : "템플러 테크도 올리고요",
      };
      if (ev.key === "citadel_of_adun") return P(c.t < 420 ? "곧바로 템플러테크" : "이제 템플러테크");
      return m[ev.key] ? P(m[ev.key]) : undefined;
    }
    if (ev.k === "expand") return P(ev.idx === 1 ? "앞마당에 넥서스" : ev.idx === 2 ? "멀티 넥서스" : "추가 넥서스");
    if (ev.k === "unit") {
      const m: Record<string, string> = {
        dragoon: "드라군도 추가", reaver: "리버 나왔습니다", dark_templar: "다크템플러 나왔구요", high_templar: "하템까지",
        carrier: "캐리어 출동", observer: "옵저버 나왔습니다", arbiter: "아비터가 등장", corsair: c.seen.has("u:reaver") ? "커세어 리버체제" : "",
      };
      return m[ev.key] ? P(m[ev.key]) : undefined;
    }
    if (ev.k === "tech" && ev.key === "leg_enhancements") return P("발업 됐어요");
  },
  zerg: (ev, c) => {
    if (ev.k === "build") {
      if (ev.key === "spawning_pool") {
        const plan = c.plan ?? "";
        if (/9pool/.test(plan)) return Z("9드론에 바로");
        if (/4pool/.test(plan)) return Z("스포닝풀부터");
        if (/12hat|3hat/.test(plan)) return Z("이제 스포닝풀");
        return Z("스포닝풀 건설합니다");
      }
      const m: Record<string, string> = { spire: "스파이어 건설", hydralisk_den: "히드라덴 짓습니다" };
      return m[ev.key] ? Z(m[ev.key]) : undefined;
    }
    if (ev.k === "expand") return Z(ev.idx === 1 ? "앞마당에 해처리" : ev.idx === 2 ? "멀티지역 해처리" : "추가 멀티 더 가져갑니다");
    if (ev.k === "tech") {
      if (ev.key === "lair") return Z("레어 올리고");
      if (ev.key === "hive") return Z("하이브테크");
      if (ev.key === "lurker_aspect") return Z(c.seen.has("b:spire") ? "러커 변태합니다" : "뮤탈 생략하고 러커");
    }
    if (ev.k === "unit") {
      const m: Record<string, string> = {
        zergling: "저글링 누릅니다", hydralisk: "다수의 히드라", mutalisk: c.seen.has("u:hydralisk") ? "히드라 뮤탈 조합" : "뮤탈 찍었죠",
        defiler: "디파일러 나왔어요", ultralisk: "울트라 나오고",
      };
      return m[ev.key] ? Z(m[ev.key]) : undefined;
    }
  },
  terran: (ev, c) => {
    const plan = c.plan ?? "";
    if (ev.k === "build") {
      if (ev.key === "barracks") return ev.count === 1 ? T(/bbs/.test(plan) ? "곧바로 바락" : "바락건설 합니다") : undefined;
      if (ev.key === "factory") {
        if (ev.count === 2) return T("2팩토리째");
        if (/mech/.test(plan)) return T("메카닉을 준비");
        return T(/tvp_fd|tvt_1fe/.test(plan) ? "선팩토리를" : "팩토리 건설 중");
      }
      if (ev.key === "starport") return T(ev.count === 2 ? "스타포트 두개째" : "스타포트 올라갑니다");
      const m: Record<string, string> = { academy: "아카데미 건설", engineering_bay: "터렛 준비" };
      return m[ev.key] ? T(m[ev.key]) : undefined;
    }
    if (ev.k === "expand") return T(ev.idx === 1 ? "커맨드센터 건설" : ev.idx === 2 ? "멀티지역 커맨드" : "추가 멀티 더 건설");
    if (ev.k === "unit") {
      const m: Record<string, string> = {
        marine: "마린뽑고", medic: "메딕 추가", siege_tank: "탱크 추가되었고", vulture: "벌처 나왔습니다", wraith: "레이스 나왔어요",
        goliath: "골리앗도 나왔구요", dropship: "드랍쉽 운용", science_vessel: "베슬까지",
      };
      return m[ev.key] ? T(m[ev.key]) : undefined;
    }
  },
};

// ── 초반 빌드 비교 (종족전별) ──────────────────────────────────────
function openingLine(a: { race: Race; plan: string; style: string }, b: { race: Race; plan: string; style: string }): string | undefined {
  const races = [a.race, b.race].sort().join("");
  const plans = [a.plan, b.plan];
  const has = (re: RegExp) => plans.some(p => re.test(p));
  const both = (re: RegExp) => plans.every(p => re.test(p));
  const aggressive = [a.style, b.style].filter(s => s === "aggressive" || s === "cheese").length;
  const o = (k: string, part: string) => find(k, part);
  switch (races) {
    case "zergzerg":
      if (aggressive === 2) return o("openZvZ", "공격적인 빌드");
      if (both(/12hat/)) return o("openZvZ", "트윈 해처리");
      if (has(/12hat/) && has(/9pool/)) return o("openZvZ", "9드론이 더 가난");
      if (has(/4pool/)) return o("openZvZ", "저글링을 막아 낼 수");
      return o("openZvZ", "과감한 선택");
    case "terranterran":
      if (a.plan === b.plan) return o("openTvT", "같은 초반빌드");
      if (both(/2star/)) return o("openTvT", "레이스를 선택");
      if (has(/2star/)) return o("openTvT", "극단적으로 갈라");
      if (has(/bbs/)) return o("openTvT", "8바락으로 피해못주면");
      return o("openTvT", "별다른 초반 움직임");
    case "protossprotoss":
      if (both(/dt/)) return o("openPvP", "모두 다크를");
      if (has(/dt/)) return o("openPvP", "옵저버 나오기전에");
      if (aggressive === 2) return o("openPvP", "모두 공격적");
      if (has(/reaver/)) return o("openPvP", "리버싸움");
      return o("openPvP", "원게이트 출발");
    case "terranzerg":
      if (has(/bbs/)) return o("openTvZ", "8바락으로 피해");
      if (has(/9pool|4pool/)) return o("openTvZ", "9드론으로");
      if (has(/1rax_fe/) && has(/3hat/)) return o("openTvZ", "가난한 빌드");
      return o("openTvZ", "무난하게 출발");
    case "protossterran":
      if (has(/tvp_fd/) && has(/21nexus/)) return o("openPvT", "앞마당 타이밍은 비슷");
      if (has(/carrier/)) return o("openPvT", "타이밍이 차이가 꽤");
      if (has(/tvp_fd/)) return o("openPvT", "테란의 앞마당이 더 빠르");
      return o("openPvT", "타이밍이 너무 차이");
    case "protosszerg":
      if (has(/2gate/)) return o("openPvZ", "2게이트 질럿");
      if (has(/pvz_ffe/)) return o("openPvZ", "포토 깔고");
      return o("openPvZ", "무난하게 서로");
  }
}

// ── 해설자 ────────────────────────────────────────────────────
export class LegacyCaster {
  private out: CastLine[] = [];
  private used = new Set<number>();
  private seen: Record<Side, Set<string>> = { 1: new Set(), 2: new Set() };
  private plans: Partial<Record<Side, { race: Race; plan: string; style: string }>> = {};
  private lastT = 0;
  private units: Record<Side, Record<string, number>> = { 1: {}, 2: {} };
  private lastRaid: Partial<Record<Side, number>> = {};

  constructor(private p1: CastPlayer, private p2: CastPlayer) {}

  private P(side: Side) { return side === 1 ? this.p1 : this.p2; }
  private O(side: Side) { return side === 1 ? this.p2 : this.p1; }

  private say(t: number, who: CastPlayer | null, raw: string | undefined) {
    if (!raw) return;
    // 바로 앞에 나온 문장은 반복하지 않음
    if (this.out.slice(-6).some(l => l.text.endsWith(raw.replace(/^,\s*/, "").trim()))) return;
    let text = raw;
    if (who) {
      if (raw.startsWith(",")) text = `${who.name} 선수${raw}`;
      else if (raw.startsWith(" 선수")) text = who.name + raw;
      else if (raw.startsWith("선수")) text = `${who.name} ${raw}`;
    }
    this.out.push({ t, side: who ? who.side : 0, text: text.trim() });
    this.lastT = t;
  }

  /** 상황 묶음 고르기 */
  private situation(actor: CastPlayer, opp: CastPlayer, neg: boolean, own: Record<string, number>, their: Record<string, number>, filter?: RegExp, exclude?: RegExp) {
    let best: Array<{ i: number; s: number }> = [];
    SITUATIONS.forEach((g, i) => {
      if (g.neutral || g.actor !== actor.race || g.neg !== neg) return;
      if ([...g.races].some(r => r !== actor.race && r !== opp.race)) return;
      if (neg && actor.race !== opp.race && !g.races.has(opp.race)) return;
      if (filter && !filter.test(g.text)) return;
      if (exclude && exclude.test(g.text)) return;
      let s = 0;
      for (const m of g.mentions) {
        const pool = m.race === actor.race ? own : their;
        if (actor.race === opp.race) {
          // 같은 종족전: 어느 쪽 유닛인지 구분이 안 되니 양쪽 모두 확인
          s += !m.units.length ? 0.3 : m.units.some(u => (own[u] ?? 0) > 0 || (their[u] ?? 0) > 0) ? 1.5 : -3;
        } else if (!m.units.length) s += 0.3;
        else s += m.units.some(u => (pool[u] ?? 0) > 0) ? (m.race === actor.race ? 2 : 1) : -3;
      }
      if (this.used.has(i)) s -= 1.5;
      if (s > 0) best.push({ i, s });
    });
    if (!best.length) return undefined;
    const top = Math.max(...best.map(b => b.s));
    best = best.filter(b => b.s >= top - 1);
    const { i } = pick(best);
    this.used.add(i);
    return pick(SITUATIONS[i].lines);
  }

  feed(events: FeedEvent[]) {
    for (const ev of events) this.one(ev);
  }

  /** 조용한 구간 메우기 (대치·센터 싸움) */
  quiet(t: number) {
    if (t - this.lastT < 100 || t < 240 || rand() > 0.5) return;
    const center = L("center");
    if (rand() < 0.5) this.say(t, null, pick(L("start")[3] ?? ["팽팽한 대치 상황이 유지되는데요."]));
    else if (center[0]) this.say(t, null, pick(center[0]));
  }

  private one(ev: FeedEvent) {
    const t = ev.t;
    switch (ev.k) {
      case "plan": {
        const me = this.P(ev.side);
        this.plans[ev.side] = { race: me.race, plan: ev.plan, style: ev.style };
        if (ev.style === "cheese" && rand() < 0.6) this.say(t, me, find("cheer", "노리고 나온"));
        const a = this.plans[1], b = this.plans[2];
        if (a && b) {
          this.say(t, null, openingLine(a, b));
          if (rand() < 0.35) this.say(t, pick([this.p1, this.p2]), find("cheer", "치어풀"));
        }
        return;
      }
      case "build": case "expand": case "unit": case "tech": {
        const me = this.P(ev.side);
        const tag = ev.k === "build" ? `b:${ev.key}` : ev.k === "unit" ? `u:${ev.key}` : ev.k === "tech" ? `t:${ev.key}` : `e:${ev.idx}`;
        const line = BUILD[me.race](ev, { plan: this.plans[ev.side]?.plan, seen: this.seen[ev.side], t });
        this.seen[ev.side].add(tag);
        if (line && !this.seen[ev.side].has(`l:${line}`)) {
          this.seen[ev.side].add(`l:${line}`);
          this.say(t, me, line);
        }
        return;
      }
      case "attack": {
        const me = this.P(ev.side), opp = this.O(ev.side);
        this.units[ev.side] = ev.units;
        this.units[(3 - ev.side) as Side] = ev.vs;
        const plan = this.plans[ev.side]?.plan ?? "";
        if (me.race === "terran" && /bbs/.test(plan) && ev.early && !this.seen[ev.side].has("bunker")) {
          this.seen[ev.side].add("bunker");
          this.say(t, me, find("buildT", "벙커링"));
          return;
        }
        if (ev.early && (ev.target === 0 || ev.target === 1) && rand() < 0.6) {
          this.say(t, opp, pick(L("situations")[0] ?? []));
        }
        if (ev.target < 0) {
          const c = L("center")[1];
          this.say(t, me, c ? pick(c) : undefined);
          return;
        }
        if (me.race === "terran" && (ev.units.siege_tank ?? 0) > 0 && (ev.units.vulture ?? 0) > 0 && rand() < 0.25) {
          this.say(t, me, find("buildT", "벌처동반"));
          return;
        }
        this.say(t, me, this.situation(me, opp, false, ev.units, ev.vs, ADVANCE));
        return;
      }
      case "fight": {
        const w = this.P(ev.winner), l = this.O(ev.winner);
        const wu = ev.winUnits, lu = ev.loseUnits;
        let line: string | undefined;
        if (ev.upset) line = pick(flat("control"));
        if (!line && w.race === "protoss" && ((wu.high_templar ?? 0) + (wu.archon ?? 0)) > 0 && rand() < 0.6) line = this.special("storm", lu);
        if (!line && w.race === "terran" && ((wu.siege_tank ?? 0) + (wu.goliath ?? 0)) >= 4 && rand() < 0.35) line = this.special("mech", lu);
        if (!line && w.race === "terran" && l.race === "protoss" && (wu.science_vessel ?? 0) > 0 && rand() < 0.5) line = pick(flat("empStasis").filter(s => /EMP|탱크/.test(s)));
        if (!line && w.race === "protoss" && (wu.arbiter ?? 0) > 0 && rand() < 0.5) line = pick(flat("empStasis").filter(s => /아비터|스테시스/.test(s)));
        if (!line && w.race === "terran" && l.race === "protoss" && (wu.vulture ?? 0) > 0 && rand() < 0.35) line = pick(flat("mineDrop").filter(s => /마인|벌처|드라군/.test(s)));
        if (!line && w.race === "protoss" && l.race === "terran" && (wu.shuttle ?? 0) > 0 && rand() < 0.35) line = pick(flat("mineDrop").filter(s => /셔틀|질럿/.test(s)));
        if (!line && w.race === "zerg" && (wu.lurker ?? 0) > 0 && rand() < 0.25) line = pick(flat("stopLurker"));
        if (!line && ev.crush && rand() < 0.3) line = pick(flat("surround").filter(s => fitsRaces(s, w.race, l.race)));
        if (!line) line = this.situation(w, l, false, wu, lu, undefined, /드랍|클로킹|오버로드 잡|프로브만|드론만|SCV 계속/);
        if (!line) line = pick(L("center")[1] ?? []);
        this.say(t, w, line);
        if (rand() < 0.55) this.say(t, l, this.situation(l, w, true, lu, wu));
        return;
      }
      case "base": {
        const victim = this.P(ev.victim), att = this.O(ev.victim);
        const bk = flat("baseKill");
        if (ev.idx === 0) this.say(t, victim, bk.find(s => s.includes("본진이 날아간")));
        else if (ev.idx === 1) this.say(t, att, bk.find(s => s.includes("앞마당 파괴")));
        else this.say(t, att, bk.find(s => s.includes(victim.race === "zerg" ? "해처리 파괴" : victim.race === "terran" ? "커맨드 파괴" : "넥서스 부쉈")));
        if (victim.race === "terran" && rand() < 0.5) {
          const lift = flat("lift");
          this.say(t, victim, ev.idx === 0 ? lift.find(s => s.includes("본진")) : ev.idx === 1 ? lift.find(s => s.includes("앞마당")) : lift.find(s => s.includes("멀티")));
        }
        return;
      }
      case "raid": {
        const victim = this.O(ev.side);
        if (ev.killed < 4 || rand() < 0.5 || t - (this.lastRaid[victim.side] ?? -999) < 240) return;
        this.lastRaid[victim.side] = t;
        this.say(t, victim, flat("situations").find(s => s.includes("일꾼 피해 너무")));
        return;
      }
      case "harass": {
        const me = this.P(ev.side), opp = this.O(ev.side);
        const re: Record<string, RegExp> = {
          vulture_raid: /벌처|마인/, bio_drop: /드랍쉽/, wraith_cloak: /레이스|클로킹/, reaver_drop: /리버|스캐럽|셔틀/,
          dark_templar: /다크(?!스웜)/, corsair_overlord: /오버로드/, muta_harass: /뮤탈/, ling_runby: /저글링/,
        };
        const filter = re[ev.kind];
        if (!filter) return;
        const own = { ...this.units[ev.side], ...unitsFor(ev.kind) };
        const their = { ...this.units[opp.side], ...workersOf(opp.race) };
        if (ev.kind === "corsair_overlord" && ev.killed > 0) {
          this.say(t, me, this.situation(me, opp, false, own, { overlord: 1 }, /오버로드/));
          return;
        }
        if (ev.killed > 0) {
          this.say(t, me, this.situation(me, opp, false, own, their, filter));
          if (rand() < 0.5) this.say(t, opp, this.situation(opp, me, true, their, own, filter));
        } else {
          this.say(t, opp, this.situation(opp, me, false, their, own, filter) ?? this.situation(me, opp, true, own, their, filter));
        }
        return;
      }
      case "counter": {
        const c = L("center")[1];
        this.say(t, this.P(ev.side), c?.find(s => s.includes("주도권")));
        return;
      }
      case "gg": case "judge": {
        const loser = ev.k === "gg" ? this.P(ev.loser) : this.O(ev.winner);
        const winner = this.O(loser.side);
        const end = L("ending");
        if (ev.k === "gg") this.say(t, loser, pick(end[0] ?? []));
        const group = t < 420 ? end[1] : t < 720 ? end[2] : t < 1200 ? end[3] : end[4];
        this.say(t, winner, group ? pick(group) : undefined);
        this.say(t, null, end[5]?.[0] ?? "경기가 종료되었습니다.");
        this.say(t, winner, pick(flat("ceremony")));
        return;
      }
    }
  }

  private special(key: string, their: Record<string, number>) {
    const groups = L(key).filter(g => g.every(s => fitsRaces(s, this.p1.race, this.p2.race))).filter(g => {
      const a = analyze(g);
      const others = a.mentions.filter(m => m.units.length && !["high_templar", "archon", "siege_tank", "goliath"].includes(m.units[0]));
      return !others.length || others.some(m => m.units.some(u => (their[u] ?? 0) > 0));
    });
    return groups.length ? pick(pick(groups)) : undefined;
  }

  lines() { return this.out; }
}

function unitsFor(kind: string): Record<string, number> {
  const m: Record<string, string[]> = {
    vulture_raid: ["vulture"], bio_drop: ["dropship", "marine", "medic"], wraith_cloak: ["wraith"], reaver_drop: ["reaver", "shuttle"],
    dark_templar: ["dark_templar"], corsair_overlord: ["corsair"], muta_harass: ["mutalisk"], ling_runby: ["zergling"],
  };
  return Object.fromEntries((m[kind] ?? []).map(k => [k, 1]));
}
function workersOf(race: Race): Record<string, number> {
  return race === "zerg" ? { overlord: 1 } : {};
}
