/**
 * 마이스타리그(개인리그): 다전제·듀얼 토너먼트·조 지명식·일정표
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { INDIV_SHORT, OLD_REGULAR_WEEKS, SECOND_PLAN_BASE, burstLabel, burstOf, decodePlan, planOf, regularWeeksOf, secondLeagueOf, slumpOn, totalOf, type CareerState, type CMatch, type CPlayer, type IndivLeague, type MslGroup, type MslSeries } from "@shared/career/rules";
import { STAGE_NAMES, activePlayers, divTeams, mapView } from "@shared/career/view";
import { gearCond, gearStats, matchCond } from "@shared/career/items";
import { trpc } from "@/lib/trpc";
import { useCareerPatch } from "@/lib/career";
import { GrayBox, LegacyFrame, LegacyImg, LegacyRadar, MapInfo, PlayerPhoto, TeamLogo } from "../Legacy";
import { R, condStats, nameRace, useSpeed } from "./common";
import { Broadcast, PlayerCard } from "./broadcast";
import { type MslReportView } from "./proleague";
import { viewStateAt, type SnapReport } from "./viewState";

/** 일정 번호(두 번째 대회는 100부터) → 그 대회 상태·일정·이름 */
export function planCtx(s: CareerState, n: number) {
  const { second, idx } = decodePlan(n);
  const league: IndivLeague = second ? s.msl2?.league ?? secondLeagueOf(s.season) : "mysl";
  const raw = second ? s.msl2 : s.msl;
  const m = raw?.season === s.season ? raw : undefined;
  const PLAN = planOf(m ?? { league, v2: regularWeeksOf(s) !== OLD_REGULAR_WEEKS });
  return { m, idx, plan: PLAN[idx], PLAN, league, name: INDIV_SHORT[league] };
}

/** 대회 로고: 마이스타리그는 원작 그림, MSL·OSL 은 글자 */
export function LeagueLogo({ league = "mysl", stage, className = "max-h-12 object-contain" }: { league?: IndivLeague; stage?: string; className?: string }) {
  if (league === "mysl") {
    const name = stage === "pc" || stage === "PC방 예선" ? "PC방" : stage === "dual" || stage === "듀얼 토너먼트" ? "DT" : "MySL";
    return <LegacyImg dir="로고" name={name} className={className} fallback={<div className="text-[18px] italic font-black text-[#c9a0ff]">MySL</div>} />;
  }
  const c = league === "msl" ? "#7fd0ff" : "#ffb46b";
  return (
    <div className="text-[22px] leading-none italic font-black tracking-wider" style={{ color: c, textShadow: `0 0 6px ${c}` }}>
      {league === "msl" ? "MSL" : "OSL"}<span className="block text-center text-[9px] not-italic font-bold tracking-normal text-neutral-300">{league === "msl" ? "MBC게임 스타리그" : "온게임넷 스타리그"}</span>
    </div>
  );
}

/** 스타리그 경기 다시 보기 (우리 선수 다전제) */
/** onClose: 다 봄, onExit: ✕ 로 나감 (없으면 onClose) */
/** stateAt: j세트 직전 선수 상태 (관전 중 아직 안 본 결과가 드러나지 않게) */
export function SeriesViewer({ s: latest, report, onClose, onExit, stateAt }: { s: CareerState; report: MslReportView; onClose: () => void; onExit?: () => void; stateAt?: (j: number) => CareerState }) {
  const [idx, setIdx] = useState(0);
  /** 세트가 끝나면 라운드별 승자 화면 → Next 로 다음 세트 */
  const [between, setBetween] = useState(false);
  const [speed, setSpeed] = useSpeed();
  const s = stateAt ? stateAt(between ? idx + 1 : idx) : latest;
  const mineLeft = s.players[report.a]?.team === s.myTeam || s.players[report.b]?.team !== s.myTeam;
  const leftIsA = mineLeft;
  const set = report.sets[idx];
  useEffect(() => { if (!set) onClose(); }, [set]);
  if (!set) return null;
  const score: [number, number] = [0, 0];
  for (const x of report.sets.slice(0, idx)) ((x.winner === "a") === leftIsA ? score[0]++ : score[1]++);
  const lp = s.players[leftIsA ? set.a : set.b], rp = s.players[leftIsA ? set.b : set.a];
  const logo = (p: CPlayer) => <TeamLogo team={s.teams[p.team]} className="w-[70px] h-[40px]" />;
  if (between) {
    const last = idx + 1 >= report.sets.length;
    return <SeriesBoard s={s} start={stateAt?.(0)} report={report} played={idx + 1} leftIsA={leftIsA} onClose={onExit ?? onClose}
      nextLabel={last ? "확인 ▷▷" : `${idx + 2}세트 ▷▷`} onNext={() => { setBetween(false); if (last) onClose(); else setIdx(idx + 1); }} />;
  }
  return (
    <Broadcast
      key={idx} s={s} stageName={INDIV_SHORT[report.league ?? "mysl"]} lp={lp} rp={rp} mapId={set.mapId} set={set} leftIsA={leftIsA} score={score}
      leftLogo={logo(lp)} rightLogo={logo(rp)} speed={speed} setSpeed={setSpeed} onClose={onExit ?? onClose}
      onDone={() => setBetween(true)}
    />
  );
}

/** 이 맵에서 a 종족이 b 종족을 상대로 이길 확률(%) — 맵 상성표 기준, 동족전은 50 */
export function mapRaceVs(mapId: number, a: CPlayer["race"], b: CPlayer["race"]) {
  if (a === b) return 50;
  const m = mapView(mapId);
  const pair: Record<string, number> = { "terran-zerg": m.tvz, "zerg-protoss": m.zvp, "protoss-terran": m.pvt };
  const v = pair[`${a}-${b}`];
  return v !== undefined ? v : 100 - pair[`${b}-${a}`];
}

