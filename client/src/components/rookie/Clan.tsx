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
  CLANS, CLAN_BY_ID, CLAN_RETRY_DAYS, CLAN_STRENGTH, DAY_GAMES, DOW, FRIEND_LEVELS, RACE_NAMES, dateText, friendLevel, sumStats, withTag, ymd,
  type ClanDef, type ClanMember, type RookieState,
} from "@shared/rookie/model";
import { clanMembers, clanProIds, proLabel } from "@shared/rookie/pros";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Activity } from "../../../../server/rookie/logic";
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

export function ClanView({ s, today, busy, onAct }: { s: RookieState; today: RookieToday; busy: boolean; onAct: (a: Activity, title: string) => void }) {
  const sync = useRookieSync();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [browse, setBrowse] = useState(!s.clan);
  const leave = trpc.rookie.leaveClan.useMutation(sync);
  const feedback = trpc.rookie.clanFeedback.useMutation({ ...sync, onSuccess: (r: { state: RookieState; today: RookieToday; result: unknown; gained?: string[] }) => { sync.onSuccess(r); const b = (r.result as { back: Record<string, number> }).back; toast.success(`피드백 효과! ${Object.entries(b).map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS]} +${v}`).join(", ") || "되찾을 능력치가 없었습니다"} (컨디션 -10)`); } });
  const [view, setView] = useState<string | null>(null);
  const [tier, setTier] = useState<number>(0);
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
              <div className="text-[10.5px] text-muted-foreground">클랜 연습은 조언을 들어 1.3배(프로 상대 1.5배)로 배웁니다. {clanProIds(mine.id).length > 0 ? "클랜 순위 3위 안이면 프로 선배가 구단에 추천해 주기도 해요." : ""}</div>
              {fb && Object.keys(fb.lost).length > 0 && (
                <button onClick={() => feedback.mutate()} disabled={feedback.isPending || s.cond < 20} className="mt-2 w-full rounded-xl border border-amber-400/70 bg-amber-500/10 text-amber-200 py-2 text-[12.5px] font-black disabled:opacity-40">
                  🗣️ 피드백 받기 ({Object.entries(fb.lost).map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS]} -${v}`).join(" ")} 일부 회복 · 컨디션 -10)
                </button>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => onAct({ kind: "clan", watch: 2 }, "클랜 연습")} disabled={busy} className="rounded-xl border border-emerald-500 text-emerald-300 py-2 text-sm font-black disabled:opacity-40">👀 중계 보며 {DAY_GAMES}판</button>
                <button onClick={() => onAct({ kind: "clan" }, "클랜 연습")} disabled={busy} className="rounded-xl bg-emerald-600 text-white py-2 text-sm font-black disabled:opacity-40">⚔️ 클랜 연습 {DAY_GAMES}판</button>
              </div>
            </div>
            <WarSection s={s} today={today} busy={busy} onAct={onAct} rank={rank} />
            <div className="rounded-2xl bg-card border border-border">
              <div className="px-3 pt-2.5 pb-1 flex items-center text-sm font-bold text-foreground"><span className="flex-1">🏅 클랜 랭킹</span><span className="w-[64px] text-center text-[10px] text-muted-foreground font-normal">전체 전적</span><span className="w-[52px] text-center text-[10px] text-muted-foreground font-normal">나와</span><span className="w-[44px] text-right text-[10px] text-muted-foreground font-normal">점수</span></div>
              <div className="divide-y divide-border max-h-[340px] overflow-y-auto">
                {ranking.map((m, i) => (
                  <button key={i} disabled={(m as { me?: boolean }).me} onClick={() => setView(m.name)} className={cn("w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm", (m as { me?: boolean }).me ? "bg-primary/15" : "active:bg-muted/40")}>
                    <span className={cn("w-6 text-center font-black", i < 3 ? "text-amber-300" : "text-muted-foreground")}>{i + 1}</span>
                    <span className="flex-1 truncate text-foreground">{m.pro ? <span className="text-sky-300 text-[10px] mr-1">PRO {ORIG_TEAMS[m.pro.team]?.short}</span> : null}{withTag(m.name, mine.tag)}{m.real ? <span className="text-[10.5px] text-muted-foreground">({m.real})</span> : null}{(m as { me?: boolean }).me ? ` (나${s.clan!.role === "master" ? " 👑" : s.clan!.role === "sub" ? " 🎖️" : ""})` : m.role === "master" ? " 👑" : m.role === "sub" ? " 🎖️" : ""} <span className="text-[10px] text-muted-foreground">{RACE_NAMES[m.race].slice(0, 1)}</span>{!(m as { me?: boolean }).me && (s.clan!.fr?.[m.name] ?? 0) >= 10 ? <span className="ml-1 text-[10px]">{friendLevel(s.clan!.fr![m.name])[2]}</span> : null}</span>
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

      {s.clan && mine && <MemberSheet s={s} name={view} onClose={() => setView(null)} onPractice={n => { setView(null); onAct({ kind: "clan", target: n }, "클랜 연습"); }} busy={busy} />}
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
                  <button onClick={() => onAct({ kind: "clanTest", id: c.id }, "클랜 입단 시험")} disabled={!ok || wait > 0 || busy}
                    className="mt-1.5 w-full rounded-lg bg-amber-500 text-black text-xs font-black py-1.5 disabled:opacity-40">
                    {wait ? `${wait}일 뒤 재도전` : "📝 입단 시험 (클랜원과 3판 2선승 · 하루)"}
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
            <button onClick={() => onPractice(m.name)} disabled={busy} className="w-full rounded-xl bg-emerald-600 text-white py-2.5 font-black disabled:opacity-40">⚔️ {m.name} 님과 연습 (오늘 하루)</button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** 클랜전: 일정 · 상대 전적 · 라이벌/친한 클랜 · 직책 */
function WarSection({ s, today, busy, onAct, rank }: { s: RookieState; today: RookieToday; busy: boolean; onAct: (a: Activity, title: string) => void; rank: number }) {
  const c = s.clan!;
  const info = today.clanWar;
  if (!info) return null;
  const rival = CLAN_BY_ID[info.rival], friend = CLAN_BY_ID[info.friend];
  const vs = c.vsClan ?? {};
  const rec = (id: string) => vs[id] ? `${vs[id][0]}승 ${vs[id][1]}패` : "전적 없음";
  const wins = Object.values(vs).reduce((a, [w]) => a + w, 0), losses = Object.values(vs).reduce((a, [, l]) => a + l, 0);
  const tenure = info.tenure;
  const need = !c.role ? { name: "부길드장", days: 60, rank: 4, wars: 2 } : c.role === "sub" ? { name: "길드장", days: 180, rank: 2, wars: 6 } : null;
  const Chk = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", ok ? "border-emerald-400/50 text-emerald-300" : "border-rose-400/50 text-rose-300")}>{ok ? "✓" : "✗"} {children}</span>;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-foreground flex-1">⚔️ 클랜전</span>
        <span className="text-[11px] text-muted-foreground">통산 {wins}승 {losses}패</span>
      </div>
      <div className="rounded-xl bg-muted/30 border border-border p-2 space-y-1">
        <div className="text-[12px] font-bold text-foreground">{c.role === "master" ? "👑 길드장" : c.role === "sub" ? "🎖️ 부길드장" : "🙂 클랜원"} <span className="text-[10.5px] text-muted-foreground font-normal">· 함께한 지 {tenure}일 · 클랜전 {info.warPlayed}회 출전</span></div>
        {need ? (
          <>
            <div className="flex flex-wrap gap-1"><Chk ok={tenure >= need.days}>{need.days}일 (지금 {tenure})</Chk><Chk ok={rank <= need.rank}>클랜 내 {need.rank}위 안 (지금 {rank})</Chk><Chk ok={info.warPlayed >= need.wars}>클랜전 {need.wars}회 (지금 {info.warPlayed})</Chk></div>
            <div className="text-[10.5px] text-muted-foreground">오래 활동하고 클랜 안에서 순위가 높으면 매달 1일 {need.name}으로 추대될 수 있어요.</div>
          </>
        ) : <div className="text-[10.5px] text-muted-foreground">길드장은 클랜전 엔트리를 직접 짭니다. 길드장이 클랜을 떠나면 부길드장이 이어받아요.</div>}
      </div>
      <div className="space-y-1">
        <div className="text-[12px] font-bold text-foreground">📅 다음 클랜전</div>
        {info.schedule.map((w, i) => {
          const oc = CLAN_BY_ID[w.opp];
          return (
            <div key={w.k} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px]", i === 0 ? "border-amber-400/50 bg-amber-500/10" : "border-border bg-muted/20")}>
              <span className="w-[66px] shrink-0 text-muted-foreground">{dateText(w.day).slice(5)} ({DOW[ymd(w.day).dow]})</span>
              <span className="flex-1 min-w-0 truncate text-foreground">[{oc.tag}] {oc.name} <span className="text-[10px] text-amber-300">{stars(oc.tier)}</span></span>
              {w.opp === info.rival && <span className="text-[10px] text-rose-300 shrink-0">🔥 라이벌</span>}
              <span className="text-[10.5px] text-muted-foreground shrink-0">D-{w.day - s.day}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/5 p-2">
          <div className="text-[10.5px] text-rose-300 font-bold">🔥 라이벌 클랜</div>
          <div className="text-[12.5px] font-black text-foreground truncate">[{rival.tag}] {rival.name}</div>
          <div className="text-[10.5px] text-muted-foreground">{rec(rival.id)}</div>
        </div>
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-2">
          <div className="text-[10.5px] text-emerald-300 font-bold">🤝 친한 클랜</div>
          <div className="text-[12.5px] font-black text-foreground truncate">[{friend.tag}] {friend.name}</div>
          <div className="text-[10.5px] text-muted-foreground">친선경기 {c.friendly ? `${c.friendly[0]}승 ${c.friendly[1]}패` : "아직 없음"}</div>
        </div>
      </div>
      <button onClick={() => onAct({ kind: "friendly" }, "친선경기")} disabled={busy} className="w-full rounded-xl border border-emerald-500 text-emerald-300 py-2 text-[12.5px] font-black disabled:opacity-40">🤝 {friend.name}과 친선경기 (오늘 하루 · {DAY_GAMES}판)</button>
      {Object.keys(vs).length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[12px] font-bold text-foreground">📊 클랜별 상대 전적</div>
          {Object.entries(vs).sort((a, b) => b[1][0] + b[1][1] - (a[1][0] + a[1][1])).map(([id, [w, l]]) => (
            <div key={id} className="flex items-center gap-2 text-[11.5px]">
              <span className="flex-1 truncate text-foreground">[{CLAN_BY_ID[id]?.tag}] {CLAN_BY_ID[id]?.name}{id === info.rival ? " 🔥" : id === info.friend ? " 🤝" : ""}</span>
              <span><b className="text-emerald-300">{w}</b>승 <b className="text-rose-300">{l}</b>패</span>
            </div>
          ))}
        </div>
      )}
      {(c.wars?.length ?? 0) > 0 && (
        <div className="space-y-0.5">
          <div className="text-[12px] font-bold text-foreground">🗒️ 최근 클랜전</div>
          {c.wars!.slice(0, 5).map(w => (
            <div key={w.k} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-[56px] shrink-0 text-muted-foreground">{dateText(w.day).slice(5)}</span>
              <span className="flex-1 truncate text-foreground">vs [{CLAN_BY_ID[w.opp]?.tag}] {w.played ? "" : <span className="text-[10px] text-muted-foreground">(관전)</span>}</span>
              <b className={w.my > w.their ? "text-emerald-300" : "text-rose-300"}>{w.my}:{w.their} {w.my > w.their ? "승" : "패"}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
