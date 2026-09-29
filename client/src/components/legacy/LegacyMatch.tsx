/**
 * 원작식 경기 화면: 맵 추첨 결과 → 엔트리 편성 → (세트마다) 경기 전 화면 → 중계 화면 → … → 결과
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { FINAL_SETS, PRO_SETS, condMultiplier, type CareerState, type CMatch, type CPlayer, type SetResult, type SetTimeline } from "@shared/career/rules";
import { STAGE_NAMES, mapView, rosterOf } from "@shared/career/view";
import { GrayBox, LegacyFrame, LegacyImg, LegacyRadar, MapImage, MapInfo, PlayerPhoto, TeamLogo } from "./Legacy";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
const nameRace = (p?: CPlayer) => (p ? `${p.name} (${R[p.race]})` : "");
const LEFT_COLOR = "#bff5c6";
const RIGHT_COLOR = "#ffb8c8";

// ── 맵 추첨 결과 ─────────────────────────────────────────────────
export function MapDrawScreen({ s, onNext }: { s: CareerState; onNext: () => void }) {
  const pool = s.mapPool ?? [];
  return (
    <LegacyFrame season={s.season} onNext={onNext} onBack={onNext}>
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 border-t border-l border-neutral-600 mx-3 my-3">
        <div className="col-span-1 min-[480px]:col-span-2 border-r border-b border-neutral-600 flex items-center justify-center py-6 text-[15px] min-[480px]:text-[17px] tracking-[0.2em] min-[480px]:tracking-[0.35em] text-neutral-100 whitespace-nowrap">
          ◇ 맵 추첨 결과 ◇
        </div>
        {pool.map(id => (
          <div key={id} className="border-r border-b border-neutral-600 p-2.5 flex justify-center">
            <MapInfo mapId={id} size={60} responsive />
          </div>
        ))}
      </div>
    </LegacyFrame>
  );
}

// ── 엔트리 편성 ─────────────────────────────────────────────────
export function autoEntry(s: CareerState, sets: number): number[] {
  const ids = rosterOf(s, s.myTeam)
    .map(p => ({ id: p.id, v: Object.values(p.stats).reduce((a, b) => a + b, 0) * condMultiplier(p.cond) }))
    .sort((a, b) => b.v - a.v)
    .map(x => x.id);
  if (!ids.length) return [];
  return [...Array.from({ length: sets - 1 }, (_, i) => ids[i % ids.length]), ids[0]];
}

function SideLabel({ lines, color }: { lines: [string, string]; color: string }) {
  return (
    <div className="text-center italic font-black leading-tight text-[13px] tracking-widest" style={{ color: "#fff", textShadow: `0 0 4px ${color}, 0 0 8px ${color}` }}>
      {lines[0]}<br />{lines[1]}
    </div>
  );
}

export function EntryScreen({ s, match, entry, setEntry, onSubmit, submitting, onShowMaps, onBack }: {
  s: CareerState;
  match: CMatch;
  entry: (number | undefined)[];
  setEntry: (e: (number | undefined)[]) => void;
  onSubmit: () => void;
  submitting: boolean;
  onShowMaps: () => void;
  onBack: () => void;
}) {
  const sets = match.stage === "final" ? FINAL_SETS : PRO_SETS;
  const oppId = match.a === s.myTeam ? match.b : match.a;
  const mine = useMemo(() => rosterOf(s, s.myTeam).sort((a, b) => a.name.localeCompare(b.name, "ko")), [s]);
  const theirs = useMemo(() => rosterOf(s, oppId).sort((a, b) => a.name.localeCompare(b.name, "ko")), [s, oppId]);
  const [slot, setSlot] = useState(() => Math.max(0, entry.findIndex(x => x === undefined)));
  const ace = sets - 1;
  const mapOf = (i: number) => match.maps[i % match.maps.length];
  const complete = entry.length === sets && entry.every(x => x !== undefined);
  const front = entry.slice(0, ace);
  const valid = complete && new Set(front).size === front.length;

  const assign = (pid: number) => {
    const next = [...entry];
    while (next.length < sets) next.push(undefined);
    if (slot !== ace) {
      // 1~(n-1)세트는 중복 불가: 다른 칸에 있던 같은 선수는 빼냄
      for (let i = 0; i < ace; i++) if (next[i] === pid) next[i] = undefined;
    }
    next[slot] = pid;
    setEntry(next);
    const empty = next.findIndex((x, i) => i > slot && x === undefined);
    const anyEmpty = next.findIndex(x => x === undefined);
    setSlot(empty >= 0 ? empty : anyEmpty >= 0 ? anyEmpty : slot);
  };
  const cur = entry[slot] !== undefined ? s.players[entry[slot]!] : undefined;

  // Tab = 다음 세트 (원작 [↔Tab])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Tab") { e.preventDefault(); setSlot(x => (x + 1) % sets); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sets]);

  return (
    <LegacyFrame season={s.season} onBack={submitting ? undefined : onBack} onNext={valid && !submitting ? onSubmit : undefined} nextDisabled={!valid || submitting} nextLabel={submitting ? "경기 준비 중..." : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <TeamLogo team={s.teams[s.myTeam]} className="w-[76px] h-[44px]" />
          <div className="text-center">
            <div className="text-[16px] tracking-[0.3em] text-neutral-100">▽ 엔트리 편성 ▽</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">{STAGE_NAMES[match.stage]}{match.stage === "regular" ? ` ${match.week}주차` : ""} · {sets === FINAL_SETS ? "7전 4선승" : "5전 3선승"}</div>
          </div>
          <TeamLogo team={s.teams[oppId]} className="w-[76px] h-[44px]" />
        </div>

        <div className="flex justify-center mt-3">
          <MapInfo mapId={mapOf(slot)} size={62} hint={<button onClick={() => setSlot(x => (x + 1) % sets)} className="text-[9px] text-neutral-500">[↔Tab]</button>} />
        </div>

        <div className="grid grid-cols-[1fr_minmax(112px,1fr)_1fr] gap-2 mt-3 items-start">
          <div className="space-y-1.5">
            <SideLabel lines={["MY TEAM", "PLAYER"]} color="#3aa0ff" />
            <LegacyImg dir="기타" name="아군" className="w-full max-h-16 object-contain" fallback={null} />
            <div className="border-2 border-neutral-300 p-1 min-h-[220px]">
              {mine.map(p => {
                const at = entry.findIndex(x => x === p.id);
                return (
                  <button key={p.id} onClick={() => assign(p.id)} className={cn("w-full flex justify-between text-[13px] leading-[1.35] px-0.5 text-left", at >= 0 ? "text-[#ffe45c]" : "text-white", cur?.id === p.id && "bg-neutral-700")}>
                    <span className="truncate">{p.name}</span><span>({R[p.race]})</span>
                  </button>
                );
              })}
            </div>
            <div className="text-[9px] text-neutral-500 text-center">선수를 눌러 선택한 세트에 배치</div>
          </div>

          <div className="space-y-1.5">
            <div className="text-center text-[14px] text-neutral-100">&lt; V S &gt;</div>
            {Array.from({ length: sets }, (_, i) => {
              const p = entry[i] !== undefined ? s.players[entry[i]!] : undefined;
              return (
                <div key={i} className="space-y-0.5">
                  <GrayBox onClick={() => setSlot(i)}>{mapView(mapOf(i)).name}</GrayBox>
                  <button
                    onClick={() => setSlot(i)}
                    className={cn("w-full text-[11px] py-[3px] border truncate", slot === i ? "border-[#ff6b6b] border-2" : "border-neutral-500", p ? "text-white" : "text-neutral-200")}
                    style={{ background: "#111" }}
                  >
                    {p ? `${i === ace ? "★ " : ""}${nameRace(p)}` : i === ace ? "ACE Card" : "Select Player"}
                  </button>
                </div>
              );
            })}
            {cur && (
              <div className="text-[10px] text-neutral-300 text-center pt-1">
                Lv.{cur.level} · Condition {cur.cond * 10}%<br />{STAT_KEYS.reduce((a, k: StatKey) => a + cur.stats[k], 0).toLocaleString()}
              </div>
            )}
            <div className="flex gap-1 pt-1">
              <button onClick={() => { setEntry(autoEntry(s, sets)); setSlot(0); }} className="flex-1 text-[10px] border border-neutral-600 text-neutral-300 py-1">자동 편성</button>
              <button onClick={onShowMaps} className="flex-1 text-[10px] border border-neutral-600 text-neutral-300 py-1">맵 추첨</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <SideLabel lines={["OTHER TEAM", "PLAYER"]} color="#ff3a3a" />
            <LegacyImg dir="기타" name="적군" className="w-full max-h-16 object-contain" fallback={null} />
            <div className="border-2 border-neutral-300 p-1 min-h-[220px]">
              {theirs.map(p => (
                <div key={p.id} className="flex justify-between text-[13px] leading-[1.35] px-0.5 text-white">
                  <span className="truncate">{p.name}</span><span>({R[p.race]})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {complete && !valid && <p className="mt-2 text-center text-[11px] text-[#ff8a8a]">1~{ace}세트에는 서로 다른 선수를 배치해야 합니다</p>}
      </div>
    </LegacyFrame>
  );
}

// ── 경기 관전 (세트마다 경기 전 화면 → 중계) ──────────────────────────
export interface BroadcastSet extends SetResult { timeline?: SetTimeline }

interface Side { team: number; entry: number[] }

function PlayerCard({ p, vsRace, before }: { p: CPlayer; vsRace: CPlayer["race"]; before: CareerState }) {
  const rec = before.players[p.id]?.vs?.[vsRace];
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-start gap-1.5">
        <div className="text-[9px] text-neutral-300 text-center leading-tight pt-1 w-12">
          {rec ? "전적" : "전적없음"}<br />vs {R[vsRace]}<br /><br />{rec?.[0] ?? 0} 승<br />{rec?.[1] ?? 0} 패
        </div>
        <PlayerPhoto name={p.name} size={58} />
      </div>
      <div className="text-[12px] text-white mt-0.5">{nameRace(p)}</div>
    </div>
  );
}

function SetList({ s, left, right, maps, total, idx, results, leftIsA }: {
  s: CareerState; left: Side; right: Side; maps: number[]; total: number; idx: number; results: BroadcastSet[]; leftIsA: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: total }, (_, i) => {
        const ace = i === total - 1;
        const reached = i <= idx && i < results.length;
        const r = results[i];
        const leftWon = r ? (r.winner === "a") === leftIsA : undefined;
        const hide = ace && !reached;
        const lp = s.players[left.entry[i]], rp = s.players[right.entry[i]];
        const cell = (p: CPlayer | undefined, won: boolean | undefined) =>
          hide ? <span className="inline-block border border-neutral-300 px-2 py-[1px]">ACE Card</span>
            : <span className={cn(i < idx && won === false && "text-neutral-500", i < idx && won && "text-[#ffe45c]")}>{nameRace(p)}</span>;
        return (
          <div key={i} className={cn("grid grid-cols-[1fr_96px_1fr] items-center gap-1.5 text-[12px] px-1 py-[3px]", i === idx && "border border-neutral-300")}>
            <div className="text-center truncate">{cell(lp, leftWon)}</div>
            <GrayBox>{mapView(maps[i % maps.length]).name}</GrayBox>
            <div className="text-center truncate">{cell(rp, leftWon === undefined ? undefined : !leftWon)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Broadcast({ s, stageName, lp, rp, mapId, set, leftIsA, score, leftTeam, rightTeam, onDone, onClose }: {
  s: CareerState; stageName: string; onClose: () => void; lp: CPlayer; rp: CPlayer; mapId: number; set: BroadcastSet; leftIsA: boolean;
  score: [number, number]; leftTeam: number; rightTeam: number; onDone: () => void;
}) {
  const tl = set.timeline;
  const lines = useMemo(() => [
    { t: 0, side: 0 as const, text: `${stageName}. 경기 시작했습니다.` },
    ...(tl?.lines ?? []),
  ], [tl, stageName]);
  const [shown, setShown] = useState(1);
  const [speed, setSpeed] = useState<1 | 4 | 8>(1);
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

  const Bars = ({ i }: { i: number }) => (
    <div className="w-full flex items-end justify-between gap-1.5 pb-1">
      <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
        <div className="w-full h-[14px] flex items-center"><div className="h-[3px] bg-[#f5e3a0]" style={{ width: `${((frame?.army[i] ?? 0) / maxArmy) * 100}%`, minWidth: 4 }} /></div>
        <span className="text-[10px] text-neutral-300">병력</span>
      </div>
      <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
        <div className="w-full h-[14px] flex items-center"><div className="h-[14px] bg-[#1f4fff]" style={{ width: `${((frame?.res[i] ?? 0) / maxRes) * 100}%`, minWidth: 4 }} /></div>
        <span className="text-[10px] text-neutral-300">자원</span>
      </div>
    </div>
  );
  const Winner = () => <div className="mt-1 text-center text-[13px] font-black text-[#ffe45c]">WINNER</div>;

  return (
    <LegacyFrame
      season={s.season}
      onNext={onDone}
      onBack={onClose}
      bottom={done ? undefined : (
        <div className="flex items-center gap-2 text-[12px] text-black px-2 py-0.5" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>
          {([1, 4, 8] as const).map(x => (
            <label key={x} className="flex items-center gap-0.5 cursor-pointer">
              <input type="radio" checked={speed === x} onChange={() => setSpeed(x)} className="accent-black" /> ×{x}
            </label>
          ))}
          <button onClick={() => setShown(lines.length)} className="ml-1 border border-neutral-500 px-1.5 text-[11px]">결과 ▷▷</button>
        </div>
      )}
    >
      <div className="px-3 pt-3 pb-3 flex flex-col h-full min-h-[520px]">
        <div className="flex items-start justify-between">
          <TeamLogo team={s.teams[leftTeam]} className="w-[70px] h-[40px]" />
          <div className="flex flex-col items-center">
            <div className="flex gap-10 text-[18px] text-neutral-100"><span>{sl}</span><span>:</span><span>{sr}</span></div>
            <MapImage mapId={mapId} size={56} />
            <span className="text-[11px] mt-0.5">{mapView(mapId).name}</span>
          </div>
          <TeamLogo team={s.teams[rightTeam]} className="w-[70px] h-[40px]" />
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-[76px_1fr_76px] gap-2 mt-2">
          <div className="flex flex-col items-center justify-between">
            <div className="flex flex-col items-center">
              <PlayerPhoto name={lp.name} size={56} />
              <span className="text-[11px] mt-0.5 text-center">{nameRace(lp)}</span>
              {done && leftWon && <Winner />}
            </div>
            <Bars i={L} />
          </div>
          <div ref={boxRef} className="border border-neutral-400 bg-[#1e1e1e] px-2 py-2 overflow-y-auto text-[11.5px] leading-[1.45] min-h-[300px] max-h-[56vh]">
            {lines.slice(0, shown).map((l, i) => (
              <div key={i} style={{ color: l.side === 0 ? "#f2f2f2" : l.side === leftSide ? LEFT_COLOR : RIGHT_COLOR }}>{l.text}</div>
            ))}
            {!tl && <div className="text-neutral-400">중계 기록이 없습니다.</div>}
          </div>
          <div className="flex flex-col items-center justify-between">
            <div className="flex flex-col items-center">
              <PlayerPhoto name={rp.name} size={56} />
              <span className="text-[11px] mt-0.5 text-center">{nameRace(rp)}</span>
              {done && !leftWon && <Winner />}
            </div>
            <Bars i={Rr} />
          </div>
        </div>
      </div>
    </LegacyFrame>
  );
}

/** 경기 관전: before = 경기 전 세이브(능력치·전적 표시용), after = 경기 후 세이브 */
export function MatchViewer({ before, after, matchId, broadcast, onClose }: {
  before: CareerState; after: CareerState; matchId: number; broadcast: BroadcastSet[]; onClose: () => void;
}) {
  const m = after.matches.find(x => x.id === matchId)!;
  const leftIsA = m.a === after.myTeam;
  const total = m.stage === "final" ? FINAL_SETS : PRO_SETS;
  const left: Side = { team: leftIsA ? m.a : m.b, entry: (leftIsA ? m.entryA : m.entryB) ?? [] };
  const right: Side = { team: leftIsA ? m.b : m.a, entry: (leftIsA ? m.entryB : m.entryA) ?? [] };
  const results: BroadcastSet[] = broadcast.length ? broadcast : (m.sets ?? []);
  const played = results.length;
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"preview" | "live" | "result">("preview");
  const stageName = m.stage === "regular" ? "마이프로리그" : `마이프로리그 ${STAGE_NAMES[m.stage]}`;

  const scoreBefore = (k: number): [number, number] => {
    let l = 0, r = 0;
    for (const x of results.slice(0, k)) ((x.winner === "a") === leftIsA ? l++ : r++);
    return [l, r];
  };

  if (mode === "live") {
    const set = results[idx];
    const lp = after.players[leftIsA ? set.a : set.b], rp = after.players[leftIsA ? set.b : set.a];
    return (
      <Broadcast
        key={idx} s={after} onClose={onClose} stageName={stageName} lp={lp} rp={rp} mapId={set.mapId} set={set} leftIsA={leftIsA}
        score={scoreBefore(idx)} leftTeam={left.team} rightTeam={right.team}
        onDone={() => {
          if (idx + 1 >= played) setMode("result");
          else { setIdx(idx + 1); setMode("preview"); }
        }}
      />
    );
  }

  const final = mode === "result";
  const i = final ? played - 1 : idx;
  const [sl, sr] = scoreBefore(final ? played : idx);
  const set = results[i];
  const lp = before.players[left.entry[i]] ?? after.players[left.entry[i]];
  const rp = before.players[right.entry[i]] ?? after.players[right.entry[i]];
  const mapId = set?.mapId ?? m.maps[i % m.maps.length];
  const won = m.winner === after.myTeam;

  return (
    <LegacyFrame season={after.season} onBack={onClose} onNext={final ? onClose : () => setMode("live")} nextLabel={final ? "확인 ▷▷" : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex items-start justify-between">
          <TeamLogo team={after.teams[left.team]} className="w-[76px] h-[44px]" />
          <div className="flex gap-12 text-[20px] text-neutral-100 pt-2"><span>{sl}</span><span>:</span><span>{sr}</span></div>
          <TeamLogo team={after.teams[right.team]} className="w-[76px] h-[44px]" />
        </div>
        {final ? (
          <div className="text-center my-5">
            <LegacyImg dir="기타" name="Winner" className="mx-auto max-h-20" fallback={<div className="text-[28px] font-black italic text-[#ffe45c] tracking-widest">WINNER</div>} />
            <div className="mt-2 text-[16px]">{after.teams[m.winner!].name}</div>
            <div className={cn("mt-1 text-[12px]", won ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{won ? "승리! 팀 자금 +200만원" : "패배 · 팀 자금 +50만원"}</div>
          </div>
        ) : (
          <>
            <div className="flex justify-center mt-2"><MapInfo mapId={mapId} size={60} /></div>
            <div className="text-center text-[15px] mt-2">&lt; {i === total - 1 ? "ACE" : `${i + 1} Set`} &gt;</div>
            {lp && rp && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => {
                  const b = before.players[p.id] ?? p;
                  return (
                    <div key={p.id} className="flex flex-col items-center">
                      <PlayerCard p={b} vsRace={o.race} before={before} />
                      <LegacyRadar stats={b.stats} level={b.level} size={112} />
                      <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{b.cond * 10} %</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="mt-3">
          <SetList s={after} left={left} right={right} maps={m.maps} total={total} idx={final ? played : idx} results={results} leftIsA={leftIsA} />
        </div>
      </div>
    </LegacyFrame>
  );
}
