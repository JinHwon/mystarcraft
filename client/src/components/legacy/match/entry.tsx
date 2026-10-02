/**
 * 경기 전: 맵 추첨 결과, 엔트리 편성, ACE 결정전 엔트리
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { burstLabel, burstOf, slumpOn, matchFormatName, matchSets, totalOf, type CareerState, type CMatch, type CPlayer } from "@shared/career/rules";
import { STAGE_NAMES, mapView, rosterOf } from "@shared/career/view";
import { ITEM_BY_KEY, gearCond, itemImg, matchCond } from "@shared/career/items";
import { GrayBox, LEGACY_FONT, LegacyFrame, LegacyImg, MapInfo, MslBadges, TeamLogo } from "../Legacy";
import { MATCH_ITEMS, PlayerPanel, R, VitaButton, condStats, nameRace, navigateShop } from "./common";

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
/** 맵에서 이 종족의 승률 (다른 두 종족 상대 평균, 50 = 균형) */
export function mapRaceRate(mapId: number, race: CPlayer["race"]) {
  const m = mapView(mapId);
  if (race === "terran") return (m.tvz + (100 - m.pvt)) / 2;
  if (race === "zerg") return (100 - m.tvz + m.zvp) / 2;
  return (100 - m.zvp + m.pvt) / 2;
}

/** 이 맵에서의 선수 기대 전력 (컨디션·포텐셜 반영 능력치 × 맵 종족 유불리) */
function mapFit(s: CareerState, p: CPlayer, mapId: number) {
  return totalOf(condStats(p, s)) * (1 + (mapRaceRate(mapId, p.race) - 50) * 0.015);
}

/**
 * 1~(n-1)세트 자동 편성
 * - recommend: 세트마다 그 맵에서 가장 유리한 선수 (종족 유불리·컨디션·포텐셜 폭발 반영)
 * - rotation: 이번 시즌 출전이 적은 선수부터 뽑아 맵에 맞게 배치
 */
export function autoEntry(s: CareerState, maps: number[], sets: number, mode: "recommend" | "rotation" = "recommend"): (number | undefined)[] {
  const n = sets - 1;
  let pool = rosterOf(s, s.myTeam);
  if (mode === "rotation") {
    pool = [...pool]
      .sort((a, b) => (a.sApps ?? 0) - (b.sApps ?? 0) || totalOf(condStats(b, s)) - totalOf(condStats(a, s)))
      .slice(0, n);
  }
  // 가장 잘 맞는 (세트, 선수) 짝부터 채움
  const out: number[] = Array(n).fill(-1);
  const used = new Set<number>();
  for (let k = 0; k < n; k++) {
    let best: { i: number; id: number; v: number } | undefined;
    for (let i = 0; i < n; i++) {
      if (out[i] !== -1) continue;
      for (const p of pool) {
        if (used.has(p.id)) continue;
        const v = mapFit(s, p, maps[i % maps.length]);
        if (!best || v > best.v) best = { i, id: p.id, v };
      }
    }
    if (!best) break;
    out[best.i] = best.id;
    used.add(best.id);
  }
  return out.map(x => (x === -1 ? undefined : x));
}

export function SideLabel({ lines, color }: { lines: [string, string]; color: string }) {
  return (
    <div className="text-center italic font-black leading-tight text-[12px] tracking-widest" style={{ color: "#fff", textShadow: `0 0 4px ${color}, 0 0 8px ${color}` }}>
      {lines[0]}<br />{lines[1]}
    </div>
  );
}

