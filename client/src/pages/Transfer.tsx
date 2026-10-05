/**
 * 이적 (원작 화면 방식): Bid(영입 요청) · Trade(트레이드) · Scout(무소속 영입) · Fire(방출)
 * 한 화면에 다 들어가게: 위 = 탭·소식 한 줄, 가운데 = 선수 목록 | 고른 선수 카드, 아래 = 실행 칸 (페이지는 스크롤하지 않음)
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import { AFTER_SEASON_FEE, B_MAX_ROSTER, MAX_ROSTER, ageOf, askingPrice, totalOf, type CareerState, type CPlayer, type TransferTiming } from "@shared/career/rules";
import { bTeamIdOf, evaluateTrade, myDiv, proTeams, rosterOf } from "@shared/career/view";
import { useCareer, useCareerPatch, useCareerUpdater } from "@/lib/career";
import type { CareerDiff } from "@shared/career/diff";
import { LegacyFrame, LegacyImg, PlayerPhoto, TeamLogo } from "@/components/legacy/Legacy";
import { PlayerPanel, condStats } from "@/components/legacy/LegacyMatch";
import { ContractEditor, ContractText, FeeStepper, Reply } from "@/components/legacy/Club";
import { playerDemand, potentialStars, scoutPrice } from "@shared/career/contract";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
type Mode = "bid" | "trade" | "scout" | "fire";
const MODES: Array<[Mode, string, string]> = [["bid", "영입 요청", "Bid"], ["trade", "트레이드", "Trade"], ["scout", "스카웃", "Scout"], ["fire", "방출", "Fire"]];

const byTotal = (a: CPlayer, b: CPlayer) => totalOf(b.stats) - totalOf(a.stats);
const BTN = "w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500 disabled:opacity-40";
const BTN_BG = { background: "linear-gradient(#ffffff,#d6d6d6)" };

/** 선수 목록 (여러 명 선택 가능) — 높이는 부모가 정함 (안에서만 스크롤) */
function PickList({ players, picked, onToggle, right, viewing }: {
  players: CPlayer[]; picked: number[]; onToggle: (p: CPlayer) => void; right?: (p: CPlayer) => string;
  /** 지금 카드에 보이는 선수 */
  viewing?: number;
}) {
  return (
    <div className="h-full min-h-0 border-2 border-neutral-300 p-0.5 overflow-y-auto overscroll-contain">
      {players.map(p => (
        <button key={p.id} onClick={() => onToggle(p)}
          className={cn("w-full flex items-center gap-1 text-[12px] px-1 py-[5px] text-left border-b border-neutral-800 last:border-b-0",
            picked.includes(p.id) ? "bg-[#3a3a5a] text-[#ffe45c]" : viewing === p.id ? "bg-neutral-800 text-white" : "text-white")}>
          <span className="truncate flex-1">{p.name} <span className="text-neutral-400">{R[p.race]}</span></span>
          <span className="text-[10px] text-neutral-400 shrink-0">{right ? right(p) : totalOf(condStats(p)).toLocaleString()}</span>
        </button>
      ))}
      {!players.length && <div className="text-[11px] text-neutral-500 p-2 text-center">선수가 없습니다</div>}
    </div>
  );
}

/** 고른 선수 카드 (사진·능력치 그래프 바로 보임) */
function Card({ s, p, empty, color = "#ff9a9a", children }: { s: CareerState; p?: CPlayer; empty: string; color?: string; children?: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-1">
      <PlayerPanel p={p} s={s} color={color} empty={empty} />
      {p && children}
    </div>
  );
}

/** 목록 | 카드 두 칸 (남은 높이를 다 씀) */
const Split = ({ children }: { children: React.ReactNode }) => (
  <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_178px] gap-1.5">{children}</div>
);

/** 아래 실행 칸 */
const Actions = ({ children }: { children: React.ReactNode }) => (
  <div className="shrink-0 border-t-2 border-neutral-600 pt-1.5 space-y-1 text-[12px]">{children}</div>
);

