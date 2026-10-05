/**
 * 경기 화면 공용 조각: 선수 정보 칸, 장비 줄, 컨디션 반영 능력치, 배속, 비타비타
 */
import { useEffect, useState } from "react";
import { navigate } from "wouter/use-browser-location";
import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { COND_MAX, burstLabel, burstOf, difficultyOf, slumpOn, condMultiplier, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { ITEMS, ITEM_BY_KEY, SLOT_NAMES, gearCond, gearStats, matchCond, itemImg, setItemExtra, type EquipSlot, type StatExtra } from "@shared/career/items";
import { trpc } from "@/lib/trpc";
import { useCareerPatch } from "@/lib/career";
import { LegacyImg, LegacyRadar, PlayerPhoto } from "../Legacy";

export const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
export const nameRace = (p?: CPlayer) => (p ? `${p.name} (${R[p.race]})` : "");
export const LEFT_COLOR = "#bff5c6";
export const MATCH_ITEMS = ITEMS.filter(i => i.kind === "match");
// ── 엔트리 편성 ↔ 상점 ─────────────────────────────────────────────
/** 상점에서 돌아오면 엔트리 편성 화면을 다시 연다는 표시 */
const ENTRY_RETURN = "mysc-entry-return";
/** 편성 중이던 엔트리·아이템 (상점에 다녀와도 유지) */
const ENTRY_DRAFT = "mysc-entry-draft";
export type EntryDraft = { matchId: number; front: Array<number | null>; items: Record<number, { key: string; predict?: number }> };

export function saveEntryDraft(d: EntryDraft) {
  try { sessionStorage.setItem(ENTRY_DRAFT, JSON.stringify(d)); } catch { /* 저장 불가여도 진행 */ }
}
/** 상점에서 돌아온 경우에만 그 경기의 편성 내용을 돌려준다 (한 번 쓰면 표시는 지움) */
export function takeEntryReturn(matchId: number | undefined): EntryDraft | null {
  try {
    const at = Number(sessionStorage.getItem(ENTRY_RETURN) ?? 0);
    sessionStorage.removeItem(ENTRY_RETURN);
    // 상점에 간 지 오래됐으면 (다른 화면을 돌다 온 경우) 엔트리를 다시 열지 않음
    if (!at || Date.now() - at > 30 * 60_000) return null;
    const d = JSON.parse(sessionStorage.getItem(ENTRY_DRAFT) ?? "null") as EntryDraft | null;
    return d && d.matchId === matchId ? d : { matchId: matchId ?? -1, front: [], items: {} };
  } catch { return null; }
}
/** 엔트리에서 상점으로 (돌아오면 편성하던 엔트리 화면으로) */
export const navigateShop = () => {
  try { sessionStorage.setItem(ENTRY_RETURN, String(Date.now())); } catch { /* 무시 */ }
  navigate("/shop?from=entry");
};
export const RIGHT_COLOR = "#ffb8c8";

/** 경기 전 비타비타 먹이기 (사 둔 것을 사용, 컨디션 +3) */
export function VitaButton({ s, pid, compact }: { s: CareerState; pid: number;
  /** 엔트리 화면 맵 옆 작은 상자 */
  compact?: boolean }) {
  const patch = useCareerPatch();
  const [msg, setMsg] = useState<string | null>(null);
  const use = trpc.career.useItem.useMutation({
    onSuccess: r => {
      patch(r.diff);
      const p = r.diff.items.players?.find(([i]) => i === pid)?.[1] as CPlayer | undefined;
      const used = (r.result as { used?: number } | undefined)?.used ?? 1;
      setMsg(`${s.players[pid].name}${used > 1 ? ` ${used}개` : ""} → 컨디션 ${p?.cond ?? s.players[pid].cond}%`);
    },
    onError: e => setMsg(e.message),
  });
  useEffect(() => setMsg(null), [pid]);
  const have = s.inventory?.vitavita ?? 0;
  const p = s.players[pid];
  const full = p.cond >= COND_MAX;
  // 컨디션 전체 회복에 필요한 개수 (모자라면 가진 만큼)
  const per = ITEM_BY_KEY.vitavita.cond ?? 3;
  const need = Math.ceil((COND_MAX - p.cond) / per);
  // 고급 난이도: 경기 전 선수 한 명당 제한
  const limit = difficultyOf(s).vitaPerMatch;
  const left = limit === undefined ? Infinity : Math.max(0, limit - (p.vitaUsed ?? 0));
  const n = Math.min(need, have, left);
  const blocked = left <= 0;
  // 다른 컨디션 회복 소모품 (미니 비타 · 비타비타 골드): 가진 것만
  const extras = ITEMS.filter(it => it.kind === "stock" && it.key !== "vitavita" && (s.inventory?.[it.key] ?? 0) > 0);
  if (compact) {
    const dis = use.isPending || full || blocked;
    return (
      <div className="w-[104px] border border-neutral-600 px-1 py-0.5 text-[10px] space-y-0.5 leading-tight">
        <div className="text-neutral-300 truncate" title={msg ?? undefined}>🥤 {p.name} {msg ? `→ ${p.cond}%` : ""}</div>
        <div className="text-neutral-400">비타비타 {have}개</div>
        {have > 0 ? (
          <>
            <button disabled={dis} onClick={() => use.mutate({ key: "vitavita", target: pid })} className={cn("w-full border py-[1px]", dis ? "border-neutral-700 text-neutral-500" : "border-[#8fe07a] text-[#bff5c6]")}>
              {full ? "컨디션 최대" : blocked ? "다음 경기 뒤" : "1개 먹이기"}
            </button>
            {!full && n > 1 && <button disabled={use.isPending} onClick={() => use.mutate({ key: "vitavita", target: pid, qty: n })} className="w-full border border-[#ffe45c] text-[#ffe45c] py-[1px]">전체 회복 {n}개</button>}
          </>
        ) : <button onClick={navigateShop} className="w-full border border-neutral-600 py-[1px] text-neutral-300">상점에서 사기</button>}
        {extras.map(it => (
          <button key={it.key} disabled={dis} onClick={() => use.mutate({ key: it.key, target: pid })} className={cn("w-full border py-[1px] truncate", dis ? "border-neutral-700 text-neutral-500" : "border-[#8fd0ff] text-[#cfe9ff]")}>
            {it.name} +{it.cond} ({s.inventory![it.key]})
          </button>
        ))}
      </div>
    );
  }
  return (
    <>
    <div className="flex items-center justify-between gap-1.5 mt-1.5 border border-neutral-600 px-2 py-1 text-[12px]">
      <span className="text-neutral-300 truncate">🥤 {msg ? `${msg} · 남은 ${have}개` : `비타비타 보유 ${have}개`}</span>
      {have > 0 ? (
        <span className="flex gap-1 shrink-0">
          <button disabled={use.isPending || full || blocked} onClick={() => use.mutate({ key: "vitavita", target: pid })}
            className={cn("border px-2 py-0.5", full || blocked ? "border-neutral-700 text-neutral-500" : "border-[#8fe07a] text-[#bff5c6]")}>
            {full ? "컨디션 최대" : blocked ? `다음 경기 뒤 (${difficultyOf(s).name}: 경기 전 ${limit}개)` : use.isPending ? "먹이는 중..." : "1개 먹이기"}
          </button>
          {!full && n > 1 && (
            <button disabled={use.isPending} onClick={() => use.mutate({ key: "vitavita", target: pid, qty: n })}
              className="border border-[#ffe45c] text-[#ffe45c] px-2 py-0.5">
              컨디션 전체 회복 ({n}개{n < need ? `, ${Math.min(COND_MAX, p.cond + n * per)}%까지` : ""})
            </button>
          )}
        </span>
      ) : (
        <button onClick={navigateShop} className="shrink-0 border border-neutral-600 px-2 py-0.5 text-neutral-300">상점에서 사기</button>
      )}
    </div>
    {extras.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-1 text-[11.5px]">
        {extras.map(it => (
          <button key={it.key} disabled={use.isPending || full || blocked} onClick={() => use.mutate({ key: it.key, target: pid })}
            className={cn("border px-2 py-0.5", full || blocked ? "border-neutral-700 text-neutral-500" : "border-[#8fd0ff] text-[#cfe9ff]")}>
            {it.name} (+{it.cond}) · {s.inventory![it.key]}개 · 1개 먹이기
          </button>
        ))}
      </div>
    )}
    </>
  );
}

