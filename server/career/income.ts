/**
 * 구단 수입 지급 (계산은 shared/career/income). 우리 팀은 가계부에 기록, 다른 팀은 구단 자금에 바로 더함
 */
import type { CareerState, CMatch } from "@shared/career/rules";
import { BROADCAST_RIGHTS, RANK_PRIZE, gateAmount, goodsAmount } from "@shared/career/income";
import { divOf, proTeams, standings } from "@shared/career/view";
import { pay } from "./club";

function earn(s: CareerState, team: number, amount: number, category: string, note?: string) {
  if (amount <= 0) return;
  if (team === s.myTeam) pay(s, category, amount, note);
  else s.teams[team].money += amount;
}

/** 관중 수입: 홈 팀(a) */
export function gateIncome(s: CareerState, m: CMatch) {
  earn(s, m.a, gateAmount(s, m.a, m.stage), "관중 수입", `홈 경기 vs ${s.teams[m.b].name}`);
}

/** 굿즈 판매 (매주, 모든 구단) */
export function weeklyGoods(s: CareerState) {
  for (const t of proTeams(s)) earn(s, t.id, goodsAmount(s, t.id), "굿즈 판매", "유니폼·응원 도구");
}

/** 중계권 분배금 (시즌 시작) */
export function broadcastRights(s: CareerState) {
  for (const t of proTeams(s)) earn(s, t.id, BROADCAST_RIGHTS[divOf(s, t.id)], "중계권 분배금", `${s.season}시즌 리그 분배`);
}

/** 정규시즌 순위 상금 (정규시즌이 끝나면) */
export function regularSeasonPrize(s: CareerState) {
  for (const div of [1, 2] as const) {
    standings(s, div).forEach((t, i) => earn(s, t.id, RANK_PRIZE[div][i] ?? 0, "정규시즌 순위 상금", `${div}부 ${i + 1}위`));
  }
}
