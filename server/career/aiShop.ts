/**
 * 다른 구단의 아이템 구입 (매주)
 * 구단 자금 중 이적 등에 쓸 몫을 남기고, 여유 자금 안에서 주전 선수들에게
 * 컨디션 아이템(비타비타) → 장비(빈 칸·다 닳아 가는 칸) → 부작용 없는 포션 순으로 사 준다.
 */
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import { COND_MAX, condMultiplier, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { ITEMS, ITEM_BY_KEY, gearCond, slotOf, type EquipSlot } from "@shared/career/items";
import { rosterOf } from "@shared/career/view";
import { STAT_KEYS } from "@shared/gameConstants";
import { clampCond, clampStat, rand, randInt } from "./core";

/** AI 구단은 시즌마다 선수 한 명당 포션을 이 정도만 (사용자는 제한 없음) */
const AI_POTION_LIMIT = 3;

/** 이만큼은 남겨 둠 (이적 자금) */
const AI_RESERVE = 1500;
/** 한 주에 여유 자금 중 쓰는 비율 */
const WEEKLY_SHARE = 0.35;
const SLOTS: EquipSlot[] = ["mouse", "keyboard", "monitor", "etc"];
const EQUIPS = ITEMS.filter(i => i.kind === "equip" && !i.notForSale);

export function aiShopping(s: CareerState) {
  for (const t of s.teams) {
    if (t.id === s.myTeam || t.id === FREE_AGENT_TEAM) continue;
    let budget = Math.floor(Math.max(0, t.money - AI_RESERVE) * WEEKLY_SHARE);
    if (budget < 40) continue;
    const spend = (n: number) => { t.money -= n; budget -= n; };
    // 주전 (컨디션 반영 능력치 순 6명)
    const core = rosterOf(s, t.id)
      .map(p => ({ p, v: totalOf(p.stats) * condMultiplier(p.cond) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 6)
      .map(x => x.p);

    // 1) 컨디션: 지친 주전에게 비타비타 (+3)
    const vita = ITEM_BY_KEY.vitavita;
    // 이번 주 예산의 40%까지 (나머지는 장비·포션)
    let condBudget = budget * 0.4;
    for (const p of core) {
      while (gearCond(p) < 70 && p.cond < COND_MAX && condBudget >= vita.price) {
        spend(vita.price);
        condBudget -= vita.price;
        p.cond = clampCond(p.cond + (vita.cond ?? 3));
      }
    }

    // 2) 장비: 빈 칸이나 거의 닳은 칸에 살 수 있는 좋은 장비 (한 번에 남은 예산의 60%까지)
    for (const p of core.slice(0, 5)) {
      for (const slot of SLOTS) {
        const cur = p.equip?.[slot];
        if (cur && cur.left > 2) continue;
        const cap = budget * 0.6;
        const options = EQUIPS.filter(i => slotOf(i) === slot && i.price <= cap && i.key !== cur?.key && !(i.cond && i.cond < 0 && gearCond(p) < 70));
        if (!options.length) continue;
        // 비싼(좋은) 것 위주, 가끔 한 단계 아래
        options.sort((a, b) => b.price - a.price);
        const it = options[options.length > 1 && rand() < 0.3 ? 1 : 0];
        spend(it.price);
        p.equip = { ...p.equip, [slot]: { key: it.key, left: it.uses ?? 20 } };
      }
    }

    // 3) 포션: 여유가 많으면 매직무지개 포션 (전체 능력치 +1~8, 컨디션 -3)
    const magic = ITEM_BY_KEY.p_spc;
    const po = magic.potion!;
    for (const p of core) {
      if (budget < magic.price * 2 || (p.potions ?? 0) >= AI_POTION_LIMIT || gearCond(p) < 60 || rand() > 0.35) continue;
      spend(magic.price);
      p.potions = (p.potions ?? 0) + 1;
      p.cond = clampCond(p.cond - po.condCost);
      for (const k of STAT_KEYS) p.stats[k] = clampStat(p.stats[k] + randInt(po.min, po.max));
    }
  }
}

/** 테스트용: 선수 장비 칸 수 */
export const equippedCount = (p: CPlayer) => SLOTS.filter(k => p.equip?.[k]).length;
