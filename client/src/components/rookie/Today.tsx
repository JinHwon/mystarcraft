/**
 * 선수 키우기: 오늘 뭐 할까? — 하루는 활동 하나로 끝나고, 일주일에 직접 고르는 날은 2번
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ORIG_MAPS, ORIG_TEAMS } from "@shared/career/originalData";
import { matchupValue } from "@shared/career/view";
import type { Race } from "@shared/career/rules";
import {
  AUTO_GAMES, CLAN_BY_ID, DAY_GAMES, DOW, LADDER_REQ, MAP_UND_MAX, RACE_NAMES, TIERS, TIER_ORDER, WEEK_PICKS, dateText, ladderGrade, mapUnd, sumStats, ymd,
  type RookieState, type Tier,
} from "@shared/rookie/model";
import type { Activity } from "../../../../server/rookie/logic";
import type { RookieToday } from "@/lib/rookie";
import { MapInfo } from "@/components/legacy/Legacy";

/** 이 맵에서 내 종족이 가장 불리한 상대 종족 (승률 %) */
export function weakest(mapId: number, me: Race): { vs: Race; pct: number } {
  const others = (["terran", "zerg", "protoss"] as Race[]).filter(r => r !== me);
  return others.map(vs => ({ vs, pct: matchupValue(mapId, me, vs) })).sort((a, b) => a.pct - b.pct)[0];
}

const dayText = (d: number) => `${dateText(d).slice(5)} (${DOW[ymd(d).dow]})`;

