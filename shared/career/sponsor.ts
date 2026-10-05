/**
 * 스폰서: 시즌마다 제안 3개 중 하나를 고른다. 주마다 후원금 + 퀘스트를 달성하면 보상금
 * 퀘스트 목표를 올리면 보상이 커지고, 낮추면 줄어든다
 */
import { FREE_AGENT_TEAM } from "./originalData";
import { ageOf, totalOf, type CareerState, type Race } from "./rules";
import { myDiv, rosterOf, standings } from "./view";
import { seeded } from "./contract";
import { levelPerks, managerLevel } from "./mainSponsor";

export type QuestKind = "teamWins" | "setWins" | "playerWins" | "playerApps" | "rank" | "mslRo16" | "mslRo8" | "raceWins" | "youthApps";
export interface SponsorQuest {
  kind: QuestKind;
  /** 기본 목표 (조정의 기준) */
  base: number;
  target: number;
  /** 기본 목표일 때 보상 */
  baseReward: number;
  player?: number;
  /** raceWins: 이 종족 우리 선수들의 시즌 승수 합 */
  race?: Race;
  done?: boolean;
}
/** 제의 종류: 후원금형 · 균형형 · 퀘스트형 · 계약금형(계약 때 한 번에) · 승리수당형(프로리그 이길 때마다) */
export type SponsorStyle = "weekly" | "balanced" | "quest" | "signing" | "winBonus";
export const SPONSOR_STYLE_NAMES: Record<SponsorStyle, string> = { weekly: "후원금형", balanced: "균형형", quest: "퀘스트형", signing: "계약금형", winBonus: "승리수당형" };
export interface Sponsor {
  name: string;
  weekly: number;
  quests: SponsorQuest[];
  style?: SponsorStyle;
  /** 계약하자마자 받는 계약금 */
  signing?: number;
  /** 프로리그 경기를 이길 때마다 받는 수당 */
  winBonus?: number;
}

const NAMES = ["블루전자", "넥스트통신", "하이퍼PC방", "에이스음료", "스타치킨", "우주항공", "번개택배", "코스모게임즈", "라이트닝카드", "초코바이츠",
  "드래곤마우스", "제로콜라", "한빛보험", "은하은행", "썬더모바일", "미르패션", "레드불꽃에너지", "아크로자동차", "별빛베이커리", "스텔라호텔"];
const RACE_KO: Record<Race, string> = { terran: "테란", zerg: "저그", protoss: "프로토스" };

/** 목표를 얼마나 올리고 내릴 수 있는지 */
export function questRange(q: SponsorQuest): [number, number] {
  if (q.kind === "rank") return [1, 8];
  return [Math.max(1, Math.round(q.base * 0.5)), Math.round(q.base * 1.6)];
}
/** 목표에 따른 보상 (어려울수록 더 많이) */
export function questReward(q: SponsorQuest, target = q.target): number {
  const ratio = q.kind === "rank" ? q.base / target : target / q.base;
  return Math.max(10, Math.round((q.baseReward * Math.pow(ratio, 1.6)) / 10) * 10);
}

export function questLabel(s: CareerState, q: SponsorQuest, target = q.target): string {
  const p = q.player !== undefined ? s.players[q.player] : undefined;
  switch (q.kind) {
    case "teamWins": return `프로리그 ${target}승`;
    case "setWins": return `프로리그 세트 ${target}승`;
    case "playerWins": return `${p?.name ?? "?"} 선수 시즌 ${target}승`;
    case "playerApps": return `${p?.name ?? "?"} 선수 프로리그 ${target}경기 출전`;
    case "rank": return `정규시즌 ${target}위 이내`;
    case "mslRo16": return `개인리그 16강에 우리 선수 ${target}명`;
    case "mslRo8": return `개인리그 8강에 우리 선수 ${target}명`;
    case "raceWins": return `우리 ${RACE_KO[q.race ?? "terran"]} 선수들 시즌 합계 ${target}승`;
    case "youthApps": return `21세 이하 선수 프로리그 출전 합계 ${target}경기`;
  }
}

