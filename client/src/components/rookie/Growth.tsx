/**
 * 선수 키우기: 능력치 성장 그래프 · 레벨 · 이번 주 일정 띠
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DOW, courageDays, dateText, draftDay, isMonthEnd, levelNeed, MAX_LEVEL, ymd, type RookieState,
} from "@shared/rookie/model";

/** 능력치 합 추이 (한 줄 그래프 + 성장 한계 점선, 손가락/마우스로 날짜별 값 보기) */
export function GrowthChart({ s, cap }: { s: RookieState; cap: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = s.history.slice(-180);
  if (pts.length < 2) return <div className="text-[11px] text-muted-foreground py-4 text-center">하루가 지나면 성장 그래프가 그려집니다</div>;
  const W = 320, H = 120, padL = 34, padR = 8, padT = 8, padB = 18;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  // 세로축은 내 기록에 맞춰서 (한계가 가까우면 한계 선도 보이게)
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = Math.max(200, hi - lo);
  const yMin = Math.floor((lo - span * 0.15) / 50) * 50;
  const yMax = Math.ceil((cap - hi < span * 0.6 ? Math.max(cap, hi) + span * 0.1 : hi + span * 0.2) / 50) * 50;
  const capVisible = cap <= yMax;
  const X = (d: number) => padL + ((d - x0) / Math.max(1, x1 - x0)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const ticks = [yMin, Math.round((yMin + yMax) / 2 / 50) * 50, yMax];
  const hp = hover !== null ? pts[hover] : pts[pts.length - 1];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = x0 + ((((e.clientX - r.left) / r.width) * W - padL) / (W - padL - padR)) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - d) < Math.abs(pts[best][0] - d)) best = i;
    setHover(best);
  };
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
        <span>{dateText(hp[0])}</span>
        <span>능력치 합 <b className="text-foreground">{hp[1].toLocaleString()}</b> · 한계 {cap.toLocaleString()}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="능력치 합 추이">
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={padL - 4} y={Y(t) + 3} textAnchor="end" fontSize={9} className="fill-muted-foreground">{t.toLocaleString()}</text>
          </g>
        ))}
        {capVisible && <line x1={padL} x2={W - padR} y1={Y(cap)} y2={Y(cap)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" />}
        {capVisible && <text x={W - padR} y={Y(cap) - 3} textAnchor="end" fontSize={9} fill="#f59e0b">성장 한계</text>}
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={X(hp[0])} x2={X(hp[0])} y1={padT} y2={H - padB} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} />}
        <circle cx={X(hp[0])} cy={Y(hp[1])} r={4} fill="#38bdf8" stroke="var(--card, #1e293b)" strokeWidth={2} />
        <text x={padL} y={H - 4} fontSize={9} className="fill-muted-foreground">{dateText(x0).slice(2)}</text>
        <text x={W - padR} y={H - 4} fontSize={9} textAnchor="end" className="fill-muted-foreground">{dateText(x1).slice(2)}</text>
      </svg>
    </div>
  );
}

/** 레벨 · 경험치 막대 */
export function LevelBar({ s, compact }: { s: RookieState; compact?: boolean }) {
  const need = levelNeed(s.level);
  const pct = s.level >= MAX_LEVEL ? 100 : Math.round((s.exp / need) * 100);
  return (
    <div className={cn("flex items-center gap-1.5", compact ? "text-[10px]" : "text-[11.5px]")}>
      <span className="font-black text-amber-300 shrink-0">Lv.{s.level}</span>
      <div className="flex-1 h-1.5 rounded-full bg-black/40 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${pct}%` }} /></div>
      <span className="text-neutral-400 shrink-0">{s.level >= MAX_LEVEL ? "MAX" : `${s.exp}/${need}`}</span>
    </div>
  );
}

/** 오늘부터 일주일: 날마다 무슨 일정이 있는지 (달력처럼 하루씩 진행) */
export function WeekStrip({ s, onOpenCalendar }: { s: RookieState; onOpenCalendar: () => void }) {
  // 실제 달력처럼 이번 주 일요일 ~ 토요일, 오늘이 선택된 상태
  const sunday = s.day - ymd(s.day).dow;
  const days = Array.from({ length: 7 }, (_, i) => sunday + i);
  const icons = (d: number) => {
    const y = ymd(d).y;
    const out: string[] = [];
    if (!s.team && courageDays(y).includes(d)) out.push("🎓");
    if (!s.team && draftDay(y) === d) out.push("📋");
    for (const e of s.events) if (e.day === d) out.push(e.result ? "🏆" : e.registered ? "🏆" : "🎪");
    const x = ymd(d);
    if (s.team?.squad === 1 && [3, 4, 5, 6, 9, 10, 11, 12].includes(x.m) && (x.dow === 0 || x.dow === 6)) out.push("🏟️");
    if (s.team && isMonthEnd(d)) out.push("⬆️");
    if (s.team && x.d === 1) out.push("💰");
    if (s.nego && s.nego.until === d) out.push("💼");
    return out;
  };
  const x0 = ymd(s.day);
  return (
    <button onClick={onOpenCalendar} className="w-full rounded-2xl bg-card border border-border p-2 text-left">
      <div className="flex items-center justify-between px-0.5 mb-1">
        <span className="text-[12px] font-black text-foreground">📅 {x0.y}년 {x0.m}월</span>
        <span className="text-[10.5px] text-muted-foreground">달력 보기 ›</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const x = ymd(d);
          const ic = icons(d);
          const today = d === s.day, past = d < s.day;
          const sum = s.days[d];
          return (
            <div key={d} className={cn("rounded-xl border py-1 flex flex-col items-center min-h-[56px]", today ? "border-primary bg-primary/20 ring-1 ring-primary" : past ? "border-border/60 bg-muted/20 opacity-70" : "border-border bg-background/40", d < 0 && "opacity-25")}>
              <span className={cn("text-[9.5px]", x.dow === 0 ? "text-rose-300" : x.dow === 6 ? "text-sky-300" : "text-muted-foreground")}>{DOW[x.dow]}</span>
              <span className={cn("text-[13px] font-black leading-tight", today ? "text-primary" : "text-foreground")}>{x.d}</span>
              <span className="text-[11px] leading-none mt-0.5">{ic.slice(0, 2).join("")}</span>
              {sum && (sum.w || sum.l) ? <span className="text-[9px] mt-auto"><span className="text-emerald-300">{sum.w}</span>-<span className="text-rose-300">{sum.l}</span></span> : today ? <span className="text-[8.5px] text-primary mt-auto">오늘</span> : null}
            </div>
          );
        })}
      </div>
    </button>
  );
}
