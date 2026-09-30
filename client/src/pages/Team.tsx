import { ITEM_BY_KEY, POTION_LIMIT, SLOT_NAMES, gearStats, type EquipSlot } from "@shared/career/items";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ageOf, askingPrice, gradeColor, legacyGrade, youthGrowth, totalOf, type CareerState, type CPlayer } from "@shared/career/rules";
import { reserveOf, rosterOf, teamPower } from "@shared/career/view";
import { ContractEditor } from "@/components/legacy/Club";
import { PlayerPhoto } from "@/components/legacy/Legacy";
import { playerDemand, popularity, potentialStars } from "@shared/career/contract";
import { BONUS_NAMES, type BonusKey } from "@shared/career/rules";
import { useCareer, useCareerUpdater } from "@/lib/career";
import { CondBadge, RaceBadge, RACE_NAME, StatBars, TeamBadge } from "@/components/career/Bits";
import { StatRadarChart } from "@/components/StatRadarChart";

type Sort = "total" | "cond" | "level" | "age";

export function PlayerSheet({ s, player, onClose, actions }: { s: CareerState; player: CPlayer | null; onClose: () => void; actions?: React.ReactNode }) {
  return (
    <Sheet open={!!player} onOpenChange={o => !o && onClose()}>
      <SheetContent side="bottom" className="app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border max-h-[88vh] overflow-y-auto safe-bottom">
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
              <div className="text-xs text-amber-300">🏆 {player.titles.join(" · ")}</div>
            )}
            <div className="rounded-xl bg-muted/50 p-2.5 text-xs space-y-0.5">
              <div>📄 계약: <b>{player.contract ? `남은 ${player.contract.years}시즌 · 연봉 ${player.contract.salary.toLocaleString()}만원` : "없음 (무소속)"}</b></div>
              {player.contract?.minApps ? <div>출전 보장: 시즌 {player.contract.minApps}경기 (이번 시즌 {player.sApps ?? 0}경기 출전)</div> : null}
              {player.contract?.bonus && Object.keys(player.contract.bonus).length > 0 && <div>보너스: {Object.entries(player.contract.bonus).map(([k, v]) => `${BONUS_NAMES[k as BonusKey]} ${v}만`).join(" · ")}</div>}
              <div>인기 {popularity(player)} · 사기 {player.morale ?? 70}{player.wantsOut ? " · 😤 이적 희망" : ""}</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-2.5 text-xs">
              <div className="font-bold mb-1">🛠️ 장착 장비 · 포션 {player.potions ?? 0}/{POTION_LIMIT}</div>
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