/** 퀘스트 진행도 (지금 값, 달성 여부) */
export function questProgress(s: CareerState, q: SponsorQuest): { now: number; done: boolean } {
  const me = s.teams[s.myTeam];
  const p = q.player !== undefined ? s.players[q.player] : undefined;
  switch (q.kind) {
    case "teamWins": return { now: me.wins, done: me.wins >= q.target };
    case "setWins": return { now: me.setWins, done: me.setWins >= q.target };
    case "playerWins": return { now: p?.sWins ?? 0, done: (p?.sWins ?? 0) >= q.target };
    case "playerApps": return { now: p?.sApps ?? 0, done: (p?.sApps ?? 0) >= q.target };
    case "rank": {
      const rank = standings(s).findIndex(t => t.id === s.myTeam) + 1;
      // 순위 퀘스트는 정규시즌이 끝나야 판정
      return { now: rank, done: s.phase !== "regular" && rank <= q.target };
    }
    case "mslRo16":
    case "mslRo8": {
      const round = s.msl?.season === s.season ? s.msl.bracket.find(b => b.round === (q.kind === "mslRo16" ? "ro16" : "ro8")) : undefined;
      const n = round ? new Set(round.series.flatMap(x => [x.a, x.b]).filter(id => s.players[id]?.team === s.myTeam)).size : 0;
      return { now: n, done: n >= q.target };
    }
    case "raceWins": {
      const n = rosterOf(s, s.myTeam).filter(x => x.race === q.race).reduce((a, x) => a + x.sWins, 0);
      return { now: n, done: n >= q.target };
    }
    case "youthApps": {
      const n = rosterOf(s, s.myTeam).filter(x => ageOf(x, s.season) <= 21).reduce((a, x) => a + (x.sApps ?? 0), 0);
      return { now: n, done: n >= q.target };
    }
  }
}

/** 한 시즌에 계약할 수 있는 서브 스폰서 수 (1부) */
export const MAX_SPONSORS = 3;
/** 우리 팀이 계약할 수 있는 서브 스폰서 수: 2부는 1곳 */
export const maxSponsors = (s: CareerState) => (myDiv(s) === 2 ? 1 : MAX_SPONSORS);

/**
 * 이번 시즌 스폰서 제의 수 (1~10): 지난 시즌 순위가 좋을수록, 감독 명성·레벨이 높을수록 많이 온다
 * 첫 시즌은 팀 전력 순위로 판단
 */
export function sponsorOfferCount(s: CareerState): { count: number; basis: string } {
  const last = s.history[0];
  const teams = standings(s).length || 12;
  let rank: number, basis: string;
  if (last) { rank = last.myRank; basis = `지난 시즌 ${last.myRank}위`; }
  else {
    const byPower = [...standings(s)].map(t => t.id).sort((a, b) => teamPowerOf(s, b) - teamPowerOf(s, a));
    rank = byPower.indexOf(s.myTeam) + 1 || Math.ceil(teams / 2);
    basis = `팀 전력 ${rank}위`;
  }
  const rep = s.manager?.reputation ?? 50;
  const lv = managerLevel(s);
  const raw = 10 - (rank - 1) * (8 / Math.max(1, teams - 1)) + (rep - 50) / 20 + (lv - 1) * 0.3;
  // 2부는 제의가 적게 옴
  return { count: Math.max(1, Math.min(myDiv(s) === 2 ? 4 : 10, Math.round(raw))), basis };
}

/** 우리 팀에 가장 많은 종족 선수들의 시즌 승수 퀘스트 */
function raceQuest(s: CareerState, r: number): SponsorQuest[] {
  const roster = rosterOf(s, s.myTeam);
  const races: Race[] = ["terran", "zerg", "protoss"];
  const counts = races.map(x => roster.filter(p => p.race === x).length);
  const pick = races.filter((_, i) => counts[i] >= 3);
  if (!pick.length) return [];
  const race = pick[Math.floor(r * pick.length)];
  const base = Math.max(6, Math.round(counts[races.indexOf(race)] * 3));
  return [{ kind: "raceWins", base, target: base, baseReward: 300, race }];
}