/** 경기 전 라운드별 맵: 누르면 맵 정보와 두 선수의 그 맵 상성 (프로리그 세트 미리보기처럼) */
function RoundMaps({ r, lp, rp }: { r: MslReportView; lp: CPlayer; rp: CPlayer }) {
  const [view, setView] = useState<number | null>(null);
  const mapOf = (k: number) => r.sets[k]?.mapId ?? r.maps?.[k];
  const vm = view !== null ? mapOf(view) : undefined;
  return (
    <div className="mt-3 space-y-1">
      {Array.from({ length: r.bestOf }, (_, k) => {
        const mapId = mapOf(k);
        const rate = (p: CPlayer, o: CPlayer) => (mapId !== undefined ? mapRaceVs(mapId, p.race, o.race) : undefined);
        const tone = (v?: number) => (v === undefined || v === 50 ? "text-neutral-500" : v > 50 ? "text-[#bff5c6]" : "text-[#ffb8c8]");
        return (
          <div key={k} className="grid grid-cols-[1fr_96px_1fr] items-center gap-1.5 text-[12px]">
            <span className={cn("text-center", tone(rate(lp, rp)))}>{k + 1}세트{rate(lp, rp) !== undefined ? ` · ${rate(lp, rp)}%` : ""}</span>
            <GrayBox active={view === k} onClick={() => mapId !== undefined && setView(view === k ? null : k)}>{mapId !== undefined ? mapView(mapId).name : "미정"}</GrayBox>
            <span className={cn("text-center", tone(rate(rp, lp)))}>{rate(rp, lp) !== undefined ? `${rate(rp, lp)}%` : "?"}</span>
          </div>
        );
      })}
      {view !== null && vm !== undefined ? (
        <div className="border border-neutral-500 p-2 mt-1.5">
          <div className="flex items-center text-[12px] mb-1"><span className="text-[#ffe45c]">{view + 1}세트 맵 정보</span><button onClick={() => setView(null)} className="ml-auto border border-neutral-600 px-1.5 text-[11px]">닫기 ✕</button></div>
          <div className="flex justify-center"><MapInfo mapId={vm} size={60} /></div>
          <div className="text-center text-[11px] text-neutral-300 mt-1">{lp.name} {mapRaceVs(vm, lp.race, rp.race)}% : {mapRaceVs(vm, rp.race, lp.race)}% {rp.name} (맵 종족 상성)</div>
        </div>
      ) : <div className="text-center text-[10.5px] text-neutral-500">맵을 누르면 맵 정보가 보입니다 · % = 그 맵에서 종족 상성</div>}
    </div>
  );
}

/** 다전제 라운드별 결과 (정해진 판수만큼 모두 표시, 치르지 않은 판은 "-") */
export function SeriesBoard({ s, start, report, played, leftIsA, onNext, onClose, nextLabel }: {
  s: CareerState; report: MslReportView; played: number; leftIsA: boolean; onNext: () => void; onClose: () => void; nextLabel: string;
  /** 다전제 시작 때 선수 상태 (있으면 컨디션·능력치 변화 표시) */
  start?: CareerState;
}) {
  const lp = s.players[leftIsA ? report.a : report.b], rp = s.players[leftIsA ? report.b : report.a];
  let sl = 0, sr = 0;
  for (const x of report.sets.slice(0, played)) ((x.winner === "a") === leftIsA ? sl++ : sr++);
  const over = played >= report.sets.length;
  const need = Math.ceil(report.bestOf / 2);
  /** 누른 라운드 (맵 정보 · 그 맵에서 두 선수 상성) */
  const [view, setView] = useState<number | null>(null);
  const viewMap = view !== null ? report.sets[view]?.mapId ?? report.maps?.[view] : undefined;
  const viewSet = view !== null && view < played ? report.sets[view] : undefined;
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={onNext} nextLabel={nextLabel}>
      <div className="px-3 pt-3 pb-4">
        <div className="text-center">
          <div className="text-[15px] tracking-[0.2em]">{INDIV_SHORT[report.league ?? "mysl"]} {report.stage}</div>
          <div className="text-[13px] text-[#ffe45c]">&lt; {report.label} &gt;</div>
          <div className="text-[11px] text-neutral-400">{report.bestOf === 1 ? "단판 승부" : `${report.bestOf}전 ${need}선승`}</div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3">
          {[lp, rp].map((p, k) => (
            <div key={p.id} className={cn("flex flex-col items-center", k === 1 && "order-3")}>
              <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={64} />
              <div className={cn("text-[12.5px] mt-0.5", p.team === s.myTeam && "text-[#8fd0ff]")}>{nameRace(p)}</div>
              <div className="text-[10px] text-neutral-500">{s.teams[p.team]?.name ?? "무소속"}</div>
              <StateLine p={p} before={start?.players[p.id]} />
              <LegacyRadar stats={condStats(p, s)} base={p.stats} gear={gearStats(p)} level={p.level} size={104} />
              <div className="text-[11px] -mt-1">{slumpOn(s, p) ? <span className="font-bold text-[#8fb8ff]">😵난조</span> : null}{burstOf(s, p) ? <span className="font-bold" style={{ color: burstLabel(burstOf(s, p)!).color }}> {burstLabel(burstOf(s, p)!).icon}{Math.round(burstOf(s, p)! * 100)}%</span> : null}</div>
              {over && (report.winner === p.id) && <div className="text-[13px] font-black text-[#ffe45c]">WINNER</div>}
            </div>
          ))}
          <div className="order-2 text-[26px] text-neutral-100 px-2">{sl} : {sr}</div>
        </div>
        <div className="mt-4 space-y-1.5">
          {Array.from({ length: report.bestOf }, (_, k) => {
            const x = k < played ? report.sets[k] : undefined;
            const mapId = report.sets[k]?.mapId ?? report.maps?.[k];
            const leftWon = x ? (x.winner === "a") === leftIsA : undefined;
            const skipped = !report.sets[k] && over;
            return (
              <div key={k} className={cn("grid grid-cols-[1fr_104px_1fr] items-center gap-1.5 text-[12px] px-1 py-[3px]", k === played - 1 && "border border-neutral-300")}>
                <span className={cn("text-center", leftWon === true ? "text-[#ffe45c]" : "text-neutral-500")}>{x ? (leftWon ? "WIN" : "LOSE") : skipped ? "-" : "?"}</span>
                <GrayBox active={view === k} onClick={() => mapId !== undefined && setView(view === k ? null : k)}>{k + 1}R · {mapId !== undefined ? mapView(mapId).name : "미정"}</GrayBox>
                <span className={cn("text-center", leftWon === false ? "text-[#ffe45c]" : "text-neutral-500")}>{x ? (leftWon ? "LOSE" : "WIN") : skipped ? "-" : "?"}</span>
              </div>
            );
          })}
        </div>
        {view !== null && viewMap !== undefined ? (
          <div className="mt-2 border border-neutral-500 p-2 space-y-1.5">
            <div className="flex items-center text-[12px]">
              <span className="text-[#ffe45c]">{view + 1}라운드 맵 정보</span>
              <button onClick={() => setView(null)} className="ml-auto border border-neutral-600 px-1.5 text-[11px]">닫기 ✕</button>
            </div>
            <div className="flex justify-center"><MapInfo mapId={viewMap} size={60} /></div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[12px]">
              {[lp, rp].map((p, k) => {
                const o = k === 0 ? rp : lp;
                const v = mapRaceVs(viewMap, p.race, o.race);
                return (
                  <div key={p.id} className={cn("flex items-center gap-1.5", k === 1 ? "order-3 flex-row-reverse text-right" : "")}>
                    <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={34} />
                    <div className="leading-tight">
                      <div className={cn(p.team === s.myTeam && "text-[#8fd0ff]")}>{nameRace(p)}</div>
                      <div className="text-[10.5px] text-neutral-400">실전 {totalOf(condStats(p, s)).toLocaleString()} · 컨디션 {matchCond(p, s)}%</div>
                      <div className={cn("text-[11px]", v > 50 ? "text-[#bff5c6]" : v < 50 ? "text-[#ffb8c8]" : "text-neutral-300")}>맵 상성 {v}%</div>
                    </div>
                  </div>
                );
              })}
              <div className="order-2 text-center text-[11px] text-neutral-400">{viewSet ? <span className="text-[#ffe45c]">{s.players[viewSet.winner === "a" ? viewSet.a : viewSet.b]?.name} 승</span> : view < played || over ? "-" : "예정"}</div>
            </div>
          </div>
        ) : <div className="text-center text-[10.5px] text-neutral-500 mt-2">라운드(맵)를 누르면 맵 정보와 두 선수의 맵 상성이 보입니다</div>}
        <div className="text-center text-[11px] text-neutral-500 mt-3">{over ? `${s.players[report.winner]?.name} 승리${report.bestOf > report.sets.length ? ` (${report.sets.length}세트에서 결정, 남은 라운드는 치르지 않음)` : ""}` : `${sl > sr ? lp.name : sr > sl ? rp.name : "동점"}${sl !== sr ? " 앞섬" : ""} · Next 로 다음 세트`}</div>
      </div>
    </LegacyFrame>
  );
}

