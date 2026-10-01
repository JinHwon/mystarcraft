/**
 * 중계 화면 (문자중계 + 병력·자원 막대)과 경기 전 화면 조각
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { type CareerState, type CPlayer, type PlayerFx, type SetResult, type SetTimeline } from "@shared/career/rules";
import { headToHead, mapView } from "@shared/career/view";
import { GrayBox, LEGACY_FONT, LegacyFrame, MapImage, PlayerPhoto } from "../Legacy";
import { LEFT_COLOR, R, RIGHT_COLOR, nameRace, setItemAll, type Speed } from "./common";

/**
 * 중계 화면 선수 아래: 이 세트에 쓴 경기 아이템 (치어풀이면 모든 능력치 +75 로 경기함)
 * 중계 중인 세이브는 세트가 끝난 뒤 상태라, 능력치 합계 대신 아이템 효과만 표시
 */
function SetPower({ s, p, item }: { s: CareerState; p: CPlayer; item?: string }) {
  const extra = p.team === s.myTeam ? setItemAll(item) : 0;
  if (!extra) return null;
  return <div className="text-[10px] text-center leading-tight text-[#ffe45c]">📣 치어풀<br />모든 능력치 +{extra}</div>;
}

// ── 중계 화면 ─────────────────────────────────────────────────────
export interface BroadcastSet extends SetResult { timeline?: SetTimeline }

/** 병력·자원 세로 막대 (원작처럼 아래에서 위로 차오름) */
export function VBars({ army, res, maxArmy, maxRes }: { army: number; res: number; maxArmy: number; maxRes: number }) {
  const bar = (v: number, max: number, color: string) => (
    <div className="w-[18px] h-[150px] flex items-end">
      <div className="w-full transition-[height] duration-300" style={{ height: `${Math.max(2, Math.min(100, (v / max) * 100))}%`, background: color }} />
    </div>
  );
  return (
    <div className="flex items-end justify-center gap-3 pb-1">
      <div className="flex flex-col items-center gap-1">{bar(army, maxArmy, "#f5e3a0")}<span className="text-[10px] text-neutral-300">병력</span></div>
      <div className="flex flex-col items-center gap-1">{bar(res, maxRes, "#1f4fff")}<span className="text-[10px] text-neutral-300">자원</span></div>
    </div>
  );
}

