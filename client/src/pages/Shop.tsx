/**
 * 아이템 상점 (원작 화면 방식): 소모품 (1) · 마우스 (2) · 키보드 (3) · 모니터 (4) · 기타 (5) · 포션 (6) · 구입 (B)
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ITEMS, ITEM_CATS, POTION_LIMIT, SLOT_NAMES, itemImg, slotOf, type ItemCat, type ItemDef, type EquipSlot } from "@shared/career/items";
import { totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { rosterOf } from "@shared/career/view";
import { useCareer, useCareerPatch } from "@/lib/career";
import { LegacyFrame, LegacyImg } from "@/components/legacy/Legacy";
import { PlayerPanel } from "@/components/legacy/LegacyMatch";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;

export function ItemIcon({ item, size = 44, className }: { item: ItemDef; size?: number; className?: string }) {
  const { dir, name } = itemImg(item);
  return (
    <div className={cn("bg-white flex items-center justify-center overflow-hidden shrink-0", className)} style={{ width: size, height: size }}>
      <LegacyImg dir={dir} name={name} className="max-w-full max-h-full object-contain" fallback={<span className="text-[9px] text-black text-center leading-tight px-0.5">{item.name}</span>} />
    </div>
  );
}

function useText(item: ItemDef) {
  return item.kind === "equip" ? `${item.uses} 경기` : item.kind === "match" ? "1 경기" : item.kind === "stock" ? "경기 전 선수에게 (엔트리 화면)" : "즉시 사용";
}

function Detail({ item, s }: { item: ItemDef; s: CareerState }) {
  const owned = s.inventory?.[item.key] ?? 0;
  return (
    <div className="border border-neutral-600 p-2.5 flex gap-3">
      <ItemIcon item={item} size={74} />
      <div className="flex-1 min-w-0 text-[12px] leading-[1.5]">
        <div className="text-[15px] text-[#ffe45c]">{item.name}</div>
        <div className="text-neutral-300">{item.desc[0]}<br />{item.desc[1]}</div>
        <div className="text-[#bff5c6] mt-0.5">{item.effect.map((e, i) => <div key={i}>{e}</div>)}</div>
        <div className="flex justify-between text-neutral-400 mt-0.5">
          <span>사용 : {useText(item)}</span>
          {(item.kind === "match" || item.kind === "stock") && <span>보유 {owned}개</span>}
        </div>
      </div>
    </div>
  );
}

/** 선수 목록: 장비·포션 사용 현황 */
function TargetList({ s, item, sel, onSel }: { s: CareerState; item: ItemDef; sel?: number; onSel: (id: number) => void }) {
  const slot = slotOf(item);
  const players = useMemo(() => rosterOf(s, s.myTeam).sort((a, b) => totalOf(b.stats) - totalOf(a.stats)), [s]);
  const right = (p: CPlayer) => {
    if (slot) { const e = p.equip?.[slot]; return e ? `${ITEMS.find(i => i.key === e.key)?.name ?? ""} (${e.left})` : "-"; }
    if (item.kind === "potion") return `포션 ${p.potions ?? 0}/${POTION_LIMIT}`;
    return `컨디션 ${p.cond * 10}%`;
  };
  return (
    <div className="border-2 border-neutral-300 p-0.5 max-h-[230px] overflow-y-auto">
      {players.map(p => (
        <button key={p.id} onClick={() => onSel(p.id)}
          className={cn("w-full flex items-center gap-1 text-[12.5px] px-1 py-[5px] text-left border-b border-neutral-800 last:border-b-0", sel === p.id ? "bg-[#3a3a5a] text-[#ffe45c]" : "text-white")}>
          <span className="truncate flex-1">{p.name} ({R[p.race]})</span>
          <span className="text-[10.5px] text-neutral-400 truncate max-w-[55%]">{right(p)}</span>
        </button>
      ))}
    </div>
  );
}

