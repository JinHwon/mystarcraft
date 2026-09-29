import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { User, ChevronRight } from "lucide-react";
import { RACE_COLORS, RACE_LABELS } from "@shared/gameConstants";
import { ConditionBadge, RaceTag } from "@/components/team/PlayerBadges";

function Tile({ emoji, title, desc, badge, onClick, className }: {
  emoji: string; title: string; desc: string; badge?: string | number; onClick: () => void; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("relative text-left rounded-2xl border p-4 transition-all active:scale-[0.97] hover:brightness-110 shadow-lg shadow-black/10", className)}
    >
      <div className="text-3xl leading-none">{emoji}</div>
      <div className="mt-2.5 font-black text-white text-base">{title}</div>
      <div className="text-xs text-white/75 mt-0.5 leading-snug">{desc}</div>
      {badge !== undefined && badge !== 0 && badge !== "" && (
        <span className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">{badge}</span>
      )}
    </button>
  );
}

/** 홈 화면에 앱 설치 (크롬·엣지·삼성 인터넷 등 지원 브라우저에서만 표시) */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setPrompt(null);
  };
  return { canInstall: !!prompt, install };
}

export default function Lobby() {
  const [, navigate] = useLocation();
  const { canInstall, install } = useInstallPrompt();
  const playerQ = trpc.player.get.useQuery();
  const teamQ = trpc.team.get.useQuery();
  const leagueQ = trpc.league.proleague.useQuery();
  const { data: rewardable = 0 } = trpc.quest.getRewardableCount.useQuery();

  const p = playerQ.data;
  if (!p) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  const team = teamQ.data;
  const league = leagueQ.data;
  const myTeamId = league?.teams.find(t => t.isMine)?.id;
  const myRank = league ? league.standings.findIndex(s => s.teamId === myTeamId) + 1 : 0;
  const raceColor = RACE_COLORS[p.race] ?? "#4A9EFF";
  const expPct = p.expToNext > 0 ? Math.min(100, (p.exp / p.expToNext) * 100) : 100;
  const record = p.gameRecord ?? { wins: 0, losses: 0, total: 0 };
  const winRate = record.total ? Math.round((record.wins / record.total) * 100) : 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      {/* 내 선수 카드 */}
      <button
        onClick={() => navigate("/profile")}
        className="w-full text-left rounded-2xl p-4 md:p-5 border border-white/10 shadow-xl relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${raceColor}40, oklch(0.32 0.05 258) 55%, oklch(0.28 0.05 270))` }}
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 bg-slate-800 flex items-center justify-center shrink-0" style={{ borderColor: raceColor }}>
            {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-slate-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-black text-white truncate">{p.name}</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-md bg-white/15 text-white">{p.grade}</span>
            </div>
            <div className="text-sm font-semibold" style={{ color: raceColor }}>{RACE_LABELS[p.race]} · Lv.{p.level}</div>
            <div className="mt-2 h-1.5 bg-black/30 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${expPct}%` }} />
            </div>
            <div className="text-[11px] text-white/70 mt-1">EXP {p.exp}/{p.expToNext} · {record.wins}승 {record.losses}패 ({winRate}%)</div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/50 shrink-0" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs rounded-full px-2.5 py-1 bg-black/25 text-yellow-300 font-bold">💰 {p.gold.toLocaleString()}G</span>
          <span className="text-xs rounded-full px-2.5 py-1 bg-black/25 text-emerald-300 font-bold">🔋 피로도 {p.fatigue}</span>
          <span className="text-xs rounded-full px-2.5 py-1 bg-black/25"><ConditionBadge condition={(p as any).condition ?? 100} /></span>
          {p.statPoints > 0 && <span className="text-xs rounded-full px-2.5 py-1 bg-purple-500/30 text-purple-100 font-bold">📊 배분할 포인트 {p.statPoints}</span>}
        </div>
      </button>

      {canInstall && (
        <button onClick={install} className="w-full flex items-center gap-3 rounded-2xl bg-sky-500/15 border border-sky-400/40 p-3 text-left">
          <span className="text-2xl">📲</span>
          <span className="flex-1 text-sm text-foreground"><b>앱으로 설치하기</b><br /><span className="text-xs text-muted-foreground">홈 화면에 추가하면 주소창 없이 앱처럼 실행됩니다</span></span>
          <span className="text-xs font-bold text-sky-300">설치</span>
        </button>
      )}

      {/* 바로가기 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile emoji="⚔️" title="연습게임" desc="상대를 찾아 바로 한 판" onClick={() => navigate("/practice")}
          className="bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-400/40" />
        <Tile emoji="🏆" title="프로리그"
          desc={league ? (league.season.status === "active" ? `시즌 ${league.season.seasonNo} · ${league.season.round}/${league.season.totalRounds}R · 현재 ${myRank}위` : `시즌 ${league.season.seasonNo} 종료 · 새 시즌 대기`) : "팀 리그"}
          onClick={() => navigate("/league")} className="bg-gradient-to-br from-amber-500 to-orange-600 border-amber-300/40" />
        <Tile emoji="🏋️" title="훈련장" desc="피로도로 능력치 올리기" onClick={() => navigate("/training")}
          className="bg-gradient-to-br from-emerald-500 to-teal-700 border-emerald-300/40" />
        <Tile emoji="🎁" title="퀘스트" desc={rewardable ? `받을 보상 ${rewardable}개!` : "매일 새로운 목표"} badge={rewardable}
          onClick={() => navigate("/events")} className="bg-gradient-to-br from-rose-500 to-pink-700 border-rose-300/40" />
        <Tile emoji="👥" title="팀 관리" desc={team ? `선수 ${team.roster.length}/${team.maxRoster}명 · 영입·방출` : "선수 영입"}
          onClick={() => navigate("/team")} className="bg-gradient-to-br from-violet-500 to-purple-700 border-violet-300/40" />
        <Tile emoji="🛒" title="상점" desc="장비·회복 아이템" onClick={() => navigate("/shop")}
          className="bg-gradient-to-br from-cyan-500 to-sky-700 border-cyan-300/40" />
      </div>

      {/* 우리 팀 */}
      {team && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-foreground">{team.team.emblem} {team.team.name}</div>
            <button onClick={() => navigate("/team")} className="text-xs text-primary font-semibold">전체 보기 ›</button>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
            {team.roster.map(r => (
              <button key={r.id} onClick={() => navigate(`/training?player=${r.id}`)}
                className="shrink-0 w-32 rounded-xl bg-muted/70 border border-border p-2.5 text-left active:scale-[0.97] transition-transform">
                <div className="font-bold text-sm text-foreground truncate">{r.name}{r.isMain ? " ⭐" : ""}</div>
                <div className="flex items-center gap-1.5"><RaceTag race={r.race} /><span className="text-[11px] text-muted-foreground">{r.totalStats.toLocaleString()}</span></div>
                <div className="mt-1"><ConditionBadge condition={r.condition} /></div>
                <div className="mt-1.5 h-1 bg-black/30 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", r.fatigue >= 60 ? "bg-emerald-400" : r.fatigue >= 30 ? "bg-yellow-400" : "bg-rose-400")} style={{ width: `${r.fatigue}%` }} />
                </div>
              </button>
            ))}
            {team.roster.length < team.maxRoster && (
              <button onClick={() => navigate("/team")} className="shrink-0 w-32 rounded-xl border-2 border-dashed border-border text-muted-foreground text-sm font-semibold flex flex-col items-center justify-center gap-1">
                <span className="text-2xl">＋</span>선수 영입
              </button>
            )}
          </div>
        </div>
      )}

      {/* 리그 순위 요약 */}
      {league && (
        <button onClick={() => navigate("/league")} className="w-full text-left rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-foreground">🏆 프로리그 순위</div>
            <span className="text-xs text-primary font-semibold">리그로 ›</span>
          </div>
          <div className="space-y-1">
            {league.standings.slice(0, 4).map((s, i) => {
              const t = league.teams.find(x => x.id === s.teamId);
              return (
                <div key={s.teamId} className={cn("flex items-center gap-2 text-sm rounded-lg px-2 py-1", t?.isMine && "bg-amber-500/15")}>
                  <span className="w-5 font-bold text-muted-foreground">{i + 1}</span>
                  <span className={cn("flex-1 truncate", t?.isMine ? "text-amber-300 font-bold" : "text-foreground")}>{t?.emblem} {t?.name}</span>
                  <span className="text-muted-foreground text-xs">{s.wins}승 {s.losses}패</span>
                </div>
              );
            })}
            {myRank > 4 && <div className="text-xs text-amber-300 px-2">… 우리 팀 {myRank}위</div>}
          </div>
        </button>
      )}
    </div>
  );
}
