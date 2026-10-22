/**
 * 선수 키우기: 살아있는 세계(또래 선수의 성장·입단·이적·우승 소식), 시즌 목표·연말 평가·시상, 은퇴·후배 이어하기
 */
import { ORIG_TEAMS } from "@shared/career/originalData";
import { dateText, dayOf, nickname, sumStats, ymd, type RookieState } from "@shared/rookie/model";
import { TRAIT_KEYS } from "@shared/rookie/persona";
import { ROLES } from "@shared/rookie/squad";
import {
  LEGACY_FAME, LEGACY_MONEY, PEER_CAP, RETIRE_MIN_DAYS, goalGrade, legacyScore,
  type Goal, type GoalBase, type HofEntry, type Peer, type World,
} from "@shared/rookie/world";
import { sendMail } from "./inbox";
import { RookieError, gainExp, myRole } from "./logic";

const rand = () => Math.random();
const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const RACES = ["terran", "zerg", "protoss"] as const;
const PRO_TEAMS = ORIG_TEAMS.filter(t => t.id < 12);
const PEERS = 24;
const NEWS_MAX = 50;

function log(s: RookieState, icon: string, text: string) {
  s.log.unshift({ day: s.day, icon, text });
  if (s.log.length > 400) s.log.length = 400;
}
function news(w: World, day: number, icon: string, text: string) {
  w.news.unshift({ day, icon, text });
  if (w.news.length > NEWS_MAX) w.news.length = NEWS_MAX;
}

// ── 살아있는 세계 ─────────────────────────────────────────────────
function newPeer(w: World, s: RookieState, star: boolean, base: number): Peer {
  const used = new Set(w.peers.map(p => p.name).concat(s.name, s.rival.name));
  return {
    id: w.nextId++, name: nickname(rand, used), race: pick([...RACES]),
    total: Math.max(1800, Math.round(base + randInt(-300, 300) + (star ? 200 : 0))),
    // 주마다 크는 양: 보통 25~45, 괴물 유망주 50~70 (한계에 가까울수록 덜)
    pot: star ? randInt(50, 70) : randInt(25, 45),
    status: "amateur", fame: star ? 15 : 0, titles: 0, ...(star ? { star: true } : {}), since: s.day,
  };
}
/** 세계 만들기 (없으면): 나와 비슷한 출발선의 또래 24명 */
export function ensureWorld(s: RookieState): World {
  if (s.world) return s.world;
  const w: World = { peers: [], news: [], nextId: 1 };
  // 예전 세이브(이미 많이 큰 선수)는 지금 내 수준 언저리에서 또래를 만들고, 수준에 맞게 신분도 나눠 줌
  const late = s.day > 30;
  const base = late ? sumStats(s.stats) - 150 : sumStats(s.startStats);
  for (let i = 0; i < PEERS; i++) {
    const p = newPeer(w, s, rand() < 0.15, base + (late ? randInt(-350, 250) : 0));
    if (late) {
      if (p.total >= 5200 && rand() < 0.5) { p.status = "pro"; p.team = pick(PRO_TEAMS).id; p.squad = p.total >= 5600 && rand() < 0.5 ? 1 : 2; p.fame = randInt(60, 200); }
      else if (p.total >= 4300 && rand() < 0.6) { p.status = "semipro"; p.fame = randInt(20, 90); }
    }
    w.peers.push(p);
  }
  news(w, s.day, "🌱", `${ymd(s.day).y}년, ${PEERS}명의 또래가 프로게이머의 꿈을 꾸기 시작했습니다`);
  s.world = w;
  return w;
}
const peerCap = (p: Peer) => (p.status === "pro" ? (p.squad === 1 ? PEER_CAP.pro1 : PEER_CAP.pro2) : PEER_CAP[p.status]);

