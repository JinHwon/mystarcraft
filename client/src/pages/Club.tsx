/**
 * 구단 운영: 재정 · 계약(재계약) · 받은 영입 제안 · 감독
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { OPERATING_COST, askingPrice, difficultyOf, totalOf, type CareerState, type Contract } from "@shared/career/rules";
import { jobThreshold, playerDemand, teamWages } from "@shared/career/contract";
import { activeSponsors, maxSponsors, questLabel, questProgress, questRange, questReward, sponsorOfferCount, sponsorOffers, type SponsorQuest } from "@shared/career/sponsor";
import { SPONSOR_STRETCH, TERM_NAMES, levelPerks, mainSponsorName, managerExpNeed, managerLevel, sponsorBudget, sponsorFactors, termsValue, type MainSponsorTerms } from "@shared/career/mainSponsor";
import { proTeams, rosterOf, teamPower } from "@shared/career/view";
import { useCareer, useCareerPatch } from "@/lib/career";
import { ManagerNameBox } from "@/components/ManagerName";
import type { CareerDiff } from "@shared/career/diff";
import { LegacyFrame, TeamLogo } from "@/components/legacy/Legacy";
import { PlayerPanel } from "@/components/legacy/LegacyMatch";
import { ContractEditor, ContractText, FeeStepper, MoraleBar, Reply } from "@/components/legacy/Club";
import { PlayerSheet } from "./Team";
import { TeamHistory } from "@/components/career/TeamHistory";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
type Tab = "sponsor" | "money" | "contracts" | "offers" | "manager" | "history";

function useMut() {
  const patch = useCareerPatch();
  const [reply, setReply] = useState<{ text: string; ok: boolean } | null>(null);
  const done = (r: { diff: CareerDiff; result: unknown }) => {
    patch(r.diff);
    const res = r.result as { message?: string; result?: string };
    if (res?.message) setReply({ text: res.message, ok: ["signed", "sold", "agreed", "listed"].includes(res.result ?? "") });
  };
  const fail = (e: { message: string }) => setReply({ text: e.message, ok: false });
  return { reply, setReply, done, fail };
}

/** 구단 운영 공통 카드: 색 띠 머리글 + 본문 */
function Panel({ title, icon, accent = "#f8e070", right, children, className, bodyClass }: { title: React.ReactNode; icon?: string; accent?: string; right?: React.ReactNode; children?: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("border text-[12px]", className)} style={{ borderColor: `${accent}80`, background: "linear-gradient(#14141c, #000 60%)" }}>
      <header className="flex items-center gap-1.5 px-2 py-1 border-b" style={{ borderColor: `${accent}40`, background: `linear-gradient(90deg, ${accent}30, transparent 75%)` }}>
        {icon && <span className="text-[13px]">{icon}</span>}
        <span className="text-[13px] font-bold" style={{ color: accent }}>{title}</span>
        {right !== undefined && <span className="ml-auto text-[10.5px] text-neutral-400 text-right">{right}</span>}
      </header>
      <div className={cn("p-2 space-y-1.5", bodyClass)}>{children}</div>
    </section>
  );
}

