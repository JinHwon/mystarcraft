import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FINAL_SETS, PRO_SETS, condMultiplier, totalOf, type CareerState, type CMatch } from "@shared/career/rules";
import { STAGE_NAMES, mapView, myPendingMatch, rosterOf, standings, teamPower } from "@shared/career/view";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge, TeamBadge } from "@/components/career/Bits";
import SetReveal from "@/components/career/SetReveal";

type Tab = "match" | "table" | "schedule";

function autoEntry(s: CareerState, sets: number): number[] {
  const ids = rosterOf(s, s.myTeam)
    .sort((a, b) => totalOf(b.stats) * condMultiplier(b.cond) - totalOf(a.stats) * condMultiplier(a.cond))
    .map(p => p.id);
  if (!ids.length) return [];
  const front = Array.from({ length: sets - 1 }, (_, i) => ids[i % ids.length]);
  return [...front, ids[0]];
}

function MapLine({ mapId }: { mapId: number }) {
  const m = mapView(mapId);
  const tag = (v: number) => (v >= 110 ? "text-emerald-300" : v <= 90 ? "text-rose-300" : "text-muted-foreground");
  return (
    <div className="text-[11px] text-muted-foreground">
      🗺️ <b className="text-foreground">{m.name}</b> · 러시 {m.rush} · 자원 {m.res} · 복잡 {m.complexity}
      <span className="ml-1">
        TvZ <b className={tag(m.tvz)}>{m.tvz}</b> · ZvP <b className={tag(m.zvp)}>{m.zvp}</b> · PvT <b className={tag(m.pvt)}>{m.pvt}</b>
      </span>
    </div>
  );
}

function MatchTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const [, navigate] = useLocation();
  const pending = myPendingMatch(s);
  const sets = pending?.stage === "final" ? FINAL_SETS : PRO_SETS;
  const [entry, setEntry] = useState<number[]>([]);
  const [played, setPlayed] = useState<{ match: CMatch; state: CareerState } | null>(null);
  const roster = useMemo(() => rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats)), [s]);

  useEffect(() => {
    if (!pending) return;
    setEntry(prev => (prev.length === sets && prev.every(id => s.players[id]?.team === s.myTeam) ? prev : autoEntry(s, sets)));
  }, [pending?.id, sets]);

  const advance = trpc.career.advance.useMutation({
    ...updater,
    onSuccess: r => {
      updater.onSuccess(r);
      const id = (r.result as { playedMatchId?: number }).playedMatchId;
      const m = id ? r.state.matches.find(x => x.id === id) : undefined;
      if (m) setPlayed({ match: m, state: r.state });
      window.scrollTo(0, 0);
    },
  });

  const front = entry.slice(0, sets - 1);
  const dupFront = new Set(front).size !== front.length;
  const usedAp = rosterOf(s, s.myTeam).filter(p => p.action).length;

  if (played) {
    const m = played.match;
    const mySide = m.a === s.myTeam ? "a" : "b";
    const opp = played.state.teams[mySide === "a" ? m.b : m.a];
    const won = m.winner === s.myTeam;
    return (
      <div className="space-y-3">
        <SetReveal
          state={played.state}
          sets={m.sets ?? []}
          mySide={mySide}
          title={`${STAGE_NAMES[m.stage]}${m.stage === "regular" ? ` ${m.week}주차` : ""} · vs ${opp.name}`}
          footer={won ? "🎉 승리! 팀 자금 +200만원" : "😢 패배 · 팀 자금 +50만원"}
        />
        <button
          onClick={() => setPlayed(null)}
          className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black"
        >확인 · 다음 주로</button>
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
        <button onClick={() => advance.mutate({})} disabled={advance.isPending} className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-black">
          {advance.isPending ? "진행 중..." : "▶ 다음 주 진행 (관전)"}
        </button>
      </div>
    );
  }

  const oppId = pending.a === s.myTeam ? pending.b : pending.a;
  const opp = s.teams[oppId];
  const oppRoster = rosterOf(s, oppId).sort((a, b) => totalOf(b.stats) - totalOf(a.stats));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="text-xs text-muted-foreground">{STAGE_NAMES[pending.stage]}{pending.stage === "regular" ? ` ${pending.week}주차` : ""} · {pending.stage === "final" ? "7전 4선승" : "5전 3선승"}</div>
        <div className="mt-1 flex items-center gap-2">
          <TeamBadge short={s.teams[s.myTeam].short} color={s.teams[s.myTeam].color} />
          <span className="font-black text-foreground">{s.teams[s.myTeam].name}</span>
          <span className="text-muted-foreground text-sm">vs</span>
          <TeamBadge short={opp.short} color={opp.color} />
          <span className="font-black text-rose-200 truncate">{opp.name}</span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          상대 전력 {teamPower(s, oppId).toLocaleString()} · 주요 선수 {oppRoster.slice(0, 3).map(p => p.name).join(", ")} · 상대 엔트리는 경기 시작과 함께 공개됩니다
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-foreground">📝 엔트리 편성</span>
        <button onClick={() => setEntry(autoEntry(s, sets))} className="text-xs font-bold text-primary">🤖 자동 편성</button>
      </div>
      <div className="space-y-2">
        {Array.from({ length: sets }, (_, i) => {
          const ace = i === sets - 1;
          const p = s.players[entry[i]];
          return (
            <div key={i} className={cn("rounded-2xl border p-3 space-y-1.5", ace ? "border-amber-400/50 bg-amber-500/10" : "border-border bg-card")}>
              <div className="flex items-center justify-between">
                <span className={cn("text-sm font-black", ace ? "text-amber-300" : "text-foreground")}>{ace ? "⭐ 에이스 결정전 (히든)" : `${i + 1}세트`}</span>
                {p && <CondBadge cond={p.cond} />}
              </div>
              <MapLine mapId={pending.maps[i % pending.maps.length]} />
              <select
                value={entry[i] ?? ""}
                onChange={e => setEntry(prev => { const n = [...prev]; n[i] = Number(e.target.value); return n; })}
                className="w-full bg-muted border border-border rounded-xl px-2.5 py-2 text-sm text-foreground"
              >
                {roster.map(r => (
                  <option key={r.id} value={r.id}>
                    [{r.race[0].toUpperCase()}] {r.name} · {totalOf(r.stats).toLocaleString()} · 컨디션 {r.cond}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {dupFront && <p className="text-xs text-rose-300 px-1">1~{sets - 1}세트에는 서로 다른 선수를 배치해야 합니다 (에이스 결정전은 누구나 가능)</p>}
      {usedAp === 0 && <p className="text-xs text-amber-300 px-1">이번 주 선수 행동을 아직 정하지 않았습니다. <button onClick={() => navigate("/training")} className="underline font-bold">선수 행동 정하기</button></p>}

      <button
        onClick={() => advance.mutate({ entry })}
        disabled={advance.isPending || dupFront || entry.length !== sets}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black disabled:opacity-40"
      >
        {advance.isPending ? "경기 진행 중..." : "⚔️ 경기 시작"}
      </button>
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
