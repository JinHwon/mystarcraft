/**
 * 선수 키우기 메인: 오늘 뭐 할까(하루 한 활동) · 대회 · 성장 · 상점 · 클랜 · 더보기
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { ITEMS, ITEM_BY_KEY, itemImg, slotOf, SLOT_NAMES } from "@shared/career/items";
import {
  CONCEPTS, DOW, GRADE_COLOR, RACE_NAMES, ROOKIE_PRICE, STATUS_NAMES, TIERS, VITA_PER_DAY, CLAN_BY_ID, DAY_SLOTS, eventReq,
  courageDays, dateText, draftDay, ladderGrade, sumStats, ymd, type RookieState, oppLabel, withTag, roundName,
} from "@shared/rookie/model";
import type { PlayedGame } from "../../../server/rookie/logic";
import { useRookie, useRookieSync, type RookieToday } from "@/lib/rookie";
import { LegacyImg, LegacyRadar, PlayerPhoto, TeamLogo } from "@/components/legacy/Legacy";
import { RookieCreate } from "@/components/rookie/Create";
import { MatchViewer } from "@/components/rookie/MatchViewer";
import { RookieCalendar } from "@/components/rookie/Calendar";
import { AchView, FanView, FormBadge, MentorView, NegoBox, RankView, RivalCard, TitleBadge } from "@/components/rookie/Extras";
import { ClanView } from "@/components/rookie/Clan";
import { GrowthChart, LevelBar, WeekStrip } from "@/components/rookie/Growth";
import { BatchRunning } from "@/components/rookie/Batch";
import { ReportView, type ActResult } from "@/components/rookie/Report";
import { TodayPanel } from "@/components/rookie/Today";
import { BracketPanel } from "@/components/rookie/Bracket";
import { ClanWarPanel } from "@/components/rookie/ClanWar";
import type { Activity } from "../../../server/rookie/logic";

type View = "home" | "shop" | "team" | "calendar" | "log" | "mentor" | "fans" | "ach" | "rank";
const PRO_TEAMS = ORIG_TEAMS.filter(t => t.id < 12);
const price = (key: string) => Math.max(1, Math.round((ITEM_BY_KEY[key]?.price ?? 0) * ROOKIE_PRICE));

export default function Rookie() {
  const { state, today, loading } = useRookie();
  const [restart, setRestart] = useState(false);
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!state || restart) return <Shell><RookieCreate replace={!!state} onCancel={state ? () => setRestart(false) : undefined} /></Shell>;
  return <Hub s={state} today={today!} onRestart={() => setRestart(true)} />;
}

/** 위쪽 막대: 제목을 누르면 홈으로 */
function Shell({ children, onHome, sub, onBack }: { children: ReactNode; onHome?: () => void; sub?: string; onBack?: () => void }) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1 rounded-xl bg-primary/15 border border-primary/40 text-primary font-black text-sm px-2.5 py-1">‹ 뒤로</button>
        ) : null}
        <button onClick={onHome} className="flex items-center gap-1.5 min-w-0">
          {!onBack && <span className="text-lg">🎮</span>}
          <span className="font-black text-foreground truncate">{sub ?? "선수 키우기"}</span>
        </button>
        <button onClick={() => navigate("/lobby")} className="ml-auto shrink-0 text-xs rounded-lg border border-border px-2.5 py-1 text-muted-foreground">감독 모드 ›</button>
      </div>
      {children}
    </div>
  );
}

type Tab = "home" | "events" | "grow" | "shop" | "clan" | "more";
const TABS: Array<[Tab, string, string]> = [["home", "🏠", "홈"], ["events", "🏆", "대회"], ["grow", "📈", "성장"], ["shop", "🛒", "상점"], ["clan", "🛡️", "클랜"], ["more", "☰", "더보기"]];
const SUB_TITLES: Record<View, string> = { home: "", shop: "상점·가방", team: "구단", calendar: "달력", log: "기록", mentor: "멘토 과외", fans: "팬카페", ach: "업적·칭호", rank: "랭킹" };