/**
 * 컨디션(+장비, 이번 주 포텐셜 폭발)이 반영된 능력치
 * extra: 그 세트에만 붙는 능력치 추가 (치어풀·작전 메모) — 서버 core.ts effStats 와 같은 계산
 */
export function condStats(p: CPlayer, s?: { season: number; week: number }, extra: StatExtra = 0): Record<StatKey, number> {
  const g = gearStats(p, extra);
  // 컨디션 난조면 그 주 경기 컨디션 -40 (최저 10)
  const k = condMultiplier(s ? matchCond(p, s) : gearCond(p)) * ((s && burstOf(s, p)) || 1);
  return Object.fromEntries(STAT_KEYS.map(s => [s, Math.round(g[s] * k)])) as Record<StatKey, number>;
}

/** 그 세트에 쓴(쓸) 경기 아이템의 능력치 추가량과 설명 (치어풀: 모든 능력치 +75 · 작전 메모: 센스 +100, 전략 +60) */
export function setItemBoost(key: string | undefined): { extra: Partial<Record<StatKey, number>>; text: string } {
  const extra = setItemExtra(key);
  const it = key ? ITEM_BY_KEY[key] : undefined;
  if (!it || !Object.keys(extra).length) return { extra, text: "" };
  const text = it.all ? `모든 능력치 +${it.all}` : Object.entries(extra).map(([k, v]) => `${STAT_LABELS[k as StatKey]} +${v}`).join(", ");
  return { extra, text };
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
export type Speed = 1 | 4 | 8;
export const SPEED_KEY = "mysc-speed";
export function useSpeed(): [Speed, (s: Speed) => void] {
  const [speed, setSpeed] = useState<Speed>(() => {
    try { const v = Number(localStorage.getItem(SPEED_KEY)); return v === 4 || v === 8 ? v : 1; } catch { return 1; }
  });
  const set = (v: Speed) => { setSpeed(v); try { localStorage.setItem(SPEED_KEY, String(v)); } catch { /* 저장 불가여도 이번 경기 동안은 유지 */ } };
  return [speed, set];
}

// ── 선수 정보 칸 (사진 + 컨디션 반영 능력치) ─────────────────────────────
export function PlayerPanel({ p, color, empty, s, compact }: { p?: CPlayer; color: string; empty: string; s?: CareerState;
  /** 좁은 화면용: 장비 칸을 사진 밑에 작게, 범례 줄 생략 */
  compact?: boolean }) {
  if (!p) {
    return <div className="h-full min-h-[190px] border border-neutral-700 flex items-center justify-center text-[11px] text-neutral-500 text-center px-2">{empty}</div>;
  }
  const cs = condStats(p, s);
  const burst = s ? burstOf(s, p) : undefined;
  const slump = !!s && slumpOn(s, p);
  const mc = s ? matchCond(p, s) : gearCond(p);
  return (
    <div className="border border-neutral-700 px-1.5 pt-1.5 pb-1 flex flex-col items-center">
      <div className="flex items-start gap-2 w-full justify-center">
        {compact ? (
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={50} />
            <EquipRow p={p} size={11} />
          </div>
        ) : <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={50} />}
        <div className="text-[11px] leading-[1.45] text-neutral-200 pt-0.5">
          <div className="text-[13px] font-bold" style={{ color }}>{p.name}</div>
          <div>{R[p.race]} · Lv.{p.level}</div>
          <div>Condition <b className={mc >= 70 ? "text-[#bff5c6]" : mc <= 30 ? "text-[#ff9a9a]" : "text-white"}>{mc}%</b>{slump ? <span className="text-[9px] text-[#8fb8ff]"> (난조 -40)</span> : gearCond(p) !== p.cond && <span className="text-[9px] text-neutral-500"> (장비)</span>}</div>
          <div className="text-neutral-400">원래 {totalOf(p.stats).toLocaleString()}{totalOf(gearStats(p)) !== totalOf(p.stats) ? <span className="text-[#8fd0ff]"> +장비 {(totalOf(gearStats(p)) - totalOf(p.stats)).toLocaleString()}</span> : null} → 실전 <b className="text-[#ffe45c]">{totalOf(cs).toLocaleString()}</b></div>
          {burst && <div className="font-bold" style={{ color: burstLabel(burst).color }}>{burstLabel(burst).icon} {burstLabel(burst).name}! {Math.round(burst * 100)}%</div>}
          {slump && <div className="font-bold text-[#8fb8ff]">😵 컨디션 난조! (다음 경기 컨디션 -40)</div>}
        </div>
      </div>
      {!compact && <div className="mt-1"><EquipRow p={p} /></div>}
      <LegacyRadar stats={cs} base={p.stats} gear={gearStats(p)} level={p.level} size={92} />
      <div className={cn("text-[9px] text-neutral-500 -mt-1", compact && "hidden")}>회색 점선 = 원래 · 빨강 = 컨디션·장비{burst ? "·포텐셜" : ""}{slump ? "·난조" : ""} 반영</div>
    </div>
  );
}
