/**
 * 마이스타리그(개인리그): 다전제·듀얼 토너먼트·조 지명식·일정표
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { burstOf, MSL_PLAN, totalOf, type CareerState, type CMatch, type CPlayer, type MslGroup, type MslSeries } from "@shared/career/rules";
import { STAGE_NAMES, mapView } from "@shared/career/view";
import { gearCond, gearStats } from "@shared/career/items";
import { trpc } from "@/lib/trpc";
import { useCareerPatch } from "@/lib/career";
import { GrayBox, LegacyFrame, LegacyImg, LegacyRadar, PlayerPhoto, TeamLogo } from "../Legacy";
import { R, condStats, nameRace, useSpeed } from "./common";
import { Broadcast, PlayerCard } from "./broadcast";
import { type MslReportView } from "./proleague";

/** 스타리그 경기 다시 보기 (우리 선수 다전제) */
export function SeriesViewer({ s, report, onClose }: { s: CareerState; report: MslReportView; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  /** 세트가 끝나면 라운드별 승자 화면 → Next 로 다음 세트 */
  const [between, setBetween] = useState(false);
  const [speed, setSpeed] = useSpeed();
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
    return <SeriesBoard s={s} report={report} played={idx + 1} leftIsA={leftIsA} onClose={onClose}
      nextLabel={last ? "확인 ▷▷" : `${idx + 2}세트 ▷▷`} onNext={() => { setBetween(false); if (last) onClose(); else setIdx(idx + 1); }} />;
  }
  return (
    <Broadcast
      key={idx} s={s} stageName="마이스타리그" lp={lp} rp={rp} mapId={set.mapId} set={set} leftIsA={leftIsA} score={score}
      leftLogo={logo(lp)} rightLogo={logo(rp)} speed={speed} setSpeed={setSpeed} onClose={onClose}
      onDone={() => setBetween(true)}
    />
  );
}

/** 다전제 라운드별 결과 (정해진 판수만큼 모두 표시, 치르지 않은 판은 "-") */
export function SeriesBoard({ s, report, played, leftIsA, onNext, onClose, nextLabel }: {
  s: CareerState; report: MslReportView; played: number; leftIsA: boolean; onNext: () => void; onClose: () => void; nextLabel: string;
}) {
  const lp = s.players[leftIsA ? report.a : report.b], rp = s.players[leftIsA ? report.b : report.a];
  let sl = 0, sr = 0;
  for (const x of report.sets.slice(0, played)) ((x.winner === "a") === leftIsA ? sl++ : sr++);
  const over = played >= report.sets.length;
  const need = Math.ceil(report.bestOf / 2);
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={onNext} nextLabel={nextLabel}>
      <div className="px-3 pt-3 pb-4">
        <div className="text-center">
          <div className="text-[15px] tracking-[0.2em]">마이스타리그 {report.stage}</div>
          <div className="text-[13px] text-[#ffe45c]">&lt; {report.label} &gt;</div>
          <div className="text-[11px] text-neutral-400">{report.bestOf === 1 ? "단판 승부" : `${report.bestOf}전 ${need}선승`}</div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3">
          {[lp, rp].map((p, k) => (
            <div key={p.id} className={cn("flex flex-col items-center", k === 1 && "order-3")}>
              <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={64} />
              <div className={cn("text-[12.5px] mt-0.5", p.team === s.myTeam && "text-[#8fd0ff]")}>{nameRace(p)}</div>
              <div className="text-[10px] text-neutral-500">{s.teams[p.team]?.name ?? "무소속"}</div>
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
                <GrayBox>{k + 1}R · {mapId !== undefined ? mapView(mapId).name : "미정"}</GrayBox>
                <span className={cn("text-center", leftWon === false ? "text-[#ffe45c]" : "text-neutral-500")}>{x ? (leftWon ? "LOSE" : "WIN") : skipped ? "-" : "?"}</span>
              </div>
            );
          })}
        </div>
        <div className="text-center text-[11px] text-neutral-500 mt-3">{over ? `${s.players[report.winner]?.name} 승리${report.bestOf > report.sets.length ? ` (${report.sets.length}세트에서 결정, 남은 라운드는 치르지 않음)` : ""}` : `${sl > sr ? lp.name : sr > sl ? rp.name : "동점"}${sl !== sr ? " 앞섬" : ""} · Next 로 다음 세트`}</div>
      </div>
    </LegacyFrame>
  );
}

