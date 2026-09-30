import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ACTIONS, WEEKLY_AP, ageOf, totalOf, type ActionKey, type CareerState } from "@shared/career/rules";
import { rosterOf } from "@shared/career/view";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge } from "@/components/career/Bits";

/** 선수 행동: 행동력을 써서 선수마다 이번 주 행동을 정한다 (한 주가 지나갈 때 적용) */
export default function Training() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const utils = trpc.useUtils();
  // 누르자마자 화면에 반영하고, 서버에는 뒤에서 저장 (실패하면 다시 불러옴)
  const patch = (fn: (s: CareerState) => void) => utils.career.get.setData(undefined, old => {
    if (!old?.state) return old;
    const next = structuredClone(old.state);
    fn(next);
    return { state: next };
  });
  const resync = (e: { message: string }) => { updater.onError(e); utils.career.get.invalidate(); };
  const setAction = trpc.career.setAction.useMutation({ onError: resync });
  const auto = trpc.career.autoActions.useMutation({
    onSuccess: r => patch(st => { for (const [id, a] of Object.entries(r.result.actions)) st.players[Number(id)].action = a as ActionKey | null; }),
    onError: resync,
  });
  const clear = trpc.career.clearActions.useMutation({ onError: resync });
  const choose = (pid: number, action: ActionKey | null) => {
    patch(st => { st.players[pid].action = action; });
    setAction.mutate({ playerId: pid, action });
  };

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const roster = rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  const used = roster.reduce((sum, p) => sum + (p.action ? ACTIONS.find(a => a.key === p.action)!.ap : 0), 0);
  const left = s.ap - used;

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">이번 주 행동력</div>
            <div className="text-2xl font-black text-emerald-300">{left} <span className="text-sm text-muted-foreground">/ {WEEKLY_AP}</span></div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { patch(st => { for (const p of rosterOf(st, st.myTeam)) p.action = null; }); clear.mutate(); }} disabled={!!s.live} className="px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm font-bold">↺ 초기화</button>
            <button onClick={() => auto.mutate()} disabled={auto.isPending} className="px-3 py-2 rounded-xl bg-primary/20 border border-primary/40 text-primary text-sm font-bold">🤖 자동 배정</button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {ACTIONS.map(a => (
            <div key={a.key} className="rounded-lg bg-muted/60 px-1.5 py-1.5 text-center">
              <div className="text-lg leading-none">{a.emoji}</div>
              <div className="text-[11px] font-bold text-foreground mt-0.5">{a.name}</div>
              <div className="text-[10px] text-muted-foreground">행동력 {a.ap}{a.money ? ` · ${a.money}만` : ""}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">행동은 경기(한 주)를 진행할 때 적용되고, 바꾸거나 초기화할 때까지 매주 그대로 유지됩니다. 지정하지 않은 선수는 자율 연습(컨디션 소폭 회복)을 합니다. 경기를 뛰면 컨디션이 떨어지니(승 0~3%, 패 3~10%) 휴식(+10~15%)도 챙기세요.</p>
      </div>

      <div className="space-y-2">
        {roster.map(p => (
          <div key={p.id} className="rounded-2xl bg-card border border-border p-3">
            <div className="flex items-center gap-2">
              <RaceBadge race={p.race} />
              <span className="font-bold text-foreground">{p.name}</span>
              <span className="text-[11px] text-muted-foreground">Lv.{p.level} · {ageOf(p, s.season)}세 · {totalOf(p.stats).toLocaleString()}</span>
              <span className="ml-auto"><CondBadge cond={p.cond} /></span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {ACTIONS.map(a => {
                const active = p.action === a.key;
                const affordable = active || a.ap <= left;
                return (
                  <button
                    key={a.key}
                    disabled={!affordable || !!s.live}
                    onClick={() => choose(p.id, active ? null : (a.key as ActionKey))}
                    className={cn("rounded-xl py-2 text-xs font-bold border transition-colors",
                      active ? "bg-primary text-primary-foreground border-primary" : affordable ? "bg-muted/50 border-border text-foreground" : "bg-muted/30 border-border text-muted-foreground/50")}
                  >
                    {a.emoji} {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => navigate("/league")} className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">
        🏆 경기 일정으로 →
      </button>
    </div>
  );
}