const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toLocaleString()}`;
const tone = (v: number) => (v >= 0 ? "text-[#bff5c6]" : "text-[#ffb8c8]");

/** 매주 고정 수입·지출 (머리글과 재정 탭이 같이 씀) */
function weeklyFlow(s: CareerState) {
  const wages = teamWages(s, s.myTeam);
  const sponsors = activeSponsors(s);
  const spon = sponsors.reduce((a, x) => a + x.weekly, 0);
  const wage = Math.round(wages / 11);
  return { wages, sponsors, spon, wage, net: spon - wage - OPERATING_COST };
}

function MoneyTab({ s }: { s: CareerState }) {
  const { wages, sponsors, spon, wage, net } = weeklyFlow(s);
  const items = Object.entries(s.ledger?.season === s.season ? s.ledger.items : {}).sort((a, b) => b[1] - a[1]);
  const income = items.filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0);
  const expense = items.filter(([, v]) => v < 0).reduce((a, [, v]) => a + v, 0);
  const peak = Math.max(1, ...items.map(([, v]) => Math.abs(v)));
  const tiles: Array<[string, number, string]> = [["수입", spon, "#8fe07a"], ["지출", -(wage + OPERATING_COST), "#ff8a8a"], ["합계", net, net >= 0 ? "#8fe07a" : "#ff8a8a"]];
  return (
    <div className="space-y-2">
      {(s.debtWeeks ?? 0) > 0 && <Reply text={`⚠️ 적자 ${s.debtWeeks}주째! ${difficultyOf(s).debtWeeks - (s.debtWeeks ?? 0)}주 안에 흑자로 돌리지 못하면 구단이 해체됩니다`} />}
      <Panel icon="📅" title="매주 고정 수입·지출" right="경기 수당 제외">
        <div className="grid grid-cols-3 gap-1">
          {tiles.map(([k, v, c]) => (
            <div key={k} className="border border-neutral-700 bg-black/60 py-1 text-center">
              <div className="text-[10.5px] text-neutral-400">{k}</div>
              <div className="text-[15px] font-bold" style={{ color: c }}>{sign(v)}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between"><span className="text-neutral-400">서브 스폰서 후원금{spon ? ` (${sponsors.map(x => x.name).join("·")})` : " (없음)"}</span><span className="text-[#bff5c6]">+{spon}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">연봉 (총 {wages.toLocaleString()}만 ÷ 11주)</span><span className="text-[#ffb8c8]">-{wage}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">구단 운영비</span><span className="text-[#ffb8c8]">-{OPERATING_COST}</span></div>
        <div className="text-[10.5px] text-neutral-500">경기 수당(주 2경기)은 메인 스폰서 계약: 승리 +{s.mainSponsor?.win ?? 0}, 패배 +{s.mainSponsor?.loss ?? 0} · 퀘스트·상금·보너스·이적료는 따로</div>
      </Panel>
      <Panel icon="📒" title={`${s.season}시즌 장부`} right={<>수입 <span className="text-[#bff5c6]">{income.toLocaleString()}</span> · 지출 <span className="text-[#ffb8c8]">{(-expense).toLocaleString()}</span></>}>
        {items.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2">
            <div className="min-w-0">
              <div className="flex justify-between"><span className="text-neutral-300 truncate">{k}</span></div>
              <div className="h-1 bg-neutral-800 mt-0.5"><div className="h-full" style={{ width: `${Math.max(2, (Math.abs(v) / peak) * 100)}%`, background: v >= 0 ? "#8fe07a" : "#ff8a8a" }} /></div>
            </div>
            <span className={cn("text-right", tone(v))}>{sign(v)}</span>
          </div>
        ))}
        {!items.length && <div className="text-neutral-500">아직 기록이 없습니다</div>}
        <div className="flex justify-between border-t border-neutral-700 pt-1 text-[13px]"><span>시즌 손익</span><b className={tone(income + expense)}>{sign(income + expense)}만</b></div>
      </Panel>
    </div>
  );
}

function ContractsTab({ s }: { s: CareerState }) {
  const { reply, setReply, done, fail } = useMut();
  const [sel, setSel] = useState<number | undefined>();
  const roster = useMemo(() => s.players.filter(p => p.team === s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats)), [s]);
  const played = s.matches.filter(m => m.done && m.stage === "regular" && (m.a === s.myTeam || m.b === s.myTeam)).length;
  const contract = trpc.career.contract.useMutation({ onSuccess: done, onError: fail });
  const p = sel !== undefined ? s.players[sel] : undefined;
  return (
    <div className="space-y-2">
      <Panel icon="📝" title="선수 계약" accent="#8fd0ff" right={`팀 경기 ${played} · 연봉 합계 ${teamWages(s, s.myTeam).toLocaleString()}만`} bodyClass="p-0.5 space-y-0">
        {roster.map(x => (
          <button key={x.id} onClick={() => { setSel(x.id); setReply(null); }} className={cn("w-full text-left px-1 py-1 border-b border-neutral-800 last:border-b-0", sel === x.id && "bg-[#3a3a5a]")}>
            <div className="flex items-center gap-1 text-[12.5px]">
              <span className="flex-1 truncate">{x.name} <span className="text-neutral-500">{R[x.race]}</span>{x.wantsOut && <span className="text-[10px] text-[#ffb8c8]"> 이적희망</span>}{(s.listings ?? []).some(l => l.player === x.id) && <span className="text-[10px] text-[#ffe45c]"> 🏷️</span>}</span>
              <span className="text-[10.5px] text-neutral-400">출전 {x.sApps ?? 0}{x.contract?.minApps ? `/${x.contract.minApps}` : ""}</span>
              <MoraleBar p={x} />
            </div>
            <div className={cn("text-[10.5px]", x.contract && x.contract.years <= 1 ? "text-[#ffd9a8]" : "text-neutral-500")}>
              <ContractText c={x.contract} />{x.contract && x.contract.years <= 1 ? " · 이번 시즌 후 만료" : ""}
            </div>
          </button>
        ))}
      </Panel>
      {p && (
        <>
          <PlayerPanel p={p} color="#8fd0ff" empty="" />
          {reply && <Reply {...reply} />}
          <ListControl key={p.id} s={s} pid={p.id} onDone={done} onFail={fail} />
          <ContractEditor player={p} demand={playerDemand(s, p, s.myTeam)} pending={contract.isPending} submitLabel="재계약 제안"
            onSubmit={(c: Contract) => contract.mutate({ playerId: p.id, salary: c.salary, years: c.years, minApps: c.minApps, bonus: c.bonus })} />
        </>
      )}
    </div>
  );
}

/** 이적시장 등록: 희망 이적료를 정해 내놓으면 매주 다른 구단의 제안이 들어온다 */
function ListControl({ s, pid, onDone, onFail }: { s: CareerState; pid: number; onDone: (r: { diff: CareerDiff; result: unknown }) => void; onFail: (e: { message: string }) => void }) {
  const p = s.players[pid];
  const listing = (s.listings ?? []).find(l => l.player === pid);
  const market = askingPrice(p, s.season);
  const [price, setPrice] = useState(listing?.price ?? market);
  const list = trpc.career.listPlayer.useMutation({ onSuccess: onDone, onError: onFail });
  const unlist = trpc.career.unlistPlayer.useMutation({ onSuccess: onDone, onError: onFail });
  const offers = (s.offers ?? []).filter(o => o.player === pid).length;
  return (
    <Panel icon="🏷️" title="이적시장" accent={p.wantsOut ? "#ff9a9a" : "#f8e070"} right={`시세 ${market.toLocaleString()}만${listing ? ` · 등록 중 (희망가 ${listing.price.toLocaleString()}만 · 제안 ${offers}건)` : ""}`}>
      {p.wantsOut && <div className="text-[10.5px] text-[#ffb8c8]">이적을 희망하는 선수입니다. 내놓으면 다른 구단의 제안을 받을 수 있습니다</div>}
      <div className="flex items-center justify-between gap-1">
        <span className="text-neutral-400">희망 이적료</span>
        <FeeStepper value={price} onChange={v => setPrice(Math.max(10, v))} />
      </div>
      <div className="text-[10.5px] text-neutral-500">시세의 {Math.round((price / Math.max(1, market)) * 100)}% · 낮을수록 제안이 많이, 높을수록 적게 옵니다 (제안은 매주 들어오고 2주 뒤 만료)</div>
      <div className={cn("grid gap-1", listing ? "grid-cols-2" : "grid-cols-1")}>
        <button disabled={list.isPending} onClick={() => list.mutate({ playerId: pid, price })} className="py-1.5 text-[13px] font-bold text-black border border-neutral-500 disabled:opacity-40" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>
          {list.isPending ? "등록 중..." : listing ? "희망가 바꾸기" : "이적시장에 내놓기"}
        </button>
        {listing && <button disabled={unlist.isPending} onClick={() => unlist.mutate({ playerId: pid })} className="border border-neutral-500 text-neutral-300">내리기</button>}
      </div>
    </Panel>
  );
}

function OffersTab({ s }: { s: CareerState }) {
  const { reply, setReply, done, fail } = useMut();
  const utils = trpc.useUtils();
  // 누른 버튼 (응답 전까지 "처리 중" 표시)
  const [busy, setBusy] = useState<string | null>(null);
  const respond = trpc.career.respondOffer.useMutation({
    onSuccess: r => { setBusy(null); done(r); },
    onError: e => { setBusy(null); utils.career.get.invalidate(); fail(e); },
  });
  const act = (offerId: number, action: "accept" | "reject" | "counter", fee?: number) => {
    setBusy(`${offerId}:${action}`);
    // 반대는 결과가 정해져 있으므로 바로 목록에서 뺌 (서버 응답은 뒤에서)
    if (action === "reject") {
      utils.career.get.setData(undefined, old => (old?.state ? { state: { ...old.state, offers: (old.state.offers ?? []).filter(x => x.id !== offerId) } } : old));
      setReply({ text: "거절했습니다", ok: false });
    }
    respond.mutate({ offerId, action, fee });
  };
  const label = (id: number, action: string, text: string) => (busy === `${id}:${action}` ? "처리 중…" : text);
  const [fees, setFees] = useState<Record<number, number>>({});
  const [open, setOpen] = useState<number | null>(null);
  // 같은 선수에게 온 제안끼리 모아서 (금액 높은 순)
  const offers = (s.offers ?? []).filter(o => s.players[o.player]?.team === s.myTeam).sort((a, b) => a.player - b.player || b.fee - a.fee);
  const listings = (s.listings ?? []).filter(l => s.players[l.player]?.team === s.myTeam);
  const priceOf = (pid: number) => listings.find(l => l.player === pid)?.price;
  return (
    <div className="space-y-2">
      <PlayerSheet s={s} player={open !== null ? s.players[open] : null} onClose={() => setOpen(null)} />
      {reply && <Reply {...reply} />}
      <ListingsBox s={s} />
      <RaiseRequest s={s} />
      <JoinRequests s={s} />
      {!offers.length && <div className="text-center text-[12px] text-neutral-500 py-4 border border-dashed border-neutral-700">받은 영입 제안이 없습니다<br />(이적시장에 내놓거나, 출전이 적고 이적을 희망하는 선수에게 제안이 잘 들어옵니다)</div>}
      {offers.map(o => {
        const p = s.players[o.player], t = s.teams[o.team];
        // 역제안 금액: 직접 고친 값 → 지난번 우리 역제안 → 처음엔 제시액의 130% (상대가 다시 불러도 우리 금액은 그대로)
        const fee = fees[o.id] ?? o.myCounter ?? Math.round((o.fee * 1.3) / 10) * 10;
        const price = priceOf(o.player);
        const rivals = offers.filter(x => x.player === o.player).length;
        return (
          <Panel key={o.id} icon="📨" title={`${t.name}의 영입 제안`} accent={o.byPlayer ? "#ffb84d" : "#8fd0ff"} right={`협상 ${o.tries}/3 · ${Math.max(0, 2 - (s.week - o.week))}주 뒤 만료`}>
            <div className="flex items-center gap-2">
              <TeamLogo team={t} className="w-[52px] h-[30px]" />
              <div className="flex-1">
                <div><b>{t.name}</b> → <button onClick={() => setOpen(p.id)} className="text-[#8fd0ff] underline underline-offset-2">{p.name} ({R[p.race]}) ⓘ</button>{rivals > 1 && <span className="text-[10.5px] text-[#ffb84d]"> · 경쟁 제안 {rivals}건</span>}</div>
                {o.byPlayer && <div className="text-[10.5px] text-[#ffb84d]">🙋 {p.name} 선수가 {t.name} 이적을 원합니다 (거절하면 사기 하락)</div>}
                <div className="text-neutral-400">제시 금액 <b className="text-[#ffe45c] text-[14px]">{o.fee.toLocaleString()}만원</b>{o.status === "countered" ? " (역제안 받음)" : ""}</div>
                {(() => { const v = askingPrice(p, s.season); const r = Math.round((o.fee / Math.max(1, v)) * 100); return <div className="text-[10.5px] text-neutral-400">현 시세 <b className="text-neutral-200">{v.toLocaleString()}만원</b> · 제시액은 시세의 <span className={r >= 100 ? "text-[#bff5c6]" : r >= 80 ? "text-[#ffe45c]" : "text-[#ffb8c8]"}>{r}%</span>{o.myCounter ? ` · 내 역제안 ${o.myCounter.toLocaleString()}만원` : ""}</div>; })()}
                {price !== undefined && <div className={cn("text-[10.5px]", o.fee >= price ? "text-[#bff5c6]" : "text-neutral-500")}>이적시장 희망가 {price.toLocaleString()}만원{o.fee >= price ? " 이상 제시" : ` (희망가의 ${Math.round((o.fee / price) * 100)}%)`}</div>}
              </div>
              <MoraleBar p={p} />
            </div>
            <div className="text-[10.5px] text-neutral-500">연봉 {p.contract?.salary ?? 0}만 · 능력치 {totalOf(p.stats).toLocaleString()}</div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-neutral-400">역제안</span>
              <FeeStepper value={fee} onChange={v => setFees({ ...fees, [o.id]: v })} />
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button disabled={respond.isPending} onClick={() => act(o.id, "accept")} className="border border-[#8fe07a] text-[#bff5c6] py-1">{label(o.id, "accept", "합의")}</button>
              <button disabled={respond.isPending} onClick={() => { setFees({ ...fees, [o.id]: fee }); act(o.id, "counter", fee); }} className="border border-[#f8e070] text-[#ffe45c] py-1">{label(o.id, "counter", "역제안")}</button>
              <button disabled={respond.isPending} onClick={() => act(o.id, "reject")} className="border border-[#ff6b6b] text-[#ffb8c8] py-1">{label(o.id, "reject", "반대")}</button>
            </div>
          </Panel>
        );
      })}
      <OfferHistory s={s} />
    </div>
  );
}

/** 우리 스타 선수의 연봉 인상 요구 (거절·너무 낮은 역제안이면 컨디션 부진·능력치 하락·이적 희망 중 하나) */
function RaiseRequest({ s }: { s: CareerState }) {
  const { reply, done, fail } = useMut();
  const respond = trpc.career.respondRaise.useMutation({ onSuccess: done, onError: fail });
  const r = s.raiseRequest;
  const [counter, setCounter] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  if (!r || !s.players[r.player] || s.players[r.player].team !== s.myTeam) return reply ? <Reply {...reply} /> : null;
  const p = s.players[r.player];
  const cur = p.contract?.salary ?? 0;
  const value = counter ?? Math.round((r.salary * 0.9) / 10) * 10;
  return (
    <Panel icon="💼" title="연봉 인상 요구" accent="#ffb84d" right={`${Math.max(0, 2 - (s.week - r.week))}주 안에 답하세요`}>
      <PlayerSheet s={s} player={open !== null ? s.players[open] : null} onClose={() => setOpen(null)} />
      {reply && <Reply {...reply} />}
      <div><button onClick={() => setOpen(p.id)} className="text-[#8fd0ff] underline underline-offset-2">{p.name} ({R[p.race]}) ⓘ</button> <span className="text-neutral-400">능력치 {totalOf(p.stats).toLocaleString()} · 계약 {p.contract?.years ?? 0}년 남음</span></div>
      <div className="text-neutral-300">연봉 {cur.toLocaleString()}만 → <b className="text-[#ffe45c]">{r.salary.toLocaleString()}만</b> · 계약 {r.years}년</div>
      <div className="text-[10.5px] text-neutral-500">거절하거나 요구의 90%보다 낮게 부르면 실망해서 컨디션 부진(-20%, 2주 회복 없음)·능력치 하락·이적 희망 중 하나가 생깁니다</div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-neutral-400">역제안 연봉</span>
        <FeeStepper value={value} onChange={setCounter} />
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button disabled={respond.isPending} onClick={() => respond.mutate({ action: "accept" })} className="border border-[#8fe07a] text-[#bff5c6] py-1">수락</button>
        <button disabled={respond.isPending} onClick={() => respond.mutate({ action: "counter", salary: value })} className="border border-[#f8e070] text-[#ffe45c] py-1">역제안</button>
        <button disabled={respond.isPending} onClick={() => confirm(`${p.name} 선수의 요구를 거절할까요? 실망해서 부진하거나 이적을 원할 수 있습니다.`) && respond.mutate({ action: "reject" })} className="border border-[#ff6b6b] text-[#ffb8c8] py-1">거절</button>
      </div>
    </Panel>
  );
}

/** 다른 팀 선수의 입단 요청 (수락하면 바로 계약) */
function JoinRequests({ s }: { s: CareerState }) {
  const { reply, done, fail } = useMut();
  const respond = trpc.career.respondJoin.useMutation({ onSuccess: done, onError: fail });
  const [open, setOpen] = useState<number | null>(null);
  const list = (s.joinRequests ?? []).filter(r => s.players[r.player] && s.players[r.player].team !== s.myTeam);
  if (!list.length) return reply ? <Reply {...reply} /> : null;
  return (
    <Panel icon="🙋" title="우리 팀에 오고 싶다는 선수" accent="#8fd0ff" right="이름을 누르면 선수 정보">
      <PlayerSheet s={s} player={open !== null ? s.players[open] : null} onClose={() => setOpen(null)} />
      {reply && <Reply {...reply} />}
      {list.map(r => {
        const p = s.players[r.player], t = s.teams[p.team];
        return (
          <div key={r.id} className="border-t border-neutral-700 first:border-t-0 pt-1.5 space-y-1">
            <div className="flex items-center gap-2">
              <TeamLogo team={t} className="w-[52px] h-[30px]" />
              <div className="flex-1 min-w-0">
                <div><button onClick={() => setOpen(p.id)} className="text-[#8fd0ff] underline underline-offset-2">{p.name} ({R[p.race]}) ⓘ</button> <span className="text-neutral-400">{t.name} · 능력치 {totalOf(p.stats).toLocaleString()} · {p.sWins}승 {p.sLosses}패</span></div>
                <div className="text-neutral-400">이적료 <b className="text-[#ffe45c]">{r.fee.toLocaleString()}만</b> (시세 {askingPrice(p, s.season).toLocaleString()}만) · 연봉 {r.salary.toLocaleString()}만 · {r.years}년 · {Math.max(0, 2 - (s.week - r.week))}주 뒤 만료</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, action: "accept" })} className="border border-[#8fe07a] text-[#bff5c6] py-1">영입</button>
              <button disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, action: "reject" })} className="border border-[#ff6b6b] text-[#ffb8c8] py-1">거절</button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

/** 이적시장에 내놓은 우리 선수 (희망가 수정·내리기) */
function ListingsBox({ s }: { s: CareerState }) {
  const { reply, done, fail } = useMut();
  const unlist = trpc.career.unlistPlayer.useMutation({ onSuccess: done, onError: fail });
  const listings = (s.listings ?? []).filter(l => s.players[l.player]?.team === s.myTeam);
  if (!listings.length) return null;
  return (
    <Panel icon="🏷️" title="이적시장에 내놓은 선수" right={`${listings.length}명`}>
      {reply && <Reply {...reply} />}
      {listings.map(l => {
        const p = s.players[l.player];
        const n = (s.offers ?? []).filter(o => o.player === l.player).length;
        return (
          <div key={l.player} className="flex items-center gap-2">
            <span className="flex-1 truncate">{p.name} ({R[p.race]}) <span className="text-neutral-400">희망가 {l.price.toLocaleString()}만 · 시세 {askingPrice(p, s.season).toLocaleString()}만 · 받은 제안 {n}건</span></span>
            <button disabled={unlist.isPending} onClick={() => unlist.mutate({ playerId: l.player })} className="border border-neutral-500 px-1.5 text-[11px]">내리기</button>
          </div>
        );
      })}
      <div className="text-[10.5px] text-neutral-500">매주 다른 구단이 희망가를 보고 제안합니다. 희망가가 시세보다 낮을수록 제안이 많이 옵니다. 희망가 수정은 계약 탭에서.</div>
    </Panel>
  );
}

const LOG_RESULT: Record<string, { text: string; c: string }> = {
  sold: { text: "이적 완료", c: "text-[#bff5c6]" },
  signed: { text: "영입 완료", c: "text-[#bff5c6]" },
  rejected: { text: "거절", c: "text-neutral-400" },
  withdrawn: { text: "협상 결렬", c: "text-[#ffb8c8]" },
  expired: { text: "만료", c: "text-neutral-500" },
  closed: { text: "종료", c: "text-neutral-500" },
};

/** 끝난 제안 기록 */
function OfferHistory({ s }: { s: CareerState }) {
  const log = s.offerLog ?? [];
  if (!log.length) return null;
  return (
    <Panel icon="🗂️" title="지난 제안·이적 기록" accent="#9a9a9a" bodyClass="space-y-1 text-[11.5px]">
      {log.map(e => {
        const p = s.players[e.player], t = s.teams[e.team];
        const r = LOG_RESULT[e.result];
        return (
          <div key={e.id} className="grid grid-cols-[48px_1fr_auto] gap-1.5 items-baseline">
            <span className="text-[10px] text-neutral-500">{e.season}시즌 {e.week}주</span>
            <span className="min-w-0">
              <span className="truncate">{e.dir === "out" ? `${t?.name ?? "?"} ← ${p?.name ?? "?"}` : `${p?.name ?? "?"} ← ${t?.name ?? "?"}`}</span>
              <span className="text-neutral-400"> · {e.fee.toLocaleString()}만원</span>
              {e.note && <span className="block text-[10px] text-neutral-500 truncate">{e.note}</span>}
            </span>
            <span className={cn("text-[11px]", r?.c)}>{r?.text ?? e.result}</span>
          </div>
        );
      })}
    </Panel>
  );
}

function ManagerTab({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  const { reply, done, fail } = useMut();
  const accept = trpc.career.acceptJob.useMutation({ onSuccess: r => { done(r); if (!(r.result as { pending?: boolean }).pending) navigate("/lobby"); }, onError: fail });
  const respond = trpc.career.respondJob.useMutation({ onSuccess: done, onError: fail });
  const [asks, setAsks] = useState<Record<number, number>>({});
  const rep = s.manager?.reputation ?? 50;
  const lv = managerLevel(s), exp = s.manager?.exp ?? 0, need = managerExpNeed(lv);
  const perks = levelPerks(lv);
  const ranked = proTeams(s).sort((a, b) => teamPower(s, b.id) - teamPower(s, a.id));
  return (
    <div className="space-y-2 text-[12.5px]">
      <Panel icon="🎩" title={`감독 Lv.${lv}`} right={`경험치 ${exp} / ${need}`}>
        <div className="h-2 bg-neutral-800"><div className="h-full bg-gradient-to-r from-[#4aa3e0] to-[#8fd0ff]" style={{ width: `${(exp / need) * 100}%` }} /></div>
        <div className="text-[10.5px] text-neutral-500">프로리그 승리 +30 · 패배 +10 · 개인리그 우리 선수 승리 +5 · 시즌 성적·개인리그 우승 보너스</div>
        <div className="grid grid-cols-4 gap-1 pt-0.5">
          {([["스폰서 예산", `+${Math.round((perks.sponsor - 1) * 100)}%`], ["요구 연봉", `-${Math.round((1 - perks.salary) * 100)}%`], ["이적료", `-${Math.round((1 - perks.fee) * 100)}%`], ["무소속 영입", `-${Math.round((1 - perks.scout) * 100)}%`]] as const).map(([k, v]) => (
            <div key={k} className="border border-neutral-700 bg-black/60 py-1 text-center">
              <div className="text-[9.5px] text-neutral-400 whitespace-nowrap">{k}</div>
              <div className="text-[13px] text-[#bff5c6] font-bold">{v}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel icon="⭐" title="감독 평판" right={<b className="text-[#ffe45c] text-[12px]">{rep} / 100</b>}>
        <div className="h-2 bg-neutral-800"><div className="h-full bg-gradient-to-r from-[#c9a227] to-[#f8e070]" style={{ width: `${rep}%` }} /></div>
        <div className="text-[10.5px] text-neutral-500">시즌 성적(우승 +20 · 준우승 +12 · 플레이오프 +7 · 준PO +4 · 탈락 -6 · 강등 -15 · 2부 승격 +10)과 개인리그 우승 선수로 오르내립니다. 평판이 높으면 시즌이 끝날 때 더 강한 팀에서 감독 제의가 옵니다. 옮기면 지금 구단 자금은 두고 가고, 새 구단이 영입 계약금을 운영 자금에 보태 줍니다. 감독 레벨·경험치·평판은 그대로입니다.</div>
      </Panel>
      <ManagerNameBox />
      {reply && <Reply {...reply} />}
      <Panel icon="✉️" title="받은 감독 제의" accent="#8fe07a">
        {s.pendingJob && <div className="border border-[#8fe07a] p-1.5 mb-1 text-[#bff5c6]">✅ {s.teams[s.pendingJob.team].name} 감독 제의 수락 — 이번 시즌이 끝나면 옮깁니다 (영입 계약금 {s.pendingJob.fee.toLocaleString()}만)</div>}
        {!(s.jobOffers ?? []).length && !s.pendingJob && <div className="text-neutral-500">없음 (시즌 중에도 가끔, 시즌이 끝나면 평판에 따라 제의가 옵니다)</div>}
        {(s.jobOffers ?? []).map(o => {
          const t = s.teams[o.team];
          const ask = asks[o.team] ?? Math.round((o.fee * 1.2) / 10) * 10;
          const busy = accept.isPending || respond.isPending;
          return (
            <div key={o.team} className="border-t border-neutral-700 first:border-t-0 py-1.5 space-y-1">
              <div className="flex items-center gap-2">
                <TeamLogo team={t} className="w-[52px] h-[30px]" />
                <span className="flex-1">{t.name} <span className="text-neutral-500">전력 {teamPower(s, o.team).toLocaleString()}</span>
                  <span className="block text-[10.5px] text-[#bff5c6]">영입 계약금 <b className="text-[#ffe45c]">{o.fee.toLocaleString()}만</b>{o.status === "countered" ? " (협상됨)" : ""} · 구단 자금 {t.money.toLocaleString()}만 · 협상 {o.tries}/3</span></span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-neutral-400 text-[11.5px]">원하는 계약금</span>
                <FeeStepper value={ask} onChange={v => setAsks({ ...asks, [o.team]: v })} />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button disabled={busy || !!s.pendingJob} onClick={() => confirm(`${t.name} 감독으로 옮길까요?${s.phase !== "offseason" ? "\n시즌 중이라 이번 시즌이 끝나면 자동으로 옮깁니다." : ""}\n지금 구단 자금은 두고 가고, ${t.name}이(가) 영입 계약금 ${o.fee.toLocaleString()}만원을 운영 자금(현재 ${t.money.toLocaleString()}만원)에 더해 줍니다.\n감독 레벨·경험치·평판은 그대로 유지됩니다.`) && accept.mutate({ teamId: o.team })}
                  className="border border-[#8fe07a] text-[#bff5c6] py-1 disabled:opacity-40">수락</button>
                <button disabled={busy} onClick={() => { setAsks({ ...asks, [o.team]: ask }); respond.mutate({ teamId: o.team, action: "counter", fee: ask }); }} className="border border-[#f8e070] text-[#ffe45c] py-1 disabled:opacity-40">역제안</button>
                <button disabled={busy} onClick={() => confirm(`${t.name}의 제의를 거절할까요?`) && respond.mutate({ teamId: o.team, action: "reject" })} className="border border-[#ff6b6b] text-[#ffb8c8] py-1 disabled:opacity-40">거절</button>
              </div>
            </div>
          );
        })}
        {(s.manager?.teams?.length ?? 0) > 1 && <div className="text-[10.5px] text-neutral-500 pt-1">맡았던 팀: {s.manager!.teams!.map(id => s.teams[id]?.name).join(" → ")}</div>}
      </Panel>
      <Panel icon="📊" title="팀별 제의에 필요한 평판" accent="#9a9a9a" bodyClass="space-y-0.5">
        {ranked.map((t, i) => (
          <div key={t.id} className={cn("flex justify-between text-[11.5px]", t.id === s.myTeam && "text-[#8fd0ff]")}>
            <span>{i + 1}. {t.name}{t.div === 2 ? <span className="text-neutral-500"> (2부)</span> : null}</span><span className={rep >= jobThreshold(i) ? "text-[#bff5c6]" : "text-neutral-500"}>{rep >= jobThreshold(i) ? "✔ " : ""}{jobThreshold(i)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

const TABS: Array<[Tab, string, string]> = [["sponsor", "스폰서", "🤝"], ["money", "재정", "💰"], ["contracts", "계약", "📝"], ["offers", "제안", "📨"], ["manager", "감독", "🎩"], ["history", "이력", "🏆"]];

function MainSponsorCard({ s }: { s: CareerState }) {
  const { reply, done, fail } = useMut();
  const sp = s.mainSponsor;
  const name = mainSponsorName(s);
  const [terms, setTerms] = useState<MainSponsorTerms | null>(null);
  const [years, setYears] = useState(1);
  const neg = trpc.career.mainSponsor.useMutation({
    onSuccess: r => {
      done(r);
      const res = r.result as { result: string; counter?: MainSponsorTerms };
      if (res.counter) setTerms(res.counter);
      if (res.result === "signed") setTerms(null);
    },
    onError: fail,
  });
  if (!sp) return null;
  const cur: MainSponsorTerms = { win: sp.win, loss: sp.loss, proTitle: sp.proTitle, proRunnerUp: sp.proRunnerUp, mslTitle: sp.mslTitle, mslRunnerUp: sp.mslRunnerUp };
  const edit = terms ?? cur;
  const budget = sponsorBudget(s);
  const limit = Math.round(budget * SPONSOR_STRETCH);
  const factors = sponsorFactors(s);
  const value = termsValue(edit);
  const open = canNegotiate(s);
  return (
    <Panel icon="👑" title={`메인 스폰서 · ${name}`} right={`남은 계약 ${sp.years}시즌`} className="border-2">
      <div className="text-[10.5px] text-neutral-400">필수 스폰서 · 감독 Lv.{managerLevel(s)} 예산 <b className="text-neutral-200">{budget.toLocaleString()}만</b></div>
      <div className="text-[10.5px] text-neutral-400">
        감독 협상력 <b className={factors.mul >= 1 ? "text-[#bff5c6]" : "text-[#ffb8c8]"}>{Math.round(factors.mul * 100)}%</b>
        {factors.items.length ? ` · ${factors.items.map(x => `${x.label} ${x.v > 0 ? "+" : ""}${Math.round(x.v * 100)}%`).join(" · ")}` : " · 평판·지난 시즌 성적(우승하면 ↑, 강등·하위권이면 크게 ↓)"}
      </div>
      {open ? (Object.keys(TERM_NAMES) as Array<keyof MainSponsorTerms>).map(k => (
        <div key={k} className="flex items-center justify-between gap-1">
          <span className="text-neutral-300">{TERM_NAMES[k]}</span>
          <FeeStepper value={edit[k]} onChange={v => setTerms({ ...edit, [k]: v })} steps={k === "win" || k === "loss" ? [10, 50] : [100]} />
        </div>
      )) : (
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(TERM_NAMES) as Array<keyof MainSponsorTerms>).map(k => (
            <div key={k} className="border border-neutral-700 bg-black/60 py-1 text-center">
              <div className="text-[10px] text-neutral-400 whitespace-nowrap">{TERM_NAMES[k]}</div>
              <div className="text-[13.5px] text-[#bff5c6] font-bold">{sp[k].toLocaleString()}<span className="text-[10px] font-normal">만</span></div>
            </div>
          ))}
        </div>
      )}
      {open ? (
        <>
          <div className="flex items-center justify-between"><span className="text-neutral-300">계약 기간</span>
            <div className="flex gap-1">{[1, 2, 3].map(y => <button key={y} onClick={() => setYears(y)} className={cn("border px-2", years === y ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>{y}년</button>)}</div>
          </div>
          <div className="text-[11px] text-neutral-400">한 시즌 기대 지급액 <b className={value <= budget ? "text-[#bff5c6]" : value <= limit ? "text-[#ffe45c]" : "text-[#ffb8c8]"}>{value.toLocaleString()}</b> / 스폰서 예산 {budget.toLocaleString()} (협상하면 최대 {limit.toLocaleString()}) — 승리 수당을 올리면 우승 수당을 줄이는 식으로 나누세요</div>
          <div className="h-1.5 bg-neutral-800"><div className="h-full" style={{ width: `${Math.min(100, (value / limit) * 100)}%`, background: value <= budget ? "#8fe07a" : value <= limit ? "#ffe45c" : "#ff6b6b" }} /></div>
          {reply && <Reply {...reply} />}
          <button disabled={neg.isPending} onClick={() => neg.mutate({ terms: edit, years })} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>{name}에 계약 제안</button>
        </>
      ) : <div className="text-[10.5px] text-neutral-500">재협상은 비시즌이나 시즌 첫 경기 전에 할 수 있습니다. 감독 레벨·평판·지난 시즌 성적(우승)에 따라 예산이 달라집니다.</div>}
    </Panel>
  );
}

function canNegotiate(s: CareerState) {
  if (s.phase === "offseason") return true;
  return s.week === 1 && !s.live && !s.matches.some(m => m.done && (m.a === s.myTeam || m.b === s.myTeam));
}

function QuestRow({ s, q }: { s: CareerState; q: SponsorQuest }) {
  const pr = questProgress(s, q);
  const pct = q.kind === "rank" ? (pr.now <= q.target ? 100 : Math.max(5, 100 - (pr.now - q.target) * 15)) : Math.min(100, (pr.now / q.target) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between"><span>{questLabel(s, q)}</span><span className={q.done ? "text-[#bff5c6]" : "text-[#ffe45c]"}>{q.done ? "✔ 달성" : `${questReward(q).toLocaleString()}만`}</span></div>
      <div className="h-1.5 bg-neutral-800"><div className="h-full" style={{ width: `${pct}%`, background: q.done ? "#8fe07a" : "#f8e070" }} /></div>
      <div className="text-[10.5px] text-neutral-500">{q.kind === "rank" ? `현재 ${pr.now}위 (정규시즌 끝에 판정)` : `현재 ${pr.now} / ${q.target}`}</div>
    </div>
  );
}

function SponsorTab({ s }: { s: CareerState }) {
  const { reply, done, fail } = useMut();
  const choose = trpc.career.chooseSponsor.useMutation({ onSuccess: done, onError: fail });
  // 서버와 같은 세이브로 매번 계산 (제의는 이름으로 골라 계약한다)
  const offers = useMemo(() => sponsorOffers(s), [s]);
  const [targets, setTargets] = useState<Record<string, number[]>>({});
  const mine = activeSponsors(s);
  const { count, basis } = sponsorOfferCount(s);
  const max = maxSponsors(s);
  const full = mine.length >= max;
  const left = offers.filter(o => !mine.some(x => x.name === o.name));
  return (
    <div className="space-y-2 text-[12.5px]">
      <MainSponsorCard s={s} />
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[#ffe45c] text-[13px] font-bold">🤝 서브 스폰서</span>
        <span className="flex gap-0.5">{Array.from({ length: max }, (_, i) => <span key={i} className={cn("w-2.5 h-2.5 border", i < mine.length ? "bg-[#8fe07a] border-[#8fe07a]" : "border-neutral-600")} />)}</span>
        <span className="ml-auto text-[11px] text-neutral-400">계약 {mine.length}/{max} · 후원금 주 {mine.reduce((a, x) => a + x.weekly, 0)}만</span>
      </div>
      {mine.map(sp => (
        <Panel key={sp.name} icon="✅" title={sp.name} accent="#8fe07a" right={`후원금 주 ${sp.weekly}만원`}>
          {sp.quests.map((q, i) => <QuestRow key={i} s={s} q={q} />)}
        </Panel>
      ))}
      {reply && <Reply {...reply} />}
      {!full && (
        <>
          <div className="text-center text-[11.5px] text-neutral-300">
            이번 시즌 스폰서 제의 <b className="text-[#ffe45c]">{count}곳</b> ({basis}·감독 명성·레벨 기준) — 최대 {max}곳과 계약할 수 있습니다{max === 1 ? " (2부 팀)" : ""}.<br />
            퀘스트 목표를 올리면 보상이 커지고, 낮추면 줄어듭니다.
          </div>
          {left.map(o => (
            <Panel key={o.name} icon="📄" title={o.name} accent="#c8c8c8" right={<>후원금 주 <b className="text-[#ffe45c] text-[12px]">{o.weekly}</b>만원</>}>
              {o.quests.map((q, i) => {
                const [lo, hi] = questRange(q);
                const row = targets[o.name] ?? o.quests.map(x => x.target);
                const tg = row[i] ?? q.target;
                const set = (v: number) => setTargets(prev => ({ ...prev, [o.name]: row.map((x, ii) => (ii === i ? Math.max(lo, Math.min(hi, v)) : x)) }));
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="flex-1 min-w-0 truncate">{questLabel(s, q, tg)}</span>
                    <button onClick={() => set(q.kind === "rank" ? tg + 1 : tg - 1)} className="border border-neutral-600 px-1.5 text-[11px]">쉽게</button>
                    <button onClick={() => set(q.kind === "rank" ? tg - 1 : tg + 1)} className="border border-neutral-600 px-1.5 text-[11px]">어렵게</button>
                    <span className="w-14 text-right text-[#bff5c6]">{questReward(q, tg).toLocaleString()}만</span>
                  </div>
                );
              })}
              <button disabled={choose.isPending} onClick={() => choose.mutate({ name: o.name, targets: targets[o.name] ?? o.quests.map(q => q.target) })} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>{choose.isPending && choose.variables?.name === o.name ? "계약 중…" : `이 스폰서와 계약 (${mine.length + 1}/${max})`}</button>
            </Panel>
          ))}
        </>
      )}
      {full && <div className="text-center text-[11px] text-neutral-500">이번 시즌 스폰서 계약을 모두 마쳤습니다</div>}
    </div>
  );
}

export default function Club() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  return <ClubScreen s={s} />;
}

/** 구단 이력 + 감독 시즌별 성적 */
function HistoryTab({ s }: { s: CareerState }) {
  return (
    <div className="space-y-2">
      <Panel icon="🏆" title={`${s.teams[s.myTeam].name} 구단 이력`}>
        <TeamHistory s={s} tid={s.myTeam} />
      </Panel>
      <Panel icon="🎩" title="감독 시즌별 성적" accent="#8fd0ff" bodyClass="space-y-0.5">
        {!s.history.length && <div className="text-neutral-500">아직 끝난 시즌이 없습니다</div>}
        {s.history.map(h => (
          <div key={h.season} className="grid grid-cols-[48px_1fr_auto] gap-1.5 items-baseline">
            <span className="text-neutral-400">{h.season}시즌</span>
            <span className="truncate">{s.teams[h.team ?? s.myTeam]?.name} <span className="text-neutral-500">({h.div === 2 ? "2부 " : ""}{h.myRank}위)</span></span>
            <span className={cn(h.myResult === "우승" || h.myResult === "승격" ? "text-[#ffe45c]" : h.myResult === "강등" ? "text-[#ffb8c8]" : "text-neutral-300")}>{h.myResult}{h.myMsl ? (h.myMsl === 1 ? " · 🥇" : " · 🥈") : ""}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/** 머리글: 구단 로고·보유 금액·주간 손익·감독 */
function ClubHeader({ s }: { s: CareerState }) {
  const me = s.teams[s.myTeam];
  const { net } = weeklyFlow(s);
  const lv = managerLevel(s), rep = s.manager?.reputation ?? 50;
  const rank = proTeams(s).filter(t => t.div === me.div).sort((a, b) => teamPower(s, b.id) - teamPower(s, a.id)).findIndex(t => t.id === me.id) + 1;
  return (
    <div className="mb-2 border border-[#f8e070]/60 px-2 py-1.5 flex items-center gap-2" style={{ background: "linear-gradient(90deg, #2a2410, #0b0b10 70%)" }}>
      <TeamLogo team={me} className="w-[58px] h-[34px] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-neutral-100 truncate">{me.name}<span className="text-[10.5px] font-normal text-neutral-400"> · {me.div === 2 ? "2부" : "1부"} 전력 {rank}위</span></div>
        <div className="text-[10.5px] text-neutral-400 truncate">🎩 감독 Lv.{lv} · 평판 {rep} · 난이도 {difficultyOf(s).name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={cn("text-[16px] font-bold leading-tight", me.money < 0 ? "text-[#ff6b6b]" : "text-[#ffe45c]")}>{me.money.toLocaleString()}<span className="text-[10.5px] font-normal">만</span></div>
        <div className={cn("text-[10.5px]", tone(net))}>매주 {sign(net)}만</div>
      </div>
    </div>
  );
}

function ClubScreen({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  // ?tab=offers 처럼 알림에서 바로 그 탭으로
  const search = useSearch();
  const asked = new URLSearchParams(search).get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(() => (asked && TABS.some(([k]) => k === asked) ? asked : activeSponsors(s).length === 0 ? "sponsor" : "money"));
  useEffect(() => { if (asked && TABS.some(([k]) => k === asked)) setTab(asked); }, [search]);
  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/lobby")} onNext={() => navigate("/lobby")} nextLabel="◁◁ 감독실">
      <div className="px-3 pt-2 pb-4">
        <ClubHeader s={s} />
        <div className="grid grid-cols-6 gap-1 mb-2">
          {TABS.map(([k, label, icon]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("text-[11.5px] pt-0.5 pb-1 border relative flex flex-col items-center leading-tight", tab === k ? "text-black border-white font-bold" : "text-neutral-300 border-neutral-700 bg-neutral-900/60")}
              style={tab === k ? { background: "linear-gradient(#ffffff,#cfcfcf)" } : undefined}>
              <span className="text-[15px]">{icon}</span>
              {label}
              {k === "offers" && (s.offers?.length ?? 0) + (s.joinRequests?.length ?? 0) + (s.raiseRequest ? 1 : 0) > 0 && <span className="absolute -top-1.5 -right-1 bg-[#ff4d4d] text-white text-[9px] rounded-full px-1">{(s.offers?.length ?? 0) + (s.joinRequests?.length ?? 0) + (s.raiseRequest ? 1 : 0)}</span>}
              {k === "manager" && (s.jobOffers?.length ?? 0) > 0 && <span className="absolute -top-1.5 -right-1 bg-[#ff4d4d] text-white text-[9px] rounded-full px-1">{s.jobOffers!.length}</span>}
            </button>
          ))}
        </div>
        {tab === "sponsor" && <SponsorTab s={s} />}
        {tab === "money" && <MoneyTab s={s} />}
        {tab === "contracts" && <ContractsTab s={s} />}
        {tab === "offers" && <OffersTab s={s} />}
        {tab === "manager" && <ManagerTab s={s} />}
        {tab === "history" && <HistoryTab s={s} />}
      </div>
    </LegacyFrame>
  );
}
