/**
 * 세대 교체: 성장 한계(잠재력), 은퇴, 신인 등장
 * - 원작은 시즌이 지날수록 모두 능력치가 최고치가 되어버렸다 → 선수마다 성장 한계를 두고, 나이가 들면 은퇴
 * - 은퇴한 선수는 몇 시즌 뒤 어린 신인으로 다시 등장하고, 새 이름의 신인도 해마다 나온다
 */
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { FREE_AGENT_TEAM, ORIG_PLAYERS } from "@shared/career/originalData";
import { BASE_YEAR, ORIG_STAT_ORDER, ageOf, totalOf, type CareerState, type CPlayer, type Race } from "@shared/career/rules";
import { RETIRED, activePlayers } from "@shared/career/view";
import { clampStat, news, rand, randInt, shuffle } from "./core";

/** 잠재력이 없는 선수에게 부여 (나이가 어릴수록 여유가 큼) */
export function ensurePotential(s: CareerState) {
  for (const p of s.players) {
    if (p.potential !== undefined) continue;
    const age = ageOf(p, s.season);
    const total = totalOf(p.stats);
    p.potential = total + (age <= 20 ? randInt(500, 1100) : age <= 23 ? randInt(250, 700) : age <= 26 ? randInt(80, 300) : randInt(0, 80));
  }
}

/** 성장 배율: 잠재력에 가까울수록 잘 안 오름 */
export function growthRoom(p: CPlayer): number {
  if (!p.potential) return 1;
  const left = p.potential - totalOf(p.stats);
  return left <= 0 ? 0.1 : Math.min(1, 0.25 + left / 600);
}

/** 은퇴: 30세부터 확률, 34세 이상은 은퇴 */
export function retirements(s: CareerState): CPlayer[] {
  const out: CPlayer[] = [];
  for (const p of activePlayers(s)) {
    const age = ageOf(p, s.season);
    if (age < 30) continue;
    if (age < 34 && rand() > (age - 29) * 0.18) continue;
    const mine = p.team === s.myTeam;
    p.retired = s.season;
    p.team = RETIRED;
    p.reserve = false;
    p.action = null;
    delete p.contract;
    p.wantsOut = false;
    out.push(p);
    if (mine || totalOf(p.stats) >= 5600) news(s, `🎖️ ${p.name} 선수(${age}세) 은퇴${mine ? " — 우리 팀을 떠납니다" : ""}`);
  }
  return out;
}

const SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민".split("");
const SYLLABLES = "민준서현우진호성재영동훈수지태경상원석혁규철용기범찬연희빈율도윤건한결승유하정현우태".split("");

function newName(s: CareerState): string {
  const names = new Set(s.players.map(p => p.name));
  for (let i = 0; i < 50; i++) {
    const n = SURNAMES[randInt(0, SURNAMES.length - 1)] + SYLLABLES[randInt(0, SYLLABLES.length - 1)] + SYLLABLES[randInt(0, SYLLABLES.length - 1)];
    if (!names.has(n)) return n;
  }
  return `신인${s.players.length}`;
}

function makeRookie(s: CareerState, base: Partial<CPlayer> & { name: string; race: Race; stats: Record<StatKey, number>; potential: number }): CPlayer {
  const age = randInt(16, 18);
  const p: CPlayer = {
    id: s.players.length,
    team: FREE_AGENT_TEAM,
    level: 1, exp: 0, cond: randInt(5, 7),
    birth: BASE_YEAR + s.season - 1 - (age - 1),
    gender: "M",
    wins: 0, losses: 0, sWins: 0, sLosses: 0, action: null, titles: [],
    morale: 70, rookie: s.season,
    ...base,
  };
  s.players.push(p);
  return p;
}

/** 원작 초기 능력치 */
function originalStats(id: number): Record<StatKey, number> | undefined {
  const row = ORIG_PLAYERS[id];
  if (!row) return undefined;
  const values = row.slice(4, 12) as number[];
  return Object.fromEntries(ORIG_STAT_ORDER.map((k, i) => [k, values[i]])) as Record<StatKey, number>;
}

/** 신인 등장: 은퇴 3시즌이 지난 선수는 어린 신인으로 다시, 모자라면 새 이름 신인 */
export function rookies(s: CareerState, retiredNow: number) {
  const out: CPlayer[] = [];
  const legends = shuffle(s.players.filter(p => p.retired !== undefined && p.retired <= s.season - 3 && !p.reborn)).slice(0, 6);
  for (const old of legends) {
    old.reborn = true;
    const photo = old.photoOf ?? old.id;
    const orig = originalStats(photo) ?? old.stats;
    const stats = Object.fromEntries(STAT_KEYS.map(k => [k, clampStat(orig[k] * (0.62 + rand() * 0.12))])) as Record<StatKey, number>;
    out.push(makeRookie(s, { name: old.name, race: old.race, gender: old.gender, stats, photoOf: photo, potential: Math.round(totalOf(orig) * (0.92 + rand() * 0.2)) }));
  }
  const fresh = Math.max(4, retiredNow + 2 - out.length);
  for (let i = 0; i < fresh; i++) {
    const races: Race[] = ["terran", "zerg", "protoss"];
    const stats = Object.fromEntries(STAT_KEYS.map(k => [k, randInt(380, 600)])) as Record<StatKey, number>;
    out.push(makeRookie(s, { name: newName(s), race: races[randInt(0, 2)], stats, potential: randInt(4700, 6900) }));
  }
  const best = [...out].sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0)).slice(0, 3);
  news(s, `🌱 신인 ${out.length}명 등장! 주목할 유망주: ${best.map(p => `${p.name}(${p.rookie === s.season && p.photoOf !== undefined ? "레전드의 재림" : "신예"})`).join(", ")} — 이적시장 스카웃에서 확인`);
  return out;
}