/** 팀 고르기 (작은 로고, 한 줄에 8개) */
function TeamPicker({ teams, value, onPick }: { teams: CareerState["teams"]; value: number; onPick: (id: number) => void }) {
  return (
    <div className="shrink-0 grid grid-cols-8 gap-0.5">
      {teams.map(t => (
        <button key={t.id} onClick={() => onPick(t.id)} title={t.name} className={cn("p-0.5 border", value === t.id ? "border-[#ff6b6b] border-2" : "border-neutral-700")}>
          <TeamLogo team={t} className="w-full h-[17px]" />
        </button>
      ))}
    </div>
  );
}

const money = (s: CareerState) => s.teams[s.myTeam].money;

/** 다른 팀 선수 영입 요청: 이적료 협상(합의·보류·거절) → 선수 계약 협상 */
function BidTab({ s, focus }: { s: CareerState; /** 답이 온 요청에서 "이어서 협상"으로 들어오면 그 선수 */ focus?: number }) {
  const patch = useCareerPatch();
  const teams = proTeams(s).filter(t => t.id !== s.myTeam).sort((a, b) => (a.div ?? 1) - (b.div ?? 1) || a.id - b.id);
  const focused = focus !== undefined ? s.players[focus] : undefined;
  const [teamId, setTeamId] = useState(focused?.team ?? teams[0]?.id ?? 0);
  const [sel, setSel] = useState<number | undefined>(focused?.id);
  const lastReply = focused ? (s.outbox ?? []).find(r => r.kind === "bid" && r.player === focused.id && r.reply) : undefined;
  const [fee, setFee] = useState(lastReply?.reply?.fee ?? lastReply?.fee ?? 0);
  const [reply, setReply] = useState<{ text: string; ok: boolean } | null>(null);
  const [timing, setTiming] = useState<TransferTiming>("now");
  const theirs = useMemo(() => rosterOf(s, teamId).sort(byTotal), [s, teamId]);
  const p = sel !== undefined ? s.players[sel] : undefined;
  const deal = p ? s.agreements?.[p.id] : undefined;
  const agreed = !!deal && deal.season === s.season && deal.week === s.week && deal.team === p!.team;
  // 시즌 중엔 요청을 보내고 우리 다음 경기 뒤(또는 다음 주)에 답이 옴 (답이 온 주에는 바로 협상)
  const waiting = p ? (s.outbox ?? []).find(r => r.kind === "bid" && r.player === p.id && !r.reply) : undefined;
  const talking = p ? (s.outbox ?? []).some(r => r.kind === "bid" && r.player === p.id && r.reply?.season === s.season && r.reply.week === s.week) : false;
  const direct = s.phase === "offseason" || talking;
  const onDone = (r: { diff: CareerDiff; result: unknown }) => {
    patch(r.diff);
    const res = r.result as { result: string; message: string; fee?: number };
    setReply({ text: res.message, ok: res.result === "agreed" || res.result === "signed" || res.result === "sent" });
    if (res.result === "countered" && res.fee) setFee(res.fee);
    if (res.result === "signed") setSel(undefined);
  };
  const onFail = (e: { message: string }) => setReply({ text: e.message, ok: false });
  const bid = trpc.career.bid.useMutation({ onSuccess: onDone, onError: onFail });
  const contract = trpc.career.contract.useMutation({ onSuccess: onDone, onError: onFail });
  // 우리 구단 B팀 선수는 시세의 절반에 데려올 수 있음
  const myB = bTeamIdOf(s, s.myTeam);
  const priceOf = (x: CPlayer) => Math.round((askingPrice(x, s.season) * (x.team === myB ? 0.5 : 1)) / 10) * 10;
  const pick = (x: CPlayer) => { setSel(x.id); setFee(Math.round((priceOf(x) * (timing === "after" ? AFTER_SEASON_FEE : 1)) / 10) * 10); setReply(null); };
  const canAfter = s.phase !== "offseason";
  return (
    <>
      <TeamPicker teams={teams} value={teamId} onPick={id => { setTeamId(id); setSel(undefined); setReply(null); }} />
      <Split>
        <PickList players={theirs} picked={sel !== undefined ? [sel] : []} onToggle={pick}
          right={x => `${x.wantsOut ? "희망·" : ""}${priceOf(x).toLocaleString()}만`} />
        <Card s={s} p={p} empty="영입할 선수를 고르세요">
          {p && (
            <div className="text-[10.5px] text-neutral-400 leading-tight">
              {s.teams[p.team]?.short} · {ageOf(p, s.season)}세 · 시세 <b className="text-[#ffe45c]">{priceOf(p).toLocaleString()}만</b>{p.team === myB ? " (B팀 50%)" : ""}<br />
              계약 <ContractText c={p.contract} />{p.wantsOut ? <span className="text-[#ffb84d]"> · 이적 희망</span> : null}
            </div>
          )}
        </Card>
      </Split>
      <Actions>
        {reply && <Reply {...reply} />}
        {!p ? (
          <div className="text-center text-neutral-500 py-1">선수를 고르면 여기서 바로 이적료를 제시합니다 · 보유 {money(s).toLocaleString()}만</div>
        ) : !agreed ? (
          <>
            {canAfter && (
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                {([["now", "즉시 이적"], ["after", `시즌 후 이적 (약 ${Math.round((1 - AFTER_SEASON_FEE) * 100)}% 싸게)`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setTiming(k); setFee(Math.round((priceOf(p) * (k === "after" ? AFTER_SEASON_FEE : 1)) / 10) * 10); }}
                    className={cn("border py-0.5", timing === k ? "border-[#ffe45c] text-[#ffe45c]" : "border-neutral-700 text-neutral-400")}>{l}</button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-1">
              <span className="text-neutral-400 shrink-0">이적료</span>
              <FeeStepper value={fee} onChange={setFee} max={money(s)} />
            </div>
            <button disabled={bid.isPending || !!waiting} onClick={() => bid.mutate({ playerId: p.id, fee, timing: canAfter ? timing : "now" })} className={BTN} style={BTN_BG}>
              {bid.isPending ? "보내는 중..." : waiting ? "요청 보냄 · 답을 기다리는 중" : direct ? `${p.name} 이적료 제시 (바로 협상)` : `${p.name} 영입 요청 (다음 경기 뒤 답)`}
            </button>
          </>
        ) : (
          <>
            <div className="text-center text-[11.5px] text-[#bff5c6]">이적료 {deal!.fee.toLocaleString()}만원 합의{deal!.timing === "after" ? " (시즌 후 합류)" : ""} · 이번 주 안에 선수와 계약하세요</div>
            <ContractEditor player={p} demand={playerDemand(s, p, s.myTeam)} pending={contract.isPending}
              onSubmit={c => contract.mutate({ playerId: p.id, salary: c.salary, years: c.years, minApps: c.minApps, bonus: c.bonus })} />
          </>
        )}
      </Actions>
    </>
  );
}

/** 트레이드: 양쪽 목록 + 마지막으로 누른 선수 카드(작게) */
function TradeTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const teams = proTeams(s).filter(t => t.id !== s.myTeam).sort((a, b) => (a.div ?? 1) - (b.div ?? 1) || a.id - b.id);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? 0);
  const [give, setGive] = useState<number[]>([]);
  const [take, setTake] = useState<number[]>([]);
  const [cash, setCash] = useState(0);
  const [view, setView] = useState<number | undefined>();
  const mine = useMemo(() => rosterOf(s, s.myTeam).sort(byTotal), [s]);
  const theirs = useMemo(() => rosterOf(s, teamId).sort(byTotal), [s, teamId]);
  const ev = take.length ? evaluateTrade(s, teamId, give, take, cash) : null;
  const trade = trpc.career.trade.useMutation({
    ...updater,
    onSuccess: r => {
      updater.onSuccess(r);
      const res = r.result as { result?: string; message?: string };
      if (res.result === "sent") toast.info(res.message ?? "트레이드를 제안했습니다. 우리 다음 경기가 끝나면 답이 옵니다");
      else toast.success("트레이드 성사!");
      setGive([]); setTake([]); setCash(0);
    },
  });
  const toggle = (list: number[], set: (v: number[]) => void) => (p: CPlayer) => {
    setView(p.id);
    set(list.includes(p.id) ? list.filter(x => x !== p.id) : list.length >= 5 ? list : [...list, p.id]);
  };
  const ratio = ev ? Math.min(1.5, ev.get / Math.max(1, ev.need)) : 0;
  const vp = view !== undefined ? s.players[view] : undefined;
  const answered = (s.outbox ?? []).some(r => r.kind === "trade" && r.team === teamId && r.reply?.season === s.season && r.reply.week === s.week);
  const waiting = (s.outbox ?? []).some(r => r.kind === "trade" && r.team === teamId && !r.reply);

  return (
    <>
      <TeamPicker teams={teams} value={teamId} onPick={id => { setTeamId(id); setTake([]); }} />
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-1.5 grid-rows-[auto_minmax(0,1fr)]">
        <div className="text-[11px] text-[#8fd0ff] truncate">우리 팀 · 내줄 선수 {give.length}/5</div>
        <div className="text-[11px] text-[#ff9a9a] truncate">{s.teams[teamId]?.name} · 받을 선수 {take.length}/5</div>
        <PickList players={mine} picked={give} onToggle={toggle(give, setGive)} viewing={view} />
        <PickList players={theirs} picked={take} onToggle={toggle(take, setTake)} viewing={view} />
      </div>
      {vp && (
        <div className="shrink-0 flex items-center gap-2 border border-neutral-700 px-1.5 py-1">
          <PlayerPhoto id={vp.photoOf ?? vp.id} name={vp.name} titles={vp.titles} size={34} />
          <div className="flex-1 min-w-0 text-[11px] leading-tight">
            <div className="text-[12.5px] truncate" style={{ color: vp.team === s.myTeam ? "#8fd0ff" : "#ff9a9a" }}>{vp.name} ({R[vp.race]}) · Lv.{vp.level}</div>
            <div className="text-neutral-400 truncate">{ageOf(vp, s.season)}세 · 컨디션 {vp.cond}% · 능력치 {totalOf(vp.stats).toLocaleString()} · 시세 {askingPrice(vp, s.season).toLocaleString()}만</div>
          </div>
        </div>
      )}
      <Actions>
        <div className="flex items-center justify-between gap-1">
          <span className="text-neutral-400 shrink-0">현금 추가</span>
          <FeeStepper value={cash} onChange={setCash} max={money(s)} />
        </div>
        {ev ? (
          <>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-neutral-400 shrink-0">제시 {ev.get.toLocaleString()} / 요구 {ev.need.toLocaleString()}{ev.acesInvolved ? " (에이스)" : ""}</span>
              <div className="flex-1 h-2 bg-neutral-800"><div className="h-full" style={{ width: `${Math.min(100, ratio * 66.6)}%`, background: ev.get >= ev.need ? "#8fe07a" : "#f4b060" }} /></div>
            </div>
            <div className={cn("text-center text-[11px]", ev.get >= ev.need ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{ev.get >= ev.need ? "상대가 수락할 만한 조건입니다" : `${(ev.need - ev.get).toLocaleString()} 만큼 더 필요합니다`}</div>
          </>
        ) : <div className="text-center text-neutral-500 text-[11px]">받을 선수를 고르세요 · 보유 {money(s).toLocaleString()}만</div>}
        <button disabled={!take.length || trade.isPending || waiting} onClick={() => trade.mutate({ teamId, give, take, cash })} className={BTN} style={BTN_BG}>
          {s.phase === "offseason" || answered ? "트레이드 제안 (바로 답)" : waiting ? "이미 제안함 · 답 대기" : "트레이드 제안 (다음 경기 뒤 답)"}
        </button>
      </Actions>
    </>
  );
}

function ScoutTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const [sel, setSel] = useState<number | undefined>();
  const [race, setRace] = useState<"all" | "terran" | "zerg" | "protoss">("all");
  const list = useMemo(() => rosterOf(s, FREE_AGENT_TEAM).filter(p => race === "all" || p.race === race).sort(byTotal), [s, race]);
  const scout = trpc.career.scout.useMutation({
    ...updater,
    onSuccess: r => {
      updater.onSuccess(r);
      const res = r.result as { result: string; message?: string; price?: number };
      if (res.result === "sent") toast.info(res.message ?? "영입 연락을 보냈습니다. 우리 다음 경기가 끝나면 답이 옵니다");
      else toast.success(`영입 완료! (${(res.price ?? 0).toLocaleString()}만원)`);
      setSel(undefined);
    },
  });
  const p = sel !== undefined ? s.players[sel] : undefined;
  const price = p ? scoutPrice(s, p) : 0;
  const max = myDiv(s) === 2 ? B_MAX_ROSTER : MAX_ROSTER;
  const full = rosterOf(s, s.myTeam).length >= max;
  const contacted = p ? (s.outbox ?? []).some(r => r.kind === "scout" && r.player === p.id && !r.reply) : false;
  return (
    <>
      <div className="shrink-0 grid grid-cols-4 gap-1">
        {(["all", "terran", "zerg", "protoss"] as const).map(r => (
          <button key={r} onClick={() => setRace(r)} className={cn("text-[11.5px] py-0.5 border", race === r ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>
            {r === "all" ? `전체 ${rosterOf(s, FREE_AGENT_TEAM).length}` : r === "terran" ? "테란" : r === "zerg" ? "저그" : "프로토스"}
          </button>
        ))}
      </div>
      <Split>
        <PickList players={list} picked={sel !== undefined ? [sel] : []} onToggle={x => setSel(x.id)} right={x => `${ageOf(x, s.season)}세 ${potentialStars(x)} ${scoutPrice(s, x).toLocaleString()}만`} />
        <Card s={s} p={p} color="#ffe45c" empty="영입할 무소속 선수를 고르세요">
          {p && <div className="text-[10.5px] text-neutral-400">{ageOf(p, s.season)}세 · 잠재력 {potentialStars(p)}</div>}
        </Card>
      </Split>
      <Actions>
        <div className="flex justify-between"><span className="text-neutral-400">요구 금액 <b className="text-[#ffb8c8]">{p ? `${price.toLocaleString()}만` : "-"}</b></span><span className="text-neutral-400">보유 <b className="text-[#ffe45c]">{money(s).toLocaleString()}만</b></span></div>
        <button disabled={!p || full || scout.isPending || money(s) < price || contacted} onClick={() => p && scout.mutate({ playerId: p.id })} className={BTN} style={BTN_BG}>
          {full ? `선수단이 가득 찼습니다 (${max}명)` : contacted ? "연락함 · 답 대기" : !p ? "선수를 고르세요" : s.phase === "offseason" ? `${p.name} 영입` : `${p.name} 영입 연락 (다음 경기 뒤 답)`}
        </button>
      </Actions>
    </>
  );
}

function FireTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const [sel, setSel] = useState<number | undefined>();
  const mine = useMemo(() => rosterOf(s, s.myTeam).sort(byTotal), [s]);
  const release = trpc.career.release.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`방출 완료 (방출 이득 ${r.result.gain.toLocaleString()}만원)`); setSel(undefined); },
  });
  const p = sel !== undefined ? s.players[sel] : undefined;
  const gain = p ? Math.round((askingPrice(p, s.season) * 0.2) / 10) * 10 : 0;
  return (
    <>
      <div className="shrink-0 text-center text-[11.5px] text-neutral-300">방출할 선수 선택 <span className="text-neutral-500">({mine.length}/{MAX_ROSTER}명 · 최소 8명)</span></div>
      <Split>
        <PickList players={mine} picked={sel !== undefined ? [sel] : []} onToggle={x => setSel(x.id)} />
        <Card s={s} p={p} color="#8fd0ff" empty="방출할 선수를 고르세요">
          {p && <div className="text-[10.5px] text-neutral-400">계약 <ContractText c={p.contract} /></div>}
        </Card>
      </Split>
      <Actions>
        <div className="flex justify-between"><span className="text-neutral-400">방출 이득</span><span className="text-[#bff5c6]">{p ? `${gain.toLocaleString()} 만원` : "-"}</span></div>
        <button disabled={!p || release.isPending} onClick={() => p && confirm(`${p.name} 선수를 방출할까요?`) && release.mutate({ playerId: p.id })} className={BTN} style={BTN_BG}>
          {p ? `${p.name} 방출` : "선수를 고르세요"}
        </button>
      </Actions>
    </>
  );
}