function ShopScreen({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [cat, setCat] = useState<ItemCat>("소모품");
  const list = ITEMS.filter(i => i.cat === cat && !i.notForSale);
  const [key, setKey] = useState(list[0].key);
  const item = ITEMS.find(i => i.key === key) ?? list[0];
  const [target, setTarget] = useState<number | undefined>();
  const [msg, setMsg] = useState<{ text: string; ok: boolean; delta?: Partial<Record<string, number>> } | null>(null);
  const stackable = item.kind === "match" || item.kind === "stock";
  const needsTarget = !stackable;
  const [qty, setQty] = useState(1);
  const patch = useCareerPatch();
  const buy = trpc.career.buyItem.useMutation({
    onSuccess: r => {
      patch(r.diff);
      const res = r.result as { message: string; delta?: Record<string, number> };
      setMsg({ text: res.message, ok: true, delta: res.delta });
    },
    onError: e => setMsg({ text: e.message, ok: false }),
  });
  const canBuy = !buy.isPending && (!needsTarget || target !== undefined);
  const doBuy = () => canBuy && buy.mutate({ key: item.key, target: needsTarget ? target : undefined, qty: stackable ? qty : undefined });

  // 원작 단축키: 1~6 분류, B 구입
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 6) { const c = ITEM_CATS[n - 1]; setCat(c); setKey(ITEMS.find(i => i.cat === c && !i.notForSale)!.key); setMsg(null); }
      if (e.key === "b" || e.key === "B") doBuy();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const deltaText = msg?.delta ? Object.entries(msg.delta).filter(([, v]) => v).map(([k, v]) => `${STAT_LABELS[k as StatKey]} ${v! > 0 ? "+" : ""}${v}`).join(", ") : "";

  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/lobby")} onNext={doBuy} nextDisabled={!canBuy} nextLabel={buy.isPending ? "구입 중..." : "구입 (B)"}>
      <div className="px-3 pt-2 pb-4 space-y-2">
        <div className="text-center text-[16px] tracking-[0.3em] text-neutral-100">아이템 상점</div>
        <div className="grid grid-cols-3 gap-1">
          {ITEM_CATS.map((c, i) => (
            <button key={c} onClick={() => { setCat(c); setKey(ITEMS.find(x => x.cat === c && !x.notForSale)!.key); setMsg(null); }}
              className={cn("text-[12px] py-1 border", cat === c ? "text-black border-white" : "text-neutral-200 border-neutral-600")}
              style={cat === c ? { background: "linear-gradient(#ffffff,#cfcfcf)" } : undefined}>
              {c} ({i + 1})
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 min-[480px]:grid-cols-6 gap-1.5">
          {list.map(it => (
            <button key={it.key} onClick={() => { setKey(it.key); setMsg(null); setQty(1); }} className={cn("flex flex-col items-center gap-0.5 p-1 border", key === it.key ? "border-[#ff6b6b] border-2" : "border-neutral-700")}>
              <ItemIcon item={it} size={48} />
              <span className="text-[10px] text-neutral-200 truncate w-full text-center">{it.name}</span>
              <span className="text-[9.5px] text-[#ffe45c]">{it.price.toLocaleString()}만</span>
              {(it.kind === "match" || it.kind === "stock") && (s.inventory?.[it.key] ?? 0) > 0 && <span className="text-[9px] text-[#bff5c6]">보유 {s.inventory![it.key]}</span>}
            </button>
          ))}
        </div>
        <Detail item={item} s={s} />
        <div className="grid grid-cols-2 gap-1 text-[12px]">
          <div className="flex justify-between border border-neutral-600 px-2 py-1"><span className="text-neutral-400">보유 금액 :</span><span className="text-[#ffe45c]">{s.teams[s.myTeam].money.toLocaleString()} 만원</span></div>
          <div className="flex justify-between border border-neutral-600 px-2 py-1"><span className="text-neutral-400">구매 가격 :</span><span className="text-[#ffb8c8]">{(item.price * (stackable ? qty : 1)).toLocaleString()} 만원</span></div>
        </div>
        {msg && (
          <div className={cn("border px-2 py-1.5 text-center text-[13px]", msg.ok ? "border-[#8fe07a] text-[#bff5c6]" : "border-[#ff6b6b] text-[#ffb8c8]")}>
            {msg.text}{deltaText && <div className="text-[11px] text-neutral-300 mt-0.5">{deltaText}</div>}
          </div>
        )}
        {stackable && (
          <div className="flex items-center justify-between border border-neutral-600 px-2 py-1.5 text-[12.5px]">
            <span className="text-neutral-400">구입 수량</span>
            <div className="flex items-center gap-1">
              {[-5, -1].map(d => <button key={d} onClick={() => setQty(q => Math.max(1, q + d))} className="border border-neutral-600 px-2">{d}</button>)}
              <span className="w-10 text-center text-[#ffe45c] text-[15px]">{qty}</span>
              {[1, 5].map(d => <button key={d} onClick={() => setQty(q => Math.min(99, q + d))} className="border border-neutral-600 px-2">+{d}</button>)}
            </div>
          </div>
        )}
        {needsTarget ? (
          <>
            <div className="text-center text-[12px] text-neutral-300">{item.kind === "equip" ? `선수를 선택하세요 · ${SLOT_NAMES[slotOf(item) as EquipSlot]} 칸에 장착` : "대상을 선택해 주세요"}</div>
            <PlayerPanel p={target !== undefined ? s.players[target] : undefined} color="#8fd0ff" empty="아이템을 쓸 선수를 고르세요" />
            <TargetList s={s} item={item} sel={target} onSel={setTarget} />
          </>
        ) : (
          <div className="text-center text-[11px] text-neutral-400">경기 아이템은 엔트리 편성 때 세트마다 하나씩 쓸 수 있습니다<br />비타비타는 사 두었다가 엔트리 화면에서 선수에게 먹입니다 (컨디션 +3)<br />치어풀은 팔지 않습니다 — 선수 행동 "이벤트"(팬미팅)에서 인기가 많은 선수일수록 잘 받아옵니다 (보유 {s.inventory?.cheer ?? 0}개)</div>
        )}
      </div>
    </LegacyFrame>
  );
}

export default function Shop() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  return <ShopScreen s={s} />;
}