/** 매주(일요일) 또래들이 크고, 커리지 우승·입단·1군 승격·이적·우승 소식이 생김 */
export function weeklyWorld(s: RookieState) {
  const w = ensureWorld(s);
  for (const p of w.peers) {
    const room = Math.max(0.05, Math.min(1, (peerCap(p) - p.total) / 700));
    p.total += Math.round(p.pot * room * (0.6 + rand() * 0.8));
    p.fame = Math.min(1000, p.fame + Math.round(Math.max(0, p.total - 3800) / 900) + (p.status === "pro" ? 1 : 0));
    if (p.status === "amateur" && p.total >= 4100 && rand() < 0.06) {
      p.status = "semipro"; p.fame += 25;
      news(w, s.day, "🎓", `${p.name}, 커리지 매치 우승으로 준프로 자격 획득${p.star ? " (괴물 유망주!)" : ""}`);
    } else if (p.status === "semipro" && p.total >= 4500 && rand() < 0.07) {
      const t = pick(PRO_TEAMS);
      p.status = "pro"; p.team = t.id; p.squad = 2; p.fame += 40;
      news(w, s.day, "🏢", `${p.name}, ${t.name} 입단!`);
    } else if (p.status === "pro" && p.squad === 2 && p.total >= 5400 && rand() < 0.06) {
      p.squad = 1; p.fame += 20;
      news(w, s.day, "⬆️", `${p.name}, ${ORIG_TEAMS[p.team!].short} 1군 승격`);
    } else if (p.status === "pro" && rand() < 0.01) {
      const t = pick(PRO_TEAMS.filter(x => x.id !== p.team));
      news(w, s.day, "✈️", `${p.name}, ${ORIG_TEAMS[p.team!].short} → ${t.name} 이적`);
      p.team = t.id;
    } else if (p.status === "pro" && p.squad === 1 && p.total >= 6100 && rand() < 0.015) {
      p.titles++; p.fame += 40;
      news(w, s.day, "🏆", `${p.name}, 개인리그 우승! (통산 ${p.titles}회)`);
    }
  }
  // 가끔 새 유망주가 등장
  if (w.peers.length < 32 && rand() < 0.03) {
    const star = rand() < 0.35;
    const p = newPeer(w, s, star, sumStats(s.startStats) + 200);
    w.peers.push(p);
    news(w, s.day, star ? "🌟" : "🌱", star ? `괴물 신인 ${p.name} 등장! PC방가가 술렁입니다` : `새로운 유망주 ${p.name}이(가) 래더에 등장했습니다`);
  }
}

/** 또래 랭킹에서 내 순위 (능력치 합 기준, 1부터) */
export function myPeerRank(s: RookieState) {
  const w = ensureWorld(s);
  const me = sumStats(s.stats);
  return w.peers.filter(p => p.total > me).length + 1;
}

