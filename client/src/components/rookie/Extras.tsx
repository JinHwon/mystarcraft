/**
 * 선수 키우기 추가 화면: 라이벌 · 멘토 과외 · 팬카페 · 업적/칭호 · 랭킹 보드 · 연봉 협상
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import {
  ACHIEVEMENTS, ACH_BY_ID, CONCEPTS, DAY_SLOTS, GRADE_COLOR, MENTOR_PRICE, RACE_NAMES, RANK_SORTS, STATUS_NAMES,
  dateText, ladderGrade, sumStats, type RankSort, type RookieState,
} from "@shared/rookie/model";
import { initialPlayers } from "@shared/career/init";
import { useRookieSync } from "@/lib/rookie";
import { PlayerPhoto, TeamLogo } from "@/components/legacy/Legacy";

const PROS = initialPlayers();

/** 칭호 뱃지 */
export function TitleBadge({ id, className }: { id?: string; className?: string }) {
  const a = id ? ACH_BY_ID[id] : undefined;
  if (!a) return null;
  return <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 bg-amber-400/20 text-amber-200 border border-amber-400/40 whitespace-nowrap", className)}>{a.icon} {a.title}</span>;
}

/** 슬럼프·각성 표시 */
export function FormBadge({ s }: { s: RookieState }) {
  if (!s.form) return s.streak >= 3 ? <span className="text-[10px] text-emerald-300">🔥{s.streak}연승</span> : s.streak <= -3 ? <span className="text-[10px] text-rose-300">💧{-s.streak}연패</span> : null;
  const left = s.form.until - s.day + 1;
  return s.form.kind === "slump"
    ? <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-rose-500/20 text-rose-200 border border-rose-400/40">😞 슬럼프 {left}일</span>
    : <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-sky-500/20 text-sky-200 border border-sky-400/40">🦅 각성 {left}일</span>;
}

