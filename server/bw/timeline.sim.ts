/**
 * 종족별 시간대 평균 지표 (개발용): npx tsx server/bw/timeline.sim.ts [경기수]
 */
import { initializeGameState, progressTurn, gameStateToTurnData } from "./bwEngine";
import type { Race } from "./bwData";

const N = Number(process.argv[2] ?? 150);
const stat = (v: number) => ({ sense: v, control: v, attack: v, harass: v, strategy: v, supply: v, defense: v, scout: v });
const checkpoints = [240, 360, 480, 600, 720];
for (const [r1, r2] of [["terran", "zerg"], ["protoss", "zerg"], ["terran", "protoss"]] as [Race, Race][]) {
  const acc: Record<string, number[]> = {};
  const cnt: Record<number, number> = {};
  for (let n = 0; n < N; n++) {
    const gs = initializeGameState(1, "A", r1, 2, "B", r2, stat(500), stat(500), { rushDistance: 50, resources: 50, complexity: 50 }, {});
    while (!gs.gameEnded && gs.turn < 125) {
      progressTurn(gs);
      if (checkpoints.includes(gs.time)) {
        const t = gameStateToTurnData(gs);
        cnt[gs.time] = (cnt[gs.time] ?? 0) + 1;
        for (const [side, s] of [["1", t.p1], ["2", t.p2]] as const) {
          const k = `${gs.time}:${side}`;
          acc[k] = acc[k] ?? [0, 0, 0, 0, 0, 0];
          acc[k][0] += s.workers; acc[k][1] += s.armySupply; acc[k][2] += s.bases; acc[k][3] += s.incomePerMin; acc[k][4] += s.minerals; acc[k][5] += s.gas;
        }
      }
    }
  }
  console.log(`\n=== ${r1} vs ${r2} ===`);
  for (const t of checkpoints) {
    const c = cnt[t] ?? 0;
    if (!c) continue;
    const f = (side: string) => { const a = acc[`${t}:${side}`]; return `일꾼 ${(a[0] / c).toFixed(0)} 병력 ${(a[1] / c).toFixed(0)} 기지 ${(a[2] / c).toFixed(1)} 분당 ${(a[3] / c).toFixed(0)} 잔고 ${(a[4] / c).toFixed(0)}/${(a[5] / c).toFixed(0)}`; };
    console.log(`${Math.floor(t / 60)}분 (${c}경기 진행중) | ${r1}: ${f("1")} | ${r2}: ${f("2")}`);
  }
}
