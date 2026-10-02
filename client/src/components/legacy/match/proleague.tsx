/**
 * 마이프로리그 경기 진행: 우리 경기(세트마다 서버 진행)와 포스트시즌 관전
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FINAL_SETS, burstOf, MATCH_MONEY, PRO_SETS, type CareerState, type CMatch, type PlayerSnap } from "@shared/career/rules";
import { STAGE_NAMES } from "@shared/career/view";
import { viewStateAt, type SnapReport } from "./viewState";
import { ITEM_BY_KEY, gearCond, gearStats } from "@shared/career/items";
import { LegacyFrame, LegacyImg, LegacyRadar, MapInfo, TeamLogo } from "../Legacy";
import { EquipRow, condStats, setItemBoost, useSpeed } from "./common";
import { AceScreen } from "./entry";
import { Broadcast, PlayerCard, SetList, type BroadcastSet } from "./broadcast";

// ── 경기 진행 (세트마다 서버에서 진행) ─────────────────────────────────
export interface WeekDone { playedMatchId?: number; mslReports?: MslReportView[]; mslPlans?: number[]; proReports?: ProReportView[]; needNomination?: boolean; needMsl?: number[] }
/** 우리 팀이 없는 포스트시즌 경기 (중계). entryA·entryB·maps 가 있으면 치르지 않은 세트까지 보여줌 */
export type ProReportView = { matchId: number; stage: CMatch["stage"]; a: number; b: number; sa: number; sb: number; sets: BroadcastSet[]; entryA?: number[]; entryB?: number[]; maps?: number[]; pre?: Record<number, PlayerSnap> };

/**
 * 포스트시즌 다른 팀 경기 관전: 경기 전 화면 → 중계 → … → 결과 (서버를 기다리지 않음)
 * - 세트 목록의 맵을 누르면 치른·치를 세트의 선수를 볼 수 있음 (ACE 결정전 선수는 2:2·3:3 이 되어야 공개)
 * - onClose(✕): 나중에 이어 보기, start·onProgress: 이어 볼 위치
 */
