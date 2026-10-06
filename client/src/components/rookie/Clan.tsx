/**
 * 선수 키우기: 클랜 (검색 · 입단 조건 · 입단 시험 · 클랜 연습 · 클랜 내 랭킹)
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { initialPlayers } from "@shared/career/init";
import {
  CLANS, CLAN_BY_ID, CLAN_RETRY_DAYS, CLAN_STRENGTH, DAY_SLOTS, RACE_NAMES, clanRoster, sumStats,
  type ClanDef, type ClanMember, type RookieState,
} from "@shared/rookie/model";
import type { PlayedGame } from "../../../../server/rookie/logic";
import { useRookieSync, type RookieToday } from "@/lib/rookie";
import { PlayerPhoto } from "@/components/legacy/Legacy";

const PROS = initialPlayers();
const proIdByName = (name: string) => PROS.find(p => p.name === name)?.id;
function roster(c: ClanDef): ClanMember[] {
  return clanRoster(c, proIdByName).map(m => {
    if (!m.pro) return m;
    const p = PROS[m.pro.id];
    return { ...m, name: p.name, race: p.race, stats: { ...p.stats }, pro: { id: p.id, team: p.team } };
  });
}
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

export function ClanView({ s, onPlayed }: { s: RookieState; onPlayed: (games: PlayedGame[], title: string) => void }) {
  const sync = useRookieSync();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [browse, setBrowse] = useState(!s.clan);
  const done = (title: string) => ({ onSuccess: (r: { state: RookieState; today: RookieToday; result: unknown; gained?: string[] }) => { sync.onSuccess(r); const g = (r.result as { games?: PlayedGame[] }).games; if (g?.length) onPlayed(g, title); }, onError: sync.onError });
  const test = trpc.rookie.clanTest.useMutation(done("클랜 입단 시험"));
  const practice = trpc.rookie.clanPractice.useMutation(done("클랜 연습"));
  const leave = trpc.rookie.leaveClan.useMutation(sync);
  const left = DAY_SLOTS - s.used;
  const mine = s.clan ? CLAN_BY_ID[s.clan.id] : undefined;
  const list = CLANS.filter(c => !q || c.name.includes(q) || c.tag.toLowerCase().includes(q.toLowerCase()) || c.desc.includes(q));

  return (
    <div className="space-y-3">
      {s.clan && mine && (() => {
        const me: ClanMember & { me?: boolean } = { name: s.name, race: s.race, stats: s.stats, points: s.clan.points, me: true };
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
              <div className="text-[11.5px] text-muted-foreground mt-1">내 점수 {s.clan.points} · 클랜 연습 {s.clan.w}승 {s.clan.l}패 · 프로 {s.clan.members.filter(m => m.pro).length}명</div>
              <div className="text-[10.5px] text-muted-foreground">클랜 연습은 조언을 들어 1.3배(프로 상대 1.5배)로 배웁니다. {mine.pros.length > 0 ? "클랜 순위 3위 안이면 프로 선배가 구단에 추천해 주기도 해요." : ""}</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => practice.mutate()} disabled={practice.isPending || left < 1} className="rounded-xl bg-emerald-600 text-white py-2 text-sm font-black disabled:opacity-40">⚔️ 클랜 연습 (행동 1)</button>
                <button onClick={() => confirm(`${mine.name}에서 탈퇴할까요? (점수가 사라집니다)`) && leave.mutate()} className="rounded-xl border border-rose-400/50 text-rose-300 py-2 text-sm font-bold">🚪 탈퇴</button>
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border">
              <div className="px-3 pt-2.5 pb-1 text-sm font-bold text-foreground">🏅 클랜 랭킹</div>
              <div className="divide-y divide-border max-h-[340px] overflow-y-auto">
                {ranking.map((m, i) => (
                  <div key={i} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", (m as { me?: boolean }).me && "bg-primary/15")}>
                    <span className={cn("w-6 text-center font-black", i < 3 ? "text-amber-300" : "text-muted-foreground")}>{i + 1}</span>
                    <span className="flex-1 truncate text-foreground">{m.pro ? <span className="text-sky-300 text-[10px] mr-1">PRO {ORIG_TEAMS[m.pro.team]?.short}</span> : null}{m.name}{(m as { me?: boolean }).me ? " (나)" : ""} <span className="text-[10px] text-muted-foreground">{RACE_NAMES[m.race].slice(0, 1)}</span></span>
                    <span className="font-bold text-foreground">{m.points.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {s.clan && !browse && <button onClick={() => setBrowse(true)} className="w-full rounded-xl border border-border bg-card py-2 text-sm text-muted-foreground">🔍 다른 클랜 찾아보기 ▼</button>}
      {browse && <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="text-sm font-bold text-foreground">🔍 클랜 찾기 {s.clan ? <span className="text-[10.5px] text-muted-foreground font-normal">(다른 클랜에 붙으면 지금 클랜은 탈퇴)</span> : null}</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="클랜 이름·태그로 검색" className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground" />
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
                    <span className="ml-auto text-[10.5px] text-muted-foreground">{c.size}명{c.pros.length ? ` · 프로 ${c.pros.length}` : ""} {open === c.id ? "▲" : "▼"}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{c.desc} · 실력 {CLAN_STRENGTH[c.tier][0].toLocaleString()}~{CLAN_STRENGTH[c.tier][1].toLocaleString()}</div>
                  {c.pros.length > 0 && <div className="text-[11px] text-sky-300 truncate">출신 프로: {c.pros.join(" · ")}</div>}
                </button>
                {rs.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{rs.map(r => <span key={r.label} className={cn("text-[10px] rounded-full px-1.5 py-0.5 border", r.ok ? "border-emerald-400/50 text-emerald-300" : "border-rose-400/50 text-rose-300")}>{r.ok ? "✓" : "✗"} {r.label}</span>)}</div>}
                {open === c.id && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1">
                    {roster(c).sort((a, b) => b.points - a.points).slice(0, 6).map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-foreground">
                        <PlayerPhoto id={m.pro ? m.pro.id : -1} name={m.name} size={22} />
                        <span className="truncate">{m.pro ? <b className="text-sky-300">PRO </b> : null}{m.name}</span>
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
