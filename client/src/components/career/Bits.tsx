import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { condLabel, type Race } from "@shared/career/rules";

export const RACE_SHORT: Record<string, string> = { terran: "T", zerg: "Z", protoss: "P" };
export const RACE_NAME: Record<string, string> = { terran: "테란", zerg: "저그", protoss: "프로토스" };
const RACE_STYLE: Record<string, string> = {
  terran: "bg-sky-500/25 text-sky-200 border-sky-400/40",
  zerg: "bg-purple-500/25 text-purple-200 border-purple-400/40",
  protoss: "bg-amber-500/25 text-amber-200 border-amber-400/40",
};

export function RaceBadge({ race, className }: { race: Race | string; className?: string }) {
  return <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-md border text-[11px] font-black shrink-0", RACE_STYLE[race], className)}>{RACE_SHORT[race]}</span>;
}

export function TeamBadge({ short, color, className }: { short: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md px-1.5 h-5 text-[10px] font-black text-white shrink-0", className)} style={{ background: color }}>
      {short}
    </span>
  );
}

/** 컨디션 % (원작: 의욕/짜증) */
export function CondBadge({ cond, className }: { cond: number; className?: string }) {
  const face = cond >= 85 ? "😆" : cond >= 65 ? "🙂" : cond >= 45 ? "😐" : cond >= 25 ? "😒" : "😡";
  const color = cond >= 65 ? "text-emerald-300" : cond >= 45 ? "text-slate-200" : cond >= 25 ? "text-amber-300" : "text-rose-300";
  return <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", color, className)}>{face}{condLabel(cond)} {cond}%</span>;
}

const BAR_COLORS: Record<StatKey, string> = {
  control: "bg-emerald-400", attack: "bg-rose-400", harass: "bg-amber-400", strategy: "bg-violet-400",
  supply: "bg-orange-400", defense: "bg-sky-400", scout: "bg-pink-400", sense: "bg-cyan-400",
};

export function StatBars({ stats, compare }: { stats: Record<StatKey, number>; compare?: Record<StatKey, number> }) {
  return (
    <div className="space-y-1.5">
      {STAT_KEYS.map(k => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-12 text-xs text-muted-foreground shrink-0">{STAT_LABELS[k]}</span>
          <div className="flex-1 h-2 rounded-full bg-black/25 overflow-hidden">
            <div className={cn("h-full rounded-full", BAR_COLORS[k])} style={{ width: `${stats[k] / 10}%` }} />
          </div>
          <span className="w-9 text-right text-xs font-mono font-bold text-foreground">{stats[k]}</span>
          {compare && <span className={cn("w-9 text-right text-[10px] font-mono", stats[k] - compare[k] >= 0 ? "text-emerald-300" : "text-rose-300")}>{stats[k] - compare[k] >= 0 ? "+" : ""}{stats[k] - compare[k]}</span>}
        </div>
      ))}
    </div>
  );
}
