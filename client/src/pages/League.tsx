import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { VitaButton, saveEntryDraft, takeEntryReturn } from "@/components/legacy/match/common";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FINAL_SETS, PRO_SETS, type CareerState, type CMatch } from "@shared/career/rules";
import { DIV_NAMES, STAGE_NAMES, divTeams, leagueName, myDiv, myPendingMatch, rosterOf, standings } from "@shared/career/view";
import { useCareer, useCareerPatch, useCareerUpdater } from "@/lib/career";
import { USER_CHANGE_EVENT } from "@/lib/session";
import { usePauseAlerts } from "@/lib/alertPause";
import type { CareerDiff } from "@shared/career/diff";
import { TeamBadge } from "@/components/career/Bits";
import { EntryScreen, LiveMatch, MapDrawScreen, MslFlow, NominationScreen, ProSeriesFlow, ScheduleScreen, SeriesViewer, type BroadcastSet, type HeldFinish, type ItemPlan, type MslReportView, type WeekDone } from "@/components/legacy/LegacyMatch";

type Tab = "match" | "table" | "schedule";

/** 이번 주 마이스타리그 우리 선수 경기 (눌러서 중계 다시 보기) */
export function MslReports({ s, reports, onWatch }: { s: CareerState; reports: MslReportView[]; onWatch: (r: MslReportView) => void }) {
  if (!reports.length) return null;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
      <div className="text-sm font-bold text-foreground">🎮 마이스타리그 · 우리 선수 경기</div>
      {reports.map((r, i) => {
        const A = s.players[r.a], B = s.players[r.b];
        const mineWon = s.players[r.winner]?.team === s.myTeam;
        return (
          <button key={i} onClick={() => onWatch(r)} className="w-full flex items-center gap-1.5 text-xs rounded-lg px-1 py-1.5 hover:bg-muted/50">
            <span className="text-muted-foreground w-24 truncate text-left">{r.label}</span>
            <span className={cn("flex-1 truncate text-right", r.winner === r.a ? "text-foreground font-bold" : "text-muted-foreground")}>{A?.name}</span>
            <span className="font-mono font-bold w-9 text-center">{r.sa}:{r.sb}</span>
            <span className={cn("flex-1 truncate text-left", r.winner === r.b ? "text-foreground font-bold" : "text-muted-foreground")}>{B?.name}</span>
            <span>{mineWon ? "🎉" : "😢"}</span>
            <span className="text-primary font-bold">▶</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 끝까지 보지 않은 관전 (✕ 로 나가도 다른 화면에 다녀와도 그 자리에서 이어 봄)
 * - heldLive: 마지막 세트까지 서버에서 끝난 우리 경기. s 는 경기가 끝나기 전 세이브 (중계 화면용)
 * - heldWeek: 주가 끝난 뒤 보는 다른 팀 포스트시즌·개인리그 경기와 결과 요약
 */
type HeldLive = { finish: HeldFinish; diff: CareerDiff; s: CareerState; applied: boolean; lastMatch: number | null; closed?: boolean };
type WeekView = { w: WeekDone; stage: "pro" | "msl" | "summary"; pro?: { k: number; idx: number }; msl?: number; closed?: boolean };
let heldLive: HeldLive | null = null;
let heldWeek: WeekView | null = null;
// 다른 사용자로 바뀌면 보던 관전을 버림
window.addEventListener(USER_CHANGE_EVENT, () => { heldLive = null; heldWeek = null; });

function MatchTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const patch = useCareerPatch();
  const [, navigate] = useLocation();
  const pending = myPendingMatch(s);
  const sets = pending?.stage === "final" ? FINAL_SETS : PRO_SETS;
  const [front, setFront] = useState<(number | undefined)[]>([]);
  const [items, setItems] = useState<ItemPlan>({});
  const [live, setLiveRaw] = useState<HeldLive | null>(() => heldLive && { ...heldLive, closed: true });
  const setLive = (v: HeldLive | null) => { heldLive = v; setLiveRaw(v); };
  // 관전 중 다른 화면으로 가면 끝난 경기 결과는 세이브에 반영 (관전은 돌아와서 이어 봄)
  useEffect(() => () => { if (heldLive && !heldLive.applied) { patch(heldLive.diff); heldLive = { ...heldLive, applied: true }; } }, []);
  // 다른 화면에 다녀오면 보던 관전은 "이어서 보기" 로
  const [wv, setWvRaw] = useState<WeekView | null>(() => heldWeek && (heldWeek.stage === "summary" ? heldWeek : { ...heldWeek, closed: true }));
  const setWv = (v: WeekView | null) => { heldWeek = v; setWvRaw(v); };
  const weekDone = wv?.stage === "summary" ? wv.w : null;
  /** 한 주 첫 경기가 끝난 직후 (2경기 준비) */
  const [legDone, setLegDone] = useState<number | null>(null);
  const [showNom, setShowNom] = useState(false);
  const [watch, setWatch] = useState<MslReportView | null>(null);
  const [watching, setWatching] = useState(!!s.live && !heldLive);
  // 관전(우리 경기·포스트시즌·개인리그)과 주 결과 화면이 떠 있는 동안은 영입 제안 등 알림을 멈췄다가, 나올 때 띄움
  usePauseAlerts(watching || !!wv || !!watch || (!!live && !live.closed));
  const drawKey = `mysc-mapdraw-${s.season}-${s.myTeam}`;
  const [showMaps, setShowMaps] = useState(false);
  // 엔트리 편성 중 상점에 다녀왔으면 편성하던 화면으로 바로 돌아온다
  const [returned] = useState(() => takeEntryReturn(pending?.id));
  const [editing, setEditing] = useState(!!returned && !!pending);
  useEffect(() => {
    if (!returned) return;
    if (returned.front.length) setFront(returned.front.map(x => x ?? undefined));
    if (Object.keys(returned.items).length) setItems(returned.items);
  }, []);
  // 편성 내용 기억 (상점에 다녀와도 유지)
  useEffect(() => {
    if (editing && pending) saveEntryDraft({ matchId: pending.id, front: front.map(x => x ?? null), items });
  }, [editing, pending?.id, front, items]);
  const closeMaps = () => { try { localStorage.setItem(drawKey, "1"); } catch { /* 저장 불가여도 진행 */ } setShowMaps(false); };
  const openEntry = () => {
    // 시즌 첫 경기 전에는 원작처럼 맵 추첨 결과부터
    let seen = true;
    try { seen = !!localStorage.getItem(drawKey); } catch { /* 무시 */ }
    if (!seen) setShowMaps(true);
    setEditing(true);
  };

  const begin = trpc.career.beginMatch.useMutation({
    onError: updater.onError,
    onSuccess: r => { patch(r.diff); setEditing(false); setWatching(true); setItems({}); },
  });
  const playSetM = trpc.career.playSet.useMutation({ onError: updater.onError });
  const advance = trpc.career.advance.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); finishWeekView(r.result as WeekDone); window.scrollTo(0, 0); },
  });
  // 조 지명식이 끝나면 (또는 자동 지명) 남은 주 일정 진행
  const complete = trpc.career.completeWeek.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); setShowNom(false); finishWeekView(r.result as WeekDone); window.scrollTo(0, 0); },
  });

  // 주가 끝나면 다른 팀 포스트시즌 → 개인리그 경기 → 결과 요약 순으로 관전
  function finishWeekView(w: WeekDone) {
    // 조 지명식·개인리그 준비부터 (s.weekHold). 다른 팀 포스트시즌 경기가 있으면 그것부터 보고 개인리그 준비로
    if (w.needNomination || (w.needMsl && !w.proReports?.length)) { setWv(null); return; }
    setWv({ w, stage: w.proReports?.length ? "pro" : w.mslReports?.length || w.mslPlans?.length ? "msl" : "summary" });
  }
  const afterPro = (w: WeekDone) => (w.needMsl ? setWv(null) : setWv({ w, stage: w.mslReports?.length || w.mslPlans?.length ? "msl" : "summary" }));
  /** 우리 경기 관전 끝 (끝까지 봤거나 건너뜀) */
  const finishLive = (h: HeldLive) => {
    if (!h.applied) patch(h.diff);
    setLive(null);
    setWatching(false);
    if (h.finish.week) finishWeekView(h.finish.week); else setLegDone(h.lastMatch);
    window.scrollTo(0, 0);
  };
  const resumeCard = (title: string, onResume: () => void, onSkip: () => void) => (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-4 text-center space-y-1">
        <div className="text-2xl">📺</div>
        <div className="font-bold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">보던 곳에서 이어서 보거나, 건너뛰고 결과를 볼 수 있습니다.</div>
      </div>
      <button onClick={onResume} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">▶ 관전 이어서 보기</button>
      <button onClick={onSkip} className="w-full py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">건너뛰고 결과 보기</button>
    </div>
  );

  if (watch) return <SeriesViewer s={s} report={watch} onClose={() => setWatch(null)} />;

  if (watching && (s.live || live)) {
    return (
      <LiveMatch
        s={live?.s ?? s}
        held={live?.finish}
        pending={playSetM.isPending}
        playSet={(ace, done, fail) => playSetM.mutate({ ace }, {
          onError: fail,
          onSuccess: r => {
            const res = r.result as { set: BroadcastSet; matchOver: boolean; playedMatchId?: number; week?: WeekDone; needAce: boolean };
            done(res);
            // 경기가 끝나 세이브에서 진행 중 경기가 사라져도 관전 화면은 끝까지 유지 (결과를 다 보거나 나갈 때 반영)
            if (res.matchOver) setLive({ finish: { matchId: s.live!.matchId, set: res.set, week: res.week ?? null, ace }, diff: r.diff, s, applied: false, lastMatch: res.playedMatchId ?? null });
            else patch(r.diff);
          },
        })}
        onFinished={() => { if (heldLive) finishLive(heldLive); else { setWatching(false); window.scrollTo(0, 0); } }}
        onClose={() => {
          // ✕: 경기 결과는 세이브에 반영하되, 관전은 나중에 그 자리에서 이어 봄
          if (heldLive) { if (!heldLive.applied) patch(heldLive.diff); setLive({ ...heldLive, applied: true, closed: true }); }
          setWatching(false);
        }}
      />
    );
  }
  if (live) return resumeCard("우리 팀 경기를 끝까지 보지 않았습니다", () => { setLive({ ...live, closed: false }); setWatching(true); }, () => finishLive(live));

  if (wv && wv.stage !== "summary") {
    if (wv.closed) return resumeCard(wv.stage === "pro" ? "포스트시즌 경기를 끝까지 보지 않았습니다" : "개인리그 경기를 끝까지 보지 않았습니다",
      () => setWv({ ...wv, closed: false }), () => setWv({ w: wv.w, stage: "summary" }));
    const close = () => setWv({ ...(heldWeek ?? wv), closed: true });
    // 이번 주 관전 경기 전체 (포스트시즌 → 개인리그): 선수 상태를 보고 있는 경기 직전으로
    const all = [...(wv.w.proReports ?? []), ...(wv.w.mslReports ?? [])];
    if (wv.stage === "pro") {
      return <ProSeriesFlow s={s} reports={wv.w.proReports ?? []} all={all} start={wv.pro}
        onProgress={p => { if (heldWeek) heldWeek = { ...heldWeek, pro: p }; }}
        onClose={close} onDone={() => afterPro(wv.w)} />;
    }
    return <MslFlow s={s} reports={wv.w.mslReports ?? []} all={all} plans={wv.w.mslPlans} start={wv.msl}
      onProgress={i => { if (heldWeek) heldWeek = { ...heldWeek, msl: i }; }}
      onClose={close} onDone={() => setWv({ w: wv.w, stage: "summary" })} />;
  }

  // 프로리그를 마치고 개인리그 전: 컨디션 회복·아이템을 챙긴 뒤 확인을 눌러 진행
  if (s.weekHold?.msl) {
    const ids = s.weekHold.msl.filter(id => s.players[id]?.team === s.myTeam);
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-sky-500/15 border border-sky-400/40 p-4 text-center space-y-1">
          <div className="text-3xl">🎮</div>
          <div className="font-black text-foreground">이번 주 마이스타리그 경기 전</div>
          <div className="text-xs text-muted-foreground">{ids.length ? "프로리그로 지친 선수의 컨디션을 회복하거나 장비를 챙긴 뒤 진행하세요. 컨디션이 낮으면 경기력이 떨어집니다." : "프로리그 일정을 마쳤습니다. 이어서 이번 주 개인리그 경기를 진행합니다."}</div>
        </div>
        {ids.length > 0 && <div className="rounded-2xl bg-black border border-border p-3 space-y-2">
          {ids.map(id => {
            const p = s.players[id];
            return (
              <div key={id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-white">{p.name}</span>
                  <span className={cn("font-black", p.cond >= 90 ? "text-emerald-400" : p.cond >= 70 ? "text-amber-300" : "text-rose-400")}>컨디션 {p.cond}%</span>
                </div>
                <VitaButton s={s} pid={id} />
              </div>
            );
          })}
        </div>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => navigate("/shop")} className="py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">🛒 아이템 상점</button>
          <button onClick={() => navigate("/team")} className="py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">👥 선수단</button>
        </div>
        <button onClick={() => complete.mutate()} disabled={complete.isPending} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-black">
          {complete.isPending ? "진행 중..." : "▶ 개인리그 진행"}
        </button>
      </div>
    );
  }

  // 주 마무리 전 조 지명식: 우리 선수가 조장이면 차례가 올 때 직접 지명
  if (s.weekHold) {
    if (showNom) return <NominationScreen s={s} onClose={() => setShowNom(false)} onDone={() => complete.mutate()} />;
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-violet-500/15 border border-violet-400/40 p-4 text-center space-y-1">
          <div className="text-3xl">🎤</div>
          <div className="font-black text-foreground">마이스타리그 조 지명식</div>
          <div className="text-xs text-muted-foreground">우리 선수가 조장입니다. 차례가 오면 같은 조에 넣을 선수를 직접 지명하세요.</div>
        </div>
        <button onClick={() => setShowNom(true)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white font-black">🎤 조 지명식 진행</button>
        <button onClick={() => complete.mutate()} disabled={complete.isPending} className="w-full py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">
          {complete.isPending ? "진행 중..." : "자동 지명하고 넘어가기"}
        </button>
      </div>
    );
  }

  if (legDone !== null && !weekDone) {
    const m = s.matches.find(x => x.id === legDone);
    const won = m?.winner === s.myTeam;
    const next = myPendingMatch(s);
    return (
      <div className="space-y-3">
        {m && (
          <div className={cn("rounded-2xl border p-4 text-center", won ? "bg-emerald-500/15 border-emerald-400/40" : "bg-rose-500/10 border-rose-400/30")}>
            <div className="text-xs text-muted-foreground">{m.week}주차 프로리그 {m.leg ?? 1}경기</div>
            <div className="mt-1 flex items-center justify-center gap-2 font-black text-foreground">
              <span>{s.teams[m.a].name}</span><span className="font-mono text-lg">{m.scoreA}:{m.scoreB}</span><span>{s.teams[m.b].name}</span>
            </div>
            <div className="text-sm mt-1">{won ? "🎉 승리!" : "😢 패배"}</div>
          </div>
        )}
        {next && <div className="rounded-2xl bg-card border border-border p-3 text-sm text-center">다음: 프로리그 {next.leg ?? 2}경기 vs <b>{s.teams[next.a === s.myTeam ? next.b : next.a].name}</b></div>}
        <button onClick={() => { setLegDone(null); if (next) openEntry(); }} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">⚔️ {next ? "2경기 엔트리 편성" : "확인"}</button>
        <button onClick={() => setLegDone(null)} className="w-full py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">나중에</button>
      </div>
    );
  }

  if (weekDone) {
    const m = weekDone.playedMatchId ? s.matches.find(x => x.id === weekDone.playedMatchId) : undefined;
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
        <MslReports s={s} reports={weekDone.mslReports ?? []} onWatch={setWatch} />
        {!m && !weekDone.mslReports?.length && <div className="rounded-2xl bg-card border border-border p-4 text-center text-sm text-muted-foreground">이번 주 일정이 끝났습니다.</div>}
        <button onClick={() => navigate("/starleague")} className="w-full py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">🏆 마이스타리그 대진 보기</button>
        <button onClick={() => { setWv(null); setLegDone(null); }} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black">확인 · 다음 주로</button>
      </div>
    );
  }

  if (s.live) {
    return (
      <button onClick={() => setWatching(true)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">▶ 진행 중인 경기 이어서 보기</button>
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
        <button onClick={() => advance.mutate({})} disabled={advance.isPending} className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-black">
          {advance.isPending ? "진행 중..." : "▶ 다음 주 진행 (관전)"}
        </button>
      </div>
    );
  }

  if (showMaps) return <MapDrawScreen s={s} onNext={closeMaps} />;
  if (editing) {
    return (
      <EntryScreen
        s={s} match={pending} front={front} setFront={setFront} items={items} setItems={setItems}
        submitting={begin.isPending}
        onSubmit={() => begin.mutate({ entry: front as number[], items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v])) })}
        onShowMaps={() => setShowMaps(true)}
        onBack={() => setEditing(false)}
      />
    );
  }

  const oppId = pending.a === s.myTeam ? pending.b : pending.a;
  const opp = s.teams[oppId];
  const filled = front.filter(x => x !== undefined && s.players[x]?.team === s.myTeam).length;
  const actionsDone = s.myActionsWeek === `${s.season}-${s.week}` || !rosterOf(s, s.myTeam).some(p => (p.ap ?? 20) >= 10);
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
        <div className="mt-1 text-[11px] text-muted-foreground">엔트리 {filled}/{sets - 1} · ACE 결정전 선수는 2:2 가 되면 고릅니다</div>
      </div>
      {!actionsDone && <p className="text-xs text-amber-300 px-1">이번 주 선수 행동을 아직 진행하지 않았습니다. <button onClick={() => navigate("/training")} className="underline font-bold">선수 행동 진행하기</button></p>}
      <button onClick={openEntry} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black">
        ⚔️ 엔트리 편성 · 경기 시작
      </button>
      <button onClick={() => setShowMaps(true)} className="w-full py-2.5 rounded-2xl bg-card border border-border text-sm font-bold text-foreground">🗺️ 이번 시즌 맵 추첨 결과</button>
    </div>
  );
}

