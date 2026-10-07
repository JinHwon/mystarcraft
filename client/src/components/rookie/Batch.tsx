/**
 * 선수 키우기: 연속 진행 (남은 행동만큼 한 번에) — 진행 중 표시와 결과 요약
 */
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { ladderGrade } from "@shared/rookie/model";
import { cn } from "@/lib/utils";

export interface BatchResult {
  kind: "lobby" | "ladder" | "clan" | "internal" | "friendly";
  count: number; w: number; l: number;
  results: Array<{ won: boolean; opp: string; map: string }>;
  stats: Partial<Record<(typeof STAT_KEYS)[number], number>>;
  cond: [number, number];
  ladder?: [number, number];
  clan?: { points: [number, number]; rank: [number, number] };
  level: [number, number];
  stop?: string;
}
export const BATCH_NAMES: Record<BatchResult["kind"], string> = { lobby: "공방 연습", ladder: "래더", clan: "클랜 연습", internal: "팀 내부 연습", friendly: "친선경기" };

/** 진행 중 (가운데 덮개) */
export function BatchRunning({ label, n }: { label: string; n?: number }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
      <div className="rounded-2xl bg-card border border-border p-6 text-center w-full max-w-xs">
        <div className="text-4xl animate-bounce">🎮</div>
        <div className="font-black text-foreground mt-2">{label}{n ? ` ${n}판` : ""} 진행 중...</div>
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full w-1/3 bg-primary animate-[pulse_1s_ease-in-out_infinite]" style={{ animation: "batchbar 1.1s linear infinite" }} /></div>
        <style>{"@keyframes batchbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}"}</style>
      </div>
    </div>
  );
}

/** 결과 요약 내용 (팝업과 하루 리포트에서 같이 씀) */
export function BatchBody({ r }: { r: BatchResult }) {
  const sum = Object.values(r.stats).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-[12px] text-muted-foreground">{BATCH_NAMES[r.kind]} {r.count}판 결과</div>
        <div className="text-3xl font-black"><span className="text-emerald-300">{r.w}승</span> <span className="text-rose-300">{r.l}패</span></div>
        <div className="text-[11px] text-muted-foreground">승률 {Math.round((r.w / Math.max(1, r.count)) * 100)}%</div>
      </div>
      <div className="flex flex-wrap gap-1 justify-center">
        {r.results.map((g, i) => (
          <span key={i} title={`${g.opp} · ${g.map}`} className={cn("w-6 h-6 rounded-md text-[11px] font-black flex items-center justify-center", g.won ? "bg-emerald-600/80 text-white" : "bg-rose-600/70 text-white")}>{g.won ? "승" : "패"}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Box label="능력치 합" value={`${sum >= 0 ? "+" : ""}${sum}`} good={sum >= 0} />
        <Box label="컨디션" value={`${r.cond[0]}% → ${r.cond[1]}%`} good={r.cond[1] >= r.cond[0]} />
        {r.ladder && <Box label="래더" value={`${r.ladder[0]} → ${r.ladder[1]} (${ladderGrade(r.ladder[1])})`} good={r.ladder[1] >= r.ladder[0]} />}
        {r.clan && <Box label="클랜 점수 · 순위" value={`${r.clan.points[0]} → ${r.clan.points[1]} · ${r.clan.rank[0]}위 → ${r.clan.rank[1]}위`} good={r.clan.points[1] >= r.clan.points[0]} />}
        {r.level[1] > r.level[0] && <Box label="레벨 업!" value={`Lv.${r.level[0]} → Lv.${r.level[1]}`} good />}
      </div>
      <div className="rounded-xl bg-muted/40 border border-border p-2.5">
        <div className="text-[11.5px] font-bold text-foreground mb-1">능력치 변화</div>
        <div className="grid grid-cols-4 gap-1 text-[12px]">
          {STAT_KEYS.map(k => {
            const v = r.stats[k] ?? 0;
            return <div key={k} className="rounded-lg bg-background/50 py-1 text-center"><div className="text-[10.5px] text-muted-foreground">{STAT_LABELS[k]}</div><b className={v > 0 ? "text-emerald-300" : v < 0 ? "text-rose-300" : "text-muted-foreground"}>{v > 0 ? `+${v}` : v}</b></div>;
          })}
        </div>
      </div>
      {r.stop && <div className="text-[11.5px] text-amber-300 text-center">중간에 멈춤: {r.stop}</div>}
    </div>
  );
}

/** 결과 요약 */
export function BatchSummary({ r, onClose }: { r: BatchResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-card border border-border p-4 space-y-3 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <BatchBody r={r} />
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-black">확인</button>
      </div>
    </div>
  );
}
function Box({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border px-2.5 py-2">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className={cn("text-[13px] font-black", good ? "text-emerald-300" : "text-rose-300")}>{value}</div>
    </div>
  );
}