export function ProSeriesFlow({ s: latest, reports, onDone, onClose, start, onProgress, all }: {
  s: CareerState; reports: ProReportView[]; onDone: () => void; onClose?: () => void;
  start?: { k: number; idx: number }; onProgress?: (p: { k: number; idx: number }) => void;
  /** 이번 주 관전 경기 전체 (포스트시즌 → 개인리그 순) — 선수 상태를 그 세트 직전으로 보여줄 때 씀 */
  all?: SnapReport[];
}) {
  const [k, setK] = useState(start?.k ?? 0);
  const [idx, setIdx] = useState(start?.idx ?? 0);
  const [mode, setMode] = useState<"preview" | "live" | "result">("preview");
  const [view, setView] = useState<number | null>(null);
  const [speed, setSpeed] = useSpeed();
  useEffect(() => { onProgress?.({ k, idx }); }, [k, idx]);
  const r = reports[k];
  useEffect(() => { if (!r) onDone(); }, [r]);
  if (!r) return null;
  const exit = onClose ?? onDone;
  const total = r.stage === "final" ? FINAL_SETS : PRO_SETS;
  const played = r.sets.length;
  // 보고 있는 세트 직전 선수 상태 (결과 화면은 경기 뒤)
  const list = all ?? reports;
  const s = viewStateAt(latest, list, list.indexOf(r) < 0 ? list.length : list.indexOf(r), mode === "result" ? played : idx);
  const left = r.entryA?.length ? r.entryA : r.sets.map(x => x.a);
  const right = r.entryB?.length ? r.entryB : r.sets.map(x => x.b);
  const maps = r.maps?.length ? r.maps : r.sets.map(x => x.mapId);
  const stageName = `마이프로리그 ${STAGE_NAMES[r.stage]}`;
  const logo = (team: number) => <TeamLogo team={s.teams[team]} className="w-[70px] h-[40px]" />;
  const score = (n: number): [number, number] => {
    let a = 0, b = 0;
    for (const x of r.sets.slice(0, n)) (x.winner === "a" ? a++ : b++);
    return [a, b];
  };
  const nextReport = () => { setK(k + 1); setIdx(0); setView(null); setMode("preview"); };
  if (mode === "live") {
    const set = r.sets[idx];
    return (
      <Broadcast key={`${k}-${idx}`} s={s} stageName={stageName} lp={s.players[set.a]} rp={s.players[set.b]} mapId={set.mapId} set={set} leftIsA
        score={score(idx)} leftLogo={logo(r.a)} rightLogo={logo(r.b)} speed={speed} setSpeed={setSpeed} onClose={exit}
        onDone={() => { setView(null); if (idx + 1 >= played) setMode("result"); else { setIdx(idx + 1); setMode("preview"); } }} />
    );
  }
  const final = mode === "result";
  const cur = final ? played - 1 : idx;
  const i = view ?? cur;
  const [sl, sr] = score(final ? played : idx);
  const set = r.sets[i];
  const lp = s.players[set?.a ?? left[i]], rp = s.players[set?.b ?? right[i]];
  const mapId = set?.mapId ?? maps[i % maps.length];
  const isAce = i === total - 1;
  const aceOpen = idx >= total - 1 || played >= total;
  const canView = (j: number) => j !== total - 1 || aceOpen || j < played;
  const label = view === null ? "" : view < cur || (final && view <= cur) ? (set ? `지난 경기 · ${s.players[set.winner === "a" ? set.a : set.b]?.name} 승` : "") : view > cur && !final ? "앞으로 치를 경기" : "";
  return (
    <LegacyFrame season={s.season} onBack={exit} onNext={final ? nextReport : () => { setView(null); setMode("live"); }} nextLabel={final ? "확인 ▷▷" : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="text-center text-[12px] text-[#ffe45c]">{stageName} · 관전 {k + 1}/{reports.length}</div>
        <div className="flex items-start justify-between mt-1">
          {logo(r.a)}
          <div className="flex gap-12 text-[20px] text-neutral-100 pt-2"><span>{sl}</span><span>:</span><span>{sr}</span></div>
          {logo(r.b)}
        </div>
        {final && view === null ? (
          <div className="text-center my-5">
            <LegacyImg dir="기타" name="Winner" className="mx-auto max-h-20" fallback={<div className="text-[28px] font-black italic text-[#ffe45c] tracking-widest">WINNER</div>} />
            <div className="mt-2 text-[16px]">{s.teams[r.sa > r.sb ? r.a : r.b].name}</div>
            <div className="mt-1 text-[12px] text-neutral-400">{r.stage === "final" ? "프로리그 우승!" : "다음 라운드 진출"}</div>
          </div>
        ) : lp && rp ? (
          <>
            <div className="flex justify-center mt-2"><MapInfo mapId={mapId} size={60} /></div>
            <div className="text-center text-[15px] mt-2">&lt; {isAce ? "ACE" : `${i + 1} Set`} &gt;</div>
            {label && (
              <div className="text-center text-[11px] text-[#ffe45c]">
                {label}<button onClick={() => setView(null)} className="ml-2 border border-neutral-500 px-1.5 text-neutral-200">이번 세트로</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
                <div key={p.id} className="flex flex-col items-center">
                  <PlayerCard p={p} opp={o} />
                  <LegacyRadar stats={condStats(p, s)} base={p.stats} gear={gearStats(p)} level={p.level} size={112} />
                  <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p)} %{burstOf(s, p) ? <span className="text-[#ffb84d] font-bold"> 🔥{Math.round(burstOf(s, p)! * 100)}%</span> : null}</div>
                </div>
              ))}
            </div>
          </>
        ) : <div className="text-center text-[12px] text-neutral-400 my-6">이 세트 선수 정보가 없습니다</div>}
        <div className="mt-3">
          <SetList s={s} left={left} right={right} maps={maps} total={Math.max(total, played)}
            idx={final ? played : idx} results={r.sets.slice(0, final ? played : idx)} leftIsA showAce={aceOpen} hideOppAce={false}
            view={view ?? undefined} onView={j => { if (canView(j)) setView(j === cur && !final ? null : j); }} />
        </div>
        <div className="text-center text-[11px] text-neutral-500 mt-2">맵을 누르면 그 세트 선수 · Next 로 관전 · ✕ 로 나가기 (다시 들어오면 이어서)</div>
      </div>
    </LegacyFrame>
  );
}
export type MslReportView = { stage: string; label: string; a: number; b: number; sa: number; sb: number; winner: number; bestOf: number; sets: BroadcastSet[]; maps?: number[]; pre?: Record<number, PlayerSnap> };

