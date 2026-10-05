import { useState } from "react";
import { useLocation } from "wouter";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import type { ActionResult } from "../../../server/career/logic";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { eventIncome, popularity } from "@shared/career/contract";
import { ACTIONS, WEEKLY_AP, actionOf, restNotNeeded, totalOf, type ActionKey, type CareerState } from "@shared/career/rules";
import { rosterOf } from "@shared/career/view";
import { useCareer, useCareerPatch, useCareerUpdater } from "@/lib/career";
import { LegacyFrame, LegacyImg } from "@/components/legacy/Legacy";

/** 원작 그림 (휴식 · 특훈 · 팬미팅) */
const ACTION_IMG: Record<ActionKey, string> = { rest: "Rest", train: "Train", event: "Event" };
const ACTION_ORDER: ActionKey[] = ["rest", "train", "event"];
const EFFECT: Record<ActionKey, string> = {
  rest: "컨디션 +5 · 능력치 변화 없음",
  train: "능력치 ↑ · 컨디션 -3~5",
  event: "구단 자금(인기 많을수록, 최대 150만) · 치어풀 확률 · 컨디션 -3~5 · 능력치 조금 ↓",
};
const RACE = { terran: "T", zerg: "Z", protoss: "P" } as const;
const BTN = "border border-neutral-500 text-black font-bold disabled:opacity-40";
const BTN_BG = { background: "linear-gradient(#ffffff,#d6d6d6)" };

function ActionIcon({ k, size = 18 }: { k: ActionKey; size?: number }) {
  const a = actionOf(k)!;
  return <LegacyImg dir="기타" name={ACTION_IMG[k]} className="object-cover inline-block" style={{ width: size, height: size }} fallback={<span style={{ fontSize: size * 0.8 }}>{a.emoji}</span>} />;
}

