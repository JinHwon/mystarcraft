/**
 * 구단 이력: 트로피 요약 + 시즌별 기록 (프로리그 우승·준우승, 2부 1위, 승강, 개인리그 우승자·준우승자 배출)
 */
import { cn } from "@/lib/utils";
import { INDIV_SHORT, type CareerState, type IndivLeague } from "@shared/career/rules";
import { teamHonors, type TeamHonorRow } from "@shared/career/view";
import { LegacyImg } from "@/components/legacy/Legacy";

const TROPHY_COLOR: Record<IndivLeague, string> = { mysl: "#c9a0ff", msl: "#7fd0ff", osl: "#ffb46b" };

function Trophy({ label, n, color, img }: { label: string; n: number; color: string; img?: string }) {
  return (
    <div className={cn("border px-1 py-1 text-center", n ? "" : "opacity-40")} style={{ borderColor: `${color}80`, background: n ? `linear-gradient(${color}22, transparent)` : undefined }}>
      <div className="h-6 flex items-center justify-center">
        {img ? <LegacyImg dir="기타" name={img} className="h-5 w-5" fallback={<span className="text-[16px]">🏆</span>} /> : <span className="text-[17px] leading-none" style={{ color }}>🏆</span>}
      </div>
      <div className="text-[15px] font-black leading-tight" style={{ color }}>{n}</div>
      <div className="text-[9.5px] text-neutral-400 leading-tight">{label}</div>
    </div>
  );
}

function rowText(s: CareerState, r: TeamHonorRow) {
  const p = r.player !== undefined ? s.players[r.player] : undefined;
  switch (r.kind) {
    case "pro": return { icon: "🏆", text: "마이프로리그 우승", c: "text-[#ffe45c]" };
    case "proRunnerUp": return { icon: "🥈", text: "마이프로리그 준우승", c: "text-neutral-200" };
    case "div2": return { icon: "🎖️", text: "2부 리그 1위", c: "text-[#bff5c6]" };
    case "up": return { icon: "⬆️", text: "1부 승격", c: "text-[#bff5c6]" };
    case "down": return { icon: "⬇️", text: "2부 강등", c: "text-[#ffb8c8]" };
    default: return { icon: r.place === 1 ? "🥇" : "🥈", text: `${INDIV_SHORT[r.league!]} ${r.place === 1 ? "우승" : "준우승"} · ${p?.name ?? "?"}`, c: r.place === 1 ? "text-[#ffe45c]" : "text-neutral-200" };
  }
}

export function TeamHistory({ s, tid, compact }: { s: CareerState; tid: number; compact?: boolean }) {
  const rows = teamHonors(s, tid);
  const count = (f: (r: TeamHonorRow) => boolean) => rows.filter(f).length;
  const leagues: IndivLeague[] = ["mysl", "msl", "osl"];
  const seasons = [...new Set(rows.map(r => r.season))];
  return (
    <div className="space-y-2 text-white">
      <div className="grid grid-cols-4 gap-1">
        <Trophy label="프로리그 우승" n={count(r => r.kind === "pro")} color="#ffe45c" />
        <Trophy label="프로리그 준우승" n={count(r => r.kind === "proRunnerUp")} color="#cfcfcf" />
        <Trophy label="2부 1위" n={count(r => r.kind === "div2")} color="#8fe07a" />
        <Trophy label="승격" n={count(r => r.kind === "up")} color="#8fd0ff" />
      </div>
      <div className="grid grid-cols-3 gap-1">
        {leagues.map(l => (
          <div key={l} className="border px-1.5 py-1 text-center" style={{ borderColor: `${TROPHY_COLOR[l]}80` }}>
            <div className="text-[11px] font-bold" style={{ color: TROPHY_COLOR[l] }}>{INDIV_SHORT[l]}</div>
            <div className="text-[12px]">
              <LegacyImg dir="기타" name="금배지" className="inline-block w-3.5 h-3.5 align-[-2px]" fallback={<span>🥇</span>} /> {count(r => r.kind === "indiv" && r.league === l && r.place === 1)}
              <span className="mx-1 text-neutral-600">·</span>
              <LegacyImg dir="기타" name="은배지" className="inline-block w-3.5 h-3.5 align-[-2px]" fallback={<span>🥈</span>} /> {count(r => r.kind === "indiv" && r.league === l && r.place === 2)}
            </div>
            <div className="text-[9.5px] text-neutral-500">우승자 · 준우승자 배출</div>
          </div>
        ))}
      </div>
      <div className={cn("border border-neutral-700", compact ? "max-h-56 overflow-y-auto" : "")}>
        {!seasons.length && <div className="text-center text-[11.5px] text-neutral-500 py-4">아직 이력이 없습니다 (시즌이 끝나면 쌓입니다)</div>}
        {seasons.map(season => (
          <div key={season} className="grid grid-cols-[48px_1fr] gap-1.5 px-2 py-1 border-b border-neutral-800 last:border-b-0 text-[12px]">
            <span className="text-neutral-400">{season}시즌</span>
            <span className="space-y-0.5">
              {rows.filter(r => r.season === season).map((r, i) => {
                const x = rowText(s, r);
                return <span key={i} className={cn("block", x.c)}>{x.icon} {x.text}</span>;
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
