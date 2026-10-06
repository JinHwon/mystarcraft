/**
 * 달력: 날마다 한 일(아이콘)과 승패, 앞으로의 일정(커리지 매치·드래프트·대회·프로리그)
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DOW, courageDays, dayOf, draftDay, ymd, type RookieState } from "@shared/rookie/model";

export function RookieCalendar({ s }: { s: RookieState }) {
  const now = ymd(s.day);
  const [ym, setYm] = useState({ y: now.y, m: now.m });
  const [sel, setSel] = useState<number | null>(s.day);
  const first = dayOf(ym.y, ym.m, 1);
  const startDow = ymd(first).dow;
  const len = dayOf(ym.m === 12 ? ym.y + 1 : ym.y, ym.m === 12 ? 1 : ym.m + 1, 1) - first;
  const special = (d: number) => {
    const y = ymd(d).y;
    const out: string[] = [];
    if (courageDays(y).includes(d)) out.push("🎓");
    if (draftDay(y) === d) out.push("📋");
    for (const e of s.events) if (e.day === d) out.push(e.registered ? "🏆" : "🎪");
    return out;
  };
  const move = (k: number) => setYm(({ y, m }) => { const mm = m + k; return mm < 1 ? { y: y - 1, m: 12 } : mm > 12 ? { y: y + 1, m: 1 } : { y, m: mm }; });
  const logs = sel !== null ? s.log.filter(l => l.day === sel) : [];
  const evs = sel !== null ? s.events.filter(e => e.day === sel) : [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => move(-1)} className="px-3 py-1 rounded-lg bg-muted text-foreground">◀</button>
        <div className="font-black text-foreground">{ym.y}년 {ym.m}월</div>
        <button onClick={() => move(1)} className="px-3 py-1 rounded-lg bg-muted text-foreground">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
        {DOW.map((d, i) => <div key={d} className={cn(i === 0 && "text-rose-300", i === 6 && "text-sky-300")}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: startDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: len }, (_, i) => {
          const d = first + i;
          const sum = s.days[d];
          const sp = special(d);
          const past = d < s.day, today = d === s.day;
          return (
            <button key={d} onClick={() => setSel(d)}
              className={cn("min-h-[54px] rounded-md border p-0.5 text-left flex flex-col", today ? "border-primary bg-primary/15" : sel === d ? "border-amber-400" : "border-border bg-card", past && !sum && "opacity-50", d < 0 && "opacity-25 pointer-events-none")}>
              <span className="text-[10px] text-muted-foreground leading-none">{i + 1}</span>
              <span className="text-[11px] leading-tight break-all">{[...(sum?.icons ?? []), ...sp.filter(x => !sum?.icons.includes(x))].slice(0, 4).join("")}</span>
              {sum && (sum.w || sum.l) ? <span className="mt-auto text-[9px] leading-none"><span className="text-emerald-300">{sum.w}</span>-<span className="text-rose-300">{sum.l}</span></span> : null}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground">🎮 공방 · ⚔️ 래더 · 💤 휴식 · 📺 방송 · 💵 용돈 · 🏆 대회 · 🎓 커리지 매치 · 📋 드래프트 · 🏢 구단 · 🏟️ 프로리그 · 🎪 대회(미신청)</div>
      {sel !== null && (
        <div className="rounded-xl bg-card border border-border p-2.5 space-y-1">
          <div className="text-xs font-bold text-foreground">{ymd(sel).m}월 {ymd(sel).d}일 ({DOW[ymd(sel).dow]}){sel === s.day ? " · 오늘" : ""}</div>
          {evs.map(e => <div key={e.id} className="text-[11.5px] text-amber-300">🏆 {e.name} ({e.size}강 · 우승 {e.prize[0]}만원){e.registered ? " · 신청함" : ""}{e.result ? ` · ${e.result}` : ""}</div>)}
          {special(sel).includes("🎓") && <div className="text-[11.5px] text-violet-300">🎓 커리지 매치 (우승하면 준프로)</div>}
          {special(sel).includes("📋") && <div className="text-[11.5px] text-sky-300">📋 드래프트 (준프로만)</div>}
          {logs.map((l, k) => <div key={k} className="text-[11.5px] text-foreground">{l.icon} {l.text}</div>)}
          {!logs.length && !evs.length && !special(sel).length && <div className="text-[11px] text-muted-foreground">기록이 없습니다</div>}
        </div>
      )}
    </div>
  );
}
