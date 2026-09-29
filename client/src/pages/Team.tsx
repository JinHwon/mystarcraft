import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ageOf, askingPrice, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { rosterOf, teamPower } from "@shared/career/view";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge, RACE_NAME, StatBars, TeamBadge } from "@/components/career/Bits";
import { StatRadarChart } from "@/components/StatRadarChart";

type Sort = "total" | "cond" | "level" | "age";

export function PlayerSheet({ s, player, onClose, actions }: { s: CareerState; player: CPlayer | null; onClose: () => void; actions?: React.ReactNode }) {
  return (
    <Sheet open={!!player} onOpenChange={o => !o && onClose()}>
      <SheetContent side="bottom" className="app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border max-h-[88vh] overflow-y-auto safe-bottom">
        {player && (
          <div className="p-4 space-y-3">
            <SheetHeader className="p-0">
              <SheetTitle className="flex items-center gap-2 text-left">
                <RaceBadge race={player.race} />
                <span className="text-lg">{player.name}</span>
                <TeamBadge short={s.teams[player.team].short} color={s.teams[player.team].color} />
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                ["종족", RACE_NAME[player.race]],
                ["레벨", `Lv.${player.level}`],
                ["나이", `${ageOf(player, s.season)}세`],
                ["능력치", totalOf(player.stats).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-sm font-bold text-foreground">{v}</div></div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>컨디션 <CondBadge cond={player.cond} /></span>
              <span>이번 시즌 {player.sWins}승 {player.sLosses}패 · 통산 {player.wins}승 {player.losses}패</span>
            </div>
            <div className="flex justify-center"><StatRadarChart stats={player.stats} grade={`Lv${player.level}`} gradeColor={s.teams[player.team].color} size={200} maxValue={1000} /></div>
            <StatBars stats={player.stats} />
            {player.titles && player.titles.length > 0 && (
              <div className="text-xs text-amber-300">🏆 {player.titles.join(" · ")}</div>
            )}
            <div className="text-[11px] text-muted-foreground">영입 시세 약 {askingPrice(player, s.season).toLocaleString()}만원</div>
            {actions}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Team() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const [sort, setSort] = useState<Sort>("total");
  const [open, setOpen] = useState<number | null>(null);
  const release = trpc.career.release.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`방출 완료 (방출 이득 ${r.result.gain.toLocaleString()}만원)`); setOpen(null); },
  });

  const roster = useMemo(() => {
    if (!s) return [];
    const list = rosterOf(s, s.myTeam);
    return list.sort((a, b) =>
      sort === "total" ? totalOf(b.stats) - totalOf(a.stats)
        : sort === "cond" ? b.cond - a.cond
        : sort === "level" ? b.level - a.level
        : ageOf(a, s.season) - ageOf(b, s.season));
  }, [s, sort]);

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const me = s.teams[s.myTeam];
  const races = { terran: 0, zerg: 0, protoss: 0 } as Record<string, number>;
  roster.forEach(p => races[p.race]++);
  const player = open !== null ? s.players[open] : null;

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{ background: me.color }}>{me.short}</div>
        <div className="flex-1">
          <div className="font-black text-foreground">{me.name}</div>
          <div className="text-xs text-muted-foreground">{roster.length}명 · 테란 {races.terran} / 저그 {races.zerg} / 프로토스 {races.protoss} · 전력 {teamPower(s, s.myTeam).toLocaleString()}</div>
        </div>
      </div>

      <div className="flex gap-1.5">
        {([["total", "능력치순"], ["cond", "컨디션순"], ["level", "레벨순"], ["age", "나이순"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", sort === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {roster.map(p => (
          <button key={p.id} onClick={() => setOpen(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted/40">
            <RaceBadge race={p.race} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-foreground truncate">{p.name}</span>
                <span className="text-[10px] text-muted-foreground">Lv.{p.level} · {ageOf(p, s.season)}세</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CondBadge cond={p.cond} />
                <span>{p.sWins}승 {p.sLosses}패</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-foreground font-mono">{totalOf(p.stats).toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">능력치 합</div>
            </div>
          </button>
        ))}
      </div>

      <PlayerSheet
        s={s}
        player={player}
        onClose={() => setOpen(null)}
        actions={player && (
          <button
            onClick={() => { if (confirm(`${player.name} 선수를 방출할까요? 무소속 선수가 됩니다.`)) release.mutate({ playerId: player.id }); }}
            disabled={release.isPending}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30"
          >👋 방출 (방출 이득 약 {Math.round(askingPrice(player, s.season) * 0.2 / 10) * 10}만원)</button>
        )}
      />
    </div>
  );
}