function TableTab({ s }: { s: CareerState }) {
  const [div, setDiv] = useState<1 | 2>(myDiv(s));
  const st = standings(s, div);
  const [, navigate] = useLocation();
  const hasB = divTeams(s, 2).length > 0;
  // 승강전 구역: 1부 11·12위, 2부 1·2위
  const promo = (i: number) => (div === 1 ? i >= st.length - 2 : i < 2);
  return (
    <div className="space-y-2">
    {hasB && (
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border">
        {([1, 2] as const).map(d => (
          <button key={d} onClick={() => setDiv(d)} className={cn("py-1.5 rounded-lg text-sm font-bold", div === d ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{DIV_NAMES[d]} 리그</button>
        ))}
      </div>
    )}
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-[11px] text-muted-foreground">
          <tr className="border-b border-border"><th className="py-2 pl-3 text-left w-7">#</th><th className="text-left">팀</th><th>승</th><th>패</th><th className="pr-3">득실</th></tr>
        </thead>
        <tbody>
          {st.map((t, i) => (
            <tr key={t.id} onClick={() => navigate(`/teams?id=${t.id}`)} className={cn("border-b border-border/60 cursor-pointer active:bg-muted/40", t.id === s.myTeam && "bg-amber-500/15", div === 1 && i === 3 && "border-b-2 border-b-amber-400/40", hasB && promo(i) && t.id !== s.myTeam && "bg-rose-500/10")}>
              <td className={cn("py-2 pl-3 font-bold", hasB && promo(i) ? "text-rose-300" : "text-muted-foreground")}>{i + 1}</td>
              <td className="py-2"><span className="flex items-center gap-1.5"><TeamBadge short={t.short} color={t.color} /><span className={cn("truncate", t.id === s.myTeam ? "text-amber-200 font-bold" : "text-foreground")}>{t.name}</span><span className="text-muted-foreground text-xs">›</span></span></td>
              <td className="text-center font-bold text-foreground">{t.wins}</td>
              <td className="text-center text-muted-foreground">{t.losses}</td>
              <td className={cn("text-center pr-3 font-mono text-xs", t.setWins - t.setLosses >= 0 ? "text-emerald-300" : "text-rose-300")}>{t.setWins - t.setLosses > 0 ? "+" : ""}{t.setWins - t.setLosses}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground px-3 py-2">
        구단을 누르면 구단 정보와 선수단을 볼 수 있습니다 ·{" "}
        {div === 1 ? "4위까지 포스트시즌 진출 · 준플레이오프(3위 vs 4위) → 플레이오프(2위) → 결승(1위, 7전 4선승)" : "2부는 포스트시즌 없이 정규시즌 순위로"}
        {hasB && <> · <span className="text-rose-300">승강전</span>: 1부 11위 vs 2부 2위, 1부 12위 vs 2부 1위 (이긴 팀이 다음 시즌 1부)</>}
      </p>
    </div>
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
        <div className="text-lg font-black text-foreground">🏆 {s.season}시즌 {leagueName(myDiv(s))}</div>
        <div className="text-xs text-muted-foreground">{s.phase === "regular" ? `정규시즌 ${s.week}주차 / 11` : s.phase === "postseason" ? "포스트시즌" : "시즌 종료"}</div>
      </div>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-card border border-border">
        {([["match", "⚔️ 경기"], ["table", "📊 순위"], ["schedule", "📅 일정"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("py-2 rounded-lg text-sm font-bold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "match" && <MatchTab s={s} />}
      {tab === "table" && <TableTab s={s} />}
      {tab === "schedule" && <ScheduleScreen s={s} onClose={() => setTab("match")} />}
    </div>
  );
}
