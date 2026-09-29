import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS, RACE_LABELS, RACE_COLORS, GRADE_COLORS, type Grade } from "@shared/gameConstants";
import { ChevronDown, Search, Crosshair } from "lucide-react";

const PAGE = 30;
type RaceFilter = "all" | "terran" | "zerg" | "protoss";

function RankNo({ rank }: { rank: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div className="w-9 shrink-0 text-center">
      {medal ? <span className="text-2xl">{medal}</span> : <span className="text-sm font-black text-muted-foreground">{rank}</span>}
    </div>
  );
}

function HeadToHead({ opponentId }: { opponentId: number }) {
  const { data, isLoading } = trpc.ranking.headToHead.useQuery({ opponentPlayerId: opponentId });
  if (isLoading) return <span className="text-xs text-muted-foreground">상대 전적 조회 중...</span>;
  if (!data || data.total === 0) return <span className="text-xs text-muted-foreground">아직 맞붙은 적이 없습니다</span>;
  return (
    <span className="text-xs text-foreground">
      나와의 상대 전적 <b className="text-emerald-300">{data.wins}승</b> <b className="text-rose-300">{data.losses}패</b>
    </span>
  );
}

export default function RankingPage() {
  const { data: rankings = [], isLoading } = trpc.ranking.list.useQuery();
  const { data: me } = trpc.player.get.useQuery();
  const [query, setQuery] = useState("");
  const [race, setRace] = useState<RaceFilter>("all");
  const [humansOnly, setHumansOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  const ranked = useMemo(() => rankings.map((r, i) => ({ ...r, rank: i + 1 })), [rankings]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter(r =>
      (race === "all" || r.race === race) &&
      (!humansOnly || !r.isBot) &&
      (!q || r.name.toLowerCase().includes(q)));
  }, [ranked, query, race, humansOnly]);
  const myRow = ranked.find(r => r.playerId === me?.id);

  const jumpToMe = () => {
    if (!myRow) return;
    setQuery(""); setRace("all"); setHumansOnly(false);
    setLimit(Math.max(PAGE, Math.ceil(myRow.rank / PAGE) * PAGE));
    setOpen(myRow.playerId);
    setTimeout(() => document.getElementById(`rank-${myRow.playerId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">랭킹 불러오는 중...</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <div className="hidden md:block">
        <h1 className="text-3xl font-black text-foreground">🏆 랭킹</h1>
        <p className="text-sm text-muted-foreground">능력치 합계 순 · 총 {rankings.length}명</p>
      </div>

      {/* 내 순위 */}
      {myRow && (
        <button onClick={jumpToMe} className="w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600/40 to-indigo-600/30 border border-blue-400/40 p-3 text-left active:scale-[0.99] transition-transform">
          <RankNo rank={myRow.rank} />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-blue-200">내 순위</div>
            <div className="font-bold text-foreground truncate">{myRow.name} · {myRow.totalStats.toLocaleString()}</div>
          </div>
          <span className="flex items-center gap-1 text-xs text-blue-200 font-semibold"><Crosshair className="w-4 h-4" />위치로</span>
        </button>
      )}

      {/* 검색 / 필터 */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="선수 이름 검색" className="pl-9 h-11 rounded-xl bg-card" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "terran", "zerg", "protoss"] as const).map(r => (
            <button key={r} onClick={() => { setRace(r); setLimit(PAGE); }}
              className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", race === r ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>
              {r === "all" ? "전체" : RACE_LABELS[r]}
            </button>
          ))}
          <button onClick={() => setHumansOnly(v => !v)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", humansOnly ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>
            👤 유저만
          </button>
          <span className="ml-auto self-center text-xs text-muted-foreground">{filtered.length}명</span>
        </div>
      </div>

      {/* 목록 */}
      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {filtered.slice(0, limit).map(r => {
          const isMe = r.playerId === me?.id;
          const expanded = open === r.playerId;
          const record = r.totalGames ? `${r.wins}승 ${r.losses}패` : "전적 없음";
          return (
            <div key={r.playerId} id={`rank-${r.playerId}`} className={cn(isMe && "bg-blue-500/15")}>
              <button onClick={() => setOpen(expanded ? null : r.playerId)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                <RankNo rank={r.rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-bold truncate", isMe ? "text-blue-200" : "text-foreground")}>{r.name}</span>
                    {r.isBot && <span className="text-[9px] font-bold px-1 rounded bg-purple-500/30 text-purple-200">AI</span>}
                    {isMe && <span className="text-[9px] font-bold px-1 rounded bg-blue-500/40 text-blue-100">나</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    <span style={{ color: RACE_COLORS[r.race] }} className="font-semibold">{RACE_LABELS[r.race]}</span> · Lv.{r.level} · {record}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black" style={{ color: GRADE_COLORS[r.grade as Grade] }}>{r.grade}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{r.totalStats.toLocaleString()}</div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {STAT_KEYS.map(k => (
                      <div key={k} className="rounded-lg bg-muted/70 px-2 py-1.5 text-center">
                        <div className="text-[10px] text-muted-foreground">{STAT_LABELS[k]}</div>
                        <div className="text-sm font-bold text-foreground">{(r as any)[k]}</div>
                      </div>
                    ))}
                  </div>
                  {!isMe && me && <HeadToHead opponentId={r.playerId} />}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">검색 결과가 없습니다</div>}
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit(l => l + PAGE)} className="w-full py-3 rounded-xl bg-card border border-border text-sm font-semibold text-foreground">
          더 보기 ({filtered.length - limit}명 남음)
        </button>
      )}
    </div>
  );
}
