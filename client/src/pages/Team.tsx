import { ITEM_BY_KEY, SLOT_NAMES, gearStats, type EquipSlot } from "@shared/career/items";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { navigate as navigateTo } from "wouter/use-browser-location";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BENCH_DECAY_WEEKS, B_MAX_ROSTER, B_MIN_ROSTER, MAX_ROSTER, SQUAD_MIN, adaptWeeksLeft, ageOf, askingPrice, gradeColor, legacyGrade, youthGrowth, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { DIV_NAMES, bTeamIdOf, divOf, myDiv, rosterOf, teamPower } from "@shared/career/view";
import { PlayerPhoto, TitleChips } from "@/components/legacy/Legacy";
import { popularity, potentialStars } from "@shared/career/contract";
import { BONUS_NAMES, type BonusKey } from "@shared/career/rules";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge, RACE_NAME, StatBars, TeamBadge } from "@/components/career/Bits";
import { StatRadarChart } from "@/components/StatRadarChart";

type Sort = "total" | "cond" | "level" | "age";

export function PlayerSheet({ s, player, onClose, actions }: { s: CareerState; player: CPlayer | null; onClose: () => void; actions?: React.ReactNode }) {
  return (
    <Sheet open={!!player} onOpenChange={o => !o && onClose()}>
      {/* 원작 화면(LegacyFrame, z-60) 위에서도 보이게 */}
      <SheetContent side="bottom" overlayClassName="z-[80]" className="z-[80] app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border max-h-[88vh] overflow-y-auto safe-bottom">
        {player && (
          <div className="p-4 space-y-3">
            <SheetHeader className="p-0">
              <SheetTitle className="flex items-center gap-2 text-left">
                <PlayerPhoto id={player.photoOf ?? player.id} name={player.name} titles={player.titles} size={52} />
                <RaceBadge race={player.race} />
                <span className="text-lg">{player.name}</span>
                <TeamBadge short={s.teams[player.team].short} color={s.teams[player.team].color} />
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                ["종족", RACE_NAME[player.race]],
                ["레벨", `Lv.${player.level}`],
                ["나이", `${ageOf(player, s.season)}세`],
                ["능력치", totalOf(player.stats).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-sm font-bold text-foreground">{v}</div></div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>컨디션 <CondBadge cond={player.cond} />{player.team === s.myTeam && <span className="ml-2 text-emerald-300 font-bold">⚡ 행동력 {player.ap ?? 20}</span>}</span>
              <span>이번 시즌 {player.sWins}승 {player.sLosses}패 · 통산 {player.wins}승 {player.losses}패</span>
            </div>
            <div className="flex justify-center"><StatRadarChart stats={player.stats} grade={legacyGrade(totalOf(gearStats(player)))} gradeColor={s.teams[player.team].color} gradeTextColor={gradeColor(legacyGrade(totalOf(gearStats(player))))} size={200} maxValue={1000} /></div>
            <StatBars stats={player.stats} />
            {player.titles && player.titles.length > 0 && (
              <TitleChips titles={player.titles} />
            )}
            {player.team === s.myTeam && <H2HBox s={s} player={player} />}
            <div className="rounded-xl bg-muted/50 p-2.5 text-xs space-y-0.5">
              <div>📄 계약: <b>{player.contract ? `남은 ${player.contract.years}시즌 · 연봉 ${player.contract.salary.toLocaleString()}만원` : "없음 (무소속)"}</b></div>
              {player.contract?.minApps ? <div>출전 보장: 시즌 {player.contract.minApps}경기 (이번 시즌 {player.sApps ?? 0}경기 출전)</div> : null}
              {player.contract?.bonus && Object.keys(player.contract.bonus).length > 0 && <div>보너스: {Object.entries(player.contract.bonus).map(([k, v]) => `${BONUS_NAMES[k as BonusKey]} ${v}만`).join(" · ")}</div>}
              <div>인기 {popularity(player)} · 사기 {player.morale ?? 70}{player.wantsOut ? " · 😤 이적 희망" : ""}{adaptWeeksLeft(s, player) ? ` · 🧳 이적 적응기간 (프로리그 ${adaptWeeksLeft(s, player)}주 뒤 출전 가능)` : ""}{(player.benchWeeks ?? 0) >= BENCH_DECAY_WEEKS ? ` · 📉 프로리그 ${player.benchWeeks}주 결장 (실전 감각 저하 중)` : ""}</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-2.5 text-xs">
              <div className="font-bold mb-1">🛠️ 장착 장비 · 이번 시즌 포션 {player.potions ?? 0}회</div>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(SLOT_NAMES) as EquipSlot[]).map(slot => {
                  const e = player.equip?.[slot];
                  const it = e ? ITEM_BY_KEY[e.key] : undefined;
                  return (
                    <div key={slot} className="flex items-center justify-between rounded-lg bg-background/40 px-2 py-1">
                      <span className="text-muted-foreground">{SLOT_NAMES[slot]}</span>
                      <span className={it ? "text-foreground font-bold" : "text-muted-foreground/60"}>{it ? `${it.name} · 남은 ${e!.left}경기` : "없음"}</span>
                    </div>
                  );
                })}
              </div>
              {player.team === s.myTeam && (
                <button onClick={() => navigateTo(`/shop?cat=${encodeURIComponent("마우스")}&player=${player.id}`)} className="mt-1.5 w-full rounded-lg bg-background/60 border border-border py-1.5 font-bold text-foreground">🛒 장비 바꾸기 (상점에서 이 선수에게 장착)</button>
              )}
              {player.equip && Object.keys(player.equip).length > 0 && <div className="mt-1 text-[10.5px] text-muted-foreground">장비 효과: 능력치 {totalOf(gearStats(player)) - totalOf(player.stats) >= 0 ? "+" : ""}{(totalOf(gearStats(player)) - totalOf(player.stats)).toLocaleString()} (경기마다 1회씩 닳음)</div>}
            </div>
            <div className="text-[11px] text-muted-foreground">영입 시세 약 {askingPrice(player, s.season).toLocaleString()}만원</div>
            {actions}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** 상대 선수별 전적: 통산 또는 시즌별 (우리 팀 선수만 기록) */
function H2HBox({ s, player }: { s: CareerState; player: CPlayer }) {
  const seasons = Object.keys(player.h2hS ?? {}).map(Number).sort((a, b) => b - a);
  const [scope, setScope] = useState<"all" | number>("all");
  const [open, setOpen] = useState(false);
  const rec = scope === "all" ? player.h2h : player.h2hS?.[scope];
  const rows = Object.entries(rec ?? {})
    .map(([id, r]) => ({ o: s.players[Number(id)], w: r[0], l: r[1] }))
    .filter(x => x.o && x.w + x.l > 0)
    .sort((a, b) => b.w + b.l - (a.w + a.l) || b.w - a.w);
  const total = rows.reduce((acc, x) => [acc[0] + x.w, acc[1] + x.l], [0, 0]);
  return (
    <div className="rounded-xl bg-muted/50 p-2.5 text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between font-bold">
        <span>⚔️ 상대 전적</span>
        <span className="text-muted-foreground font-normal">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {(["all", ...seasons] as const).map(k => (
              <button key={k} onClick={() => setScope(k)} className={cn("rounded-full border px-2 py-0.5", scope === k ? "bg-primary text-primary-foreground border-primary font-bold" : "border-border text-muted-foreground")}>{k === "all" ? "통산" : `${k}시즌${k === s.season ? " (이번)" : ""}`}</button>
            ))}
          </div>
          {rows.length ? (
            <>
              <div className="text-muted-foreground">{scope === "all" ? "통산" : `${scope}시즌`} 상대 {rows.length}명 · <b className="text-foreground">{total[0]}승 {total[1]}패</b> ({Math.round((total[0] / Math.max(1, total[0] + total[1])) * 100)}%)</div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                {rows.map(x => (
                  <div key={x.o.id} className="flex items-center gap-1.5 px-2 py-1">
                    <RaceBadge race={x.o.race} />
                    <span className="flex-1 truncate font-bold text-foreground">{x.o.name}</span>
                    <span className="text-[10.5px] text-muted-foreground truncate max-w-[72px]">{s.teams[x.o.team]?.short ?? "무소속"}</span>
                    <span className="w-[62px] text-right tabular-nums"><b className={x.w >= x.l ? "text-emerald-300" : "text-muted-foreground"}>{x.w}</b>승 <b className={x.l > x.w ? "text-rose-300" : "text-muted-foreground"}>{x.l}</b>패</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="text-muted-foreground py-1">{scope === "all" ? "아직 맞붙은 상대가 없습니다" : "이 시즌에는 기록된 맞대결이 없습니다"}</div>}
          <div className="text-[10px] text-muted-foreground">전적 기록은 이 기능이 생긴 뒤의 경기부터 시즌별로 쌓입니다 (이전 시즌 경기는 통산에만 포함될 수 있습니다)</div>
        </div>
      )}
    </div>
  );
}

export default function Team() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const [sort, setSort] = useState<Sort>("total");
  const [open, setOpen] = useState<number | null>(null);
  const toB = trpc.career.sendToB.useMutation({ ...updater, onSuccess: r => { updater.onSuccess(r); toast.success("B팀(2부)으로 보냈습니다"); setOpen(null); } });
  const release = trpc.career.release.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`방출 완료 (방출 이득 ${r.result.gain.toLocaleString()}만원)`); setOpen(null); },
  });

  const roster = useMemo(() => {
    if (!s) return [];
    return rosterOf(s, s.myTeam).sort((a, b) =>
      sort === "total" ? totalOf(gearStats(b)) - totalOf(gearStats(a))
        : sort === "cond" ? b.cond - a.cond
        : sort === "level" ? b.level - a.level
        : ageOf(a, s.season) - ageOf(b, s.season));
  }, [s, sort]);

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const me = s.teams[s.myTeam];
  const races = { terran: 0, zerg: 0, protoss: 0 } as Record<string, number>;
  roster.forEach(p => races[p.race]++);
  const player = open !== null ? s.players[open] : null;
  const div = myDiv(s);
  const bTeam = bTeamIdOf(s, s.myTeam);
  const { min, max } = div === 2 ? { min: B_MIN_ROSTER, max: B_MAX_ROSTER } : { min: SQUAD_MIN, max: MAX_ROSTER };

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{ background: me.color }}>{me.short}</div>
        <div className="flex-1">
          <div className="font-black text-foreground">{me.name} <span className="text-xs text-muted-foreground">{DIV_NAMES[div]}</span></div>
          <div className="text-xs text-muted-foreground">{roster.length}명 (최소 {min}·최대 {max}) · 테란 {races.terran} / 저그 {races.zerg} / 프로토스 {races.protoss} · 전력 {teamPower(s, s.myTeam).toLocaleString()}</div>
        </div>
      </div>
      <button onClick={() => navigate("/training")} className="w-full rounded-xl bg-primary text-primary-foreground font-bold py-2.5 text-sm">🏋️ 선수 행동 (훈련·휴식·이벤트)</button>

      {bTeam !== undefined ? (
        <button onClick={() => navigate(`/teams?id=${bTeam}`)} className="w-full text-left rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-2.5 text-xs text-foreground">
          <div className="font-bold">🌱 우리 구단 B팀: {s.teams[bTeam].name} ({DIV_NAMES[divOf(s, bTeam)]}, {rosterOf(s, bTeam).length}명) ›</div>
          <div className="text-muted-foreground mt-0.5">선수를 눌러 B팀으로 보내면 2부 경기에서 뛰며 성장합니다 (어릴수록 빨리). B팀 선수는 영입 요청으로 시세의 절반에 다시 데려올 수 있습니다.</div>
        </button>
      ) : div === 2 && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-2.5 text-xs text-foreground">
          <div className="font-bold">🏟️ 2부 팀 운영</div>
          <div className="text-muted-foreground mt-0.5">2부 리그 1·2위는 승강전에서 이기면 1부로 올라갑니다. 2부 경기는 어린 선수일수록 크게 성장하고, 키운 선수를 1부에 보내면 육성 지원금을 더 받습니다 (같은 구단 1군 이적료의 50%, 다른 구단 20%). 리그 규정상 최소 {B_MIN_ROSTER}명, 서브 스폰서는 1곳.</div>
        </div>
      )}

      <div className="flex gap-1.5">
        {([["total", "능력치순"], ["cond", "컨디션순"], ["level", "레벨순"], ["age", "나이순"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", sort === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {roster.map(p => (
          <button key={p.id} onClick={() => setOpen(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-muted/40">
            <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={38} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <RaceBadge race={p.race} />
                <span className="font-bold text-foreground truncate">{p.name}</span>
                <span className="text-[10px] text-muted-foreground">Lv.{p.level} · {ageOf(p, s.season)}세</span>
                {div === 2 && <span className="text-[10px] text-amber-300">재능 {potentialStars(p)} · 성장 ×{youthGrowth(ageOf(p, s.season))}</span>}
                {p.wantsOut && <span className="text-[10px] text-rose-300 font-bold">이적희망</span>}
                {adaptWeeksLeft(s, p) > 0 && <span className="text-[10px] text-sky-300 font-bold">적응 {adaptWeeksLeft(s, p)}주</span>}
                {(p.benchWeeks ?? 0) >= BENCH_DECAY_WEEKS && <span className="text-[10px] text-orange-300 font-bold">📉 결장 {p.benchWeeks}주</span>}
                {(p.benchWeeks ?? 0) === BENCH_DECAY_WEEKS - 1 && s.phase === "regular" && <span className="text-[10px] text-yellow-300 font-bold">⏳ 결장 1주</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CondBadge cond={p.cond} />
                <span className="text-emerald-300 font-bold">⚡{p.ap ?? 20}</span>
                <span>{p.sWins}승 {p.sLosses}패</span>
              </div>
              <div className={cn("text-[10.5px]", (p.contract?.years ?? 9) <= 1 ? "text-amber-300 font-bold" : "text-muted-foreground")}>
                📄 계약 {p.contract ? `남은 ${p.contract.years}시즌 · 연봉 ${p.contract.salary.toLocaleString()}만` : "없음"}{(p.contract?.years ?? 9) <= 1 ? " · 이번 시즌 만료" : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black font-mono" style={{ color: gradeColor(legacyGrade(totalOf(gearStats(p)))) }}>{legacyGrade(totalOf(gearStats(p)))}</div>
              <div className="text-[11px] font-mono text-foreground">{totalOf(gearStats(p)).toLocaleString()}</div>
            </div>
          </button>
        ))}
      </div>

      <PlayerSheet
        s={s}
        player={player}
        onClose={() => setOpen(null)}
        actions={player && (
          <div className="space-y-2">
          {bTeam !== undefined && (
            <button onClick={() => { if (confirm(`${player.name} 선수를 ${s.teams[bTeam].name}(으)로 보낼까요? 우리 선수단에서 빠지고, 다시 데려올 때는 영입 요청(시세의 절반)이 필요합니다.`)) toB.mutate({ playerId: player.id }); }}
              disabled={toB.isPending} className="w-full py-2.5 rounded-xl text-sm font-semibold text-sky-200 bg-sky-500/10 border border-sky-400/30">⬇️ B팀({s.teams[bTeam].name})으로 보내기</button>
          )}
          <button
            onClick={() => { if (confirm(`${player.name} 선수를 방출할까요? 무소속 선수가 됩니다.`)) release.mutate({ playerId: player.id }); }}
            disabled={release.isPending}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30"
          >👋 방출 (방출 이득 약 {Math.round(askingPrice(player, s.season) * 0.2 / 10) * 10}만원)</button>
          </div>
        )}
      />
    </div>
  );
}
