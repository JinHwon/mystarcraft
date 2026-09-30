/**
 * 구단 운영: 재정 · 계약(재계약) · 받은 영입 제안 · 감독
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { DEBT_LIMIT_WEEKS, OPERATING_COST, totalOf, type CareerState, type Contract } from "@shared/career/rules";
import { jobThreshold, playerDemand, teamWages } from "@shared/career/contract";
import { MAX_SPONSORS, activeSponsors, questLabel, questProgress, questRange, questReward, sponsorOfferCount, sponsorOffers, type SponsorQuest } from "@shared/career/sponsor";
import { MAIN_SPONSORS, TERM_NAMES, jobSigningFee, levelPerks, managerExpNeed, managerLevel, sponsorBudget, termsValue, type MainSponsorTerms } from "@shared/career/mainSponsor";
import { proTeams, rosterOf, teamPower } from "@shared/career/view";
import { useCareer, useCareerPatch } from "@/lib/career";
import type { CareerDiff } from "@shared/career/diff";
import { LegacyFrame, TeamLogo } from "@/components/legacy/Legacy";
import { PlayerPanel } from "@/components/legacy/LegacyMatch";
import { ContractEditor, ContractText, FeeStepper, MoraleBar, Reply } from "@/components/legacy/Club";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
type Tab = "sponsor" | "money" | "contracts" | "offers" | "manager";

function useMut() {
  const patch = useCareerPatch();
  const [reply, setReply] = useState<{ text: string; ok: boolean } | null>(null);
  const done = (r: { diff: CareerDiff; result: unknown }) => {
    patch(r.diff);
    const res = r.result as { message?: string; result?: string };
    if (res?.message) setReply({ text: res.message, ok: res.result === "signed" || res.result === "sold" });
  };
  const fail = (e: { message: string }) => setReply({ text: e.message, ok: false });
  return { reply, setReply, done, fail };
}

function MoneyTab({ s }: { s: CareerState }) {
  const me = s.teams[s.myTeam];
  const wages = teamWages(s, s.myTeam);
  const items = Object.entries(s.ledger?.season === s.season ? s.ledger.items : {}).sort((a, b) => b[1] - a[1]);
  const income = items.filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0);
  const expense = items.filter(([, v]) => v < 0).reduce((a, [, v]) => a + v, 0);
  const sponsors = activeSponsors(s);
  const spon = sponsors.reduce((a, x) => a + x.weekly, 0);
  const weekly = spon - Math.round(wages / 11) - OPERATING_COST;
  return (
    <div className="space-y-2 text-[12.5px]">
      <div className="border border-neutral-600 p-2 flex justify-between items-center">
        <span className="text-neutral-400">보유 금액</span>
        <span className={cn("text-[18px]", me.money < 0 ? "text-[#ff6b6b]" : "text-[#ffe45c]")}>{me.money.toLocaleString()} 만원</span>
      </div>
      {(s.debtWeeks ?? 0) > 0 && <Reply text={`⚠️ 적자 ${s.debtWeeks}주째! ${DEBT_LIMIT_WEEKS - (s.debtWeeks ?? 0)}주 안에 흑자로 돌리지 못하면 구단이 해체됩니다`} />}
      <div className="border border-neutral-600 p-2 space-y-0.5">
        <div className="text-[#ffe45c] mb-1">매주 고정 수입·지출</div>
        <div className="flex justify-between"><span className="text-neutral-400">서브 스폰서 후원금{spon ? ` (${sponsors.map(x => x.name).join("·")})` : " (없음)"}</span><span className="text-[#bff5c6]">+{spon}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">연봉 (정규시즌, 총 {wages.toLocaleString()}만 ÷ 11주)</span><span className="text-[#ffb8c8]">-{Math.round(wages / 11)}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">구단 운영비</span><span className="text-[#ffb8c8]">-{OPERATING_COST}</span></div>
        <div className="flex justify-between border-t border-neutral-700 pt-0.5"><span>합계 (경기 수당 제외)</span><span className={weekly >= 0 ? "text-[#bff5c6]" : "text-[#ffb8c8]"}>{weekly >= 0 ? "+" : ""}{weekly}</span></div>
        <div className="text-[10.5px] text-neutral-500">경기 수당(주 2경기)은 메인 스폰서 계약: 승리 +{s.mainSponsor?.win ?? 0}, 패배 +{s.mainSponsor?.loss ?? 0} · 퀘스트·상금·보너스·이적료는 따로</div>
      </div>
      <div className="border border-neutral-600 p-2 space-y-0.5">
        <div className="text-[#ffe45c] mb-1">{s.season}시즌 장부</div>
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between"><span className="text-neutral-400">{k}</span><span className={v >= 0 ? "text-[#bff5c6]" : "text-[#ffb8c8]"}>{v >= 0 ? "+" : ""}{v.toLocaleString()}</span></div>
        ))}
        {!items.length && <div className="text-neutral-500">아직 기록이 없습니다</div>}
        <div className="flex justify-between border-t border-neutral-700 pt-0.5"><span>수입 {income.toLocaleString()} / 지출 {(-expense).toLocaleString()}</span><span className={income + expense >= 0 ? "text-[#bff5c6]" : "text-[#ffb8c8]"}>{income + expense >= 0 ? "+" : ""}{(income + expense).toLocaleString()}</span></div>
      </div>
    </div>
  );
}

function ContractsTab({ s }: { s: CareerState }) {
  const { reply, setReply, done, fail } = useMut();
  const [sel, setSel] = useState<number | undefined>();
  const roster = useMemo(() => s.players.filter(p => p.team === s.myTeam).sort((a, b) => Number(!!a.reserve) - Number(!!b.reserve) || totalOf(b.stats) - totalOf(a.stats)), [s]);
  const played = s.matches.filter(m => m.done && m.stage === "regular" && (m.a === s.myTeam || m.b === s.myTeam)).length;
  const contract = trpc.career.contract.useMutation({ onSuccess: done, onError: fail });
  const p = sel !== undefined ? s.players[sel] : undefined;
  return (
    <div className="space-y-2">
      <div className="text-center text-[11px] text-neutral-400">이번 시즌 팀 경기 {played}경기 · 연봉 합계 {teamWages(s, s.myTeam).toLocaleString()}만원</div>
      <div className="border-2 border-neutral-300 p-0.5">
        {roster.map(x => (
          <button key={x.id} onClick={() => { setSel(x.id); setReply(null); }} className={cn("w-full text-left px-1 py-1 border-b border-neutral-800 last:border-b-0", sel === x.id && "bg-[#3a3a5a]")}>
            <div className="flex items-center gap-1 text-[12.5px]">
              <span className="flex-1 truncate">{x.name} ({R[x.race]}){x.reserve ? <span className="text-[10px] text-[#8fe07a]"> 2부</span> : null}</span>
              <span className="text-[10.5px] text-neutral-400">출전 {x.sApps ?? 0}{x.contract?.minApps ? `/${x.contract.minApps}` : ""}</span>
              <MoraleBar p={x} />
            </div>
            <div className={cn("text-[10.5px]", x.contract && x.contract.years <= 1 ? "text-[#ffd9a8]" : "text-neutral-500")}>
              <ContractText c={x.contract} />{x.contract && x.contract.years <= 1 ? " · 이번 시즌 후 만료" : ""}
            </div>
          </button>
        ))}
      </div>
      {p && (
        <>
          <PlayerPanel p={p} color="#8fd0ff" empty="" />
          {reply && <Reply {...reply} />}
          <ContractEditor player={p} demand={playerDemand(s, p, s.myTeam)} pending={contract.isPending} submitLabel="재계약 제안"
            onSubmit={(c: Contract) => contract.mutate({ playerId: p.id, salary: c.salary, years: c.years, minApps: c.minApps, bonus: c.bonus })} />
        </>
      )}
    </div>
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
  const offers = s.offers ?? [];
  return (
    <div className="space-y-2">
      {reply && <Reply {...reply} />}
      {!offers.length && <div className="text-center text-[12px] text-neutral-500 py-6">받은 영입 제안이 없습니다<br />(출전이 적거나 이적을 희망하는 선수에게 제안이 잘 들어옵니다)</div>}
      {offers.map(o => {
        const p = s.players[o.player], t = s.teams[o.team];
        const fee = fees[o.id] ?? Math.round((o.fee * 1.3) / 10) * 10;
        return (
          <div key={o.id} className="border border-neutral-600 p-2 space-y-1.5 text-[12px]">
            <div className="flex items-center gap-2">
              <TeamLogo team={t} className="w-[52px] h-[30px]" />
              <div className="flex-1">
                <div><b>{t.name}</b> → <span className="text-[#8fd0ff]">{p.name} ({R[p.race]})</span></div>
                <div className="text-neutral-400">제시 금액 <b className="text-[#ffe45c]">{o.fee.toLocaleString()}만원</b>{o.status === "countered" ? " (역제안 받음)" : ""} · 협상 {o.tries}/3</div>
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
              <button disabled={respond.isPending} onClick={() => act(o.id, "counter", fee)} className="border border-[#f8e070] text-[#ffe45c] py-1">{label(o.id, "counter", "역제안")}</button>
              <button disabled={respond.isPending} onClick={() => act(o.id, "reject")} className="border border-[#ff6b6b] text-[#ffb8c8] py-1">{label(o.id, "reject", "반대")}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManagerTab({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  const { reply, done, fail } = useMut();
  const accept = trpc.career.acceptJob.useMutation({ onSuccess: r => { done(r); navigate("/lobby"); }, onError: fail });
  const rep = s.manager?.reputation ?? 50;
  const lv = managerLevel(s), exp = s.manager?.exp ?? 0, need = managerExpNeed(lv);
  const perks = levelPerks(lv);
  const ranked = proTeams(s).sort((a, b) => teamPower(s, b.id) - teamPower(s, a.id));
  return (
    <div className="space-y-2 text-[12.5px]">
      <div className="border border-[#f8e070]/70 p-2 space-y-1">
        <div className="flex justify-between items-baseline"><span className="text-[15px] text-[#ffe45c]">감독 Lv.{lv}</span><span className="text-neutral-400">경험치 {exp} / {need}</span></div>
        <div className="h-2 bg-neutral-800"><div className="h-full bg-[#8fd0ff]" style={{ width: `${(exp / need) * 100}%` }} /></div>
        <div className="text-[10.5px] text-neutral-500">프로리그 승리 +30 · 패배 +10 · 개인리그 우리 선수 승리 +5 · 시즌 성적·개인리그 우승 보너스</div>
        <div className="grid grid-cols-2 gap-x-2 text-[11.5px] pt-1">
          <span className="text-neutral-400">스폰서 예산</span><span className="text-right text-[#bff5c6]">+{Math.round((perks.sponsor - 1) * 100)}%</span>
          <span className="text-neutral-400">선수 요구 연봉</span><span className="text-right text-[#bff5c6]">-{Math.round((1 - perks.salary) * 100)}%</span>
          <span className="text-neutral-400">다른 팀 이적료</span><span className="text-right text-[#bff5c6]">-{Math.round((1 - perks.fee) * 100)}%</span>
          <span className="text-neutral-400">무소속 영입 금액</span><span className="text-right text-[#bff5c6]">-{Math.round((1 - perks.scout) * 100)}%</span>
        </div>
      </div>
      <div className="border border-neutral-600 p-2">
        <div className="flex justify-between"><span className="text-neutral-400">감독 평판</span><span className="text-[#ffe45c]">{rep} / 100</span></div>
        <div className="h-2 bg-neutral-800 mt-1"><div className="h-full bg-[#f8e070]" style={{ width: `${rep}%` }} /></div>
        <div className="text-[10.5px] text-neutral-500 mt-1">시즌 성적(우승 +20 · 준우승 +12 · 플레이오프 +7 · 준PO +4 · 탈락 -6)과 개인리그 우승 선수로 오르내립니다. 평판이 높으면 시즌이 끝날 때 더 강한 팀에서 감독 제의가 옵니다. 옮길 때 지금 운영 자금을 그대로 가져갑니다.</div>
      </div>
      {reply && <Reply {...reply} />}
      <div className="border border-neutral-600 p-2">
        <div className="text-[#ffe45c] mb-1">받은 감독 제의</div>
        {!(s.jobOffers ?? []).length && <div className="text-neutral-500">없음 (시즌이 끝나면 평판에 따라 제의가 옵니다)</div>}
        {(s.jobOffers ?? []).map(id => (
          <div key={id} className="flex items-center gap-2 py-1">
            <TeamLogo team={s.teams[id]} className="w-[52px] h-[30px]" />
            <span className="flex-1">{s.teams[id].name} <span className="text-neutral-500">전력 {teamPower(s, id).toLocaleString()}</span>
              <span className="block text-[10.5px] text-[#bff5c6]">영입 계약금 {jobSigningFee(s, id).toLocaleString()}만 · 구단 자금 {s.teams[id].money.toLocaleString()}만</span></span>
            <button disabled={accept.isPending || s.phase !== "offseason"} onClick={() => confirm(`${s.teams[id].name} 감독으로 옮길까요?\n지금 구단 자금은 두고 가고, ${s.teams[id].name}이(가) 영입 계약금 ${jobSigningFee(s, id).toLocaleString()}만원을 운영 자금(현재 ${s.teams[id].money.toLocaleString()}만원)에 더해 줍니다.`) && accept.mutate({ teamId: id })}
              className="border border-[#8fe07a] text-[#bff5c6] px-2 py-1 disabled:opacity-40">수락</button>
          </div>
        ))}
      </div>
      <div className="border border-neutral-600 p-2">
        <div className="text-[#ffe45c] mb-1">팀별 제의에 필요한 평판</div>
        {ranked.map((t, i) => (
          <div key={t.id} className={cn("flex justify-between text-[11.5px]", t.id === s.myTeam && "text-[#8fd0ff]")}>
            <span>{i + 1}. {t.name}</span><span className={rep >= jobThreshold(i) ? "text-[#bff5c6]" : "text-neutral-500"}>{jobThreshold(i)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: Array<[Tab, string]> = [["sponsor", "스폰서"], ["money", "재정"], ["contracts", "계약"], ["offers", "제안"], ["manager", "감독"]];

function MainSponsorCard({ s }: { s: CareerState }) {
  const { reply, done, fail } = useMut();
  const sp = s.mainSponsor;
  const name = MAIN_SPONSORS[s.myTeam]?.name ?? "모기업";
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
  const value = termsValue(edit);
  const open = canNegotiate(s);
  return (
    <div className="border-2 border-[#f8e070]/70 p-2 space-y-1.5 text-[12px]">
      <div className="flex items-center gap-2">
        <TeamLogo team={s.teams[s.myTeam]} className="w-[52px] h-[30px]" />
        <div className="flex-1"><div className="text-[15px] text-[#ffe45c]">메인 스폰서 · {name}</div><div className="text-[10.5px] text-neutral-400">필수 스폰서 · 남은 계약 {sp.years}시즌 · 감독 Lv.{managerLevel(s)} 예산 {budget.toLocaleString()}만</div></div>
      </div>
      {(Object.keys(TERM_NAMES) as Array<keyof MainSponsorTerms>).map(k => (
        <div key={k} className="flex items-center justify-between gap-1">
          <span className="text-neutral-300">{TERM_NAMES[k]}</span>
          {open ? <FeeStepper value={edit[k]} onChange={v => setTerms({ ...edit, [k]: v })} steps={k === "win" || k === "loss" ? [10, 50] : [100]} />
            : <span className="text-[#bff5c6]">{sp[k].toLocaleString()}만</span>}
        </div>
      ))}
      {open ? (
        <>
          <div className="flex items-center justify-between"><span className="text-neutral-300">계약 기간</span>
            <div className="flex gap-1">{[1, 2, 3].map(y => <button key={y} onClick={() => setYears(y)} className={cn("border px-2", years === y ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>{y}년</button>)}</div>
          </div>
          <div className="text-[11px] text-neutral-400">한 시즌 기대 지급액 <b className={value <= budget ? "text-[#bff5c6]" : "text-[#ffb8c8]"}>{value.toLocaleString()}</b> / 스폰서 예산 {budget.toLocaleString()} — 승리 수당을 올리면 우승 수당을 줄이는 식으로 나누세요</div>
          <div className="h-1.5 bg-neutral-800"><div className="h-full" style={{ width: `${Math.min(100, (value / budget) * 100)}%`, background: value <= budget ? "#8fe07a" : "#ff6b6b" }} /></div>
          {reply && <Reply {...reply} />}
          <button disabled={neg.isPending} onClick={() => neg.mutate({ terms: edit, years })} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>{name}에 계약 제안</button>
        </>
      ) : <div className="text-[10.5px] text-neutral-500">재협상은 비시즌이나 시즌 첫 경기 전에 할 수 있습니다. 감독 레벨이 오르면 예산이 커집니다.</div>}
    </div>
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
  const offers = useMemo(() => sponsorOffers(s), [s.season, s.myTeam, s.manager?.level]);
  const [targets, setTargets] = useState<number[][]>(() => offers.map(o => o.quests.map(q => q.target)));
  const mine = activeSponsors(s);
  const { count, basis } = sponsorOfferCount(s);
  const full = mine.length >= MAX_SPONSORS;
  const left = offers.map((o, k) => ({ o, k })).filter(({ o }) => !mine.some(x => x.name === o.name));
  return (
    <div className="space-y-2 text-[12.5px]">
      <MainSponsorCard s={s} />
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-[#ffe45c] text-[13px]">서브 스폰서 (퀘스트)</span>
        <span className="text-[11px] text-neutral-400">계약 {mine.length}/{MAX_SPONSORS} · 후원금 주 {mine.reduce((a, x) => a + x.weekly, 0)}만</span>
      </div>
      {mine.map(sp => (
        <div key={sp.name} className="border border-[#8fe07a]/70 p-2 space-y-1.5">
          <div className="flex justify-between items-baseline"><span className="text-[15px] text-[#ffe45c]">{sp.name}</span><span className="text-neutral-400">후원금 주 {sp.weekly}만원</span></div>
          {sp.quests.map((q, i) => <QuestRow key={i} s={s} q={q} />)}
        </div>
      ))}
      {reply && <Reply {...reply} />}
      {!full && (
        <>
          <div className="text-center text-[11.5px] text-neutral-300">
            이번 시즌 스폰서 제의 <b className="text-[#ffe45c]">{count}곳</b> ({basis}·감독 명성·레벨 기준) — 최대 {MAX_SPONSORS}곳과 계약할 수 있습니다.<br />
            퀘스트 목표를 올리면 보상이 커지고, 낮추면 줄어듭니다.
          </div>
          {left.map(({ o, k }) => (
            <div key={o.name} className="border border-neutral-600 p-2 space-y-1.5">
              <div className="flex justify-between items-baseline"><span className="text-[15px] text-[#ffe45c]">{o.name}</span><span>후원금 주 <b>{o.weekly}</b>만원</span></div>
              {o.quests.map((q, i) => {
                const [lo, hi] = questRange(q);
                const tg = targets[k]?.[i] ?? q.target;
                const set = (v: number) => setTargets(prev => prev.map((row, kk) => (kk === k ? row.map((x, ii) => (ii === i ? Math.max(lo, Math.min(hi, v)) : x)) : row)));
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="flex-1 min-w-0 truncate">{questLabel(s, q, tg)}</span>
                    <button onClick={() => set(q.kind === "rank" ? tg + 1 : tg - 1)} className="border border-neutral-600 px-1.5 text-[11px]">쉽게</button>
                    <button onClick={() => set(q.kind === "rank" ? tg - 1 : tg + 1)} className="border border-neutral-600 px-1.5 text-[11px]">어렵게</button>
                    <span className="w-14 text-right text-[#bff5c6]">{questReward(q, tg).toLocaleString()}만</span>
                  </div>
                );
              })}
              <button disabled={choose.isPending} onClick={() => choose.mutate({ index: k, targets: targets[k] ?? o.quests.map(q => q.target) })} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>{choose.isPending && choose.variables?.index === k ? "계약 중…" : `이 스폰서와 계약 (${mine.length + 1}/${MAX_SPONSORS})`}</button>
            </div>
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

function ClubScreen({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>(() => (activeSponsors(s).length === 0 ? "sponsor" : "money"));
  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/lobby")} onNext={() => navigate("/lobby")} nextLabel="◁◁ 감독실">
      <div className="px-3 pt-2 pb-4">
        <div className="text-center text-[16px] tracking-[0.3em] text-neutral-100 mb-2">구 단 운 영</div>
        <div className="grid grid-cols-5 gap-1 mb-2">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("text-[12px] py-1 border relative", tab === k ? "text-black border-white" : "text-neutral-200 border-neutral-600")}
              style={tab === k ? { background: "linear-gradient(#ffffff,#cfcfcf)" } : undefined}>
              {label}
              {k === "offers" && (s.offers?.length ?? 0) > 0 && <span className="absolute -top-1.5 -right-1 bg-[#ff4d4d] text-white text-[9px] rounded-full px-1">{s.offers!.length}</span>}
              {k === "manager" && (s.jobOffers?.length ?? 0) > 0 && <span className="absolute -top-1.5 -right-1 bg-[#ff4d4d] text-white text-[9px] rounded-full px-1">{s.jobOffers!.length}</span>}
            </button>
          ))}
        </div>
        {tab === "sponsor" && <SponsorTab s={s} />}
        {tab === "money" && <MoneyTab s={s} />}
        {tab === "contracts" && <ContractsTab s={s} />}
        {tab === "offers" && <OffersTab s={s} />}
        {tab === "manager" && <ManagerTab s={s} />}
      </div>
    </LegacyFrame>
  );
}
