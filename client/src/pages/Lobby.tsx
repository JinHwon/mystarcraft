
import { EventBanner } from "@/components/career/EventBanner";
import { INDIV_SHORT, regularWeeksOf } from "@shared/career/rules";
import { MSL_STAGE_NAMES } from "@shared/career/rules";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ORIG_TEAMS, FREE_AGENT_TEAM } from "@shared/career/originalData";
import { DIFFICULTIES, WEEKLY_AP, actionOf, difficultyOf, totalOf, type CareerState, type Difficulty } from "@shared/career/rules";
import { leagueName, myDiv, myPendingMatch, rosterOf, standings, teamPower, STAGE_NAMES } from "@shared/career/view";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { RaceBadge, TeamBadge } from "@/components/career/Bits";
import { previewWorld } from "@shared/career/init";
import { careerAlerts } from "@/lib/alerts";

/** 홈 화면에 앱 설치 (지원 브라우저에서만) */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return { canInstall: !!prompt, install: async () => { prompt?.prompt(); await prompt?.userChoice?.catch(() => null); setPrompt(null); } };
}

// ── 새 게임: 팀 선택 ──────────────────────────────────────────────

function TeamSelect({ onCancel, onStarted }: { onCancel?: () => void; /** 시작하면 (다시 시작 화면 닫기) */ onStarted?: () => void }) {
  const updater = useCareerUpdater();
  const [, navigate] = useLocation();
  const preview = useMemo(() => previewWorld(), []);
  const [picked, setPicked] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const start = trpc.career.newGame.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`${r.state.teams[r.state.myTeam]?.name ?? ""} 감독 부임!`); onStarted?.(); navigate("/lobby"); window.scrollTo(0, 0); },
  });

  return (
    <div className="p-4 space-y-4">
      <div className="text-center pt-2">
        <div className="text-4xl">🎮</div>
        <h1 className="text-2xl font-black text-foreground mt-1">감독을 맡을 팀을 고르세요</h1>
        <p className="text-sm text-muted-foreground">2010 시즌 12개 프로게임단 · 선수 230명 · 2부 리그 B팀 12개</p>
      </div>
      <div className="text-sm font-bold text-foreground">🎚️ 난이도</div>
      <div className="grid grid-cols-3 gap-1.5 -mt-2">
        {(["easy", "normal", "hard"] as const).map(d => (
          <button key={d} onClick={() => setDifficulty(d)}
            className={cn("rounded-xl border-2 py-2 text-sm font-black", difficulty === d ? "border-amber-400 bg-amber-500/15 text-foreground" : "border-border bg-card text-muted-foreground")}>
            {DIFFICULTIES[d].name}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">{DIFFICULTIES[difficulty].desc} · 감독 랭킹은 난이도별로도 볼 수 있습니다</p>
      <div className="text-sm font-bold text-foreground">🏆 1부 리그</div>
      <div className="grid grid-cols-2 gap-2.5">
        {ORIG_TEAMS.filter(t => t.id !== FREE_AGENT_TEAM).map(t => {
          const roster = rosterOf(preview, t.id);
          const ace = [...roster].sort((a, b) => totalOf(b.stats) - totalOf(a.stats))[0];
          const races = { terran: 0, zerg: 0, protoss: 0 } as Record<string, number>;
          roster.forEach(p => races[p.race]++);
          return (
            <button key={t.id} onClick={() => setPicked(t.id)}
              className={cn("text-left rounded-2xl border-2 p-3 transition-all active:scale-[0.98]",
                picked === t.id ? "border-amber-400 bg-amber-500/15" : "border-border bg-card")}>
              <div className="flex items-center gap-1.5">
                <TeamBadge short={t.short} color={t.color} />
                <span className="font-bold text-sm text-foreground truncate">{t.name}</span>
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">전력 <b className="text-foreground">{teamPower(preview, t.id).toLocaleString()}</b> · {roster.length}명 · T{races.terran}/Z{races.zerg}/P{races.protoss}</div>
              {ace && <div className="mt-1 flex items-center gap-1 text-xs text-foreground"><span className="text-amber-300">★</span><RaceBadge race={ace.race} />{ace.name}</div>}
            </button>
          );
        })}
      </div>
      <div className="text-sm font-bold text-foreground pt-1">🌱 2부 리그 (B팀) — 도전 모드</div>
      <p className="text-[11px] text-muted-foreground -mt-2">신예·유망주로 꾸린 팀으로 시작 (자금 1,500만원, 서브 스폰서 1곳). 2부 1·2위는 승강전에서 이기면 1부로 올라갑니다. 키운 선수를 1부에 보내면 육성 지원금을 더 받습니다 (같은 구단 1군 +50%, 다른 구단 +20%).</p>
      <div className="grid grid-cols-3 gap-1.5">
        {preview.teams.filter(t => t.div === 2).map(t => (
          <button key={t.id} onClick={() => setPicked(t.id)}
            className={cn("text-left rounded-xl border-2 px-2 py-1.5 transition-all active:scale-[0.98]", picked === t.id ? "border-amber-400 bg-amber-500/15" : "border-border bg-card")}>
            <div className="flex items-center gap-1"><TeamBadge short={t.short} color={t.color} /></div>
            <div className="text-[11px] font-bold text-foreground truncate mt-0.5">{t.name}</div>
          </button>
        ))}
      </div>
      <button
        disabled={picked === null || start.isPending}
        onClick={() => picked !== null && start.mutate({ teamId: picked, difficulty })}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-base disabled:opacity-40 active:scale-[0.99]"
      >
        {picked === null ? "팀을 선택하세요" : `${preview.teams[picked]?.name} 감독으로 시작 (${DIFFICULTIES[difficulty].name})`}
      </button>
      {onCancel && <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground">취소</button>}
    </div>
  );
}

// ── 감독실 ──────────────────────────────────────────────────────

function Tile({ emoji, title, desc, badge, onClick, className }: { emoji: string; title: string; desc: string; badge?: string; onClick: () => void; className: string }) {
  return (
    <button onClick={onClick} className={cn("relative text-left rounded-2xl border p-3.5 active:scale-[0.97] transition-transform", className)}>
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1.5 font-black text-white">{title}</div>
      <div className="text-[11px] text-white/80 leading-snug">{desc}</div>
      {badge && <span className="absolute top-2.5 right-2.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/25 text-white">{badge}</span>}
    </button>
  );
}

function Office({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const { canInstall, install } = useInstallPrompt();
  const [restart, setRestart] = useState(false);
  const nextSeason = trpc.career.nextSeason.useMutation({ ...updater, onSuccess: r => { updater.onSuccess(r); toast.success(`${(r.diff.set.season as number | undefined) ?? s.season + 1}시즌 개막!`); } });
  const me = s.teams[s.myTeam];
  const st = standings(s);
  const rank = st.findIndex(t => t.id === s.myTeam) + 1;
  const pending = myPendingMatch(s);
  const roster = rosterOf(s, s.myTeam);
  const readyAp = roster.filter(p => { const a = actionOf(p.action); return a && (p.ap ?? WEEKLY_AP) >= a.ap; }).length;
  const planned = roster.filter(p => p.action).length;
  const phaseText = s.phase === "regular" ? `정규시즌 ${s.week}주차 / ${regularWeeksOf(s)}` : s.phase === "postseason" ? "포스트시즌" : "시즌 종료";
  const last = s.history[0];

  if (restart) return <TeamSelect onCancel={() => setRestart(false)} onStarted={() => setRestart(false)} />;

  if (s.gameOver) {
    return (
      <div className="p-4 space-y-4">
        <div className="rounded-2xl bg-rose-500/15 border border-rose-400/50 p-5 text-center space-y-2">
          <div className="text-4xl">💀</div>
          <div className="text-lg font-black text-foreground">GAME OVER</div>
          <div className="text-sm text-foreground">{s.gameOver.reason}</div>
          <div className="text-xs text-muted-foreground">{me.name} · {s.gameOver.season}시즌 {s.gameOver.week}주차 · 통산 {s.history.length}시즌 · 감독 평판 {s.manager?.reputation ?? 50}</div>
          <button onClick={() => setRestart(true)} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black">새 게임 시작</button>
        </div>
      </div>
    );
  }

  // 알림 (상단 🔔 과 같은 목록)
  const alerts = careerAlerts(s);
  const expiring = s.players.filter(p => p.team === s.myTeam && (p.contract?.years ?? 9) <= 1);

  return (
    <div className="p-4 space-y-4">
      <EventBanner />
      <button onClick={() => navigate("/rookie")} className="w-full rounded-2xl border border-sky-400/40 p-3 flex items-center gap-3 text-left" style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(56,189,248,0.04))" }}>
        <span className="text-2xl">🎮</span>
        <span className="flex-1"><b className="text-sm text-foreground">선수 키우기 모드</b> <span className="text-[10px] rounded-full bg-sky-500 text-white px-1.5 py-0.5 font-black">NEW</span><span className="block text-[11px] text-muted-foreground">내 선수를 만들어 아마추어 → 준프로 → 프로게이머로</span></span>
        <span className="text-sky-300 font-bold">›</span>
      </button>
      {alerts.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/40 p-2 space-y-0.5">
          {alerts.map(a => (
            <button key={a.key} onClick={() => navigate(a.to)} className="w-full text-left text-xs text-foreground px-1 py-1 rounded-lg active:bg-amber-500/10 flex">
              <span className="flex-1">{a.icon} {a.text}</span><span className="text-amber-300 font-bold">›</span>
            </button>
          ))}
        </div>
      )}
      {/* 팀 카드 */}
      <div className="rounded-2xl p-4 border border-white/10 shadow-xl" style={{ background: `linear-gradient(135deg, ${me.color}55, oklch(0.32 0.05 258) 60%)` }}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black text-white shadow-lg" style={{ background: me.color }}>{me.short}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/70">{s.season}시즌 · {phaseText}</div>
            <div className="text-xl font-black text-white truncate">{me.name}</div>
            <div className="text-xs text-white/80">{me.wins}승 {me.losses}패 · 세트 {me.setWins}:{me.setLosses} · <b>{myDiv(s) === 2 ? "2부 " : ""}{rank}위</b></div>
            <div className="text-[11px] text-yellow-200/90 font-bold">🎓 감독 Lv.{s.manager?.level ?? 1} · 평판 {s.manager?.reputation ?? 50} · 난이도 {difficultyOf(s).name}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/25 py-1.5"><div className="text-[10px] text-white/60">팀 자금</div><div className="text-sm font-black text-yellow-300">{me.money.toLocaleString()}만</div></div>
          <div className="rounded-xl bg-black/25 py-1.5"><div className="text-[10px] text-white/60">행동 가능</div><div className="text-sm font-black text-emerald-300">{readyAp}명</div></div>
          <div className="rounded-xl bg-black/25 py-1.5"><div className="text-[10px] text-white/60">선수단</div><div className="text-sm font-black text-white">{roster.length}명</div></div>
        </div>
      </div>

      {canInstall && (
        <button onClick={install} className="w-full flex items-center gap-3 rounded-2xl bg-sky-500/15 border border-sky-400/40 p-3 text-left">
          <span className="text-2xl">📲</span>
          <span className="flex-1 text-sm text-foreground"><b>앱으로 설치하기</b><br /><span className="text-xs text-muted-foreground">홈 화면에 추가하면 앱처럼 실행됩니다</span></span>
        </button>
      )}

      {/* 이번 주 / 시즌 종료 */}
      {s.phase === "offseason" ? (
        <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-4 text-center space-y-2">
          <div className="text-3xl">{last?.myResult === "우승" ? "🏆" : "🏁"}</div>
          <div className="font-black text-foreground">{s.season}시즌 종료 — {last?.myResult}</div>
          <div className="text-xs text-muted-foreground">우승: {s.teams[last?.champion ?? 0].name} · 정규시즌 {last?.myRank}위</div>
          <div className="text-xs text-muted-foreground">다음 시즌이 시작되면 선수들이 한 살 더 먹고, 어린 선수는 성장·노장은 하락합니다.</div>
          {expiring.length > 0 ? (
            <div className="rounded-xl bg-black/20 p-2.5 text-left space-y-1.5">
              <div className="text-xs font-bold text-amber-200">📄 계약 만료 선수 {expiring.length}명 — 재계약·트레이드·이적·방출로 정리하세요</div>
              <div className="text-xs text-foreground">{expiring.map(p => p.name).join(", ")}</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => navigate("/club")} className="py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">재계약하러 가기</button>
                <button onClick={() => navigate("/transfer")} className="py-2 rounded-lg bg-card border border-border text-xs font-bold">트레이드·방출</button>
              </div>
              <button onClick={() => confirm(`${expiring.map(p => p.name).join(", ")} 선수를 내보내고(자유계약) ${s.season + 1}시즌을 시작할까요?`) && nextSeason.mutate({ releaseExpiring: true })} disabled={nextSeason.isPending} className="w-full py-2.5 rounded-lg bg-amber-500 text-white text-sm font-black">만료 선수 내보내고 {s.season + 1}시즌 시작</button>
            </div>
          ) : (
            <button onClick={() => nextSeason.mutate({})} disabled={nextSeason.isPending} className="w-full py-3 rounded-xl bg-amber-500 text-white font-black">{s.season + 1}시즌 시작</button>
          )}
        </div>
      ) : (
        <button onClick={() => navigate("/league")} className="w-full text-left rounded-2xl bg-card border border-border p-4 active:scale-[0.99] transition-transform">
          <div className="text-xs text-muted-foreground mb-1">이번 주 일정</div>
          {pending ? (() => {
            const opp = s.teams[pending.a === s.myTeam ? pending.b : pending.a];
            return (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/20 text-primary">{STAGE_NAMES[pending.stage]}</span>
                <span className="font-bold text-foreground flex-1 truncate">vs {opp.name}</span>
                <span className="text-xs text-primary font-bold">엔트리 편성 ›</span>
              </div>
            );
          })() : <div className="font-bold text-foreground">우리 팀 경기 없음 · 다음 주로 진행 ›</div>}
          <div className="mt-2 text-[11px] text-muted-foreground">선수 행동 {planned}/{roster.length}명 지정 · 행동력이 남은 선수 {readyAp}명 · 경기를 진행하면 한 주가 지나갑니다</div>
        </button>
      )}

      {/* 메뉴 타일 */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tile emoji="🏋️" title="선수 행동" desc="훈련·휴식·이벤트" badge={`행동 가능 ${readyAp}명`} onClick={() => navigate("/training")} className="bg-gradient-to-br from-emerald-500 to-teal-700 border-emerald-300/40" />
        <Tile emoji="🏆" title={leagueName(myDiv(s))} desc={`${myDiv(s) === 2 ? "2부 " : ""}${rank}위 · 순위표·일정`} onClick={() => navigate("/league")} className="bg-gradient-to-br from-amber-500 to-orange-600 border-amber-300/40" />
        <Tile emoji="👥" title="선수단" desc={`${roster.length}명 · 능력치·컨디션`} onClick={() => navigate("/team")} className="bg-gradient-to-br from-violet-500 to-purple-700 border-violet-300/40" />
        <Tile emoji="🤝" title="이적시장" desc={`무소속 ${rosterOf(s, FREE_AGENT_TEAM).length}명 영입·방출`} onClick={() => navigate("/transfer")} className="bg-gradient-to-br from-sky-500 to-blue-700 border-sky-300/40" />
        <Tile emoji="🏢" title="구단 운영" desc={`연봉·계약·제안${s.offers?.length ? ` · 제안 ${s.offers.length}` : ""}`} onClick={() => navigate("/club")} className="bg-gradient-to-br from-teal-500 to-cyan-800 border-teal-300/40" />
        <Tile emoji="🛒" title="아이템 상점" desc="장비·포션·경기 아이템" onClick={() => navigate("/shop")} className="bg-gradient-to-br from-rose-500 to-pink-700 border-rose-300/40" />
        <Tile emoji="👑" title={s.msl2?.season === s.season ? `개인리그` : "마이스타리그"} desc={s.msl2?.season === s.season ? `MySL ${s.msl ? MSL_STAGE_NAMES[s.msl.stage] : "-"} · ${INDIV_SHORT[s.msl2.league ?? "msl"]} ${MSL_STAGE_NAMES[s.msl2.stage]}` : s.msl ? MSL_STAGE_NAMES[s.msl.stage] : "1주차 개막"} onClick={() => navigate("/starleague")} className="bg-gradient-to-br from-indigo-500 to-slate-700 border-indigo-300/40" />
        <Tile emoji="💰" title="재정 관리" desc={`보유 ${me.money.toLocaleString()}만 · 가계부`} onClick={() => navigate("/finance")} className="bg-gradient-to-br from-yellow-500 to-amber-700 border-yellow-300/40" />
      </div>

      {/* 순위 요약 */}
      <button onClick={() => navigate("/league")} className="w-full text-left rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">📊 {myDiv(s) === 2 ? "2부 리그 " : ""}순위</div>
        <div className="space-y-0.5">
          {st.slice(0, 4).map((t, i) => (
            <div key={t.id} className={cn("flex items-center gap-2 text-sm rounded-lg px-1.5 py-0.5", t.id === s.myTeam && "bg-amber-500/15")}>
              <span className="w-4 text-muted-foreground font-bold">{i + 1}</span>
              <TeamBadge short={t.short} color={t.color} />
              <span className={cn("flex-1 truncate", t.id === s.myTeam ? "text-amber-200 font-bold" : "text-foreground")}>{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.wins}승 {t.losses}패</span>
            </div>
          ))}
          {rank > 4 && <div className="text-xs text-amber-300 px-1.5">… 우리 팀 {rank}위</div>}
        </div>
      </button>

      {/* 소식 */}
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-bold text-foreground text-sm mb-2">📰 소식</div>
        <div className="space-y-1.5">
          {s.news.slice(0, 8).map((n, i) => (
            <div key={i} className="text-xs text-foreground/90 flex gap-2">
              <span className="text-muted-foreground shrink-0">{n.season}시즌 {n.week}주</span>
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => { if (confirm("지금 커리어를 버리고 새 게임을 시작할까요? 진행 상황이 모두 사라집니다.")) setRestart(true); }}
        className="w-full py-2.5 text-xs text-muted-foreground">🔄 새 게임 (팀 다시 고르기)</button>
    </div>
  );
}

export default function Lobby() {
  const { state, loading } = useCareer();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!state) return <TeamSelect />;
  return <Office s={state} />;
}
