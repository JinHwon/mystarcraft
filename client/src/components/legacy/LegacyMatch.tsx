/**
 * 원작식 경기 화면: 맵 추첨 결과 → 엔트리 편성 → (세트마다) 경기 전 화면 → 중계 화면 → … (2:2 면 ACE 결정전 엔트리) → 결과
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { COND_MAX, FINAL_SETS, MATCH_MONEY, MSL_PLAN, PRO_SETS, condMultiplier, totalOf, type CareerState, type CMatch, type CPlayer, type MslGroup, type MslSeries, type PlayerFx, type SetResult, type SetTimeline } from "@shared/career/rules";
import { STAGE_NAMES, headToHead, mapView, rosterOf } from "@shared/career/view";
import { ITEMS, ITEM_BY_KEY, SLOT_NAMES, gearCond, gearStats, itemImg, type EquipSlot } from "@shared/career/items";
import { trpc } from "@/lib/trpc";
import { useCareerPatch } from "@/lib/career";
import { GrayBox, LEGACY_FONT, LegacyFrame, LegacyImg, LegacyRadar, MapImage, MapInfo, PlayerPhoto, TeamLogo } from "./Legacy";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
const nameRace = (p?: CPlayer) => (p ? `${p.name} (${R[p.race]})` : "");
const LEFT_COLOR = "#bff5c6";
const MATCH_ITEMS = ITEMS.filter(i => i.kind === "match");
/** 엔트리에서 상점으로 (편성 내용은 유지되지 않음) */
const navigateShop = () => { window.location.href = "/shop"; };
const RIGHT_COLOR = "#ffb8c8";

/** 경기 전 비타비타 먹이기 (사 둔 것을 사용, 컨디션 +3) */
function VitaButton({ s, pid }: { s: CareerState; pid: number }) {
  const patch = useCareerPatch();
  const [msg, setMsg] = useState<string | null>(null);
  const use = trpc.career.useItem.useMutation({
    onSuccess: r => {
      patch(r.diff);
      const p = r.diff.items.players?.find(([i]) => i === pid)?.[1] as CPlayer | undefined;
      setMsg(`${s.players[pid].name} 컨디션 ${(p?.cond ?? s.players[pid].cond) * 10}%`);
    },
    onError: e => setMsg(e.message),
  });
  useEffect(() => setMsg(null), [pid]);
  const have = s.inventory?.vitavita ?? 0;
  const p = s.players[pid];
  const full = p.cond >= COND_MAX;
  return (
    <div className="flex items-center justify-between gap-2 mt-1.5 border border-neutral-600 px-2 py-1 text-[12px]">
      <span className="text-neutral-300 truncate">🥤 {msg ? `${msg} · 남은 ${have}개` : `비타비타 보유 ${have}개`}</span>
      {have > 0 ? (
        <button disabled={use.isPending || full} onClick={() => use.mutate({ key: "vitavita", target: pid })}
          className={cn("shrink-0 border px-2 py-0.5", full ? "border-neutral-700 text-neutral-500" : "border-[#8fe07a] text-[#bff5c6]")}>
          {full ? "컨디션 최대" : use.isPending ? "먹이는 중..." : `${p.name}에게 먹이기`}
        </button>
      ) : (
        <button onClick={navigateShop} className="shrink-0 border border-neutral-600 px-2 py-0.5 text-neutral-300">상점에서 사기</button>
      )}
    </div>
  );
}

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
            className={cn("relative border flex items-center justify-center overflow-hidden", it ? "bg-white border-neutral-300" : "border-neutral-700 border-dashed")} style={{ width: size, height: size }}>
            {it && <LegacyImg dir={itemImg(it).dir} name={itemImg(it).name} className="max-w-full max-h-full object-contain" fallback={<span className="text-[7px] text-black">{it.name.slice(0, 2)}</span>} />}
            {it && <span className="absolute bottom-0 right-0 bg-black/80 text-[#ffe45c] text-[8px] leading-none px-[2px] py-[1px]">{e!.left}</span>}
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
        <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={50} />
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

  // 세트를 옮기면 (맵·Tab) 그 세트에 넣어 둔 선수를 위에 보여줌
  useEffect(() => { const id = filled[slot]; if (id !== undefined) setViewMine(id); }, [slot]);

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
        {viewMine !== undefined && <VitaButton s={s} pid={viewMine} />}

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
                  <GrayBox onClick={() => { if (isAce) return; setSlot(i); if (p) setViewMine(p.id); }}>{mapView(mapOf(i)).name}</GrayBox>
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
              <PlayerPhoto id={lp.photoOf ?? lp.id} name={lp.name} size={56} />
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
            {done && <SetFxBox s={s} set={set} lp={lp} rp={rp} leftIsA={leftIsA} />}
          </div>
          <div className="flex flex-col items-center justify-between">
            <div className="flex flex-col items-center">
              <PlayerPhoto id={rp.photoOf ?? rp.id} name={rp.name} size={56} />
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

