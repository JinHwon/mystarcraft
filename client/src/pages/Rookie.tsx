/**
 * 선수 키우기 모드 메인: 오늘 할 일 · 공방 · 래더 · 대회 · 상점 · 구단 · 달력 · 기록
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { ORIG_MAPS, ORIG_TEAMS } from "@shared/career/originalData";
import { ITEMS, ITEM_BY_KEY, itemImg, SLOT_NAMES } from "@shared/career/items";
import {
  CONCEPTS, DAY_SLOTS, DOW, GRADE_COLOR, RACE_NAMES, ROOKIE_PRICE, STATUS_NAMES, TIERS, TIER_ORDER, VITA_PER_DAY,
  courageDays, dateText, draftDay, ladderGrade, sumStats, ymd, type RookieState, type Tier,
} from "@shared/rookie/model";
import type { PlayedGame } from "../../../server/rookie/logic";
import { useRookie, useRookieSync, type RookieToday } from "@/lib/rookie";
import { LegacyImg, LegacyRadar, MapInfo, PlayerPhoto, TeamLogo } from "@/components/legacy/Legacy";
import { RookieCreate } from "@/components/rookie/Create";
import { MatchViewer } from "@/components/rookie/MatchViewer";
import { RookieCalendar } from "@/components/rookie/Calendar";
import { AchView, FanView, FormBadge, MentorView, NegoBox, RankView, RivalCard, TitleBadge } from "@/components/rookie/Extras";

type View = "home" | "lobby" | "events" | "shop" | "team" | "calendar" | "log" | "mentor" | "fans" | "ach" | "rank";
const PRO_TEAMS = ORIG_TEAMS.filter(t => t.id < 12);
const price = (key: string) => Math.max(1, Math.round((ITEM_BY_KEY[key]?.price ?? 0) * ROOKIE_PRICE));

export default function Rookie() {
  const { state, today, loading } = useRookie();
  const [restart, setRestart] = useState(false);
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!state || restart) return <Shell><RookieCreate replace={!!state} onCancel={state ? () => setRestart(false) : undefined} /></Shell>;
  return <Shell><Hub s={state} today={today!} onRestart={() => setRestart(true)} /></Shell>;
}

/** 위쪽 막대 (감독 모드로 돌아가기) */
function Shell({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2.5 bg-background/95 backdrop-blur border-b border-border">
        <span className="text-lg">🎮</span><span className="font-black text-foreground">선수 키우기</span>
        <button onClick={() => navigate("/lobby")} className="ml-auto text-xs rounded-lg border border-border px-2.5 py-1 text-muted-foreground">감독 모드로 ›</button>
      </div>
      {children}
    </div>
  );
}

