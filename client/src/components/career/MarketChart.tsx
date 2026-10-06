/**
 * 선수 시세·능력치 추이 (주마다 기록) — 선수 정보 시트와 시세 목록에서 씀
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { askingPrice, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";

const keyLabel = (key: number) => { const season = Math.floor(key / 100), w = key % 100; return w === 0 ? `${season}시즌 시작` : `${season}시즌 ${w}주`; };
const keyShort = (key: number) => { const season = Math.floor(key / 100), w = key % 100; return w === 0 ? `S${season}` : `S${season}·${w}주`; };

interface Pt { key: number; label: string; v: number }

/** 한 줄 그래프: 손가락/마우스로 주별 값 보기 */
function Line({ title, pts, color, unit }: { title: string; pts: Pt[]; color: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = 110, padL = 40, padR = 8, padT = 8, padB = 18;
  const vs = pts.map(p => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = Math.max(1, hi - lo);
  const yMin = lo - span * 0.12, yMax = hi + span * 0.12;
  const X = (i: number) => padL + (pts.length < 2 ? 0.5 : i / (pts.length - 1)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const at = hover ?? pts.length - 1;
  const hp = pts[at];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((x - padL) / (W - padL - padR)) * (pts.length - 1)))));
  };
  const ticks = [lo, (lo + hi) / 2, hi];
  const fmt = (v: number) => Math.round(v).toLocaleString();
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
        <span className="font-bold text-foreground">{title}</span>
        <span>{hp.label} · <b className="text-foreground">{fmt(hp.v)}{unit}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={title}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={padL - 4} y={Y(t) + 3} textAnchor="end" fontSize={9} className="fill-muted-foreground">{fmt(t)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.v)} r={i === at ? 4 : 1.8} fill={color} stroke={i === at ? "var(--card, #1e293b)" : "none"} strokeWidth={2} />)}
        <text x={padL} y={H - 4} fontSize={9} className="fill-muted-foreground">{keyShort(pts[0].key)}</text>
        <text x={W - padR} y={H - 4} fontSize={9} textAnchor="end" className="fill-muted-foreground">{pts[pts.length - 1].label === "현재" ? "현재" : keyShort(pts[pts.length - 1].key)}</text>
      </svg>
    </div>
  );
}

/** 선수 한 명: 시세 그래프 + 능력치 그래프 + 주별 표 */
export function MarketChart({ s, player }: { s: CareerState; player: CPlayer }) {
  const q = trpc.career.marketSeries.useQuery({ playerId: player.id, at: s.season * 100 + s.week }, { staleTime: 60_000 });
  const [rows, setRows] = useState(false);
  const series = useMemo(() => {
    const base = (q.data?.series ?? []).map(x => ({ ...x, label: keyLabel(x.key) }));
    // 마지막 기록 이후 달라졌을 수 있으니 지금 값을 끝에 붙임
    const now = { key: s.season * 100 + s.week, label: "현재", price: askingPrice(player, s.season), total: totalOf(player.stats) };
    return [...base, now];
  }, [q.data, player, s.season, s.week]);
  if (q.isLoading) return <div className="text-[11px] text-muted-foreground py-2">시세 기록을 불러오는 중...</div>;
  if (series.length < 2) return <div className="text-[11px] text-muted-foreground py-2">아직 기록이 없습니다. 한 주가 지나면 주별 시세가 쌓입니다</div>;
  const first = series[0], last = series[series.length - 1];
  const d = last.price - first.price;
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] text-muted-foreground">
        {first.label} 대비 시세 <b className={cn(d > 0 ? "text-emerald-300" : d < 0 ? "text-rose-300" : "text-foreground")}>{d > 0 ? "+" : ""}{d.toLocaleString()}만원</b> · 능력치 <b className="text-foreground">{last.total - first.total >= 0 ? "+" : ""}{(last.total - first.total).toLocaleString()}</b>
      </div>
      <Line title="💰 시세 (만원)" pts={series.map(x => ({ key: x.key, label: x.label, v: x.price }))} color="#fbbf24" unit="만" />
      <Line title="📊 능력치 합" pts={series.map(x => ({ key: x.key, label: x.label, v: x.total }))} color="#38bdf8" unit="" />
      <button onClick={() => setRows(!rows)} className="w-full rounded-lg border border-border py-1 text-[11.5px] font-bold text-muted-foreground">{rows ? "주별 기록 접기 ▲" : "주별 기록 표로 보기 ▼"}</button>
      {rows && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[11.5px] tabular-nums">
            <thead className="sticky top-0 bg-sidebar text-muted-foreground"><tr><th className="text-left px-2 py-1 font-normal">주</th><th className="text-right px-2 font-normal">시세</th><th className="text-right px-2 font-normal">변화</th><th className="text-right px-2 font-normal">능력치</th></tr></thead>
            <tbody>
              {[...series].map((x, i, a) => ({ x, prev: i ? a[i - 1] : null })).reverse().map(({ x, prev }) => {
                const dd = prev ? x.price - prev.price : 0;
                return (
                  <tr key={x.key + x.label} className="border-t border-border/60">
                    <td className="px-2 py-0.5">{x.label}</td>
                    <td className="px-2 text-right font-bold text-foreground">{x.price.toLocaleString()}</td>
                    <td className={cn("px-2 text-right", dd > 0 ? "text-emerald-300" : dd < 0 ? "text-rose-300" : "text-muted-foreground")}>{prev ? (dd > 0 ? "+" : "") + dd.toLocaleString() : "-"}</td>
                    <td className="px-2 text-right">{x.total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
