/**
 * 원작식 경기 화면: 맵 추첨 결과 → 엔트리 편성 → (세트마다) 경기 전 화면 → 중계 화면 → … (2:2 면 ACE 결정전 엔트리) → 결과
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { FINAL_SETS, MSL_PLAN, PRO_SETS, condMultiplier, totalOf, type CareerState, type CMatch, type CPlayer, type SetResult, type SetTimeline } from "@shared/career/rules";
import { STAGE_NAMES, mapView, rosterOf } from "@shared/career/view";
import { ITEMS, ITEM_BY_KEY, SLOT_NAMES, gearCond, gearStats, itemImg, type EquipSlot } from "@shared/career/items";
import { GrayBox, LEGACY_FONT, LegacyFrame, LegacyImg, LegacyRadar, MapImage, MapInfo, PlayerPhoto, TeamLogo } from "./Legacy";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
const nameRace = (p?: CPlayer) => (p ? `${p.name} (${R[p.race]})` : "");
const LEFT_COLOR = "#bff5c6";
const MATCH_ITEMS = ITEMS.filter(i => i.kind === "match");
/** 엔트리에서 상점으로 (편성 내용은 유지되지 않음) */
const navigateShop = () => { window.location.href = "/shop"; };
const RIGHT_COLOR = "#ffb8c8";

/** 컨디션이 반영된 능력치 */
export function condStats(p: CPlayer): Record<StatKey, number> {
  const g = gearStats(p);
  const k = condMultiplier(gearCond(p));
  return Object.fromEntries(STAT_KEYS.map(s => [s, Math.round(g[s] * k)])) as Record<StatKey, number>;
}

/** 장착 장비 4칸 (마우스·키보드·모니터·기타) */
export function EquipRow({ p, size = 22 }: { p: CPlayer; size?: number }) {
  return (
    <div className="flex gap-1 justify-center">
      {(Object.keys(SLOT_NAMES) as EquipSlot[]).map(slot => {
        const e = p.equip?.[slot];
        const it = e ? ITEM_BY_KEY[e.key] : undefined;
        return (
          <div key={slot} title={it ? `${it.name} (남은 ${e!.left}경기)` : `${SLOT_NAMES[slot]} 없음`}
            className={cn("border flex items-center justify-center overflow-hidden", it ? "bg-white border-neutral-300" : "border-neutral-700 border-dashed")} style={{ width: size, height: size }}>
            {it && <LegacyImg dir={itemImg(it).dir} name={itemImg(it).name} className="max-w-full max-h-full object-contain" fallback={<span className="text-[7px] text-black">{it.name.slice(0, 2)}</span>} />}
          </div>
        );
      })}
    </div>
  );
}

// ── 배속 (한 번 정하면 바꿀 때까지 유지) ─────────────────────────────
type Speed = 1 | 4 | 8;
const SPEED_KEY = "mysc-speed";
function useSpeed(): [Speed, (s: Speed) => void] {
  const [speed, setSpeed] = useState<Speed>(() => {
    try { const v = Number(localStorage.getItem(SPEED_KEY)); return v === 4 || v === 8 ? v : 1; } catch { return 1; }
  });
  const set = (v: Speed) => { setSpeed(v); try { localStorage.setItem(SPEED_KEY, String(v)); } catch { /* 저장 불가여도 이번 경기 동안은 유지 */ } };
  return [speed, set];
}

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

// ── 선수 정보 칸 (사진 + 컨디션 반영 능력치) ─────────────────────────────
export function PlayerPanel({ p, color, empty }: { p?: CPlayer; color: string; empty: string }) {
  if (!p) {
    return <div className="h-full min-h-[190px] border border-neutral-700 flex items-center justify-center text-[11px] text-neutral-500 text-center px-2">{empty}</div>;
  }
  const cs = condStats(p);
  return (
    <div className="border border-neutral-700 px-1.5 pt-1.5 pb-1 flex flex-col items-center">
      <div className="flex items-start gap-2 w-full justify-center">
        <PlayerPhoto id={p.id} name={p.name} size={50} />
        <div className="text-[11px] leading-[1.45] text-neutral-200 pt-0.5">
          <div className="text-[13px] font-bold" style={{ color }}>{p.name}</div>
          <div>{R[p.race]} · Lv.{p.level}</div>
          <div>Condition <b className={gearCond(p) >= 7 ? "text-[#bff5c6]" : gearCond(p) <= 3 ? "text-[#ff9a9a]" : "text-white"}>{gearCond(p) * 10}%</b>{gearCond(p) !== p.cond && <span className="text-[9px] text-neutral-500"> (장비)</span>}</div>
          <div className="text-neutral-400">{totalOf(p.stats).toLocaleString()} → <b className="text-[#ffe45c]">{totalOf(cs).toLocaleString()}</b></div>
        </div>
      </div>
      <div className="mt-1"><EquipRow p={p} /></div>
      <LegacyRadar stats={cs} base={p.stats} level={p.level} size={92} />
      <div className="text-[9px] text-neutral-500 -mt-1">회색 점선 = 원래 · 빨강 = 컨디션·장비 반영</div>
    </div>
  );
}