/** 선수 행동: 행동(붓)을 고르고 선수를 누르면 그 행동이 지정된다. 실행하면 바로 적용 */
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
  const careerPatch = useCareerPatch();
  const [results, setResults] = useState<ActionResult[] | null>(null);
  const run = trpc.career.runActions.useMutation({
    onSuccess: r => { careerPatch(r.diff); setResults(r.result.results); },
    onError: updater.onError,
  });
  const [brush, setBrush] = useState<ActionKey>("train");

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const roster = rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));
  const apOf = (p: (typeof roster)[number]) => p.ap ?? WEEKLY_AP;
  const canRun = (p: (typeof roster)[number]) => { const a = actionOf(p.action); return !!a && apOf(p) >= a.ap && !restNotNeeded(p); };
  // 컨디션 100% 선수의 휴식은 실행에서 자동으로 빠짐
  const ready = roster.filter(canRun).length;
  const busy = !!s.live;
  const choose = (pid: number, action: ActionKey | null) => {
    patch(st => { st.players[pid].action = action; });
    setAction.mutate({ playerId: pid, action });
  };
  /** 이 행동을 실제로 할 수 있는 선수 (행동력이 충분하고, 휴식은 컨디션 100% 미만) */
  const eligible = (k: ActionKey) => { const x = actionOf(k)!; return roster.filter(p => apOf(p) >= x.ap && !(k === "rest" && p.cond >= 100)); };
  const allOn = (k: ActionKey) => { const el = eligible(k); return el.length > 0 && el.every(p => p.action === k); };
  /** 전체 선택/해제: 할 수 있는 선수가 모두 이 행동이면 해제, 아니면 할 수 있는 선수만 지정 */
  const toggleAll = (k: ActionKey) => {
    const off = allOn(k);
    const ids = (off ? roster.filter(p => p.action === k) : eligible(k)).map(p => p.id);
    if (!ids.length) return;
    const set = new Set(ids);
    patch(st => { for (const p of rosterOf(st, st.myTeam)) if (set.has(p.id)) p.action = off ? null : k; });
    setAll.mutate({ action: off ? null : k, playerIds: ids });
  };
  const a = actionOf(brush)!;
  const withBrush = roster.filter(p => p.action === brush);
  const cheer = s.inventory?.cheer ?? 0;
  const money = s.teams[s.myTeam].money;

  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/lobby")}
      bottom={
        <div className="flex gap-2">
          <button onClick={() => navigate("/lobby")} className={cn(BTN, "px-3 py-1 text-[13px]")} style={BTN_BG}>◁◁ 감독실</button>
          <button onClick={() => run.mutate(undefined)} disabled={run.isPending || ready === 0 || busy} className={cn(BTN, "px-4 py-1 text-[14px] min-w-[150px]")} style={BTN_BG}>
            {run.isPending ? "실행 중…" : `실행 (${ready}명)`}
          </button>
        </div>
      }>
      <div className="relative h-full flex flex-col gap-1.5 px-3 pt-2 pb-3 text-[12px]">
        <div className="shrink-0 flex items-center">
          <span className="flex-1 text-center text-[16px] tracking-[0.3em] text-neutral-100 pl-16">선 수 행 동</span>
          <button onClick={() => auto.mutate()} disabled={auto.isPending || busy} className="border border-neutral-600 px-1.5 text-[11px] text-neutral-200">자동</button>
          <button onClick={() => { patch(st => { for (const p of rosterOf(st, st.myTeam)) p.action = null; }); clear.mutate(); }} disabled={busy} className="ml-1 border border-neutral-600 px-1.5 text-[11px] text-neutral-200">초기화</button>
        </div>

        {/* 행동 고르기 (원작의 1 휴식 · 2 특훈 · 3 팬미팅) */}
        <div className="shrink-0 grid grid-cols-3 gap-2 px-1">
          {ACTION_ORDER.map((k, i) => {
            const x = actionOf(k)!;
            const n = roster.filter(p => p.action === k).length;
            return (
              <button key={k} onClick={() => setBrush(k)} className="flex flex-col items-center">
                <span className="text-[10px] leading-none border border-neutral-500 px-1 mb-0.5">{i + 1}</span>
                <span className={cn("block p-[2px] border-2", brush === k ? "border-[#ff8a8a]" : "border-transparent")}>
                  <LegacyImg dir="기타" name={ACTION_IMG[k]} className="block w-[72px] h-[72px] object-cover" fallback={<span className="flex w-[72px] h-[72px] items-center justify-center text-[30px] bg-neutral-800">{x.emoji}</span>} />
                </span>
                <span className={cn("text-[11px] mt-0.5", brush === k ? "text-white" : "text-neutral-400")}>{x.name} · {x.ap}{n ? <span className="text-[#ffe45c]"> ({n}명)</span> : null}</span>
              </button>
            );
          })}
        </div>

        {/* 고른 행동 설명 (원작 오른쪽 아래 상자) */}
        <div className="shrink-0 border-2 border-neutral-600 px-2 py-1.5 space-y-0.5">
          <div className="text-center text-[14px] text-white">{a.key === "rest" ? "휴식을 취합니다" : a.key === "train" ? "특별 훈련을 합니다" : "팬미팅을 합니다"}</div>
          <div className="text-center text-[10.5px] text-neutral-400">{EFFECT[a.key]}</div>
          <div className="grid grid-cols-3 text-center text-[11px] pt-0.5">
            <span>소모 행동력 <b className="text-[#ffe45c]">{a.ap * withBrush.length}</b></span>
            <span>치어풀 <b className="text-[#ffe45c]">{cheer}</b>개</span>
            <span>보유 <b className="text-[#ffe45c]">{money.toLocaleString()}</b>만</span>
          </div>
          <div className="flex gap-1 pt-0.5">
            <button onClick={() => toggleAll(brush)} disabled={busy || (!eligible(brush).length && !allOn(brush))}
              className={cn("flex-1 border py-0.5 text-[11px] disabled:opacity-40", allOn(brush) ? "border-[#ff8a8a] text-[#ffb8c8]" : "border-neutral-500")}>
              {allOn(brush) ? `전체 ${a.name} 해제` : `전체 선수 ${a.name} (${eligible(brush).length}명)`}
            </button>
            <span className="flex-[2] text-[10px] text-neutral-500 self-center leading-tight">선수를 누르면 지정·해제 · 전체는 행동력이 되는 선수만{brush === "rest" ? " (컨디션 100% 제외)" : ""}</span>
          </div>
        </div>

        {/* 선수 목록 */}
        <div className="flex-1 min-h-0 border-2 border-neutral-300 flex flex-col">
          <button disabled={busy} onClick={() => toggleAll(brush)} title={`전체 ${a.name} 선택/해제`}
            className="shrink-0 grid grid-cols-[minmax(0,1fr)_44px_92px_30px_34px] gap-1 px-1.5 py-1 text-[11px] text-neutral-300 border-b border-neutral-700 text-left active:bg-neutral-900">
            <span>선수들 <span className="text-[9.5px] text-neutral-500">{allOn(brush) ? "· 눌러서 전체 해제" : "· 눌러서 전체 선택"}</span></span><span className="text-center">행동력</span><span className="text-center">컨디션</span><span className="text-center">행동</span><span />
          </button>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {roster.map(p => {
              const act = actionOf(p.action);
              const ok = canRun(p);
              return (
                <div key={p.id} className={cn("grid grid-cols-[minmax(0,1fr)_44px_92px_30px_34px] gap-1 items-center px-1.5 py-[3px] border-b border-neutral-900", p.action === brush && "bg-[#3a3a5a]/60")}>
                  <button disabled={busy} onClick={() => choose(p.id, p.action === brush ? null : brush)} className="col-span-4 grid grid-cols-[minmax(0,1fr)_44px_92px_30px] gap-1 items-center text-left">
                    <span className="truncate">{p.name} <span className="text-neutral-500">({RACE[p.race]})</span></span>
                    <span className={cn("text-center", act && apOf(p) < act.ap ? "text-[#ff8a8a]" : "text-neutral-200")}>{apOf(p)}</span>
                    <span className="flex items-center gap-1">
                      <span className="flex-1 h-1.5 bg-neutral-800"><span className={cn("block h-full", p.cond >= 65 ? "bg-[#8fe07a]" : p.cond >= 40 ? "bg-[#f8e070]" : "bg-[#ff6b6b]")} style={{ width: `${p.cond}%` }} /></span>
                      <span className="w-7 text-right text-[11px]">{p.cond}</span>
                    </span>
                    <span className="flex justify-center">{act ? <ActionIcon k={act.key} /> : <span className="text-neutral-700">-</span>}</span>
                  </button>
                  <button onClick={() => run.mutate({ playerId: p.id })} disabled={!ok || run.isPending || busy} title={restNotNeeded(p) ? "컨디션 100% — 휴식 필요 없음" : "이 선수만 실행"}
                    className="text-[10px] border border-neutral-500 py-0.5 disabled:opacity-25 disabled:border-neutral-800">▶</button>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 px-1.5 py-1 text-[10px] text-neutral-500 border-t border-neutral-800 leading-snug">
            {a.key === "event" ? `팬미팅 예상 수익: ${roster.filter(p => p.action === "event").map(p => `${p.name} 약 ${Math.round(eventIncome(p))}만(인기 ${popularity(p)})`).join(" · ") || "지정된 선수 없음"} · ` : ""}
            행동력은 매주 선수마다 +{WEEKLY_AP} (시즌 동안 쌓임) · 한 주가 끝나면 컨디션 10% 회복
          </div>
        </div>

        {results && (
          <div className="absolute inset-x-2 top-2 bottom-2 z-30 bg-black border-2 border-[#8fe07a]/70 flex flex-col">
            <div className="shrink-0 flex items-center px-2 py-1.5 border-b border-neutral-700">
              <span className="text-[#bff5c6] text-[13px] font-bold">✅ 선수 행동 결과</span>
              <button onClick={() => setResults(null)} className="ml-auto border border-neutral-500 px-2 text-[12px]">닫기 ✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {results.map(r => {
                const p = s.players[r.id];
                const x = actionOf(r.action);
                return (
                  <div key={r.id} className="border border-neutral-700 px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <ActionIcon k={r.action} size={22} /><b>{p.name}</b><span className="text-neutral-400">{x?.name}</span>
                      <span className="ml-auto text-[11px]">컨디션 {r.cond[0]} → <b className={r.cond[1] >= r.cond[0] ? "text-[#bff5c6]" : "text-[#ffb8c8]"}>{r.cond[1]}</b> · 행동력 {r.ap}</span>
                    </div>
                    <div className="text-[10.5px] text-neutral-400">
                      {Object.entries(r.stats).map(([k, d]) => `${STAT_LABELS[k as StatKey]} ${d! > 0 ? "+" : ""}${d}`).join(" · ") || "능력치 변화 없음"}
                      {r.money ? ` · 자금 ${r.money > 0 ? "+" : ""}${r.money}만` : ""}{r.cheer ? " · 📣 치어풀 획득!" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </LegacyFrame>
  );
}
