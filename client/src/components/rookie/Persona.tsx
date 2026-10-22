/**
 * 선수 키우기: 숨은 성격 · 최근 폼(평점) · 시즌 기록표 (FM 의 선수 프로필처럼)
 */
import { cn } from "@/lib/utils";
import { ymd, type RookieState } from "@shared/rookie/model";
import {
  GAME_KINDS, MOM_RATING, TRAIT_KEYS, TRAIT_MAX, TRAITS, formAvg, formLabel, personaLabel, ratingColor, traitShown,
} from "@shared/rookie/persona";

/** 평점 동그라미 */
export function RatingChip({ r, size = "sm" }: { r?: number; size?: "sm" | "md" }) {
  if (r === undefined) return null;
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md font-black tabular-nums text-black shrink-0", size === "md" ? "min-w-[38px] h-6 text-[13px] px-1" : "min-w-[30px] h-[18px] text-[11px] px-0.5")}
      style={{ background: ratingColor(r) }} title={r >= MOM_RATING ? "경기 최우수 선수 (MOM)" : "경기 평점"}>
      {r.toFixed(1)}{r >= MOM_RATING ? "★" : ""}
    </span>
  );
}

/** 최근 5경기 평점과 폼 */
export function FormStrip({ s }: { s: RookieState }) {
  const avg = formAvg(s.recent);
  const last = (s.recent ?? []).slice(0, 5);
  return (
    <div className="flex items-center gap-1.5 text-[11.5px]">
      <span className="text-muted-foreground shrink-0">최근 폼</span>
      {last.length ? [...last].reverse().map((r, i) => <RatingChip key={i} r={r} />) : <span className="text-muted-foreground">아직 경기가 없습니다</span>}
      {avg !== null && <span className="ml-auto font-bold" style={{ color: ratingColor(avg) }}>평균 {avg.toFixed(1)} · {formLabel(avg)}</span>}
    </div>
  );
}

/** 숨은 성격: 모르면 ?, 대략이면 범위 막대, 정확하면 값 */
export function PersonaCard({ s }: { s: RookieState }) {
  const label = personaLabel(s.persona, s.known);
  const knownN = Object.keys(s.known ?? {}).length;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-black text-foreground">🧠 성격</span>
        <span className="text-[12px] font-bold text-primary">{label}</span>
        <span className="ml-auto text-[10.5px] text-muted-foreground">알아낸 성격 {knownN}/{TRAIT_KEYS.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {TRAIT_KEYS.map(k => {
          const t = TRAITS[k], sh = traitShown(s.persona, s.known, k);
          return (
            <div key={k} className="flex items-center gap-2 text-[12px]">
              <span className="w-[74px] shrink-0 text-foreground">{t.icon} {t.name}</span>
              <div className="relative flex-1 h-2.5 rounded bg-muted/50 overflow-hidden">
                {sh.level > 0 && (
                  <div className={cn("absolute inset-y-0 rounded", sh.level === 2 ? "bg-primary" : "bg-primary/40")}
                    style={{ left: `${((sh.lo - 1) / TRAIT_MAX) * 100}%`, width: `${Math.max(5, ((sh.hi - sh.lo + 1) / TRAIT_MAX) * 100)}%` }} />
                )}
              </div>
              <span className={cn("w-[42px] text-right tabular-nums font-bold shrink-0", sh.level === 0 ? "text-muted-foreground" : "text-foreground")}>{sh.text}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10.5px] text-muted-foreground">
        성격은 처음엔 모릅니다. 클랜장·코치의 주간 리포트와 멘토 과외에서 조금씩 드러납니다 (대략 → 정확). 프로의식은 성장, 의지는 연패·슬럼프, 꾸준함은 기복, 강심장은 큰 경기, 야망은 인지도, 사교성은 친분도에 영향을 줍니다.
      </div>
    </div>
  );
}

/** 연도별 시즌 기록표 (경기 종류별 승률 포함) */
export function SeasonTable({ s }: { s: RookieState }) {
  const years = Object.keys(s.seasons ?? {}).map(Number).sort((a, b) => b - a);
  const cur = ymd(s.day).y;
  const st = s.seasons?.[cur];
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
      <div className="text-[13px] font-black text-foreground">📊 시즌 기록</div>
      <FormStrip s={s} />
      {!years.length ? <div className="text-[11px] text-muted-foreground">경기를 하면 시즌 기록이 쌓입니다</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] tabular-nums">
            <thead className="text-muted-foreground">
              <tr><th className="text-left font-normal py-0.5">시즌</th><th className="font-normal">경기</th><th className="font-normal">승률</th><th className="font-normal">평균 평점</th><th className="font-normal">MOM</th><th className="font-normal">최고</th></tr>
            </thead>
            <tbody>
              {years.map(y => {
                const r = s.seasons![y];
                const avg = r.g ? r.sum / r.g : 0;
                return (
                  <tr key={y} className={cn("border-t border-border", y === cur && "text-foreground font-bold")}>
                    <td className="py-1">{y}{y === cur ? " (지금)" : ""}</td>
                    <td className="text-center">{r.g}</td>
                    <td className="text-center">{r.g ? Math.round((r.w / r.g) * 100) : 0}%</td>
                    <td className="text-center" style={{ color: ratingColor(avg) }}>{avg.toFixed(2)}</td>
                    <td className="text-center">{r.mom}</td>
                    <td className="text-center">{r.best.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {st && (
        <div className="flex flex-wrap gap-1">
          {GAME_KINDS.filter(k => st.by[k]).map(k => {
            const [g, w] = st.by[k]!;
            return <span key={k} className="text-[10.5px] rounded-full border border-border px-2 py-0.5 text-muted-foreground">{k} {w}승 {g - w}패 ({Math.round((w / g) * 100)}%)</span>;
          })}
        </div>
      )}
    </div>
  );
}
