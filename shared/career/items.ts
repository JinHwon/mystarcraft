/**
 * 아이템 상점 (원작 마이스타크래프트 아이템)
 * 이름·설명·효과 문구는 원작 그대로, 그림은 client/public/legacy/아이템/{분류}/{번호}.gif
 * 금액은 이 게임 경제(만원)에 맞춘 값이다.
 */
import { STAT_KEYS, type StatKey } from "../gameConstants";
import type { CPlayer } from "./rules";

export type ItemCat = "소모품" | "마우스" | "키보드" | "모니터" | "기타" | "포션";
export const ITEM_CATS: ItemCat[] = ["소모품", "마우스", "키보드", "모니터", "기타", "포션"];
export type EquipSlot = "mouse" | "keyboard" | "monitor" | "etc";
const SLOT_OF: Partial<Record<ItemCat, EquipSlot>> = { 마우스: "mouse", 키보드: "keyboard", 모니터: "monitor", 기타: "etc" };
export const SLOT_NAMES: Record<EquipSlot, string> = { mouse: "마우스", keyboard: "키보드", monitor: "모니터", etc: "기타" };

export interface ItemDef {
  key: string;
  cat: ItemCat;
  /** 그림 파일 이름 (확장자 제외) */
  img: string;
  name: string;
  /** 원작 설명 두 줄 */
  desc: [string, string];
  /** 원작 효과 문구 */
  effect: string[];
  price: number;
  /**
   * equip: 선수에게 장착 (uses 경기 동안)
   * match: 경기 전 아이템 (엔트리에서 세트마다 사용, 한 경기)
   * instant: 즉시 사용 (선수 선택)
   * stock: 사 두었다가 경기 전에 선수에게 사용 (비타비타)
   * potion: 포션 (즉시 사용, 능력치 무작위 변화)
   */
  kind: "equip" | "match" | "instant" | "potion" | "stock";
  /** 상점에서 팔지 않음 (치어풀: 이벤트 행동에서 팬에게 받음) */
  notForSale?: boolean;
  uses?: number;
  bonus?: Partial<Record<StatKey, number>>;
  /** 경기 아이템: 한 세트 동안 능력치 보너스 (작전 메모) */
  setBonus?: Partial<Record<StatKey, number>>;
  /** 모든 능력치 보너스 */
  all?: number;
  /** 컨디션 보너스 (장비: 경기 중 적용 / 즉시 사용: 바로 변화) */
  cond?: number;
  /** 포션: 오르는 능력치 (없으면 전체) · 범위 */
  potion?: { stat?: StatKey; min: number; max: number; condCost: number; allMinus?: number };
}

const st = (control = 0, attack = 0, harass = 0, strategy = 0, supply = 0, defense = 0, scout = 0, sense = 0) =>
  Object.fromEntries(Object.entries({ control, attack, harass, strategy, supply, defense, scout, sense }).filter(([, v]) => v)) as Partial<Record<StatKey, number>>;

