/**
 * 후원: 스폰서와 별개로 팬·기업이 보내는 선물. 매주 확률로 도착하고, 받기를 누르면 자금이나 소모품(한 종류 1~5개)이 들어온다
 */
import { OLD_REGULAR_WEEKS, regularWeeksOf, type CareerState, type Gift } from "@shared/career/rules";
import { ITEMS, ITEM_BY_KEY, stackMax } from "@shared/career/items";
import { standings } from "@shared/career/view";
import { CareerError, news, rand, randInt } from "./core";
import { pay } from "./club";

const DONORS = ["팬클럽 '불꽃응원단'", "익명의 팬", "모교 동문회", "지역 상인회", "PC방 연합회", "게임 커뮤니티 회원들", "해외 팬카페", "선수 가족 모임", "e스포츠 협회", "동네 치킨집 사장님"];
/** 도착해서 쌓여 있을 수 있는 후원 수 */
export const MAX_GIFTS = 3;

/** 후원으로 오는 소모품 (값이 쌀수록 자주) */
function pickItem(): string {
  const pool = ITEMS.filter(it => it.cat === "소모품");
  const w = pool.map(it => 1 / Math.sqrt(it.price));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].key; }
  return pool[0].key;
}

/** 한 주가 끝날 때: 팀 성적·감독 평판이 좋을수록 후원이 자주 온다 */
export function rollGift(s: CareerState) {
  if ((s.gifts ?? []).length >= MAX_GIFTS) return;
  const st = standings(s);
  const rank = st.findIndex(t => t.id === s.myTeam) + 1 || st.length;
  const rep = s.manager?.reputation ?? 50;
  // 시즌이 길면 주마다 조금 덜 (한 시즌 기대 횟수는 비슷하게)
  const chance = (0.22 + (1 - rank / Math.max(1, st.length)) * 0.12 + (rep - 50) / 500) * (OLD_REGULAR_WEEKS / regularWeeksOf(s));
  if (rand() >= chance) return;
  const id = s.nextGiftId ?? 1;
  s.nextGiftId = id + 1;
  const from = DONORS[randInt(0, DONORS.length - 1)];
  const g: Gift = rand() < 0.4
    ? { id, from, money: Math.round(randInt(50, 250) / 10) * 10, season: s.season, week: s.week }
    : { id, from, item: { key: pickItem(), qty: randInt(1, 5) }, season: s.season, week: s.week };
  s.gifts = [...(s.gifts ?? []), g];
  news(s, `🎁 ${from}에서 후원이 도착했습니다! (구단 운영 → 스폰서에서 받기)`);
}

export function giftText(g: Gift) {
  return g.money ? `${g.money.toLocaleString()}만원` : `${ITEM_BY_KEY[g.item!.key]?.name ?? g.item!.key} ${g.item!.qty}개`;
}

/** 후원 받기 (소모품은 최대 보유량까지, 넘치는 만큼은 값을 쳐서 자금으로) */
export function claimGift(s: CareerState, id: number) {
  const g = (s.gifts ?? []).find(x => x.id === id);
  if (!g) throw new CareerError("이미 받았거나 없는 후원입니다");
  s.gifts = (s.gifts ?? []).filter(x => x.id !== id);
  let message = `${g.from}의 후원 ${giftText(g)}을(를) 받았습니다`;
  if (g.money) pay(s, "후원", g.money, g.from);
  else if (g.item) {
    const it = ITEM_BY_KEY[g.item.key];
    const owned = s.inventory?.[it.key] ?? 0;
    const add = Math.max(0, Math.min(g.item.qty, stackMax(it) - owned));
    if (add) s.inventory = { ...s.inventory, [it.key]: owned + add };
    const over = g.item.qty - add;
    if (over > 0) {
      const money = Math.round((it.price * over * 0.5) / 10) * 10;
      pay(s, "후원", money, `${g.from} (${it.name} 보유 한도 초과분)`);
      message += ` (보유 한도를 넘는 ${over}개는 ${money.toLocaleString()}만원으로 받음)`;
    }
  }
  s.giftLog = [g, ...(s.giftLog ?? [])].slice(0, 20);
  return { message, result: "signed" };
}