function Hub({ s, today, onRestart }: { s: RookieState; today: RookieToday; onRestart: () => void }) {
  const [view, setView] = useState<View>("home");
  const [watch, setWatch] = useState<{ games: PlayedGame[]; title?: string; extra?: ReactNode } | null>(null);
  const sync = useRookieSync();
  const done = (title?: string, extra?: (r: unknown) => ReactNode) => ({
    onSuccess: (r: { state: RookieState; today: RookieToday; result: unknown }) => {
      sync.onSuccess(r);
      const games = (r.result as { games?: PlayedGame[] })?.games;
      if (games?.length) setWatch({ games, title, extra: extra?.(r.result) });
    },
    onError: sync.onError,
  });
  const m = trpc.rookie;
  const ladder = m.ladder.useMutation(done("래더 결과"));
  const rest = m.rest.useMutation(sync);
  const stream = m.stream.useMutation(sync);
  const allowance = m.allowance.useMutation(sync);
  const next = m.nextDay.useMutation(sync);
  const courage = m.courage.useMutation(done("커리지 매치", r => <PlaceLine place={(r as { place: number }).place} />));
  const draft = m.draft.useMutation(done("드래프트", r => <div className="text-center text-[13px] text-[#ffe45c]">{(r as { rank: number; team?: number }).rank}위{(r as { team?: number }).team !== undefined ? ` → ${ORIG_TEAMS[(r as { team: number }).team].name} 지명!` : ""}</div>));
  const internal = m.internal.useMutation(done("팀 내부 연습"));
  const proleague = m.proleague.useMutation(done("프로리그"));
  const promo = m.promo.useMutation(done("팀 내 승강전"));
  const tryout = m.tryout.useMutation(done("입단 테스트", r => <div className="text-center text-[13px] text-[#ffe45c]">{(r as { won: boolean }).won ? "합격! 프로게이머가 되었습니다 🎉" : "불합격"}</div>));
  const playEvent = m.playEvent.useMutation(done("대회 결과", r => <PlaceLine place={(r as { place: number }).place} prize={(r as { prize: number }).prize} />));
  const busy = [ladder, rest, stream, allowance, next, courage, draft, internal, proleague, promo, tryout, playEvent].some(x => x.isPending);

  if (watch) return <MatchViewer s={s} games={watch.games} title={watch.title} extra={watch.extra} onClose={() => setWatch(null)} />;
  const left = DAY_SLOTS - s.used;
  const x = ymd(s.day);
  const total = sumStats(s.stats);
  const grade = ladderGrade(s.ladder.score);
  const todayEvents = s.events.filter(e => today.events.includes(e.id));

  const header = (
    <div className="rounded-2xl border border-white/10 p-3.5 shadow-xl" style={{ background: "linear-gradient(135deg, #2a3b5a, #121826 70%)" }}>
      <div className="flex gap-3">
        <PlayerPhoto id={-1} name={s.name} size={64} src={s.photo} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-lg text-white truncate">{s.name}</span>
            <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-white/10 text-white whitespace-nowrap">{RACE_NAMES[s.race]} · {CONCEPTS[s.concept].name}</span>
          </div>
          {(s.title || s.form || Math.abs(s.streak) >= 3) && <div className="flex flex-wrap items-center gap-1 my-0.5"><TitleBadge id={s.title} /><FormBadge s={s} /></div>}
          <div className="text-xs text-sky-200">
            {s.fa ? `FA (${dateText(s.fa.until).slice(5)}까지 구단 찾기)` : STATUS_NAMES[s.status]}{s.team ? ` · ${ORIG_TEAMS[s.team.team].name} ${s.team.squad}군` : s.status === "semipro" && s.semiproUntil !== undefined ? ` (~${dateText(s.semiproUntil)})` : ""}
          </div>
          <div className="text-[11px] text-neutral-300">{dateText(s.day)} ({DOW[x.dow]}) · 오늘 행동 <b className={left ? "text-emerald-300" : "text-rose-300"}>{left}</b>/{DAY_SLOTS}</div>
        </div>
        <div className="text-right">
          <div className="text-amber-300 font-black">{s.money.toLocaleString()}<span className="text-[10px]">만</span></div>
          <div className="text-[11px] font-black" style={{ color: GRADE_COLOR[grade] }}>래더 {grade} · {s.ladder.score}</div>
          <div className="text-[10px] text-neutral-400">인지도 {s.fame}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2.5 text-[10.5px] text-neutral-300">
        <Bar label="컨디션" v={s.cond} color={s.cond >= 65 ? "#8fe07a" : s.cond >= 40 ? "#f8e070" : "#ff6b6b"} />
        <Bar label="사기" v={s.morale} color="#8fd0ff" />
        <Bar label={`능력치 ${total.toLocaleString()}/${today.cap.toLocaleString()}`} v={Math.round((total / today.cap) * 100)} color="#c9a0ff" />
      </div>
    </div>
  );

  // 오늘의 특별 일정
  const banners: ReactNode[] = [];
  if (today.courage) banners.push(<Banner key="c" icon="🎓" title="오늘은 커리지 매치!" desc="32명 토너먼트 · 우승하면 준프로 자격 (하루 종일)" action="참가하기" disabled={busy || s.used > 0} onClick={() => courage.mutate()} note={s.used > 0 ? "이미 다른 일을 해서 오늘은 참가할 수 없습니다" : undefined} />);
  if (today.draft) banners.push(<Banner key="d" icon="📋" title="오늘은 드래프트!" desc="준프로 16명 4라운드 · 상위 8명은 구단이 지명할 수도" action="참가하기" disabled={busy || s.used > 0} onClick={() => draft.mutate()} note={s.used > 0 ? "이미 다른 일을 해서 오늘은 참가할 수 없습니다" : undefined} />);
  for (const e of todayEvents) banners.push(<Banner key={`e${e.id}`} icon="🏆" title={`오늘은 ${e.name}!`} desc={`${e.size}강 토너먼트 · 우승 ${e.prize[0]}만원 · 2위 ${e.prize[1]} · 3위 ${e.prize[2]}`} action="참가하기" disabled={busy || s.used > 0} onClick={() => playEvent.mutate({ id: e.id })} note={s.used > 0 ? "대회는 하루 종일 걸려서 다른 일을 하기 전에만 참가할 수 있습니다" : undefined} />);
  if (today.proleague) banners.push(<Banner key="p" icon="🏟️" title="프로리그 엔트리에 들었습니다!" desc="오늘 경기 (행동 2) · 하지 않으면 다음 날로 넘길 때 자동으로 치릅니다" action="출전" disabled={busy || left < 2} onClick={() => proleague.mutate()} />);
  if (today.promo && s.team) banners.push(<Banner key="pr" icon={s.team.squad === 2 ? "⬆️" : "🛡️"} title="오늘은 팀 내 승강전 날" desc={s.team.squad === 2 ? `2군 1위면 1군 꼴찌와 3판 2선승 (이번 달 내부 연습 ${s.team.monthW}승 ${s.team.monthL}패 · 3승 이상 필요)` : "1군 자리를 지키는 경기 (3판 2선승)"} action="승강전" disabled={busy || left < 3} onClick={() => promo.mutate()} />);
  if (!s.team) for (const t of s.tryouts) banners.push(<Banner key={`t${t.team}`} icon="📝" title={`${ORIG_TEAMS[t.team].name} 입단 테스트 제의`} desc={`${t.from} · ${dateText(t.until)}까지 · 2군 선수와 3판 2선승 (행동 3)`} action="테스트 보기" disabled={busy || left < 3} onClick={() => tryout.mutate({ team: t.team })} />);
  if (s.nego) banners.push(<Banner key="n" icon="💼" title="연봉 협상 중" desc={`구단 제시 월급 ${s.nego.offer}만원 · ${dateText(s.nego.until).slice(5)}까지`} action="협상" onClick={() => setView("team")} />);
  if (s.offers.length) banners.push(<Banner key="o" icon="📨" title={`이적 제안 ${s.offers.length}건`} desc="구단 화면에서 확인하세요" action="보기" onClick={() => setView("team")} />);

  const ACTIONS_GRID: Array<{ icon: string; label: string; desc: string; onClick: () => void; disabled?: boolean; hide?: boolean }> = [
    { icon: "🎮", label: "공방 (연습)", desc: "맵·방 골라 매칭 · 행동 1", onClick: () => setView("lobby"), disabled: left < 1 },
    { icon: "⚔️", label: "래더", desc: `강한 상대 · 점수 ${s.ladder.score} · 행동 1`, onClick: () => ladder.mutate(), disabled: busy || left < 1 },
    { icon: "🏢", label: "팀 내부 연습", desc: s.team ? `이번 달 ${s.team.monthW}승 ${s.team.monthL}패 · 행동 1` : "", onClick: () => internal.mutate(), disabled: busy || left < 1, hide: !s.team },
    { icon: "💤", label: "휴식", desc: s.cond >= 100 ? "컨디션 가득 참" : "컨디션 +12 · 행동 1", onClick: () => rest.mutate(), disabled: busy || left < 1 || s.cond >= 100 },
    { icon: "📺", label: "개인 방송", desc: "별풍선·인지도 · 행동 2", onClick: () => stream.mutate(), disabled: busy || left < 2 },
    { icon: "💵", label: "용돈 받기", desc: s.allowanceDay !== undefined && s.day - s.allowanceDay < 7 ? `${7 - (s.day - s.allowanceDay)}일 뒤 가능` : "일주일에 한 번 · 행동 1", onClick: () => allowance.mutate(), disabled: busy || left < 1 || (s.allowanceDay !== undefined && s.day - s.allowanceDay < 7), hide: s.status === "pro" },
    { icon: "🏆", label: "대회", desc: `예정 ${s.events.filter(e => e.day >= s.day && !e.result).length}개 · 참가 신청`, onClick: () => setView("events") },
    { icon: "🛒", label: "상점·가방", desc: "비타비타·장비·포션", onClick: () => setView("shop") },
    { icon: "📚", label: "멘토 과외", desc: s.mentorDay === s.day ? "오늘은 받았음" : "프로에게 배우기 · 행동 3", onClick: () => setView("mentor") },
    { icon: "🏢", label: "구단", desc: s.team ? `${ORIG_TEAMS[s.team.team].short} ${s.team.squad}군 · 이적` : s.fa ? "FA · 구단 찾기" : "프로가 되면 열림", onClick: () => setView("team") },
    { icon: "💌", label: "팬카페", desc: `회원 ${s.fanCafe.members.toLocaleString()}명 · 반응`, onClick: () => setView("fans") },
    { icon: "🏅", label: "업적·칭호", desc: `${Object.keys(s.achievements).length}개 달성`, onClick: () => setView("ach") },
    { icon: "📊", label: "랭킹", desc: "다른 유저 선수들", onClick: () => setView("rank") },
    { icon: "📅", label: "달력", desc: "한 일 · 일정", onClick: () => setView("calendar") },
    { icon: "📜", label: "기록", desc: `${s.record.w}승 ${s.record.l}패 · 소식`, onClick: () => setView("log") },
  ];

  const back = <button onClick={() => setView("home")} className="text-sm text-primary font-bold">‹ 돌아가기</button>;
  return (
    <div className="p-4 space-y-3 max-w-lg mx-auto">
      {header}
      {view === "home" && (
        <>
          {banners}
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS_GRID.filter(a => !a.hide).map(a => (
              <button key={a.label} onClick={a.onClick} disabled={a.disabled}
                className="rounded-2xl bg-card border border-border p-3 text-left disabled:opacity-40 active:scale-[0.98]">
                <div className="text-xl leading-none">{a.icon}</div>
                <div className="text-sm font-black text-foreground mt-1">{a.label}</div>
                <div className="text-[10.5px] text-muted-foreground">{a.desc}</div>
              </button>
            ))}
          </div>
          <RivalCard s={s} />
          <StatsCard s={s} />
          <div className="rounded-xl bg-card border border-border p-2.5 space-y-0.5">
            <div className="text-xs font-bold text-foreground mb-1">📰 최근 소식</div>
            {s.log.slice(0, 6).map((l, i) => <div key={i} className="text-[11.5px] text-foreground/90"><span className="text-muted-foreground">{dateText(l.day).slice(5)}</span> {l.icon} {l.text}</div>)}
          </div>
          <button onClick={() => next.mutate()} disabled={busy} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black disabled:opacity-50">
            ▶ 다음 날로 ({ymd(s.day + 1).m}/{ymd(s.day + 1).d}) {left ? `· 남은 행동 ${left}` : ""}
          </button>
          <UpcomingLine s={s} />
          <button onClick={() => confirm("지금 선수를 그만두고 새 선수를 만들까요? (지금 기록은 사라집니다)") && onRestart()} className="w-full text-[11px] text-muted-foreground py-1">🔄 새 선수 만들기</button>
        </>
      )}
      {view === "lobby" && <><div className="flex">{back}</div><LobbyView s={s} onPlayed={g => setWatch({ games: g, title: "공방 결과" })} /></>}
      {view === "events" && <><div className="flex">{back}</div><EventsView s={s} /></>}
      {view === "shop" && <><div className="flex">{back}</div><ShopView s={s} /></>}
      {view === "team" && <><div className="flex">{back}</div><TeamView s={s} /></>}
      {view === "calendar" && <><div className="flex">{back}</div><RookieCalendar s={s} /></>}
      {view === "log" && <><div className="flex">{back}</div><LogView s={s} /></>}
      {view === "mentor" && <><div className="flex">{back}</div><MentorView s={s} /></>}
      {view === "fans" && <><div className="flex">{back}</div><FanView s={s} /></>}
      {view === "ach" && <><div className="flex">{back}</div><AchView s={s} /></>}
      {view === "rank" && <><div className="flex">{back}</div><RankView /></>}
    </div>
  );
}

