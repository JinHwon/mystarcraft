/**
 * 구단 정보: 모든 프로리그 구단의 성적·전력·선수단 보기 (?id=구단번호 로 바로 열기)
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ageOf, gradeColor, legacyGrade, totalOf } from "@shared/career/rules";
import { gearStats } from "@shared/career/items";
import { DIV_NAMES, bTeamIdOf, divOf, rosterOf, standings, teamPower } from "@shared/career/view";
import { useCareer } from "@/lib/career";
import { PlayerPhoto } from "@/components/legacy/Legacy";
import { CondBadge, RaceBadge, TeamBadge } from "@/components/career/Bits";
import { PlayerSheet } from "./Team";

type Sort = "total" | "cond" | "level" | "age";

export default function Teams() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const [team, setTeam] = useState<number | null>(() => {
    const v = Number(new URLSearchParams(window.location.search).get("id"));
    return Number.isInteger(v) && v >= 0 && new URLSearchParams(window.location.search).has("id") ? v : null;
  });
  const [sort, setSort] = useState<Sort>("total");
  const [open, setOpen] = useState<number | null>(null);
  const tid = team ?? s?.myTeam ?? 0;
  const div = s ? divOf(s, tid) : 1;
  // 고른 팀 리그의 순위 (구단 고르기는 1부·2부 탭)
  const [picked, setPickDiv] = useState<1 | 2 | null>(null);
  const pickDiv = picked ?? div;
  const st = useMemo(() => (s ? standings(s, pickDiv) : []), [s, pickDiv]);
  const roster = useMemo(() => {
    if (!s) return [];
    return rosterOf(s, tid).sort((a, b) =>
      sort === "total" ? totalOf(gearStats(b)) - totalOf(gearStats(a))
        : sort === "cond" ? b.cond - a.cond
        : sort === "level" ? b.level - a.level
        : ageOf(a, s.season) - ageOf(b, s.season));
  }, [s, tid, sort]);

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const t = s.teams[tid];
  if (!t) return null;
  const divSt = standings(s, div);
  const rank = divSt.findIndex(x => x.id === tid) + 1;
  // 승강전 구역: 1부 11·12위, 2부 1·2위
  const promoZone = (d: 1 | 2, i: number, n: number) => (d === 1 ? i >= n - 2 : i < 2);
  const parent = t.parent !== undefined ? s.teams[t.parent] : undefined;
  const bTeam = bTeamIdOf(s, tid);
  const races = { terran: 0, zerg: 0, protoss: 0 } as Record<string, number>;
  rosterOf(s, tid).forEach(p => races[p.race]++);
  const titles = s.history.filter(h => h.champion === tid).length;
  const mslPlayers = s.msl && s.msl.season === s.season
    ? Object.entries(s.msl.placements).filter(([id]) => s.players[Number(id)]?.team === tid).map(([id, place]) => `${s.players[Number(id)].name}(${place})`)
    : [];
  const player = open !== null ? s.players[open] : null;
  const select = (id: number) => {
    setTeam(id); setOpen(null);
    window.history.replaceState(null, "", `/teams?id=${id}`);
  };

  return (
    <div className="p-4 space-y-3">
      <div className="text-center text-lg font-black text-foreground">🏢 구단 정보</div>

      {/* 구단 고르기 (리그별 순위순) */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border">
        {([1, 2] as const).map(d => (
          <button key={d} onClick={() => setPickDiv(d)} className={cn("py-1.5 rounded-lg text-sm font-bold", pickDiv === d ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{DIV_NAMES[d]} 리그</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {st.map((x, i) => (
          <button key={x.id} onClick={() => select(x.id)}
            className={cn("flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left", x.id === tid ? "bg-primary/20 border-primary" : promoZone(pickDiv, i, st.length) ? "bg-card border-amber-400/40" : "bg-card border-border")}>
            <span className="text-[10px] font-bold text-muted-foreground w-3">{i + 1}</span>
            <TeamBadge short={x.short} color={x.color} />
            <span className={cn("text-[11px] truncate", x.id === s.myTeam ? "text-amber-200 font-bold" : "text-foreground")}>{x.name}</span>
          </button>
        ))}
      </div>

      {/* 구단 요약 */}
      <div className="rounded-2xl bg-card border border-border p-3.5 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{ background: t.color }}>{t.short}</div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-foreground truncate">{t.name}{tid === s.myTeam && <span className="ml-1.5 text-[10px] text-amber-300">우리 팀</span>}</div>
            <div className="text-xs text-muted-foreground">{DIV_NAMES[div]} {rank > 0 ? `${rank}위 · ` : ""}{t.wins}승 {t.losses}패 · 세트 {t.setWins}:{t.setLosses}{rank > 0 && promoZone(div, rank - 1, divSt.length) ? " · 승강전 구역" : ""}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ["전력", teamPower(s, tid).toLocaleString()],
            ["선수", `${rosterOf(s, tid).length}명`],
            ["자금", `${t.money.toLocaleString()}만`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-sm font-bold text-foreground">{v}</div></div>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>종족 구성: 테란 {races.terran} · 저그 {races.zerg} · 프로토스 {races.protoss}</div>
          {titles > 0 && <div className="text-amber-300">🏆 프로리그 우승 {titles}회</div>}
          {parent && <button onClick={() => { select(parent.id); setPickDiv(divOf(s, parent.id)); }} className="text-primary font-bold">모구단: {parent.name} ({DIV_NAMES[divOf(s, parent.id)]}) ›</button>}
          {bTeam !== undefined && <button onClick={() => { select(bTeam); setPickDiv(divOf(s, bTeam)); }} className="block text-primary font-bold">B팀: {s.teams[bTeam].name} ({DIV_NAMES[divOf(s, bTeam)]}) ›</button>}
          {mslPlayers.length > 0 && <div>🎮 이번 시즌 개인리그: {mslPlayers.join(", ")}</div>}
        </div>
      </div>

      <div className="flex gap-1.5">
        {([["total", "능력치순"], ["cond", "컨디션순"], ["level", "레벨순"], ["age", "나이순"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", sort === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {roster.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">선수가 없습니다</div>}
        {roster.map(p => {
          const grade = legacyGrade(totalOf(gearStats(p)));
          return (
            <button key={p.id} onClick={() => setOpen(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-muted/40">
              <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={38} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <RaceBadge race={p.race} />
                  <span className="font-bold text-foreground truncate">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">Lv.{p.level} · {ageOf(p, s.season)}세</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <CondBadge cond={p.cond} />
                  <span>{p.sWins}승 {p.sLosses}패</span>
                  <span>통산 {p.wins}승 {p.losses}패</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black font-mono" style={{ color: gradeColor(grade) }}>{grade}</div>
                <div className="text-[11px] font-mono text-foreground">{totalOf(gearStats(p)).toLocaleString()}</div>
              </div>
            </button>
          );
        })}
      </div>

      <PlayerSheet
        s={s}
        player={player}
        onClose={() => setOpen(null)}
        actions={player && player.team !== s.myTeam && (
          <button onClick={() => navigate("/transfer")} className="w-full py-2.5 rounded-xl text-sm font-semibold text-foreground bg-card border border-border">🤝 이적시장으로</button>
        )}
      />
    </div>
  );
}
