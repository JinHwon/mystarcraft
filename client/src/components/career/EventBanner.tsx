/**
 * 진행 중인 운영 이벤트 (메인 화면 · 알림창 맨 위): 효과 · 기간 · 남은 시간
 */
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EVENT_INFO, type CareerEventType } from "@shared/career/events";

/** DB 시각은 UTC "YYYY-MM-DD HH:MM:SS" */
const parse = (v?: string | null) => (v ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(" ", "T")}Z`) : undefined);
const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function left(end: Date) {
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return "곧 종료";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `${Math.floor(h / 24)}일 남음`;
  if (h >= 1) return `${h}시간 남음`;
  return `${Math.max(1, Math.floor(ms / 60_000))}분 남음`;
}

export function EventBanner({ className }: { className?: string }) {
  const q = trpc.event.listActive.useQuery(undefined, { staleTime: 5 * 60_000 });
  const list = q.data ?? [];
  if (!list.length) return null;
  return (
    <div className={cn("rounded-2xl border border-emerald-400/50 overflow-hidden", className)} style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.04))" }}>
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-black text-emerald-300 tracking-wide">🎉 진행 중인 이벤트</span>
        <span className="text-[10px] text-emerald-200/70">{list.length}개</span>
      </div>
      <div className="px-2 pb-2 space-y-1">
        {list.map(e => {
          const info = EVENT_INFO[e.type as CareerEventType];
          const start = parse(e.startTime), end = parse(e.endTime);
          const pct = start && end ? Math.min(100, Math.max(0, ((Date.now() - start.getTime()) / (end.getTime() - start.getTime())) * 100)) : undefined;
          return (
            <div key={e.id} className="rounded-xl bg-black/25 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-xs text-foreground">
                <span className="text-base leading-none">{info?.icon ?? "🎉"}</span>
                <b className="truncate">{e.name}</b>
                {end && <span className="ml-auto shrink-0 text-[10.5px] font-bold text-amber-300">{left(end)}</span>}
              </div>
              <div className="text-[11px] text-muted-foreground">{info?.desc ?? e.description}</div>
              <div className="text-[10px] text-muted-foreground/80">{start ? fmt(start) : "지금"} ~ {end ? fmt(end) : "종료 시까지"}</div>
              {pct !== undefined && <div className="h-1 rounded-full bg-black/40 mt-1 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
