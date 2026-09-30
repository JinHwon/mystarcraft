/**
 * 계약·연봉·출전 기대치 (서버·화면 공용, 결정적 계산)
 */
import { FREE_AGENT_TEAM } from "./originalData";
import { ageOf, askingPrice, totalOf, type BonusKey, type CareerState, type Contract, type CPlayer } from "./rules";
import { rosterOf } from "./view";

/** 결정적 난수 (0~1): 같은 선수·시즌이면 같은 값 */
export function seeded(...keys: number[]): number {
  let h = 2166136261;
  for (const k of keys) { h ^= k + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 10000) / 10000;
}

const round10 = (v: number) => Math.round(v / 10) * 10;

/** 기본 연봉 (만원/시즌): 선수 가치의 10% (20~300) */
export function baseSalary(p: CPlayer, season: number): number {
  return Math.max(20, Math.min(300, round10(askingPrice(p, season) * 0.1)));
}

export function defaultContract(p: CPlayer, season: number): Contract {
  const age = ageOf(p, season);
  return { salary: baseSalary(p, season), years: age <= 22 ? 3 : age >= 28 ? 1 : 2 };
}

/** 팀 안 능력치 순위 (0 = 최고) */
export function squadRank(s: CareerState, p: CPlayer): number {
  return rosterOf(s, p.team).sort((a, b) => totalOf(b.stats) - totalOf(a.stats)).findIndex(x => x.id === p.id);
}

/** 선수가 기대하는 출전 비율 (팀 경기 중 몇 %에 나오길 바라는지) */
export function expectedShare(rank: number): number {
  return rank < 4 ? 0.5 : rank < 7 ? 0.25 : 0.05;
}

/**
 * 선수가 요구하는 계약 조건
 * - 연봉: 기본 연봉 × (이적이면 1.15, 재계약인데 이적 희망이면 1.3)
 * - 주전급(팀 내 상위)으로 갈 선수는 출전 보장, 능력 좋은 선수는 성과 보너스를 요구
 */
export function playerDemand(s: CareerState, p: CPlayer, forTeam: number): Contract {
  const base = baseSalary(p, s.season);
  const moving = p.team !== forTeam;
  const r = seeded(p.id, s.season, forTeam);
  const mul = moving ? 1.15 + r * 0.15 : p.wantsOut ? 1.3 : 1 + r * 0.1;
  const salary = round10(base * mul);
  const age = ageOf(p, s.season);
  const years = age <= 22 ? 3 : age >= 28 ? 1 : 2;
  // 새 팀에서의 예상 순위
  const others = rosterOf(s, forTeam).filter(x => x.id !== p.id);
  const rank = others.filter(x => totalOf(x.stats) > totalOf(p.stats)).length;
  const c: Contract = { salary, years };
  if (rank < 5 && p.team !== FREE_AGENT_TEAM) c.minApps = rank < 3 ? 7 : 5;
  const total = totalOf(p.stats);
  const bonus: Partial<Record<BonusKey, number>> = {};
  if (total >= 5600) bonus.mslTitle = round10(salary * 0.5);
  if (total >= 5300) bonus.topRank = round10(salary * 0.2);
  if (rank < 3) bonus.proTitle = round10(salary * 0.3);
  if (total >= 5900) bonus.mostWins = round10(salary * 0.3);
  if (Object.keys(bonus).length) c.bonus = bonus;
  return c;
}

/** 보너스를 선수가 연봉처럼 느끼는 비율 */
const BONUS_WEIGHT: Record<BonusKey, number> = { proTitle: 0.25, mslTitle: 0.15, mostWins: 0.2, topRank: 0.3 };

/** 선수 입장에서 계약의 가치 (demand 대비) */
export function contractScore(offer: Contract, demand: Contract): { score: number; need: number } {
  const credit = (c: Contract) => Object.entries(c.bonus ?? {}).reduce((sum, [k, v]) => sum + (v ?? 0) * BONUS_WEIGHT[k as BonusKey], 0);
  let need = demand.salary + credit(demand);
  if ((offer.minApps ?? 0) < (demand.minApps ?? 0)) need += ((demand.minApps ?? 0) - (offer.minApps ?? 0)) * demand.salary * 0.05;
  need += Math.abs(offer.years - demand.years) * demand.salary * 0.06;
  return { score: offer.salary + credit(offer), need };
}

/** 주급 (정규시즌 주마다) */
export function weeklyWage(p: CPlayer): number {
  return Math.round((p.contract?.salary ?? 0) / 11);
}
export function teamWages(s: CareerState, team: number): number {
  return rosterOf(s, team).reduce((sum, p) => sum + (p.contract?.salary ?? 0), 0);
}

/** 다른 팀이 선수를 내줄 최소 이적료 (이 금액 이상이면 합의) */
export function sellMinimum(s: CareerState, p: CPlayer): number {
  const v = askingPrice(p, s.season);
  const roster = rosterOf(s, p.team).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  const ace = roster[0]?.id === p.id;
  const mul = (ace ? 1.4 : 1.1) * (p.wantsOut ? 0.8 : 1) * (0.95 + seeded(p.id, s.season, 7) * 0.15);
  return round10(v * mul);
}

/** 감독 평판에 따라 제의할 수 있는 팀 (강팀일수록 높은 평판 필요) */
export function jobThreshold(powerRank: number): number {
  return 85 - powerRank * 6;
}