const teamPowerOf = (s: CareerState, team: number) => rosterOf(s, team).map(p => totalOf(p.stats)).sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0);

/** 이번 시즌 스폰서 제의 (팀 전력에 맞춰 목표를 정함). 최대 3곳과 계약 */
export function sponsorOffers(s: CareerState): Sponsor[] {
  const roster = rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  const rank = standings(s).findIndex(t => t.id === s.myTeam) + 1 || 6;
  const { count } = sponsorOfferCount(s);
  // 이름이 겹치지 않도록 시즌마다 섞은 순서
  const names = NAMES.map((n, i) => ({ n, o: seeded(s.season, s.myTeam, 99, i) })).sort((a, b) => a.o - b.o).map(x => x.n);
  const out: Sponsor[] = [];
  for (let k = 0; k < count; k++) {
    const r = (i: number) => seeded(s.season, s.myTeam, k, i);
    const name = names[k % names.length];
    const star = roster[Math.floor(r(1) * Math.min(3, roster.length))];
    const young = roster[Math.min(roster.length - 1, 4 + Math.floor(r(2) * Math.max(1, roster.length - 4)))];
    const pool: SponsorQuest[] = [
      { kind: "teamWins", base: 11, target: 11, baseReward: 400 },
      { kind: "setWins", base: 36, target: 36, baseReward: 300 },
      ...(star && star.team !== FREE_AGENT_TEAM ? [{ kind: "playerWins" as const, base: 12, target: 12, baseReward: 300, player: star.id }] : []),
      ...(young ? [{ kind: "playerApps" as const, base: 6, target: 6, baseReward: 200, player: young.id }] : []),
      { kind: "rank", base: Math.max(2, Math.min(6, rank || 6)), target: Math.max(2, Math.min(6, rank || 6)), baseReward: 350 },
      { kind: "mslRo16", base: 1, target: 1, baseReward: 300 },
      { kind: "mslRo8", base: 1, target: 1, baseReward: 450 },
      ...raceQuest(s, r(3)),
      ...(roster.some(x => ageOf(x, s.season) <= 21) ? [{ kind: "youthApps" as const, base: 8, target: 8, baseReward: 250 }] : []),
    ];
    // 제의마다 퀘스트 2~3개, 후원금이 많으면 퀘스트 보상은 적게 (3곳까지 계약하므로 한 곳 금액은 예전 한 곳보다 작게)
    const nq = r(20) < 0.5 ? 2 : 3;
    const quests = pool.map((q, i) => ({ q, o: r(10 + i) })).sort((a, b) => a.o - b.o).slice(0, nq).map(x => x.q);
    const perk = levelPerks(managerLevel(s)).sponsor;
    const styles: SponsorStyle[] = ["weekly", "balanced", "quest", "signing", "winBonus"];
    const style = styles[Math.floor(r(0) * styles.length)];
    const si = { weekly: 0, balanced: 1, quest: 2, signing: 3, winBonus: 4 }[style];
    // 2부 스폰서는 규모가 작음
    const scale = myDiv(s) === 2 ? 0.7 : 1;
    const jitter = 0.85 + r(21) * 0.3;
    const weekly = Math.round([42, 30, 20, 12, 14][si] * jitter * perk * scale);
    const mul = [0.45, 0.65, 0.9, 0.55, 0.55][si] * perk * scale;
    const extra: Partial<Sponsor> = style === "signing" ? { signing: Math.round((260 * jitter * perk * scale) / 10) * 10 }
      : style === "winBonus" ? { winBonus: Math.round(18 * jitter * perk * scale) } : {};
    out.push({ name, weekly, style, ...extra, quests: quests.map(q => ({ ...q, baseReward: Math.round((q.baseReward * mul) / 10) * 10 })) });
  }
  return out;
}

/** 이번 시즌 계약한 서브 스폰서들 (예전 세이브의 한 곳짜리 포함) */
export function activeSponsors(s: CareerState): Array<Sponsor & { season: number }> {
  const list = (s.sponsors ?? []).filter(x => x.season === s.season);
  if (!list.length && s.sponsor?.season === s.season) return [s.sponsor];
  return list;
}
