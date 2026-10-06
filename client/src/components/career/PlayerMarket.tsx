/**
 * 선수 시세: 지금 가장 비싼 선수부터, 우리 팀만 볼 수도 있음. 누르면 주별 시세·능력치 그래프
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { askingPrice, totalOf, type CareerState } from "@shared/career/rules";
import { activePlayers } from "@shared/career/view";
import { RaceBadge } from "@/components/career/Bits";
import { PlayerSheet } from "@/pages/Team";

export function PlayerMarket({ s }: { s: CareerState }) {
  const [mineOnly, setMineOnly] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const deltas = trpc.career.marketDeltas.useQuery({ at: s.season * 100 + s.week }, { staleTime: 60_000 });
  const rows = useMemo(() => activePlayers(s)
    .filter(p => (!mineOnly || p.team === s.myTeam) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .map(p => ({ p, price: askingPrice(p, s.season) }))
    .sort((a, b) => b.price - a.price || totalOf(b.p.stats) - totalOf(a.p.stats))
    .slice(0, mineOnly ? 60 : 50), [s, mineOnly, q]);
  const d = deltas.data?.deltas ?? {};
  return (
    <div className="rounded-2xl bg-black border border-neutral-700 overflow-hidden text-white">
      <PlayerSheet s={s} player={open !== null ? s.players[open] : null} onClose={() => setOpen(null)} market />
      <div className="px-2.5 pt-2 pb-1.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-black tracking-[0.2em]">선수 시세</span>
          <button onClick={() => setMineOnly(!mineOnly)} className={cn("ml-auto px-2 py-0.5 text-[11px] border", mineOnly ? "border-[#8fd0ff] text-[#8fd0ff]" : "border-neutral-700 text-neutral-400")}>우리 팀만</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 선수 이름" className="w-full bg-neutral-900 border border-neutral-700 px-2 py-1 text-[12px] text-white" />
        <div className="text-[10.5px] text-neutral-400">비싼 순서 · 선수를 누르면 주별 시세·능력치 그래프 (변화는 지난주 대비)</div>
      </div>
      <table className="w-full text-[12px]">
        <thead><tr className="text-neutral-400 border-y border-neutral-800"><th className="w-7 py-1 font-normal">#</th><th className="text-left font-normal">선수</th><th className="text-right font-normal">능력치</th><th className="text-right font-normal">시세</th><th className="text-right pr-2 font-normal">변화</th></tr></thead>
        <tbody>
          {rows.map(({ p, price }, i) => (
            <tr key={p.id} onClick={() => setOpen(p.id)} className={cn("border-b border-neutral-900 cursor-pointer active:bg-neutral-800", p.team === s.myTeam && "bg-[#10243a]")}>
              <td className="text-center text-neutral-400 py-1">{i + 1}</td>
              <td className="py-1"><span className="inline-flex items-center gap-1"><RaceBadge race={p.race} /><b>{p.name}</b><span className="text-[10px] text-neutral-400">{s.teams[p.team]?.short ?? "무소속"}</span></span></td>
              <td className="text-right tabular-nums text-neutral-300">{totalOf(p.stats).toLocaleString()}</td>
              <td className="text-right tabular-nums font-black text-[#ffe45c]">{price.toLocaleString()}만</td>
              <td className={cn("text-right pr-2 tabular-nums", (d[p.id] ?? 0) > 0 ? "text-emerald-300" : (d[p.id] ?? 0) < 0 ? "text-rose-300" : "text-neutral-500")}>{d[p.id] ? `${d[p.id] > 0 ? "+" : ""}${d[p.id].toLocaleString()}` : "-"}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="text-center text-neutral-500 py-4">선수가 없습니다</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