function Bar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between"><span>{label}</span><b className="text-white">{v}%</b></div>
      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden"><div className="h-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} /></div>
    </div>
  );
}

function Banner({ icon, title, desc, action, onClick, disabled, note }: { icon: string; title: string; desc: string; action: string; onClick: () => void; disabled?: boolean; note?: string }) {
  return (
    <div className="rounded-2xl border border-amber-400/50 bg-amber-500/10 p-3 flex items-center gap-2.5">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-black text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
        {note && <div className="text-[10.5px] text-rose-300">{note}</div>}
      </div>
      <button onClick={onClick} disabled={disabled} className="shrink-0 rounded-xl bg-amber-500 text-black font-black text-xs px-3 py-2 disabled:opacity-40">{action}</button>
    </div>
  );
}

function PlaceLine({ place, prize }: { place: number; prize?: number }) {
  return <div className="text-center text-[15px] text-[#ffe45c] font-black">{place === 1 ? "🏆 우승!" : place === 2 ? "🥈 준우승" : place === 3 ? "🥉 3위" : `${place}강 탈락`}{prize ? ` · 상금 ${prize}만원` : ""}</div>;
}

/** 다가오는 큰 일정 */
function UpcomingLine({ s }: { s: RookieState }) {
  const y = ymd(s.day).y;
  const list: Array<[number, string]> = [];
  if (!s.team) {
    for (const d of [...courageDays(y), ...courageDays(y + 1)]) if (d >= s.day) list.push([d, "🎓 커리지 매치"]);
    const dd = [draftDay(y), draftDay(y + 1)].find(d => d >= s.day);
    if (dd !== undefined) list.push([dd, "📋 드래프트"]);
  }
  for (const e of s.events) if (e.day >= s.day && !e.result) list.push([e.day, `${e.registered ? "🏆" : "🎪"} ${e.name}`]);
  list.sort((a, b) => a[0] - b[0]);
  return (
    <div className="rounded-xl bg-card border border-border p-2.5 text-[11.5px] space-y-0.5">
      <div className="text-xs font-bold text-foreground mb-0.5">📅 다가오는 일정</div>
      {list.slice(0, 5).map(([d, t], i) => <div key={i} className="flex justify-between"><span className="text-foreground">{t}</span><span className="text-muted-foreground">{dateText(d).slice(5)} · D-{d - s.day}</span></div>)}
    </div>
  );
}

