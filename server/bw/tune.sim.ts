/**
 * 밸런스 보정 계수 산출 (개발용): npx tsx server/bw/tune.sim.ts [반복] [경기수]
 * 1) 종족전 보정 (RACE_BALANCE) 2) 빌드별 보정 (plan.power) 을 완만하게 조정해 출력한다.
 */
import { initializeGameState, progressTurn, RACE_BALANCE } from "./bwEngine";
import { PLANS } from "./bwBuilds";
import type { Race } from "./bwData";

const ITER = Number(process.argv[2] ?? 6);
const N = Number(process.argv[3] ?? 300);
const stat = (v: number) => ({ sense: v, control: v, attack: v, harass: v, strategy: v, supply: v, defense: v, scout: v });
const pairs: [Race, Race][] = [["terran", "protoss"], ["terran", "zerg"], ["protoss", "zerg"], ["terran", "terran"], ["protoss", "protoss"], ["zerg", "zerg"]];

function run() {
  const plan: Record<string, [number, number]> = {};
  const race: Record<string, number> = {};
  for (const [r1, r2] of pairs) {
    let w = 0;
    for (let n = 0; n < N; n++) {
      const gs = initializeGameState(1, "A", r1, 2, "B", r2, stat(500), stat(500), { rushDistance: 50, resources: 50, complexity: 50 }, {});
      while (!gs.gameEnded && gs.turn < 125) progressTurn(gs);
      if (gs.winner === 1) w++;
      for (const p of [gs.player1, gs.player2]) {
        if (r1 === r2 && gs.player1.plan.key === gs.player2.plan.key) continue;
        plan[p.plan.key] = plan[p.plan.key] ?? [0, 0];
        plan[p.plan.key][1]++;
        if (gs.winner === p.id) plan[p.plan.key][0]++;
      }
    }
    race[`${r1}_${r2}`] = w / N;
  }
  return { plan, race };
}

const mode = process.argv[4] ?? "race";
for (let it = 0; it < ITER; it++) {
  const { plan, race } = run();
  if (mode === "race") {
    for (const [r1, r2] of pairs.slice(0, 3)) {
      const wr = Math.min(0.9, Math.max(0.1, race[`${r1}_${r2}`]));
      const adj = Math.pow(0.5 / wr, 0.18);
      RACE_BALANCE[`${r1}_${r2}`] = Math.round(RACE_BALANCE[`${r1}_${r2}`] * adj * 1000) / 1000;
      RACE_BALANCE[`${r2}_${r1}`] = Math.round(RACE_BALANCE[`${r2}_${r1}`] / adj * 1000) / 1000;
    }
  } else {
    for (const p of PLANS) {
      const r = plan[p.key];
      if (!r || r[1] < 15) continue;
      const wr = Math.min(0.9, Math.max(0.1, r[0] / r[1]));
      p.power = Math.round(Math.min(1.6, Math.max(0.6, (p.power ?? 1) * Math.pow(0.5 / wr, 0.15))) * 1000) / 1000;
    }
  }
  console.log(`iter ${it}: ` + Object.entries(race).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(" | "));
  if (mode !== "race") console.log("   " + PLANS.map(p => `${p.key}:${plan[p.key] ? (plan[p.key][0] / plan[p.key][1] * 100).toFixed(0) : "-"}%`).join(" "));
}
console.log("RACE_BALANCE", JSON.stringify(RACE_BALANCE));
console.log("POWER", JSON.stringify(Object.fromEntries(PLANS.map(p => [p.key, p.power ?? 1]))));
