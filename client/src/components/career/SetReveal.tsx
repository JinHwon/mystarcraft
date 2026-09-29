import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { CareerState, SetResult } from "@shared/career/rules";
import { mapView } from "@shared/career/view";
import { RaceBadge } from "./Bits";

function lineClass(line: string) {
  if (/GG|판정/.test(line)) return "text-red-300 font-semibold";
  if (/뒤집|역습!/.test(line)) return "text-fuchsia-300 font-semibold";
  if (/교전 승리|무너|지켜냅/.test(line)) return "text-amber-300";
  if (/공격!/.test(line)) return "text-orange-200";
  return "text-slate-300";
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

/**
 * 세트별 문자중계를 한 줄씩 공개 (결과는 끝까지 보기 전엔 알 수 없음)
 * mySide: 내 팀이 a 쪽인지 b 쪽인지
 */
export default function SetReveal({ state, sets, mySide, title, footer, onDone }: {
  state: CareerState;
  sets: SetResult[];
  mySide: "a" | "b";
  title: string;
  footer?: string;
  onDone?: () => void;
}) {
  const [setIdx, setSetIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [skip, setSkip] = useState(false);
  const cur = sets[setIdx];
  const lines = cur?.highlights ?? [];
  const setDone = skip || lineIdx >= lines.length;
  const allDone = skip || (setIdx >= sets.length - 1 && setDone);

  useEffect(() => {
    if (skip || !cur) return;
    const t = setTimeout(() => {
      if (lineIdx < lines.length) setLineIdx(lineIdx + 1);
      else if (setIdx < sets.length - 1) { setSetIdx(setIdx + 1); setLineIdx(0); }
    }, lineIdx < lines.length ? 420 : 1300);
    return () => clearTimeout(t);
  }, [lineIdx, setIdx, skip, cur, lines.length, sets.length]);

  useEffect(() => { if (allDone) onDone?.(); }, [allDone]);

  const shown = skip ? sets : sets.slice(0, setIdx + (setDone ? 1 : 0));
  const mine = shown.filter(s => s.winner === mySide).length;
  const theirs = shown.length - mine;

  return (
    <div className="rounded-2xl bg-slate-950/70 border border-indigo-500/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-indigo-200 font-bold">📺 {title}</div>
        {!allDone && <button className="text-xs text-muted-foreground font-semibold" onClick={() => setSkip(true)}>결과 바로 보기 ⏭</button>}
      </div>
      <div className="flex items-center justify-center gap-4 text-3xl font-black">
        <span className="text-sky-300">{mine}</span>
        <span className="text-slate-600 text-lg">:</span>
        <span className="text-rose-300">{theirs}</span>
      </div>
      <div className="space-y-2">
        {(skip ? sets : sets.slice(0, setIdx + 1)).map((s, i) => {
          const revealed = skip || i < setIdx || setDone;
          const visible = skip || i < setIdx ? (s.highlights ?? []) : (s.highlights ?? []).slice(0, lineIdx);
          const pa = state.players[s.a], pb = state.players[s.b];
          const me = mySide === "a" ? pa : pb, op = mySide === "a" ? pb : pa;
          const iWon = s.winner === mySide;
          const ace = i === sets.length - 1 && sets.length >= 5;
          return (
            <div key={i} className="rounded-xl border border-slate-700 bg-slate-900/80 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs mb-1.5">
                <span className="text-slate-400">{ace ? "⭐ 에이스 결정전" : `${i + 1}세트`} · 🗺️ {mapView(s.mapId).name}</span>
                {revealed && <span className={cn("font-bold", iWon ? "text-emerald-300" : "text-rose-300")}>{iWon ? "승리" : "패배"} · {fmt(s.duration)}</span>}
              </div>
              <div className="flex items-center gap-1.5 text-sm mb-1">
                <RaceBadge race={me?.race ?? "terran"} />
                <b className={cn(revealed && iWon ? "text-amber-300" : "text-sky-200")}>{me?.name}</b>
                <span className="text-slate-500 text-xs">vs</span>
                <RaceBadge race={op?.race ?? "terran"} />
                <b className={cn(revealed && !iWon ? "text-amber-300" : "text-rose-200")}>{op?.name}</b>
              </div>
              {visible.length > 0 && (
                <div className="space-y-0.5 max-h-52 overflow-y-auto font-mono text-[11px] leading-relaxed">
                  {visible.map((l, j) => <div key={j} className={lineClass(l)}>{l}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {allDone && footer && <div className="text-center text-sm font-bold text-amber-300">{footer}</div>}
    </div>
  );
}