/** 컨디션·능력치 합 (before 가 있으면 변화량) */
function StateLine({ p, before }: { p: CPlayer; before?: CPlayer }) {
  const total = totalOf(p.stats), dc = before ? gearCond(p) - gearCond(before) : 0, dt = before ? total - totalOf(before.stats) : 0;
  const d = (v: number) => (v ? <span className={v > 0 ? "text-[#8fe07a]" : "text-[#ff8a8a]"}> ({v > 0 ? "+" : ""}{v})</span> : null);
  return (
    <div className="text-[10.5px] text-neutral-300 leading-tight text-center">
      컨디션 {gearCond(p)}%{d(dc)}<br />능력치 {total.toLocaleString()}{d(dt)}
    </div>
  );
}

/** 원작 듀얼 토너먼트 화면: 조 4명 → 1경기·2경기 → 승자전·패자전 → 최종전을 차례로 (우리 선수 경기는 중계) */
export function DualGroupScreen({ s: latest, stage, group, reports, onDone, onClose, stateAt }: {
  s: CareerState; stage: string; group: MslGroup; reports: MslReportView[]; onDone: () => void; onClose: () => void;
  /** 그 경기 j세트 직전 선수 상태 (r 이 없으면 이 조 경기를 다 본 뒤) */
  stateAt?: (r: MslReportView | null, j: number) => CareerState;
}) {
  const [cursor, setCursor] = useState(0);
  const [watching, setWatching] = useState<MslReportView | null>(null);
  if (watching) return <SeriesViewer s={latest} report={watching} stateAt={stateAt ? j => stateAt(watching, j) : undefined} onClose={() => { setWatching(null); setCursor(c => c + 1); }} onExit={onClose} />;
  const games = group.games;
  // 지금 보는 위치의 선수 상태: 아직 안 본 우리 경기 직전 (다 봤으면 이 조 경기 뒤)
  const upcoming = games.slice(cursor).map(g => reports.find(r => r.label === g.label)).find(Boolean) ?? null;
  const s = stateAt ? stateAt(upcoming, 0) : latest;
  const cur = games[cursor];
  const curReport = cur ? reports.find(r => r.label === cur.label) : undefined;
  const finished = cursor >= games.length;
  const next = () => {
    if (finished) { onDone(); return; }
    if (curReport) setWatching(curReport); else setCursor(cursor + 1);
  };
  const lost = (id: number) => games.slice(0, cursor).filter(g => g.winner !== id && (g.a === id || g.b === id)).length;
  const status = (id: number) => {
    if (group.qualified[0] === id && cursor >= 3) return { text: "1위 진출", c: "text-[#ffe45c]" };
    if (finished && group.qualified.includes(id)) return { text: "2위 진출", c: "text-[#ffe45c]" };
    if (lost(id) >= 2) return { text: "탈락", c: "text-neutral-500" };
    return { text: "", c: "" };
  };
  const league = reports[0]?.league ?? "mysl";
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={next} nextLabel={finished ? "확인 ▷▷" : curReport ? "관전 ▷▷" : "다음 경기 ▷▷"}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1">
          <LeagueLogo league={league} stage={stage} />
          <div className="text-[15px] tracking-[0.2em]">{INDIV_SHORT[league]} {stage}</div>
          <div className="text-[14px] text-[#ffe45c]">&lt; {group.name}조 &gt;</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {group.players.map(id => {
            const p = s.players[id];
            const st = status(id);
            const playing = cur && (cur.a === id || cur.b === id);
            return (
              <div key={id} className={cn("flex items-center gap-2 border p-1.5", playing ? "border-[#ff6b6b]" : "border-neutral-600", st.text === "탈락" && "opacity-50")}>
                <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={46} />
                <div className="min-w-0 text-[12px] leading-tight">
                  <div className={cn("truncate", p.team === s.myTeam ? "text-[#8fd0ff]" : "text-white")}>{nameRace(p)}</div>
                  <div className="text-[10px] text-neutral-400 truncate">{s.teams[p.team]?.name ?? "무소속"}</div>
                  <div className="text-[10px] text-neutral-400">{`Lv.${p.level} · 컨디션 ${gearCond(p)}%`}</div>
                  <div className="text-[10px] text-neutral-400">{`능력치 ${totalOf(p.stats).toLocaleString()}`}</div>
                  {st.text && <div className={cn("text-[11px]", st.c)}>{st.text}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-1">
          {games.map((g, k) => {
            const show = k <= cursor || k < 2, done = k < cursor;
            const name = (id: number) => <span className={cn("truncate", s.players[id]?.team === s.myTeam && "text-[#8fd0ff]", done && g.winner !== id && "opacity-40")}>{nameRace(s.players[id])}</span>;
            return (
              <div key={k} className={cn("grid grid-cols-[62px_1fr_40px_1fr] items-center gap-1 text-[12px] px-1 py-[3px]", k === cursor && "border border-neutral-300")}>
                <span className="text-[10.5px] text-neutral-400">{g.label.replace(/^[A-H]조 /, "")}</span>
                <div className="text-right truncate">{show ? name(g.a) : "?"}</div>
                <span className="text-center text-[#ffe45c]">{done ? `${g.sa}:${g.sb}` : "vs"}</span>
                <div className="truncate">{show ? name(g.b) : "?"}</div>
              </div>
            );
          })}
        </div>
        <div className="text-center text-[11px] text-neutral-500 mt-3">
          {finished ? `${group.qualified.map(id => s.players[id]?.name).join(", ")} 다음 단계 진출` : curReport ? "우리 선수 경기 — Next 로 관전" : "Next 로 다음 경기 결과"} · 1·2경기 → 승자전(1위) · 패자전 → 최종전(2위)
        </div>
      </div>
    </LegacyFrame>
  );
}

export type MslStep = { kind: "series"; r: MslReportView } | { kind: "group"; stage: string; name: string; reports: MslReportView[]; league: IndivLeague } | { kind: "plan"; planIdx: number };

/** 이번 시즌 듀얼·32강 조 (항상 최신 세이브에서 찾음) */
export const groupOf = (s: CareerState, stage: string, name: string, league: IndivLeague = "mysl") => {
  const raw = league === "mysl" ? s.msl : s.msl2;
  const m = raw?.season === s.season ? raw : undefined;
  return (stage === "듀얼 토너먼트" ? m?.duals : stage === "32강" ? m?.groups : undefined)?.find(g => g.name === name);
};

/** 이번 주 개인리그: 우리 선수 경기를 차례로 (듀얼·32강은 조 화면, 16강부터는 경기 전 화면 → 중계) → 이번 주 결과 */
/**
 * onDone: 다 봄, onClose: ✕ 로 나감 (나중에 이어 보기, 없으면 onDone)
 * start·onProgress: 이어 볼 위치
 */
export function MslFlow({ s, reports, plans = [], flat, onDone, onClose, start = 0, onProgress, all }: {
  s: CareerState; reports: MslReportView[]; plans?: number[]; flat?: boolean; onDone: () => void; onClose?: () => void; start?: number; onProgress?: (i: number) => void;
  /** 이번 주 관전 경기 전체 (포스트시즌 → 개인리그 순) — 선수 상태를 그 경기 직전으로 보여줄 때 씀 */
  all?: SnapReport[];
}) {
  const exit = onClose ?? onDone;
  const list = all ?? reports;
  /** r 의 j세트 직전 (r 이 없으면 이번 주 개인리그 끝) */
  const at = (r: MslReportView | null, j = 0) => {
    const k = r ? list.indexOf(r) : -1;
    return k < 0 ? (r ? s : viewStateAt(s, list, list.length)) : viewStateAt(s, list, k, j);
  };
  // 조 화면: r 이 없으면 그 조 마지막 경기 뒤
  const groupAt = (reps: MslReportView[]) => (r: MslReportView | null, j: number) => (r ? at(r, j) : viewStateAt(s, list, Math.max(...reps.map(x => list.indexOf(x))) + 1));
  const steps = useMemo(() => {
    const out: MslStep[] = [];
    for (const r of reports) {
      const gname = r.label.match(/^([A-H])조/)?.[1];
      if (flat || !gname || (r.stage !== "듀얼 토너먼트" && r.stage !== "32강")) { out.push({ kind: "series", r }); continue; }
      const lg = r.league ?? "mysl";
      const same = out.find(x => x.kind === "group" && x.stage === r.stage && x.name === gname && x.league === lg) as Extract<MslStep, { kind: "group" }> | undefined;
      if (same) same.reports.push(r); else out.push({ kind: "group", stage: r.stage, name: gname, reports: [r], league: lg });
    }
    for (const k of plans) out.push({ kind: "plan", planIdx: k });
    return out;
  }, [reports, plans]);
  const [i, setIRaw] = useState(start);
  const setI = (n: number) => { setIRaw(n); onProgress?.(n); };
  const [watching, setWatching] = useState(false);
  const step = steps[i];
  useEffect(() => { if (!step) onDone(); }, [step]);
  if (!step) return null;
  if (step.kind === "plan") return <MslStageResult s={s} planIdx={step.planIdx} onNext={() => setI(i + 1)} onClose={exit} />;
  const group = step.kind === "group" ? groupOf(s, step.stage, step.name, step.league) : undefined;
  if (step.kind === "group" && group?.games.length) return <DualGroupScreen key={i} s={s} stage={step.stage} group={group} reports={step.reports} stateAt={groupAt(step.reports)} onDone={() => setI(i + 1)} onClose={exit} />;
  // 조 기록이 없으면 (예전 세이브) 우리 경기만 하나씩
  if (step.kind === "group") return <MslFlow key={i} s={s} reports={step.reports} all={list} flat onDone={() => setI(i + 1)} onClose={exit} />;
  const r = step.r;
  const next = () => { setWatching(false); setI(i + 1); };
  if (watching) return <SeriesViewer s={s} report={r} stateAt={j => at(r, j)} onClose={next} onExit={exit} />;
  const sv = at(r, 0);
  const mineLeft = sv.players[r.a]?.team === sv.myTeam || sv.players[r.b]?.team !== sv.myTeam;
  const lp = sv.players[mineLeft ? r.a : r.b], rp = sv.players[mineLeft ? r.b : r.a];
  const lg = r.league ?? "mysl";
  return (
    <LegacyFrame season={s.season} onBack={exit} onNext={() => setWatching(true)}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1">
          <LeagueLogo league={lg} stage={r.stage} className="max-h-14 object-contain" />
          <div className="text-[16px] tracking-[0.3em]">{INDIV_SHORT[lg]} {r.stage}</div>
          <div className="text-[13px] text-[#ffe45c]">&lt; {r.label} &gt;</div>
          <div className="text-[11px] text-neutral-400">{r.bestOf === 1 ? "단판 승부" : `${r.bestOf}전 ${Math.ceil(r.bestOf / 2)}선승`} · 이번 주 개인리그 {i + 1}/{steps.length}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
            <div key={p.id} className="flex flex-col items-center">
              <PlayerCard p={p} opp={o} />
              <div className="text-[10px] text-neutral-500">{sv.teams[p.team]?.name}</div>
              <LegacyRadar stats={condStats(p, sv)} base={p.stats} gear={gearStats(p)} level={p.level} size={112} />
              <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{matchCond(p, sv)} %{slumpOn(sv, p) ? <span className="font-bold text-[#8fb8ff]"> 😵난조</span> : null}{burstOf(sv, p) ? <span className="font-bold" style={{ color: burstLabel(burstOf(sv, p)!).color }}> {burstLabel(burstOf(sv, p)!).icon}{Math.round(burstOf(sv, p)! * 100)}%</span> : null}</div>
            </div>
          ))}
        </div>
        <RoundMaps r={r} lp={lp} rp={rp} />
        <div className="text-center text-[11px] text-neutral-500 mt-3">Next 로 관전 · ✕ 로 이번 주 개인리그 건너뛰기</div>
      </div>
    </LegacyFrame>
  );
}

export const MSL_ICON: Record<string, string> = { "PC방 예선전": "PC방", 듀얼토너먼트: "DT" };
/** 일정표에 들어갈 짧은 이름 */
export function mslShort(s: CareerState, n: number) {
  const { plan: p, PLAN, league } = planCtx(s, n);
  const nth = PLAN.filter(x => x.stage === p.stage).length > 1 ? ` ${p.part + 1}차` : "";
  return p.stage === "pc" ? (league === "mysl" ? "PC방 예선" : "예선") : p.stage === "dual" ? `듀얼${nth}` : p.stage === "nom" ? "조지명식" : `${p.label}${nth}`;
}

export function SeriesRow({ s, x }: { s: CareerState; x: MslSeries }) {
  const name = (id: number) => {
    const p = s.players[id];
    return <span className={cn("truncate", x.winner === id ? "text-white" : "text-neutral-500", p?.team === s.myTeam && "text-[#8fd0ff]")}>{nameRace(p)}</span>;
  };
  return (
    <div className="grid grid-cols-[70px_1fr_34px_1fr] items-center gap-1 text-[11.5px] py-[2px]">
      <span className="text-[10px] text-neutral-400 truncate">{x.label.replace(/^[A-H]조 /, "")}</span>
      <div className="text-right truncate">{name(x.a)}</div>
      <span className="text-center text-[#ffe45c]">{x.sa}:{x.sb}</span>
      <div className="truncate">{name(x.b)}</div>
    </div>
  );
}

export function GroupCard({ s, g }: { s: CareerState; g: MslGroup }) {
  return (
    <div className="border border-neutral-600 p-1.5">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] mb-1">
        <span className="text-[#ffe45c]">{g.name}조</span>
        {g.players.map(id => {
          const p = s.players[id];
          const q = g.qualified.includes(id);
          return <span key={id} className={cn(p?.team === s.myTeam ? "text-[#8fd0ff]" : "text-neutral-200", g.games.length && !q && "opacity-50")}>{p?.name}{q ? " ✓" : ""}</span>;
        })}
      </div>
      {g.games.map((x, k) => <SeriesRow key={k} s={s} x={x} />)}
    </div>
  );
}

