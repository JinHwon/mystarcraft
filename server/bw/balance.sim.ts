/**
 * 밸런스 점검용 시뮬레이션 (개발용): npx tsx server/bw/balance.sim.ts [경기수]
 * 같은 능력치에서 종족전별 승률, 평균 경기 시간, 종료 사유, 빌드별 승률을 출력한다.
 */
import { initializeGameState, progressTurn, gameStateToTurnData, type GameState } from "./bwEngine";
import type { Race } from "./bwData";

const N = Number(process.argv[2] ?? 400);
const races: Race[] = ["terran", "protoss", "zerg"];
const stat = (v: number) => ({ sense: v, control: v, attack: v, harass: v, strategy: v, supply: v, defense: v, scout: v });

function play(r1: Race, r2: Race, s1 = 500, s2 = 500): { gs: GameState; turns: ReturnType<typeof gameStateToTurnData>[] } {
  const gs = initializeGameState(1, "A", r1, 2, "B", r2, stat(s1), stat(s2), { rushDistance: 50, resources: 50, complexity: 50 }, {});
  const turns = [];
  while (!gs.gameEnded && gs.turn < 125) {
    progressTurn(gs);
    turns.push(gameStateToTurnData(gs));
  }
  return { gs, turns };
}

const t0 = Date.now();
for (let i = 0; i < races.length; i++) {
  for (let j = i; j < races.length; j++) {
    const r1 = races[i], r2 = races[j];
    let w1 = 0, time = 0, maxSupply = 0;
    const reasons: Record<string, number> = {};
    const planStats: Record<string, [number, number]> = {};
    for (let n = 0; n < N; n++) {
      const { gs, turns } = play(r1, r2);
      if (gs.winner === 1) w1++;
      time += gs.time;
      reasons[gs.endReason ?? "?"] = (reasons[gs.endReason ?? "?"] ?? 0) + 1;
      maxSupply += Math.max(...turns.map(t => Math.max(t.p1.population, t.p2.population)));
      for (const p of [gs.player1, gs.player2]) {
        const k = `${p.race[0].toUpperCase()}:${p.plan.name}`;
        planStats[k] = planStats[k] ?? [0, 0];
        planStats[k][1]++;
        if (gs.winner === p.id) planStats[k][0]++;
      }
    }
    console.log(`\n${r1} vs ${r2}: ${r1} 승률 ${(w1 / N * 100).toFixed(1)}% | 평균 ${(time / N / 60).toFixed(1)}분 | 최대 인구 평균 ${(maxSupply / N).toFixed(0)} | ${JSON.stringify(reasons)}`);
    for (const [k, [w, c]] of Object.entries(planStats).sort()) console.log(`   ${k}: ${(w / c * 100).toFixed(0)}% (${c})`);
  }
}
// 능력치 차이 반영 확인
for (const [a, b] of [[600, 500], [700, 500], [500, 400]]) {
  let w = 0;
  for (let n = 0; n < N; n++) {
    const r1 = races[n % 3], r2 = r1;
    if (play(r1, r2, a, b).gs.winner === 1) w++;
  }
  console.log(`능력치 ${a} vs ${b}: 승률 ${(w / N * 100).toFixed(1)}%`);
}
console.log(`\n소요 ${(Date.now() - t0) / 1000}s`);