// ── 라이벌 ────────────────────────────────────────────────────
const rivalStatus = (r: RookieState["rival"]) => r.status === "pro" && r.team !== undefined ? `${ORIG_TEAMS[r.team].short} ${r.squad}군` : STATUS_NAMES[r.status];
export function RivalCard({ s }: { s: RookieState }) {
  const r = s.rival;
  const me = sumStats(s.stats), them = sumStats(r.stats);
  const ahead = me - them;
  return (
    <div className="rounded-2xl border border-violet-400/40 bg-violet-500/10 p-3">
      <div className="flex items-center gap-2.5">
        <PlayerPhoto id={-1} name={r.name} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-violet-300 font-bold">⚡ 라이벌</div>
          <div className="font-black text-foreground truncate">{r.name} <span className="text-[11px] text-muted-foreground font-normal">{RACE_NAMES[r.race]} · {CONCEPTS[r.concept].name} · {rivalStatus(r)}</span></div>
          <div className="text-[11px] text-muted-foreground">능력치 {them.toLocaleString()} <span className={ahead >= 0 ? "text-emerald-300" : "text-rose-300"}>({ahead >= 0 ? `내가 ${ahead} 앞섬` : `${-ahead} 뒤처짐`})</span></div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">상대 전적</div>
          <div className="font-black"><span className="text-emerald-300">{r.w}</span><span className="text-muted-foreground"> : </span><span className="text-rose-300">{r.l}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── 멘토 과외 ─────────────────────────────────────────────────
export function MentorView({ s, busy, onAct }: { s: RookieState; busy: boolean; onAct: (a: { kind: "mentor"; stat: StatKey; pro: number }) => void }) {
  const [stat, setStat] = useState<StatKey>(STAT_KEYS[0]);
  const pool = s.team ? PROS.filter(p => p.team === s.team!.team) : PROS.filter(p => p.team < 12);
  const mentors = [...pool].sort((a, b) => b.stats[stat] - a.stats[stat]).slice(0, 3);
  const price = s.team ? MENTOR_PRICE.teammate : MENTOR_PRICE.outside;
  const doneToday = s.mentorDay === s.day;
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        프로 선수에게 과외를 받아 원하는 능력치를 집중적으로 올립니다 (오늘 하루 · {price}만원{s.team ? " · 같은 팀 선배라 싸게" : ""}).
        성장 한계 근처에서도 조금은 오르고, 그만큼 가장 높은 다른 능력치가 깎여 균형이 바뀝니다.
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {STAT_KEYS.map(k => (
          <button key={k} onClick={() => setStat(k)} className={cn("rounded-xl py-1.5 text-xs font-bold border", stat === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground")}>
            {STAT_LABELS[k]}<span className="block text-[10px] font-normal opacity-80">{s.stats[k]}</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {mentors.map(p => (
          <div key={p.id} className="rounded-2xl bg-card border border-border p-2.5 flex items-center gap-2.5">
            <PlayerPhoto id={p.id} name={p.name} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-black text-foreground">{p.name} <span className="text-[11px] text-muted-foreground font-normal">{ORIG_TEAMS[p.team].short} · {RACE_NAMES[p.race]}</span></div>
              <div className="text-[11.5px] text-muted-foreground">{STAT_LABELS[stat]} <b className="text-amber-300">{p.stats[stat]}</b> (나 {s.stats[stat]})</div>
            </div>
            <button onClick={() => onAct({ kind: "mentor", stat, pro: p.id })} disabled={busy || doneToday || s.money < price}
              className="shrink-0 rounded-xl bg-emerald-600 text-white text-xs font-black px-3 py-2 disabled:opacity-40">📚 과외</button>
          </div>
        ))}
      </div>
      {doneToday && <div className="text-xs text-amber-300 text-center">오늘은 이미 과외를 받았습니다</div>}
      <div className="text-[11px] text-muted-foreground text-center">지금까지 과외 {s.counts.mentors}번</div>
    </div>
  );
}

// ── 팬카페 · 커뮤니티 ─────────────────────────────────────────
export function FanView({ s }: { s: RookieState }) {
  const [tab, setTab] = useState<"cafe" | "sns">("cafe");
  const posts = s.fanCafe.posts.filter(p => p.src === tab);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-3.5 border border-pink-400/40" style={{ background: "linear-gradient(135deg, #4a2340, #1a1626)" }}>
        <div className="text-[11px] text-pink-200">💌 공식 팬카페</div>
        <div className="font-black text-lg text-white">{s.name} 팬카페</div>
        <div className="text-xs text-neutral-300">회원 <b className="text-pink-200">{s.fanCafe.members.toLocaleString()}</b>명 · 인지도 {s.fame} · 방송 팬 {s.stream.fans}명</div>
        <div className="text-[10.5px] text-neutral-400 mt-1">회원이 많을수록 방송 시청자가 늘고 인지도도 조금씩 오릅니다. 악플이 달리면 사기가 조금 떨어져요.</div>
      </div>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border">
        {([["cafe", "💌 팬카페"], ["sns", "💬 커뮤니티 반응"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("py-1.5 rounded-lg text-sm font-bold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {!posts.length && <div className="text-sm text-muted-foreground text-center py-6">아직 글이 없습니다. 대회·래더에서 활약하면 반응이 올라와요!</div>}
      <div className="space-y-1.5">
        {posts.slice(0, 40).map((p, i) => (
          <div key={i} className={cn("rounded-xl border p-2.5", p.mood === "bad" ? "border-rose-400/30 bg-rose-500/5" : p.mood === "good" ? "border-border bg-card" : "border-border bg-muted/30")}>
            <div className="flex justify-between text-[10.5px] text-muted-foreground"><span className="font-bold">{p.author}</span><span>{dateText(p.day).slice(2)}</span></div>
            <div className="text-[13px] text-foreground">{p.text}</div>
            <div className="text-[10.5px] text-muted-foreground mt-0.5">{tab === "cafe" ? "❤️" : "👍"} {p.likes}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 업적 · 칭호 ───────────────────────────────────────────────
export function AchView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const setTitle = trpc.rookie.setTitle.useMutation(sync);
  const got = Object.keys(s.achievements).length;
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">업적을 달성하면 칭호를 얻습니다 ({got}/{ACHIEVEMENTS.length}). 칭호를 누르면 이름 옆과 랭킹 보드에 달립니다.</div>
      <div className="grid grid-cols-2 gap-1.5">
        {ACHIEVEMENTS.map(a => {
          const day = s.achievements[a.id];
          const has = day !== undefined;
          const on = s.title === a.id;
          return (
            <button key={a.id} disabled={!has || setTitle.isPending} onClick={() => setTitle.mutate({ id: on ? null : a.id })}
              className={cn("rounded-xl border p-2 text-left", on ? "border-amber-400 bg-amber-500/15" : has ? "border-border bg-card" : "border-border/50 bg-muted/20 opacity-60")}>
              <div className="flex items-center gap-1.5">
                <span className={cn("text-xl", !has && "grayscale")}>{a.icon}</span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-black text-foreground truncate">{a.name}</div>
                  <div className="text-[10px] text-amber-300 truncate">「{a.title}」{on ? " · 장착 중" : ""}</div>
                </div>
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-0.5">{has ? `✅ ${dateText(day)}` : a.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 랭킹 보드 ─────────────────────────────────────────────────
export function RankView() {
  const [sort, setSort] = useState<RankSort>("ladder");
  const q = trpc.rookie.ranking.useQuery({ sort }, { staleTime: 30_000 });
  const val = (r: { ladder: number; total: number; fame: number; badges: number }) => sort === "ladder" ? `${r.ladder} (${ladderGrade(r.ladder)})` : sort === "badges" ? `${r.badges}개` : r[sort].toLocaleString();
  const statusText = (r: { status: string; team: number | null }) => r.status === "fa" ? "FA" : r.team !== null ? ORIG_TEAMS[r.team]?.short ?? "" : STATUS_NAMES[r.status as keyof typeof STATUS_NAMES] ?? "";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-card border border-border">
        {(Object.keys(RANK_SORTS) as RankSort[]).map(k => (
          <button key={k} onClick={() => setSort(k)} className={cn("py-1.5 rounded-lg text-sm font-bold", sort === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{RANK_SORTS[k]}</button>
        ))}
      </div>
      {q.data?.me && q.data.myRank !== null && (
        <div className="rounded-xl border border-primary/60 bg-primary/10 p-2.5 text-sm text-foreground">내 순위 <b className="text-primary">{q.data.myRank}위</b> · {val(q.data.me)}</div>
      )}
      {q.isLoading && <div className="text-sm text-muted-foreground text-center py-4">불러오는 중...</div>}
      <div className="rounded-2xl bg-card border border-border divide-y divide-border">
        {q.data?.rows.map((r, i) => (
          <div key={i} className={cn("flex items-center gap-2 px-2.5 py-2", r.me && "bg-primary/10")}>
            <span className={cn("w-6 text-center font-black", i < 3 ? "text-amber-300" : "text-muted-foreground")}>{i + 1}</span>
            {r.team !== null && ORIG_TEAMS[r.team] ? <TeamLogo team={ORIG_TEAMS[r.team]} className="w-[34px] h-[20px] shrink-0" /> : <span className="w-[34px] text-center text-[10px] text-muted-foreground shrink-0">{statusText(r)}</span>}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground truncate">{r.name}{r.me ? " (나)" : ""} <span className="text-[10.5px] text-muted-foreground font-normal">{RACE_NAMES[r.race as keyof typeof RACE_NAMES]?.slice(0, 1)}</span></div>
              {r.title && <div className="text-[10px] text-amber-300 truncate">「{r.title}」</div>}
            </div>
            <span className="text-sm font-black shrink-0" style={sort === "ladder" ? { color: GRADE_COLOR[ladderGrade(r.ladder)] } : undefined}>{val(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 연봉 협상 ─────────────────────────────────────────────────
export function NegoBox({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const n = s.nego!;
  const [ask, setAsk] = useState(String(Math.round(n.offer * 1.15)));
  const neg = trpc.rookie.negotiate.useMutation(sync);
  const accept = trpc.rookie.acceptNego.useMutation(sync);
  return (
    <div className="rounded-2xl border border-amber-400/60 bg-amber-500/10 p-3 space-y-2">
      <div className="text-sm font-black text-foreground">💼 연봉 협상 <span className="text-[11px] text-muted-foreground font-normal">· {dateText(n.until).slice(5)}까지 (답이 없으면 제시액으로 계약)</span></div>
      <div className="text-[12.5px] text-foreground">지금 월급 {n.old}만원 → 구단 제시 <b className="text-amber-300">{n.offer}만원</b></div>
      <div className="text-[11px] text-muted-foreground">더 달라고 할 수 있지만, 무리하게 3번 밀어붙이면 결렬되어 FA가 됩니다 (협상 {n.rounds}/3)</div>
      <div className="flex gap-2">
        <button onClick={() => accept.mutate()} disabled={accept.isPending} className="flex-1 rounded-xl bg-emerald-600 text-white text-sm font-black py-2">✍️ {n.offer}만원에 계약</button>
      </div>
      <div className="flex gap-2 items-center">
        <input value={ask} onChange={e => setAsk(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-24 rounded-lg bg-background border border-border px-2 py-1.5 text-sm text-foreground text-right" />
        <span className="text-sm text-muted-foreground">만원</span>
        <button onClick={() => neg.mutate({ ask: Number(ask) })} disabled={neg.isPending || !Number(ask)} className="flex-1 rounded-xl bg-amber-500 text-black text-sm font-black py-2 disabled:opacity-40">💬 이 금액 요구</button>
      </div>
    </div>
  );
}