/** PC방 예선: 우리 선수마다 몇 승, 몇 회전에서 누구에게 졌는지 */
export function pcSummary(s: CareerState, games: MslSeries[], qualifiers: number[]) {
  const out = new Map<number, { id: number; wins: number; round: number; lostTo?: number; passed: boolean }>();
  for (const g of games) {
    const round = Number(g.label.match(/\d+/)?.[0] ?? 1);
    for (const id of [g.a, g.b]) {
      if (s.players[id]?.team !== s.myTeam) continue;
      const x = out.get(id) ?? { id, wins: 0, round, passed: qualifiers.includes(id) };
      x.round = round;
      if (g.winner === id) x.wins++; else x.lostTo = id === g.a ? g.b : g.a;
      out.set(id, x);
    }
  }
  return [...out.values()].sort((a, b) => Number(b.passed) - Number(a.passed) || b.wins - a.wins);
}

/** 개인리그 일정 하나의 결과 (PC방 예선·듀얼·조지명식·32강·16강·8강·4강·결승) */
export function MslStageResult({ s, planIdx, onNext, onClose }: { s: CareerState; planIdx: number; onNext?: () => void; onClose: () => void }) {
  const { plan, m, idx, league, name } = planCtx(s, planIdx);
  const done = m ? (m.planIdx ?? 0) > idx : false;
  let body: React.ReactNode = <MslPreview s={s} planIdx={planIdx} />;
  if (m && done) {
    if (plan.stage === "pc") {
      body = (
        <div className="space-y-2">
          <div className="text-center text-[12px] text-neutral-300">참가 {m.pcEntrants}명 · 단판 토너먼트 · {m.pcQualifiers.length}명 듀얼 토너먼트 진출</div>
          <div className="border border-neutral-600 p-1.5">
            <div className="text-[11px] text-neutral-400 mb-1">예선 통과</div>
            <div className="grid grid-cols-2 gap-x-2 text-[12px]">
              {m.pcQualifiers.map(id => <span key={id} className={cn("truncate", s.players[id]?.team === s.myTeam ? "text-[#8fd0ff]" : "text-neutral-200")}>{nameRace(s.players[id])} <span className="text-[10px] text-neutral-500">{s.teams[s.players[id]?.team]?.short ?? "무소속"}</span></span>)}
            </div>
          </div>
          <div className="border border-neutral-600 p-1.5">
            <div className="text-[11px] text-neutral-400 mb-1">우리 선수 성적</div>
            {m.pcGames?.length ? pcSummary(s, m.pcGames, m.pcQualifiers).map(x => (
              <div key={x.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[12px] py-[2px]">
                <span className="truncate text-[#8fd0ff]">{nameRace(s.players[x.id])}</span>
                <span className="text-[10.5px] text-neutral-400">{x.wins}승{x.lostTo !== undefined ? ` · ${s.players[x.lostTo]?.name}에게 패` : ""}</span>
                <span className={cn("text-[11px]", x.passed ? "text-[#ffe45c]" : "text-neutral-500")}>{x.passed ? "예선 통과" : `${x.round}회전 탈락`}</span>
              </div>
            )) : <div className="text-[11px] text-neutral-500">{m.pcGames ? "우리 선수는 시드·듀얼 직행이라 예선에 나가지 않았습니다" : "이 시즌 예선 기록은 남아 있지 않습니다"}</div>}
          </div>
        </div>
      );
    } else if (plan.stage === "dual") {
      body = <div className="space-y-1.5">{m.duals.slice(plan.part * 3, plan.part * 3 + 3).map(g => <GroupCard key={g.name} s={s} g={g} />)}</div>;
    } else if (plan.stage === "nom") {
      body = <div className="space-y-1.5">{m.groups.map(g => <GroupCard key={g.name} s={s} g={{ ...g, games: [], qualified: [] }} />)}</div>;
    } else if (plan.stage === "group") {
      body = <div className="space-y-1.5">{m.groups.slice(plan.part * 4, plan.part * 4 + 4).map(g => <GroupCard key={g.name} s={s} g={g} />)}</div>;
    } else {
      const [from, to] = plan.stage === "ro16" ? [plan.part * 4, plan.part * 4 + 4] : plan.stage === "ro8" ? [plan.part * 2, plan.part * 2 + 2] : plan.stage === "ro4" ? [0, 2] : [0, 1];
      const round = m.bracket.find(b => b.round === plan.stage);
      body = <div className="border border-neutral-600 p-1.5">{round?.series.slice(from, to).map((x, k) => <SeriesRow key={k} s={s} x={x} />)}</div>;
    }
  }
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={onNext ?? onClose}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1 mb-2.5">
          <LeagueLogo league={league} stage={plan.stage} />
          <div className="text-[15px] tracking-[0.2em]">{name} {mslShort(s, planIdx)} {done ? "결과" : "예정"}</div>
          <div className="text-[10px] text-neutral-500">{plan.week}주차 · 파란 이름 = 우리 선수{done ? " · ✓ = 다음 단계 진출" : " · 아직 치르지 않은 일정"}</div>
        </div>
        {body}
      </div>
    </LegacyFrame>
  );
}

