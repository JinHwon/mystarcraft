/**
 * 이적 (원작 화면 방식): Trade(트레이드) · Scout(무소속 영입) · Fire(방출)
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import { B_MAX_ROSTER, MAX_ROSTER, ageOf, askingPrice, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { bTeamIdOf, evaluateTrade, myDiv, proTeams, rosterOf } from "@shared/career/view";
import { useCareer, useCareerPatch, useCareerUpdater } from "@/lib/career";
import type { CareerDiff } from "@shared/career/diff";
import { LegacyFrame, LegacyImg, TeamLogo } from "@/components/legacy/Legacy";
import { PlayerPanel, condStats } from "@/components/legacy/LegacyMatch";
import { ContractEditor, ContractText, FeeStepper, Reply } from "@/components/legacy/Club";
import { playerDemand, potentialStars, scoutPrice } from "@shared/career/contract";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
type Mode = "bid" | "trade" | "scout" | "fire";
const MODES: Array<[Mode, string, string]> = [["bid", "영입 요청", "Bid"], ["trade", "트레이드", "Trade"], ["scout", "스카웃", "Scout"], ["fire", "방출", "Fire"]];

const byTotal = (a: CPlayer, b: CPlayer) => totalOf(b.stats) - totalOf(a.stats);

/** 선수 목록 (여러 명 선택 가능) */
function PickList({ players, picked, onToggle, right, height = "max-h-[300px]" }: {
  players: CPlayer[]; picked: number[]; onToggle: (p: CPlayer) => void; right?: (p: CPlayer) => string; height?: string;
}) {
  return (
    <div className={cn("border-2 border-neutral-300 p-0.5 overflow-y-auto", height)}>
      {players.map(p => (
        <button key={p.id} onClick={() => onToggle(p)}
          className={cn("w-full flex items-center gap-1 text-[12.5px] px-1 py-[5px] text-left border-b border-neutral-800 last:border-b-0",
            picked.includes(p.id) ? "bg-[#3a3a5a] text-[#ffe45c]" : "text-white")}>
          <span className="truncate flex-1">{p.name} ({R[p.race]})</span>
          <span className="text-[10.5px] text-neutral-400">{right ? right(p) : totalOf(condStats(p)).toLocaleString()}</span>
        </button>
      ))}
      {!players.length && <div className="text-[11px] text-neutral-500 p-2 text-center">선수가 없습니다</div>}
    </div>
  );
}

/** 화면 아래에 붙어 있는 실행 칸 (스크롤하지 않고 바로 요청·영입) */
function StickyBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-3 px-3 pt-2 pb-2 bg-black border-t-2 border-neutral-500 space-y-1.5 text-[12px]">{children}</div>;
}

/** 팀 고르기 (작은 로고, 한 줄에 8개) */
function TeamPicker({ s, teams, value, onPick }: { s: CareerState; teams: CareerState["teams"]; value: number; onPick: (id: number) => void }) {
  void s;
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {teams.map(t => (
        <button key={t.id} onClick={() => onPick(t.id)} title={t.name} className={cn("p-0.5 border", value === t.id ? "border-[#ff6b6b] border-2" : "border-neutral-700")}>
          <TeamLogo team={t} className="w-full h-[18px]" />
        </button>
      ))}
    </div>
  );
}

/** 고른 선수 한 줄 요약 (자세히 누르면 사진·능력치) */
function PickedLine({ p, s, extra }: { p: CPlayer; s: CareerState; extra?: string }) {
  const [more, setMore] = useState(false);
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-[#ffe45c] truncate">{p.name} ({R[p.race]})</span>
        <span className="text-neutral-400 truncate flex-1">{s.teams[p.team]?.short ?? "무소속"} · {ageOf(p, s.season)}세 · 능력치 {totalOf(p.stats).toLocaleString()}{extra ? ` · ${extra}` : ""}</span>
        <button onClick={() => setMore(!more)} className="border border-neutral-600 px-1.5 text-[11px] text-neutral-300 shrink-0">{more ? "접기" : "자세히"}</button>
      </div>
      {more && <PlayerPanel p={p} color="#ff9a9a" empty="" />}
    </>
  );
}

