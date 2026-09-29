import { cn } from "@/lib/utils";
import { RACE_COLORS, RACE_LABELS, GRADE_COLORS, type Grade } from "@shared/gameConstants";
import { conditionLabel } from "@shared/teamConstants";

export function ConditionBadge({ condition, className }: { condition: number; className?: string }) {
  const c = conditionLabel(condition);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", c.color, className)} title={`컨디션 ${condition}%`}>
      <span className="text-base leading-none">{c.arrow}</span>
      {c.label} <span className="font-mono opacity-80">{condition}%</span>
    </span>
  );
}

export function RaceTag({ race }: { race: string }) {
  return (
    <span className="text-xs font-semibold" style={{ color: RACE_COLORS[race] }}>
      {RACE_LABELS[race] ?? race}
    </span>
  );
}

export function GradeTag({ grade }: { grade: string }) {
  return (
    <span
      className="text-xs font-black px-1.5 py-0.5 rounded border"
      style={{ color: GRADE_COLORS[grade as Grade], borderColor: GRADE_COLORS[grade as Grade] }}
    >
      {grade}
    </span>
  );
}

export function FatigueBar({ fatigue }: { fatigue: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-400 w-10 shrink-0">피로도</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", fatigue >= 60 ? "bg-green-500" : fatigue >= 30 ? "bg-yellow-500" : "bg-red-500")}
          style={{ width: `${Math.max(0, Math.min(100, fatigue))}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-gray-300 w-7 text-right">{fatigue}</span>
    </div>
  );
}
