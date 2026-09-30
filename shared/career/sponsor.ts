/**
 * 스폰서: 시즌마다 제안 3개 중 하나를 고른다. 주마다 후원금 + 퀘스트를 달성하면 보상금
 * 퀘스트 목표를 올리면 보상이 커지고, 낮추면 줄어든다
 */
import { FREE_AGENT_TEAM } from "./originalData";
import { totalOf, type CareerState } from "./rules";
import { rosterOf, standings } from "./view";
import { seeded } from "./contract";

export type QuestKind = "teamWins" | "setWins" | "playerWins" | "playerApps" | "rank" | "mslRo16";
export interface SponsorQuest {
  kind: QuestKind;
  /** 기본 목표 (조정의 기준) */
  base: number;
  target: number;
  /** 기본 목표일 때 보상 */
  baseReward: number;
  player?: number;
  done?: boolean;
}
export interface Sponsor {
  name: string;
  weekly: number;
  quests: SponsorQuest[];
}

const NAMES = ["블루전자", "넥스트통신", "하이퍼PC방", "에이스음료", "스타치킨", "우주항공", "번개택배", "코스모게임즈", "라이트닝카드", "초코바이츠"];

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
    case "mslRo16": {
      const ro16 = s.msl?.season === s.season ? s.msl.bracket.find(b => b.round === "ro16") : undefined;
      const n = ro16 ? new Set(ro16.series.flatMap(x => [x.a, x.b]).filter(id => s.players[id]?.team === s.myTeam)).size : 0;
      return { now: n, done: n >= q.target };
    }
  }
}

/** 이번 시즌 스폰서 제안 3개 (팀 전력에 맞춰 목표를 정함) */
export function sponsorOffers(s: CareerState): Sponsor[] {
  const roster = rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  const rank = standings(s).findIndex(t => t.id === s.myTeam) + 1 || 6;
  const out: Sponsor[] = [];
  for (let k = 0; k < 3; k++) {
    const r = (i: number) => seeded(s.season, s.myTeam, k, i);
    const name = NAMES[Math.floor(r(0) * NAMES.length + k * 3) % NAMES.length];
    const star = roster[Math.floor(r(1) * Math.min(3, roster.length))];
    const young = roster[Math.min(roster.length - 1, 4 + Math.floor(r(2) * Math.max(1, roster.length - 4)))];
    const pool: SponsorQuest[] = [
      { kind: "teamWins", base: 11, target: 11, baseReward: 400 },
      { kind: "setWins", base: 36, target: 36, baseReward: 300 },
      ...(star && star.team !== FREE_AGENT_TEAM ? [{ kind: "playerWins" as const, base: 12, target: 12, baseReward: 300, player: star.id }] : []),
      ...(young ? [{ kind: "playerApps" as const, base: 6, target: 6, baseReward: 200, player: young.id }] : []),
      { kind: "rank", base: Math.max(2, Math.min(6, rank || 6)), target: Math.max(2, Math.min(6, rank || 6)), baseReward: 350 },
      { kind: "mslRo16", base: 1, target: 1, baseReward: 300 },
    ];
    // 제안마다 퀘스트 3개, 후원금이 많으면 퀘스트 보상은 적게
    const quests = pool.map((q, i) => ({ q, o: r(10 + i) })).sort((a, b) => a.o - b.o).slice(0, 3).map(x => x.q);
    const weekly = [70, 50, 35][k];
    const mul = [0.8, 1.1, 1.5][k];
    out.push({ name, weekly, quests: quests.map(q => ({ ...q, baseReward: Math.round((q.baseReward * mul) / 10) * 10 })) });
  }
  return out;
}