/** 선수 목록 (s 가 있으면 컨디션·실전 능력치·포텐셜 폭발 표시) */
export function RosterList({ players, onPick, selected, marks, s }: { players: CPlayer[]; onPick: (p: CPlayer) => void; selected?: number; marks?: Map<number, string>; s?: CareerState }) {
  return (
    <div className="border-2 border-neutral-300 p-0.5">
      {players.map(p => {
        const mark = marks?.get(p.id);
        return (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className={cn("w-full flex items-center gap-1 px-1 py-[5px] text-left border-b border-neutral-800 last:border-b-0", s ? "text-[12px]" : "text-[13px]",
              mark ? "text-[#ffe45c]" : "text-white", selected === p.id && "bg-[#3a3a5a]")}
          >
            <span className="truncate flex-1">{s && burstOf(s, p) ? burstLabel(burstOf(s, p)!).icon : ""}{s && slumpOn(s, p) ? "😵" : ""}{p.name}<MslBadges titles={p.titles} size={11} className="ml-0.5 align-middle" /></span>
            <span className="text-[11px] text-neutral-400">{mark ?? ""}</span>
            <span>({R[p.race]})</span>
            {s && (
              <span className="flex flex-col items-end leading-none shrink-0 w-[28px]">
                <span className={cn("text-[9.5px]", matchCond(p, s) >= 70 ? "text-[#bff5c6]" : matchCond(p, s) <= 30 ? "text-[#ff9a9a]" : "text-neutral-300")}>{matchCond(p, s)}%</span>
                <span className="text-[8.5px] text-neutral-400">{totalOf(condStats(p, s)).toLocaleString()}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type ItemPlan = Record<number, { key: string; predict?: number }>;

export function EntryScreen({ s, match, front, setFront, items, setItems, onSubmit, submitting, onBack }: {
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
  onShowMaps?: () => void;
  onBack: () => void;
}) {
  const sets = matchSets(match);
  // 위너스리그: 선봉 한 명만 (이긴 선수는 질 때까지 계속, 지면 다음 선수를 그때 고름)
  const winners = !!match.winners;
  const n = winners ? 1 : sets - 1;
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
  /** 위쪽 맵·선수 정보 (아이템 칸을 누르면 여기로 올려 그 세트의 맵과 선수를 보여줌) */
  const topRef = useRef<HTMLDivElement>(null);
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
            <div className="text-[10px] text-neutral-400 mt-0.5">{STAGE_NAMES[match.stage]}{match.stage === "regular" ? ` ${match.week}주차` : ""} · {matchFormatName(match)}</div>
          </div>
          <TeamLogo team={s.teams[oppId]} className="w-[70px] h-[40px]" />
        </div>

        <div ref={topRef} className="flex justify-center mt-2.5 scroll-mt-2">
          <MapInfo mapId={mapOf(slot)} size={54} hint={<span className="text-[9px] text-neutral-500">{slot + 1}세트 [↔Tab]</span>} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <PlayerPanel s={s} p={viewMine !== undefined ? s.players[viewMine] : undefined} color="#8fd0ff" empty="우리 선수를 누르면 사진과 능력치가 보입니다" />
          <PlayerPanel s={s} p={viewOpp !== undefined ? s.players[viewOpp] : undefined} color="#ff9a9a" empty="상대 선수를 누르면 사진과 컨디션이 보입니다" />
        </div>
        {viewMine !== undefined && <VitaButton s={s} pid={viewMine} />}

        <div className="grid grid-cols-[1fr_minmax(108px,0.9fr)_1fr] gap-1.5 mt-2.5 items-start">
          <div className="space-y-1">
            <LegacyImg dir="기타" name="아군" className="w-full max-h-16 object-contain" fallback={<SideLabel lines={["MY TEAM", "PLAYER"]} color="#3aa0ff" />} />
            <RosterList s={s} players={mine} onPick={assign} selected={viewMine} marks={marks} />
          </div>

          <div className="space-y-1.5">
            <div className="text-center text-[13px] text-neutral-100">&lt; V S &gt;</div>
            <div className="text-center text-[10px] text-[#ffe45c]">{winners ? "위너스리그 · 선봉을 고르세요" : `${slot + 1}세트 선수를 고르세요`}</div>
            {Array.from({ length: winners ? 1 : sets }, (_, i) => {
              const isAce = !winners && i === n;
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
                    <button onClick={() => { setSlot(i); if (p) setViewMine(p.id); setPickFor(i); topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }} className="w-full flex items-center justify-center gap-1 text-[10px] py-[2px] border border-dashed border-neutral-600 text-neutral-400">
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
            <div className="text-[9px] text-neutral-500 text-center leading-tight">{winners ? <>이긴 선수는 질 때까지 계속 출전<br />지면 그때 다음 선수를 고릅니다<br />(진 선수는 다시 못 나옴)</> : <>ACE 결정전은 2:2 가 되면<br />그때 선수를 고릅니다</>}</div>
            <div className="flex gap-1 pt-0.5">
              {([["recommend", "자동편성(추천)"], ["rotation", "자동편성(빈도낮음)"]] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => { const e = autoEntry(s, match.maps, sets, mode).slice(0, n); setFront(e); setSlot(0); setViewMine(e[0]); }}
                  className="flex-1 text-[10px] leading-tight border border-neutral-600 text-neutral-300 py-1.5">{label}</button>
              ))}
            </div>
            <div className="text-[8.5px] text-neutral-500 text-center leading-tight">추천: 맵 종족 유불리·컨디션 순<br />빈도낮음: 이번 시즌 출전이 적은 선수</div>
          </div>

          <div className="space-y-1">
            <LegacyImg dir="기타" name="적군" className="w-full max-h-16 object-contain" fallback={<SideLabel lines={["OTHER TEAM", "PLAYER"]} color="#ff3a3a" />} />
            <RosterList s={s} players={theirs} onPick={p => setViewOpp(p.id)} selected={viewOpp} />
          </div>
        </div>
      </div>
      {pickFor !== null && createPortal(
        <div className="fixed inset-0 app-fixed-x w-full z-[70] bg-black/40 flex items-end text-white" style={LEGACY_FONT} onClick={() => { setPickFor(null); setSnipeFor(null); }}>
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
export function AceScreen({ s, teamLeft, teamRight, mapId, score, onPick, submitting, next, out }: {
  s: CareerState; teamLeft: number; teamRight: number; mapId: number; score: [number, number];
  onPick: (id: number) => void; submitting: boolean;
  /** 위너스리그: 다음 세트 번호 (있으면 "다음 출전 선수" 화면) */
  next?: number;
  /** 위너스리그: 이번 경기에서 진 선수 (다시 못 나옴) */
  out?: Set<number>;
}) {
  const mine = useMemo(() => rosterOf(s, s.myTeam).filter(p => !out?.has(p.id)).sort((a, b) => totalOf(condStats(b)) - totalOf(condStats(a))), [s, out]);
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
          {next !== undefined ? (
            <>
              <div className="text-[16px] tracking-[0.2em] text-[#ffe45c] mt-1">◇ {next}세트 출전 선수 ◇</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">위너스리그 · 우리 선수가 졌습니다. 다음에 나갈 선수를 고르세요 (진 선수는 다시 못 나옴)</div>
            </>
          ) : (
            <>
              <LegacyImg dir="기타" name="ACE" className="mx-auto max-h-14" fallback={null} />
              <div className="text-[16px] tracking-[0.3em] text-[#ffe45c] mt-1">◇ ACE 결정전 ◇</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">마지막 세트에 나갈 선수를 고르세요 (누구나 출전 가능)</div>
            </>
          )}
        </div>
        <div className="flex justify-center mt-2.5"><MapInfo mapId={mapId} size={54} /></div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <PlayerPanel s={s} p={sel !== undefined ? s.players[sel] : undefined} color="#8fd0ff" empty="선수를 고르세요" />
          <div className="border border-neutral-700 flex flex-col items-center justify-center gap-2 min-h-[190px]">
            <span className="inline-block border border-neutral-300 px-3 py-1 text-[13px]">{next !== undefined ? "?" : "ACE Card"}</span>
            <span className="text-[10px] text-neutral-500">{next !== undefined ? "상대는 이긴 선수가 계속 나옵니다" : "상대 ACE 는 경기 시작 때 공개"}</span>
          </div>
        </div>
        <div className="mt-2.5">
          <RosterList s={s} players={mine} onPick={p => setSel(p.id)} selected={sel} marks={new Map(sel !== undefined ? [[sel, next !== undefined ? `${next}` : "ACE"]] : [])} />
        </div>
      </div>
    </LegacyFrame>
  );
}
