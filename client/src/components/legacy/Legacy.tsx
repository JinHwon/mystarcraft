/**
 * 원작(마이스타크래프트 1.27) 화면 스타일 공용 조각
 * 원작 이미지는 client/public/legacy/{선수,맵,로고,아이템,기타}/*.gif 에 넣으면 자동으로 쓰이고,
 * 없으면 대체 그림으로 그린다.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { legacyGrade, totalOf } from "@shared/career/rules";
import { mapView } from "@shared/career/view";
import { ORIG_PLAYERS } from "@shared/career/originalData";

export const LEGACY_FONT: CSSProperties = { fontFamily: '"Gulim","굴림","Dotum","돋움","Malgun Gothic","Apple SD Gothic Neo",sans-serif' };

/** 게임 안 이름과 이미지 파일 이름이 다른 맵 */
const MAP_IMG_ALIAS: Record<string, string> = {
  카트리나SE: "카트리나", 라이드of발키리: "라오발", 네오레퀴엠: "레퀴엠", 로키2: "로키", 몬티홀SE: "몬티홀", 몽환2: "몽환",
  운고로분화구: "운고로", 비잔티움3: "비잔티움2", 네오메두사: "메두사", 카르타고3: "카르타고", 신단장의능선: "단장의능선", 아웃사이더SE: "아웃사이더",
};

/** 원작 사진 파일 이름: 동명이인은 뒤 선수가 "이름1" (이영호1, 김윤환1, 박성준1) */
function photoName(id: number | undefined, name: string) {
  if (id === undefined) return name;
  const first = ORIG_PLAYERS.findIndex(r => r[1] === name);
  return first >= 0 && first !== id ? `${name}1` : name;
}

export const legacySrc = (dir: string, name: string) => `/legacy/${encodeURIComponent(dir)}/${encodeURIComponent(name)}.gif`;

export function LegacyImg({ dir, name, className, style, fallback }: { dir: string; name: string; className?: string; style?: CSSProperties; fallback: ReactNode }) {
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [dir, name]);
  if (err) return <>{fallback}</>;
  return <img src={legacySrc(dir, name)} alt={name} draggable={false} onError={() => setErr(true)} className={className} style={style} />;
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function MapImage({ mapId, size = 72 }: { mapId: number; size?: number }) {
  const m = mapView(mapId);
  const h = hue(m.name);
  return (
    <LegacyImg
      dir="맵" name={MAP_IMG_ALIAS[m.name] ?? m.name}
      className="block object-cover" style={{ width: size, height: size }}
      fallback={
        <div className="flex items-center justify-center text-white/80 font-bold" style={{ width: size, height: size, fontSize: size / 4, background: `radial-gradient(circle at 30% 30%, hsl(${h} 45% 55%), hsl(${(h + 40) % 360} 40% 25%))` }}>
          {m.name.slice(0, 1)}
        </div>
      }
    />
  );
}

export function PlayerPhoto({ id, name, size = 64 }: { id?: number; name: string; size?: number }) {
  return (
    <div className="border border-neutral-500 bg-neutral-800 shrink-0" style={{ width: size, height: size * 1.05 }}>
      <LegacyImg
        dir="선수" name={photoName(id, name)} className="w-full h-full object-cover"
        fallback={<div className="w-full h-full flex items-end justify-center overflow-hidden text-neutral-500" style={{ fontSize: size * 0.8, lineHeight: 1 }}>👤</div>}
      />
    </div>
  );
}

export function TeamLogo({ team, className }: { team: { name: string; short: string; color: string }; className?: string }) {
  return (
    <div className={cn("bg-white rounded-md flex items-center justify-center overflow-hidden", className)}>
      <LegacyImg
        dir="로고" name={team.short} className="max-w-full max-h-full object-contain"
        fallback={<span className="font-black italic tracking-tight" style={{ color: team.color, fontSize: 18 }}>{team.short}</span>}
      />
    </div>
  );
}

// ── 맵 정보 (러시거리·자원·복잡도 막대 + 종족전) ──────────────────────
const barColor = (v: number) => (v >= 110 ? "#c8f060" : v >= 100 ? "#f8e070" : "#f4b060");

