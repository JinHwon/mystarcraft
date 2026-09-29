import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FINAL_SETS, PRO_SETS, type CareerState, type CMatch } from "@shared/career/rules";
import { STAGE_NAMES, myPendingMatch, rosterOf, standings } from "@shared/career/view";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { TeamBadge } from "@/components/career/Bits";
import { EntryScreen, MapDrawScreen, MatchViewer, type BroadcastSet } from "@/components/legacy/LegacyMatch";

type Tab = "match" | "table" | "schedule";

type MslReportView = { stage: string; label: string; a: number; b: number; sa: number; sb: number; winner: number };

/** 이번 주 마이스타리그 우리 선수 경기 */
function MslReports({ s, reports }: { s: CareerState; reports: MslReportView[] }) {
  if (!reports.length) return null;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
      <div className="text-sm font-bold text-foreground">🎮 마이스타리그 · 우리 선수 경기</div>
      {reports.map((r, i) => {
        const A = s.players[r.a], B = s.players[r.b];
        const mineWon = s.players[r.winner]?.team === s.myTeam;
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground w-24 truncate">{r.stage} {r.label !== r.stage ? r.label : ""}</span>
            <span className={cn("flex-1 truncate text-right", r.winner === r.a ? "text-foreground font-bold" : "text-muted-foreground")}>{A?.name}</span>
            <span className="font-mono font-bold w-9 text-center">{r.sa}:{r.sb}</span>
            <span className={cn("flex-1 truncate", r.winner === r.b ? "text-foreground font-bold" : "text-muted-foreground")}>{B?.name}</span>
            <span>{mineWon ? "🎉" : "😢"}</span>
          </div>
        );
      })}
    </div>
  );
}

function MatchTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const [, navigate] = useLocation();
  const pending = myPendingMatch(s);
  const sets = pending?.stage === "final" ? FINAL_SETS : PRO_SETS;
  const [entry, setEntry] = useState<(number | undefined)[]>([]);
  const [viewing, setViewing] = useState<{ before: CareerState; after: CareerState; matchId: number; broadcast: BroadcastSet[] } | null>(null);
  const [weekDone, setWeekDone] = useState<{ reports: MslReportView[]; matchId?: number } | null>(null);
  const beforeRef = useRef<CareerState | null>(null);
  const drawKey = `mysc-mapdraw-${s.season}-${s.myTeam}`;
  const [showMaps, setShowMaps] = useState(false);
  const [editing, setEditing] = useState(false);
  const closeMaps = () => { try { localStorage.setItem(drawKey, "1"); } catch { /* 저장 불가여도 진행 */ } setShowMaps(false); };
  const openEntry = () => {
    // 시즌 첫 경기 전에는 원작처럼 맵 추첨 결과부터
    let seen = true;
    try { seen = !!localStorage.getItem(drawKey); } catch { /* 무시 */ }
    if (!seen) setShowMaps(true);
    setEditing(true);
  };

  useEffect(() => {
    if (!pending) return;
    setEntry(prev => (prev.length === sets && prev.every(id => id === undefined || s.players[id]?.team === s.myTeam) ? prev : Array(sets).fill(undefined)));
  }, [pending?.id, sets]);

  const advance = trpc.career.advance.useMutation({
    ...updater,
    onSuccess: r => {
      updater.onSuccess(r);
      const res = r.result as { playedMatchId?: number; broadcast?: BroadcastSet[]; mslReports?: MslReportView[] };
      setWeekDone({ reports: res.mslReports ?? [], matchId: res.playedMatchId });
      setEditing(false);
      if (res.playedMatchId && beforeRef.current) {
        setViewing({ before: beforeRef.current, after: r.state, matchId: res.playedMatchId, broadcast: res.broadcast ?? [] });
      }
      window.scrollTo(0, 0);
    },
  });
  const submit = (e?: number[]) => { beforeRef.current = s; advance.mutate(e ? { entry: e } : {}); };

  if (viewing) {
    return <MatchViewer {...viewing} onClose={() => setViewing(null)} />;
  }

  if (weekDone) {
    const m = weekDone.matchId ? s.matches.find(x => x.id === weekDone.matchId) : undefined;
    const won = m?.winner === s.myTeam;
    return (
      <div className="space-y-3">
        {m && (
          <div className={cn("rounded-2xl border p-4 text-center", won ? "bg-emerald-500/15 border-emerald-400/40" : "bg-rose-500/10 border-rose-400/30")}>
            <div className="text-xs text-muted-foreground">{STAGE_NAMES[m.stage]}{m.stage === "regular" ? ` ${m.week}주차` : ""}</div>
            <div className="mt-1 flex items-center justify-center gap-2 font-black text-foreground">
              <span>{s.teams[m.a].name}</span><span className="font-mono text-lg">{m.scoreA}:{m.scoreB}</span><span>{s.teams[m.b].name}</span>
            </div>
            <div className="text-sm mt-1">{won ? "🎉 승리!" : "😢 패배"}</div>
          </div>
        )}
        <MslReports s={s} reports={weekDone.reports} />
        {!m && !weekDone.reports.length && <div className="rounded-2xl bg-card border border-border p-4 text-center text-sm text-muted-foreground">이번 주 일정이 끝났습니다.</div>}
        <button onClick={() => setWeekDone(null)} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black">확인 · 다음 주로</button>
      </div>
    );
  }

  if (s.phase === "offseason") {
    return (
      <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-4 text-center space-y-2">
        <div className="text-3xl">🏁</div>
        <div className="font-black text-foreground">{s.season}시즌이 끝났습니다</div>
        <button onClick={() => navigate("/lobby")} className="w-full py-3 rounded-xl bg-amber-500 text-white font-black">감독실에서 다음 시즌 시작 ›</button>
      </div>
    );
  }

  if (!pending) {
    const weekMatches = s.matches.filter(m => m.week === s.week && !m.done);
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-card border border-border p-4 text-center space-y-1">
          <div className="text-2xl">📺</div>
          <div className="font-bold text-foreground">이번 주 우리 팀 경기가 없습니다</div>
          <div className="text-xs text-muted-foreground">
            {weekMatches.length ? weekMatches.map(m => `${STAGE_NAMES[m.stage]}: ${s.teams[m.a].name} vs ${s.teams[m.b].name}`).join(" / ") : "다음 일정으로 넘어갑니다"}
          </div>
        </div>
        <button onClick={() => submit()} disabled={advance.isPending} className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-black">
          {advance.isPending ? "진행 중..." : "▶ 다음 주 진행 (관전)"}
        </button>
      </div>
    );
  }

  if (showMaps) return <MapDrawScreen s={s} onNext={closeMaps} />;
  if (editing) {
    return (
      <EntryScreen
        s={s} match={pending} entry={entry} setEntry={setEntry}
        submitting={advance.isPending}
        onSubmit={() => submit(entry as number[])}
        onShowMaps={() => setShowMaps(true)}
        onBack={() => setEditing(false)}
      />
    );
  }

  const oppId = pending.a === s.myTeam ? pending.b : pending.a;
  const opp = s.teams[oppId];
  const filled = entry.filter(x => x !== undefined).length;
  const usedAp = rosterOf(s, s.myTeam).filter(p => p.action).length;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="text-xs text-muted-foreground">{STAGE_NAMES[pending.stage]}{pending.stage === "regular" ? ` ${pending.week}주차` : ""} · {sets === FINAL_SETS ? "7전 4선승" : "5전 3선승"}</div>
        <div className="mt-1 flex items-center gap-2">
          <TeamBadge short={s.teams[s.myTeam].short} color={s.teams[s.myTeam].color} />
          <span className="font-black text-foreground">{s.teams[s.myTeam].name}</span>
          <span className="text-muted-foreground text-sm">vs</span>
          <TeamBadge short={opp.short} color={opp.color} />
          <span className="font-black text-rose-200 truncate">{opp.name}</span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">엔트리 {filled}/{sets} · 상대 엔트리는 경기 시작과 함께 공개됩니다</div>
      </div>
      {usedAp === 0 && <p className="text-xs text-amber-300 px-1">이번 주 선수 행동을 아직 정하지 않았습니다. <button onClick={() => navigate("/training")} className="underline font-bold">선수 행동 정하기</button></p>}
      <button onClick={openEntry} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">
        ⚔️ 엔트리 편성 · 경기 시작
      </button>
      <button onClick={() => setShowMaps(true)} className="w-full py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">🗺️ 이번 시즌 맵 추첨 결과</button>
    </div>
  );
}

