/**
 * 선수 키우기: 클랜 (검색 · 입단 조건 · 입단 시험 · 클랜 연습 · 클랜 내 랭킹 · 클랜원 프로필·친분도)
 */
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import {
  CLANS, CLAN_BY_ID, CLAN_RETRY_DAYS, CLAN_STRENGTH, DAY_SLOTS, FRIEND_LEVELS, RACE_NAMES, friendLevel, sumStats, withTag,
  type ClanDef, type ClanMember, type RookieState,
} from "@shared/rookie/model";
import { clanMembers, clanProIds, proLabel } from "@shared/rookie/pros";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PlayedGame } from "../../../../server/rookie/logic";
import { useRookieSync, type RookieToday } from "@/lib/rookie";
import { LegacyRadar, PlayerPhoto } from "@/components/legacy/Legacy";

const roster = (c: ClanDef): ClanMember[] => clanMembers(c.id);
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/** 입단 조건 하나하나 (충족 여부) */
function reqs(s: RookieState, c: ClanDef) {
  const games = s.record.w + s.record.l, lg = s.ladder.w + s.ladder.l, total = sumStats(s.stats);
  const out: Array<{ label: string; ok: boolean }> = [];
  if (c.req.games) out.push({ label: `경기 ${c.req.games}+ (${games})`, ok: games >= c.req.games });
  if (c.req.ladderGames) out.push({ label: `래더 ${c.req.ladderGames}판+ (${lg})`, ok: lg >= c.req.ladderGames });
  if (c.req.ladder) out.push({ label: `래더 최고 ${c.req.ladder}+ (${s.ladder.best})`, ok: s.ladder.best >= c.req.ladder });
  if (c.req.total) out.push({ label: `능력치 ${c.req.total.toLocaleString()}+ (${total.toLocaleString()})`, ok: total >= c.req.total });
  return out;
}