export function MapBars({ mapId, width = 64 }: { mapId: number; width?: number }) {
  const m = mapView(mapId);
  return (
    <div className="space-y-[3px]">
      {([["러시거리", m.rush], ["자원", m.res], ["복잡도", m.complexity]] as const).map(([label, v]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-10 text-right text-[10px] text-neutral-200 leading-none">{label}</span>
          <div style={{ width }}>
            <div className="h-[9px]" style={{ width: `${Math.max(12, Math.min(100, ((v - 55) / 60) * 100))}%`, background: barColor(v) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MatchupLines({ mapId, className }: { mapId: number; className?: string }) {
  const m = mapView(mapId);
  return (
    <div className={cn("text-[10px] leading-[1.45] text-neutral-200 font-mono whitespace-pre", className)}>
      {`T vs Z = ${m.tvz} : ${100 - m.tvz}\nZ vs P = ${m.zvp} : ${100 - m.zvp}\nP vs T = ${m.pvt} : ${100 - m.pvt}`}
    </div>
  );
}

/** 맵 한 칸: 그림 + 이름, 옆에 막대와 종족전 */
export function MapInfo({ mapId, size = 64, hint, responsive }: { mapId: number; size?: number; hint?: ReactNode; responsive?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5", responsive && "max-[479px]:flex-col max-[479px]:items-center max-[479px]:gap-1.5")}>
      <div className="flex flex-col items-center shrink-0">
        <MapImage mapId={mapId} size={size} />
        <span className="mt-1 text-[12px] text-white whitespace-nowrap">{mapView(mapId).name}</span>
        {hint}
      </div>
      <div className="space-y-2 pt-0.5">
        <MapBars mapId={mapId} />
        <MatchupLines mapId={mapId} className="pl-1" />
      </div>
    </div>
  );
}

// ── 레이더 (원작 배치: 센스를 위로 시계 방향) ─────────────────────────
const RADAR_ORDER: StatKey[] = ["sense", "control", "attack", "harass", "strategy", "supply", "defense", "scout"];

/** base 가 있으면 원래 능력치(회색)와 컨디션·장비 반영 능력치(빨강)를 겹쳐 그리고, 숫자는 원래 값과 변화량 */
export function LegacyRadar({ stats, level, size = 150, base }: { stats: Record<StatKey, number>; level: number; size?: number; base?: Record<StatKey, number> }) {
  const pad = 34;
  const full = size + pad * 2;
  const c = full / 2;
  const r = size / 2;
  const pt = (i: number, k: number) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 8;
    return [c + Math.cos(a) * r * k, c + Math.sin(a) * r * k] as const;
  };
  const outline = RADAR_ORDER.map((_, i) => pt(i, 1).join(",")).join(" ");
  const polyOf = (v: Record<StatKey, number>) => RADAR_ORDER.map((k, i) => pt(i, Math.max(0.05, Math.min(1.1, v[k] / 1000))).join(",")).join(" ");
  const poly = polyOf(stats);
  const grade = legacyGrade(totalOf(stats));
  const high = /^[SAB]/.test(grade);
  return (
    <svg width={full} height={full} viewBox={`0 0 ${full} ${full}`} className="block max-w-full h-auto">
      <polygon points={outline} fill="none" stroke="#9a9a9a" strokeWidth={1.2} />
      {base && <polygon points={polyOf(base)} fill="rgba(200,200,200,0.12)" stroke="#8a8a8a" strokeWidth={1} strokeDasharray="3 2" />}
      <polygon points={poly} fill="none" stroke="#ff4d4d" strokeWidth={1.4} />
      {RADAR_ORDER.map((k, i) => {
        const [x, y] = pt(i, 1.28);
        return (
          <g key={k}>
            <text x={x} y={y - 3} textAnchor="middle" fontSize={10} fill="#e5e5e5">{STAT_LABELS[k]}</text>
            {base ? (
              <text x={x} y={y + 9} textAnchor="middle" fontSize={10} fill="#e5e5e5">
                {Math.round(base[k])}
                {Math.round(stats[k]) !== Math.round(base[k]) && <tspan fill={stats[k] > base[k] ? "#8fe07a" : "#ff8a8a"} fontSize={8.5}>{stats[k] > base[k] ? "+" : ""}{Math.round(stats[k] - base[k])}</tspan>}
              </text>
            ) : <text x={x} y={y + 9} textAnchor="middle" fontSize={10} fill="#e5e5e5">{Math.round(stats[k])}</text>}
          </g>
        );
      })}
      <text x={c} y={c + 2} textAnchor="middle" fontSize={15} fill={high ? "#ffe45c" : "#dcdcdc"}>{grade}</text>
      <text x={c} y={c + 15} textAnchor="middle" fontSize={9} fill="#bdbdbd">Lv. {level}</text>
    </svg>
  );
}

// ── 화면 틀 ────────────────────────────────────────────────────
export function LegacyFrame({ season, children, onNext, nextLabel = "Next (Bar) ▷▷", nextDisabled, bottom, onBack }: {
  season: number;
  /** 왼쪽 위 닫기 (원작의 [R] 자리) */
  onBack?: () => void;
  children: ReactNode;
  onNext?: () => void;
  nextLabel?: ReactNode;
  nextDisabled?: boolean;
  /** Next 버튼 자리에 대신 넣을 내용 (중계 화면의 배속 선택) */
  bottom?: ReactNode;
}) {
  // 스페이스바 = Next (원작 "Next (Bar)")
  useEffect(() => {
    if (!onNext || nextDisabled) return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.code === "Space" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onNext, nextDisabled]);

  return (
    <div className="fixed inset-0 app-fixed-x w-full z-[60] flex flex-col select-none text-white" style={{ ...LEGACY_FONT, background: "linear-gradient(135deg,#9a9a9a 0%,#4a4a4a 18%,#1c1c1c 45%,#2c2c2c 70%,#8a8a8a 100%)" }}>
      <div className="relative h-6 shrink-0 flex items-center justify-center gap-4 text-[12px] text-neutral-100 tracking-wide" style={{ background: "linear-gradient(#bdbdbd,#6f6f6f)", color: "#fff", textShadow: "0 1px 1px #000" }}>
        {onBack && <button onClick={onBack} aria-label="닫기" className="absolute left-1 top-[3px] w-[18px] h-[18px] bg-white text-black text-[11px] font-bold leading-none border border-neutral-600" style={{ textShadow: "none" }}>✕</button>}
        <span>☆</span><span>MyStarcraft</span><span>Season Mode</span><span>{new Date().getFullYear()}</span><span>S{season}</span><span>☆</span>
      </div>
      <div className="relative flex-1 min-h-0 mx-2 mt-2 mb-0">
        <span className="absolute left-1 top-0 text-[9px] font-black italic text-neutral-300/70 leading-none rotate-[-35deg] origin-top-left translate-y-7">MY<br />STARCRAFT</span>
        <div className="h-full p-[2px]" style={{ background: "#7a7a7a", clipPath: "polygon(22px 0,calc(100% - 22px) 0,100% 22px,100% calc(100% - 22px),calc(100% - 22px) 100%,22px 100%,0 calc(100% - 22px),0 22px)" }}>
          <div className="h-full bg-black overflow-y-auto overscroll-contain" style={{ clipPath: "polygon(21px 0,calc(100% - 21px) 0,100% 21px,100% calc(100% - 21px),calc(100% - 21px) 100%,21px 100%,0 calc(100% - 21px),0 21px)" }}>
            {children}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex justify-center safe-bottom">
        <div className="px-6 pt-1.5 pb-2" style={{ background: "linear-gradient(#8a8a8a,#3a3a3a)", clipPath: "polygon(14px 0,calc(100% - 14px) 0,100% 100%,0 100%)" }}>
          {bottom ?? (
            <button
              onClick={onNext}
              disabled={nextDisabled || !onNext}
              className="min-w-[170px] px-4 py-1 text-[15px] font-bold text-black border border-neutral-500 disabled:opacity-40"
              style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 원작 회색 버튼 (맵 이름 칸 등) */
export function GrayBox({ children, className, onClick, active }: { children: ReactNode; className?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("w-full text-center text-black text-[12px] leading-tight py-0.5 border border-neutral-400 truncate", active && "outline outline-2 outline-[#ff6b6b]", className)}
      style={{ background: "linear-gradient(#ffffff,#cfcfcf)" }}
    >
      {children}
    </button>
  );
}