// ── 시즌 목표 ────────────────────────────────────────────────────
const podiums = (s: RookieState) => s.titles.filter(t => /(우승|준우승|3위)$/.test(t) && !/입단|이적|결렬/.test(t)).length;
function baseOf(s: RookieState): GoalBase {
  return { ladderBest: s.ladder.best, wins: s.record.w, proW: s.counts.proW, podiums: podiums(s) };
}
/** 신분에 맞는 목표 3개 */
function makeGoals(s: RookieState): Goal[] {
  const r = (fame: number, money: number, exp: number) => ({ fame, money, exp });
  const ladder: Goal = { kind: "ladder", text: `래더 최고 점수 ${Math.max(1600, s.ladder.best + 150)}점`, target: Math.max(1600, s.ladder.best + 150), reward: r(15, 30, 120) };
  if (s.status === "amateur") {
    return [
      { kind: "semipro", text: "커리지 매치 우승 (준프로 되기)", target: 1, reward: r(30, 60, 200) },
      ladder,
      s.clan ? { kind: "podium", text: "대회 입상 2번", target: 2, reward: r(20, 40, 150) } : { kind: "clan", text: "클랜 가입", target: 1, reward: r(10, 20, 80) },
    ];
  }
  if (s.status === "semipro") {
    return [
      { kind: "pro", text: "프로 구단 입단", target: 1, reward: r(30, 80, 250) },
      ladder,
      { kind: "rating", text: "평균 평점 7.0 이상 (30경기 이상)", target: 7, reward: r(15, 40, 120) },
    ];
  }
  if (s.team?.squad === 2) {
    return [
      { kind: "squad1", text: "1군 승격", target: 1, reward: r(25, 60, 200) },
      { kind: "rating", text: "평균 평점 7.0 이상 (30경기 이상)", target: 7, reward: r(15, 40, 120) },
      { kind: "wins", text: "올해 150승", target: 150, reward: r(10, 30, 100) },
    ];
  }
  return [
    { kind: "proW", text: "올해 프로리그 10승", target: 10, reward: r(30, 100, 250) },
    { kind: "starter", text: "1군 주전 이상 자리 잡기", target: 1, reward: r(20, 60, 150) },
    { kind: "mom", text: "MOM(평점 8.5↑) 5번", target: 5, reward: r(20, 50, 150) },
  ];
}
/** 목표 진행도 [지금, 목표] */
export function goalProgress(s: RookieState, g: Goal): [number, number] {
  const b = s.goals!.base;
  const st = s.seasons?.[ymd(s.day).y];
  switch (g.kind) {
    case "ladder": return [s.ladder.best, g.target];
    case "wins": return [s.record.w - b.wins, g.target];
    case "semipro": return [s.status !== "amateur" ? 1 : 0, 1];
    case "clan": return [s.clan ? 1 : 0, 1];
    case "rating": return [st && st.g >= 30 ? Math.round((st.sum / st.g) * 10) / 10 : 0, g.target];
    case "podium": return [podiums(s) - b.podiums, g.target];
    case "pro": return [s.status === "pro" ? 1 : 0, 1];
    case "squad1": return [s.team?.squad === 1 ? 1 : 0, 1];
    case "proW": return [s.counts.proW - b.proW, g.target];
    case "mom": return [st?.mom ?? 0, g.target];
    case "starter": { const role = myRole(s); return [role && ROLES[role].entry >= ROLES.starter.entry ? 1 : 0, 1]; }
  }
}
/** 올해 목표가 없으면 만듦 */
export function ensureGoals(s: RookieState) {
  const y = ymd(s.day).y;
  if (s.goals?.year === y) return;
  s.goals = { year: y, list: makeGoals(s), base: baseOf(s) };
  sendMail(s, { from: "coach", sender: s.team ? `${ORIG_TEAMS[s.team.team].short} 감독` : "나 자신", title: `${y}년 목표`, body: `올해 목표:\n${s.goals.list.map(g => `· ${g.text}`).join("\n")}\n\n달성할 때마다 보상이 있고, 연말에 평가합니다.` });
}
/** 날마다: 달성한 목표 보상 */
export function checkGoals(s: RookieState) {
  if (!s.goals) return;
  for (const g of s.goals.list) {
    if (g.done) continue;
    const [now, target] = goalProgress(s, g);
    if (now < target) continue;
    g.done = true;
    s.fame = Math.min(1000, s.fame + g.reward.fame);
    s.money += g.reward.money;
    gainExp(s, g.reward.exp);
    log(s, "🎯", `목표 달성: ${g.text}! 인지도 +${g.reward.fame}, ${g.reward.money}만원, 경험치 +${g.reward.exp}`);
  }
}
/** 연말(1/1): 지난해 목표 평가 · 또래 시상 */
export function yearReview(s: RookieState) {
  const g = s.goals;
  const prev = ymd(s.day - 1).y;
  if (g && g.year === prev && !g.graded) {
    g.graded = true;
    const done = g.list.filter(x => x.done).length;
    const grade = goalGrade(done, g.list.length);
    s.morale = Math.max(0, Math.min(100, s.morale + ({ A: 10, B: 4, C: -2, D: -6 } as Record<string, number>)[grade]));
    sendMail(s, {
      from: s.team ? "coach" : "family", sender: s.team ? `${ORIG_TEAMS[s.team.team].short} 감독` : "부모님", title: `${prev}년 평가: ${grade}`,
      body: `${g.list.map(x => `${x.done ? "✅" : "❌"} ${x.text}`).join("\n")}\n\n${grade === "A" ? "완벽한 한 해였다. 자랑스럽다!" : grade === "B" ? "좋은 한 해였다. 내년엔 더 높이." : grade === "C" ? "아쉬움이 남는 한 해였다." : "많이 힘들었지? 내년엔 다시 해 보자."}`,
    });
    log(s, "📋", `${prev}년 목표 평가 ${grade} (${done}/${g.list.length})`);
  }
  // 한 해 돌아보기: 전적·평균 평점·성장·명경기
  const st = s.seasons?.[prev];
  if (st && st.g > 0 && !(s.flags?.review === prev)) {
    (s.flags ??= {}).review = prev;
    const startDay = dayOf(prev, 1, 1);
    const atStart = [...s.history].reverse().find(h => h[0] <= startDay)?.[1] ?? sumStats(s.startStats);
    const grow = sumStats(s.stats) - atStart;
    const best = (st.top ?? []).map((x, i) => `${["🥇", "🥈", "🥉"][i]} ${dateText(x.d)} ${x.t} (평점 ${x.r.toFixed(1)})`).join("\n");
    sendMail(s, {
      from: "media", sender: "연말 결산", title: `${prev}년 돌아보기`,
      body: `${st.g}경기 ${st.w}승 ${st.g - st.w}패 (승률 ${Math.round((st.w / st.g) * 100)}%) · 평균 평점 ${(st.sum / st.g).toFixed(2)} · 경기 MVP ${st.mom}번\n능력치 ${grow >= 0 ? "+" : ""}${grow.toLocaleString()} (지금 ${sumStats(s.stats).toLocaleString()})\n\n올해의 명경기\n${best || "아직 없음"}`,
    });
  }
  // 또래 시상: 올해의 신성 (또래 중 능력치 1위)
  const w = ensureWorld(s);
  const rank = myPeerRank(s);
  const top = [...w.peers].sort((a, b) => b.total - a.total)[0];
  if (rank === 1) {
    s.fame = Math.min(1000, s.fame + 30);
    s.titles.unshift(`${prev} 올해의 신성`);
    news(w, s.day, "🏅", `${prev} 올해의 신성: ${s.name}!`);
    sendMail(s, { from: "media", sender: "e스포츠 시상식", title: `${prev} 올해의 신성 수상!`, body: `또래 ${w.peers.length + 1}명 중 가장 뛰어난 선수로 뽑혔습니다. 인지도 +30` });
  } else if (top) {
    news(w, s.day, "🏅", `${prev} 올해의 신성: ${top.name} (나는 ${rank}위)`);
  }
}

