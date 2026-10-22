/**
 * 선수 키우기: 또래 세계(랭킹·소식) · 올해 목표 · 명예의 전당 · 은퇴 화면
 */
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { type RookieToday } from "@/lib/rookie";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { STATUS_NAMES, dateText, sumStats, type RookieState } from "@shared/rookie/model";

const RACE_SHORT = { terran: "T", zerg: "Z", protoss: "P" } as const;

/** 올해 목표 (진행 막대) */
export function GoalsCard({ s, today, compact }: { s: RookieState; today: RookieToday; compact?: boolean }) {
  const goals = today.goals ?? [];
  if (!goals.length) return null;
  const done = goals.filter(g => g.done).length;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-black text-foreground">🎯 {s.goals?.year}년 목표</span>
        <span className="text-[11px] text-muted-foreground">{done}/{goals.length} 달성{today.peerRank ? ` · 또래 ${today.peerRank}위` : ""}</span>
      </div>
      {goals.map(g => {
        const pct = Math.max(0, Math.min(100, g.target ? (g.now / g.target) * 100 : 0));
        return (
          <div key={g.text} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className={cn(g.done ? "text-emerald-300" : "text-foreground")}>{g.done ? "✅" : "▫️"} {g.text}</span>
              <span className="text-muted-foreground tabular-nums">{g.done ? "달성" : g.target === 1 ? "" : `${g.now} / ${g.target}`}</span>
            </div>
            {!compact && !g.done && g.target > 1 && <div className="h-1.5 rounded bg-muted/50 overflow-hidden"><div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} /></div>}
          </div>
        );
      })}
      {!compact && <div className="text-[10.5px] text-muted-foreground">달성하면 인지도·돈·경험치 보상 · 연말에 평가 메일이 옵니다</div>}
    </div>
  );
}

/** 또래 세계: 같은 세대 선수 랭킹과 소식 */
export function WorldView({ s }: { s: RookieState }) {
  const w = s.world;
  if (!w) return null;
  const me = { id: -1, name: s.name, race: s.race, total: sumStats(s.stats), status: s.status, team: s.team?.team, squad: s.team?.squad, fame: s.fame, titles: s.titles.filter(t => /우승$/.test(t) && !/준우승$/.test(t)).length, star: false, me: true };
  const list = [...w.peers.map(p => ({ ...p, me: false })), me].sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3 space-y-1">
        <div className="text-[13px] font-black text-foreground">🌍 또래 랭킹 <span className="text-[11px] font-normal text-muted-foreground">같은 해에 꿈을 시작한 {list.length}명</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] tabular-nums">
            <thead className="text-muted-foreground"><tr><th className="text-left font-normal py-0.5">#</th><th className="text-left font-normal">선수</th><th className="text-left font-normal">신분</th><th className="font-normal text-right">능력</th><th className="font-normal text-right">인지도</th></tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.me ? "me" : p.id} className={cn("border-t border-border", p.me && "bg-primary/15 font-bold")}>
                  <td className="py-1 pr-1">{i + 1}</td>
                  <td className="truncate max-w-[120px]">{p.star ? "🌟 " : ""}{p.name}{p.me ? " (나)" : ""} <span className="text-muted-foreground">{RACE_SHORT[p.race]}</span>{p.titles ? <span className="text-amber-300"> 🏆{p.titles}</span> : null}</td>
                  <td className="text-muted-foreground whitespace-nowrap">{p.status === "pro" && p.team !== undefined ? `${ORIG_TEAMS[p.team].short} ${p.squad}군` : STATUS_NAMES[p.status]}</td>
                  <td className="text-right">{p.total.toLocaleString()}</td>
                  <td className="text-right">{p.fame}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-2xl bg-card border border-border p-3 space-y-1">
        <div className="text-[13px] font-black text-foreground">📰 세계 소식</div>
        {!w.news.length && <div className="text-[11px] text-muted-foreground">아직 소식이 없습니다</div>}
        {w.news.slice(0, 30).map((n, i) => (
          <div key={i} className="flex gap-2 text-[12px]"><span className="text-muted-foreground shrink-0 tabular-nums">{dateText(n.day).slice(2)}</span><span>{n.icon}</span><span className="text-foreground">{n.text}</span></div>
        ))}
      </div>
    </div>
  );
}

/** 명예의 전당 (모든 유저의 은퇴 선수) */
export function HofView() {
  const q = trpc.rookie.hof.useQuery();
  const rows = q.data ?? [];
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
      <div className="text-[13px] font-black text-foreground">🏛️ 명예의 전당 <span className="text-[11px] font-normal text-muted-foreground">은퇴한 선수 경력 점수 순</span></div>
      {q.isLoading && <div className="text-[11px] text-muted-foreground">불러오는 중...</div>}
      {!q.isLoading && !rows.length && <div className="text-[11px] text-muted-foreground">아직 은퇴한 선수가 없습니다. 첫 번째 전설이 되어 보세요</div>}
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
          <span className={cn("w-6 text-center font-black", i === 0 ? "text-amber-300" : i < 3 ? "text-sky-300" : "text-muted-foreground")}>{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold text-foreground truncate">{r.name} <span className="text-muted-foreground font-normal">{RACE_SHORT[r.race]} · {r.status}{r.team !== undefined ? ` (${ORIG_TEAMS[r.team].short})` : ""}</span></div>
            <div className="text-[10.5px] text-muted-foreground">최고 {r.peak.toLocaleString()} · 우승 {r.titles} · 프로리그 {r.proW}승 · {r.years}년{r.from ? ` · 선배 ${r.from}의 후배` : ""}</div>
          </div>
          <span className="text-[13px] font-black text-primary tabular-nums">{r.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** 은퇴한 뒤 화면: 경력 요약 · 후배로 이어하기 · 새로 시작 */
export function RetiredView({ s, onSuccessor, onFresh }: { s: RookieState; onSuccessor: () => void; onFresh: () => void }) {
  return (
    <div className="p-3 space-y-3 max-w-lg mx-auto">
      <div className="rounded-2xl border border-amber-400/50 p-4 text-center space-y-1" style={{ background: "linear-gradient(135deg, #3a2f12, #121826 70%)" }}>
        <div className="text-4xl">🎖️</div>
        <div className="text-lg font-black text-white">{s.name} 은퇴</div>
        <div className="text-[12px] text-amber-200">{s.retired}</div>
        <div className="text-[11.5px] text-neutral-300">통산 {s.record.w}승 {s.record.l}패 · 인지도 {s.fame} · 업적 {Object.keys(s.achievements).length}개</div>
      </div>
      <button onClick={onSuccessor} className="w-full rounded-2xl bg-primary text-primary-foreground py-3 font-black">🤝 후배로 이어하기</button>
      <div className="text-[11px] text-muted-foreground text-center -mt-1">돈 20%(최대 300만) · 인지도 10% · 선배의 조언(성격 하나 공개 · 프로의식 +1)을 물려받습니다</div>
      <button onClick={onFresh} className="w-full rounded-2xl border border-border py-2.5 text-sm text-foreground">새 선수로 처음부터</button>
      <HofView />
    </div>
  );
}
