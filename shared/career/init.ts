/**
 * 원작 초기 데이터로 선수·팀 목록 만들기 (서버 새 게임과 클라이언트 팀 선택 미리보기 공용)
 */
import type { StatKey } from "../gameConstants";
import { ORIG_PLAYERS, ORIG_TEAMS } from "./originalData";
import { ORIG_STAT_ORDER, START_MONEY, WEEKLY_AP, type CareerState, type CPlayer, type Race } from "./rules";

const RACE: Record<string, Race> = { T: "terran", Z: "zerg", P: "protoss" };

export function initialPlayers(randCond: () => number = () => 5): CPlayer[] {
  return ORIG_PLAYERS.map((row, id) => {
    const [team, name, race, level, ...rest] = row;
    const values = rest.slice(0, 8) as number[];
    const stats = Object.fromEntries(ORIG_STAT_ORDER.map((k, i) => [k, values[i]])) as Record<StatKey, number>;
    return {
      id, name, race: RACE[race], team, stats, level, exp: 0,
      cond: randCond(), birth: rest[8] as number, gender: rest[9] as "M" | "F",
      wins: 0, losses: 0, sWins: 0, sLosses: 0, action: null, titles: [],
    };
  });
}

export function initialTeams(): CareerState["teams"] {
  return ORIG_TEAMS.map(t => ({ ...t, money: START_MONEY, wins: 0, losses: 0, setWins: 0, setLosses: 0 }));
}

/** 팀 선택 화면용 미리보기 (일정 없음) */
export function previewWorld(): CareerState {
  return {
    version: 1, myTeam: 0, season: 1, week: 1, phase: "regular", ap: WEEKLY_AP,
    players: initialPlayers(), teams: initialTeams(), matches: [], nextMatchId: 1, news: [], history: [],
  };
}
