import { useLocation } from "wouter";
import { totalOf } from "@shared/career/rules";
import { useCareer } from "@/lib/career";
import { RaceBadge, TeamBadge } from "@/components/career/Bits";

/** 기록: 시즌 기록, 다승 순위, 소식 */
export default function Records() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const leaders = [...s.players].filter(p => p.team !== 12 && p.sWins + p.sLosses > 0)
    .sort((a, b) => b.sWins - a.sWins || a.sLosses - b.sLosses).slice(0, 10);
  const best = [...s.players].sort((a, b) => totalOf(b.stats) - totalOf(a.stats)).slice(0, 10);

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">🏆 지난 시즌</div>
        {s.history.length === 0 && <div className="text-xs text-muted-foreground">아직 끝난 시즌이 없습니다</div>}
        {s.history.map(h => (
          <div key={h.season} className="flex items-center gap-2 text-sm py-1">
            <span className="text-muted-foreground w-14">{h.season}시즌</span>
            <span className="flex-1 text-foreground">우승 <b>{s.teams[h.champion].name}</b></span>
            <span className="text-xs text-amber-300">우리 팀 {h.myResult} ({h.myRank}위)</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">🔥 이번 시즌 다승 순위</div>
        {leaders.length === 0 && <div className="text-xs text-muted-foreground">아직 경기가 없습니다</div>}
        {leaders.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 text-sm py-0.5">
            <span className="w-4 text-muted-foreground font-bold">{i + 1}</span>
            <RaceBadge race={p.race} />
            <span className={p.team === s.myTeam ? "text-amber-200 font-bold" : "text-foreground"}>{p.name}</span>
            <TeamBadge short={s.teams[p.team].short} color={s.teams[p.team].color} />
            <span className="ml-auto text-xs text-muted-foreground">{p.sWins}승 {p.sLosses}패</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">⭐ 능력치 순위</div>
        {best.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 text-sm py-0.5">
            <span className="w-4 text-muted-foreground font-bold">{i + 1}</span>
            <RaceBadge race={p.race} />
            <span className={p.team === s.myTeam ? "text-amber-200 font-bold" : "text-foreground"}>{p.name}</span>
            <TeamBadge short={s.teams[p.team].short} color={s.teams[p.team].color} />
            <span className="ml-auto text-xs font-mono text-muted-foreground">{totalOf(p.stats).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">📰 전체 소식</div>
        <div className="space-y-1.5">
          {s.news.map((n, i) => (
            <div key={i} className="text-xs text-foreground/90 flex gap-2">
              <span className="text-muted-foreground shrink-0">{n.season}시즌 {n.week}주</span><span>{n.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