function StatsCard({ s }: { s: RookieState }) {
  const gear: Record<string, number> = {};
  for (const e of Object.values(s.equip)) for (const [k, v] of Object.entries((e && ITEM_BY_KEY[e.key]?.bonus) ?? {})) gear[k] = (gear[k] ?? 0) + Math.round((v ?? 0) * 0.5);
  return (
    <div className="rounded-2xl bg-black border border-neutral-700 p-3 text-white">
      <div className="flex items-center gap-2">
        <LegacyRadar stats={s.stats} level={1} size={140} />
        <div className="flex-1 grid grid-cols-1 text-[12px]">
          {STAT_KEYS.map(k => (
            <div key={k} className="flex justify-between border-b border-neutral-800 py-[1px]">
              <span className="text-neutral-400">{STAT_LABELS[k]}</span>
              <span><b>{s.stats[k]}</b>{gear[k] ? <span className="text-[#8fd0ff] text-[10px]"> +{gear[k]}</span> : null} <span className={cn("text-[10px]", s.stats[k] >= s.startStats[k] ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>({s.stats[k] - s.startStats[k] >= 0 ? "+" : ""}{s.stats[k] - s.startStats[k]})</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">괄호 = 처음보다 오른 만큼 · 아마추어·준프로 때는 성장 한계가 있어 고만고만하고, 프로가 되면 한계가 크게 올라갑니다</div>
    </div>
  );
}

// ── 공방 ─────────────────────────────────────────────────────
function LobbyView({ s, onPlayed }: { s: RookieState; onPlayed: (g: PlayedGame[]) => void }) {
  const sync = useRookieSync();
  const [tier, setTier] = useState<Tier>(s.lobby?.tier ?? "low");
  const [mapId, setMapId] = useState(s.lobby?.mapId ?? 0);
  const find = trpc.rookie.findLobby.useMutation(sync);
  const kick = trpc.rookie.kick.useMutation(sync);
  const play = trpc.rookie.playLobby.useMutation({ onSuccess: r => { sync.onSuccess(r); onPlayed((r.result as { games: PlayedGame[] }).games); }, onError: sync.onError });
  const opp = s.lobby?.opp;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="text-sm font-bold text-foreground">방 난이도</div>
        <div className="grid grid-cols-3 gap-1.5">
          {TIER_ORDER.map(t => (
            <button key={t} onClick={() => setTier(t)} className={cn("rounded-xl py-1.5 text-xs font-bold border", tier === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border text-foreground")}>
              {TIERS[t].name}<span className="block text-[9.5px] font-normal opacity-70">약 {TIERS[t].range[0].toLocaleString()}~{TIERS[t].range[1].toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="text-[10.5px] text-muted-foreground">초보방에도 가끔 고수가 섞여 들어옵니다. 내 능력치 합 {sumStats(s.stats).toLocaleString()}</div>
      </div>
      <div className="rounded-2xl bg-black border border-neutral-700 p-3 text-white space-y-2">
        <div className="text-sm font-bold">맵</div>
        <select value={mapId} onChange={e => setMapId(Number(e.target.value))} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-2 py-1.5 text-sm">
          {ORIG_MAPS.map((m, i) => <option key={i} value={i}>{m[0]}</option>)}
        </select>
        <div className="flex justify-center"><MapInfo mapId={mapId} size={60} /></div>
      </div>
      <button onClick={() => find.mutate({ tier, mapId })} disabled={find.isPending} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black">🔍 매칭 ({TIERS[tier].name}방)</button>
      {opp && (
        <div className="rounded-2xl bg-card border border-primary/50 p-3.5 space-y-2">
          <div className="flex items-center gap-3">
            <PlayerPhoto id={opp.pro ? opp.pro.id : -1} name={opp.name} size={48} />
            <div className="flex-1">
              <div className="font-black text-foreground">{opp.name} <span className="text-xs text-muted-foreground">({RACE_NAMES[opp.race]})</span></div>
              <div className="text-xs text-muted-foreground">{TIERS[s.lobby!.tier].name}방 · {ORIG_MAPS[s.lobby!.mapId][0]} · 실력 {strengthText(sumStats(opp.stats), sumStats(s.stats))}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => kick.mutate()} disabled={kick.isPending || s.kicks >= 10} className="rounded-xl border border-rose-400/50 text-rose-300 py-2 text-sm font-bold disabled:opacity-40">🦶 강퇴 ({10 - s.kicks})</button>
            <button onClick={() => play.mutate()} disabled={play.isPending || s.used >= DAY_SLOTS} className="rounded-xl bg-emerald-600 text-white py-2 text-sm font-black disabled:opacity-40">▶ 게임 시작</button>
          </div>
        </div>
      )}
    </div>
  );
}
/** 상대 실력 대략 (정확한 능력치는 숨김) */
function strengthText(them: number, me: number) {
  const r = them / Math.max(1, me);
  return r > 1.25 ? "😱 훨씬 강함" : r > 1.08 ? "💪 강함" : r > 0.93 ? "🤝 비슷" : r > 0.8 ? "🙂 약함" : "😴 훨씬 약함";
}

// ── 대회 ─────────────────────────────────────────────────────
function EventsView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const reg = trpc.rookie.register.useMutation(sync);
  const list = s.events.filter(e => e.day >= s.day || e.result).sort((a, b) => a.day - b.day);
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">대회는 하루 동안 열리고, 그날 다른 일을 하기 전에 참가해야 합니다. 3위까지 상금!</div>
      {list.map(e => (
        <div key={e.id} className={cn("rounded-2xl border p-3 space-y-1", e.registered ? "bg-amber-500/10 border-amber-400/50" : "bg-card border-border")}>
          <div className="flex items-center gap-2">
            <span className="font-black text-foreground flex-1">🏆 {e.name}</span>
            <span className="text-xs text-muted-foreground">{dateText(e.day).slice(5)} ({DOW[ymd(e.day).dow]}){e.day === s.day ? " · 오늘" : ` · D-${e.day - s.day}`}</span>
          </div>
          <div className="text-[11.5px] text-muted-foreground">{e.size}강 · 참가 수준 {TIERS[e.level].name} 이상 · 상금 1위 {e.prize[0]}만 / 2위 {e.prize[1]}만 / 3위 {e.prize[2]}만</div>
          {e.result ? <div className="text-xs text-amber-300 font-bold">결과: {e.result}</div> : (
            <button onClick={() => reg.mutate({ id: e.id })} disabled={reg.isPending} className={cn("w-full rounded-xl py-1.5 text-xs font-black border", e.registered ? "border-rose-400/60 text-rose-300" : "bg-amber-500 text-black border-amber-500")}>
              {e.registered ? "신청 취소" : "참가 신청"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 상점·가방 ────────────────────────────────────────────────
function ShopView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const buy = trpc.rookie.buy.useMutation(sync);
  const use = trpc.rookie.use.useMutation(sync);
  const [tab, setTab] = useState<"stock" | "equip" | "potion">("stock");
  const items = ITEMS.filter(it => it.kind === tab && !it.notForSale);
  const owned = Object.entries(s.inventory).filter(([, n]) => n > 0);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
        <div className="text-sm font-bold text-foreground">🎒 가방 <span className="text-xs text-muted-foreground">· 회복 아이템 오늘 {s.vitaToday}/{VITA_PER_DAY}</span></div>
        {!owned.length && <div className="text-xs text-muted-foreground">비어 있습니다</div>}
        {owned.map(([k, n]) => {
          const it = ITEM_BY_KEY[k];
          if (!it) return null;
          return (
            <div key={k} className="flex items-center gap-2">
              <ItemIcon k={k} />
              <span className="flex-1 text-sm text-foreground">{it.name} <span className="text-xs text-muted-foreground">×{n}</span></span>
              <button onClick={() => use.mutate({ key: k })} disabled={use.isPending} className="rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-bold px-2.5 py-1">{it.kind === "equip" ? "장착" : "사용"}</button>
            </div>
          );
        })}
        {Object.entries(s.equip).filter(([, e]) => e).length > 0 && (
          <div className="pt-1 text-[11.5px] text-sky-300">장착 중: {Object.entries(s.equip).filter(([, e]) => e).map(([slot, e]) => `${SLOT_NAMES[slot as keyof typeof SLOT_NAMES]} ${ITEM_BY_KEY[e!.key]?.name} (${e!.left}판)`).join(" · ")}</div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-card border border-border">
        {([["stock", "회복"], ["equip", "장비"], ["potion", "포션"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("py-1.5 rounded-lg text-sm font-bold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <div className="space-y-1.5">
        {items.map(it => (
          <div key={it.key} className="rounded-xl bg-card border border-border p-2.5 flex items-center gap-2">
            <ItemIcon k={it.key} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground">{it.name}</div>
              <div className="text-[10.5px] text-muted-foreground truncate">{tab === "equip" ? `${it.effect.join(" ")} (선수 키우기에서는 효과 절반 · ${(it.uses ?? 10) * 2}판)` : tab === "stock" ? `컨디션 +${(it.cond ?? 3) * 2}` : `${it.effect.join(" ")} (효과 절반)`}</div>
            </div>
            <button onClick={() => buy.mutate({ key: it.key, qty: 1 })} disabled={buy.isPending || s.money < price(it.key)} className="shrink-0 rounded-lg bg-amber-500 text-black text-xs font-black px-2.5 py-1.5 disabled:opacity-40">{price(it.key)}만</button>
          </div>
        ))}
      </div>
    </div>
  );
}
function ItemIcon({ k }: { k: string }) {
  const it = ITEM_BY_KEY[k];
  return <span className="w-9 h-9 bg-white rounded flex items-center justify-center overflow-hidden shrink-0"><LegacyImg dir={itemImg(it).dir} name={itemImg(it).name} className="max-w-full max-h-full" fallback={<span className="text-black text-xs">{it.name.slice(0, 2)}</span>} /></span>;
}

// ── 구단 ─────────────────────────────────────────────────────
function TeamView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const req = trpc.rookie.requestTransfer.useMutation(sync);
  const accept = trpc.rookie.acceptOffer.useMutation(sync);
  if (s.fa) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-card border border-rose-400/50 p-3.5 text-sm space-y-1">
          <div className="text-base font-black text-foreground">💔 FA (자유계약)</div>
          <div className="text-muted-foreground">{dateText(s.fa.until)}까지 새 구단을 찾아야 합니다. 못 찾으면 준프로로 돌아갑니다. 구단에 직접 연락해도 들킬 걱정은 없어요.</div>
        </div>
        <OfferList s={s} accept={team => accept.mutate({ team })} />
        <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
          <div className="text-sm font-bold text-foreground">📞 구단에 연락하기 <span className="text-[10.5px] text-muted-foreground">(행동 1)</span></div>
          <div className="grid grid-cols-3 gap-1.5">
            {PRO_TEAMS.map(x => (
              <button key={x.id} onClick={() => req.mutate({ team: x.id })} disabled={req.isPending || s.used >= DAY_SLOTS || s.offers.some(o => o.team === x.id)}
                className="rounded-xl bg-muted/40 border border-border p-1.5 flex flex-col items-center disabled:opacity-40">
                <TeamLogo team={x} className="w-[46px] h-[27px]" />
                <span className="text-[10px] text-foreground truncate w-full text-center">{x.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!s.team) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 text-sm text-muted-foreground space-y-1.5">
        <div className="text-base font-black text-foreground">🏢 아직 프로가 아닙니다</div>
        <div>· 6월·12월 커리지 매치에서 우승하면 준프로 (능력치가 정말 높으면 구단이 입단 경기를 제의)</div>
        <div>· 준프로는 2년 동안 12월 드래프트에 나갈 수 있고, 상위 8명은 구단이 지명할 수도 있습니다</div>
        <div>· 래더에서 프로게이머를 이기면 그 팀에서 입단 테스트를 제의하기도 합니다</div>
      </div>
    );
  }
  const t = s.team;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5 flex items-center gap-3">
        <TeamLogo team={ORIG_TEAMS[t.team]} className="w-[70px] h-[40px]" />
        <div className="flex-1">
          <div className="font-black text-foreground">{ORIG_TEAMS[t.team].name} <span className="text-primary">{t.squad}군</span></div>
          <div className="text-xs text-muted-foreground">입단 {dateText(t.joined)} · 월급 {t.salary}만원 · 이번 달 내부 연습 {t.monthW}승 {t.monthL}패</div>
          <div className="text-xs text-muted-foreground">프로리그 {t.proW ?? 0}승 {t.proL ?? 0}패{t.caught ? ` · ⚠️ 이적 시도 적발 ${t.caught}회` : ""}</div>
          {t.contractUntil !== undefined && <div className="text-xs text-muted-foreground">계약 {dateText(t.contractUntil)}까지 (끝나면 연봉 협상)</div>}
        </div>
      </div>
      <div className="rounded-xl bg-muted/40 border border-border p-2.5 text-[11.5px] text-muted-foreground space-y-0.5">
        <div>· 매달 마지막 날 팀 내 승강전: 2군에서 내부 연습 성적이 좋으면(3승 이상) 1군 꼴찌와 3판 2선승</div>
        <div>· 1군은 프로리그 기간(3~6월, 9~12월) 주말에 엔트리에 들면 출전 · 승리 수당 30만원</div>
      </div>
      {s.nego && <NegoBox s={s} />}
      <OfferList s={s} accept={team => accept.mutate({ team })} />
      <div className="rounded-2xl bg-card border border-border p-3 space-y-1.5">
        <div className="text-sm font-bold text-foreground">✈️ 다른 구단에 이적 요청 <span className="text-[10.5px] text-rose-300">구단에 들키면 벌금·사기 하락, 두 번 들키면 방출!</span></div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRO_TEAMS.filter(x => x.id !== t.team).map(x => (
            <button key={x.id} onClick={() => confirm(`${x.name}에 몰래 이적을 알아볼까요? (25% 확률로 구단에 들킴)`) && req.mutate({ team: x.id })} disabled={req.isPending || s.used >= DAY_SLOTS}
              className="rounded-xl bg-muted/40 border border-border p-1.5 flex flex-col items-center disabled:opacity-40">
              <TeamLogo team={x} className="w-[46px] h-[27px]" />
              <span className="text-[10px] text-foreground truncate w-full text-center">{x.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OfferList({ s, accept }: { s: RookieState; accept: (team: number) => void }) {
  if (!s.offers.length) return null;
  return (
    <div className="rounded-2xl bg-card border border-amber-400/50 p-3 space-y-1.5">
      <div className="text-sm font-bold text-foreground">📨 받은 {s.fa ? "영입" : "이적"} 제안</div>
      {s.offers.map(o => (
        <div key={o.team} className="flex items-center gap-2">
          <TeamLogo team={ORIG_TEAMS[o.team]} className="w-[46px] h-[27px]" />
          <span className="flex-1 text-sm text-foreground">{ORIG_TEAMS[o.team].name} · 월급 {o.salary}만 · {dateText(o.until).slice(5)}까지</span>
          <button onClick={() => confirm(`${ORIG_TEAMS[o.team].name}(으)로 ${s.fa ? "입단" : "이적"}할까요? (2군부터 시작)`) && accept(o.team)} className="rounded-lg bg-emerald-600 text-white text-xs font-bold px-2.5 py-1">{s.fa ? "입단" : "이적"}</button>
        </div>
      ))}
    </div>
  );
}

// ── 기록 ─────────────────────────────────────────────────────
function LogView({ s }: { s: RookieState }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3 grid grid-cols-3 gap-2 text-center">
        {[["전적", `${s.record.w}승 ${s.record.l}패`], ["래더 최고", `${s.ladder.best} (${ladderGrade(s.ladder.best)})`], ["래더 전적", `${s.ladder.w}승 ${s.ladder.l}패`], ["방송", `${s.stream.count}회 · 최고 ${s.stream.best}명`], ["팬", `${s.stream.fans}명`], ["인지도", s.fame]].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-muted/50 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-sm font-bold text-foreground">{v}</div></div>
        ))}
      </div>
      {s.titles.length > 0 && (
        <div className="rounded-2xl bg-card border border-amber-400/40 p-3 space-y-0.5">
          <div className="text-sm font-bold text-amber-300">🏅 경력</div>
          {s.titles.map((t, i) => <div key={i} className="text-[12px] text-foreground">{t}</div>)}
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border p-3 space-y-0.5">
        <div className="text-sm font-bold text-foreground mb-1">📰 소식</div>
        {s.log.slice(0, 120).map((l, i) => <div key={i} className="text-[11.5px] text-foreground/90"><span className="text-muted-foreground">{dateText(l.day).slice(2)}</span> {l.icon} {l.text}</div>)}
      </div>
    </div>
  );
}
