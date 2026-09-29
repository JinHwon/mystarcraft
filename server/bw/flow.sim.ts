/**
 * 경기 흐름 점검용 (개발용): npx tsx server/bw/flow.sim.ts [경기수] [능력치차]
 * 경기당 교전 수, 첫 교전 승자 = 최종 승자 비율, 역전(우세 뒤집힘) 비율, 종료 사유, 경기 시간
 */
import { initializeGameState, progressTurn, type GameState } from "./bwEngine";
import type { Race } from "./bwData";

const N = Number(process.argv[2] ?? 300);
const diff = Number(process.argv[3] ?? 0);
const races: Race[] = ["terran", "protoss", "zerg"];
const stat = (v: number) => ({ sense: v, control: v, attack: v, harass: v, strategy: v, supply: v, defense: v, scout: v });

let upsets = 0, counters = 0, battles = 0, firstDecides = 0, withBattle = 0, comeback = 0, bigComeback = 0, time = 0, p1Wins = 0;
const reasons: Record<string, number> = {};
const hist: Record<string, number> = {};
for (let n = 0; n < N; n++) {
  const r1 = races[n % 3], r2 = races[Math.floor(n / 3) % 3];
  const gs: GameState = initializeGameState(1, "A", r1, 2, "B", r2, stat(500 + diff), stat(500), { rushDistance: 50, resources: 50, complexity: 50 }, {});
  const winners: number[] = [];
  const adv: number[] = [];
  while (!gs.gameEnded && gs.turn < 125) {
    progressTurn(gs);
    for (const c of gs.turnCommentaries) {
      const m = c.match(/(?:^|\] )(A|B) 선수 .*교전 승리/);
      if (m) winners.push(m[1] === "A" ? 1 : 2);
      if (c.includes("싸움을 뒤집습니다")) upsets++;
      if (c.includes("역습!")) counters++;
    }
    if (!gs.gameEnded && gs.time > 240) adv.push(gs.player1Advantage);
  }
  const w = gs.winner === 1 ? 1 : 2;
  if (w === 1) p1Wins++;
  battles += winners.length;
  const k = String(Math.min(winners.length, 7));
  hist[k] = (hist[k] ?? 0) + 1;
  if (winners.length) { withBattle++; if (winners[0] === w) firstDecides++; }
  // 역전: 승자가 4분 이후 한 번이라도 유불리 45 이하(열세)였음 / 38 이하(큰 열세)
  const wAdv = adv.map(a => (w === 1 ? a : 100 - a));
  if (wAdv.some(a => a <= 45)) comeback++;
  if (wAdv.some(a => a <= 38)) bigComeback++;
  time += gs.time;
  reasons[gs.endReason ?? "?"] = (reasons[gs.endReason ?? "?"] ?? 0) + 1;
}
console.log(`경기 ${N} (능력치차 +${diff}: A 승률 ${(p1Wins / N * 100).toFixed(0)}%) | 교전 ${(battles / N).toFixed(2)}회 | 첫 교전 승자=최종 승자 ${(firstDecides / withBattle * 100).toFixed(0)}% | 역전승 ${(comeback / N * 100).toFixed(0)}% (큰 열세 뒤집기 ${(bigComeback / N * 100).toFixed(0)}%) | 평균 ${(time / N / 60).toFixed(1)}분`);
console.log(`경기당 역전 한타 ${(upsets / N).toFixed(2)}회, 역습 ${(counters / N).toFixed(2)}회`);
console.log("교전 수 분포", JSON.stringify(hist), "종료", JSON.stringify(reasons));