/** 세트가 끝난 뒤 두 선수의 컨디션·경험치·능력치 변화와 세레모니 보너스 */
function SetFxBox({ s, set, lp, rp, leftIsA }: { s: CareerState; set: BroadcastSet; lp: CPlayer; rp: CPlayer; leftIsA: boolean }) {
  if (!set.fx && !set.ceremony) return null;
  const row = (p: CPlayer, fx: PlayerFx | undefined, color: string) => fx && (
    <div key={p.id} style={{ color }}>
      ▶ {p.name}: 컨디션 {fx.cond[0] * 10}% → {fx.cond[1] * 10}% · 경험치 +{fx.exp}
      {fx.level ? ` · 레벨 업! Lv.${fx.level}` : ""}
      {fx.stats && ` · ${Object.entries(fx.stats).map(([k, d]) => `${STAT_LABELS[k as StatKey]} ${d! > 0 ? "+" : ""}${d}`).join(", ")}`}
    </div>
  );
  const [fl, fr] = leftIsA ? [set.fx?.a, set.fx?.b] : [set.fx?.b, set.fx?.a];
  return (
    <div className="mt-2 pt-1.5 border-t border-neutral-600 space-y-0.5 text-[11px]">
      <div className="text-neutral-400">— 경기 결과 —</div>
      {row(lp, fl, LEFT_COLOR)}
      {row(rp, fr, RIGHT_COLOR)}
      {set.ceremony && <div className="text-[#ffe45c]">🎉 세레모니! 소지금 +{set.ceremony}만원 · 우리 선수 전원 컨디션 +1 (현재 {s.teams[s.myTeam].money.toLocaleString()}만원)</div>}
    </div>
  );
}

// ── 경기 전 화면 조각 ──────────────────────────────────────────────
function PlayerCard({ p, opp }: { p: CPlayer; opp: CPlayer }) {
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
        <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={58} />
      </div>
      <div className="text-[12px] text-white mt-0.5">{nameRace(p)}</div>
      {open && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-6" onClick={() => setOpen(false)} style={LEGACY_FONT}>
          <div className="bg-black border-2 border-neutral-300 w-full max-w-[300px] p-3 text-white text-[13px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} size={46} />
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

function SetList({ s, left, right, maps, total, idx, results, leftIsA, showAce, onView, view }: {
  s: CareerState; left: number[]; right: number[]; maps: number[]; total: number; idx: number; results: BroadcastSet[]; leftIsA: boolean; showAce: boolean;
  /** 이미 치른 세트(또는 지금 세트)의 맵을 누르면 그 세트 선수를 보여줌 */
  onView?: (i: number) => void;
  view?: number;
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
            <GrayBox onClick={onView && (r || i === idx) ? () => onView(i) : undefined} active={view === i}>{mapView(maps[i % maps.length]).name}</GrayBox>
            <div className="text-center truncate">{cell(rp, leftWon === undefined ? undefined : !leftWon, hideR)}</div>
          </div>
        );
      })}
    </div>
  );
}

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
                  <LegacyRadar stats={condStats(p)} base={p.stats} level={p.level} size={112} />
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
                {[{ p: lp, o: rp }, { p: rp, o: lp }].map(({ p, o }) => (
                  <div key={p.id} className="flex flex-col items-center">
                    <PlayerCard p={p} opp={o} />
                    <div className="mt-0.5"><EquipRow p={p} size={20} /></div>
                    <LegacyRadar stats={condStats(p)} base={p.stats} level={p.level} size={112} />
                    <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p) * 10} %</div>
                    {p.team === s.myTeam && info.items?.[i] && <div className="text-[11px] text-[#ffe45c]">아이템 : {ITEM_BY_KEY[info.items[i].key]?.name} (보유 {s.inventory?.[info.items[i].key] ?? 0}개)</div>}
                  </div>
                ))}
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
function SeriesBoard({ s, report, played, leftIsA, onNext, onClose, nextLabel }: {
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
function DualGroupScreen({ s, stage, group, reports, onDone, onClose }: {
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
                  <div className="text-[10px] text-neutral-400">{`Lv.${p.level} · 컨디션 ${gearCond(p) * 10}%`}</div>
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

type MslStep = { kind: "series"; r: MslReportView } | { kind: "group"; stage: string; name: string; reports: MslReportView[] } | { kind: "plan"; planIdx: number };

/** 이번 시즌 듀얼·32강 조 (항상 최신 세이브에서 찾음) */
const groupOf = (s: CareerState, stage: string, name: string) => {
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
              <LegacyRadar stats={condStats(p)} base={p.stats} level={p.level} size={112} />
              <div className="text-[12px] -mt-1">Condition&nbsp;&nbsp;{gearCond(p) * 10} %</div>
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

const MSL_ICON: Record<string, string> = { "PC방 예선전": "PC방", 듀얼토너먼트: "DT" };
/** 일정표에 들어갈 짧은 이름 */
function mslShort(k: number) {
  const p = MSL_PLAN[k];
  const nth = MSL_PLAN.filter(x => x.stage === p.stage).length > 1 ? ` ${p.part + 1}차` : "";
  return p.stage === "pc" ? "PC방 예선" : p.stage === "dual" ? `듀얼${nth}` : p.stage === "nom" ? "조지명식" : `${p.label}${nth}`;
}

function SeriesRow({ s, x }: { s: CareerState; x: MslSeries }) {
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

function GroupCard({ s, g }: { s: CareerState; g: MslGroup }) {
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
function pcSummary(s: CareerState, games: MslSeries[], qualifiers: number[]) {
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