export function Broadcast({ s, stageName, lp, rp, mapId, set, leftIsA, score, leftLogo, rightLogo, onDone, onClose, speed, setSpeed }: {
  s: CareerState; stageName: string; lp: CPlayer; rp: CPlayer; mapId: number; set: BroadcastSet; leftIsA: boolean;
  score: [number, number]; leftLogo: React.ReactNode; rightLogo: React.ReactNode; onDone: () => void; onClose: () => void;
  speed: Speed; setSpeed: (v: Speed) => void;
}) {
  const tl = set.timeline;
  const lines = useMemo(() => [{ t: 0, side: 0 as const, text: `${stageName}. 경기 시작했습니다.` }, ...(tl?.lines ?? [])], [tl, stageName]);
  const [shown, setShown] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const done = shown >= lines.length;

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setShown(n => n + 1), { 1: 900, 4: 230, 8: 110 }[speed]);
    return () => clearTimeout(id);
  }, [shown, speed, done]);
  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); }, [shown]);

  const now = lines[Math.min(shown, lines.length) - 1]?.t ?? 0;
  const frames = tl?.frames ?? [];
  const frame = [...frames].reverse().find(f => f.t <= now) ?? frames[0];
  const maxArmy = Math.max(10, ...frames.map(f => Math.max(...f.army)));
  const maxRes = Math.max(300, ...frames.map(f => Math.max(...f.res)));
  const L = leftIsA ? 0 : 1, Rr = leftIsA ? 1 : 0;
  const leftSide = leftIsA ? 1 : 2;
  const leftWon = (set.winner === "a") === leftIsA;
  const [sl, sr] = done ? [score[0] + (leftWon ? 1 : 0), score[1] + (leftWon ? 0 : 1)] : score;
  const Winner = () => <div className="mt-1 text-center text-[13px] font-black text-[#ffe45c]">WINNER</div>;

  return (
    <LegacyFrame
      season={s.season}
      onNext={onDone}
      onBack={onClose}
      bottom={done ? undefined : (
        <div className="flex items-center gap-2 text-[12px] text-black px-2 py-0.5" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">중계 배속</legend>
            {([1, 4, 8] as const).map(x => (
              <label key={x} className="flex items-center gap-0.5 cursor-pointer">
                <input type="radio" name="broadcast-speed" checked={speed === x} onChange={() => setSpeed(x)} className="accent-black" /> ×{x}
              </label>
            ))}
          </fieldset>
          <button onClick={() => setShown(lines.length)} className="ml-1 border border-neutral-500 px-1.5 text-[11px]">결과 ▷▷</button>
        </div>
      )}
    >
      <div className="px-3 pt-3 pb-3 flex flex-col h-full min-h-[540px]">
        <div className="flex items-start justify-between">
          {leftLogo}
          <div className="flex flex-col items-center">
            <div className="flex gap-10 text-[18px] text-neutral-100"><span>{sl}</span><span>:</span><span>{sr}</span></div>
            <MapImage mapId={mapId} size={56} />
            <span className="text-[11px] mt-0.5">{mapView(mapId).name}</span>
          </div>
          {rightLogo}
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-[78px_1fr_78px] gap-2 mt-2">
          <div className="flex flex-col items-center justify-between">
            <div className="flex flex-col items-center">
              <PlayerPhoto id={lp.photoOf ?? lp.id} name={lp.name} titles={lp.titles} size={56} />
              <span className="text-[11px] mt-0.5 text-center">{nameRace(lp)}</span>
              <SetPower s={s} p={lp} item={set.item} />
              {done && leftWon && <Winner />}
            </div>
            <VBars army={frame?.army[L] ?? 0} res={frame?.res[L] ?? 0} maxArmy={maxArmy} maxRes={maxRes} />
          </div>
          <div ref={boxRef} role="log" aria-live="polite" aria-label="문자중계" className="border border-neutral-400 bg-[#1e1e1e] px-2 py-2 overflow-y-auto text-[11.5px] leading-[1.45] min-h-[320px] max-h-[58vh]">
            {lines.slice(0, shown).map((l, i) => (
              <div key={i} style={{ color: l.side === 0 ? "#f2f2f2" : l.side === leftSide ? LEFT_COLOR : RIGHT_COLOR }}>{l.text}</div>
            ))}
            {!tl && <div className="text-neutral-400">중계 기록이 없습니다.</div>}
            {done && <SetFxBox s={s} set={set} lp={lp} rp={rp} leftIsA={leftIsA} />}
          </div>
          <div className="flex flex-col items-center justify-between">
            <div className="flex flex-col items-center">
              <PlayerPhoto id={rp.photoOf ?? rp.id} name={rp.name} titles={rp.titles} size={56} />
              <span className="text-[11px] mt-0.5 text-center">{nameRace(rp)}</span>
              <SetPower s={s} p={rp} item={set.item} />
              {done && !leftWon && <Winner />}
            </div>
            <VBars army={frame?.army[Rr] ?? 0} res={frame?.res[Rr] ?? 0} maxArmy={maxArmy} maxRes={maxRes} />
          </div>
        </div>
      </div>
    </LegacyFrame>
  );
}

/** 세트가 끝난 뒤 두 선수의 컨디션·경험치·능력치 변화와 세레모니 보너스 */
export function SetFxBox({ s, set, lp, rp, leftIsA }: { s: CareerState; set: BroadcastSet; lp: CPlayer; rp: CPlayer; leftIsA: boolean }) {
  if (!set.fx && !set.ceremony && !set.burst) return null;
  const row = (p: CPlayer, fx: PlayerFx | undefined, color: string) => fx && (
    <div key={p.id} style={{ color }}>
      ▶ {p.name}: 컨디션 {fx.cond[0]}% → {fx.cond[1]}% ({fx.cond[1] - fx.cond[0] >= 0 ? "+" : ""}{fx.cond[1] - fx.cond[0]}) · 경험치 +{fx.exp}
      {fx.level ? ` · 레벨 업! Lv.${fx.level}` : ""}
      {fx.stats && ` · ${Object.entries(fx.stats).map(([k, d]) => `${STAT_LABELS[k as StatKey]} ${d! > 0 ? "+" : ""}${d}`).join(", ")}`}
    </div>
  );
  const [fl, fr] = leftIsA ? [set.fx?.a, set.fx?.b] : [set.fx?.b, set.fx?.a];
  return (
    <div className="mt-2 pt-1.5 border-t border-neutral-600 space-y-0.5 text-[11px]">
      <div className="text-neutral-400">— 경기 결과 —</div>
      {[[lp, leftIsA ? set.burst?.a : set.burst?.b], [rp, leftIsA ? set.burst?.b : set.burst?.a]].map(([p, v]) => v ? <div key={(p as CPlayer).id} className="text-[#ffb84d]">🔥 {(p as CPlayer).name} 포텐셜 폭발! 이 세트 능력치 {Math.round((v as number) * 100)}%</div> : null)}
      {row(lp, fl, LEFT_COLOR)}
      {row(rp, fr, RIGHT_COLOR)}
      {set.ceremony && <div className="text-[#ffe45c]">🎉 세레모니! 소지금 +{set.ceremony}만원 · 우리 선수 전원 컨디션 +1 (현재 {s.teams[s.myTeam].money.toLocaleString()}만원)</div>}
    </div>
  );
}

