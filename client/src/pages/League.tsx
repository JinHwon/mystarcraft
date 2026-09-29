import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RACE_LABELS } from "@shared/gameConstants";
import { MIN_FATIGUE_TO_PLAY, PRO_SETS, PRO_SEASON_REWARD, INDIVIDUAL_REWARD, PRO_MATCH_GOLD } from "@shared/leagueConstants";
import { ConditionBadge, GradeTag, RaceTag } from "@/components/team/PlayerBadges";
import { mapKeyPoints } from "@/components/MapPicker";

type Tab = "pro" | "individual" | "history";

interface SetPlayer { id: number; name: string; race: string; teamId: number }
interface SetRecord {
  mapName: string;
  a: SetPlayer | null;
  b: SetPlayer | null;
  winner?: "a" | "b";
  duration?: number;
  endReason?: string;
  highlights?: string[];
}

function fmtDuration(sec?: number) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

function lineClass(line: string) {
  if (/GG|판정/.test(line)) return "text-red-300 font-semibold";
  if (/뒤집|역습!/.test(line)) return "text-fuchsia-300 font-semibold";
  if (/교전 승리|무너|지켜냅/.test(line)) return "text-amber-300";
  if (/공격!/.test(line)) return "text-orange-200";
  return "text-slate-300";
}