function TableTab({ s }: { s: CareerState }) {
  const st = standings(s);
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-[11px] text-muted-foreground">
          <tr className="border-b border-border"><th className="py-2 pl-3 text-left w-7">#</th><th className="text-left">팀</th><th>승</th><th>패</th><th className="pr-3">득실</th></tr>
        </thead>
        <tbody>
          {st.map((t, i) => (
            <tr key={t.id} className={cn("border-b border-border/60", t.id === s.myTeam && "bg-amber-500/15", i === 3 && "border-b-2 border-b-amber-400/40")}>
              <td className="py-2 pl-3 font-bold text-muted-foreground">{i + 1}</td>
              <td className="py-2"><span className="flex items-center gap-1.5"><TeamBadge short={t.short} color={t.color} /><span className={cn("truncate", t.id === s.myTeam ? "text-amber-200 font-bold" : "text-foreground")}>{t.name}</span></span></td>
              <td className="text-center font-bold text-foreground">{t.wins}</td>
              <td className="text-center text-muted-foreground">{t.losses}</td>
              <td className={cn("text-center pr-3 font-mono text-xs", t.setWins - t.setLosses >= 0 ? "text-emerald-300" : "text-rose-300")}>{t.setWins - t.setLosses > 0 ? "+" : ""}{t.setWins - t.setLosses}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground px-3 py-2">4위까지 포스트시즌 진출 · 준플레이오프(3위 vs 4위) → 플레이오프(2위) → 결승(1위, 7전 4선승)</p>
    </div>
  );
}

function ScheduleTab({ s }: { s: CareerState }) {
  const groups = new Map<string, CMatch[]>();
  for (const m of s.matches) {
    const key = m.stage === "regular" ? `${m.week}주차` : STAGE_NAMES[m.stage];
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return (
    <div className="space-y-2">
      {Array.from(groups.entries()).map(([key, ms]) => (
        <div key={key} className="rounded-2xl bg-card border border-border p-3">
          <div className="text-xs font-bold text-muted-foreground mb-1.5">{key}</div>
          <div className="space-y-1">
            {ms.map(m => {
              const mine = m.a === s.myTeam || m.b === s.myTeam;
              const A = s.teams[m.a], B = s.teams[m.b];
              return (
                <div key={m.id} className={cn("flex items-center gap-1.5 text-xs rounded-lg px-1.5 py-1", mine && "bg-amber-500/15")}>
                  <TeamBadge short={A.short} color={A.color} />
                  <span className={cn("flex-1 truncate", m.winner === m.a ? "text-foreground font-bold" : "text-muted-foreground")}>{A.name}</span>
                  <span className="font-mono font-bold text-foreground w-10 text-center">{m.done ? `${m.scoreA}:${m.scoreB}` : "vs"}</span>
                  <span className={cn("flex-1 truncate text-right", m.winner === m.b ? "text-foreground font-bold" : "text-muted-foreground")}>{B.name}</span>
                  <TeamBadge short={B.short} color={B.color} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function League() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("match");
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  return (
    <div className="p-4 space-y-3">
      <div className="text-center">
        <div className="text-lg font-black text-foreground">🏆 {s.season}시즌 마이프로리그</div>
        <div className="text-xs text-muted-foreground">{s.phase === "regular" ? `정규시즌 ${s.week}주차 / 11` : s.phase === "postseason" ? "포스트시즌" : "시즌 종료"}</div>
      </div>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-card border border-border">
        {([["match", "⚔️ 경기"], ["table", "📊 순위"], ["schedule", "📅 일정"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("py-2 rounded-lg text-sm font-bold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "match" && <MatchTab s={s} />}
      {tab === "table" && <TableTab s={s} />}
      {tab === "schedule" && <ScheduleTab s={s} />}
    </div>
  );
}
