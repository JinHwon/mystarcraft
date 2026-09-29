/**
 * 경기 1판 추적 (개발용): npx tsx server/bw/trace.sim.ts terran zerg
 */
import { initializeGameState, progressTurn, gameStateToTurnData } from "./bwEngine";
import type { Race } from "./bwData";

const r1 = (process.argv[2] ?? "terran") as Race;
const r2 = (process.argv[3] ?? "zerg") as Race;
const quiet = process.argv.includes("--quiet");
const stat = (v: number) => ({ sense: v, control: v, attack: v, harass: v, strategy: v, supply: v, defense: v, scout: v });
const gs = initializeGameState(1, "A", r1, 2, "B", r2, stat(500), stat(500), { rushDistance: 50, resources: 50, complexity: 50 }, {});
while (!gs.gameEnded && gs.turn < 125) {
  progressTurn(gs);
  const t = gameStateToTurnData(gs);
  if (!quiet) for (const c of t.commentaries) console.log(c);
  if (gs.turn % 3 === 0 || gs.gameEnded) {
    for (const [n, s] of [["A", t.p1], ["B", t.p2]] as const) {
      console.log(`   ${n} ${s.plan} | 인구 ${s.population}/${s.supplyCap} 일꾼 ${s.workers} 병력 ${s.armySupply} 기지 ${s.bases} 미네랄 ${s.minerals} 가스 ${s.gas} 분당 ${s.incomePerMin} | ${s.army}`);
    }
  }
}
console.log("winner", gs.winner, gs.endReason, (gs.time / 60).toFixed(1) + "분");
