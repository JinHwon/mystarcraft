/**
 * 선수 순위 (원작 "선수 순위" 화면): 베스트 플레이어 · 테란전 · 저그전 · 프로토스전
 * 이번 시즌 / 통산 전적으로 볼 수 있다
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { CareerState, CPlayer, Race } from "@shared/career/rules";
import { activePlayers } from "@shared/career/view";
import { LegacyImg, MslBadges, TeamLogo, mslMedals } from "@/components/legacy/Legacy";

type Kind = "best" | Race;
const KINDS: Array<[Kind, string]> = [["best", "베스트"], ["terran", "vs 테란"], ["zerg", "vs 저그"], ["protoss", "vs 토스"]];
const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
const pct = (w: number, l: number) => (w + l ? Math.round((w / (w + l)) * 100) : 0);

export function PlayerRanking({ s }: { s: CareerState }) {
  const [kind, setKind] = useState<Kind>("best");
  const [scope, setScope] = useState<"season" | "career">("season");
  const [mineOnly, setMineOnly] = useState(false);
  const rec = (p: CPlayer, k: Kind): [number, number] => {
    if (k === "best") return scope === "season" ? [p.sWins, p.sLosses] : [p.wins, p.losses];
    return (scope === "season" ? p.sVs?.[k] : p.vs?.[k]) ?? [0, 0];
  };
  const rows = useMemo(() => {
    const list = activePlayers(s).filter(p => !mineOnly || p.team === s.myTeam);
    const score = (p: CPlayer) => {
      const [w, l] = rec(p, kind);
      // 베스트: 승수 → 승률 → (통산이면 우승 횟수 먼저)
      const medal = mslMedals(p.titles);
      return [kind === "best" && scope === "career" ? medal.gold * 2 + medal.silver : 0, w, pct(w, l), -l];
    };
    return list
      .map(p => ({ p, k: score(p) }))
      .filter(x => kind !== "best" || rec(x.p, kind)[0] + rec(x.p, kind)[1] > 0 || scope === "career")
      .sort((a, b) => { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return b.k[i] - a.k[i]; return a.p.name.localeCompare(b.p.name, "ko"); })
      .slice(0, mineOnly ? 40 : 30)
      .map(x => x.p);
  }, [s, kind, scope, mineOnly]);
  const races: Race[] = ["terran", "zerg", "protoss"];
  return (
    <div className="rounded-2xl bg-black border border-neutral-700 overflow-hidden text-white">
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <LegacyImg dir="기타" name="best" className="w-[72px] h-[48px] object-contain" fallback={<span className="text-[20px]">🏆</span>} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-black tracking-[0.25em]">선수 순위</div>
          <div className="flex gap-1 mt-1">
            {([["season", `${s.season}시즌`], ["career", "통산"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={cn("px-2 py-0.5 text-[11px] border", scope === k ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>{l}</button>
            ))}
            <button onClick={() => setMineOnly(!mineOnly)} className={cn("ml-auto px-2 py-0.5 text-[11px] border", mineOnly ? "border-[#8fd0ff] text-[#8fd0ff]" : "border-neutral-700 text-neutral-400")}>우리 팀만</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 px-2.5 pt-2">
        {KINDS.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={cn("py-1 text-[12px] border", kind === k ? "text-black border-white font-bold" : "text-neutral-300 border-neutral-700")}
            style={kind === k ? { background: "linear-gradient(#ffffff,#cfcfcf)" } : undefined}>{l}</button>
        ))}
      </div>
      <table className="w-full text-[12px] mt-1.5">
        <thead className="text-[10.5px] text-neutral-400">
          <tr className="border-b border-neutral-800">
            <th className="w-6 py-1">#</th><th className="text-left">선수</th>
            <th className="w-9" title="개인리그 우승·준우승">우승</th>
            {kind === "best" ? (
              <>
                <th>전적</th>
                {races.map(r => <th key={r} className="w-[38px]">vs{R[r]}</th>)}
              </>
            ) : <><th>vs {R[kind]} 전적</th><th className="w-12">승률</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const [w, l] = rec(p, kind);
            const t = s.teams[p.team];
            return (
              <tr key={p.id} className={cn("border-b border-neutral-900", p.team === s.myTeam && "bg-[#1b2a3a]")}>
                <td className={cn("text-center py-[3px]", i < 3 ? "text-[#ffe45c] font-bold" : "text-neutral-500")}>{i + 1}</td>
                <td className="py-[3px]">
                  <span className="flex items-center gap-1 min-w-0">
                    {t ? <TeamLogo team={t} className="w-[30px] h-[18px] shrink-0" /> : <span className="w-[30px] text-[9px] text-neutral-500">무소속</span>}
                    <span className={cn("truncate", p.team === s.myTeam ? "text-[#8fd0ff]" : "text-neutral-100")}>{p.name}</span>
                    <span className="text-neutral-500 text-[10.5px]">({R[p.race]})</span>
                  </span>
                </td>
                <td className="text-center"><MslBadges titles={p.titles} size={12} /></td>
                {kind === "best" ? (
                  <>
                    <td className="text-center whitespace-nowrap">{w}/{l} <span className="text-[10px] text-neutral-500">{pct(w, l)}%</span></td>
                    {races.map(r => {
                      const [a, b] = (scope === "season" ? p.sVs?.[r] : p.vs?.[r]) ?? [0, 0];
                      return <td key={r} className="text-center text-[10.5px] text-neutral-400">{a + b ? `${pct(a, b)}%` : "-"}</td>;
                    })}
                  </>
                ) : (
                  <>
                    <td className="text-center">{w} / {l}</td>
                    <td className={cn("text-center", pct(w, l) >= 60 ? "text-[#bff5c6]" : pct(w, l) < 40 && w + l ? "text-[#ffb8c8]" : "text-neutral-300")}>{w + l ? `${pct(w, l)}%` : "-"}</td>
                  </>
                )}
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={7} className="text-center text-neutral-500 py-6">아직 경기 기록이 없습니다</td></tr>}
        </tbody>
      </table>
      <p className="text-[10px] text-neutral-500 px-2.5 py-2">
        {kind === "best" ? "베스트: 승수 → 승률 순" + (scope === "career" ? " (통산은 개인리그 우승 횟수 먼저)" : "") : "그 종족 상대 승수 → 승률 순"} · 프로리그·개인리그 모든 경기 · 상위 {mineOnly ? 40 : 30}명
        {scope === "season" && kind !== "best" ? " · 종족별 시즌 전적은 이번 업데이트부터 기록됩니다" : ""}
      </p>
    </div>
  );
}
