import { useState } from "react";
import { useLocation } from "wouter";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { ageOf, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { useCareer } from "@/lib/career";
import { RaceBadge, TeamBadge } from "@/components/career/Bits";
import { PlayerPhoto } from "@/components/legacy/Legacy";
import { PlayerSheet } from "./Team";

/** 기록 한 줄: 사진·이름·팀·연봉·능력치 (누르면 선수 정보) */
function PlayerRow({ s, p, rank, right, onOpen }: { s: CareerState; p: CPlayer; rank: number; right: React.ReactNode; onOpen: (id: number) => void }) {
  const team = s.teams[p.team];
  const top = [...STAT_KEYS].sort((a, b) => p.stats[b] - p.stats[a]).slice(0, 3);
  return (
    <button onClick={() => onOpen(p.id)} className="w-full flex items-center gap-2 py-1.5 text-left border-b border-border/60 last:border-b-0">
      <span className="w-4 text-muted-foreground font-bold text-sm">{rank}</span>
      <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <RaceBadge race={p.race} />
          <span className={p.team === s.myTeam ? "text-amber-200 font-bold text-sm truncate" : "text-foreground text-sm truncate"}>{p.name}</span>
          {team && <TeamBadge short={team.short} color={team.color} />}
        </div>
        <div className="text-[10.5px] text-muted-foreground truncate">
          Lv.{p.level} · {ageOf(p, s.season)}세 · 연봉 {p.contract ? `${p.contract.salary.toLocaleString()}만` : "-"} · 능력치 {totalOf(p.stats).toLocaleString()}
        </div>
        <div className="text-[10px] text-muted-foreground/80 truncate">{top.map(k => `${STAT_LABELS[k]} ${p.stats[k]}`).join(" · ")}</div>
      </div>
      <span className="text-xs text-foreground font-bold shrink-0">{right}</span>
    </button>
  );
}

/** 기록: 시즌 기록, 다승 순위, 소식 */
export default function Records() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState<number | null>(null);
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  // 다승 순위는 우리 리그 선수만 (2부 경기 승수는 따로)
  const div = s.teams[s.myTeam]?.div ?? 1;
  const leaders = [...s.players].filter(p => p.team >= 0 && p.team !== 12 && (s.teams[p.team]?.div ?? 1) === div && p.sWins + p.sLosses > 0)
    .sort((a, b) => b.sWins - a.sWins || a.sLosses - b.sLosses).slice(0, 10);
  const best = [...s.players].filter(p => p.team >= 0).sort((a, b) => totalOf(b.stats) - totalOf(a.stats)).slice(0, 10);

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">🏆 지난 시즌</div>
        {s.history.length === 0 && <div className="text-xs text-muted-foreground">아직 끝난 시즌이 없습니다</div>}
        {s.history.map(h => (
          <div key={h.season} className="text-sm py-1 border-b border-border/50 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-14">{h.season}시즌</span>
              <span className="flex-1 text-foreground">우승 <b>{s.teams[h.champion].name}</b></span>
              <span className="text-xs text-amber-300">{h.team !== undefined && h.team !== s.myTeam ? s.teams[h.team].short : "우리 팀"} {h.myResult} ({h.div === 2 ? "2부 " : ""}{h.myRank}위)</span>
            </div>
            {(h.champion2 !== undefined || h.promo?.length) && (
              <div className="pl-16 text-[11px] text-muted-foreground">
                {h.champion2 !== undefined && <>2부 1위 {s.teams[h.champion2]?.name}</>}
                {h.promo?.length ? <> · 승강: {h.promo.map(m => `⬆️${s.teams[m.up]?.name} ⬇️${s.teams[m.down]?.name}`).join(", ")}</> : h.champion2 !== undefined ? " · 승강전 1부 팀 모두 잔류" : null}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">🔥 이번 시즌 다승 순위{div === 2 ? " (2부)" : ""}</div>
        {leaders.length === 0 && <div className="text-xs text-muted-foreground">아직 경기가 없습니다</div>}
        {leaders.map((p, i) => <PlayerRow key={p.id} s={s} p={p} rank={i + 1} right={`${p.sWins}승 ${p.sLosses}패`} onOpen={setOpen} />)}
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">⭐ 능력치 순위</div>
        {best.map((p, i) => <PlayerRow key={p.id} s={s} p={p} rank={i + 1} right={totalOf(p.stats).toLocaleString()} onOpen={setOpen} />)}
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
      <PlayerSheet s={s} player={open !== null ? s.players[open] : null} onClose={() => setOpen(null)} />
    </div>
  );
}
