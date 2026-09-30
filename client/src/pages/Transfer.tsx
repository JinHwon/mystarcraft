/**
 * 이적 (원작 화면 방식): Trade(트레이드) · Scout(무소속 영입) · Fire(방출)
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import { MAX_ROSTER, ageOf, askingPrice, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { evaluateTrade, proTeams, rosterOf } from "@shared/career/view";
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

function Money({ s }: { s: CareerState }) {
  return (
    <div className="flex justify-between text-[12px] border border-neutral-600 px-2 py-1">
      <span className="text-neutral-400">보유 금액 :</span><span className="text-[#ffe45c]">{s.teams[s.myTeam].money.toLocaleString()} 만원</span>
    </div>
  );
}

/** 다른 팀 선수 영입 요청: 이적료 협상(합의·보류·거절) → 선수 계약 협상 */
function BidTab({ s }: { s: CareerState }) {
  const patch = useCareerPatch();
  const teams = proTeams(s).filter(t => t.id !== s.myTeam);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? 0);
  const [sel, setSel] = useState<number | undefined>();
  const [fee, setFee] = useState(0);
  const [reply, setReply] = useState<{ text: string; ok: boolean } | null>(null);
  const theirs = useMemo(() => rosterOf(s, teamId).sort(byTotal), [s, teamId]);
  const p = sel !== undefined ? s.players[sel] : undefined;
  const deal = p ? s.agreements?.[p.id] : undefined;
  const agreed = !!deal && deal.season === s.season && deal.week === s.week && deal.team === p!.team;
  const onDone = (r: { diff: CareerDiff; result: unknown }) => {
    patch(r.diff);
    const res = r.result as { result: string; message: string; fee?: number };
    setReply({ text: res.message, ok: res.result === "agreed" || res.result === "signed" });
    if (res.result === "countered" && res.fee) setFee(res.fee);
    if (res.result === "signed") setSel(undefined);
  };
  const onFail = (e: { message: string }) => setReply({ text: e.message, ok: false });
  const bid = trpc.career.bid.useMutation({ onSuccess: onDone, onError: onFail });
  const contract = trpc.career.contract.useMutation({ onSuccess: onDone, onError: onFail });
  const pick = (x: CPlayer) => { setSel(x.id); setFee(askingPrice(x, s.season)); setReply(null); };
  return (
    <div className="space-y-2">
      <div className="text-center text-[12px] text-neutral-300">영입할 선수를 고르고 이적료를 제시하세요</div>
      <div className="grid grid-cols-6 gap-1">
        {teams.map(t => (
          <button key={t.id} onClick={() => { setTeamId(t.id); setSel(undefined); setReply(null); }} className={cn("p-0.5 border", teamId === t.id ? "border-[#ff6b6b] border-2" : "border-neutral-700")}>
            <TeamLogo team={t} className="w-full h-[26px]" />
          </button>
        ))}
      </div>
      <PickList players={theirs} picked={sel !== undefined ? [sel] : []} onToggle={pick} height="max-h-[200px]"
        right={x => `${x.wantsOut ? "이적희망 · " : ""}${askingPrice(x, s.season).toLocaleString()}만`} />
      {p && (
        <>
          <PlayerPanel p={p} color="#ff9a9a" empty="" />
          <div className="text-[11px] text-neutral-400 text-center">현재 계약: <ContractText c={p.contract} />{p.wantsOut ? " · 이적을 희망하는 선수 (싸게 데려올 수 있음)" : ""}</div>
          {reply && <Reply {...reply} />}
          {!agreed ? (
            <div className="border border-neutral-600 p-2 space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between"><span className="text-neutral-400">이적료 제시</span><FeeStepper value={fee} onChange={setFee} max={s.teams[s.myTeam].money} /></div>
              <Money s={s} />
              <button disabled={bid.isPending} onClick={() => bid.mutate({ playerId: p.id, fee })} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500 disabled:opacity-40" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>
                {bid.isPending ? "협상 중..." : "영입 요청"}
              </button>
            </div>
          ) : (
            <>
              <div className="text-center text-[11.5px] text-[#bff5c6]">이적료 {deal!.fee.toLocaleString()}만원 합의 · 이번 주 안에 선수와 계약하세요</div>
              <ContractEditor player={p} demand={playerDemand(s, p, s.myTeam)} pending={contract.isPending}
                onSubmit={c => contract.mutate({ playerId: p.id, salary: c.salary, years: c.years, minApps: c.minApps, bonus: c.bonus })} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function TradeTab({ s }: { s: CareerState }) {
  const updater = useCareerUpdater();
  const teams = proTeams(s).filter(t => t.id !== s.myTeam);
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
    onSuccess: r => { updater.onSuccess(r); toast.success("트레이드 성사!"); setGive([]); setTake([]); setCash(0); },
  });
  const toggle = (list: number[], set: (v: number[]) => void) => (p: CPlayer) => {
    setView(p.id);
    set(list.includes(p.id) ? list.filter(x => x !== p.id) : list.length >= 5 ? list : [...list, p.id]);
  };
  const ratio = ev ? Math.min(1.5, ev.get / Math.max(1, ev.need)) : 0;

  return (
    <div className="space-y-2">
      <div className="text-center text-[12px] text-neutral-300">교환할 양측 선수 선택</div>
      <div className="grid grid-cols-6 gap-1">
        {teams.map(t => (
          <button key={t.id} onClick={() => { setTeamId(t.id); setTake([]); }} className={cn("p-0.5 border", teamId === t.id ? "border-[#ff6b6b] border-2" : "border-neutral-700")}>
            <TeamLogo team={t} className="w-full h-[26px]" />
          </button>
        ))}
      </div>
      <PlayerPanel p={view !== undefined ? s.players[view] : undefined} color={s.players[view ?? -1]?.team === s.myTeam ? "#8fd0ff" : "#ff9a9a"} empty="선수를 누르면 사진과 능력치가 보입니다" />
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
      <div className="border border-neutral-600 p-2 space-y-1.5 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-neutral-400">현금 추가</span>
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
      </div>
      <Money s={s} />
      <button
        disabled={!take.length || trade.isPending}
        onClick={() => trade.mutate({ teamId, give, take, cash })}
        className="w-full py-2 text-[14px] font-bold text-black border border-neutral-500 disabled:opacity-40"
        style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
      >트레이드 제안</button>
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
    onSuccess: r => { updater.onSuccess(r); toast.success(`영입 완료! (${r.result.price.toLocaleString()}만원)`); setSel(undefined); },
  });
  const signReserve = trpc.career.signReserve.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`2부 입단! (계약금 ${r.result.fee.toLocaleString()}만원)`); setSel(undefined); },
  });
  const reserveFee = (x: CPlayer) => Math.max(20, Math.round((askingPrice(x, s.season) * 0.3) / 10) * 10);
  const p = sel !== undefined ? s.players[sel] : undefined;
  const price = p ? scoutPrice(s, p) : 0;
  const full = rosterOf(s, s.myTeam).length >= MAX_ROSTER;
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
      <PlayerPanel p={p} color="#ffe45c" empty="영입할 선수를 고르세요" />
      <PickList players={list} picked={sel !== undefined ? [sel] : []} onToggle={x => setSel(x.id)} right={x => `${ageOf(x, s.season)}세 ${potentialStars(x)} · ${scoutPrice(s, x).toLocaleString()}만`} height="max-h-[280px]" />
      <div className="flex justify-between text-[12px] border border-neutral-600 px-2 py-1">
        <span className="text-neutral-400">요구 금액 :</span><span className="text-[#ffb8c8]">{p ? `${price.toLocaleString()} 만원` : "-"}</span>
      </div>
      <Money s={s} />
      <button
        disabled={!p || full || scout.isPending || s.teams[s.myTeam].money < price}
        onClick={() => p && scout.mutate({ playerId: p.id })}
        className="w-full py-2 text-[14px] font-bold text-black border border-neutral-500 disabled:opacity-40"
        style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
      >{full ? `선수단이 가득 찼습니다 (${MAX_ROSTER}명)` : "1부로 영입"}</button>
      {p && (
        <button
          disabled={signReserve.isPending || s.teams[s.myTeam].money < reserveFee(p)}
          onClick={() => signReserve.mutate({ playerId: p.id })}
          className="w-full py-2 text-[13px] font-bold text-[#bff5c6] border border-[#8fe07a] disabled:opacity-40"
        >🌱 2부로 영입 (계약금 {reserveFee(p).toLocaleString()}만원 · 싼 연봉으로 육성)</button>
      )}
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
      <PlayerPanel p={p} color="#8fd0ff" empty="방출할 선수를 고르세요" />
      <PickList players={mine} picked={sel !== undefined ? [sel] : []} onToggle={x => setSel(x.id)} height="max-h-[300px]" />
      <div className="flex justify-between text-[12px] border border-neutral-600 px-2 py-1">
        <span className="text-neutral-400">방출 이득 :</span><span className="text-[#bff5c6]">{p ? `${gain.toLocaleString()} 만원` : "-"}</span>
      </div>
      <button
        disabled={!p || release.isPending}
        onClick={() => p && confirm(`${p.name} 선수를 방출할까요?`) && release.mutate({ playerId: p.id })}
        className="w-full py-2 text-[14px] font-bold text-black border border-neutral-500 disabled:opacity-40"
        style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
      >방출</button>
    </div>
  );
}

export default function Transfer() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("bid");
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
        {mode === "bid" && <BidTab s={s} />}
        {mode === "trade" && <TradeTab s={s} />}
        {mode === "scout" && <ScoutTab s={s} />}
        {mode === "fire" && <FireTab s={s} />}
      </div>
    </LegacyFrame>
  );
}
