/**
 * 경기 뒤 능력치 변동 (경기 내용에 따라)
 *
 * 원작은 선수마다 "최근 능력치 변동" 값을 따로 들고 경기마다 능력치가 오르내린다 (docs/original-mysc-analysis.md 3.1).
 * 원작 공식은 확인하지 못해, 경기 엔진 이벤트로 능력치마다 잘한 점·못한 점을 매겨 변동 폭을 정한다.
 * - 이기면 대부분 오르고, 지면 대부분 떨어진다. 잘한 능력치는 더 오르고(졌어도 오를 수 있음), 못한 능력치는 더 떨어진다
 * - 강한 상대를 이기면 크게 오르고, 약한 상대에게 지면 크게 떨어진다 (이변 배율 0.35~3배)
 * - S 등급 이상이 낮은 등급에게 지면 훨씬 크게 떨어진다 (등급 차이가 클수록 더), SS 이상은 누구에게 져도 더 떨어진다 (topGradeLossMul)
 * - 선수별 성장 한계는 없다. 이번 시즌 승률이 좋을수록(폼) 더 잘 크고, 재능(잠재력 값)은 크는 속도만 바꾼다
 * - 오를 때는 능력치 하나가 높을수록 덜 오른다 (한 능력치 최대 1000). 츄잉껌을 쓰면 떨어지는 폭이 66% 줄어든다
 * - 나보다 실제 능력치(아이템 제외)가 높은 상대에게 지면 거의 안 떨어진다 (lossScale)
 * - 자기 평균보다 많이 낮은 능력치는 잘 오르고 덜 떨어진다 (catchUp)
 */
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { LEGACY_GRADES, gradeIndex, totalOf, type CPlayer } from "@shared/career/rules";
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
    sense: c.upsets * 1.5 + (won ? 0.8 + c.closeWins * 0.5 : 0) + Math.min(1.5, c.counters * 0.5) - (won ? 0 : c.crushed * 0.6),
  };
}

/** 오를 여지: 능력치 하나가 높을수록 조금 덜 오름 (선수별 한계는 없음) */
function room(p: CPlayer, k: StatKey) {
  return Math.max(0.4, 1 - (p.stats[k] - 600) / 900);
}

/** 재능: 크는 속도 배율 (0.9~1.3, 잠재력 값에서) — 한계가 아님 */
export function talent(p: CPlayer) {
  return p.potential ? Math.max(0.9, Math.min(1.3, 1 + (p.potential - 5500) / 5000)) : 1;
}

/** 폼: 이번 시즌 승률이 좋을수록 더 잘 큼 (승률 50% 1.2배, 80% 1.5배, 20% 0.9배) */
export function form(p: CPlayer) {
  const wr = (p.sWins + 1) / (p.sWins + p.sLosses + 2);
  return 0.7 + wr;
}

const SS = LEGACY_GRADES.indexOf("SS");
const S_MINUS = LEGACY_GRADES.indexOf("S-");
/** 등급은 아이템을 뺀 실제 능력치로 (장비로 등급이 올라 보여도 패널티는 실제 실력 기준) */
const gradeOf = (p: CPlayer) => gradeIndex(totalOf(p.stats));

/**
 * 진 경기의 하락 배율 (아이템을 뺀 실제 능력치 합 차이)
 * - 나보다 강한 상대에게 지면 거의 안 떨어짐: 합 250 차이면 절반, 450 이상이면 0.1배
 * - 약한 상대에게 지면 더 떨어짐: 합 700 차이마다 +1배 (최대 3배)
 */
export function lossScale(gap: number) {
  return gap > 0 ? Math.max(0.1, 1 - gap / 500) : Math.min(3, 1 - gap / 700);
}

/**
 * 능력치 고르기 보정: 자기 평균보다 많이 떨어진 능력치는 잘 오르고 덜 떨어짐
 * (패배로 수비력 등 한 능력치만 계속 깎여 회복이 안 되는 것 방지)
 * 평균보다 50 낮으면 오를 때 1.5배·떨어질 때 0.75배, 100 이상 낮으면 2배·0.5배
 */
export function catchUp(p: CPlayer, k: StatKey) {
  const mean = totalOf(p.stats) / STAT_KEYS.length;
  const lag = Math.max(0, Math.min(1, (mean - p.stats[k]) / 100));
  return { up: 1 + lag, down: 1 - lag * 0.5 };
}
/**
 * 최상위 등급 패배 배율 (계속 높은 능력치로 머무는 것 방지)
 * - S- 이상이 낮은 등급에게 지면: 한 등급 아래 3배, 한 등급 더 벌어질 때마다 +1.2배 (S 가 A 에게 지면 5.4배, 최대 10배)
 * - SS 이상은 같은 등급에게 져도 SS 1.8배, SSS 2.4배
 */
export function topGradeLossMul(p: CPlayer, opp?: CPlayer) {
  const g = gradeOf(p);
  let mul = g >= SS ? 1.8 + (g - SS) * 0.6 : 1;
  const o = opp ? gradeOf(opp) : g;
  if (g >= S_MINUS && o < g) mul = Math.max(mul, 3 + (g - o - 1) * 1.2);
  return Math.min(10, mul);
}

/**
 * 한 선수의 세트 뒤 능력치 변동
 * @param content 경기 내용 (빠른 판정 경기는 없음 → 승패와 이변만 반영)
 */
export function setDeltas(p: CPlayer, opp: CPlayer, won: boolean, content: SetContent | undefined, duration: number, gum = false): Partial<Record<StatKey, number>> {
  const gap = totalOf(opp.stats) - totalOf(p.stats);
  // 이변 배율: 강한 상대를 이기면 크게, 약한 상대에게 지면 크게
  // 능력치 합 700 차이마다 ±1배 (0.35~3배): 강자가 약자를 이기면 조금만, 약자가 강자를 이기면 크게 오름
  const upset = won ? Math.max(0.35, Math.min(3, 1 + gap / 700)) : lossScale(gap);
  const score = content ? contentScores(content, won, duration) : undefined;
  const grow = talent(p) * form(p);
  const out: Partial<Record<StatKey, number>> = {};
  for (const k of STAT_KEYS) {
    const sc = score?.[k] ?? 0;
    const cu = catchUp(p, k);
    let d: number;
    if (won) {
      // 기본 0~4.5 + 잘한 만큼, 못했어도 이기면 거의 안 떨어짐
      d = Math.max(-1, Math.min(16, rand() * 4.5 + sc * 1.9)) * upset;
      if (d > 0) d *= room(p, k) * grow * cu.up;
    } else {
      // 기본 -0~5.5 + 잘한 만큼 (잘했으면 졌어도 조금 오름). 못한 내용은 -3 점까지만 (한 능력치만 크게 깎이지 않게)
      d = Math.max(-16, Math.min(5, -rand() * 5.5 + Math.max(-3, sc) * 1.4));
      // 강한 상대에게 진 건 덜, 츄잉껌이면 66% 덜 (최상위 등급 패널티는 약한 상대에게 졌을 때만)
      if (d < 0) d *= upset * (gap > 0 ? 1 : topGradeLossMul(p, opp)) * (gum ? 0.34 : 1) * cu.down;
      else d *= room(p, k) * grow * cu.up;
    }
    const r = Math.round(d);
    if (r !== 0) out[k] = r;
  }
  return out;
}
