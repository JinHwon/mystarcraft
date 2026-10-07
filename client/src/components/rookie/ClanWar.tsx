/**
 * 선수 키우기: 클랜전 — 길드장이 엔트리를 짜고, 5세트 3선승으로 한 세트씩 (내 세트는 직접, 나머지는 관전)
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { CLAN_BY_ID, RACE_NAMES, WAR_SETS, clanRelations, sumStats, withTag, type ClanMember, type ClanWar, type RookieState } from "@shared/rookie/model";
import { PlayerPhoto } from "@/components/legacy/Legacy";

const label = (m: ClanMember, tag: string) => `${withTag(m.name, tag)}${m.real ? `(${m.real})` : ""}`;
const total = (m: ClanMember) => sumStats(m.stats);

/** 길드장(나)이 엔트리를 고르는 화면 */
function EntryPicker({ s, war, busy, onSubmit }: { s: RookieState; war: ClanWar; busy: boolean; onSubmit: (names: string[]) => void }) {
  const clan = CLAN_BY_ID[s.clan!.id];
  const me: ClanMember = { name: s.name, race: s.race, stats: s.stats, points: s.clan!.points };
  const all = [...s.clan!.members, me].sort((a, b) => total(b) - total(a));
  const suggest = all.slice(0, WAR_SETS).map(m => m.name);
  const [sel, setSel] = useState<string[]>(suggest);
  const opp = CLAN_BY_ID[war.oppClan];
  const toggle = (n: string) => setSel(sel.includes(n) ? sel.filter(x => x !== n) : sel.length < WAR_SETS ? [...sel, n] : sel);
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-2.5 text-[12px] text-foreground">
        👑 길드장은 엔트리를 직접 짭니다. {WAR_SETS}명을 고르면 고른 순서대로 1~{WAR_SETS}세트에 나갑니다. 상대 [{opp.tag}]의 엔트리는 아래와 같아요.
      </div>
      <div className="rounded-xl bg-card border border-border p-2 space-y-0.5">
        {war.opp.map((m, i) => <div key={i} className="flex items-center gap-1.5 text-[11.5px]"><span className="w-5 text-muted-foreground">{i + 1}</span><span className="flex-1 truncate text-foreground">{label(m, opp.tag)} <span className="text-muted-foreground">{RACE_NAMES[m.race].slice(0, 1)}</span></span><b className="text-muted-foreground">{total(m).toLocaleString()}</b></div>)}
        <div className="text-[10px] text-muted-foreground pt-0.5">상대 엔트리는 세트 순서와 상관없이 섞여 나옵니다 (1세트부터 위에서 아래로)</div>
      </div>
      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border divide-y divide-border bg-card">
        {all.map(m => {
          const idx = sel.indexOf(m.name);
          return (
            <button key={m.name} onClick={() => toggle(m.name)} className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 text-left", idx >= 0 && "bg-primary/15")}>
              <span className={cn("w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-black shrink-0", idx >= 0 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>{idx >= 0 ? idx + 1 : ""}</span>
              <span className="flex-1 min-w-0 truncate text-[12.5px] text-foreground">{m === me ? `${withTag(s.name, clan.tag)} (나)` : label(m, clan.tag)}{m.pro ? <span className="ml-1 text-[10px] text-sky-300">PRO {ORIG_TEAMS[m.pro.team]?.short}</span> : null}{m.role ? <span className="ml-1 text-[10px]">{m.role === "master" ? "👑" : "🎖️"}</span> : null} <span className="text-[10px] text-muted-foreground">{RACE_NAMES[m.race].slice(0, 1)}</span></span>
              <b className="text-[12px] text-muted-foreground">{total(m).toLocaleString()}</b>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSel(suggest)} className="rounded-xl border border-border text-foreground py-2 text-sm font-bold">추천 엔트리</button>
        <button onClick={() => onSubmit(sel)} disabled={busy || sel.length !== WAR_SETS} className="rounded-xl bg-primary text-primary-foreground py-2 text-sm font-black disabled:opacity-40">엔트리 제출 ({sel.length}/{WAR_SETS})</button>
      </div>
    </div>
  );
}

/** 진행 중인 클랜전 */
export function ClanWarPanel({ s, war, busy, onEntry, onPlay }: { s: RookieState; war: ClanWar; busy: boolean; onEntry: (names: string[]) => void; onPlay: (quick: boolean) => void }) {
  const my = CLAN_BY_ID[s.clan!.id], oc = CLAN_BY_ID[war.oppClan];
  const rival = clanRelations(my.id).rival === oc.id;
  const cur = war.sets.findIndex(x => !x.winner);
  const mine = cur === war.meIdx;
  const a = war.my[cur], b = war.opp[cur];
  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-amber-400/60 bg-amber-500/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚔️</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-black text-foreground truncate">클랜전 [{my.tag}] vs [{oc.tag}] {oc.name}</div>
            <div className="text-[11px] text-muted-foreground">{WAR_SETS}세트 3선승{rival ? " · 🔥 라이벌 클랜" : ""} · {war.masterIsMe ? "내가 길드장" : war.meIdx >= 0 ? `내 차례: ${war.meIdx + 1}세트` : "엔트리에 들지 못해 관전"}</div>
          </div>
          <div className="text-right"><div className="text-2xl font-black text-foreground">{war.score[0]} <span className="text-muted-foreground">:</span> {war.score[1]}</div></div>
        </div>
      </div>
      {war.phase === "entry" ? <EntryPicker s={s} war={war} busy={busy} onSubmit={onEntry} /> : (
        <>
          {cur >= 0 && a && b && (
            <div className={cn("rounded-2xl bg-card border p-3 space-y-2", mine ? "border-primary/60" : "border-border")}>
              <div className="text-[11px] text-muted-foreground">{cur + 1}세트 {mine ? "· 내 경기!" : "· 관전"}</div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <Side m={a} tag={my.tag} me={mine} />
                <span className="text-muted-foreground font-black">VS</span>
                <Side m={b} tag={oc.tag} right />
              </div>
              {mine && (
                <div className="grid grid-cols-4 gap-1">
                  {STAT_KEYS.map(k => (
                    <div key={k} className="rounded-lg bg-muted/40 px-1 py-1 text-center">
                      <div className="text-[10px] text-muted-foreground">{STAT_LABELS[k]}</div>
                      <div className="text-[11px]"><b className={s.stats[k] >= b.stats[k] ? "text-emerald-300" : "text-foreground"}>{s.stats[k]}</b><span className="text-muted-foreground">/</span><b className={b.stats[k] > s.stats[k] ? "text-rose-300" : "text-foreground"}>{b.stats[k]}</b></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onPlay(false)} disabled={busy} className="rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-black disabled:opacity-40">{mine ? "▶ 경기 시작 (중계)" : "👀 관전 (중계)"}</button>
                <button onClick={() => onPlay(true)} disabled={busy} className="rounded-xl border border-primary text-primary py-2.5 text-sm font-black disabled:opacity-40">⏩ {mine ? "결과만 보기" : "건너뛰기"}</button>
              </div>
            </div>
          )}
          <WarBoard s={s} war={war} />
        </>
      )}
    </div>
  );
}

function Side({ m, tag, me, right }: { m: ClanMember; tag: string; me?: boolean; right?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", right && "flex-row-reverse text-right")}>
      <PlayerPhoto id={m.pro ? m.pro.id : -1} name={m.name} size={40} />
      <div className="min-w-0">
        <div className={cn("text-[12.5px] font-black truncate", me ? "text-primary" : "text-foreground")}>{withTag(m.name, tag)}</div>
        <div className="text-[10.5px] text-muted-foreground truncate">{m.real ? `${m.real} · ` : ""}{RACE_NAMES[m.race].slice(0, 1)} · {total(m).toLocaleString()}</div>
      </div>
    </div>
  );
}

/** 세트별 대진과 결과 */
export function WarBoard({ s, war }: { s: RookieState; war: ClanWar }) {
  const my = CLAN_BY_ID[s.clan?.id ?? war.oppClan] ?? CLAN_BY_ID[war.oppClan], oc = CLAN_BY_ID[war.oppClan];
  return (
    <div className="rounded-xl bg-card border border-border divide-y divide-border">
      {war.sets.map((st, i) => (
        <div key={i} className={cn("flex items-center gap-1.5 px-2 py-1.5 text-[11.5px]", i === war.meIdx && "bg-primary/10")}>
          <span className="w-6 text-muted-foreground shrink-0">{i + 1}세트</span>
          <span className={cn("flex-1 min-w-0 truncate", st.winner === "a" ? "font-black text-emerald-300" : st.winner ? "text-muted-foreground line-through" : "text-foreground")}>{war.my[i] ? withTag(war.my[i].name, my.tag) : "?"}{i === war.meIdx ? " (나)" : ""}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{st.winner ? (st.winner === "a" ? "승" : "패") : "vs"}</span>
          <span className={cn("flex-1 min-w-0 truncate text-right", st.winner === "b" ? "font-black text-rose-300" : st.winner ? "text-muted-foreground line-through" : "text-foreground")}>{war.opp[i] ? withTag(war.opp[i].name, oc.tag) : "?"}</span>
        </div>
      ))}
    </div>
  );
}