// ── 엔트리 편성 ─────────────────────────────────────────────────
/** 1~(n-1)세트 자동 편성 (컨디션 반영 능력치 순) */
export function autoEntry(s: CareerState, sets: number): number[] {
  const ids = rosterOf(s, s.myTeam)
    .map(p => ({ id: p.id, v: totalOf(p.stats) * condMultiplier(p.cond) }))
    .sort((a, b) => b.v - a.v)
    .map(x => x.id);
  return ids.slice(0, sets - 1);
}

function SideLabel({ lines, color }: { lines: [string, string]; color: string }) {
  return (
    <div className="text-center italic font-black leading-tight text-[12px] tracking-widest" style={{ color: "#fff", textShadow: `0 0 4px ${color}, 0 0 8px ${color}` }}>
      {lines[0]}<br />{lines[1]}
    </div>
  );
}

export function RosterList({ players, onPick, selected, marks }: { players: CPlayer[]; onPick: (p: CPlayer) => void; selected?: number; marks?: Map<number, string> }) {
  return (
    <div className="border-2 border-neutral-300 p-0.5">
      {players.map(p => {
        const mark = marks?.get(p.id);
        return (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className={cn("w-full flex items-center gap-1 text-[13px] px-1 py-[5px] text-left border-b border-neutral-800 last:border-b-0",
              mark ? "text-[#ffe45c]" : "text-white", selected === p.id && "bg-[#3a3a5a]")}
          >
            <span className="truncate flex-1">{p.name}</span>
            <span className="text-[11px] text-neutral-400">{mark ?? ""}</span>
            <span>({R[p.race]})</span>
          </button>
        );
      })}
    </div>
  );
}

export type ItemPlan = Record<number, { key: string; predict?: number }>;