/** 세트 결과를 하나씩 공개하는 문자중계 */
function SetReveal({ sets, mySide, title, footer, onDone }: { sets: SetRecord[]; mySide?: "a" | "b" | null; title: string; footer?: string; onDone?: () => void }) {
  const [setIdx, setSetIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [skip, setSkip] = useState(false);
  const cur = sets[setIdx];
  const lines = cur?.highlights ?? [];
  const setDone = skip || lineIdx >= lines.length;
  const allDone = skip || (setIdx >= sets.length - 1 && setDone);

  useEffect(() => {
    if (skip || !cur) return;
    const t = setTimeout(() => {
      if (lineIdx < lines.length) setLineIdx(lineIdx + 1);
      else if (setIdx < sets.length - 1) { setSetIdx(setIdx + 1); setLineIdx(0); }
    }, lineIdx < lines.length ? 450 : 1400);
    return () => clearTimeout(t);
  }, [lineIdx, setIdx, skip, cur, lines.length, sets.length]);

  useEffect(() => { if (allDone) onDone?.(); }, [allDone]);

  const shownSets = skip ? sets : sets.slice(0, setIdx + (setDone ? 1 : 0));
  const scoreA = shownSets.filter(s => s.winner === "a").length;
  const scoreB = shownSets.filter(s => s.winner === "b").length;
  const nameA = sets[0]?.a?.name, nameB = sets[0]?.b?.name;

  return (
    <Card className="py-0 bg-slate-950 border-indigo-700/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-indigo-300 font-bold">📺 {title}</div>
          {!allDone && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSkip(true)}>결과 바로 보기 ⏭</Button>}
        </div>
        <div className="flex items-center justify-center gap-4 text-2xl font-black">
          <span className={cn(mySide === "a" ? "text-blue-300" : "text-slate-200")}>{scoreA}</span>
          <span className="text-slate-600 text-base">:</span>
          <span className={cn(mySide === "b" ? "text-blue-300" : "text-slate-200")}>{scoreB}</span>
        </div>
        <div className="space-y-2">
          {(skip ? sets : sets.slice(0, setIdx + 1)).map((s, i) => {
            const revealed = skip || i < setIdx || setDone;
            const visibleLines = skip || i < setIdx ? (s.highlights ?? []) : (s.highlights ?? []).slice(0, lineIdx);
            const aWin = s.winner === "a";
            return (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                  <span className="text-slate-400">{i + 1}세트 · 🗺️ {s.mapName}</span>
                  <span className="flex items-center gap-1.5">
                    <b className={cn(revealed && aWin ? "text-amber-300" : "text-slate-200", mySide === "a" && "underline decoration-blue-400")}>{s.a?.name}</b>
                    <span className="text-slate-500">({RACE_LABELS[s.a?.race ?? ""] ?? ""})</span>
                    <span className="text-slate-600">vs</span>
                    <b className={cn(revealed && !aWin ? "text-amber-300" : "text-slate-200", mySide === "b" && "underline decoration-blue-400")}>{s.b?.name}</b>
                    <span className="text-slate-500">({RACE_LABELS[s.b?.race ?? ""] ?? ""})</span>
                  </span>
                  {revealed && <span className="text-emerald-300 font-bold">🏆 {aWin ? s.a?.name : s.b?.name} 승 · {fmtDuration(s.duration)}</span>}
                </div>
                {visibleLines.length > 0 && (
                  <div className="space-y-0.5 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed">
                    {visibleLines.map((l, j) => <div key={j} className={lineClass(l)}>{l}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {allDone && nameA && nameB && (
          <div className="text-center text-sm font-bold text-white">
            {scoreA > scoreB ? nameA : nameB} {mySide ? "" : "선수"} {Math.max(scoreA, scoreB)}:{Math.min(scoreA, scoreB)} 승리
          </div>
        )}
        {allDone && footer && <div className="text-center text-sm text-amber-300">{footer}</div>}
      </CardContent>
    </Card>
  );
}

// ── 프로리그 ───────────────────────────────────────────────────

function Proleague() {
  const utils = trpc.useUtils();
  const q = trpc.league.proleague.useQuery();
  const teamQ = trpc.team.get.useQuery();
  const [entry, setEntry] = useState<number[]>([]);
  const [result, setResult] = useState<any>(null);

  const roster = teamQ.data?.roster ?? [];
  const data = q.data;

  const autoEntry = () => {
    const usable = [...roster].filter(p => p.fatigue >= MIN_FATIGUE_TO_PLAY)
      .sort((a, b) => (b.totalStats * b.condition) - (a.totalStats * a.condition));
    if (!usable.length) return [];
    const best = usable[0].id;
    const firstFour = Array.from({ length: 4 }, (_, i) => usable[i % usable.length].id);
    return [...firstFour, best];
  };

  useEffect(() => {
    if (!data?.next || roster.length === 0) return;
    setEntry(prev => (prev.length === PRO_SETS && prev.every(id => roster.some(p => p.id === id)) ? prev : autoEntry()));
  }, [data?.next?.matchId, roster.length]);

  const playMutation = trpc.league.playProRound.useMutation({
    onSuccess: r => {
      setResult(r);
      utils.team.get.invalidate();
      utils.player.get.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const newSeason = trpc.league.newProSeason.useMutation({
    onSuccess: () => { setResult(null); utils.league.proleague.invalidate(); utils.league.history.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const teamOf = (id: number) => data?.teams.find(t => t.id === id);
  if (q.isLoading || !data) return <p className="text-gray-400">리그 정보를 불러오는 중...</p>;
  const myTeam = data.teams.find(t => t.isMine);
  const myRank = data.standings.findIndex(s => s.teamId === myTeam?.id) + 1;
  const appearances = entry.reduce<Record<number, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {});

  return (
    <div className="space-y-5">
      <Card className="py-0 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border-indigo-800/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="text-4xl">🏆</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-xl md:text-2xl font-black text-white">시즌 {data.season.seasonNo} 프로리그</div>
            <div className="text-sm text-slate-400">
              {data.season.status === "active" ? `정규시즌 ${data.season.round} / ${data.season.totalRounds} 라운드` : "시즌 종료"} · 8팀 풀리그 · 5전 3선승제 (5세트 에이스 결정전)
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">현재 순위</div>
            <div className="text-2xl font-black text-amber-300">{myRank}위</div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <SetReveal
          key={`${result.round}`}
          sets={result.sets}
          mySide={result.mySide}
          title={`${result.round}라운드 · ${myTeam?.name} vs ${teamOf(result.opponentTeamId)?.name}`}
          footer={`${result.won ? "🎉 팀 승리" : "😢 팀 패배"} · 운영 자금 +${result.gold}G${result.finished ? ` · 시즌 최종 ${result.finished.rank}위 (상금 +${result.finished.reward.toLocaleString()}G)` : ""}`}
          onDone={() => {
            utils.league.proleague.invalidate();
            if (result.finished) toast.success(`시즌 종료! 최종 ${result.finished.rank}위 · 상금 ${result.finished.reward.toLocaleString()}G`);
          }}
        />
      )}

      <div className="grid lg:grid-cols-5 gap-5">
        {/* 순위표 */}
        <Card className="order-2 lg:order-1 lg:col-span-2 py-0 bg-slate-900 border-slate-700">
          <CardHeader className="pt-4 pb-2"><CardTitle className="text-base text-amber-400">📊 순위표</CardTitle></CardHeader>
          <CardContent className="px-3 pb-4">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr><th className="text-left py-1 w-6">#</th><th className="text-left">팀</th><th>승</th><th>패</th><th>득실</th></tr>
              </thead>
              <tbody>
                {data.standings.map((s, i) => {
                  const t = teamOf(s.teamId);
                  return (
                    <tr key={s.teamId} className={cn("border-t border-slate-800", t?.isMine && "bg-amber-900/20")}>
                      <td className="py-1.5 font-bold text-slate-400">{i + 1}</td>
                      <td className={cn("truncate max-w-[140px]", t?.isMine ? "text-amber-300 font-bold" : "text-slate-200")}>
                        {t?.emblem} {t?.name} <span className="text-slate-500 font-normal">({t?.power.toLocaleString()})</span>
                      </td>
                      <td className="text-center text-white">{s.wins}</td>
                      <td className="text-center text-slate-400">{s.losses}</td>
                      <td className={cn("text-center font-mono", s.setWins - s.setLosses >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {s.setWins - s.setLosses > 0 ? "+" : ""}{s.setWins - s.setLosses}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-2">괄호는 팀 전력(상위 5명 능력치 평균). 시즌 상금: 1위 {PRO_SEASON_REWARD[0].toLocaleString()}G · 2위 {PRO_SEASON_REWARD[1].toLocaleString()}G · 3위 {PRO_SEASON_REWARD[2]}G ...</p>
          </CardContent>
        </Card>

        {/* 다음 경기 / 시즌 종료 */}
        <div className="order-1 lg:order-2 lg:col-span-3 space-y-4">
          {data.season.status === "finished" && !!data.season.result && (
            <Card className="py-0 bg-amber-950/30 border-amber-700">
              <CardContent className="p-4 space-y-2 text-center">
                <div className="text-3xl">{(data.season.result as any).rank === 1 ? "🥇" : "🏁"}</div>
                <div className="text-lg font-bold text-white">시즌 {data.season.seasonNo} 최종 {(data.season.result as any).rank}위</div>
                <div className="text-sm text-slate-300">
                  우승: {(data.season.result as any).champion?.emblem} {(data.season.result as any).champion?.name} · 받은 상금 {(data.season.result as any).reward?.toLocaleString()}G
                </div>
                <Button onClick={() => newSeason.mutate()} disabled={newSeason.isPending}>🆕 다음 시즌 시작</Button>
              </CardContent>
            </Card>
          )}

          {data.next && (
            <Card className="py-0 bg-slate-900 border-slate-700">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base font-bold text-white">
                    {data.next.round}라운드 · <span className="text-amber-300">{myTeam?.emblem} {myTeam?.name}</span>
                    <span className="text-slate-500 mx-1.5">vs</span>
                    <span className="text-rose-300">{data.next.opponent?.emblem} {data.next.opponent?.name}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEntry(autoEntry())}>🤖 자동 편성</Button>
                </div>
                <p className="text-xs text-slate-400">
                  상대 엔트리가 미리 공개됩니다. 맵과 상대 종족을 보고 우리 선수를 배치하세요. 한 선수가 여러 세트에 나갈 수 있지만 세트마다 피로도 8이 줄어 경기력이 떨어집니다.
                </p>
                <div className="space-y-2">
                  {data.next.sets.map((s, i) => (
                    <div key={s.set} className={cn("rounded-lg border p-2.5 grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr] gap-2 items-center", s.ace ? "border-amber-700/70 bg-amber-950/20" : "border-slate-800 bg-slate-950/40")}>
                      <div className="text-xs">
                        <div className="font-bold text-slate-200">{s.ace ? "⭐ 5세트 에이스 결정전" : `${s.set}세트`}</div>
                        <div className="text-slate-300">{s.map?.emoji} {s.map?.name}</div>
                        {s.map && <div className="text-[10px] text-slate-500">{mapKeyPoints(s.map).join(" · ")}</div>}
                      </div>
                      <div className="text-xs">
                        {s.opponent ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-rose-200">{s.opponent.name}</span>
                              <GradeTag grade={s.opponent.grade} />
                            </div>
                            <div className="flex items-center gap-2"><RaceTag race={s.opponent.race} /><span className="text-slate-500">능력치 {s.opponent.totalStats.toLocaleString()}</span></div>
                            <ConditionBadge condition={s.opponent.condition} />
                          </>
                        ) : <span className="text-slate-500">-</span>}
                      </div>
                      <select
                        value={entry[i] ?? ""}
                        onChange={e => setEntry(prev => { const next = [...prev]; next[i] = Number(e.target.value); return next; })}
                        className="w-full bg-slate-800 border border-slate-600 rounded-md px-2 py-1.5 text-xs text-white"
                      >
                        <option value="" disabled>선수 선택</option>
                        {roster.map(p => (
                          <option key={p.id} value={p.id} disabled={p.fatigue < MIN_FATIGUE_TO_PLAY}>
                            {p.name} · {RACE_LABELS[p.race]} · {p.totalStats.toLocaleString()} · 컨디션 {p.condition}% · 피로 {p.fatigue}{appearances[p.id] > 1 ? ` (×${appearances[p.id]})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={entry.length !== PRO_SETS || entry.some(x => !x) || playMutation.isPending}
                  onClick={() => playMutation.mutate({ entry })}
                >
                  {playMutation.isPending ? "경기 진행 중..." : `⚔️ ${data.next.round}라운드 경기 시작 (승리 +${PRO_MATCH_GOLD.win}G / 패배 +${PRO_MATCH_GOLD.lose}G)`}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 우리 팀 경기 기록 */}
          <Card className="py-0 bg-slate-900 border-slate-700">
            <CardHeader className="pt-4 pb-2"><CardTitle className="text-sm text-slate-300">📅 우리 팀 일정</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 space-y-1">
              {data.matches.filter(m => m.sideA === myTeam?.id || m.sideB === myTeam?.id).map(m => {
                const oppId = m.sideA === myTeam?.id ? m.sideB : m.sideA;
                const my = m.sideA === myTeam?.id ? m.scoreA : m.scoreB;
                const op = m.sideA === myTeam?.id ? m.scoreB : m.scoreA;
                const opp = teamOf(oppId);
                return (
                  <div key={m.id} className="flex items-center gap-2 text-xs border-b border-slate-800/60 py-1">
                    <span className="text-slate-500 w-12">{m.round}R</span>
                    <span className="flex-1 text-slate-200">{opp?.emblem} {opp?.name}</span>
                    {m.status === "done"
                      ? <span className={cn("font-bold", my > op ? "text-emerald-400" : "text-rose-400")}>{my > op ? "승" : "패"} {my}:{op}</span>
                      : <span className="text-slate-500">예정</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── 개인리그 ───────────────────────────────────────────────────

function Individual() {
  const utils = trpc.useUtils();
  const q = trpc.league.individual.useQuery();
  const [result, setResult] = useState<any>(null);
  const play = trpc.league.playIndividualRound.useMutation({
    onSuccess: r => {
      setResult(r);
      utils.team.get.invalidate();
      utils.player.get.invalidate();
      if (r.results.length === 0) utils.league.individual.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const newSeason = trpc.league.newIndividualSeason.useMutation({
    onSuccess: () => { setResult(null); utils.league.individual.invalidate(); utils.league.history.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const data = q.data;
  const entrant = useMemo(() => new Map((data?.entrants ?? []).map(e => [e.id, e])), [data]);
  if (q.isLoading || !data) return <p className="text-gray-400">개인리그 정보를 불러오는 중...</p>;
  const myAlive = data.season.status === "active" && data.matches
    .filter(m => m.round === data.season.round)
    .some(m => entrant.get(m.sideA)?.isMine || entrant.get(m.sideB)?.isMine);
  const res = data.season.result as any;

  const Slot = ({ id, score, win }: { id: number; score: number; win: boolean }) => {
    const e = entrant.get(id);
    return (
      <div className={cn("flex items-center justify-between gap-1 px-2 py-1 text-[11px]", e?.isMine && "bg-amber-900/30", win && "font-bold")}>
        <span className={cn("truncate", e?.isMine ? "text-amber-300" : win ? "text-white" : "text-slate-400")}>
          {e?.name ?? "?"} <span className="text-slate-500 font-normal">{RACE_LABELS[e?.race ?? ""]?.[0] ?? ""}</span>
        </span>
        <span className="font-mono text-slate-300">{score}</span>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <Card className="py-0 bg-gradient-to-r from-rose-950 via-slate-900 to-amber-950 border-rose-800/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="text-4xl">🎖️</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-xl md:text-2xl font-black text-white">시즌 {data.season.seasonNo} 개인리그</div>
            <div className="text-sm text-slate-400">16강 토너먼트 · 3전 2선승 (결승 5전 3선승) · 우리 팀 선수 전원 출전</div>
          </div>
          {data.season.status === "active" ? (
            <Button className="bg-rose-600 hover:bg-rose-700" disabled={play.isPending} onClick={() => play.mutate()}>
              {play.isPending ? "진행 중..." : myAlive ? `▶ ${data.season.roundName} 진행` : `▶ ${data.season.roundName} 진행 (관전)`}
            </Button>
          ) : (
            <Button onClick={() => newSeason.mutate()} disabled={newSeason.isPending}>🆕 새 개인리그 시작</Button>
          )}
        </CardContent>
      </Card>

      {result && result.results.map((r: any) => {
        const mySide = entrant.get(r.a?.id)?.isMine ? "a" : entrant.get(r.b?.id)?.isMine ? "b" : null;
        return (
          <SetReveal
            key={r.matchId}
            sets={r.sets}
            mySide={mySide}
            title={`${result.roundName} · ${r.a?.name} vs ${r.b?.name}`}
            onDone={() => utils.league.individual.invalidate()}
          />
        );
      })}
      {result?.placements?.length > 0 && (
        <details className="text-sm text-amber-300">
          <summary className="cursor-pointer text-slate-400">이번 라운드 우리 선수 성적 보기</summary>
          {result.placements.map((p: any) => `${p.name} ${p.place} (+${p.gold.toLocaleString()}G)`).join(" · ")}
        </details>
      )}

      {data.season.status === "finished" && res?.champion && (
        <Card className="py-0 bg-amber-950/30 border-amber-700">
          <CardContent className="p-4 text-center space-y-1">
            <div className="text-3xl">👑</div>
            <div className="text-lg font-bold text-white">우승: {res.champion.name} ({RACE_LABELS[res.champion.race]}){res.champion.isMine ? " — 우리 팀!" : ""}</div>
            <div className="text-sm text-slate-300">
              {(res.placements ?? []).map((p: any) => `${p.name} ${p.place} +${p.gold.toLocaleString()}G`).join(" · ") || "우리 팀 성적 없음"}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 대진표 */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-4 gap-3 min-w-[720px]">
          {data.rounds.map((r, ri) => {
            const ms = data.matches.filter(m => m.round === ri + 1);
            const expected = 8 >> ri;
            return (
              <div key={r.name} className="flex flex-col justify-around gap-2">
                <div className="text-center text-xs font-bold text-slate-300">{r.name} <span className="text-slate-500 font-normal">({r.bestOf}전)</span></div>
                {Array.from({ length: expected }, (_, i) => {
                  const m = ms.find(x => x.slot === i);
                  return (
                    <div key={i} className="rounded-md border border-slate-700 bg-slate-900 overflow-hidden">
                      {m ? (
                        <>
                          <Slot id={m.sideA} score={m.scoreA} win={m.status === "done" && m.winner === m.sideA} />
                          <div className="border-t border-slate-800" />
                          <Slot id={m.sideB} score={m.scoreB} win={m.status === "done" && m.winner === m.sideB} />
                        </>
                      ) : <div className="text-[11px] text-slate-600 px-2 py-3 text-center">미정</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        상금: {Object.entries(INDIVIDUAL_REWARD).map(([k, v]) => `${k} ${v.toLocaleString()}G`).join(" · ")} · 세트마다 피로도 5 소모
      </p>
    </div>
  );
}

// ── 기록 ───────────────────────────────────────────────────────

function History() {
  const q = trpc.league.history.useQuery();
  if (q.isLoading) return <p className="text-gray-400">불러오는 중...</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-slate-500 text-sm">아직 끝난 시즌이 없습니다.</p>;
  return (
    <div className="space-y-2">
      {rows.map(r => {
        const res = r.result as any;
        return (
          <Card key={r.id} className="py-0 bg-slate-900 border-slate-700">
            <CardContent className="p-3 text-sm flex flex-wrap items-center gap-3">
              <span className="text-lg">{r.kind === "proleague" ? "🏆" : "🎖️"}</span>
              <span className="font-bold text-white">시즌 {r.seasonNo} {r.kind === "proleague" ? "프로리그" : "개인리그"}</span>
              {r.kind === "proleague"
                ? <span className="text-slate-300">최종 {res?.rank}위 · 우승 {res?.champion?.emblem} {res?.champion?.name} · 상금 {res?.reward?.toLocaleString()}G</span>
                : <span className="text-slate-300">우승 {res?.champion?.name}{res?.champion?.isMine ? " (우리 팀)" : ""} · {(res?.placements ?? []).map((p: any) => `${p.name} ${p.place}`).join(", ") || "우리 팀 성적 없음"}</span>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function League() {
  const [tab, setTab] = useState<Tab>("pro");
  return (
    <div className="p-4 md:p-8 space-y-5 max-w-6xl mx-auto">
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold text-amber-400">🏟️ 리그</h1>
        <p className="text-gray-400 text-sm">프로리그에서 팀 순위를 다투고, 개인리그에서 우승 트로피에 도전하세요. 경기 결과는 선수 경험치·컨디션·피로도에 반영됩니다.</p>
      </div>
      <div className="flex gap-2">
        {([["pro", "🏆 프로리그"], ["individual", "🎖️ 개인리그"], ["history", "📜 기록"]] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("flex-1 py-2.5 rounded-lg font-semibold text-sm border-2 transition-all",
              tab === k ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-gray-400 hover:text-gray-200")}
          >{l}</button>
        ))}
      </div>
      {tab === "pro" && <Proleague />}
      {tab === "individual" && <Individual />}
      {tab === "history" && <History />}
    </div>
  );
}