// ── 경기 전 화면 조각 ──────────────────────────────────────────────
export function PlayerCard({ p, opp }: { p: CPlayer; opp: CPlayer }) {
  const [open, setOpen] = useState(false);
  const rec = p.vs?.[opp.race];
  const h2h = headToHead(p, opp);
  const races = ["terran", "zerg", "protoss"] as const;
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-start gap-1.5">
        <button onClick={() => setOpen(true)} className="text-[9px] text-neutral-300 text-center leading-tight pt-1 w-12 underline decoration-dotted underline-offset-2">
          {rec ? "전적" : "전적없음"}<br />vs {R[opp.race]}<br /><br />{rec?.[0] ?? 0} 승<br />{rec?.[1] ?? 0} 패
        </button>
        <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={58} />
      </div>
      <div className="text-[12px] text-white mt-0.5">{nameRace(p)}</div>
      {open && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-6" onClick={() => setOpen(false)} style={LEGACY_FONT}>
          <div className="bg-black border-2 border-neutral-300 w-full max-w-[300px] p-3 text-white text-[13px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={46} />
              <div>
                <div className="text-[15px] text-[#ffe45c]">{nameRace(p)}</div>
                <div className="text-[11px] text-neutral-400">통산 {p.wins}승 {p.losses}패 · 이번 시즌 {p.sWins}승 {p.sLosses}패</div>
              </div>
            </div>
            <div className="mt-2.5 text-[12px] text-neutral-400">종족별 전적</div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {races.map(r => {
                const x = p.vs?.[r] ?? [0, 0];
                const n = x[0] + x[1];
                return (
                  <div key={r} className={cn("border px-1 py-1 text-center", r === opp.race ? "border-[#ffe45c]" : "border-neutral-600")}>
                    <div className="text-[11px] text-neutral-300">vs {R[r]}</div>
                    <div>{x[0]}승 {x[1]}패</div>
                    <div className="text-[10px] text-neutral-500">{n ? `${Math.round((x[0] / n) * 100)}%` : "-"}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 text-[12px] text-neutral-400">상대 전적 vs {nameRace(opp)}</div>
            <div className="border border-[#8fd0ff] mt-1 py-1.5 text-center text-[15px]">
              {h2h[0] + h2h[1] ? <>{h2h[0]}승 {h2h[1]}패</> : <span className="text-neutral-400 text-[12px]">맞대결 기록 없음</span>}
            </div>
            <button onClick={() => setOpen(false)} className="mt-3 w-full border border-neutral-300 py-1 text-[12px]">닫기</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function SetList({ s, left, right, maps, total, idx, results, leftIsA, showAce, onView, view, hideOppAce = true }: {
  s: CareerState; left: number[]; right: number[]; maps: number[]; total: number; idx: number; results: BroadcastSet[]; leftIsA: boolean; showAce: boolean;
  /** 오른쪽(상대) ACE 는 치를 때까지 숨김 — 우리 경기. 관전(다른 팀 경기)이면 false: 양쪽 다 showAce 를 따름 */
  hideOppAce?: boolean;
  /** 맵을 누르면 그 세트 선수를 보여줌 (보여줄 수 있는지는 부르는 쪽에서 판단) */
  onView?: (i: number) => void;
  view?: number;
}) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: total }, (_, i) => {
        const ace = i === total - 1;
        const r = results[i];
        const leftWon = r ? (r.winner === "a") === leftIsA : undefined;
        const hideL = ace && !r && !showAce, hideR = ace && !r && (hideOppAce || !showAce);
        const lp = left[i] !== undefined ? s.players[left[i]] : undefined, rp = s.players[right[i]];
        const cell = (p: CPlayer | undefined, won: boolean | undefined, hide: boolean) =>
          hide || !p ? <span className="inline-block border border-neutral-300 px-2 py-[1px]">ACE Card</span>
            : <span className={cn(r && won === false && "text-neutral-500", r && won && "text-[#ffe45c]")}>{nameRace(p)}</span>;
        return (
          <div key={i} className={cn("grid grid-cols-[1fr_96px_1fr] items-center gap-1.5 text-[12px] px-1 py-[3px]", i === idx && "border border-neutral-300")}>
            <div className="text-center truncate">{cell(lp, leftWon, hideL)}</div>
            <GrayBox onClick={onView ? () => onView(i) : undefined} active={view === i}>{mapView(maps[i % maps.length]).name}</GrayBox>
            <div className="text-center truncate">{cell(rp, leftWon === undefined ? undefined : !leftWon, hideR)}</div>
          </div>
        );
      })}
    </div>
  );
}
