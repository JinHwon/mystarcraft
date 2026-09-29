/**
 * 커리어 상태에서 화면용 정보를 뽑는 함수들 (서버·클라이언트 공용, 게임 엔진과 무관)
 */
import { ORIG_MAPS, FREE_AGENT_TEAM } from "./originalData";
import type { CareerState, CMatch, Race } from "./rules";
import { totalOf } from "./rules";

export const rosterOf = (s: CareerState, team: number) => s.players.filter(p => p.team === team);
export const proTeams = (s: CareerState) => s.teams.filter(t => t.id !== FREE_AGENT_TEAM);

export function standings(s: CareerState) {
  return [...proTeams(s)].sort((x, y) =>
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
  regular: "정규시즌", semi: "준플레이오프", po: "플레이오프", final: "결승",
};

export interface MapView {
  id: number; name: string; rush: number; res: number; complexity: number;
  tvz: number; zvp: number; pvt: number;
}
export function mapView(id: number): MapView {
  const [name, rush, res, complexity, tvz, zvp, pvt] = ORIG_MAPS[id];
  return { id, name, rush, res, complexity, tvz, zvp, pvt };
}

/** 맵에서 race 가 상대 종족 vs 에 대해 갖는 상성 (100 = 균형) */
export function matchupValue(mapId: number, race: Race, vs: Race): number {
  if (race === vs) return 100;
  const m = mapView(mapId);
  const t: Record<string, number> = {
    terran_zerg: m.tvz, zerg_terran: 200 - m.tvz,
    zerg_protoss: m.zvp, protoss_zerg: 200 - m.zvp,
    protoss_terran: m.pvt, terran_protoss: 200 - m.pvt,
  };
  return t[`${race}_${vs}`] ?? 100;
}
