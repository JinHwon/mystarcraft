/**
 * 맵별 종족전 승률 점검 (개발용): npx tsx server/bw/map.sim.ts [경기수]
 * 같은 능력치에서 맵 지형(러쉬거리·자원·복잡도)과 종족 성향에 따른 승률, 능력치별 영향 변화를 출력한다.
 */
import { estimateWinRate } from "../gameSimulation";
import { PRO_MAPS } from "@shared/mapData";

const N = Number(process.argv[2] ?? 300);
const only = process.argv[3];
const st = (v: number) => ({ sense: v, control: v, attack: v, harass: v, strategy: v, supply: v, defense: v, scout: v }) as any;
const traits = (m: typeof PRO_MAPS[number]) => ({ rushDistance: m.rushDistance, resources: m.resources, complexity: m.complexity });

if (only !== "stat") {
  for (const m of PRO_MAPS) {
    const row = (["terran_zerg", "zerg_protoss", "protoss_terran"] as const).map(k => {
      const [a, b] = k.split("_") as any;
      return `${a[0].toUpperCase()}v${b[0].toUpperCase()} ${estimateWinRate(st(500), st(500), a, b, m.race, 100, 100, traits(m), N).winRate.toFixed(0).padStart(3)}%`;
    });
    console.log(`${m.name.padEnd(10)} 러쉬${m.rushDistance} 자원${m.resources} 복잡${m.complexity} | ${row.join("  ")}`);
  }
}
if (only !== "map") {
  const races = ["terran", "zerg", "protoss"] as const;
  const avg = (stats: any, t: any) => { let s = 0; for (const a of races) for (const b of races) s += estimateWinRate(stats, st(500), a, b, {}, 100, 100, t, Math.round(N / 3)).winRate; return (s / 9).toFixed(0); };
  const one = (k: string) => ({ ...st(500), [k]: 800 });
  const T = {
    "짧은 러쉬": { rushDistance: 20, resources: 50, complexity: 50 }, "긴 러쉬": { rushDistance: 80, resources: 50, complexity: 50 },
    "단순 지형": { rushDistance: 50, resources: 50, complexity: 20 }, "복잡 지형": { rushDistance: 50, resources: 50, complexity: 80 },
    "자원 적음": { rushDistance: 50, resources: 25, complexity: 50 }, "자원 풍부": { rushDistance: 50, resources: 80, complexity: 50 },
  };
  for (const k of ["control", "attack", "defense", "supply", "harass", "scout"]) {
    console.log(`${k} +300: ` + Object.entries(T).map(([n, t]) => `${n} ${avg(one(k), t)}%`).join(" | "));
  }
}