/** 2부 리그 순위표와 이번 주 우리 선수 경기 */
function ReserveLeagueCard({ s, onPick }: { s: CareerState; onPick: (id: number) => void }) {
  const L = s.reserveLeague?.season === s.season ? s.reserveLeague : undefined;
  if (!L) {
    return <div className="rounded-xl bg-card border border-border p-2.5 text-xs text-muted-foreground">🏟️ 2부 리그는 정규시즌 1주차가 끝나면 시작합니다 (우리 2부 선수 + 무소속 유망주 16명 안팎)</div>;
  }
  const order = [...L.field].sort((a, b) => {
    const [aw, al] = L.table[a] ?? [0, 0], [bw, bl] = L.table[b] ?? [0, 0];
    return bw - aw || (bw - bl) - (aw - al) || totalOf(s.players[b].stats) - totalOf(s.players[a].stats);
  });
  const mineGames = L.last.filter(g => s.players[g.a]?.team === s.myTeam || s.players[g.b]?.team === s.myTeam);
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
      <div className="text-sm font-bold text-foreground">🏟️ {s.season}시즌 2부 리그{L.champion !== undefined && <span className="ml-1.5 text-amber-300 text-xs">우승 {s.players[L.champion]?.name}</span>}</div>
      {mineGames.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[11px] text-muted-foreground">지난 주 우리 선수 경기</div>
          {mineGames.map((g, i) => {
            const me = s.players[g.a].team === s.myTeam ? g.a : g.b, opp = me === g.a ? g.b : g.a;
            const won = g.winner === me, d = g.gain[me] ?? 0;
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className={won ? "text-emerald-300 font-bold w-5" : "text-rose-300 font-bold w-5"}>{won ? "승" : "패"}</span>
                <span className="font-bold text-foreground">{s.players[me].name}</span>
                <span className="text-muted-foreground">vs {s.players[opp]?.name}</span>
                <span className={cn("ml-auto font-mono", d >= 0 ? "text-emerald-300" : "text-rose-300")}>능력치 {d >= 0 ? "+" : ""}{d}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="divide-y divide-border/60">
        {order.map((id, i) => {
          const p = s.players[id];
          if (!p) return null;
          const [w, l] = L.table[id] ?? [0, 0];
          const mine = p.team === s.myTeam;
          return (
            <button key={id} onClick={() => onPick(id)} className={cn("w-full flex items-center gap-1.5 py-1 text-xs text-left", mine && "bg-amber-500/10")}>
              <span className="w-5 text-muted-foreground font-bold">{i + 1}</span>
              <RaceBadge race={p.race} />
              <span className={cn("truncate", mine ? "text-amber-200 font-bold" : "text-foreground")}>{p.name}</span>
              <span className="text-[10px] text-muted-foreground">{ageOf(p, s.season)}세{mine ? "" : " · 무소속"}</span>
              <span className="ml-auto font-mono text-muted-foreground">{totalOf(p.stats).toLocaleString()}</span>
              <span className="w-12 text-right font-bold text-foreground">{w}승 {l}패</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Team() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  const updater = useCareerUpdater();
  const [sort, setSort] = useState<Sort>("total");
  const [open, setOpen] = useState<number | null>(null);
  const [squad, setSquad] = useState<"first" | "reserve">("first");
  const [reply, setReply] = useState<string | null>(null);
  const demote = trpc.career.demote.useMutation({ ...updater, onSuccess: r => { updater.onSuccess(r); toast.success("2부로 내려보냈습니다"); setOpen(null); } });
  const promote = trpc.career.contract.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); const res = r.result as { result: string; message: string }; setReply(res.message); if (res.result === "signed") { toast.success(res.message); setOpen(null); } },
    onError: e => setReply(e.message),
  });
  const release = trpc.career.release.useMutation({
    ...updater,
    onSuccess: r => { updater.onSuccess(r); toast.success(`방출 완료 (방출 이득 ${r.result.gain.toLocaleString()}만원)`); setOpen(null); },
  });

  const roster = useMemo(() => {
    if (!s) return [];
    const list = squad === "first" ? rosterOf(s, s.myTeam) : reserveOf(s, s.myTeam);
    return list.sort((a, b) =>
      sort === "total" ? totalOf(gearStats(b)) - totalOf(gearStats(a))
        : sort === "cond" ? b.cond - a.cond
        : sort === "level" ? b.level - a.level
        : ageOf(a, s.season) - ageOf(b, s.season));
  }, [s, sort, squad]);

  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  const me = s.teams[s.myTeam];
  const races = { terran: 0, zerg: 0, protoss: 0 } as Record<string, number>;
  roster.forEach(p => races[p.race]++);
  const player = open !== null ? s.players[open] : null;

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{ background: me.color }}>{me.short}</div>
        <div className="flex-1">
          <div className="font-black text-foreground">{me.name}</div>
          <div className="text-xs text-muted-foreground">{roster.length}명 · 테란 {races.terran} / 저그 {races.zerg} / 프로토스 {races.protoss} · 전력 {teamPower(s, s.myTeam).toLocaleString()}</div>
        </div>
      </div>
      <button onClick={() => navigate("/training")} className="w-full rounded-xl bg-primary text-primary-foreground font-bold py-2.5 text-sm">🏋️ 선수 행동 (훈련·휴식·이벤트)</button>

      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border">
        {([["first", `1부 (${rosterOf(s, s.myTeam).length})`], ["reserve", `2부 육성 (${reserveOf(s, s.myTeam).length}/10)`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSquad(k)} className={cn("py-2 rounded-lg text-sm font-bold", squad === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {squad === "reserve" && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-2.5 text-xs text-foreground">
          <div className="font-bold mb-0.5">🌱 2부 육성 방법</div>
          <div>① 이적시장 → 스카웃에서 어린 무소속 유망주를 <b>"2부로 영입"</b> (또는 1부 선수를 2부로 보내기)</div>
          <div>② 2부 선수는 정규시즌 동안 <b>2부 리그</b>(개인리그)에 자동 출전 — 매주 2경기 + 훈련으로 능력치가 오르내립니다</div>
          <div>③ 어릴수록 훨씬 빨리 큽니다 (17세 이하 ×2.2 · 18~19세 ×1.8 · 20~21세 ×1.4 · 22~23세 ×1.0 · 그 위는 느림), 어린 선수는 져도 덜 떨어짐</div>
          <div>④ 잘 크면 선수를 눌러 <b>1부 승격 계약</b> — 연봉이 싸서 부담이 적습니다</div>
          {reserveOf(s, s.myTeam).length === 0 && <button onClick={() => navigate("/transfer")} className="block mt-1 text-primary font-bold">이적시장에서 유망주 찾기 ›</button>}
        </div>
      )}
      {squad === "reserve" && <ReserveLeagueCard s={s} onPick={id => { if (s.players[id]?.team === s.myTeam) { setOpen(id); setReply(null); } }} />}

      <div className="flex gap-1.5">
        {([["total", "능력치순"], ["cond", "컨디션순"], ["level", "레벨순"], ["age", "나이순"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border", sort === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {roster.map(p => (
          <button key={p.id} onClick={() => { setOpen(p.id); setReply(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-muted/40">
            <PlayerPhoto id={p.photoOf ?? p.id} name={p.name} titles={p.titles} size={38} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <RaceBadge race={p.race} />
                <span className="font-bold text-foreground truncate">{p.name}</span>
                <span className="text-[10px] text-muted-foreground">Lv.{p.level} · {ageOf(p, s.season)}세</span>
                {squad === "reserve" && <span className="text-[10px] text-amber-300">재능 {potentialStars(p)} · 성장 ×{youthGrowth(ageOf(p, s.season))}</span>}
                {p.wantsOut && <span className="text-[10px] text-rose-300 font-bold">이적희망</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CondBadge cond={p.cond} />
                <span className="text-emerald-300 font-bold">⚡{p.ap ?? 20}</span>
                <span>{p.sWins}승 {p.sLosses}패</span>
                {squad === "reserve" && s.reserveLeague?.season === s.season && s.reserveLeague.table[p.id] && <span className="text-emerald-300">2부 {s.reserveLeague.table[p.id][0]}승 {s.reserveLeague.table[p.id][1]}패</span>}
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
          {player.reserve ? (
            <>
              <div className="text-xs text-muted-foreground">1부 승격: 선수와 1부 계약을 맺어야 합니다</div>
              {reply && <div className="text-xs text-amber-300">{reply}</div>}
              <div className="rounded-xl bg-black p-1">
                <ContractEditor player={player} demand={playerDemand(s, player, s.myTeam)} pending={promote.isPending} submitLabel="⬆️ 1부 승격 계약"
                  onSubmit={c => promote.mutate({ playerId: player.id, salary: c.salary, years: c.years, minApps: c.minApps, bonus: c.bonus, promote: true })} />
              </div>
            </>
          ) : (
            <button onClick={() => { if (confirm(`${player.name} 선수를 2부로 내려보낼까요? (주전급은 사기가 크게 떨어집니다)`)) demote.mutate({ playerId: player.id }); }}
              disabled={demote.isPending} className="w-full py-2.5 rounded-xl text-sm font-semibold text-sky-200 bg-sky-500/10 border border-sky-400/30">⬇️ 2부로 보내기</button>
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