export function ClanView({ s, onPlayed, onBatch }: { s: RookieState; onPlayed: (games: PlayedGame[], title: string) => void; onBatch: () => void }) {
  const sync = useRookieSync();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [browse, setBrowse] = useState(!s.clan);
  const done = (title: string) => ({ onSuccess: (r: { state: RookieState; today: RookieToday; result: unknown; gained?: string[] }) => { sync.onSuccess(r); const g = (r.result as { games?: PlayedGame[] }).games; if (g?.length) onPlayed(g, title); }, onError: sync.onError });
  const test = trpc.rookie.clanTest.useMutation(done("클랜 입단 시험"));
  const practice = trpc.rookie.clanPractice.useMutation(done("클랜 연습"));
  const leave = trpc.rookie.leaveClan.useMutation(sync);
  const feedback = trpc.rookie.clanFeedback.useMutation({ ...sync, onSuccess: (r: { state: RookieState; today: RookieToday; result: unknown; gained?: string[] }) => { sync.onSuccess(r); const b = (r.result as { back: Record<string, number> }).back; toast.success(`피드백 효과! ${Object.entries(b).map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS]} +${v}`).join(", ") || "되찾을 능력치가 없었습니다"} (컨디션 -10)`); } });
  const [view, setView] = useState<string | null>(null);
  const [tier, setTier] = useState<number>(0);
  const left = DAY_SLOTS - s.used;
  const mine = s.clan ? CLAN_BY_ID[s.clan.id] : undefined;
  const list = CLANS.filter(c => (!tier || c.tier === tier) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.tag.toLowerCase().includes(q.toLowerCase()) || c.desc.includes(q)));

  return (
    <div className="space-y-3">
      {s.clan && mine && (() => {
        const me: ClanMember & { me?: boolean } = { name: s.name, race: s.race, stats: s.stats, points: s.clan.points, w: s.clan.w, l: s.clan.l, me: true };
        const fb = s.clan.fb;
        const vs = s.clan.vs ?? {};
        const vsAll = Object.values(vs).reduce((a, [w, l]) => [a[0] + w, a[1] + l], [0, 0]);
        const ranking = [...s.clan.members, me].sort((a, b) => b.points - a.points);
        const rank = ranking.findIndex(m => (m as { me?: boolean }).me) + 1;
        return (
          <>
            <div className="rounded-2xl border border-emerald-400/50 p-3.5" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.03))" }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🛡️</span>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-foreground">{mine.name} <span className="text-xs text-emerald-300">[{mine.tag}]</span></div>
                  <div className="text-[11px] text-amber-300">{stars(mine.tier)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">클랜 내 순위</div>
                  <div className="font-black text-lg text-foreground">{rank}<span className="text-xs text-muted-foreground">/{ranking.length}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2 text-center">
                <div className="rounded-lg bg-black/20 py-1"><div className="text-[10px] text-muted-foreground">내 점수</div><div className="font-black text-foreground">{s.clan.points}</div></div>
                <div className="rounded-lg bg-black/20 py-1"><div className="text-[10px] text-muted-foreground">클랜 연습 전적</div><div className="font-black"><span className="text-emerald-300">{s.clan.w}승</span> <span className="text-rose-300">{s.clan.l}패</span></div></div>
                <div className="rounded-lg bg-black/20 py-1"><div className="text-[10px] text-muted-foreground">승률</div><div className="font-black text-foreground">{s.clan.w + s.clan.l ? Math.round((s.clan.w / (s.clan.w + s.clan.l)) * 100) : 0}%</div></div>
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">이기면 +10점, 지면 -6점 (상대 클랜원은 반대로) · 래더 승 +5 / 패 -3 · 프로 {s.clan.members.filter(m => m.pro).length}명{vsAll[0] + vsAll[1] ? ` · 클랜원 상대 ${vsAll[0]}승 ${vsAll[1]}패` : ""}</div>
              <div className="text-[10.5px] text-muted-foreground">클랜 연습은 조언을 들어 1.3배(프로 상대 1.5배)로 배웁니다. {mine.pros.length > 0 ? "클랜 순위 3위 안이면 프로 선배가 구단에 추천해 주기도 해요." : ""}</div>
              {fb && Object.keys(fb.lost).length > 0 && (
                <button onClick={() => feedback.mutate()} disabled={feedback.isPending || s.cond < 20} className="mt-2 w-full rounded-xl border border-amber-400/70 bg-amber-500/10 text-amber-200 py-2 text-[12.5px] font-black disabled:opacity-40">
                  🗣️ 피드백 받기 ({Object.entries(fb.lost).map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS]} -${v}`).join(" ")} 일부 회복 · 컨디션 -10)
                </button>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => practice.mutate()} disabled={practice.isPending || left < 1} className="rounded-xl border border-emerald-500 text-emerald-300 py-2 text-sm font-black disabled:opacity-40">⚔️ 1판</button>
                <button onClick={onBatch} disabled={left < 1} className="rounded-xl bg-emerald-600 text-white py-2 text-sm font-black disabled:opacity-40">⏩ {left}판 연속</button>
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border">
              <div className="px-3 pt-2.5 pb-1 flex items-center text-sm font-bold text-foreground"><span className="flex-1">🏅 클랜 랭킹</span><span className="w-[64px] text-center text-[10px] text-muted-foreground font-normal">전체 전적</span><span className="w-[52px] text-center text-[10px] text-muted-foreground font-normal">나와</span><span className="w-[44px] text-right text-[10px] text-muted-foreground font-normal">점수</span></div>
              <div className="divide-y divide-border max-h-[340px] overflow-y-auto">
                {ranking.map((m, i) => (
                  <button key={i} disabled={(m as { me?: boolean }).me} onClick={() => setView(m.name)} className={cn("w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm", (m as { me?: boolean }).me ? "bg-primary/15" : "active:bg-muted/40")}>
                    <span className={cn("w-6 text-center font-black", i < 3 ? "text-amber-300" : "text-muted-foreground")}>{i + 1}</span>
                    <span className="flex-1 truncate text-foreground">{m.pro ? <span className="text-sky-300 text-[10px] mr-1">PRO {ORIG_TEAMS[m.pro.team]?.short}</span> : null}{withTag(m.name, mine.tag)}{m.real ? <span className="text-[10.5px] text-muted-foreground">({m.real})</span> : null}{(m as { me?: boolean }).me ? " (나)" : ""} <span className="text-[10px] text-muted-foreground">{RACE_NAMES[m.race].slice(0, 1)}</span>{!(m as { me?: boolean }).me && (s.clan!.fr?.[m.name] ?? 0) >= 10 ? <span className="ml-1 text-[10px]">{friendLevel(s.clan!.fr![m.name])[2]}</span> : null}</span>
                    <span className="w-[64px] text-center text-[11px]"><span className="text-emerald-300">{m.w ?? 0}</span>-<span className="text-rose-300">{m.l ?? 0}</span></span>
                    <span className="w-[52px] text-center text-[11px] text-muted-foreground">{(m as { me?: boolean }).me ? "" : vs[m.name] ? `${vs[m.name][0]}-${vs[m.name][1]}` : "-"}</span>
                    <span className="w-[44px] text-right font-bold text-foreground">{m.points.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {s.clan && mine && <MemberSheet s={s} name={view} onClose={() => setView(null)} onPractice={n => { setView(null); practice.mutate({ target: n }); }} busy={practice.isPending || left < 1} />}
      {s.clan && mine && <button onClick={() => confirm(`${mine.name}에서 탈퇴할까요? (점수가 사라집니다)`) && leave.mutate()} className="w-full text-[11px] text-rose-300/80 py-0.5">🚪 클랜 탈퇴</button>}
      {s.clan && !browse && <button onClick={() => setBrowse(true)} className="w-full rounded-xl border border-border bg-card py-2 text-sm text-muted-foreground">🔍 다른 클랜 찾아보기 ▼</button>}
      {browse && <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="text-sm font-bold text-foreground">🔍 클랜 찾기 {s.clan ? <span className="text-[10.5px] text-muted-foreground font-normal">(다른 클랜에 붙으면 지금 클랜은 탈퇴)</span> : null}</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="클랜 이름·태그로 검색" className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground" />
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setTier(n)} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", tier === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>{n ? `${n}단계` : "전체"}</button>
          ))}
          <span className="ml-auto text-[10.5px] text-muted-foreground self-center">{list.length}곳</span>
        </div>
        <div className="space-y-1.5">
          {list.map(c => {
            const rs = reqs(s, c);
            const ok = rs.every(r => r.ok);
            const tried = s.clanTried[c.id];
            const wait = tried !== undefined && s.day - tried < CLAN_RETRY_DAYS ? CLAN_RETRY_DAYS - (s.day - tried) : 0;
            const isMine = s.clan?.id === c.id;
            return (
              <div key={c.id} className={cn("rounded-xl border px-2.5 py-2", isMine ? "border-emerald-400/60 bg-emerald-500/10" : "border-border bg-muted/20")}>
                <button className="w-full text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-foreground">{c.name}</span><span className="text-[10.5px] text-muted-foreground">[{c.tag}]</span>
                    <span className="text-[10.5px] text-amber-300">{stars(c.tier)}</span>
                    <span className="ml-auto text-[10.5px] text-muted-foreground">{c.size}명{clanProIds(c.id).length ? ` · 프로 ${clanProIds(c.id).length}` : ""} {open === c.id ? "▲" : "▼"}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{c.desc} · 실력 {CLAN_STRENGTH[c.tier][0].toLocaleString()}~{CLAN_STRENGTH[c.tier][1].toLocaleString()}</div>
                  {clanProIds(c.id).length > 0 && <div className="text-[11px] text-sky-300 truncate">소속 프로: {clanProIds(c.id).slice(0, 4).map(proLabel).join(" · ")}{clanProIds(c.id).length > 4 ? ` 외 ${clanProIds(c.id).length - 4}명` : ""}</div>}
                </button>
                {rs.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{rs.map(r => <span key={r.label} className={cn("text-[10px] rounded-full px-1.5 py-0.5 border", r.ok ? "border-emerald-400/50 text-emerald-300" : "border-rose-400/50 text-rose-300")}>{r.ok ? "✓" : "✗"} {r.label}</span>)}</div>}
                {open === c.id && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1">
                    {roster(c).sort((a, b) => (b.pro ? 1e6 : 0) + b.points - ((a.pro ? 1e6 : 0) + a.points)).slice(0, 12).map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-foreground">
                        <PlayerPhoto id={m.pro ? m.pro.id : -1} name={m.name} size={22} />
                        <span className="truncate">{m.pro ? <b className="text-sky-300">PRO </b> : null}{withTag(m.name, c.tag)}{m.real ? <span className="text-muted-foreground">({m.real})</span> : null}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!isMine && (ok || wait > 0) && (
                  <button onClick={() => test.mutate({ id: c.id })} disabled={!ok || wait > 0 || test.isPending || left < 3}
                    className="mt-1.5 w-full rounded-lg bg-amber-500 text-black text-xs font-black py-1.5 disabled:opacity-40">
                    {wait ? `${wait}일 뒤 재도전` : "📝 입단 시험 (클랜원과 3판 2선승 · 행동 3)"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

/** 클랜원 정보: 능력치 · 전적 · 나와의 전적 · 친분도 */
function MemberSheet({ s, name, onClose, onPractice, busy }: { s: RookieState; name: string | null; onClose: () => void; onPractice: (name: string) => void; busy: boolean }) {
  const c = s.clan ? CLAN_BY_ID[s.clan.id] : undefined;
  const m = name && s.clan ? s.clan.members.find(x => x.name === name) : undefined;
  const fr = m ? s.clan?.fr?.[m.name] ?? 0 : 0;
  const lv = friendLevel(fr);
  const next = FRIEND_LEVELS.find(l => l[0] > fr);
  const vs = m ? s.clan?.vs?.[m.name] : undefined;
  const rank = m && s.clan ? [...s.clan.members, { points: s.clan.points } as ClanMember].sort((a, b) => b.points - a.points).findIndex(x => x === m) + 1 : 0;
  const total = m ? sumStats(m.stats) : 0;
  return (
    <Sheet open={!!m} onOpenChange={o => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl bg-sidebar border-sidebar-border max-h-[88vh] overflow-y-auto">
        {m && c && (
          <div className="p-4 space-y-3">
            <SheetHeader className="p-0">
              <SheetTitle className="flex items-center gap-2 text-left">
                <PlayerPhoto id={m.pro ? m.pro.id : -1} name={m.name} size={48} />
                <div className="min-w-0">
                  <div className="font-black text-lg truncate">{withTag(m.name, c.tag)}{m.role === "master" ? " 👑" : m.role === "sub" ? " 🎖️" : ""}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">{m.real ? `${m.real} · ` : ""}{RACE_NAMES[m.race]}{m.pro ? ` · 프로 ${ORIG_TEAMS[m.pro.team]?.short}` : " · 아마추어"} · 클랜 내 {rank}위</div>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[["능력치", total.toLocaleString()], ["점수", m.points.toLocaleString()], ["전적", `${m.w ?? 0}승 ${m.l ?? 0}패`], ["나와", vs ? `${vs[0]}승 ${vs[1]}패` : "-"]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-[12.5px] font-bold text-foreground">{v}</div></div>
              ))}
            </div>
            <div className="rounded-xl bg-muted/50 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">{lv[2]} 친분도 · {lv[1]}</span>
                <span className="text-muted-foreground">{fr}/100</span>
              </div>
              <div className="h-2 rounded-full bg-black/30 mt-1 overflow-hidden"><div className="h-full bg-pink-400" style={{ width: `${fr}%` }} /></div>
              <div className="text-[10.5px] text-muted-foreground mt-1">{next ? `${next[1]}까지 ${next[0] - fr}` : "최고 친분!"} · 같이 연습하고 피드백을 주고받을수록 올라갑니다 (앞으로 친분도로 할 수 있는 일이 늘어납니다)</div>
            </div>
            <div className="rounded-xl bg-black p-2 flex items-center gap-2">
              <LegacyRadar stats={m.stats} level={1} size={120} />
              <div className="flex-1 grid grid-cols-1 text-[12px] text-white">
                {STAT_KEYS.map(k => (
                  <div key={k} className="flex justify-between border-b border-neutral-800 py-[1px]"><span className="text-neutral-300">{STAT_LABELS[k]}</span><b>{m.stats[k]}</b></div>
                ))}
              </div>
            </div>
            <button onClick={() => onPractice(m.name)} disabled={busy} className="w-full rounded-xl bg-emerald-600 text-white py-2.5 font-black disabled:opacity-40">⚔️ {m.name} 님과 연습 (1판)</button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
