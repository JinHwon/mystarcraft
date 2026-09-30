/**
 * 감독 랭킹: 가입한 사용자들의 감독 레벨·구단·구단 가치·우승
 */
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { TeamBadge } from "@/components/career/Bits";

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
            <button key={r.userId} onClick={() => setOpen(open === r.userId ? null : r.userId)}
              className={cn("w-full text-left rounded-2xl border p-3", mine ? "bg-primary/10 border-primary/50" : "bg-card border-border")}>
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
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-muted-foreground text-center">구단 가치 = 구단 자금 + 선수단(1부·2부) 영입 시세 합계 · 개인 우승은 지금 소속 선수 기준</div>
    </div>
  );
}