const ROUND_RULE: Record<string, string> = {
  pc: "시드 16명·듀얼 직행 24명을 뺀 모든 선수가 단판 토너먼트로 8자리를 다툽니다",
  dual: "4명씩 8개 조, 듀얼 방식(1·2경기 → 승자전·패자전 → 최종전)으로 조 2명이 32강에 오릅니다 · 한 주에 3개 조씩",
  nom: "시드 상위 8명이 조장이 되어 3라운드 동안 차례로 상대를 지명합니다 (A→H, 다음 라운드는 H→A)",
  group: "32강 8개 조 듀얼 방식, 조 1·2위가 16강 진출 · 한 주에 4개 조씩",
  ro16: "3전 2선승 · 대진 A1-B2, B1-A2, C1-D2, D1-C2 … · 한 주에 4경기씩",
  ro8: "3전 2선승 · 16강 1·2경기 승자끼리, 3·4경기 승자끼리 … · 한 주에 2경기씩",
  ro4: "5전 3선승 · 8강 1·2경기 승자, 3·4경기 승자",
  final: "5전 3선승 · 4강 승자끼리",
};
/** 토너먼트 라운드의 앞 라운드 */
const KO_BEFORE: Record<string, { from: "ro16" | "ro8" | "ro4" }> = { ro8: { from: "ro16" }, ro4: { from: "ro8" }, final: { from: "ro4" } };