export default function Transfer() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("bid");
  const [focus, setFocus] = useState<{ player: number; n: number } | undefined>();
  const [drawer, setDrawer] = useState<"news" | "outbox" | null>(null);
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const out = (s.outbox ?? []).filter(r => !r.reply || (r.reply.season === s.season && r.reply.week === s.week));
  const replies = out.filter(r => r.reply).length;
  const latest = s.marketLog?.[0];
  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/lobby")} onNext={() => navigate("/lobby")} nextLabel="◁◁ 감독실">
      <div className="relative h-full flex flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <div className="shrink-0 grid grid-cols-4 gap-1">
          {MODES.map(([k, label, en]) => (
            <button key={k} onClick={() => setMode(k)} className={cn("flex items-center justify-center gap-0.5 py-0.5 px-0.5 border overflow-hidden", mode === k ? "border-[#ff6b6b] border-2 bg-neutral-900" : "border-neutral-700")}>
              <LegacyImg dir="기타" name={label} className="h-5 max-w-[34px] object-contain shrink-0" fallback={<span className="text-[12px] font-black italic text-neutral-200">{en}</span>} />
              <span className={cn("text-[10px] whitespace-nowrap tracking-tighter", mode === k ? "text-white" : "text-neutral-400")}>{label}</span>
            </button>
          ))}
        </div>
        {/* 소식·보낸 요청: 한 줄씩, 누르면 펼침 */}
        <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_auto] gap-1 text-[11px]">
          <button onClick={() => setDrawer("news")} className="flex items-center gap-1 border border-neutral-700 px-1.5 py-0.5 text-left min-w-0">
            <span>📰</span><span className="truncate text-neutral-300">{latest ? moveText(s, latest) : "다른 구단 이적 소식 없음"}</span><span className="text-neutral-500 shrink-0">▼</span>
          </button>
          <button onClick={() => setDrawer("outbox")} className={cn("border px-1.5 py-0.5 whitespace-nowrap", replies ? "border-[#8fe07a] text-[#bff5c6]" : "border-neutral-700 text-neutral-300")}>
            📨 요청 {out.length}{replies ? ` · 답장 ${replies}` : ""}
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          {mode === "bid" && <BidTab key={focus ? `${focus.player}-${focus.n}` : "bid"} s={s} focus={focus?.player} />}
          {mode === "trade" && <TradeTab s={s} />}
          {mode === "scout" && <ScoutTab s={s} />}
          {mode === "fire" && <FireTab s={s} />}
        </div>
        {drawer && (
          <div className="absolute inset-x-2 top-2 bottom-2 z-30 bg-black border-2 border-neutral-400 flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-2 py-1.5 border-b border-neutral-700">
              <span className="text-[13px] text-[#ffe45c]">{drawer === "news" ? "📰 다른 구단 이적 소식" : "📨 보낸 요청 · 답장"}</span>
              <button onClick={() => setDrawer(null)} className="border border-neutral-500 px-2 text-[12px]">닫기 ✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {drawer === "news" ? <MarketNews s={s} /> : <Outbox s={s} onTalk={pid => { setDrawer(null); setMode("bid"); setFocus({ player: pid, n: (focus?.n ?? 0) + 1 }); }} />}
            </div>
          </div>
        )}
      </div>
    </LegacyFrame>
  );
}

