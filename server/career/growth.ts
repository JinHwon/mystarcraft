/**
 * 경기 뒤 능력치 변동 (경기 내용에 따라)
 *
 * 원작은 선수마다 "최근 능력치 변동" 값을 따로 들고 경기마다 능력치가 오르내린다 (docs/original-mysc-analysis.md 3.1).
 * 원작 공식은 확인하지 못해, 경기 엔진 이벤트로 능력치마다 잘한 점·못한 점을 매겨 변동 폭을 정한다.
 * - 이기면 대부분 오르고, 지면 대부분 떨어진다. 잘한 능력치는 더 오르고(졌어도 오를 수 있음), 못한 능력치는 더 떨어진다
 * - 강한 상대를 이기면 크게 오르고, 약한 상대에게 지면 크게 떨어진다 (이변 배율)
 * - 오를 때는 높은 능력치일수록·잠재력에 가까울수록 덜 오른다. 츄잉껌을 쓰면 떨어지는 폭이 66% 줄어든다
 */
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { totalOf, type CPlayer } from "@shared/career/rules";
import type { SetContent } from "../gameSimulation";

const rand = () => Math.random();

/** 능력치별 경기 내용 점수 (대략 -4 ~ +4) */
export function contentScores(c: SetContent, won: boolean, duration: number): Record<StatKey, number> {
  const longGame = duration >= 1200;
  return {
    attack: c.attackWins * 1.2 - (c.attacks - c.attackWins) * 0.5 + c.basesKilled * 0.8,
    defense: c.holds * 1.2 - c.holdFails * 0.8 - c.basesLost * 0.8,
    harass: Math.min(4, c.harassKills / 5) - Math.min(3, c.harassLost / 8),
    control: c.closeWins * 1.2 + c.upsets * 1.2 - c.crushed * 1,
    supply: c.expands * 0.6 + c.crushes * 1 - c.crushed * 0.6,
    strategy: c.counters * 1 + c.pushes * 0.4 + Math.min(2, c.techs * 0.2) + (won && longGame ? 1 : 0),
    scout: c.earlyHolds * 1.5 - c.earlyLost * 1.5 + (c.holds > 0 && c.holdFails === 0 ? 0.5 : 0),
    sense: c.upsets * 1.5 + (won && c.closeWins > 0 ? 1 : 0) - (won ? 0 : c.crushed * 0.8),
  };
}

/** 오를 여지: 높은 능력치·잠재력 근처일수록 작음 */
function room(p: CPlayer, k: StatKey) {
  const byStat = Math.max(0.2, 1 - (p.stats[k] - 500) / 700);
  const left = p.potential ? p.potential - totalOf(p.stats) : 1000;
  const byPotential = left <= 0 ? 0.15 : Math.min(1, 0.3 + left / 500);
  return byStat * byPotential;
}

/**
 * 한 선수의 세트 뒤 능력치 변동
 * @param content 경기 내용 (빠른 판정 경기는 없음 → 승패와 이변만 반영)
 */
export function setDeltas(p: CPlayer, opp: CPlayer, won: boolean, content: SetContent | undefined, duration: number, gum = false): Partial<Record<StatKey, number>> {
  const gap = totalOf(opp.stats) - totalOf(p.stats);
  // 이변 배율: 강한 상대를 이기면 크게, 약한 상대에게 지면 크게
  const upset = won ? Math.max(0.6, Math.min(2.2, 1 + gap / 1200)) : Math.max(0.6, Math.min(2.2, 1 - gap / 1200));
  const score = content ? contentScores(content, won, duration) : undefined;
  const out: Partial<Record<StatKey, number>> = {};
  for (const k of STAT_KEYS) {
    const sc = score?.[k] ?? 0;
    let d: number;
    if (won) {
      // 기본 0~3 + 잘한 만큼, 못했어도 이기면 거의 안 떨어짐
      d = Math.max(-1, Math.min(14, rand() * 3.5 + sc * 1.6)) * upset;
      if (d > 0) d *= room(p, k);
    } else {
      // 기본 -0~3 + 잘한 만큼 (잘했으면 졌어도 조금 오름)
      d = Math.max(-12, Math.min(4, -rand() * 3.5 + sc * 1.3));
      if (d < 0) d *= upset * (gum ? 0.34 : 1);
      else d *= room(p, k);
    }
    const r = Math.round(d);
    if (r !== 0) out[k] = r;
  }
  return out;
}