function NameList({ s, ids, cols = 2 }: { s: CareerState; ids: number[]; cols?: number }) {
  return (
    <div className={cn("grid gap-x-2 text-[12px]", cols === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {ids.map(id => <span key={id} className={cn("truncate", s.players[id]?.team === s.myTeam ? "text-[#8fd0ff]" : "text-neutral-200")}>{nameRace(s.players[id])} <span className="text-[10px] text-neutral-500">{s.teams[s.players[id]?.team]?.short ?? "무소속"}</span></span>)}
    </div>
  );
}

/** 아직 치르지 않은 개인리그 일정: 지금 알 수 있는 참가자·조 편성·대진 */
function MslPreview({ s, planIdx }: { s: CareerState; planIdx: number }) {
  const { plan, m, league } = planCtx(s, planIdx);
  const rule = <div className="text-center text-[11.5px] text-neutral-300 mb-2">{ROUND_RULE[plan.stage]}</div>;
  const box = (title: string, children: React.ReactNode) => (
    <div className="border border-neutral-600 p-1.5"><div className="text-[11px] text-neutral-400 mb-1">{title}</div>{children}</div>
  );
  const later = (text: string) => <div className="text-center text-[11.5px] text-neutral-500 my-4">{text}</div>;
  if (!m) return <>{rule}{later(`${plan.week}주차에 진행됩니다. 시즌이 시작되면 참가자가 정해집니다`)}</>;

  if (plan.stage === "pc") {
    // 듀얼 직행은 예선 시점 능력치로 정해지므로 지금 기준 예상
    const seeded = new Set(m.seeds);
    const active = activePlayers(s);
    const dualDirect = active.filter(p => !seeded.has(p.id)).sort((a, b) => totalOf(b.stats) - totalOf(a.stats)).slice(0, 24).map(p => p.id);
    const dd = new Set(dualDirect);
    const myPc = active.filter(p => p.team === s.myTeam && !seeded.has(p.id) && !dd.has(p.id)).map(p => p.id);
    return (
      <div className="space-y-2">
        {rule}
        {box("시드 (32강 직행)", <NameList s={s} ids={m.seeds} />)}
        {box("듀얼 토너먼트 직행 예상 (지금 능력치 기준 24명)", <NameList s={s} ids={dualDirect} />)}
        {box("예선에 나갈 우리 선수", myPc.length ? <NameList s={s} ids={myPc} /> : <div className="text-[11px] text-neutral-500">없음 (모두 시드·듀얼 직행 예상)</div>)}
      </div>
    );
  }
  if (plan.stage === "dual") {
    const groups = m.duals.slice(plan.part * 3, plan.part * 3 + 3);
    return <div className="space-y-1.5">{rule}{groups.length ? groups.map(g => <GroupCard key={g.name} s={s} g={{ ...g, games: [], qualified: [] }} />) : later("PC방 예선이 끝나면 조 편성이 나옵니다")}</div>;
  }
  if (plan.stage === "nom") {
    const heads = m.seeds.slice(0, 8);
    const pool = [...m.seeds.slice(8), ...m.duals.flatMap(g => g.qualified)];
    return (
      <div className="space-y-2">
        {rule}
        {box("조장 (시드 상위 8명, A~H조)", <NameList s={s} ids={heads} />)}
        {box(`지명 대상 (시드 8명 + 듀얼 통과 ${m.duals.flatMap(g => g.qualified).length}/16명)`, <NameList s={s} ids={pool} />)}
      </div>
    );
  }
  if (plan.stage === "group") {
    const groups = m.groups.slice(plan.part * 4, plan.part * 4 + 4);
    return <div className="space-y-1.5">{rule}{groups.length ? groups.map(g => <GroupCard key={g.name} s={s} g={{ ...g, games: [], qualified: [] }} />) : later(league === "mysl" ? "조 지명식이 끝나면 32강 조 편성이 나옵니다" : "듀얼 토너먼트가 끝나면 32강 조를 추첨합니다")}</div>;
  }
  // 토너먼트: 대진이 나왔으면 그 대진, 아니면 앞 라운드에서 올라올 자리
  const [from, to] = plan.stage === "ro16" ? [plan.part * 4, plan.part * 4 + 4] : plan.stage === "ro8" ? [plan.part * 2, plan.part * 2 + 2] : plan.stage === "ro4" ? [0, 2] : [0, 1];
  const round = m.bracket.find(b => b.round === plan.stage);
  if (round) {
    return <div className="space-y-1.5">{rule}<div className="border border-neutral-600 p-1.5">{round.series.slice(from, to).map((x, k) => <SeriesRow key={k} s={s} x={x} />)}</div></div>;
  }
  const slot = (label: string, id?: number) => (id !== undefined && id >= 0
    ? <span className={cn("truncate", s.players[id]?.team === s.myTeam ? "text-[#8fd0ff]" : "text-neutral-200")}>{nameRace(s.players[id])}</span>
    : <span className="text-neutral-500 truncate">{label}</span>);
  const rows: Array<[React.ReactNode, React.ReactNode]> = [];
  if (plan.stage === "ro16") {
    const G = "ABCDEFGH";
    for (let i = 0; i < 8; i += 2) {
      const [a, b] = [m.groups[i], m.groups[i + 1]];
      rows.push([slot(`${G[i]}조 1위`, a?.qualified[0]), slot(`${G[i + 1]}조 2위`, b?.qualified[1])]);
      rows.push([slot(`${G[i + 1]}조 1위`, b?.qualified[0]), slot(`${G[i]}조 2위`, a?.qualified[1])]);
    }
  } else {
    const prev = m.bracket.find(b => b.round === KO_BEFORE[plan.stage].from);
    const prevLabel = { ro8: "16강", ro4: "8강", final: "4강" }[plan.stage as "ro8" | "ro4" | "final"];
    const n = { ro8: 4, ro4: 2, final: 1 }[plan.stage as "ro8" | "ro4" | "final"];
    for (let i = 0; i < n; i++) {
      const [x, y] = [prev?.series[i * 2], prev?.series[i * 2 + 1]];
      rows.push([slot(`${prevLabel} ${i * 2 + 1}경기 승자`, x?.winner), slot(`${prevLabel} ${i * 2 + 2}경기 승자`, y?.winner)]);
    }
  }
  return (
    <div className="space-y-1.5">
      {rule}
      <div className="border border-neutral-600 p-1.5">
        {rows.slice(from, to).map(([a, b], k) => (
          <div key={k} className="grid grid-cols-[1fr_28px_1fr] items-center gap-1 text-[11.5px] py-[2px]">
            <div className="text-right truncate">{a}</div><span className="text-center text-neutral-500">vs</span><div className="truncate">{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 포스트시즌 주별 프로리그 일정 (12주부터) */
const POST_WEEKS = ["승강전 1경기", "승강전 2경기", "준플레이오프", "플레이오프", "결승"];

/** 원작 "정규 시즌 일정" 화면: 주마다 프로리그 2경기 + 개인리그 일정 */
export function ScheduleScreen({ s, onClose }: { s: CareerState; onClose: () => void }) {
  const [viewPlan, setViewPlan] = useState<number | null>(null);
  const me = s.teams[s.myTeam];
  // 정규시즌 11주 + 포스트시즌 (한 주에 한 경기: 승강전 1·2 → 준PO → PO → 결승, 2부가 없으면 승강전 없음)
  const post = divTeams(s, 2).length ? POST_WEEKS : POST_WEEKS.slice(2);
  const regular = regularWeeksOf(s);
  const weeks = Math.max(regular + post.length, ...s.matches.map(m => m.week));
  const mine = (w: number) => s.matches.filter(m => m.week === w && (m.a === s.myTeam || m.b === s.myTeam)).sort((a, b) => (a.leg ?? 1) - (b.leg ?? 1));
  const Cell = ({ m }: { m?: CMatch }) => {
    if (!m) return <div className="h-9 border-r border-neutral-600" />;
    const opp = s.teams[m.a === s.myTeam ? m.b : m.a];
    const won = m.done ? m.winner === s.myTeam : undefined;
    const my = m.a === s.myTeam ? m.scoreA : m.scoreB, their = m.a === s.myTeam ? m.scoreB : m.scoreA;
    return (
      <div className="h-9 flex items-center gap-1.5 px-1.5 border-r border-neutral-600 min-w-0">
        <span className="text-[10px] text-neutral-300">{m.stage === "regular" ? "VS" : STAGE_NAMES[m.stage].slice(0, 3)}</span>
        <TeamLogo team={opp} className="w-[34px] h-[20px] shrink-0" />
        <span className="text-[11px] truncate flex-1"><span className="min-[480px]:hidden">{opp.short}</span><span className="hidden min-[480px]:inline">{opp.name}</span></span>
        {m.done && <span className={cn("text-[10.5px] font-bold", won ? "text-[#bff5c6]" : "text-[#ff9a9a]")}>{my}:{their}</span>}
      </div>
    );
  };
  /** 포스트시즌 주: 그 주의 프로리그 경기 전부 (우리 팀이 없어도), 아직 대진 전이면 예정 */
  const PostCell = ({ w }: { w: number }) => {
    const list = s.matches.filter(m => m.week === w && m.stage !== "regular").sort((a, b) => (a.div ?? 1) - (b.div ?? 1) || a.id - b.id);
    if (!list.length) {
      const plan = post[w - regular - 1];
      return <div className="col-span-2 min-h-9 flex items-center px-1.5 text-[11px] text-neutral-400">{plan ? `${plan} (대진 미정)` : ""}</div>;
    }
    return (
      <div className="col-span-2 py-0.5 px-1.5 space-y-0.5 min-w-0">
        {list.map(m => {
          const ta = s.teams[m.a], tb = s.teams[m.b];
          const mine = m.a === s.myTeam || m.b === s.myTeam;
          const won = m.done && mine ? m.winner === s.myTeam : undefined;
          return (
            <div key={m.id} className={cn("flex items-center gap-1 h-[22px] min-w-0 text-[11px]", mine && "text-[#8fd0ff]")}>
              <span className="text-[10px] text-[#ffe45c] w-[34px] shrink-0 truncate">{STAGE_NAMES[m.stage].slice(0, 3)}</span>
              <TeamLogo team={ta} className="w-[30px] h-[18px] shrink-0" />
              <span className={cn("truncate", m.done && m.winner === m.a && "font-bold")}>{ta.short}</span>
              <span className={cn("text-[10.5px] shrink-0 px-0.5", won === undefined ? "text-neutral-300" : won ? "text-[#bff5c6] font-bold" : "text-[#ff9a9a] font-bold")}>{m.done ? `${m.scoreA}:${m.scoreB}` : "vs"}</span>
              <span className={cn("truncate", m.done && m.winner === m.b && "font-bold")}>{tb.short}</span>
              <TeamLogo team={tb} className="w-[30px] h-[18px] shrink-0" />
            </div>
          );
        })}
      </div>
    );
  };
  if (viewPlan !== null) return <MslStageResult s={s} planIdx={viewPlan} onClose={() => setViewPlan(null)} />;
  // 이번 시즌 개인리그 (마이스타리그 + 18주 시즌이면 MSL/OSL) 의 주별 일정
  const leagues = [0, ...(regularWeeksOf(s) !== OLD_REGULAR_WEEKS ? [SECOND_PLAN_BASE] : [])].map(base => ({ base, ...planCtx(s, base) }));
  const indivOf = (w: number) => leagues.flatMap(L => L.PLAN.map((p, k) => ({ p, n: L.base + k, L })).filter(x => x.p.week === w));
  const done = (n: number) => { const c = planCtx(s, n); return !!c.m && (c.m.planIdx ?? 0) > c.idx; };
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={onClose}>
      <div className="px-2 pt-3 pb-4">
        <div className="flex items-center justify-between px-1">
          <TeamLogo team={me} className="w-[64px] h-[38px]" />
          <div className="text-center"><div className="text-[15px] tracking-[0.3em]">▽ 정규 시즌 일정 ▽</div><div className="text-[13px] mt-1">{me.name}</div></div>
          <TeamLogo team={me} className="w-[64px] h-[38px]" />
        </div>
        <div className="grid grid-cols-[1fr_1fr_112px] text-[10px] text-neutral-400 mt-2 px-0.5">
          <span className="pl-1">프로리그 1경기</span><span className="pl-1">프로리그 2경기</span><span className="text-center text-[#8fe07a]">개인리그</span>
        </div>
        <div className="border border-neutral-500">
          {Array.from({ length: weeks }, (_, k) => k + 1).map(w => {
            const [m1, m2] = mine(w);
            const indiv = indivOf(w);
            const noMatch = w <= regular && !m1 && !s.matches.some(m => m.week === w && m.stage === "regular");
            return (
              <div key={w} className={cn("grid grid-cols-[1fr_1fr_112px] border-b border-neutral-700 last:border-b-0", w === s.week && s.phase !== "offseason" && "outline outline-2 outline-white -outline-offset-2")}>
                {w > regular ? <PostCell w={w} /> : noMatch ? (
                  <div className="col-span-2 min-h-9 flex items-center justify-center gap-2 text-[11px] text-neutral-500"><span className="text-[10px] text-neutral-600">{w}주</span><span className="tracking-[0.3em] font-bold">NO MATCH</span><span className="text-[10px]">(개인리그만)</span></div>
                ) : (<><Cell m={m1} /><Cell m={m2} /></>)}
                <div className="min-h-9 flex flex-col justify-center border-l border-[#8fe07a]/60 min-w-0">
                  {indiv.map(({ p, n, L }) => (
                    <button key={n} onClick={() => setViewPlan(n)} className="flex items-center gap-1 px-1 text-left min-w-0 py-[1px]">
                      <span className={cn("text-[9px] font-black shrink-0 w-[30px] truncate", L.league === "mysl" ? "text-[#c9a0ff]" : L.league === "msl" ? "text-[#7fd0ff]" : "text-[#ffb46b]")}>{L.league === "mysl" ? "MySL" : L.name}</span>
                      <span className="text-[10px] leading-tight truncate">{mslShort(s, n)}</span>
                      {done(n) && <span className="ml-auto text-[10px] text-[#8fe07a]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-neutral-500 text-center mt-2">주마다 프로리그 0~2경기 (NO MATCH 주는 개인리그만) · {regular + 1}주부터 포스트시즌 (한 주에 한 경기) · 흰 테두리 = 이번 주 · 개인리그를 누르면 결과·예정 대진{leagues.length > 1 ? ` · 이번 시즌 개인리그: 마이스타리그 + ${leagues[1].name}` : ""}</div>
      </div>
    </LegacyFrame>
  );
}

/** 마이스타리그 조 지명식: 우리 조장 차례에 직접 지명 (다른 조장은 자동) */
/** onClose: ✕ (나중에 계속), onDone: 지명이 끝나고 확인 (없으면 onClose) */
export function NominationScreen({ s, onClose, onDone }: { s: CareerState; onClose: () => void; onDone?: () => void }) {
  const patch = useCareerPatch();
  const [sel, setSel] = useState<number | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const nom = trpc.career.nominate.useMutation({
    onSuccess: r => { patch(r.diff); setSel(undefined); setErr(null); },
    onError: e => setErr(e.message),
  });
  // 들어오면 우리 차례까지 진행
  useEffect(() => { nom.mutate(undefined); }, []);
  const m = s.msl;
  const d = m?.draft;
  if (!m || !d) return (
    <LegacyFrame season={s.season} onBack={onClose}><div className="p-6 text-center text-neutral-400 text-[13px]">{err ?? "조 지명식을 준비하고 있습니다..."}</div></LegacyFrame>
  );
  const step = d.step, done = step >= 24;
  const round = Math.floor(step / 8), gi = round % 2 === 0 ? step % 8 : 7 - (step % 8);
  // 지명하는 선수: 그 조에 마지막으로 들어온 선수 (조장 → 조장이 지명한 선수 → …)
  const head = done ? undefined : d.groups[gi][d.groups[gi].length - 1];
  const myTurn = head !== undefined && s.players[head]?.team === s.myTeam;
  const pool = [...d.pool].sort((a, b) => totalOf(s.players[b].stats) - totalOf(s.players[a].stats));
  const G = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const next = () => {
    if (done) { (onDone ?? onClose)(); return; }
    if (myTurn && sel !== undefined) nom.mutate({ pick: sel });
    else if (!myTurn) nom.mutate(undefined);
  };
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={next} nextDisabled={nom.isPending || (myTurn && sel === undefined)}
      nextLabel={done ? "확인 ▷▷" : myTurn ? (sel !== undefined ? `${s.players[sel].name} 지명 ▷▷` : "지명할 선수를 고르세요") : "진행 ▷▷"}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1">
          <LegacyImg dir="로고" name="MySL" className="max-h-12 object-contain" fallback={<div className="text-[18px] italic font-black text-[#c9a0ff]">MySL</div>} />
          <div className="text-[15px] tracking-[0.2em]">마이스타리그 조 지명식</div>
          <div className="text-[12px] text-[#ffe45c]">{done ? "지명 완료 — 32강 조 편성" : `${round + 1}라운드 · ${G[gi]}조 ${s.players[head!].name} 선수 차례${myTurn ? " (우리 선수!)" : ""}`}</div>
        </div>
        {err && <div className="mt-2 border border-[#ff6b6b] text-[#ffb8c8] text-center text-[12px] py-1">{err}</div>}
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {d.groups.map((g, k) => (
            <div key={k} className={cn("border p-1.5 text-[11.5px]", !done && k === gi ? "border-[#ff6b6b]" : "border-neutral-600")}>
              <div className="text-[#ffe45c]">{G[k]}조</div>
              {g.map((id, j) => <div key={id} className={cn("truncate", s.players[id]?.team === s.myTeam && "text-[#8fd0ff]", j === 0 && "font-bold")}>{j === 0 ? "👑 " : ""}{nameRace(s.players[id])}</div>)}
            </div>
          ))}
        </div>
        {myTurn && (
          <>
            <div className="text-center text-[12px] text-neutral-300 mt-3">{s.players[head!].name} 선수가 {G[gi]}조에 넣을 상대를 지명하세요 (지명받은 선수가 다음 차례에 지명합니다)</div>
            <div className="border-2 border-neutral-300 p-0.5 mt-1.5 max-h-[300px] overflow-y-auto">
              {pool.map(id => {
                const p = s.players[id];
                return (
                  <button key={id} onClick={() => setSel(id)} className={cn("w-full flex items-center gap-2 px-1.5 py-1 text-left border-b border-neutral-800 last:border-b-0", sel === id ? "bg-[#3a3a5a]" : "")}>
                    <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={30} />
                    <span className={cn("flex-1 truncate text-[12.5px]", p.team === s.myTeam ? "text-[#8fd0ff]" : sel === id ? "text-[#ffe45c]" : "text-white")}>{nameRace(p)}</span>
                    <span className="text-[10.5px] text-neutral-400 truncate max-w-[30%]">{s.teams[p.team]?.short ?? "무소속"}</span>
                    <span className="text-[11px] text-neutral-200 w-12 text-right">{totalOf(p.stats).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {!myTurn && !done && <div className="text-center text-[11px] text-neutral-500 mt-3">Next 로 다음 우리 선수 차례까지 진행 (다른 선수는 자동 지명, 지명받은 선수가 다음 차례에 지명)</div>}
      </div>
    </LegacyFrame>
  );
}