export const ITEMS: ItemDef[] = [
  // ── 소모품 ──
  { key: "vitavita", cat: "소모품", img: "0", name: "비타비타", desc: ["힘들고 지칠 때", "비타민을 마시면 기운이 날거다."], effect: ["즉시 컨디션 ＋3"], price: 40, kind: "stock", cond: 3 },
  { key: "gum", cat: "소모품", img: "1", name: "츄잉껌", desc: ["긴장하지 말고 껌을 씹으며", "맘 편하게 경기해보자."], effect: ["패했을 경우", "능력치 감소 －66%"], price: 50, kind: "match" },
  { key: "ceremony", cat: "소모품", img: "2", name: "세레모니", desc: ["이번 경기를 승리한다면", "이런 춤을 춰보는건 어때?"], effect: ["소지금 ＋150만원", "승리시 전원 컨디션 ＋1"], price: 80, kind: "match" },
  { key: "sniping", cat: "소모품", img: "3", name: "스나이핑", desc: ["상대의 카드는 뻔하다", "그렇다면 승리는 뻔한거지."], effect: ["상대 선수 예측시", "이길 확률 ↑"], price: 100, kind: "match" },
  { key: "memo", cat: "소모품", img: "memo.svg", name: "작전 메모", desc: ["상대의 버릇을 꼼꼼히 적어뒀다.", "경기 전에 한 번 더 읽어보자."], effect: ["한 경기 동안", "센스＋100, 전략＋60"], price: 90, kind: "match", setBonus: st(0, 0, 0, 60, 0, 0, 0, 100) },
  { key: "cheer", cat: "소모품", img: "4", name: "치어풀", desc: ["팬들에게 선물 받은거다", "대세는 패승승승!"], effect: ["한경기 동안", "전체 능력치 ＋75"], price: 0, kind: "match", all: 75, notForSale: true },
  // ── 마우스 ──
  { key: "m0", cat: "마우스", img: "0", name: "미키마우스", desc: ["장난감인줄 알았더니", "꽤나 쓸만한 마우스군."], effect: ["컨트롤＋30, 공격력＋15", "견제＋15"], price: 150, kind: "equip", uses: 15, bonus: st(30, 15, 15) },
  { key: "m1", cat: "마우스", img: "1", name: "M-BLACK", desc: ["가볍고 날렵하며", "정확도도 뛰어나다."], effect: ["컨트롤＋60, 공격력＋30", "견제＋30"], price: 400, kind: "equip", uses: 30, bonus: st(60, 30, 30) },
  { key: "m2", cat: "마우스", img: "2", name: "M-SHARP", desc: ["이렇게 날카로운 마우스라면", "시드권은 문제 없겠는걸."], effect: ["컨트롤＋80, 공격력＋60", "견제＋60, 전략+40"], price: 950, kind: "equip", uses: 30, bonus: st(80, 60, 60, 40) },
  { key: "m3", cat: "마우스", img: "3", name: "M-SILVER", desc: ["움직임이 부드러운 고급 마우스.", "움직임이 끝내준다!"], effect: ["컨트롤＋80, 공격력＋60", "견제＋60"], price: 800, kind: "equip", uses: 30, bonus: st(80, 60, 60) },
  { key: "m4", cat: "마우스", img: "4.svg", name: "M-GOLD", desc: ["손에 착 감기는 황금 마우스.", "상대의 움직임이 먼저 읽힌다."], effect: ["컨트롤＋100, 공격력＋70", "견제＋70, 센스＋40"], price: 1300, kind: "equip", uses: 30, bonus: st(100, 70, 70, 0, 0, 0, 0, 40) },
  // ── 키보드 ──
  { key: "k0", cat: "키보드", img: "0", name: "양산형 키보드", desc: ["이 정도면 강하게 두들겨도", "고장나지는 않겠어."], effect: ["물량＋30", "수비력＋30"], price: 150, kind: "equip", uses: 15, bonus: st(0, 0, 0, 0, 30, 30) },
  { key: "k1", cat: "키보드", img: "1", name: "K-BLACK", desc: ["가볍고 튼튼하며", "누르는 소리가 좋다."], effect: ["물량＋60", "수비력＋60"], price: 400, kind: "equip", uses: 30, bonus: st(0, 0, 0, 0, 60, 60) },
  { key: "k2", cat: "키보드", img: "2", name: "K-SHARP", desc: ["이렇게 날카로운 키보드라면", "시드권은 문제 없겠는걸."], effect: ["물량＋100", "수비력＋100, 전략＋40"], price: 950, kind: "equip", uses: 30, bonus: st(0, 0, 0, 40, 100, 100) },
  { key: "k3", cat: "키보드", img: "3", name: "K-SILVER", desc: ["정확하고 튼튼한 고급 키보드.", "성능이 정말 좋다."], effect: ["물량＋100", "수비력＋100"], price: 800, kind: "equip", uses: 30, bonus: st(0, 0, 0, 0, 100, 100) },
  { key: "k4", cat: "키보드", img: "4.svg", name: "K-GOLD", desc: ["단축키가 손가락보다 먼저 나간다.", "최상급 기계식 키보드."], effect: ["물량＋120, 수비력＋120", "전략＋40, 센스＋40"], price: 1300, kind: "equip", uses: 30, bonus: st(0, 0, 0, 40, 120, 120, 0, 40) },
  // ── 모니터 ──
  { key: "mon0", cat: "모니터", img: "0", name: "CRT 평면모니터", desc: ["어디보자...", "이정도면 눈이 아프진 않지."], effect: ["정찰＋40", "컨디션＋2"], price: 200, kind: "equip", uses: 30, bonus: st(0, 0, 0, 0, 0, 0, 40), cond: 2 },
  { key: "mon1", cat: "모니터", img: "1", name: "소형 LCD모니터", desc: ["화질도 깨끗하고", "눈이 아주 편안한 걸!"], effect: ["정찰＋60", "컨디션＋3"], price: 450, kind: "equip", uses: 30, bonus: st(0, 0, 0, 0, 0, 0, 60), cond: 3 },
  { key: "mon2", cat: "모니터", img: "2", name: "대형 LCD모니터", desc: ["넓은 시야에 선명한 색상,", "이거라면 게임할 맛 나겠는 걸!"], effect: ["정찰＋80", "컨디션＋4"], price: 800, kind: "equip", uses: 30, bonus: st(0, 0, 0, 0, 0, 0, 80), cond: 4 },
  { key: "mon3", cat: "모니터", img: "3.svg", name: "게이밍 모니터", desc: ["화면이 부드럽게 흘러간다.", "작은 움직임도 놓치지 않는다."], effect: ["정찰＋100, 센스＋50", "컨디션＋3"], price: 1200, kind: "equip", uses: 30, bonus: st(0, 0, 0, 0, 0, 0, 100, 50), cond: 3 },
  // ── 기타 ──
  { key: "e0", cat: "기타", img: "0", name: "핫팩", desc: ["쌀쌀한 날씨도", "이거면 문제 없겠다."], effect: ["컨디션＋1"], price: 60, kind: "equip", uses: 10, cond: 1 },
  { key: "e1", cat: "기타", img: "1", name: "손목 아대", desc: ["경기할 때 착용하면", "손목에 무리가 덜 가겠군."], effect: ["센스＋20", "컨트롤＋20"], price: 250, kind: "equip", uses: 20, bonus: st(20, 0, 0, 0, 0, 0, 0, 20) },
  { key: "e2", cat: "기타", img: "2", name: "광택 썬글라스", desc: ["멋진 선글라스 구나!", "폼이 꽤나 나겠는 걸?"], effect: ["센스＋40", "정찰＋40"], price: 350, kind: "equip", uses: 20, bonus: st(0, 0, 0, 0, 0, 0, 40, 40) },
  { key: "e3", cat: "기타", img: "3", name: "악마의 펜던트", desc: ["살짝 기분 나쁜 걸..", "하지만 강한 기운이 느껴져."], effect: ["전체 능력치＋44", "컨디션－4"], price: 600, kind: "equip", uses: 15, all: 44, cond: -4 },
  { key: "e4", cat: "기타", img: "4", name: "별 목걸이", desc: ["반짝이는 두개의 별이 박힌", "아름다운 목걸이다."], effect: ["전체 능력치＋15", "컨디션＋1"], price: 500, kind: "equip", uses: 20, all: 15, cond: 1 },
  { key: "e5", cat: "기타", img: "5", name: "힘의 반지", desc: ["가지고 싶은 욕구가 샘솟는 반지.", "멋진 글귀가 새겨져 있다."], effect: ["공격력＋110", "수비력＋110"], price: 1200, kind: "equip", uses: 10, bonus: st(0, 110, 0, 0, 0, 110) },
  { key: "e6", cat: "기타", img: "6.svg", name: "집중 헤드셋", desc: ["관중 소리가 하나도 안 들린다.", "오직 게임에만 집중하자."], effect: ["센스＋50", "정찰＋30"], price: 450, kind: "equip", uses: 20, bonus: st(0, 0, 0, 0, 0, 0, 30, 50) },
  { key: "e7", cat: "기타", img: "7.svg", name: "전략 노트", desc: ["상대별 빌드를 정리한 노트.", "읽을수록 수가 보인다."], effect: ["센스＋30", "전략＋60"], price: 450, kind: "equip", uses: 20, bonus: st(0, 0, 0, 60, 0, 0, 0, 30) },
  { key: "e8", cat: "기타", img: "8.svg", name: "프로 유니폼", desc: ["입기만 해도 자신감이 붙는다.", "이제 진짜 프로게이머다."], effect: ["센스＋60, 컨트롤＋30", "컨디션＋1"], price: 900, kind: "equip", uses: 25, bonus: st(30, 0, 0, 0, 0, 0, 0, 60), cond: 1 },
  // ── 포션 (능력치 영구 변화, 무작위) ──
  { key: "p_vit", cat: "포션", img: "vit", name: "비타 포션", desc: ["피곤할 땐 이만한게 없지.", "맛도 정말 좋다구."], effect: ["컨디션＋?", "전체 능력치－2"], price: 100, kind: "potion", potion: { min: 2, max: 4, condCost: 0, allMinus: 2 } },
  { key: "p_att", cat: "포션", img: "att", name: "붉은 포션", desc: ["단숨에 마셔보렴.", "피가 뜨겁게 끓어오르지?"], effect: ["공격력 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "attack", min: -10, max: 30, condCost: 1 } },
  { key: "p_def", cat: "포션", img: "def", name: "푸른 포션", desc: ["이걸 마시면 침착해지지.", "다만 졸음이 몰려올 수도 있어."], effect: ["수비력 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "defense", min: -10, max: 30, condCost: 1 } },
  { key: "p_ctr", cat: "포션", img: "ctr", name: "노란 포션", desc: ["담긴 병부터 섬세하단다.", "마실 때도 섬세하게 마셔야해."], effect: ["컨트롤 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "control", min: -10, max: 30, condCost: 1 } },
  { key: "p_prd", cat: "포션", img: "prd", name: "검은 포션", desc: ["왼손은 거들 뿐이라니?", "물량 앞에 장사가 어디 있더냐?"], effect: ["물량 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "supply", min: -10, max: 30, condCost: 1 } },
  { key: "p_grr", cat: "포션", img: "grr", name: "주황 포션", desc: ["찰랑 거리는 모양이", "정신이 하나도 없구나."], effect: ["견제 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "harass", min: -10, max: 30, condCost: 1 } },
  { key: "p_rec", cat: "포션", img: "rec", name: "초록 포션", desc: ["정말로 이걸 마시면", "공기의 흐름이 보이나요?"], effect: ["정찰 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "scout", min: -10, max: 30, condCost: 1 } },
  { key: "p_stt", cat: "포션", img: "stt", name: "보라 포션", desc: ["스타는 전략게임이란다.", "잔머리가 아니라 전략이라고."], effect: ["전략 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "strategy", min: -10, max: 30, condCost: 1 } },
  { key: "p_sen", cat: "포션", img: "sen", name: "하얀 포션", desc: ["자네는 상대의 눈빛만 봐도", "뭘 할지 한눈에 알아챌 수 있나?"], effect: ["센스 ±??", "컨디션－1"], price: 120, kind: "potion", potion: { stat: "sense", min: -10, max: 30, condCost: 1 } },
  { key: "p_all", cat: "포션", img: "all", name: "무지개 포션", desc: ["여러 포션을 섞어서 만들었지.", "먹기는 힘들어도 효과는 좋다네."], effect: ["전체 능력치 ±??", "컨디션－3"], price: 400, kind: "potion", potion: { min: -6, max: 15, condCost: 3 } },
  { key: "p_spc", cat: "포션", img: "spc", name: "매직무지개 포션", desc: ["마법으로 정제한거라", "효과는 작아도 부작용이 없다네."], effect: ["전체 능력치 ＋?", "컨디션－3"], price: 600, kind: "potion", potion: { min: 1, max: 8, condCost: 3 } },
  { key: "p_sen2", cat: "포션", img: "sen2.svg", name: "투명 포션", desc: ["맑은 정신이 오래 간다네.", "하얀 포션보다 순하지."], effect: ["센스 ＋5~25", "컨디션－1"], price: 300, kind: "potion", potion: { stat: "sense", min: 5, max: 25, condCost: 1 } },
  { key: "p_def2", cat: "포션", img: "def2.svg", name: "강철 포션", desc: ["어떤 러시도 막아낼 것 같은", "든든한 기분이 든다."], effect: ["수비력 ＋5~25", "컨디션－1"], price: 300, kind: "potion", potion: { stat: "defense", min: 5, max: 25, condCost: 1 } },
];

export const ITEM_BY_KEY: Record<string, ItemDef> = Object.fromEntries(ITEMS.map(i => [i.key, i]));
export const slotOf = (item: ItemDef): EquipSlot | undefined => SLOT_OF[item.cat];
/** 그림 경로 (img 에 확장자가 있으면 그대로, 없으면 원작 .gif) */
export const itemImg = (item: ItemDef) => ({ dir: `아이템/${item.cat}`, name: item.img });

/** 아이템 한 종류 최대 보유 개수 */
export const ITEM_STACK_MAX = 99;
/** 사 두었다가 쓰는 아이템 (경기 아이템·비타비타·장비) */
export const isStackable = (item: ItemDef) => item.kind === "match" || item.kind === "stock" || item.kind === "equip";
/** 장비 능력치 합산 상한 (경기 중) */
export const EFFECTIVE_STAT_MAX = 1100;

/** 장비 보너스 (능력치) */
export function equipBonus(p: CPlayer): Record<StatKey, number> {
  const out = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>;
  for (const e of Object.values(p.equip ?? {})) {
    const it = e && ITEM_BY_KEY[e.key];
    if (!it) continue;
    for (const k of STAT_KEYS) out[k] += (it.bonus?.[k] ?? 0) + (it.all ?? 0);
  }
  return out;
}
/** 장비 컨디션 보너스 */
export function equipCond(p: CPlayer): number {
  return Object.values(p.equip ?? {}).reduce((sum, e) => sum + (e ? ITEM_BY_KEY[e.key]?.cond ?? 0 : 0), 0);
}
/** 세트 추가 능력치: 숫자면 모든 능력치, 객체면 능력치별 */
export type StatExtra = number | Partial<Record<StatKey, number>>;
const extraOf = (e: StatExtra, k: StatKey) => (typeof e === "number" ? e : e[k] ?? 0);

/** 경기에 쓰이는 능력치 (기본 + 장비 + 세트 추가) */
export function gearStats(p: CPlayer, extra: StatExtra = 0): Record<StatKey, number> {
  const b = equipBonus(p);
  return Object.fromEntries(STAT_KEYS.map(k => [k, Math.min(EFFECTIVE_STAT_MAX, p.stats[k] + b[k] + extraOf(extra, k))])) as Record<StatKey, number>;
}

/** 경기 아이템이 그 세트에 더하는 능력치 (치어풀: 모든 능력치 +75, 작전 메모: 센스 +100·전략 +60) */
export function setItemExtra(key: string | undefined): Partial<Record<StatKey, number>> {
  const it = key ? ITEM_BY_KEY[key] : undefined;
  if (!it) return {};
  const out: Partial<Record<StatKey, number>> = {};
  for (const k of STAT_KEYS) {
    const v = (it.all ?? 0) + (it.setBonus?.[k] ?? 0);
    if (it.kind === "match" && v) out[k] = v;
  }
  return out;
}
/** 경기에 쓰이는 컨디션 (1~10) */
export function gearCond(p: CPlayer): number {
  return Math.max(1, Math.min(100, p.cond + equipCond(p)));
}