const KIND_LABEL = { bid: "영입 요청", trade: "트레이드", scout: "스카웃" } as const;

/** 보낸 요청 (답 대기) · 이번 주에 온 답 */
function Outbox({ s, onTalk }: { s: CareerState; onTalk: (pid: number) => void }) {
  const updater = useCareerUpdater();
  const cancel = trpc.career.cancelRequest.useMutation(updater);
  const list = (s.outbox ?? []).filter(r => !r.reply || (r.reply.season === s.season && r.reply.week === s.week));
  const what = (r: NonNullable<CareerState["outbox"]>[number]) =>
    r.kind === "trade" ? `${s.teams[r.team]?.name} · ${(r.take ?? []).map(id => s.players[id]?.name).join(", ")} ⇄ ${(r.give ?? []).map(id => s.players[id]?.name).join(", ")}${r.cash ? ` + ${r.cash.toLocaleString()}만` : ""}`
      : r.kind === "scout" ? `무소속 ${s.players[r.player!]?.name}` : `${s.teams[r.team]?.name} ${s.players[r.player!]?.name} · ${(r.fee ?? 0).toLocaleString()}만`;
  return (
    <div className="space-y-1.5 text-[11.5px]">
      {!list.length && <div className="text-neutral-500">보낸 요청이 없습니다</div>}
      {list.map(r => (
        <div key={r.id} className="border border-neutral-700 p-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] text-neutral-400 shrink-0">{KIND_LABEL[r.kind]}</span>
            <span className="truncate flex-1">{what(r)}</span>
            {!r.reply && <span className="text-[10.5px] text-[#ffe45c] shrink-0">답 대기 · 다음 경기 뒤</span>}
            {!r.reply && <button disabled={cancel.isPending} onClick={() => cancel.mutate({ id: r.id })} className="border border-neutral-600 px-1.5 text-[10.5px] text-neutral-300 shrink-0">취소</button>}
          </div>
          {r.reply && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className={cn("flex-1 text-[11px]", r.reply.ok ? "text-[#bff5c6]" : r.reply.result === "countered" ? "text-[#ffe45c]" : "text-[#ffb8c8]")}>📬 {r.reply.message}</span>
              {r.kind === "bid" && r.player !== undefined && s.players[r.player]?.team !== s.myTeam && (
                <button onClick={() => onTalk(r.player!)} className="border border-[#8fe07a] text-[#bff5c6] px-1.5 text-[10.5px] shrink-0">{r.reply.result === "agreed" ? "계약하기" : "이어서 협상"}</button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="text-[10px] text-neutral-500">시즌 중에는 요청을 보낸 뒤 우리 팀 다음 경기가 끝나면(그 주 경기가 없으면 다음 주에) 답이 오고, 답이 온 주에는 바로 이어서 협상할 수 있습니다 (비시즌은 바로 답)</div>
    </div>
  );
}

const MOVE_LABEL = { transfer: "이적", trade: "트레이드", release: "방출", sign: "영입" } as const;
type Move = NonNullable<CareerState["marketLog"]>[number];
const nameOf = (s: CareerState, id: number) => `${s.players[id]?.name ?? "?"}(${R[s.players[id]?.race ?? "terran"]})`;
const teamOf = (s: CareerState, id: number) => s.teams[id]?.short ?? "?";
/** 이적 소식 한 줄 */
function moveText(s: CareerState, m: Move): string {
  const fee = m.fee ? ` · ${m.fee.toLocaleString()}만` : "";
  if (m.kind === "transfer") return `${MOVE_LABEL[m.kind]} ${nameOf(s, m.players[0])} ${teamOf(s, m.teams[0])} → ${teamOf(s, m.teams[1])}${fee}`;
  if (m.kind === "trade") return `${MOVE_LABEL[m.kind]} ${teamOf(s, m.teams[0])} ${nameOf(s, m.players[0])} ⇄ ${teamOf(s, m.teams[1])} ${nameOf(s, m.players[1])}`;
  if (m.kind === "release") return `${MOVE_LABEL[m.kind]} ${teamOf(s, m.teams[0])}, ${nameOf(s, m.players[0])} → 무소속`;
  return `${MOVE_LABEL[m.kind]} ${teamOf(s, m.teams[0])}, 무소속 ${nameOf(s, m.players[0])}${fee}`;
}

/** 다른 구단끼리의 이적·트레이드·방출·무소속 영입 소식 */
function MarketNews({ s }: { s: CareerState }) {
  const log = s.marketLog ?? [];
  return (
    <div className="text-[11.5px] space-y-0.5">
      {!log.length && <div className="text-neutral-500">아직 소식이 없습니다 (매주, 비시즌에는 더 활발하게 움직입니다)</div>}
      {log.map((m, i) => (
        <div key={i} className="grid grid-cols-[52px_1fr] gap-1 items-baseline border-b border-neutral-800 py-0.5">
          <span className="text-[10px] text-neutral-500">{m.season}시즌 {m.week}주</span>
          <span className={cn(m.kind === "release" ? "text-neutral-400" : "text-neutral-100")}>{moveText(s, m)}</span>
        </div>
      ))}
    </div>
  );
}