/** 마지막 세트까지 서버에서 끝났지만 아직 다 보지 못하고 나간 경기 (다시 들어오면 이어서) */
export type HeldFinish = { matchId: number; set: BroadcastSet; week: WeekDone | null; ace?: number };

export function LiveMatch({ s, playSet, pending, onFinished, onClose, held, onHold }: {
  /** 최신 세이브 (s.live 가 있는 동안) */
  s: CareerState;
  /** 이미 끝난 마지막 세트 (이어 보기) */
  held?: HeldFinish | null;
  /** 마지막 세트가 끝나면 알림 (나갔다 와도 이어 보도록 보관) */
  onHold?: (h: HeldFinish) => void;
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
  const total = m.stage === "final" ? FINAL_SETS : PRO_SETS;
  const heldHere = held && held.matchId === m.id ? held : null;
  const [mine, setMine] = useState(() => { const n = [...info.mine]; if (heldHere?.ace !== undefined) n[total - 1] = heldHere.ace; return n; });
  const [results, setResults] = useState<BroadcastSet[]>(() => [...(s.live?.sets ?? []), ...(heldHere ? [heldHere.set] : [])]);
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
  const [week, setWeek] = useState<WeekDone | null>(heldHere?.week ?? null);
  const [over, setOver] = useState(!!heldHere);
  const [speed, setSpeed] = useSpeed();
  const stageName = m.stage === "regular" ? (m.div === 2 ? "마이프로리그 2부" : "마이프로리그") : `마이프로리그 ${STAGE_NAMES[m.stage]}`;
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
      if (r.matchOver) { setOver(true); onHold?.({ matchId: m.id, set: r.set, week: r.week ?? null, ace }); }
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
            {view !== null && view > idx && !final && (
              <div className="text-center text-[11px] text-[#8fd0ff]">
                앞으로 치를 경기<button onClick={() => setView(null)} className="ml-2 border border-neutral-500 px-1.5 text-neutral-200">이번 세트로</button>
              </div>
            )}
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
                  // 이 세트 우리 선수의 경기 아이템 (치어풀·작전 메모는 능력치 추가가 실제 경기에 들어감)
                  const itemKey = p.team === s.myTeam ? results[i]?.item ?? info.items?.[i]?.key : undefined;
                  const { extra, text } = setItemBoost(itemKey);
                  return (
                    <div key={p.id} className="flex flex-col items-center">
                      <PlayerCard p={p} opp={o} />
                      <div className="mt-0.5"><EquipRow p={p} size={20} /></div>
                      <LegacyRadar stats={condStats(p, s, extra)} base={p.stats} gear={gearStats(p, extra)} level={p.level} size={112} />
                      <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p)} %{burstOf(s, p) ? <span className="text-[#ffb84d] font-bold"> 🔥{Math.round(burstOf(s, p)! * 100)}%</span> : null}</div>
                      {itemKey && <div className="text-[11px] text-[#ffe45c]">아이템 : {ITEM_BY_KEY[itemKey]?.name}{text ? ` (${text} 반영)` : ""} · 보유 {s.inventory?.[itemKey] ?? 0}개</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="mt-3">
          <SetList s={s} left={mine} right={opp} maps={m.maps} total={total} idx={final ? results.length : idx} results={results.slice(0, final ? results.length : idx)} leftIsA={leftIsA} showAce={mine[total - 1] !== undefined}
            view={view ?? undefined} onView={k => { if (k === total - 1 && !results[k] && !(k < idx)) return; setView(k === (final ? -1 : idx) ? null : k); }} />
        </div>
      </div>
    </LegacyFrame>
  );
}