function Hub({ s, today, onRestart }: { s: RookieState; today: RookieToday; onRestart: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const [view, setView] = useState<View>("home");
  const [watch, setWatch] = useState<{ games: PlayedGame[]; title?: string } | null>(null);
  const [report, setReport] = useState<ActResult | null>(null);
  const [actTitle, setActTitle] = useState("");
  const sync = useRookieSync();
  const m = trpc.rookie;
  const ladderMaps = m.ladderMaps.useMutation(sync);
  const act = m.act.useMutation({
    onSuccess: r => {
      sync.onSuccess(r);
      const res = r.result as ActResult;
      // 대회를 시작하면 대진표 화면으로 (결과 창은 대회가 끝난 뒤)
      if (res.reports.length) setReport(res);
      if (res.games?.length) setWatch({ games: res.games, title: res.title });
      window.scrollTo(0, 0);
    },
    onError: sync.onError,
  });
  /** 대회 중 내 경기 하나 */
  const bracketPlay = m.bracketPlay.useMutation({
    onSuccess: (r, vars) => {
      sync.onSuccess(r);
      const res = r.result as { games: PlayedGame[]; bracket: NonNullable<RookieState["bracket"]>; finished?: ActResult };
      if (res.finished) setReport({ ...res.finished, bracket: res.bracket, games: undefined });
      if (!vars.quick && res.games.length) setWatch({ games: res.games, title: res.bracket.title });
      else {
        const won = res.games[res.games.length - 1]?.winner === "a";
        toast[won ? "success" : "error"](won ? "승리! 다음 라운드로" : "패배… 탈락했습니다");
      }
      window.scrollTo(0, 0);
    },
    onError: sync.onError,
  });
  /** 클랜전: 엔트리 제출 · 다음 세트 */
  const warEntry = m.warEntry.useMutation({ onSuccess: r => { sync.onSuccess(r); window.scrollTo(0, 0); }, onError: sync.onError });
  const warPlay = m.warPlay.useMutation({
    onSuccess: (r, vars) => {
      sync.onSuccess(r);
      const res = r.result as { games: PlayedGame[]; war: NonNullable<RookieState["war"]>; finished?: ActResult & { win: boolean; score: [number, number]; oppClan: string; played: boolean; myWon: boolean } };
      if (res.finished) setReport({ ...res.finished, war: res.war, games: undefined });
      if (!vars.quick && res.games.length) setWatch({ games: res.games, title: "클랜전" });
      else if (res.games.length === 0 && !vars.quick) toast.info("관전할 경기가 없습니다");
      window.scrollTo(0, 0);
    },
    onError: sync.onError,
  });
  const busy = act.isPending || bracketPlay.isPending || warEntry.isPending || warPlay.isPending;
  const doAct = (a: Activity, title = "") => { setActTitle(title); act.mutate(a as never); };

  if (watch) return <MatchViewer s={s} games={watch.games} title={watch.title} onClose={() => setWatch(null)} />;
  const total = sumStats(s.stats);
  const grade = ladderGrade(s.ladder.score);
  const go = (t: Tab, v: View = "home") => { setTab(t); setView(v); window.scrollTo(0, 0); };
  const open = (v: View) => { setView(v); window.scrollTo(0, 0); };
  // 활동을 마치면 다음 선택일에 와 있음
  const nextText = `${dateText(s.day).slice(5)} (${DOW[ymd(s.day).dow]})`;

  const header = (
    <div className="rounded-2xl border border-white/10 p-3 shadow-xl" style={{ background: "linear-gradient(135deg, #2a3b5a, #121826 70%)" }}>
      <div className="flex gap-2.5">
        <PlayerPhoto id={-1} name={s.name} size={52} src={s.photo} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-black text-base text-white truncate">{withTag(s.name, s.clan ? CLAN_BY_ID[s.clan.id]?.tag : undefined)}</span>
            <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-white/10 text-white whitespace-nowrap">{RACE_NAMES[s.race].slice(0, 1)} · {CONCEPTS[s.concept].name}</span>
            <TitleBadge id={s.title} className="hidden min-[380px]:inline" />
          </div>
          <div className="text-[11px] text-sky-200 truncate">
            {s.fa ? `FA (${dateText(s.fa.until).slice(5)}까지)` : STATUS_NAMES[s.status]}{s.team ? ` · ${ORIG_TEAMS[s.team.team].short} ${s.team.squad}군` : s.status === "semipro" && s.semiproUntil !== undefined ? ` (~${dateText(s.semiproUntil).slice(2)})` : ""}{s.clan ? ` · [${CLAN_BY_ID[s.clan.id]?.tag}]` : ""} <FormBadge s={s} />
          </div>
          <LevelBar s={s} compact />
        </div>
        <div className="text-right shrink-0">
          <div className="text-amber-300 font-black text-sm">{s.money.toLocaleString()}<span className="text-[10px]">만</span></div>
          <div className="text-[11px] font-black" style={{ color: GRADE_COLOR[grade] }}>{grade} · {s.ladder.score}</div>
          <div className="text-[10px] text-neutral-400">인지도 {s.fame}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-neutral-300">
        <Bar label="컨디션" v={s.cond} color={s.cond >= 65 ? "#8fe07a" : s.cond >= 40 ? "#f8e070" : "#ff6b6b"} />
        <Bar label="사기" v={s.morale} color="#8fd0ff" />
        <Bar label={`능력 ${total.toLocaleString()}`} v={Math.round((total / today.cap) * 100)} color="#c9a0ff" />
      </div>
    </div>
  );

  // 알림 띠
  const banners: ReactNode[] = [];
  if (s.bracket) banners.push(<Banner key="br" icon={s.bracket.kind === "courage" ? "🎓" : "🏆"} title={`${s.bracket.title} 진행 중`} desc={`${roundName(s.bracket.size, s.bracket.round)} · 내 경기를 한 판씩 치르세요`} action="이어서" onClick={() => go("home")} />);
  if (s.war) banners.push(<Banner key="wr" icon="⚔️" title="클랜전 진행 중" desc={s.war.phase === "entry" ? "길드장이 엔트리를 짜야 합니다" : `${s.war.score[0]} : ${s.war.score[1]} · 다음 세트를 진행하세요`} action="이어서" onClick={() => go("home")} />);
  if (today.openEvents > 0) banners.push(<Banner key="oe" icon="🎪" title={`신청할 수 있는 대회가 ${today.openEvents}개 있어요!`} desc="신청해 두면 그날 직접 참가합니다 (놓치면 불참)" action="대회 보기" onClick={() => go("events")} />);
  if (s.nego) banners.push(<Banner key="n" icon="💼" title="연봉 협상 중" desc={`구단 제시 월급 ${s.nego.offer}만원 · ${dateText(s.nego.until).slice(5)}까지`} action="협상" onClick={() => go("more", "team")} />);
  if (s.offers.length) banners.push(<Banner key="o" icon="📨" title={`${s.fa ? "영입" : "이적"} 제안 ${s.offers.length}건`} desc="구단 화면에서 확인하세요" action="보기" onClick={() => go("more", "team")} />);

  type Act = { icon: string; label: string; desc: string; onClick: () => void; disabled?: boolean; hide?: boolean };
  const actGrid = (acts: Act[], cols = 3) => (
    <div className={cn("grid gap-1.5", cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {acts.filter(a => !a.hide).map(a => (
        <button key={a.label} onClick={a.onClick} disabled={a.disabled} className={cn("rounded-xl bg-card border border-border text-left disabled:opacity-40 active:scale-[0.98]", cols === 4 ? "px-1 py-2 text-center" : "px-2 py-2")}>
          {cols === 4 ? (
            <><div className="text-xl leading-none">{a.icon}</div><div className="text-[12px] font-black text-foreground truncate mt-1">{a.label}</div><div className="text-[9.5px] text-muted-foreground truncate">{a.desc}</div></>
          ) : (
            <><div className="flex items-center gap-1.5"><span className="text-lg leading-none">{a.icon}</span><span className="text-[13px] font-black text-foreground truncate">{a.label}</span></div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">{a.desc}</div></>
          )}
        </button>
      ))}
    </div>
  );
  const shortcuts: Act[] = [
    { icon: "🛒", label: "상점", desc: "비타·장비", onClick: () => go("shop") },
    { icon: "🏆", label: "대회", desc: today.openEvents ? `신청 가능 ${today.openEvents}` : `${s.events.filter(e => e.day >= s.day && !e.result).length}개 예정`, onClick: () => go("events") },
    { icon: "🛡️", label: "클랜", desc: s.clan ? `${today.clanRank}위` : "가입하기", onClick: () => go("clan") },
    { icon: "📅", label: "달력", desc: "일정", onClick: () => open("calendar") },
  ];
  const section = (title: string, extra?: ReactNode) => <div className="flex items-center justify-between px-0.5 pt-1"><span className="text-[12px] font-black text-foreground">{title}</span>{extra}</div>;
  const overlays = (
    <>
      {busy && <BatchRunning label={actTitle || "하루"} />}
      {report && <ReportView res={report} nextStop={nextText} onClose={() => setReport(null)} />}
    </>
  );

  // 하위 화면 (뒤로 가기 막대)
  if (view !== "home") {
    const sub: Record<string, ReactNode> = {
      shop: <ShopView s={s} />,
      team: <TeamView s={s} />,
      calendar: <RookieCalendar s={s} />,
      log: <LogView s={s} />,
      mentor: <MentorView s={s} busy={busy} onAct={a => { open("home"); doAct(a, "📚 멘토 과외"); }} />,
      fans: <FanView s={s} />,
      ach: <AchView s={s} />,
      rank: <RankView />,
    };
    return (
      <Shell onHome={() => go("home")} sub={SUB_TITLES[view]} onBack={() => open("home")}>
        <div className="p-3 space-y-3 max-w-lg mx-auto">{sub[view]}</div>
        {overlays}
        <TabBar tab={tab} go={go} today={today} />
      </Shell>
    );
  }

  return (
    <Shell onHome={() => go("home")}>
      <div className="p-3 space-y-2.5 max-w-lg mx-auto pb-24">
        {header}
        {tab === "home" && (
          <>
            <WeekStrip s={s} picks={today.weekPicks} onOpenCalendar={() => open("calendar")} />
            {banners.filter(b => !["br", "wr"].includes((b as { key?: string }).key ?? ""))}
            {s.war ? <ClanWarPanel s={s} war={s.war} busy={busy} onEntry={names => warEntry.mutate({ names })} onPlay={quick => warPlay.mutate({ quick })} /> : s.bracket ? <BracketPanel s={s} b={s.bracket} busy={busy} onPlay={quick => bracketPlay.mutate({ quick })} /> : <TodayPanel s={s} today={today} busy={busy} onAct={a => doAct(a, ACT_NAMES[a.kind])} onLadderMaps={sel => ladderMaps.mutate({ sel })} onOpen={v => (v === "mentor" ? open("mentor") : go("events"))} />}
            {section("✨ 바로가기")}
            {actGrid(shortcuts, 4)}
            <RivalCard s={s} />
            <div className="rounded-xl bg-card border border-border p-2.5 space-y-0.5">
              <button onClick={() => open("log")} className="w-full flex justify-between text-xs font-bold text-foreground mb-0.5"><span>📰 최근 소식</span><span className="text-muted-foreground font-normal">전체 ›</span></button>
              {s.log.slice(0, 4).map((l, i) => <div key={i} className="text-[11.5px] text-foreground/90 truncate"><span className="text-muted-foreground">{dateText(l.day).slice(5)}</span> {l.icon} {l.text}</div>)}
            </div>
          </>
        )}
        {tab === "events" && (
          <>
            {banners.filter(b => !["oe", "br", "wr"].includes((b as { key?: string }).key ?? ""))}
            <EventsView s={s} />
          </>
        )}
        {tab === "grow" && (
          <>
            {actGrid([
              { icon: "📚", label: "멘토 과외", desc: s.mentorDay === s.day ? "오늘은 받았음" : "프로에게 배우기", onClick: () => open("mentor") },
              { icon: "🛒", label: "상점·가방", desc: "비타·장비·포션", onClick: () => go("shop") },
            ], 2)}
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <LevelBar s={s} />
              <div className="text-[10.5px] text-muted-foreground">레벨이 오를 때마다 능력치가 조금 오르고 성장 한계가 +40 늘어납니다. 공방은 조금, 래더·대회·클랜 가입·입단·우승은 경험치를 많이 줍니다.</div>
              <GrowthChart s={s} cap={today.cap} />
            </div>
            <StatsCard s={s} />
          </>
        )}
        {tab === "shop" && <ShopView s={s} />}
        {tab === "clan" && <ClanView s={s} today={today} busy={busy} onAct={(a, title) => doAct(a, title)} />}
        {tab === "more" && (
          <>
            {actGrid([
              { icon: "🏢", label: "구단", desc: s.team ? `${ORIG_TEAMS[s.team.team].short} ${s.team.squad}군` : s.fa ? "FA · 구단 찾기" : "프로가 되면", onClick: () => open("team") },
              { icon: "💌", label: "팬카페", desc: `회원 ${s.fanCafe.members.toLocaleString()}명`, onClick: () => open("fans") },
              { icon: "🏅", label: "업적·칭호", desc: `${Object.keys(s.achievements).length}개 달성`, onClick: () => open("ach") },
              { icon: "📊", label: "랭킹", desc: "다른 유저 선수", onClick: () => open("rank") },
              { icon: "📅", label: "달력", desc: "한 일 · 일정", onClick: () => open("calendar") },
              { icon: "📜", label: "기록", desc: `${s.record.w}승 ${s.record.l}패`, onClick: () => open("log") },
            ], 3)}
            <UpcomingLine s={s} />
            <button onClick={() => confirm("지금 선수를 그만두고 새 선수를 만들까요? (지금 기록은 사라집니다)") && onRestart()} className="w-full text-[11px] text-muted-foreground py-1">🔄 새 선수 만들기</button>
          </>
        )}
      </div>
      {overlays}
      <TabBar tab={tab} go={go} today={today} />
    </Shell>
  );
}
const ACT_NAMES: Record<Activity["kind"], string> = {
  lobby: "공방 연습", ladder: "래더", clan: "클랜 연습", internal: "팀 내부 연습", stream: "방송", rest: "휴식", work: "아르바이트",
  mentor: "멘토 과외", clanTest: "클랜 입단 시험", tryout: "입단 테스트", event: "대회", courage: "커리지 매치", draft: "드래프트", promo: "승강전", friendly: "친선경기", war: "클랜전",
};

/** 아래 탭 */
function TabBar({ tab, go, today }: { tab: Tab; go: (t: Tab) => void; today: RookieToday }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-lg mx-auto grid grid-cols-6">
        {TABS.map(([k, icon, label]) => (
          <button key={k} onClick={() => go(k)} className={cn("py-2 flex flex-col items-center gap-0.5 relative", tab === k ? "text-primary" : "text-muted-foreground")}>
            <span className="text-lg leading-none">{icon}</span>
            {k === "events" && today.openEvents > 0 && <span className="absolute top-1 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center animate-pulse">{today.openEvents}</span>}
            <span className="text-[10.5px] font-bold">{label}</span>
          </button>
        ))}
      </div>
    </nav>
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
    <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-2.5 py-2 flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-black text-foreground truncate">{title}</div>
        <div className="text-[10.5px] text-muted-foreground">{desc}</div>
        {note && <div className="text-[10px] text-rose-300">{note}</div>}
      </div>
      <button onClick={onClick} disabled={disabled} className="shrink-0 rounded-lg bg-amber-500 text-black font-black text-xs px-3 py-1.5 disabled:opacity-40">{action}</button>
    </div>
  );
}

/** 다가오는 큰 일정 */
function UpcomingLine({ s }: { s: RookieState }) {
  const y = ymd(s.day).y;
  const list: Array<[number, string]> = [];
  if (!s.team) {
    const nextCourage = [...courageDays(y), ...courageDays(y + 1)].find(d => d >= s.day);
    if (nextCourage !== undefined) list.push([nextCourage, "🎓 커리지 매치 (매달 마지막 날)"]);
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
        <LegacyRadar stats={s.stats} level={s.level} size={130} />
        <div className="flex-1 grid grid-cols-1 text-[12px]">
          {STAT_KEYS.map(k => (
            <div key={k} className="flex justify-between border-b border-neutral-800 py-[1px]">
              <span className="text-neutral-400">{STAT_LABELS[k]}</span>
              <span><b>{s.stats[k]}</b>{gear[k] ? <span className="text-[#8fd0ff] text-[10px]"> +{gear[k]}</span> : null} <span className={cn("text-[10px]", s.stats[k] >= s.startStats[k] ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>({s.stats[k] - s.startStats[k] >= 0 ? "+" : ""}{s.stats[k] - s.startStats[k]})</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">괄호 = 처음보다 오른 만큼 · 파란 숫자 = 장비 효과</div>
    </div>
  );
}

// ── 대회 ─────────────────────────────────────────────────────
function EventsView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const reg = trpc.rookie.register.useMutation(sync);
  const list = s.events.filter(e => e.day >= s.day || e.result).sort((a, b) => a.day - b.day);
  const total = sumStats(s.stats);
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-muted-foreground">신청해 둔 대회는 그날이 직접 고르는 날이 되어 참가합니다 (다른 활동을 고르면 불참). 3위까지 상금! 참가비는 신청할 때 내고, 취소하면 돌려받습니다.</div>
      {list.map(e => {
        const r = eventReq(e);
        const lock = total < r.total ? `능력치 ${r.total.toLocaleString()} 이상` : r.ladder && s.ladder.best < r.ladder ? `래더 ${r.ladder}점 이상 달성` : null;
        return (
          <div key={e.id} className={cn("rounded-2xl border p-3 space-y-1", e.registered ? "bg-amber-500/10 border-amber-400/50" : "bg-card border-border")}>
            <div className="flex items-center gap-2">
              <span className="font-black text-foreground flex-1 truncate">🏆 {e.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{dateText(e.day).slice(5)} ({DOW[ymd(e.day).dow]}){e.day === s.day ? " · 오늘" : ` · D-${e.day - s.day}`}</span>
            </div>
            <div className="text-[11.5px] text-muted-foreground">{e.size}강 · {TIERS[e.level].name}급 · 상금 {e.prize[0]} / {e.prize[1]} / {e.prize[2]}만 · {e.fee ? <b className="text-amber-300">참가비 {e.fee}만</b> : "참가비 없음"}</div>
            <div className="flex flex-wrap gap-1">
              {r.total > 0 && <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 border", total >= r.total ? "border-emerald-400/50 text-emerald-300" : "border-rose-400/50 text-rose-300")}>{total >= r.total ? "✓" : "✗"} 능력치 {r.total.toLocaleString()}+</span>}
              {r.ladder && <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 border", s.ladder.best >= r.ladder ? "border-emerald-400/50 text-emerald-300" : "border-rose-400/50 text-rose-300")}>{s.ladder.best >= r.ladder ? "✓" : "✗"} 래더 최고 {r.ladder}+</span>}
            </div>
            {e.result ? <div className="text-xs text-amber-300 font-bold">결과: {e.result}</div> : (
              <button onClick={() => reg.mutate({ id: e.id })} disabled={reg.isPending || (!e.registered && (!!lock || s.money < (e.fee ?? 0)))} className={cn("w-full rounded-xl py-1.5 text-xs font-black border disabled:opacity-40", e.registered ? "border-rose-400/60 text-rose-300" : "bg-amber-500 text-black border-amber-500")}>
                {e.registered ? `신청 취소${e.fee ? ` (참가비 ${e.fee}만 환불)` : ""}` : lock ? `🔒 ${lock}` : s.money < (e.fee ?? 0) ? `참가비 ${e.fee}만원 부족` : `참가 신청${e.fee ? ` (-${e.fee}만)` : ""}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 상점·가방 ────────────────────────────────────────────────
type ShopTab = "stock" | "mouse" | "keyboard" | "monitor" | "etc" | "potion";
const SHOP_TABS: Array<[ShopTab, string]> = [["stock", "회복"], ["mouse", "마우스"], ["keyboard", "키보드"], ["monitor", "모니터"], ["etc", "기타장비"], ["potion", "포션"]];
function ShopView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const buy = trpc.rookie.buy.useMutation(sync);
  const use = trpc.rookie.use.useMutation(sync);
  const [tab, setTab] = useState<ShopTab>("stock");
  const [q, setQ] = useState("");
  const isEquipTab = tab !== "stock" && tab !== "potion";
  const items = ITEMS.filter(it => !it.notForSale && (isEquipTab ? it.kind === "equip" && slotOf(it) === tab : it.kind === tab) && (!q || it.name.includes(q) || it.effect.join(" ").includes(q)));
  const owned = Object.entries(s.inventory).filter(([k, n]) => n > 0 && ITEM_BY_KEY[k] && (isEquipTab ? slotOf(ITEM_BY_KEY[k]) === tab : ITEM_BY_KEY[k].kind === tab));
  const eq = isEquipTab ? s.equip[tab as keyof typeof s.equip] : undefined;
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-card border border-border">
        {SHOP_TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("py-1.5 rounded-lg text-[12.5px] font-bold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 아이템 이름·효과 검색" className="w-full rounded-xl bg-card border border-border px-3 py-1.5 text-sm text-foreground" />
      {isEquipTab && (
        <div className="rounded-xl bg-sky-500/10 border border-sky-400/40 px-3 py-2 text-[12px] text-foreground flex items-center gap-2">
          {eq ? <><ItemIcon k={eq.key} /><span className="flex-1">착용 중: <b>{ITEM_BY_KEY[eq.key]?.name}</b> <span className="text-muted-foreground">({eq.left}판 남음)</span></span></> : <span className="text-muted-foreground">{SLOT_NAMES[tab as keyof typeof SLOT_NAMES]} 착용 안 함</span>}
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border p-2.5 space-y-1.5">
        <div className="text-[12.5px] font-bold text-foreground">🎒 가방 {tab === "stock" && <span className="text-xs text-muted-foreground font-normal">· 회복 아이템 오늘 {s.vitaToday}/{VITA_PER_DAY}</span>}</div>
        {!owned.length && <div className="text-xs text-muted-foreground">이 종류는 가진 게 없습니다</div>}
        {owned.map(([k, n]) => {
          const it = ITEM_BY_KEY[k];
          return (
            <div key={k} className="flex items-center gap-2">
              <ItemIcon k={k} />
              <span className="flex-1 text-sm text-foreground truncate">{it.name} <span className="text-xs text-muted-foreground">×{n}</span></span>
              <button onClick={() => use.mutate({ key: k })} disabled={use.isPending} className="rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-bold px-2.5 py-1">{it.kind === "equip" ? (eq ? "교체" : "착용") : "사용"}</button>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {items.map(it => (
          <div key={it.key} className="rounded-xl bg-card border border-border p-2 flex items-center gap-2">
            <ItemIcon k={it.key} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-foreground truncate">{it.name}</div>
              <div className="text-[10.5px] text-muted-foreground truncate">{isEquipTab ? `${it.effect.join(" ")} (효과 절반 · ${(it.uses ?? 10) * 2}판)` : tab === "stock" ? `컨디션 +${(it.cond ?? 3) * 2}` : `${it.effect.join(" ")} (효과 절반)`}</div>
            </div>
            <button onClick={() => buy.mutate({ key: it.key, qty: 1 })} disabled={buy.isPending || s.money < price(it.key)} className="shrink-0 rounded-lg bg-amber-500 text-black text-xs font-black px-2.5 py-1.5 disabled:opacity-40">{price(it.key)}만</button>
          </div>
        ))}
        {!items.length && <div className="text-xs text-muted-foreground text-center py-3">찾는 아이템이 없습니다</div>}
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
        <div>· 매달 마지막 날 열리는 커리지 매치(32강 토너먼트)에서 우승하면 준프로 (능력치가 정말 높으면 구단이 입단 경기를 제의)</div>
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