export function EntryScreen({ s, match, front, setFront, items, setItems, onSubmit, submitting, onShowMaps, onBack }: {
  s: CareerState;
  match: CMatch;
  /** 세트별 경기 아이템 */
  items: ItemPlan;
  setItems: (v: ItemPlan) => void;
  /** 1~(n-1)세트 엔트리 */
  front: (number | undefined)[];
  setFront: (e: (number | undefined)[]) => void;
  onSubmit: () => void;
  submitting: boolean;
  onShowMaps: () => void;
  onBack: () => void;
}) {
  const sets = match.stage === "final" ? FINAL_SETS : PRO_SETS;
  const n = sets - 1;
  const oppId = match.a === s.myTeam ? match.b : match.a;
  const mine = useMemo(() => rosterOf(s, s.myTeam).sort((a, b) => a.name.localeCompare(b.name, "ko")), [s]);
  const theirs = useMemo(() => rosterOf(s, oppId).sort((a, b) => a.name.localeCompare(b.name, "ko")), [s, oppId]);
  const [slot, setSlot] = useState(() => Math.max(0, front.findIndex(x => x === undefined)));
  const [viewMine, setViewMine] = useState<number | undefined>(front[0]);
  const [viewOpp, setViewOpp] = useState<number | undefined>();
  const mapOf = (i: number) => match.maps[i % match.maps.length];
  const filled = Array.from({ length: n }, (_, i) => front[i]);
  const valid = filled.every(x => x !== undefined) && new Set(filled).size === n;
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [snipeFor, setSnipeFor] = useState<number | null>(null);
  const usedCount = (key: string, except?: number) => Object.entries(items).filter(([k, v]) => v.key === key && Number(k) !== except).length;
  const setItem = (i: number, v?: { key: string; predict?: number }) => {
    const next = { ...items };
    if (v) next[i] = v; else delete next[i];
    setItems(next);
  };
  const marks = new Map(filled.flatMap((id, i) => (id === undefined ? [] : [[id, `${i + 1}`] as [number, string]])));

  const assign = (p: CPlayer) => {
    setViewMine(p.id);
    const next = [...filled];
    if (next[slot] === p.id) { next[slot] = undefined; setFront(next); return; } // 같은 칸을 다시 누르면 빼기
    for (let i = 0; i < n; i++) if (next[i] === p.id) next[i] = undefined; // 다른 세트에 있던 선수는 옮김
    next[slot] = p.id;
    setFront(next);
    const empty = next.findIndex((x, i) => i > slot && x === undefined);
    const anyEmpty = next.findIndex(x => x === undefined);
    setSlot(empty >= 0 ? empty : anyEmpty >= 0 ? anyEmpty : slot);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Tab") { e.preventDefault(); setSlot(x => (x + 1) % n); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [n]);

  return (
    <LegacyFrame season={s.season} onBack={submitting ? undefined : onBack} onNext={valid && !submitting ? onSubmit : undefined} nextDisabled={!valid || submitting} nextLabel={submitting ? "경기 준비 중..." : undefined}>
      <div className="px-2.5 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <TeamLogo team={s.teams[s.myTeam]} className="w-[70px] h-[40px]" />
          <div className="text-center">
            <div className="text-[15px] tracking-[0.3em] text-neutral-100">▽ 엔트리 편성 ▽</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">{STAGE_NAMES[match.stage]}{match.stage === "regular" ? ` ${match.week}주차` : ""} · {sets === FINAL_SETS ? "7전 4선승" : "5전 3선승"}</div>
          </div>
          <TeamLogo team={s.teams[oppId]} className="w-[70px] h-[40px]" />
        </div>

        <div className="flex justify-center mt-2.5">
          <MapInfo mapId={mapOf(slot)} size={54} hint={<span className="text-[9px] text-neutral-500">{slot + 1}세트 [↔Tab]</span>} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <PlayerPanel p={viewMine !== undefined ? s.players[viewMine] : undefined} color="#8fd0ff" empty="우리 선수를 누르면 사진과 능력치가 보입니다" />
          <PlayerPanel p={viewOpp !== undefined ? s.players[viewOpp] : undefined} color="#ff9a9a" empty="상대 선수를 누르면 사진과 컨디션이 보입니다" />
        </div>

        <div className="grid grid-cols-[1fr_minmax(108px,0.9fr)_1fr] gap-1.5 mt-2.5 items-start">
          <div className="space-y-1">
            <LegacyImg dir="기타" name="아군" className="w-full max-h-16 object-contain" fallback={<SideLabel lines={["MY TEAM", "PLAYER"]} color="#3aa0ff" />} />
            <RosterList players={mine} onPick={assign} selected={viewMine} marks={marks} />
          </div>

          <div className="space-y-1.5">
            <div className="text-center text-[13px] text-neutral-100">&lt; V S &gt;</div>
            <div className="text-center text-[10px] text-[#ffe45c]">{slot + 1}세트 선수를 고르세요</div>
            {Array.from({ length: sets }, (_, i) => {
              const isAce = i === n;
              const p = !isAce && filled[i] !== undefined ? s.players[filled[i]!] : undefined;
              return (
                <div key={i} className="space-y-0.5">
                  <GrayBox onClick={() => !isAce && setSlot(i)}>{mapView(mapOf(i)).name}</GrayBox>
                  <button
                    disabled={isAce}
                    onClick={() => { setSlot(i); if (p) setViewMine(p.id); }}
                    className={cn("w-full text-[12px] py-[5px] border truncate", slot === i && !isAce ? "border-[#ff6b6b] border-2" : "border-neutral-500", p ? "text-white" : "text-neutral-300")}
                    style={{ background: "#111" }}
                  >
                    {isAce ? "ACE Card" : p ? nameRace(p) : "Select Player"}
                  </button>
                  {!isAce && (
                    <button onClick={() => setPickFor(i)} className="w-full flex items-center justify-center gap-1 text-[10px] py-[2px] border border-dashed border-neutral-600 text-neutral-400">
                      {items[i] ? (
                        <>
                          <span className="w-4 h-4 bg-white inline-flex items-center justify-center overflow-hidden"><LegacyImg dir={itemImg(ITEM_BY_KEY[items[i].key]).dir} name={itemImg(ITEM_BY_KEY[items[i].key]).name} className="max-w-full max-h-full" fallback={null} /></span>
                          <span className="text-[#ffe45c]">{ITEM_BY_KEY[items[i].key].name}{items[i].predict !== undefined ? ` → ${s.players[items[i].predict!]?.name}` : ""}</span>
                        </>
                      ) : "+ 아이템"}
                    </button>
                  )}
                </div>
              );
            })}
            <div className="text-[9px] text-neutral-500 text-center leading-tight">ACE 결정전은 2:2 가 되면<br />그때 선수를 고릅니다</div>
            <div className="flex gap-1 pt-0.5">
              <button onClick={() => { const e = autoEntry(s, sets); setFront(e); setSlot(0); setViewMine(e[0]); }} className="flex-1 text-[10px] border border-neutral-600 text-neutral-300 py-1.5">자동 편성</button>
              <button onClick={onShowMaps} className="flex-1 text-[10px] border border-neutral-600 text-neutral-300 py-1.5">맵 추첨</button>
            </div>
          </div>

          <div className="space-y-1">
            <LegacyImg dir="기타" name="적군" className="w-full max-h-16 object-contain" fallback={<SideLabel lines={["OTHER TEAM", "PLAYER"]} color="#ff3a3a" />} />
            <RosterList players={theirs} onPick={p => setViewOpp(p.id)} selected={viewOpp} />
          </div>
        </div>
      </div>
      {pickFor !== null && createPortal(
        <div className="fixed inset-0 app-fixed-x w-full z-[70] bg-black/80 flex items-end text-white" style={LEGACY_FONT} onClick={() => { setPickFor(null); setSnipeFor(null); }}>
          <div className="w-full bg-[#111] border-t-2 border-neutral-400 p-3 space-y-2" onClick={e => e.stopPropagation()}>
            {snipeFor === null ? (
              <>
                <div className="text-center text-[13px] text-neutral-100">{pickFor + 1}세트 경기 아이템</div>
                {MATCH_ITEMS.map(it => {
                  const left = (s.inventory?.[it.key] ?? 0) - usedCount(it.key, pickFor);
                  return (
                    <button key={it.key} disabled={left <= 0}
                      onClick={() => { if (it.key === "sniping") setSnipeFor(pickFor); else { setItem(pickFor, { key: it.key }); setPickFor(null); } }}
                      className={cn("w-full flex items-center gap-2 border px-2 py-1.5 text-left disabled:opacity-35", items[pickFor]?.key === it.key ? "border-[#ff6b6b]" : "border-neutral-700")}>
                      <span className="w-9 h-9 bg-white flex items-center justify-center overflow-hidden"><LegacyImg dir={itemImg(it).dir} name={itemImg(it).name} className="max-w-full max-h-full" fallback={null} /></span>
                      <span className="flex-1 text-[12px]"><b className="text-white">{it.name}</b><br /><span className="text-neutral-400">{it.effect.join(" ")}</span></span>
                      <span className="text-[11px] text-[#ffe45c]">보유 {Math.max(0, left)}</span>
                    </button>
                  );
                })}
                <div className="flex gap-2">
                  <button onClick={() => { setItem(pickFor); setPickFor(null); }} className="flex-1 border border-neutral-600 py-1.5 text-[12px] text-neutral-300">사용 안 함</button>
                  <button onClick={() => { setPickFor(null); navigateShop(); }} className="flex-1 border border-neutral-600 py-1.5 text-[12px] text-neutral-300">아이템 상점</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center text-[13px] text-neutral-100">스나이핑 · {snipeFor + 1}세트에 나올 상대 선수 예측</div>
                <div className="max-h-[50vh] overflow-y-auto">
                  <RosterList players={theirs} onPick={p => { setItem(snipeFor, { key: "sniping", predict: p.id }); setSnipeFor(null); setPickFor(null); }} selected={items[snipeFor]?.predict} />
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </LegacyFrame>
  );
}

// ── ACE 결정전 엔트리 (2:2 일 때) ──────────────────────────────────
function AceScreen({ s, teamLeft, teamRight, mapId, score, onPick, submitting }: {
  s: CareerState; teamLeft: number; teamRight: number; mapId: number; score: [number, number];
  onPick: (id: number) => void; submitting: boolean;
}) {
  const mine = useMemo(() => rosterOf(s, s.myTeam).sort((a, b) => totalOf(condStats(b)) - totalOf(condStats(a))), [s]);
  const [sel, setSel] = useState<number | undefined>(mine[0]?.id);
  return (
    <LegacyFrame season={s.season} onNext={sel !== undefined && !submitting ? () => onPick(sel) : undefined} nextDisabled={sel === undefined || submitting} nextLabel={submitting ? "경기 준비 중..." : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex items-start justify-between">
          <TeamLogo team={s.teams[teamLeft]} className="w-[70px] h-[40px]" />
          <div className="flex gap-10 text-[20px] text-neutral-100 pt-1"><span>{score[0]}</span><span>:</span><span>{score[1]}</span></div>
          <TeamLogo team={s.teams[teamRight]} className="w-[70px] h-[40px]" />
        </div>
        <div className="text-center mt-2">
          <LegacyImg dir="기타" name="ACE" className="mx-auto max-h-14" fallback={null} />
          <div className="text-[16px] tracking-[0.3em] text-[#ffe45c] mt-1">◇ ACE 결정전 ◇</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">마지막 세트에 나갈 선수를 고르세요 (누구나 출전 가능)</div>
        </div>
        <div className="flex justify-center mt-2.5"><MapInfo mapId={mapId} size={54} /></div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <PlayerPanel p={sel !== undefined ? s.players[sel] : undefined} color="#8fd0ff" empty="선수를 고르세요" />
          <div className="border border-neutral-700 flex flex-col items-center justify-center gap-2 min-h-[190px]">
            <span className="inline-block border border-neutral-300 px-3 py-1 text-[13px]">ACE Card</span>
            <span className="text-[10px] text-neutral-500">상대 ACE 는 경기 시작 때 공개</span>
          </div>
        </div>
        <div className="mt-2.5">
          <RosterList players={mine} onPick={p => setSel(p.id)} selected={sel} marks={new Map(sel !== undefined ? [[sel, "ACE"]] : [])} />
        </div>
      </div>
    </LegacyFrame>
  );
}

// ── 중계 화면 ─────────────────────────────────────────────────────
export interface BroadcastSet extends SetResult { timeline?: SetTimeline }

/** 병력·자원 세로 막대 (원작처럼 아래에서 위로 차오름) */
function VBars({ army, res, maxArmy, maxRes }: { army: number; res: number; maxArmy: number; maxRes: number }) {
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
          {([1, 4, 8] as const).map(x => (
            <label key={x} className="flex items-center gap-0.5 cursor-pointer">
              <input type="radio" checked={speed === x} onChange={() => setSpeed(x)} className="accent-black" /> ×{x}
            </label>
          ))}
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
              <PlayerPhoto id={lp.id} name={lp.name} size={56} />
              <span className="text-[11px] mt-0.5 text-center">{nameRace(lp)}</span>
              {done && leftWon && <Winner />}
            </div>
            <VBars army={frame?.army[L] ?? 0} res={frame?.res[L] ?? 0} maxArmy={maxArmy} maxRes={maxRes} />
          </div>
          <div ref={boxRef} className="border border-neutral-400 bg-[#1e1e1e] px-2 py-2 overflow-y-auto text-[11.5px] leading-[1.45] min-h-[320px] max-h-[58vh]">
            {lines.slice(0, shown).map((l, i) => (
              <div key={i} style={{ color: l.side === 0 ? "#f2f2f2" : l.side === leftSide ? LEFT_COLOR : RIGHT_COLOR }}>{l.text}</div>
            ))}
            {!tl && <div className="text-neutral-400">중계 기록이 없습니다.</div>}
          </div>
          <div className="flex flex-col items-center justify-between">
            <div className="flex flex-col items-center">
              <PlayerPhoto id={rp.id} name={rp.name} size={56} />
              <span className="text-[11px] mt-0.5 text-center">{nameRace(rp)}</span>
              {done && !leftWon && <Winner />}
            </div>
            <VBars army={frame?.army[Rr] ?? 0} res={frame?.res[Rr] ?? 0} maxArmy={maxArmy} maxRes={maxRes} />
          </div>
        </div>
      </div>
    </LegacyFrame>
  );
}

// ── 경기 전 화면 조각 ──────────────────────────────────────────────
function PlayerCard({ p, vsRace }: { p: CPlayer; vsRace: CPlayer["race"] }) {
  const rec = p.vs?.[vsRace];
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-start gap-1.5">
        <div className="text-[9px] text-neutral-300 text-center leading-tight pt-1 w-12">
          {rec ? "전적" : "전적없음"}<br />vs {R[vsRace]}<br /><br />{rec?.[0] ?? 0} 승<br />{rec?.[1] ?? 0} 패
        </div>
        <PlayerPhoto id={p.id} name={p.name} size={58} />
      </div>
      <div className="text-[12px] text-white mt-0.5">{nameRace(p)}</div>
    </div>
  );
}

function SetList({ s, left, right, maps, total, idx, results, leftIsA, showAce }: {
  s: CareerState; left: number[]; right: number[]; maps: number[]; total: number; idx: number; results: BroadcastSet[]; leftIsA: boolean; showAce: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: total }, (_, i) => {
        const ace = i === total - 1;
        const r = results[i];
        const leftWon = r ? (r.winner === "a") === leftIsA : undefined;
        const hideL = ace && !r && !showAce, hideR = ace && !r;
        const lp = left[i] !== undefined ? s.players[left[i]] : undefined, rp = s.players[right[i]];
        const cell = (p: CPlayer | undefined, won: boolean | undefined, hide: boolean) =>
          hide || !p ? <span className="inline-block border border-neutral-300 px-2 py-[1px]">ACE Card</span>
            : <span className={cn(r && won === false && "text-neutral-500", r && won && "text-[#ffe45c]")}>{nameRace(p)}</span>;
        return (
          <div key={i} className={cn("grid grid-cols-[1fr_96px_1fr] items-center gap-1.5 text-[12px] px-1 py-[3px]", i === idx && "border border-neutral-300")}>
            <div className="text-center truncate">{cell(lp, leftWon, hideL)}</div>
            <GrayBox>{mapView(maps[i % maps.length]).name}</GrayBox>
            <div className="text-center truncate">{cell(rp, leftWon === undefined ? undefined : !leftWon, hideR)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── 경기 진행 (세트마다 서버에서 진행) ─────────────────────────────────
export interface WeekDone { playedMatchId?: number; mslReports?: MslReportView[] }
export type MslReportView = { stage: string; label: string; a: number; b: number; sa: number; sb: number; winner: number; bestOf: number; sets: BroadcastSet[] };

export function LiveMatch({ s, playSet, pending, onFinished, onClose }: {
  /** 최신 세이브 (s.live 가 있는 동안) */
  s: CareerState;
  playSet: (ace: number | undefined, done: (r: { set: BroadcastSet; matchOver: boolean; week?: WeekDone; needAce: boolean }) => void) => void;
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
  const [idx, setIdx] = useState(() => results.length);
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

  const play = (ace?: number) => playSet(ace, r => {
    setResults(prev => [...prev, r.set]);
    if (ace !== undefined) setMine(prev => { const n = [...prev]; n[total - 1] = ace; return n; });
    if (r.week) setWeek(r.week);
    if (r.matchOver) setOver(true);
    setMode("live");
  });

  if (mode === "ace") {
    return <AceScreen s={s} teamLeft={leftTeam} teamRight={rightTeam} mapId={m.maps[(total - 1) % m.maps.length]} score={score(idx)} submitting={pending} onPick={id => play(id)} />;
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
  const i = final ? results.length - 1 : idx;
  const [sl, sr] = score(final ? results.length : idx);
  const isAce = i === total - 1;
  const lpId = results[i] ? (leftIsA ? results[i].a : results[i].b) : mine[i];
  const rpId = results[i] ? (leftIsA ? results[i].b : results[i].a) : opp[i];
  const lp = lpId !== undefined ? s.players[lpId] : undefined, rp = s.players[rpId];
  const mapId = m.maps[i % m.maps.length];
  const won = sl > sr;
  const next = () => {
    if (final) { onFinished(week); return; }
    if (idx < results.length) { setMode("live"); return; } // 이미 치른 세트 (이어보기)
    if (isAce) { setMode("ace"); return; }
    play();
  };

  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={pending ? undefined : next} nextDisabled={pending} nextLabel={final ? "확인 ▷▷" : pending ? "경기 준비 중..." : undefined}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex items-start justify-between">
          {logo(leftTeam)}
          <div className="flex gap-12 text-[20px] text-neutral-100 pt-2"><span>{sl}</span><span>:</span><span>{sr}</span></div>
          {logo(rightTeam)}
        </div>
        {final ? (
          <div className="text-center my-5">
            <LegacyImg dir="기타" name="Winner" className="mx-auto max-h-20" fallback={<div className="text-[28px] font-black italic text-[#ffe45c] tracking-widest">WINNER</div>} />
            <div className="mt-2 text-[16px]">{s.teams[won ? leftTeam : rightTeam].name}</div>
            <div className={cn("mt-1 text-[12px]", won ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{won ? "승리! 팀 자금 +200만원" : "패배 · 팀 자금 +50만원"}</div>
          </div>
        ) : (
          <>
            <div className="flex justify-center mt-2"><MapInfo mapId={mapId} size={60} /></div>
            <div className="text-center text-[15px] mt-2">&lt; {isAce ? "ACE" : `${i + 1} Set`} &gt;</div>
            {isAce && !results[i] ? (
              <div className="text-center text-[12px] text-[#ffe45c] my-6">{sl}:{sr} — ACE 결정전! 다음 화면에서 출전 선수를 고릅니다</div>
            ) : lp && rp && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
                  <div key={p.id} className="flex flex-col items-center">
                    <PlayerCard p={p} vsRace={o.race} />
                    <LegacyRadar stats={condStats(p)} base={p.stats} level={p.level} size={112} />
                    <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p) * 10} %</div>
                    {p.team === s.myTeam && info.items?.[i] && <div className="text-[11px] text-[#ffe45c]">아이템 : {ITEM_BY_KEY[info.items[i].key]?.name}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mt-3">
          <SetList s={s} left={mine} right={opp} maps={m.maps} total={total} idx={final ? results.length : idx} results={results} leftIsA={leftIsA} showAce={mine[total - 1] !== undefined} />
        </div>
      </div>
    </LegacyFrame>
  );
}

/** 스타리그 경기 다시 보기 (우리 선수 다전제) */
export function SeriesViewer({ s, report, onClose }: { s: CareerState; report: MslReportView; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useSpeed();
  const mineLeft = s.players[report.a]?.team === s.myTeam || s.players[report.b]?.team !== s.myTeam;
  const leftIsA = mineLeft;
  const set = report.sets[idx];
  if (!set) { onClose(); return null; }
  const score: [number, number] = [0, 0];
  for (const x of report.sets.slice(0, idx)) ((x.winner === "a") === leftIsA ? score[0]++ : score[1]++);
  const lp = s.players[leftIsA ? set.a : set.b], rp = s.players[leftIsA ? set.b : set.a];
  const logo = (p: CPlayer) => <TeamLogo team={s.teams[p.team]} className="w-[70px] h-[40px]" />;
  return (
    <Broadcast
      key={idx} s={s} stageName="마이스타리그" lp={lp} rp={rp} mapId={set.mapId} set={set} leftIsA={leftIsA} score={score}
      leftLogo={logo(lp)} rightLogo={logo(rp)} speed={speed} setSpeed={setSpeed} onClose={onClose}
      onDone={() => (idx + 1 < report.sets.length ? setIdx(idx + 1) : onClose())}
    />
  );
}


/** 이번 주 개인리그: 우리 선수 경기를 차례로 (경기 전 화면 → 중계) */
export function MslFlow({ s, reports, onDone }: { s: CareerState; reports: MslReportView[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [watching, setWatching] = useState(false);
  const r = reports[i];
  if (!r) { onDone(); return null; }
  const next = () => { setWatching(false); if (i + 1 < reports.length) setI(i + 1); else onDone(); };
  if (watching) return <SeriesViewer s={s} report={r} onClose={next} />;
  const mineLeft = s.players[r.a]?.team === s.myTeam || s.players[r.b]?.team !== s.myTeam;
  const lp = s.players[mineLeft ? r.a : r.b], rp = s.players[mineLeft ? r.b : r.a];
  const logo = r.stage === "듀얼 토너먼트" ? "DT" : "MySL";
  return (
    <LegacyFrame season={s.season} onBack={onDone} onNext={() => setWatching(true)}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex flex-col items-center gap-1">
          <LegacyImg dir="로고" name={logo} className="max-h-14 object-contain" fallback={<div className="text-[18px] italic font-black text-[#c9a0ff]">MySL</div>} />
          <div className="text-[16px] tracking-[0.3em]">마이스타리그 {r.stage}</div>
          <div className="text-[13px] text-[#ffe45c]">&lt; {r.label} &gt;</div>
          <div className="text-[11px] text-neutral-400">{r.bestOf === 1 ? "단판 승부" : `${r.bestOf}전 ${Math.ceil(r.bestOf / 2)}선승`} · 이번 주 우리 선수 경기 {i + 1}/{reports.length}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
            <div key={p.id} className="flex flex-col items-center">
              <PlayerCard p={p} vsRace={o.race} />
              <div className="text-[10px] text-neutral-500">{s.teams[p.team]?.name}</div>
              <LegacyRadar stats={condStats(p)} base={p.stats} level={p.level} size={112} />
              <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p) * 10} %</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1">
          {r.sets.map((x, k) => (
            <div key={k} className="grid grid-cols-[1fr_96px_1fr] items-center gap-1.5 text-[12px]">
              <span className="text-center">{k + 1}세트</span>
              <GrayBox>{mapView(x.mapId).name}</GrayBox>
              <span className="text-center text-neutral-500">?</span>
            </div>
          ))}
        </div>
        <div className="text-center text-[11px] text-neutral-500 mt-3">Next 로 관전 · ✕ 로 이번 주 개인리그 건너뛰기</div>
      </div>
    </LegacyFrame>
  );
}

const MSL_ICON: Record<string, string> = { "PC방 예선전": "PC방", 듀얼토너먼트: "DT" };

/** 원작 "정규 시즌 일정" 화면: 주마다 프로리그 2경기 + 개인리그 일정 */
export function ScheduleScreen({ s, onClose }: { s: CareerState; onClose: () => void }) {
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
        <span className="text-[11px] truncate flex-1">{opp.name}</span>
        {m.done && <span className={cn("text-[10.5px] font-bold", won ? "text-[#bff5c6]" : "text-[#ff9a9a]")}>{my}:{their}</span>}
      </div>
    );
  };
  return (
    <LegacyFrame season={s.season} onBack={onClose} onNext={onClose}>
      <div className="px-2 pt-3 pb-4">
        <div className="flex items-center justify-between px-1">
          <TeamLogo team={me} className="w-[64px] h-[38px]" />
          <div className="text-center"><div className="text-[15px] tracking-[0.3em]">▽ 정규 시즌 일정 ▽</div><div className="text-[13px] mt-1">{me.name}</div></div>
          <TeamLogo team={me} className="w-[64px] h-[38px]" />
        </div>
        <div className="grid grid-cols-[1fr_1fr_92px] text-[10px] text-neutral-400 mt-2 px-0.5">
          <span className="pl-1">프로리그 1경기</span><span className="pl-1">프로리그 2경기</span><span className="text-center text-[#8fe07a]">개인리그</span>
        </div>
        <div className="border border-neutral-500">
          {Array.from({ length: weeks }, (_, k) => k + 1).map(w => {
            const [m1, m2] = mine(w);
            const plan = MSL_PLAN.find(p => p.week === w);
            const icon = plan ? MSL_ICON[plan.label] ?? "MySL" : undefined;
            return (
              <div key={w} className={cn("grid grid-cols-[1fr_1fr_92px] border-b border-neutral-700 last:border-b-0", w === s.week && s.phase !== "offseason" && "outline outline-2 outline-white -outline-offset-2")}>
                <Cell m={m1} />
                <Cell m={m2} />
                <div className="h-9 flex items-center gap-1 px-1 border-l border-[#8fe07a]/60">
                  {icon && <LegacyImg dir="로고" name={icon} className="h-6 w-7 object-contain" fallback={null} />}
                  <span className="text-[10.5px] truncate">{plan?.label ?? ""}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-neutral-500 text-center mt-2">주마다 프로리그 2경기와 개인리그 일정이 차례로 진행됩니다 · 흰 테두리 = 이번 주</div>
      </div>
    </LegacyFrame>
  );
}
