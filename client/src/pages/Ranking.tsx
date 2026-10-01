/**
 * 감독 랭킹: 가입한 사용자들의 감독 레벨·구단·구단 가치·우승
 */
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CondBadge, RaceBadge, TeamBadge } from "@/components/career/Bits";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PlayerPhoto } from "@/components/legacy/Legacy";
import { ageOf, gradeColor, legacyGrade, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { gearStats } from "@shared/career/items";
import { PlayerSheet } from "./Team";

type Row = inferRouterOutputs<AppRouter>["career"]["ranking"]["rows"][number];

const SORTS: Array<{ key: string; label: string; value: (r: Row) => number; show: (r: Row) => string }> = [
  { key: "level", label: "감독 레벨", value: r => r.level * 1e6 + r.exp, show: r => `Lv.${r.level}` },
  { key: "value", label: "구단 가치", value: r => r.clubValue, show: r => `${r.clubValue.toLocaleString()}만` },
  { key: "titles", label: "우승", value: r => r.proTitles * 1000 + r.mslTitles * 100 + r.level, show: r => `🏆${r.proTitles}` },
  { key: "power", label: "전력", value: r => r.power, show: r => r.power.toLocaleString() },
];

export default function Ranking() {
  const q = trpc.career.ranking.useQuery(undefined, { staleTime: 60_000 });
  const [sort, setSort] = useState("level");
  const [open, setOpen] = useState<number | null>(null);
  const [roster, setRoster] = useState<Row | null>(null);
  const cur = SORTS.find(x => x.key === sort)!;
  const rows = [...(q.data?.rows ?? [])].sort((a, b) => cur.value(b) - cur.value(a));
  const myRank = rows.findIndex(r => r.userId === q.data?.me) + 1;

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-black text-foreground">🏅 감독 랭킹</div>
        <div className="text-xs text-muted-foreground mt-0.5">가입한 감독 {rows.length}명{myRank ? ` · 내 순위 ${myRank}위` : ""} · 1분마다 갱신</div>
      </div>
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-card border border-border">
        {SORTS.map(x => (
          <button key={x.key} onClick={() => setSort(x.key)} className={cn("py-2 rounded-lg text-xs font-bold", sort === x.key ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{x.label}</button>
        ))}
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground p-4">불러오는 중...</div>}
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const mine = r.userId === q.data?.me;
          return (
            <div key={r.userId} role="button" tabIndex={0} onClick={() => setOpen(open === r.userId ? null : r.userId)}
              className={cn("w-full text-left rounded-2xl border p-3 cursor-pointer", mine ? "bg-primary/10 border-primary/50" : "bg-card border-border")}>
              <div className="flex items-center gap-2">
                <span className={cn("w-7 text-center font-black", i < 3 ? "text-amber-300 text-lg" : "text-muted-foreground")}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground truncate">{r.name}</span>
                    {mine && <span className="text-[10px] text-primary font-bold">나</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <TeamBadge short={r.team.short} color={r.team.color} />
                    <span className="truncate">{r.team.name}</span>
                    <span>· Lv.{r.level}</span>
                  </div>
                </div>
                <span className="font-black text-foreground text-sm">{cur.show(r)}</span>
              </div>
              {open === r.userId && (
                <div className="grid grid-cols-3 gap-1.5 mt-2.5 text-center">
                  {[
                    ["감독 레벨", `Lv.${r.level} (${r.exp}/${r.expNeed})`],
                    ["명성", `${r.reputation}`],
                    ["시즌", `${r.season}시즌 ${r.phase === "regular" ? `${r.week}주` : r.phase === "postseason" ? "PO" : "종료"}`],
                    ["구단 자금", `${r.money.toLocaleString()}만`],
                    ["선수 가치", `${r.playerValue.toLocaleString()}만`],
                    ["구단 가치", `${r.clubValue.toLocaleString()}만`],
                    ["팀 전력", r.power.toLocaleString()],
                    ["이번 시즌", `${r.record.wins}승 ${r.record.losses}패`],
                    ["우승", `프로 ${r.proTitles} · 개인 ${r.mslTitles}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-xs font-bold text-foreground">{v}</div></div>
                  ))}
                  {r.gameOver && <div className="col-span-3 text-xs text-rose-300">게임 종료: {r.gameOver}</div>}
                  <button onClick={e => { e.stopPropagation(); setRoster(r); }} className="col-span-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">👥 {r.team.name} 선수 보기</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ManagerRoster row={roster} onClose={() => setRoster(null)} />
      <div className="text-[11px] text-muted-foreground text-center">구단 가치 = 구단 자금 + 선수단(1부·2부) 영입 시세 합계 · 개인 우승은 지금 소속 선수 기준</div>
    </div>
  );
}

/** 다른 감독의 선수단: 그 감독이 진행 중인 세이브 그대로 (읽기 전용) */
function ManagerRoster({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const q = trpc.career.managerRoster.useQuery({ userId: row?.userId ?? 0 }, { enabled: !!row, staleTime: 30_000 });
  const [pick, setPick] = useState<number | null>(null);
  // 선수 정보 창이 쓰는 최소한의 세이브 모양 (그 감독의 시즌·팀 정보)
  const view = q.data ? ({ season: q.data.season, week: q.data.week, myTeam: -1, teams: q.data.teams, players: [], matches: [], news: [], history: [] } as unknown as CareerState) : null;
  const players = ((q.data?.players ?? []) as unknown as CPlayer[]).slice().sort((a, b) => totalOf(gearStats(b)) - totalOf(gearStats(a)));
  const player = pick !== null ? players.find(p => p.id === pick) ?? null : null;
  return (
    <>
      <Sheet open={!!row} onOpenChange={o => { if (!o) { setPick(null); onClose(); } }}>
        <SheetContent side="bottom" className="app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border max-h-[85vh] overflow-y-auto safe-bottom">
          {row && (
            <div className="space-y-2 p-1">
              <SheetHeader className="p-0">
                <SheetTitle className="text-left text-base flex items-center gap-1.5"><TeamBadge short={row.team.short} color={row.team.color} />{row.team.name} <span className="text-xs text-muted-foreground font-normal">· {row.name} 감독</span></SheetTitle>
              </SheetHeader>
              {q.isLoading && <div className="text-sm text-muted-foreground py-3">불러오는 중...</div>}
              {q.error && <div className="text-sm text-rose-300 py-3">{q.error.message}</div>}
              {q.data && <div className="text-[11px] text-muted-foreground">{q.data.season}시즌 {q.data.week}주차 기준 · {players.length}명 · 선수를 누르면 자세히</div>}
              <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
                {view && players.map(p => {
                  const grade = legacyGrade(totalOf(gearStats(p)));
                  return (
                    <button key={p.id} onClick={() => setPick(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-muted/40">
                      <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <RaceBadge race={p.race} />
                          <span className="font-bold text-foreground truncate">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground">Lv.{p.level} · {ageOf(p, view.season)}세</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <CondBadge cond={p.cond} />
                          <span>{p.sWins}승 {p.sLosses}패</span>
                          <span>통산 {p.wins}승 {p.losses}패</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black font-mono" style={{ color: gradeColor(grade) }}>{grade}</div>
                        <div className="text-[11px] font-mono text-foreground">{totalOf(gearStats(p)).toLocaleString()}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {view && <PlayerSheet s={view} player={player} onClose={() => setPick(null)} />}
    </>
  );
}