// ── 은퇴 · 후배 이어하기 ──────────────────────────────────────────
/** 은퇴: 데뷔 1년 뒤부터. 경력 점수를 매겨 명예의 전당에 올림 */
export function retire(s: RookieState): HofEntry {
  if (s.retired) throw new RookieError("이미 은퇴했습니다");
  if (s.day < RETIRE_MIN_DAYS) throw new RookieError(`은퇴는 데뷔 1년이 지나야 할 수 있습니다 (${RETIRE_MIN_DAYS - s.day}일 남음)`);
  if (s.bracket || s.war) throw new RookieError("진행 중인 대회·클랜전을 마친 뒤 은퇴할 수 있습니다");
  const peak = Math.max(sumStats(s.stats), ...s.history.map(h => h[1]));
  const titles = s.titles.filter(t => /우승$/.test(t) && !/준우승$/.test(t)).length;
  const base = { peak, titles, proW: s.counts.proW, fame: s.fame, badges: Object.keys(s.achievements).length, years: Math.max(1, Math.floor(s.day / 365)) };
  const entry: HofEntry = { name: s.name, race: s.race, status: s.status === "pro" ? (s.team?.squad === 1 ? "1군 프로" : "프로") : s.status === "semipro" ? "준프로" : "아마추어", ...base, score: legacyScore(base), ...(s.team ? { team: s.team.team } : {}), ...(s.legacy ? { from: s.legacy.from } : {}) };
  s.retired = `${dateText(s.day)} 은퇴 · 경력 점수 ${entry.score}`;
  log(s, "🎖️", `은퇴했습니다. 경력 점수 ${entry.score} (최고 능력치 ${peak.toLocaleString()} · 우승 ${titles} · 프로리그 ${base.proW}승)`);
  return entry;
}
/** 후배: 은퇴한 선배에게서 돈 일부·인지도 일부·조언(성격 하나 공개, 프로의식 +1)을 물려받음 */
export function applyLegacy(s: RookieState, old: RookieState) {
  const money = Math.min(LEGACY_MONEY.max, Math.round(old.money * LEGACY_MONEY.rate));
  const fame = Math.round(old.fame * LEGACY_FAME);
  s.money += money;
  s.fame = Math.min(1000, s.fame + fame);
  s.legacy = { from: old.name, score: Number(/경력 점수 (\d+)/.exec(old.retired ?? "")?.[1] ?? 0) };
  if (s.persona) s.persona.prof = Math.min(20, s.persona.prof + 1);
  const k = pick(TRAIT_KEYS);
  (s.known ??= {})[k] = 1;
  s.log.unshift({ day: s.day, icon: "🤝", text: `은퇴한 선배 ${old.name}의 뒤를 잇습니다. 물려받은 돈 ${money}만원 · 인지도 +${fame} · 선배의 조언으로 프로의식 +1` });
}