/** 원작 듀얼 토너먼트 화면: 조 4명 → 1경기·2경기 → 승자전·패자전 → 최종전을 차례로 (우리 선수 경기는 중계) */
export function DualGroupScreen({ s, stage, group, reports, onDone, onClose }: {
  s: CareerState; stage: string; group: MslGroup; reports: MslReportView[]; onDone: () => void; onClose: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [watching, setWatching] = useState<MslReportView | null>(null);
  if (watching) return <SeriesViewer s={s} report={watching} onClose={() => { setWatching(null); setCursor(c => c + 1); }} />;
  const games = group.games;
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
  const logo = stage === "듀얼 토너먼트" ? "DT" : "MySL";
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={next} nextLabel={finished ? "확인 ▷▷" : curReport ? "관전 ▷▷" : "다음 경기 ▷▷"}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1">
          <LegacyImg dir="로고" name={logo} className="max-h-12 object-contain" fallback={<div className="text-[18px] italic font-black text-[#c9a0ff]">MySL</div>} />
          <div className="text-[15px] tracking-[0.2em]">마이스타리그 {stage}</div>
          <div className="text-[14px] text-[#ffe45c]">&lt; {group.name}조 &gt;</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {group.players.map(id => {
            const p = s.players[id];
            const st = status(id);
            const playing = cur && (cur.a === id || cur.b === id);
            return (
              <div key={id} className={cn("flex items-center gap-2 border p-1.5", playing ? "border-[#ff6b6b]" : "border-neutral-600", st.text === "탈락" && "opacity-50")}>
                <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={46} />
                <div className="min-w-0 text-[12px] leading-tight">
                  <div className={cn("truncate", p.team === s.myTeam ? "text-[#8fd0ff]" : "text-white")}>{nameRace(p)}</div>
                  <div className="text-[10px] text-neutral-400 truncate">{s.teams[p.team]?.name ?? "무소속"}</div>
                  <div className="text-[10px] text-neutral-400">{`Lv.${p.level} · 컨디션 ${gearCond(p)}%`}</div>
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

export type MslStep = { kind: "series"; r: MslReportView } | { kind: "group"; stage: string; name: string; reports: MslReportView[] } | { kind: "plan"; planIdx: number };

/** 이번 시즌 듀얼·32강 조 (항상 최신 세이브에서 찾음) */
export const groupOf = (s: CareerState, stage: string, name: string) => {
  const m = s.msl?.season === s.season ? s.msl : undefined;
  return (stage === "듀얼 토너먼트" ? m?.duals : stage === "32강" ? m?.groups : undefined)?.find(g => g.name === name);
};

/** 이번 주 개인리그: 우리 선수 경기를 차례로 (듀얼·32강은 조 화면, 16강부터는 경기 전 화면 → 중계) → 이번 주 결과 */
export function MslFlow({ s, reports, plans = [], flat, onDone }: { s: CareerState; reports: MslReportView[]; plans?: number[]; flat?: boolean; onDone: () => void }) {
  const steps = useMemo(() => {
    const out: MslStep[] = [];
    for (const r of reports) {
      const gname = r.label.match(/^([A-H])조/)?.[1];
      if (flat || !gname || (r.stage !== "듀얼 토너먼트" && r.stage !== "32강")) { out.push({ kind: "series", r }); continue; }
      const same = out.find(x => x.kind === "group" && x.stage === r.stage && x.name === gname) as Extract<MslStep, { kind: "group" }> | undefined;
      if (same) same.reports.push(r); else out.push({ kind: "group", stage: r.stage, name: gname, reports: [r] });
    }
    for (const k of plans) out.push({ kind: "plan", planIdx: k });
    return out;
  }, [reports, plans]);
  const [i, setI] = useState(0);
  const [watching, setWatching] = useState(false);
  const step = steps[i];
  useEffect(() => { if (!step) onDone(); }, [step]);
  if (!step) return null;
  if (step.kind === "plan") return <MslStageResult s={s} planIdx={step.planIdx} onNext={() => setI(i + 1)} onClose={onDone} />;
  const group = step.kind === "group" ? groupOf(s, step.stage, step.name) : undefined;
  if (step.kind === "group" && group?.games.length) return <DualGroupScreen key={i} s={s} stage={step.stage} group={group} reports={step.reports} onDone={() => setI(i + 1)} onClose={onDone} />;
  // 조 기록이 없으면 (예전 세이브) 우리 경기만 하나씩
  if (step.kind === "group") return <MslFlow key={i} s={s} reports={step.reports} flat onDone={() => setI(i + 1)} />;
  const r = step.r;
  const next = () => { setWatching(false); setI(i + 1); };
  if (watching) return <SeriesViewer s={s} report={r} onClose={next} />;
  const mineLeft = s.players[r.a]?.team === s.myTeam || s.players[r.b]?.team !== s.myTeam;
  const lp = s.players[mineLeft ? r.a : r.b], rp = s.players[mineLeft ? r.b : r.a];
  const logo = r.stage === "듀얼 토너먼트" ? "DT" : r.stage === "PC방 예선" ? "PC방" : "MySL";
  return (
    <LegacyFrame season={s.season} onBack={onDone} onNext={() => setWatching(true)}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1">
          <LegacyImg dir="로고" name={logo} className="max-h-14 object-contain" fallback={<div className="text-[18px] italic font-black text-[#c9a0ff]">MySL</div>} />
          <div className="text-[16px] tracking-[0.3em]">마이스타리그 {r.stage}</div>
          <div className="text-[13px] text-[#ffe45c]">&lt; {r.label} &gt;</div>
          <div className="text-[11px] text-neutral-400">{r.bestOf === 1 ? "단판 승부" : `${r.bestOf}전 ${Math.ceil(r.bestOf / 2)}선승`} · 이번 주 개인리그 {i + 1}/{steps.length}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
            <div key={p.id} className="flex flex-col items-center">
              <PlayerCard p={p} opp={o} />
              <div className="text-[10px] text-neutral-500">{s.teams[p.team]?.name}</div>
              <LegacyRadar stats={condStats(p, s)} base={p.stats} gear={gearStats(p)} level={p.level} size={112} />
              <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p)} %{burstOf(s, p) ? <span className="text-[#ffb84d] font-bold"> 🔥{Math.round(burstOf(s, p)! * 100)}%</span> : null}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1">
          {Array.from({ length: r.bestOf }, (_, k) => {
            const mapId = r.sets[k]?.mapId ?? r.maps?.[k];
            return (
              <div key={k} className="grid grid-cols-[1fr_96px_1fr] items-center gap-1.5 text-[12px]">
                <span className="text-center">{k + 1}세트</span>
                <GrayBox>{mapId !== undefined ? mapView(mapId).name : "미정"}</GrayBox>
                <span className="text-center text-neutral-500">?</span>
              </div>
            );
          })}
        </div>
        <div className="text-center text-[11px] text-neutral-500 mt-3">Next 로 관전 · ✕ 로 이번 주 개인리그 건너뛰기</div>
      </div>
    </LegacyFrame>
  );
}

export const MSL_ICON: Record<string, string> = { "PC방 예선전": "PC방", 듀얼토너먼트: "DT" };
/** 일정표에 들어갈 짧은 이름 */
export function mslShort(k: number) {
  const p = MSL_PLAN[k];
  const nth = MSL_PLAN.filter(x => x.stage === p.stage).length > 1 ? ` ${p.part + 1}차` : "";
  return p.stage === "pc" ? "PC방 예선" : p.stage === "dual" ? `듀얼${nth}` : p.stage === "nom" ? "조지명식" : `${p.label}${nth}`;
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
  const plan = MSL_PLAN[planIdx];
  const m = s.msl?.season === s.season ? s.msl : undefined;
  const done = m ? (m.planIdx ?? 0) > planIdx : false;
  const logo = plan.stage === "pc" ? "PC방" : plan.stage === "dual" ? "DT" : "MySL";
  let body: React.ReactNode = <div className="text-center text-[12px] text-neutral-400 my-8">아직 진행되지 않은 일정입니다 ({plan.week}주차)</div>;
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
          <LegacyImg dir="로고" name={logo} className="max-h-12 object-contain" fallback={<div className="text-[18px] italic font-black text-[#c9a0ff]">MySL</div>} />
          <div className="text-[15px] tracking-[0.2em]">마이스타리그 {mslShort(planIdx)} 결과</div>
          <div className="text-[10px] text-neutral-500">{plan.week}주차 · 파란 이름 = 우리 선수 · ✓ = 다음 단계 진출</div>
        </div>
        {body}
      </div>
    </LegacyFrame>
  );
}

/** 원작 "정규 시즌 일정" 화면: 주마다 프로리그 2경기 + 개인리그 일정 */
export function ScheduleScreen({ s, onClose }: { s: CareerState; onClose: () => void }) {
  const [viewPlan, setViewPlan] = useState<number | null>(null);
  const me = s.teams[s.myTeam];
  const weeks = Math.max(11, ...s.matches.map(m => m.week));
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
  if (viewPlan !== null) return <MslStageResult s={s} planIdx={viewPlan} onClose={() => setViewPlan(null)} />;
  const mslDone = (k: number) => s.msl?.season === s.season && (s.msl.planIdx ?? 0) > k;
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={onClose}>
      <div className="px-2 pt-3 pb-4">
        <div className="flex items-center justify-between px-1">
          <TeamLogo team={me} className="w-[64px] h-[38px]" />
          <div className="text-center"><div className="text-[15px] tracking-[0.3em]">▽ 정규 시즌 일정 ▽</div><div className="text-[13px] mt-1">{me.name}</div></div>
          <TeamLogo team={me} className="w-[64px] h-[38px]" />
        </div>
        <div className="grid grid-cols-[1fr_1fr_104px] text-[10px] text-neutral-400 mt-2 px-0.5">
          <span className="pl-1">프로리그 1경기</span><span className="pl-1">프로리그 2경기</span><span className="text-center text-[#8fe07a]">개인리그</span>
        </div>
        <div className="border border-neutral-500">
          {Array.from({ length: weeks }, (_, k) => k + 1).map(w => {
            const [m1, m2] = mine(w);
            const k = MSL_PLAN.findIndex(p => p.week === w);
            const plan = MSL_PLAN[k];
            const icon = plan ? MSL_ICON[plan.label] ?? "MySL" : undefined;
            return (
              <div key={w} className={cn("grid grid-cols-[1fr_1fr_104px] border-b border-neutral-700 last:border-b-0", w === s.week && s.phase !== "offseason" && "outline outline-2 outline-white -outline-offset-2")}>
                <Cell m={m1} />
                <Cell m={m2} />
                <button disabled={!plan} onClick={() => plan && setViewPlan(k)} className="h-9 flex items-center gap-1 px-1 border-l border-[#8fe07a]/60 min-w-0 text-left">
                  {icon && <LegacyImg dir="로고" name={icon} className="h-6 w-6 shrink-0 object-contain" fallback={null} />}
                  <span className="text-[10.5px] leading-tight whitespace-nowrap">{plan ? mslShort(k) : ""}</span>
                  {plan && mslDone(k) && <span className="ml-auto text-[10px] text-[#8fe07a]">✓</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-neutral-500 text-center mt-2">주마다 프로리그 2경기와 개인리그 일정이 차례로 진행됩니다 · 흰 테두리 = 이번 주 · 개인리그를 누르면 결과</div>
      </div>
    </LegacyFrame>
  );
}

/** 마이스타리그 조 지명식: 우리 조장 차례에 직접 지명 (다른 조장은 자동) */
export function NominationScreen({ s, onClose }: { s: CareerState; onClose: () => void }) {
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
  const head = done ? undefined : d.groups[gi][0];
  const myTurn = head !== undefined && s.players[head]?.team === s.myTeam;
  const pool = [...d.pool].sort((a, b) => totalOf(s.players[b].stats) - totalOf(s.players[a].stats));
  const G = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const next = () => {
    if (done) { onClose(); return; }
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
            <div className="text-center text-[12px] text-neutral-300 mt-3">{s.players[head!].name} 선수의 조에 넣을 상대를 지명하세요 (약한 선수나 상대하기 좋은 종족을 고르는 게 유리)</div>
            <div className="border-2 border-neutral-300 p-0.5 mt-1.5 max-h-[300px] overflow-y-auto">
              {pool.map(id => {
                const p = s.players[id];
                return (
                  <button key={id} onClick={() => setSel(id)} className={cn("w-full flex items-center gap-2 px-1.5 py-1 text-left border-b border-neutral-800 last:border-b-0", sel === id ? "bg-[#3a3a5a]" : "")}>
                    <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={30} />
                    <span className={cn("flex-1 truncate text-[12.5px]", p.team === s.myTeam ? "text-[#8fd0ff]" : sel === id ? "text-[#ffe45c]" : "text-white")}>{nameRace(p)}</span>
                    <span className="text-[10.5px] text-neutral-400 truncate max-w-[30%]">{s.teams[p.team]?.short ?? "무소속"}</span>
                    <span className="text-[11px] text-neutral-200 w-12 text-right">{totalOf(p.stats).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {!myTurn && !done && <div className="text-center text-[11px] text-neutral-500 mt-3">Next 로 다음 우리 선수 차례까지 진행 (다른 조장은 자동 지명)</div>}
      </div>
    </LegacyFrame>
  );
}
