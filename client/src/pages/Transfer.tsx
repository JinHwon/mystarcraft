import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import { MAX_ROSTER, ageOf, askingPrice, totalOf } from "@shared/career/rules";
import { rosterOf } from "@shared/career/view";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge } from "@/components/career/Bits";
import { PlayerSheet } from "./Team";

type Sort = "total" | "price" | "age" | "level";

/** 이적시장: 무소속 선수 영입 (요구 금액, 만원) */
export default function Transfer() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const [q, setQ] = useState("");
  const [race, setRace] = useState<"all" | "terran" | "zerg" | "protoss">("all");
  const [sort, setSort] = useState<Sort>("total");
  const [affordable, setAffordable] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const scout = trpc.career.scout.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`영입 완료! (${r.result.price.toLocaleString()}만원)`); setOpen(null); },
  });

  const list = useMemo(() => {
    if (!s) return [];
    const money = s.teams[s.myTeam].money;
    return rosterOf(s, FREE_AGENT_TEAM)
      .filter(p => (race === "all" || p.race === race) && (!q.trim() || p.name.includes(q.trim())) && (!affordable || askingPrice(p, s.season) <= money))
      .sort((a, b) =>
        sort === "total" ? totalOf(b.stats) - totalOf(a.stats)
          : sort === "price" ? askingPrice(a, s.season) - askingPrice(b, s.season)
          : sort === "age" ? ageOf(a, s.season) - ageOf(b, s.season)
          : b.level - a.level);
  }, [s, q, race, sort, affordable]);

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const money = s.teams[s.myTeam].money;
  const full = rosterOf(s, s.myTeam).length >= MAX_ROSTER;
  const player = open !== null ? s.players[open] : null;

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">보유 금액</div>
          <div className="text-xl font-black text-yellow-300">{money.toLocaleString()}만원</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">무소속 {rosterOf(s, FREE_AGENT_TEAM).length}명<br />선수단 {rosterOf(s, s.myTeam).length}/{MAX_ROSTER}</div>
      </div>

      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="선수 이름 검색" className="h-11 rounded-xl bg-card" />
      <div className="flex flex-wrap gap-1.5">
        {(["all", "terran", "zerg", "protoss"] as const).map(r => (
          <button key={r} onClick={() => setRace(r)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", race === r ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>
            {r === "all" ? "전체" : r === "terran" ? "테란" : r === "zerg" ? "저그" : "프로토스"}
          </button>
        ))}
        <button onClick={() => setAffordable(v => !v)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", affordable ? "bg-yellow-500 text-black border-yellow-400" : "bg-card border-border text-muted-foreground")}>💰 영입 가능만</button>
      </div>
      <div className="flex gap-1.5">
        {([["total", "능력치순"], ["price", "금액순"], ["age", "나이순"], ["level", "레벨순"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} className={cn("px-2.5 py-1 rounded-lg text-xs border", sort === k ? "bg-muted text-foreground border-primary/60" : "bg-card border-border text-muted-foreground")}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {list.map(p => {
          const price = askingPrice(p, s.season);
          return (
            <button key={p.id} onClick={() => setOpen(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
              <RaceBadge race={p.race} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground truncate">{p.name} <span className="text-[10px] text-muted-foreground font-normal">Lv.{p.level} · {ageOf(p, s.season)}세</span></div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2"><span>능력치 {totalOf(p.stats).toLocaleString()}</span><CondBadge cond={p.cond} /></div>
              </div>
              <div className={cn("text-sm font-black", price <= money ? "text-yellow-300" : "text-muted-foreground")}>{price.toLocaleString()}만</div>
            </button>
          );
        })}
        {list.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 선수가 없습니다</div>}
      </div>

      <PlayerSheet
        s={s}
        player={player}
        onClose={() => setOpen(null)}
        actions={player && (
          <button
            onClick={() => scout.mutate({ playerId: player.id })}
            disabled={scout.isPending || full || askingPrice(player, s.season) > money}
            className="w-full py-3 rounded-xl text-sm font-black bg-emerald-500 text-white disabled:opacity-40"
          >
            {full ? "선수단이 가득 찼습니다" : askingPrice(player, s.season) > money ? "자금 부족" : `🤝 ${askingPrice(player, s.season).toLocaleString()}만원에 영입`}
          </button>
        )}
      />
    </div>
  );
}
