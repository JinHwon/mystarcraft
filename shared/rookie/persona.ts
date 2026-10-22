/**
 * 선수 키우기: 숨은 성격(FM 의 숨은 능력치처럼)과 경기 평점·폼·시즌 기록
 * - 성격 6가지는 1~20. 처음엔 모르고(?), 코치·클랜장 리포트·멘토 과외로 "대략 → 정확" 순서로 드러남
 * - 경기 평점은 3.0~10.0 (8.5 이상이면 경기 최우수 선수 MOM)
 */

export type TraitKey = "prof" | "det" | "cons" | "pres" | "amb" | "soc";
export const TRAIT_KEYS: TraitKey[] = ["prof", "det", "cons", "pres", "amb", "soc"];
export const TRAIT_MAX = 20;

export interface TraitDef { name: string; icon: string; desc: string }
export const TRAITS: Record<TraitKey, TraitDef> = {
  prof: { name: "프로의식", icon: "🎯", desc: "연습을 얼마나 성실히 소화하는지. 높을수록 경기로 더 많이 배우고 덜 지칩니다" },
  det: { name: "의지", icon: "🔥", desc: "져도 꺾이지 않는 마음. 높을수록 연패에 사기가 덜 떨어지고 슬럼프에 잘 안 빠집니다" },
  cons: { name: "꾸준함", icon: "📏", desc: "경기력 기복. 높을수록 매 경기 제 실력을 냅니다 (낮으면 날마다 들쭉날쭉)" },
  pres: { name: "강심장", icon: "💎", desc: "큰 경기(대회·커리지·프로리그·클랜전·입단 테스트)에서 실력이 올라가는지 떨어지는지" },
  amb: { name: "야망", icon: "👑", desc: "더 높은 곳을 원하는 마음. 높을수록 인지도가 빨리 오르고 구단의 관심을 끌지만, 제자리걸음이면 조급해집니다" },
  soc: { name: "사교성", icon: "🤝", desc: "사람들과 어울리는 힘. 높을수록 클랜원과 빨리 친해지고 팬이 잘 모입니다" },
};

export type Persona = Record<TraitKey, number>;
/** 알려진 정도: 1 대략(±3) · 2 정확 */
export type Known = Partial<Record<TraitKey, 1 | 2>>;

/** 성격 값 보여주기: ? · 대략 범위 · 정확한 값 */
export function traitShown(p: Persona | undefined, known: Known | undefined, k: TraitKey): { text: string; lo: number; hi: number; level: 0 | 1 | 2 } {
  const v = p?.[k] ?? 10;
  const lv = known?.[k] ?? 0;
  if (lv === 2) return { text: String(v), lo: v, hi: v, level: 2 };
  if (lv === 1) {
    // 범위는 값에 따라 정해진 자리 (볼 때마다 바뀌지 않게)
    const lo = Math.max(1, Math.min(TRAIT_MAX - 6, v - 2 - (v % 3 === 0 ? 1 : 0)));
    return { text: `${lo}~${lo + 6 > TRAIT_MAX ? TRAIT_MAX : lo + 6}`, lo, hi: Math.min(TRAIT_MAX, lo + 6), level: 1 };
  }
  return { text: "?", lo: 1, hi: TRAIT_MAX, level: 0 };
}

/** FM 처럼 성격을 한마디로 (알려진 성격만으로 판단, 모르면 "알 수 없음") */
export function personaLabel(p: Persona | undefined, known: Known | undefined): string {
  if (!p) return "알 수 없음";
  const k = (t: TraitKey) => (known?.[t] ? p[t] : undefined);
  const n = Object.keys(known ?? {}).length;
  if (n < 2) return "아직 알 수 없음";
  const prof = k("prof"), det = k("det"), cons = k("cons"), pres = k("pres"), amb = k("amb"), soc = k("soc");
  if ((prof ?? 0) >= 16 && (det ?? 0) >= 15) return "완벽주의자";
  if ((prof ?? 0) >= 15 && (amb ?? 0) >= 15) return "야심찬 연습벌레";
  if ((pres ?? 0) >= 16) return "강심장";
  if ((amb ?? 0) >= 16) return "야심가";
  if ((det ?? 0) >= 16) return "오뚝이";
  if ((soc ?? 0) >= 16) return "분위기 메이커";
  if ((prof ?? 0) >= 15) return "성실파";
  if (cons !== undefined && cons <= 6) return "변덕쟁이";
  if (pres !== undefined && pres <= 5) return "새가슴";
  if (prof !== undefined && prof <= 6) return "게으른 천재형";
  if (det !== undefined && det <= 6) return "유리 멘탈";
  return "무난한 성격";
}

/** 새 성격: 3d7 → 3~21 을 1~20 으로 (평범한 값이 많고 극단은 드묾) */
export function rollPersona(rnd: () => number): Persona {
  const one = () => Math.max(1, Math.min(TRAIT_MAX, 1 + Math.floor(rnd() * 7) + Math.floor(rnd() * 7) + Math.floor(rnd() * 7)));
  return { prof: one(), det: one(), cons: one(), pres: one(), amb: one(), soc: one() };
}

// ── 경기 평점 ────────────────────────────────────────────────────
export type GameKind = "공방" | "래더" | "대회" | "클랜" | "클랜전" | "프로리그" | "테스트" | "연습";
export const GAME_KINDS: GameKind[] = ["공방", "래더", "클랜", "클랜전", "대회", "프로리그", "테스트", "연습"];

/** 경기 이름으로 종류 */
export function kindOf(label: string): GameKind {
  if (/클랜전/.test(label)) return "클랜전";
  if (/프로리그/.test(label)) return "프로리그";
  if (/입단 테스트|승강전|드래프트/.test(label)) return "테스트";
  if (/대회|커리지|결승|강$|라운드/.test(label)) return "대회";
  if (/클랜|친선/.test(label)) return "클랜";
  if (/래더/.test(label)) return "래더";
  if (/공방/.test(label)) return "공방";
  return "연습";
}
/** 큰 경기 (강심장이 영향) */
export const BIG_KINDS: ReadonlySet<GameKind> = new Set(["대회", "클랜전", "프로리그", "테스트"]);

export const MOM_RATING = 8.5;
/** 평점 색 (FM 처럼: 7.5 이상 초록, 6.5 이상 노랑, 그 아래 빨강) */
export const ratingColor = (r: number) => (r >= 8.5 ? "#4ade80" : r >= 7.5 ? "#a3e635" : r >= 6.5 ? "#facc15" : r >= 5.5 ? "#fb923c" : "#f87171");

export interface SeasonStat { g: number; w: number; sum: number; mom: number; best: number; by: Partial<Record<GameKind, [number, number]>> }
export const emptySeason = (): SeasonStat => ({ g: 0, w: 0, sum: 0, mom: 0, best: 0, by: {} });

/** 최근 폼: 최근 평점 5개 평균 (없으면 null) */
export function formAvg(recent: number[] | undefined, n = 5): number | null {
  const r = (recent ?? []).slice(0, n);
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null;
}
export function formLabel(avg: number | null): string {
  if (avg === null) return "-";
  return avg >= 8 ? "절정" : avg >= 7.3 ? "좋음" : avg >= 6.6 ? "보통" : avg >= 6 ? "부진" : "최악";
}