function Money({ s }: { s: CareerState }) {
  return (
    <div className="flex justify-between text-[12px] border border-neutral-600 px-2 py-1">
      <span className="text-neutral-400">보유 금액 :</span><span className="text-[#ffe45c]">{s.teams[s.myTeam].money.toLocaleString()} 만원</span>
    </div>
  );
}

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
  const theirs = useMemo(() => rosterOf(s, teamId).sort(byTotal), [s, teamId]);
  const p = sel !== undefined ? s.players[sel] : undefined;
  const deal = p ? s.agreements?.[p.id] : undefined;
  const agreed = !!deal && deal.season === s.season && deal.week === s.week && deal.team === p!.team;
  // 시즌 중엔 요청을 보내고 다음 주에 답이 옴 (답이 온 주에는 바로 협상)
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
  const pick = (x: CPlayer) => { setSel(x.id); setFee(priceOf(x)); setReply(null); };
  return (
    <div className="space-y-2">
      <div className="text-center text-[12px] text-neutral-300">팀 → 선수를 고르면 아래에서 바로 이적료를 제시합니다</div>
      <TeamPicker s={s} teams={teams} value={teamId} onPick={id => { setTeamId(id); setSel(undefined); setReply(null); }} />
      <PickList players={theirs} picked={sel !== undefined ? [sel] : []} onToggle={pick} height="max-h-[42vh]"
        right={x => `${x.wantsOut ? "이적희망 · " : ""}${priceOf(x).toLocaleString()}만${x.team === myB ? " (B팀 50%)" : ""}`} />
      {!p && <div className="text-center text-[11px] text-neutral-500">선수를 고르세요 · 보유 금액 {s.teams[s.myTeam].money.toLocaleString()}만원</div>}
      {p && (
        <StickyBar>
          <PickedLine p={p} s={s} extra={`시세 ${priceOf(p).toLocaleString()}만`} />
          <div className="text-[10.5px] text-neutral-400">현재 계약: <ContractText c={p.contract} />{p.wantsOut ? " · 이적 희망 (싸게 데려올 수 있음)" : ""}</div>
          {reply && <Reply {...reply} />}
          {!agreed ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400"><span>이적료 제시</span><span className="text-[10.5px]">보유 {s.teams[s.myTeam].money.toLocaleString()}만</span></div>
              <div className="flex justify-center"><FeeStepper value={fee} onChange={setFee} max={s.teams[s.myTeam].money} /></div>
              <button disabled={bid.isPending || !!waiting} onClick={() => bid.mutate({ playerId: p.id, fee })} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500 disabled:opacity-40" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>
                {bid.isPending ? "보내는 중..." : waiting ? "요청을 보냈습니다 · 다음 주에 답이 옵니다" : direct ? "이적료 제시 (바로 협상)" : "영입 요청 보내기 (다음 주에 답)"}
              </button>
              {!direct && !waiting && <div className="text-[10.5px] text-neutral-500 text-center">시즌 중에는 요청을 보내면 다음 주에 구단의 답이 오고, 그 주에 이어서 협상합니다</div>}
            </div>
          ) : (
            <>
              <div className="text-center text-[11.5px] text-[#bff5c6]">이적료 {deal!.fee.toLocaleString()}만원 합의 · 이번 주 안에 선수와 계약하세요</div>
              <ContractEditor player={p} demand={playerDemand(s, p, s.myTeam)} pending={contract.isPending}
                onSubmit={c => contract.mutate({ playerId: p.id, salary: c.salary, years: c.years, minApps: c.minApps, bonus: c.bonus })} />
            </>
          )}
        </StickyBar>
      )}
    </div>
  );
}

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
      if (res.result === "sent") toast.info(res.message ?? "트레이드를 제안했습니다. 다음 주에 답이 옵니다");
      else toast.success("트레이드 성사!");
      setGive([]); setTake([]); setCash(0);
    },
  });
  const toggle = (list: number[], set: (v: number[]) => void) => (p: CPlayer) => {
    setView(p.id);
    set(list.includes(p.id) ? list.filter(x => x !== p.id) : list.length >= 5 ? list : [...list, p.id]);
  };
  const ratio = ev ? Math.min(1.5, ev.get / Math.max(1, ev.need)) : 0;

  return (
    <div className="space-y-2">
      <div className="text-center text-[12px] text-neutral-300">교환할 양측 선수 선택 (각 5명까지)</div>
      <TeamPicker s={s} teams={teams} value={teamId} onPick={id => { setTeamId(id); setTake([]); }} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] text-[#8fd0ff] mb-0.5">우리 팀 (내줄 선수)</div>
          <PickList players={mine} picked={give} onToggle={toggle(give, setGive)} />
        </div>
        <div>
          <div className="text-[11px] text-[#ff9a9a] mb-0.5">{s.teams[teamId]?.name} (받을 선수)</div>
          <PickList players={theirs} picked={take} onToggle={toggle(take, setTake)} />
        </div>
      </div>
      {view !== undefined && s.players[view] && <PickedLine p={s.players[view]} s={s} />}
      <StickyBar>
        <div className="flex items-center justify-between gap-2">
          <span className="text-neutral-400">현금 추가 <span className="text-[10.5px]">(보유 {s.teams[s.myTeam].money.toLocaleString()}만)</span></span>
          <div className="flex items-center gap-1">
            {[-500, -100].map(d => <button key={d} onClick={() => setCash(c => Math.max(0, c + d))} className="border border-neutral-600 px-1.5 text-[11px]">{d}</button>)}
            <span className="w-20 text-center text-[#ffe45c]">{cash.toLocaleString()}만</span>
            {[100, 500].map(d => <button key={d} onClick={() => setCash(c => Math.min(s.teams[s.myTeam].money, c + d))} className="border border-neutral-600 px-1.5 text-[11px]">+{d}</button>)}
          </div>
        </div>
        {ev ? (
          <>
            <div className="flex justify-between"><span className="text-neutral-400">제시 가치</span><span>{ev.get.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-neutral-400">상대 요구{ev.acesInvolved ? " (에이스 포함)" : ""}</span><span>{ev.need.toLocaleString()}</span></div>
            <div className="h-2 bg-neutral-800"><div className="h-full" style={{ width: `${Math.min(100, ratio * 66.6)}%`, background: ev.get >= ev.need ? "#8fe07a" : "#f4b060" }} /></div>
            <div className={cn("text-center", ev.get >= ev.need ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{ev.get >= ev.need ? "상대가 수락할 만한 조건입니다" : `${(ev.need - ev.get).toLocaleString()} 만큼 더 필요합니다`}</div>
          </>
        ) : <div className="text-center text-neutral-500">받을 선수를 고르세요</div>}
      <button
        disabled={!take.length || trade.isPending}
        onClick={() => trade.mutate({ teamId, give, take, cash })}
        className="w-full py-2 text-[14px] font-bold text-black border border-neutral-500 disabled:opacity-40"
        style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
      >{s.phase === "offseason" || (s.outbox ?? []).some(r => r.kind === "trade" && r.team === teamId && r.reply?.season === s.season && r.reply.week === s.week) ? "트레이드 제안 (바로 답)" : (s.outbox ?? []).some(r => r.kind === "trade" && r.team === teamId && !r.reply) ? "이미 제안함 · 다음 주에 답" : "트레이드 제안 (다음 주에 답)"}</button>
      </StickyBar>
    </div>
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
      if (res.result === "sent") toast.info(res.message ?? "영입 연락을 보냈습니다. 다음 주에 답이 옵니다");
      else toast.success(`영입 완료! (${(res.price ?? 0).toLocaleString()}만원)`);
      setSel(undefined);
    },
  });
  const p = sel !== undefined ? s.players[sel] : undefined;
  const price = p ? scoutPrice(s, p) : 0;
  const max = myDiv(s) === 2 ? B_MAX_ROSTER : MAX_ROSTER;
  const full = rosterOf(s, s.myTeam).length >= max;
  return (
    <div className="space-y-2">
      <div className="text-center text-[12px] text-neutral-300">무소속 선수 선택 <span className="text-neutral-500">({list.length}명)</span></div>
      <div className="grid grid-cols-4 gap-1">
        {(["all", "terran", "zerg", "protoss"] as const).map(r => (
          <button key={r} onClick={() => setRace(r)} className={cn("text-[11.5px] py-1 border", race === r ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>
            {r === "all" ? "전체" : r === "terran" ? "테란" : r === "zerg" ? "저그" : "프로토스"}
          </button>
        ))}
      </div>
      <PickList players={list} picked={sel !== undefined ? [sel] : []} onToggle={x => setSel(x.id)} right={x => `${ageOf(x, s.season)}세 ${potentialStars(x)} · ${scoutPrice(s, x).toLocaleString()}만`} height="max-h-[50vh]" />
      <StickyBar>
      {p ? <PickedLine p={p} s={s} extra={`요구 ${price.toLocaleString()}만`} /> : <div className="text-center text-neutral-500">영입할 선수를 고르세요</div>}
      <div className="flex justify-between"><span className="text-neutral-400">보유 금액</span><span className="text-[#ffe45c]">{s.teams[s.myTeam].money.toLocaleString()} 만원</span></div>
      <button
        disabled={!p || full || scout.isPending || s.teams[s.myTeam].money < price}
        onClick={() => p && scout.mutate({ playerId: p.id })}
        className="w-full py-2 text-[14px] font-bold text-black border border-neutral-500 disabled:opacity-40"
        style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
      >{full ? `선수단이 가득 찼습니다 (${max}명)` : p && (s.outbox ?? []).some(r => r.kind === "scout" && r.player === p.id && !r.reply) ? "연락함 · 다음 주에 답" : s.phase === "offseason" ? "영입" : "영입 연락 (다음 주에 답)"}</button>
      </StickyBar>
    </div>
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
    <div className="space-y-2">
      <div className="text-center text-[12px] text-neutral-300">방출할 선수 선택 <span className="text-neutral-500">({mine.length}/{MAX_ROSTER}명)</span></div>
      <PickList players={mine} picked={sel !== undefined ? [sel] : []} onToggle={x => setSel(x.id)} height="max-h-[50vh]" />
      <StickyBar>
      {p ? <PickedLine p={p} s={s} extra={`방출 이득 ${gain.toLocaleString()}만`} /> : <div className="text-center text-neutral-500">방출할 선수를 고르세요</div>}
      <button
        disabled={!p || release.isPending}
        onClick={() => p && confirm(`${p.name} 선수를 방출할까요?`) && release.mutate({ playerId: p.id })}
        className="w-full py-2 text-[14px] font-bold text-black border border-neutral-500 disabled:opacity-40"
        style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
      >방출</button>
      </StickyBar>
    </div>
  );
}

export default function Transfer() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("bid");
  const [focus, setFocus] = useState<{ player: number; n: number } | undefined>();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/lobby")} onNext={() => navigate("/lobby")} nextLabel="◁◁ 감독실">
      <div className="px-3 pt-2 pb-4">
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          {MODES.map(([k, label, en]) => (
            <button key={k} onClick={() => setMode(k)} className={cn("flex flex-col items-center gap-0.5 py-1 border", mode === k ? "border-[#ff6b6b] border-2" : "border-neutral-700")}>
              <LegacyImg dir="기타" name={label} className="h-9 object-contain" fallback={<span className="text-[16px] font-black italic text-neutral-200">{en}</span>} />
              <span className={cn("text-[11px]", mode === k ? "text-white" : "text-neutral-400")}>{label}</span>
            </button>
          ))}
        </div>
        <Outbox s={s} onTalk={pid => { setMode("bid"); setFocus({ player: pid, n: (focus?.n ?? 0) + 1 }); }} />
        {mode === "bid" && <BidTab key={focus ? `${focus.player}-${focus.n}` : "bid"} s={s} focus={focus?.player} />}
        {mode === "trade" && <TradeTab s={s} />}
        {mode === "scout" && <ScoutTab s={s} />}
        {mode === "fire" && <FireTab s={s} />}
        <MarketNews s={s} />
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
  if (!list.length) return null;
  const what = (r: NonNullable<CareerState["outbox"]>[number]) =>
    r.kind === "trade" ? `${s.teams[r.team]?.name} · ${(r.take ?? []).map(id => s.players[id]?.name).join(", ")} ⇄ ${(r.give ?? []).map(id => s.players[id]?.name).join(", ")}${r.cash ? ` + ${r.cash.toLocaleString()}만` : ""}`
      : r.kind === "scout" ? `무소속 ${s.players[r.player!]?.name}` : `${s.teams[r.team]?.name} ${s.players[r.player!]?.name} · ${(r.fee ?? 0).toLocaleString()}만`;
  return (
    <div className="border border-[#8fd0ff]/60 p-2 mb-2 space-y-1 text-[11.5px]">
      <div className="text-[#8fd0ff] text-[12.5px]">📨 보낸 요청 · 답장</div>
      {list.map(r => (
        <div key={r.id} className="border-t border-neutral-800 first:border-t-0 pt-1">
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] text-neutral-400 shrink-0">{KIND_LABEL[r.kind]}</span>
            <span className="truncate flex-1">{what(r)}</span>
            {!r.reply && <span className="text-[10.5px] text-[#ffe45c] shrink-0">답 대기 · 다음 주</span>}
            {!r.reply && <button disabled={cancel.isPending} onClick={() => cancel.mutate({ id: r.id })} className="border border-neutral-600 px-1.5 text-[10.5px] text-neutral-300 shrink-0">취소</button>}
          </div>
          {r.reply && (
            <div className="flex items-center gap-1">
              <span className={cn("flex-1 text-[11px]", r.reply.ok ? "text-[#bff5c6]" : r.reply.result === "countered" ? "text-[#ffe45c]" : "text-[#ffb8c8]")}>📬 {r.reply.message}</span>
              {r.kind === "bid" && r.player !== undefined && s.players[r.player]?.team !== s.myTeam && (
                <button onClick={() => onTalk(r.player!)} className="border border-[#8fe07a] text-[#bff5c6] px-1.5 text-[10.5px] shrink-0">{r.reply.result === "agreed" ? "계약하기" : "이어서 협상"}</button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="text-[10px] text-neutral-500">시즌 중에는 요청을 보낸 다음 주에 답이 오고, 답이 온 주에는 바로 이어서 협상할 수 있습니다 (비시즌은 바로 답)</div>
    </div>
  );
}

const MOVE_LABEL = { transfer: "이적", trade: "트레이드", release: "방출", sign: "영입" } as const;

/** 다른 구단끼리의 이적·트레이드·방출·무소속 영입 소식 */
function MarketNews({ s }: { s: CareerState }) {
  const [open, setOpen] = useState(false);
  const log = s.marketLog ?? [];
  const shown = open ? log : log.slice(0, 6);
  const name = (id: number) => `${s.players[id]?.name ?? "?"}(${R[s.players[id]?.race ?? "terran"]})`;
  const team = (id: number) => s.teams[id]?.short ?? "?";
  return (
    <div className="mt-3 border border-neutral-600 p-2 text-[11.5px] space-y-0.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[#ffe45c] text-[12.5px]">📰 다른 구단 이적 소식</span>
        <span className="text-[10px] text-neutral-500">{log.length}건</span>
      </div>
      {!log.length && <div className="text-neutral-500">아직 소식이 없습니다 (매주, 비시즌에는 더 활발하게 움직입니다)</div>}
      {shown.map((m, i) => (
        <div key={i} className="grid grid-cols-[44px_48px_1fr] gap-1 items-baseline">
          <span className="text-[10px] text-neutral-500">{m.season}시즌{m.week}주</span>
          <span className={cn("text-[10.5px]", m.kind === "release" ? "text-neutral-400" : "text-[#8fd0ff]")}>{MOVE_LABEL[m.kind]}</span>
          <span className="truncate">
            {m.kind === "transfer" && <>{name(m.players[0])} {team(m.teams[0])} → {team(m.teams[1])}{m.fee ? <span className="text-neutral-400"> · {m.fee.toLocaleString()}만</span> : null}</>}
            {m.kind === "trade" && <>{team(m.teams[0])} {name(m.players[0])} ⇄ {team(m.teams[1])} {name(m.players[1])}</>}
            {m.kind === "release" && <>{team(m.teams[0])}, {name(m.players[0])} 방출 → 무소속</>}
            {m.kind === "sign" && <>{team(m.teams[0])}, 무소속 {name(m.players[0])} 영입{m.fee ? <span className="text-neutral-400"> · {m.fee.toLocaleString()}만</span> : null}</>}
          </span>
        </div>
      ))}
      {log.length > 6 && <button onClick={() => setOpen(!open)} className="w-full text-center text-[11px] text-neutral-300 pt-1">{open ? "접기 ▲" : `더 보기 (${log.length - 6}건) ▼`}</button>}
    </div>
  );
}
