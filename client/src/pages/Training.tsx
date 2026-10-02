import { useState } from "react";
import { useLocation } from "wouter";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import type { ActionResult } from "../../../server/career/logic";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ACTIONS, WEEKLY_AP, actionOf, ageOf, restNotNeeded, totalOf, type ActionKey, type CareerState } from "@shared/career/rules";
import { rosterOf } from "@shared/career/view";
import { useCareer, useCareerPatch, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge } from "@/components/career/Bits";

/** 선수 행동: 행동력을 써서 선수마다 이번 주 행동을 정한다 (한 주가 지나갈 때 적용) */
export default function Training() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const utils = trpc.useUtils();
  // 누르자마자 화면에 반영하고, 서버에는 뒤에서 저장 (실패하면 다시 불러옴)
  // 세이브 전체를 복사하지 않고 선수 배열만 얕게 복사 (선수 객체는 바꿀 것만 새로)
  const patch = (fn: (s: CareerState) => void) => utils.career.get.setData(undefined, old => {
    if (!old?.state) return old;
    const prev = old.state as CareerState;
    const touched = new Set<number>();
    const players = new Proxy(prev.players.slice(), {
      get: (arr, key) => {
        const i = typeof key === "string" && /^\d+$/.test(key) ? Number(key) : -1;
        if (i >= 0 && !touched.has(i) && arr[i]) { touched.add(i); arr[i] = { ...arr[i] }; }
        return Reflect.get(arr, key);
      },
    });
    const next = { ...prev, players } as CareerState;
    fn(next);
    return { state: { ...next, players: [...players] } };
  });
  const resync = (e: { message: string }) => { updater.onError(e); utils.career.get.invalidate(); };
  const setAction = trpc.career.setAction.useMutation({ onError: resync });
  const auto = trpc.career.autoActions.useMutation({
    onSuccess: r => patch(st => { for (const [id, a] of Object.entries(r.result.actions)) st.players[Number(id)].action = a as ActionKey | null; }),
    onError: resync,
  });
  const clear = trpc.career.clearActions.useMutation({ onError: resync });
  const setAll = trpc.career.setAllActions.useMutation({ onError: resync });
  const chooseAll = (action: ActionKey) => {
    patch(st => { for (const p of rosterOf(st, st.myTeam)) p.action = action; });
    setAll.mutate({ action });
  };
  const careerPatch = useCareerPatch();
  const [results, setResults] = useState<ActionResult[] | null>(null);
  const run = trpc.career.runActions.useMutation({
    onSuccess: r => { careerPatch(r.diff); setResults(r.result.results); window.scrollTo(0, 0); },
    onError: updater.onError,
  });
  const choose = (pid: number, action: ActionKey | null) => {
    patch(st => { st.players[pid].action = action; });
    setAction.mutate({ playerId: pid, action });
  };

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const roster = rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  const apOf = (p: (typeof roster)[number]) => p.ap ?? WEEKLY_AP;
  // 컨디션 100% 선수의 휴식은 실행에서 자동으로 빠짐
  const ready = roster.filter(p => { const a = actionOf(p.action); return a && apOf(p) >= a.ap && !restNotNeeded(p); }).length;
  const planned = roster.filter(p => p.action).length;

  return (
    <div className="p-4 space-y-3">
      {results && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/40 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-black text-foreground">✅ 선수 행동 결과</span>
            <button onClick={() => setResults(null)} className="text-xs text-muted-foreground">닫기 ✕</button>
          </div>
          {results.map(r => {
            const p = s.players[r.id];
            const a = ACTIONS.find(x => x.key === r.action);
            return (
              <div key={r.id} className="text-xs text-foreground border-t border-border/60 pt-1.5">
                <div className="flex items-center gap-1.5">
                  <span>{a?.emoji}</span><b>{p.name}</b><span className="text-muted-foreground">{a?.name}</span>
                  <span className="ml-auto">컨디션 {r.cond[0]}% → <b className={r.cond[1] >= r.cond[0] ? "text-emerald-300" : "text-rose-300"}>{r.cond[1]}%</b> · 행동력 {r.ap}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {Object.entries(r.stats).map(([k, d]) => `${STAT_LABELS[k as StatKey]} ${d! > 0 ? "+" : ""}${d}`).join(" · ") || "능력치 변화 없음"}
                  {r.money ? ` · 자금 ${r.money > 0 ? "+" : ""}${r.money}만` : ""}{r.cheer ? " · 📣 치어풀 획득!" : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">행동 가능한 선수</div>
            <div className="text-2xl font-black text-emerald-300">{ready} <span className="text-xs text-muted-foreground">/ {planned}명</span></div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { patch(st => { for (const p of rosterOf(st, st.myTeam)) p.action = null; }); clear.mutate(); }} disabled={!!s.live} className="px-2.5 py-2 rounded-xl bg-muted border border-border text-foreground text-xs font-bold whitespace-nowrap">↺ 초기화</button>
            <button onClick={() => auto.mutate()} disabled={auto.isPending} className="px-2.5 py-2 rounded-xl bg-primary/20 border border-primary/40 text-primary text-xs font-bold whitespace-nowrap">🤖 자동 배정</button>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {ACTIONS.map(a => (
            <button key={a.key} onClick={() => chooseAll(a.key)} disabled={!!s.live}
              className="rounded-xl py-1.5 text-xs font-bold border border-border bg-muted/50 text-foreground">전체 {a.emoji} {a.name}</button>
          ))}
        </div>
        <button onClick={() => run.mutate(undefined)} disabled={run.isPending || ready === 0 || !!s.live}
          className="mt-2.5 w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white disabled:opacity-50">
          {run.isPending ? "진행 중..." : ready ? `▶ 행동을 정한 선수 모두 실행 (${ready}명)` : "실행할 수 있는 선수가 없습니다 (행동력은 매주 선수마다 +20)"}
        </button>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {ACTIONS.map(a => (
            <div key={a.key} className="rounded-lg bg-muted/60 px-1.5 py-1.5 text-center">
              <div className="text-lg leading-none">{a.emoji}</div>
              <div className="text-[11px] font-bold text-foreground mt-0.5">{a.name}</div>
              <div className="text-[10px] text-muted-foreground">행동력 {a.ap}</div>
              <div className="text-[9.5px] text-muted-foreground/80 leading-tight mt-0.5">{a.key === "train" ? "능력치↑ 컨디션 -3~5" : a.key === "rest" ? "컨디션 +5" : "자금·치어풀 컨디션 -3~5"}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">선수마다 행동력이 따로 있습니다. 매주 선수마다 20씩 받고, 쓰지 않은 행동력은 시즌 동안 계속 쌓입니다 (새 시즌에 20부터 다시). 선수 카드에서 행동을 고르고 그 선수의 "실행"을 누르면 바로 적용되고, 위 버튼은 행동을 정한 선수를 한꺼번에 실행합니다. 한 주가 끝나면 모든 선수 컨디션이 10% 회복됩니다. 경기를 뛰면 컨디션이 떨어지니(승 0~3%, 패 3~10%) 휴식도 챙기세요. 능력치는 경기와 훈련으로만 오르내립니다.</p>
      </div>

      <div className="space-y-2">
        {roster.map(p => (
          <div key={p.id} className="rounded-2xl bg-card border border-border p-3">
            <div className="flex items-center gap-2">
              <RaceBadge race={p.race} />
              <span className="font-bold text-foreground">{p.name}</span>
              <span className="text-[11px] text-muted-foreground">Lv.{p.level} · {ageOf(p, s.season)}세 · {totalOf(p.stats).toLocaleString()}</span>
              <span className="ml-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-black px-2 py-0.5 text-[11px]">⚡ 행동력 {apOf(p)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">컨디션</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-full", p.cond >= 65 ? "bg-emerald-400" : p.cond >= 40 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${p.cond}%` }} /></div>
              <CondBadge cond={p.cond} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {ACTIONS.map(a => {
                const active = p.action === a.key;
                const affordable = apOf(p) >= a.ap;
                return (
                  <button
                    key={a.key}
                    disabled={!!s.live}
                    onClick={() => choose(p.id, active ? null : (a.key as ActionKey))}
                    className={cn("rounded-xl py-2 text-xs font-bold border transition-colors",
                      active ? "bg-primary text-primary-foreground border-primary" : affordable ? "bg-muted/50 border-border text-foreground" : "bg-muted/30 border-border text-muted-foreground/50")}
                  >
                    {a.emoji} {a.name} <span className="text-[10px] opacity-70">{a.ap}</span>
                  </button>
                );
              })}
            </div>
            {(() => {
              const a = actionOf(p.action);
              const can = !!a && apOf(p) >= a.ap && !s.live && !restNotNeeded(p);
              return (
                <button onClick={() => run.mutate({ playerId: p.id })} disabled={!can || run.isPending}
                  className="mt-1.5 w-full py-2 rounded-xl text-xs font-black bg-emerald-600 text-white disabled:bg-muted disabled:text-muted-foreground">
                  {!a ? "행동을 고르세요" : restNotNeeded(p) ? "컨디션 100% — 휴식은 건너뜁니다 (행동력 그대로)" : apOf(p) < a.ap ? `행동력 부족 (${a.name} ${a.ap} 필요)` : `▶ ${p.name} ${a.name} 실행 (행동력 ${apOf(p)} → ${apOf(p) - a.ap})`}
                </button>
              );
            })()}
          </div>
        ))}
      </div>

      <button onClick={() => navigate("/league")} className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">
        🏆 경기 일정으로 →
      </button>
    </div>
  );
}
