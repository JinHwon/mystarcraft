/**
 * 커리어 상태에서 화면용 정보를 뽑는 함수들 (서버·클라이언트 공용, 게임 엔진과 무관)
 */
import { ORIG_MAPS, FREE_AGENT_TEAM } from "./originalData";
import type { CareerState, CMatch, CPlayer, Race } from "./rules";
import { B_TEAM_OFFSET, MIN_ROSTER, TRADE_ACE_PREMIUM, TRADE_PREMIUM, adaptWeeksLeft, totalOf, tradeValue } from "./rules";

/** 선수단 */
export const rosterOf = (s: CareerState, team: number) => s.players.filter(p => p.team === team && !p.reserve);
/** 이번 주 프로리그에 나갈 수 있는 선수 (적응기간 선수 제외, 그러면 엔트리를 못 짤 만큼 적으면 모두) */
export function proRosterOf(s: CareerState, team: number) {
  const all = rosterOf(s, team);
  const ok = all.filter(p => !adaptWeeksLeft(s, p));
  return ok.length >= MIN_ROSTER ? ok : all;
}
/** 은퇴하지 않은 선수 전체 (무소속 포함) */
export const activePlayers = (s: CareerState) => s.players.filter(p => p.team >= 0);
/** 은퇴 선수의 팀 번호 */
export const RETIRED = -1;
/** 리그 팀 전체 (1부·2부) */
export const proTeams = (s: CareerState) => s.teams.filter(t => t.id !== FREE_AGENT_TEAM);
/** 팀의 리그 (1부·2부) */
export const divOf = (s: CareerState, team: number): 1 | 2 => s.teams[team]?.div ?? 1;
/** 1부 구단의 B팀 번호 (없으면 undefined) */
export const bTeamIdOf = (s: CareerState, team: number) => {
  const id = team + B_TEAM_OFFSET;
  return s.teams[id]?.parent === team ? id : undefined;
};
/** 우리 팀 리그 */
export const myDiv = (s: CareerState) => divOf(s, s.myTeam);
/** 한 리그의 팀 */
export const divTeams = (s: CareerState, div: 1 | 2) => proTeams(s).filter(t => (t.div ?? 1) === div);
export const DIV_NAMES = { 1: "1부", 2: "2부" } as const;
/** 우리 리그 이름 (1부는 마이프로리그, 2부는 마이프로리그 2부) */
export const leagueName = (div: 1 | 2) => (div === 1 ? "마이프로리그" : "마이프로리그 2부");

/** 리그 순위 (div 를 안 주면 우리 팀 리그) */
export function standings(s: CareerState, div: 1 | 2 = myDiv(s)) {
  return divTeams(s, div).sort((x, y) =>
    y.wins - x.wins || (y.setWins - y.setLosses) - (x.setWins - x.setLosses) || y.setWins - x.setWins || x.id - y.id);
}

export function myPendingMatch(s: CareerState): CMatch | undefined {
  return s.matches.find(m => !m.done && m.week === s.week && (m.a === s.myTeam || m.b === s.myTeam));
}

/** 팀 전력: 상위 5명 능력치 합계 평균 */
export function teamPower(s: CareerState, team: number): number {
  const totals = rosterOf(s, team).map(p => totalOf(p.stats)).sort((a, b) => b - a).slice(0, 5);
  return totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
}

export const STAGE_NAMES: Record<CMatch["stage"], string> = {
  regular: "정규시즌", semi: "준플레이오프", po: "플레이오프", final: "결승", promo: "승강전",
};

export interface MapView {
  id: number; name: string;
  /** 러시거리·자원·복잡도 (100 = 보통) */
  rush: number; res: number; complexity: number;
  /** 앞 종족 승률 % (50 = 균형) */
  tvz: number; zvp: number; pvt: number;
}
export function mapView(id: number): MapView {
  const [name, tvz, zvp, pvt, rush, res, complexity] = ORIG_MAPS[id];
  return { id, name, rush, res, complexity, tvz, zvp, pvt };
}

/** 맵에서 race 가 상대 종족 vs 에 대해 갖는 승률 % (50 = 균형) */
export function matchupValue(mapId: number, race: Race, vs: Race): number {
  if (race === vs) return 50;
  const m = mapView(mapId);
  const t: Record<string, number> = {
    terran_zerg: m.tvz, zerg_terran: 100 - m.tvz,
    zerg_protoss: m.zvp, protoss_zerg: 100 - m.zvp,
    protoss_terran: m.pvt, terran_protoss: 100 - m.pvt,
  };
  return t[`${race}_${vs}`] ?? 50;
}

/** 트레이드 평가: AI 가 받는 가치 / 요구하는 가치 (1 이상이면 수락) */
export function evaluateTrade(s: CareerState, teamId: number, myIds: number[], theirIds: number[], cash: number) {
  const give = theirIds.reduce((sum, id) => sum + tradeValue(s.players[id], s.season), 0);
  const get = myIds.reduce((sum, id) => sum + tradeValue(s.players[id], s.season), 0) + cash;
  const ace = rosterOf(s, teamId).sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
  const premium = ace && theirIds.includes(ace.id) ? TRADE_ACE_PREMIUM : TRADE_PREMIUM;
  const need = Math.round(give * premium);
  return { give, get, need, ratio: need > 0 ? get / need : 0, acesInvolved: premium === TRADE_ACE_PREMIUM };
}

/** p 가 o 를 상대로 거둔 전적 [승, 패] (우리 팀 선수 쪽 기록을 뒤집어서도 찾음) */
export function headToHead(p: CPlayer, o: CPlayer): [number, number] {
  const mine = p.h2h?.[o.id];
  if (mine) return mine;
  const theirs = o.h2h?.[p.id];
  return theirs ? [theirs[1], theirs[0]] : [0, 0];
}