/** 아래에서 올라오는 선택창 */
function Pop({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-card border border-border p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center">
          <div className="flex-1 text-base font-black text-foreground">{title}</div>
          <button onClick={onClose} className="text-xs rounded-lg border border-border px-2 py-1 text-muted-foreground">닫기 ✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const WatchToggle = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
  <button onClick={() => set(!on)} className={cn("w-full rounded-xl border px-3 py-1.5 text-[12px] text-left", on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
    {on ? "☑" : "☐"} 처음 2판은 중계로 보기 <span className="text-[10.5px]">(나머지는 결과만)</span>
  </button>
);

/** 공방: 방 난이도 · 맵 */
function LobbySheet({ s, onStart, onClose }: { s: RookieState; onStart: (tier: Tier, mapId: number, watch: boolean) => void; onClose: () => void }) {
  const [tier, setTier] = useState<Tier>(s.lobbyPref?.tier ?? "low");
  const [mapId, setMapId] = useState(s.lobbyPref?.mapId ?? 0);
  const [q, setQ] = useState("");
  const [weakOnly, setWeakOnly] = useState(false);
  const [watch, setWatch] = useState(false);
  const maps = ORIG_MAPS.map((m, i) => ({ i, name: m[0] as string, w: weakest(i, s.race) }))
    .filter(m => (!q || m.name.toLowerCase().includes(q.toLowerCase())) && (!weakOnly || m.w.pct < 50));
  return (
    <Pop title="🎮 공방 연습" onClose={onClose}>
      <div className="text-[11.5px] text-muted-foreground">하루 동안 {DAY_GAMES}판을 연습합니다. 방 난이도와 맵을 고르세요 (지난번 선택이 기억됩니다).</div>
      <div className="space-y-1.5">
        <div className="text-sm font-bold text-foreground">방 난이도 <span className="text-[10.5px] text-muted-foreground font-normal">· 내 능력치 {sumStats(s.stats).toLocaleString()}</span></div>
        <div className="grid grid-cols-6 gap-1">
          {TIER_ORDER.map(t => (
            <button key={t} onClick={() => setTier(t)} className={cn("rounded-lg py-1.5 text-[11px] font-bold border", tier === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border text-foreground")}>{TIERS[t].name}</button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground">{TIERS[tier].name}방 상대: 능력치 약 {TIERS[tier].range[0].toLocaleString()}~{TIERS[tier].range[1].toLocaleString()}</div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 맵 이름 검색" className="flex-1 min-w-0 rounded-xl bg-background border border-border px-3 py-1.5 text-sm text-foreground" />
          <button onClick={() => setWeakOnly(!weakOnly)} className={cn("shrink-0 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold", weakOnly ? "bg-rose-500/20 border-rose-400/60 text-rose-200" : "border-border text-muted-foreground")}>내 종족 불리 맵</button>
        </div>
        <div className="max-h-[168px] overflow-y-auto grid grid-cols-2 gap-1">
          {maps.map(m => (
            <button key={m.i} onClick={() => setMapId(m.i)} className={cn("rounded-lg border px-2 py-1 text-left", mapId === m.i ? "border-primary bg-primary/15" : "border-border bg-muted/20")}>
              <div className="text-[12px] font-bold text-foreground truncate">{m.name}</div>
              <div className={cn("text-[10px]", m.w.pct < 50 ? "text-rose-300" : "text-muted-foreground")}>{m.w.pct < 50 ? `vs${RACE_NAMES[m.w.vs].slice(0, 1)} ${m.w.pct}% · 성장↑` : "불리한 종족전 없음"} · 이해도 {mapUnd(s, m.i)}</div>
            </button>
          ))}
          {!maps.length && <div className="col-span-2 text-xs text-muted-foreground text-center py-3">찾는 맵이 없습니다</div>}
        </div>
        <div className="rounded-xl bg-black p-2 flex justify-center"><MapInfo mapId={mapId} size={56} /></div>
        <div className="text-[10.5px] text-muted-foreground">내 종족이 불리한 종족전으로 연습하면 능력치가 더 잘 오릅니다 (최대 1.6배). 같은 맵에 많이 나갈수록 맵 이해도(최대 {MAP_UND_MAX})가 올라 불리함도 줄어듭니다.</div>
      </div>
      <WatchToggle on={watch} set={setWatch} />
      <button onClick={() => onStart(tier, mapId, watch)} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black">🎮 {TIERS[tier].name}방 · {ORIG_MAPS[mapId][0]} · {DAY_GAMES}판 시작</button>
    </Pop>
  );
}

/** 래더: 이번 달 맵 5개 (눌러서 제외/포함) */
function LadderSheet({ s, today, onToggle, onStart, onClose }: { s: RookieState; today: RookieToday; onToggle: (sel: number[]) => void; onStart: (watch: boolean) => void; onClose: () => void }) {
  const [watch, setWatch] = useState(false);
  const sel = today.ladderMaps.sel;
  return (
    <Pop title="⚔️ 래더" onClose={onClose}>
      {today.ladderLock ? (
        <div className="rounded-xl bg-rose-500/10 border border-rose-400/40 p-3 text-[12.5px] text-rose-200 space-y-1">
          <div>🔒 {today.ladderLock}</div>
          <div className="text-[11px] text-muted-foreground">래더 조건: 경기 {LADDER_REQ.games}판 이상 · 능력치 합 {LADDER_REQ.total.toLocaleString()} 이상</div>
        </div>
      ) : (
        <div className="text-[11.5px] text-muted-foreground">하루 동안 래더 {DAY_GAMES}판을 치릅니다. 지금 {ladderGrade(s.ladder.score)} · {s.ladder.score}점 ({s.ladder.w}승 {s.ladder.l}패).</div>
      )}
      <div className="rounded-2xl bg-muted/30 border border-border p-2.5 space-y-1.5">
        <div className="flex justify-between items-center text-[12.5px] font-black text-foreground"><span>🗺️ 이번 달 래더 맵</span><span className="text-[10.5px] text-muted-foreground font-normal">눌러서 제외/포함</span></div>
        <div className="grid grid-cols-1 gap-1">
          {today.ladderMaps.maps.map(id => {
            const on = sel.includes(id), w = weakest(id, s.race), u = mapUnd(s, id);
            return (
              <button key={id} onClick={() => onToggle(on ? sel.filter(x => x !== id) : [...sel, id])} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1 text-left", on ? "border-primary bg-primary/15" : "border-border bg-muted/20 opacity-60")}>
                <span className="text-[12px] font-bold text-foreground flex-1 truncate">{on ? "✅" : "⬜"} {ORIG_MAPS[id][0]}</span>
                <span className={cn("text-[10px]", w.pct < 50 ? "text-rose-300" : "text-muted-foreground")}>{w.pct < 50 ? `vs${RACE_NAMES[w.vs].slice(0, 1)} ${w.pct}%` : "무난"}</span>
                <span className="text-[10px] text-amber-300 shrink-0">이해도 {u}/{MAP_UND_MAX}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[10.5px] text-muted-foreground">매달 새로 5개 · 래더는 고른 맵 중 하나가 무작위로 나옵니다. 맵에 많이 나갈수록 이해도가 올라 불리한 종족전의 승률이 올라가요.</div>
      </div>
      {!today.ladderLock && <WatchToggle on={watch} set={setWatch} />}
      <button disabled={!!today.ladderLock} onClick={() => onStart(watch)} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black disabled:opacity-40">⚔️ 래더 {DAY_GAMES}판 시작</button>
    </Pop>
  );
}

type Card = { key: string; icon: string; label: string; desc: string; lock?: string; hide?: boolean; onClick: () => void };

export function TodayPanel({ s, today, busy, onAct, onLadderMaps, onOpen }: {
  s: RookieState; today: RookieToday; busy: boolean;
  onAct: (a: Activity) => void;
  onLadderMaps: (sel: number[]) => void;
  onOpen: (v: "mentor" | "events") => void;
}) {
  const [sheet, setSheet] = useState<null | "lobby" | "ladder">(null);
  const pref = s.lobbyPref;
  const picksLeft = today.weekPicks.filter(d => d >= s.day).length;
  const todayEvents = s.events.filter(e => e.day === s.day && e.registered && !e.result);
  const pro = s.status === "pro";
  const next = today.stops.find(x => x.day > s.day);
  const cards: Card[] = [
    { key: "lobby", icon: "🎮", label: "공방 연습", desc: pref ? `${TIERS[pref.tier].name}방 · ${ORIG_MAPS[pref.mapId]?.[0]} · ${DAY_GAMES}판` : `방·맵 고르기 · ${DAY_GAMES}판`, onClick: () => setSheet("lobby") },
    { key: "ladder", icon: "⚔️", label: "래더", desc: today.ladderLock ?? `${ladderGrade(s.ladder.score)} · ${s.ladder.score}점 · 이번 달 맵 보기`, lock: today.ladderLock ?? undefined, onClick: () => setSheet("ladder") },
    { key: "clan", icon: "🛡️", label: "클랜 연습", desc: s.clan ? `[${CLAN_BY_ID[s.clan.id]?.tag}] ${today.clanRank}위 · ${DAY_GAMES}판` : "", hide: !s.clan, onClick: () => onAct({ kind: "clan" }) },
    { key: "internal", icon: "🏢", label: "팀 내부 연습", desc: s.team ? `이번 달 ${s.team.monthW}승 ${s.team.monthL}패 · ${DAY_GAMES}판` : "", hide: !s.team, onClick: () => onAct({ kind: "internal" }) },
    { key: "stream", icon: "📺", label: "방송", desc: "별풍선 · 인지도", onClick: () => onAct({ kind: "stream" }) },
    { key: "rest", icon: "💤", label: "휴식", desc: s.cond >= 100 ? "컨디션 가득 참" : "컨디션 크게 회복", onClick: () => onAct({ kind: "rest" }) },
    { key: "work", icon: "💼", label: "아르바이트", desc: "컨디션을 쓰고 돈 벌기", hide: pro, onClick: () => onAct({ kind: "work" }) },
    { key: "mentor", icon: "📚", label: "멘토 과외", desc: s.mentorDay === s.day ? "오늘은 받았음" : "프로에게 능력치 배우기", onClick: () => onOpen("mentor") },
  ];
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-primary/50 bg-primary/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xl">⭐</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-black text-foreground">오늘 {dayText(s.day)} 뭘 할까요?</div>
            <div className="text-[11px] text-muted-foreground">하루는 활동 하나로 끝나고, 직접 고르는 날은 일주일에 {WEEK_PICKS}번 (대회 등 이벤트 포함). 나머지 날은 휴식과 연습으로 자동 진행됩니다.</div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1 text-[10.5px]">
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-primary">이번 주 남은 선택 {picksLeft}번 (오늘 포함)</span>
          {next && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">다음 선택일 {dayText(next.day)}{next.kind === "event" ? " · 이벤트" : ""}</span>}
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">자동 진행 날은 {AUTO_GAMES}판씩</span>
        </div>
      </div>
      {today.todayEvent === "courage" && s.status !== "pro" && <EventCard icon="🎓" title="오늘은 커리지 매치!" desc="32강 토너먼트 · 대진표를 보고 한 판씩 · 우승하면 준프로" disabled={busy} onClick={() => onAct({ kind: "courage" })} />}
      {today.todayEvent === "draft" && <EventCard icon="📋" title="오늘은 드래프트!" desc="준프로 16명 4라운드 · 상위 8명은 구단이 지명할 수도" disabled={busy} onClick={() => onAct({ kind: "draft" })} />}
      {today.todayEvent === "promo" && s.team && <EventCard icon={s.team.squad === 2 ? "⬆️" : "🛡️"} title="팀 내 승강전 날" desc={s.team.squad === 2 ? `2군 1위면 1군 꼴찌와 3판 2선승 (이번 달 ${s.team.monthW}승 ${s.team.monthL}패)` : "1군 자리를 지키는 경기 (3판 2선승)"} disabled={busy} onClick={() => onAct({ kind: "promo" })} />}
      {todayEvents.map(e => <EventCard key={e.id} icon="🏆" title={`오늘은 ${e.name}!`} desc={`${e.size}강 · 대진표를 보고 한 판씩 · 우승 ${e.prize[0]}만원`} disabled={busy} onClick={() => onAct({ kind: "event", id: e.id })} />)}
      {!s.team && s.tryouts.map(t => <EventCard key={t.team} icon="📝" title={`${ORIG_TEAMS[t.team].name} 입단 테스트`} desc={`${t.from} · ${dateText(t.until).slice(5)}까지 · 3판 2선승`} action="테스트" disabled={busy} onClick={() => onAct({ kind: "tryout", team: t.team })} />)}
      {(todayEvents.length > 0 || today.todayEvent) && <div className="text-[10.5px] text-rose-300 px-1">⚠️ 다른 활동을 고르면 오늘 이벤트는 불참 처리됩니다</div>}
      <div className="grid grid-cols-2 gap-1.5">
        {cards.filter(c => !c.hide).map(c => (
          <button key={c.key} onClick={c.onClick} disabled={busy} className="rounded-2xl bg-card border border-border px-3 py-2.5 text-left disabled:opacity-40 active:scale-[0.98]">
            <div className="flex items-center gap-2"><span className="text-2xl leading-none">{c.icon}</span><span className="text-[14px] font-black text-foreground truncate">{c.label}</span></div>
            <div className={cn("text-[10.5px] truncate mt-1", c.lock ? "text-rose-300" : "text-muted-foreground")}>{c.lock ? `🔒 ${c.lock}` : c.desc}</div>
          </button>
        ))}
      </div>
      {sheet === "lobby" && <LobbySheet s={s} onClose={() => setSheet(null)} onStart={(tier, mapId, watch) => { setSheet(null); onAct({ kind: "lobby", tier, mapId, watch: watch ? 2 : 0 }); }} />}
      {sheet === "ladder" && <LadderSheet s={s} today={today} onClose={() => setSheet(null)} onToggle={onLadderMaps} onStart={watch => { setSheet(null); onAct({ kind: "ladder", watch: watch ? 2 : 0 }); }} />}
    </div>
  );
}

function EventCard({ icon, title, desc, action = "참가", onClick, disabled }: { icon: string; title: string; desc: string; action?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 px-2.5 py-2 flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-black text-foreground truncate">{title}</div>
        <div className="text-[10.5px] text-muted-foreground">{desc}</div>
      </div>
      <button onClick={onClick} disabled={disabled} className="shrink-0 rounded-lg bg-amber-500 text-black font-black text-xs px-3 py-1.5 disabled:opacity-40">{action}</button>
    </div>
  );
}
