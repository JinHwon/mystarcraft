/**
 * 마이프로리그 경기 진행: 우리 경기(세트마다 서버 진행)와 포스트시즌 관전
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FINAL_SETS, burstOf, MATCH_MONEY, PRO_SETS, type CareerState, type CMatch } from "@shared/career/rules";
import { STAGE_NAMES } from "@shared/career/view";
import { ITEM_BY_KEY, gearCond, gearStats } from "@shared/career/items";
import { LegacyFrame, LegacyImg, LegacyRadar, MapInfo, TeamLogo } from "../Legacy";
import { EquipRow, condStats, setItemAll, useSpeed } from "./common";
import { AceScreen } from "./entry";
import { Broadcast, PlayerCard, SetList, type BroadcastSet } from "./broadcast";

// ── 경기 진행 (세트마다 서버에서 진행) ─────────────────────────────────
export interface WeekDone { playedMatchId?: number; mslReports?: MslReportView[]; mslPlans?: number[]; proReports?: ProReportView[] }
/** 우리 팀이 없는 포스트시즌 경기 (중계) */
export type ProReportView = { matchId: number; stage: CMatch["stage"]; a: number; b: number; sa: number; sb: number; sets: BroadcastSet[] };

/** 포스트시즌 다른 팀 경기 관전: 경기 전 화면 → 중계 → … → 결과 (서버를 기다리지 않음) */
export function ProSeriesFlow({ s, reports, onDone }: { s: CareerState; reports: ProReportView[]; onDone: () => void }) {
  const [k, setK] = useState(0);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"preview" | "live" | "result">("preview");
  const [speed, setSpeed] = useSpeed();
  const r = reports[k];
  useEffect(() => { if (!r) onDone(); }, [r]);
  if (!r) return null;
  const stageName = `마이프로리그 ${STAGE_NAMES[r.stage]}`;
  const logo = (team: number) => <TeamLogo team={s.teams[team]} className="w-[70px] h-[40px]" />;
  const score = (n: number): [number, number] => {
    let a = 0, b = 0;
    for (const x of r.sets.slice(0, n)) (x.winner === "a" ? a++ : b++);
    return [a, b];
  };
  const nextReport = () => { setK(k + 1); setIdx(0); setMode("preview"); };
  if (mode === "live") {
    const set = r.sets[idx];
    return (
      <Broadcast key={`${k}-${idx}`} s={s} stageName={stageName} lp={s.players[set.a]} rp={s.players[set.b]} mapId={set.mapId} set={set} leftIsA
        score={score(idx)} leftLogo={logo(r.a)} rightLogo={logo(r.b)} speed={speed} setSpeed={setSpeed} onClose={nextReport}
        onDone={() => { if (idx + 1 >= r.sets.length) setMode("result"); else { setIdx(idx + 1); setMode("preview"); } }} />
    );
  }
  const final = mode === "result";
  const [sl, sr] = score(final ? r.sets.length : idx);
  const set = r.sets[final ? r.sets.length - 1 : idx];
  const lp = s.players[set.a], rp = s.players[set.b];
  const isAce = !final && idx === (r.stage === "final" ? FINAL_SETS : PRO_SETS) - 1;
  return (
    <LegacyFrame season={s.season} onBack={nextReport} onNext={final ? nextReport : () => setMode("live")} nextLabel={final ? "확인 ▷▷" : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="text-center text-[12px] text-[#ffe45c]">{stageName} · 관전 {k + 1}/{reports.length}</div>
        <div className="flex items-start justify-between mt-1">
          {logo(r.a)}
          <div className="flex gap-12 text-[20px] text-neutral-100 pt-2"><span>{sl}</span><span>:</span><span>{sr}</span></div>
          {logo(r.b)}
        </div>
        {final ? (
          <div className="text-center my-5">
            <LegacyImg dir="기타" name="Winner" className="mx-auto max-h-20" fallback={<div className="text-[28px] font-black italic text-[#ffe45c] tracking-widest">WINNER</div>} />
            <div className="mt-2 text-[16px]">{s.teams[r.sa > r.sb ? r.a : r.b].name}</div>
            <div className="mt-1 text-[12px] text-neutral-400">{r.stage === "final" ? "프로리그 우승!" : "다음 라운드 진출"}</div>
          </div>
        ) : (
          <>
            <div className="flex justify-center mt-2"><MapInfo mapId={set.mapId} size={60} /></div>
            <div className="text-center text-[15px] mt-2">&lt; {isAce ? "ACE" : `${idx + 1} Set`} &gt;</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
                <div key={p.id} className="flex flex-col items-center">
                  <PlayerCard p={p} opp={o} />
                  <LegacyRadar stats={condStats(p, s)} base={p.stats} gear={gearStats(p)} level={p.level} size={112} />
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-3">
          <SetList s={s} left={r.sets.map(x => x.a)} right={r.sets.map(x => x.b)} maps={r.sets.map(x => x.mapId)} total={r.sets.length}
            idx={final ? r.sets.length : idx} results={r.sets.slice(0, final ? r.sets.length : idx)} leftIsA showAce />
        </div>
        <div className="text-center text-[11px] text-neutral-500 mt-2">Next 로 관전 · ✕ 로 이 경기 건너뛰기</div>
      </div>
    </LegacyFrame>
  );
}
export type MslReportView = { stage: string; label: string; a: number; b: number; sa: number; sb: number; winner: number; bestOf: number; sets: BroadcastSet[]; maps?: number[] };

export function LiveMatch({ s, playSet, pending, onFinished, onClose }: {
  /** 최신 세이브 (s.live 가 있는 동안) */
  s: CareerState;
  playSet: (ace: number | undefined, done: (r: { set: BroadcastSet; matchOver: boolean; week?: WeekDone; needAce: boolean }) => void, fail: () => void) => void;
  pending: boolean;
  /** 경기 끝: week 가 있으면 이번 주 일정도 끝남 */
  onFinished: (week: WeekDone | null) => void;
  onClose: () => void;
}) {
  // 경기 정보는 시작할 때 고정 (끝나면 s.live 가 사라지므로)
  const [info] = useState(() => {
    const live = s.live!;
    const m = s.matches.find(x => x.id === live.matchId)!;
    return { m, leftIsA: m.a === s.myTeam, opp: live.opp, mine: [...live.mine], items: live.items };
  });
  const { m, leftIsA, opp } = info;
  const [mine, setMine] = useState(info.mine);
  const [results, setResults] = useState<BroadcastSet[]>(() => [...(s.live?.sets ?? [])]);
  const total = m.stage === "final" ? FINAL_SETS : PRO_SETS;
  // 본 세트 수 (미리 치러 둔 세트는 아직 안 본 것) — 나갔다 들어와도 이어서 보도록 기억
  const watchedKey = `mysc-watched-${m.id}`;
  const [idx, setIdxRaw] = useState(() => {
    let seen = results.length;
    try { const v = sessionStorage.getItem(watchedKey); if (v !== null) seen = Math.min(Number(v), results.length); } catch { /* 무시 */ }
    return seen;
  });
  // 경기 전 화면의 선수 상태는 세트를 미리 치르기 전 모습으로 (컨디션 변화로 결과가 드러나지 않게)
  const sRef = useRef(s);
  sRef.current = s;
  const [snap, setSnap] = useState(() => s.players);
  const setIdx = (n: number) => { setIdxRaw(n); setView(null); setSnap(sRef.current.players); try { sessionStorage.setItem(watchedKey, String(n)); } catch { /* 무시 */ } };
  /** 세트 목록에서 누른 (이미 치른) 세트 */
  const [view, setView] = useState<number | null>(null);
  /** 다음 세트를 미리 받아 둠 → Next 를 누르면 바로 중계 */
  const [goLive, setGoLive] = useState(false);
  const [mode, setMode] = useState<"preview" | "ace" | "live" | "result">("preview");
  const [week, setWeek] = useState<WeekDone | null>(null);
  const [over, setOver] = useState(false);
  const [speed, setSpeed] = useSpeed();
  const stageName = m.stage === "regular" ? "마이프로리그" : `마이프로리그 ${STAGE_NAMES[m.stage]}`;
  const leftTeam = leftIsA ? m.a : m.b, rightTeam = leftIsA ? m.b : m.a;
  const score = (k: number): [number, number] => {
    let l = 0, r = 0;
    for (const x of results.slice(0, k)) ((x.winner === "a") === leftIsA ? l++ : r++);
    return [l, r];
  };
  const logo = (team: number) => <TeamLogo team={s.teams[team]} className="w-[70px] h-[40px]" />;

  const fetching = useRef(false);
  const fetchSet = (ace: number | undefined, then?: () => void) => {
    if (fetching.current) return;
    fetching.current = true;
    playSet(ace, r => {
      fetching.current = false;
      setResults(prev => [...prev, r.set]);
      if (ace !== undefined) setMine(prev => { const n = [...prev]; n[total - 1] = ace; return n; });
      if (r.week) setWeek(r.week);
      if (r.matchOver) setOver(true);
      then?.();
    }, () => { fetching.current = false; setGoLive(false); });
  };
  const play = (ace?: number) => fetchSet(ace, () => setMode("live"));

  // 경기 전 화면이 뜨면 이번 세트를 미리 진행해 둔다 (ACE 결정전은 선수를 골라야 하므로 제외)
  const prefetchable = mode === "preview" && !over && idx === results.length && idx < total - 1;
  useEffect(() => { if (prefetchable) fetchSet(undefined); }, [prefetchable, idx]);
  // 미리 받기 전에 Next 를 눌렀으면 도착하는 대로 중계
  useEffect(() => { if (goLive && idx < results.length) { setGoLive(false); setMode("live"); } }, [goLive, results.length, idx]);

  if (mode === "ace") {
    return <AceScreen s={s} teamLeft={leftTeam} teamRight={rightTeam} mapId={m.maps[(total - 1) % m.maps.length]} score={score(idx)} submitting={pending} onPick={id => fetchSet(id, () => setMode("preview"))} />;
  }

  if (mode === "live") {
    const set = results[idx];
    const lp = s.players[leftIsA ? set.a : set.b], rp = s.players[leftIsA ? set.b : set.a];
    return (
      <Broadcast
        key={idx} s={s} stageName={stageName} lp={lp} rp={rp} mapId={set.mapId} set={set} leftIsA={leftIsA}
        score={score(idx)} leftLogo={logo(leftTeam)} rightLogo={logo(rightTeam)} speed={speed} setSpeed={setSpeed}
        onClose={onClose}
        onDone={() => { if (over && idx === results.length - 1) setMode("result"); else { setIdx(idx + 1); setMode("preview"); } }}
      />
    );
  }

  const final = mode === "result";
  const i = view ?? (final ? results.length - 1 : idx);
  /** 이미 본 세트를 다시 보는 중 */
  const past = view !== null && (final || view < idx);
  const [sl, sr] = score(final ? results.length : idx);
  const isAce = i === total - 1;
  const lpId = results[i] ? (leftIsA ? results[i].a : results[i].b) : mine[i];
  const rpId = results[i] ? (leftIsA ? results[i].b : results[i].a) : opp[i];
  const lp = lpId !== undefined ? snap[lpId] : undefined, rp = snap[rpId];
  const mapId = m.maps[i % m.maps.length];
  const won = sl > sr;
  const next = () => {
    if (final) { onFinished(week); return; }
    if (idx < results.length) { setMode("live"); return; } // 미리 치러 둔 세트
    if (idx === total - 1) { setMode("ace"); return; }
    setGoLive(true);
    fetchSet(undefined);
  };
  const waiting = goLive || pending && !prefetchable;

  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={waiting ? undefined : next} nextDisabled={waiting} nextLabel={final ? "확인 ▷▷" : waiting ? "경기 준비 중..." : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex items-start justify-between">
          {logo(leftTeam)}
          <div className="flex gap-12 text-[20px] text-neutral-100 pt-2"><span>{sl}</span><span>:</span><span>{sr}</span></div>
          {logo(rightTeam)}
        </div>
        {final && view === null ? (
          <div className="text-center my-5">
            <LegacyImg dir="기타" name="Winner" className="mx-auto max-h-20" fallback={<div className="text-[28px] font-black italic text-[#ffe45c] tracking-widest">WINNER</div>} />
            <div className="mt-2 text-[16px]">{s.teams[won ? leftTeam : rightTeam].name}</div>
            <div className={cn("mt-1 text-[12px]", won ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{won ? `승리! 팀 자금 +${MATCH_MONEY.win}만원` : `패배 · 팀 자금 +${MATCH_MONEY.lose}만원`}</div>
          </div>
        ) : (
          <>
            <div className="flex justify-center mt-2"><MapInfo mapId={mapId} size={60} /></div>
            <div className="text-center text-[15px] mt-2">&lt; {isAce ? "ACE" : `${i + 1} Set`} &gt;</div>
            {past && results[i] && (
              <div className="text-center text-[11px] text-[#ffe45c]">
                지난 경기 · {s.players[results[i].winner === "a" ? results[i].a : results[i].b]?.name} 승
                <button onClick={() => setView(null)} className="ml-2 border border-neutral-500 px-1.5 text-neutral-200">이번 세트로</button>
              </div>
            )}
            {isAce && !results[i] ? (
              <div className="text-center text-[12px] text-[#ffe45c] my-6">{sl}:{sr} — ACE 결정전! 다음 화면에서 출전 선수를 고릅니다</div>
            ) : lp && rp && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => {
                  // 이 세트 우리 선수의 경기 아이템 (치어풀이면 모든 능력치 +75 가 실제 경기에 들어감)
                  const itemKey = p.team === s.myTeam ? results[i]?.item ?? info.items?.[i]?.key : undefined;
                  const extra = setItemAll(itemKey);
                  return (
                    <div key={p.id} className="flex flex-col items-center">
                      <PlayerCard p={p} opp={o} />
                      <div className="mt-0.5"><EquipRow p={p} size={20} /></div>
                      <LegacyRadar stats={condStats(p, s, extra)} base={p.stats} gear={gearStats(p, extra)} level={p.level} size={112} />
                      <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p)} %{burstOf(s, p) ? <span className="text-[#ffb84d] font-bold"> 🔥{Math.round(burstOf(s, p)! * 100)}%</span> : null}</div>
                      {itemKey && <div className="text-[11px] text-[#ffe45c]">아이템 : {ITEM_BY_KEY[itemKey]?.name}{extra ? ` (모든 능력치 +${extra} 반영)` : ""} · 보유 {s.inventory?.[itemKey] ?? 0}개</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="mt-3">
          <SetList s={s} left={mine} right={opp} maps={m.maps} total={total} idx={final ? results.length : idx} results={results.slice(0, final ? results.length : idx)} leftIsA={leftIsA} showAce={mine[total - 1] !== undefined}
            view={view ?? undefined} onView={k => setView(k === (final ? -1 : idx) ? null : k)} />
        </div>
      </div>
    </LegacyFrame>
  );
}
