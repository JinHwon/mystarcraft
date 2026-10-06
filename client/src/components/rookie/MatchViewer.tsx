/**
 * 선수 키우기 경기 관전: 감독 모드와 같은 중계 화면으로 한 판씩, 끝나면 결과 요약
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import type { CareerState, CPlayer } from "@shared/career/rules";
import { mapView } from "@shared/career/view";
import { CLAN_BY_ID, oppLabel, sumStats, withTag, ymd, type Opp, type RookieState } from "@shared/rookie/model";
import type { PlayedGame } from "../../../../server/rookie/logic";
import { Broadcast } from "@/components/legacy/match/broadcast";
import { useSpeed } from "@/components/legacy/match/common";
import { LegacyFrame, TeamLogo } from "@/components/legacy/Legacy";

const ME_ID = 900_000;
function asPlayer(o: { name: string; race: CPlayer["race"]; stats: CPlayer["stats"] }, id: number, extra: Partial<CPlayer> = {}): CPlayer {
  return { id, name: o.name, race: o.race, team: -2, stats: o.stats, level: 1, exp: 0, cond: 100, birth: 1990, gender: "M", wins: 0, losses: 0, sWins: 0, sLosses: 0, titles: [], ...extra };
}
const oppPlayer = (o: Opp, i: number) => asPlayer(o, o.pro ? o.pro.id : ME_ID + 1 + i, o.pro ? { photoOf: o.pro.id } : { photoOf: -1 });
const logoOf = (o?: Opp) => (o?.pro ? <TeamLogo team={ORIG_TEAMS[o.pro.team]} className="w-[64px] h-[38px]" /> : <div className="w-[64px] h-[38px] flex items-center justify-center text-[10px] text-neutral-400 border border-neutral-700">{o?.semipro ? "준프로" : "아마추어"}</div>);
/** "커리지 매치 결승 2세트" → "커리지 매치 결승" (같은 다전제끼리 점수) */
const seriesKey = (label: string) => label.replace(/ \d+세트$/, "");

export function MatchViewer({ s, games, title, extra, onClose }: { s: RookieState; games: PlayedGame[]; title?: string; extra?: ReactNode; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [speed, setSpeed] = useSpeed();
  const fake = { season: ymd(s.day).y - 2025, week: 1, myTeam: -1, teams: [], players: [], matches: [] } as unknown as CareerState;
  const me = asPlayer({ name: withTag(s.name, s.clan ? CLAN_BY_ID[s.clan.id]?.tag : undefined), race: s.race, stats: s.stats }, ME_ID, { photoUrl: s.photo, photoOf: -1 });
  if (i < games.length) {
    const g = games[i];
    const opp = oppPlayer(g.opp, i);
    const key = seriesKey(g.label);
    const prev = games.slice(0, i).filter(x => seriesKey(x.label) === key);
    const score: [number, number] = [prev.filter(x => x.winner === "a").length, prev.filter(x => x.winner === "b").length];
    const myTeam = s.team ? <TeamLogo team={ORIG_TEAMS[s.team.team]} className="w-[64px] h-[38px]" /> : <div className="w-[64px] h-[38px] flex items-center justify-center text-[10px] text-[#8fd0ff] border border-neutral-700">{s.name}</div>;
    return (
      <Broadcast key={i} s={fake} stageName={g.label} lp={me} rp={opp} mapId={g.mapId}
        set={{ mapId: g.mapId, a: ME_ID, b: opp.id, winner: g.winner, duration: g.duration, timeline: g.timeline }}
        leftIsA score={score} leftLogo={myTeam} rightLogo={logoOf(g.opp)} speed={speed} setSpeed={setSpeed}
        onDone={() => setI(i + 1)} onClose={() => setI(games.length)} />
    );
  }
  // 결과 요약
  const w = games.filter(g => g.winner === "a").length;
  const sum: Partial<Record<StatKey, number>> = {};
  for (const g of games) for (const [k, v] of Object.entries(g.fx.stats)) sum[k as StatKey] = (sum[k as StatKey] ?? 0) + (v ?? 0);
  const ladder = games.filter(g => g.fx.ladder);
  return (
    <LegacyFrame season={ymd(s.day).y - 2025} onBack={onClose} onNext={onClose} nextLabel="확인 ▷▷">
      <div className="px-3 pt-4 pb-4 text-white space-y-2">
        <div className="text-center text-[16px] tracking-[0.25em]">{title ?? "경기 결과"}</div>
        <div className="text-center text-[22px] font-black"><span className="text-[#bff5c6]">{w}승</span> <span className="text-[#ffb8c8]">{games.length - w}패</span></div>
        {extra}
        <div className="border border-neutral-600 divide-y divide-neutral-800">
          {games.map((g, k) => (
            <div key={k} className="px-2 py-1 text-[12px] flex items-center gap-1.5">
              <span className={cn("w-6 font-black", g.winner === "a" ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{g.winner === "a" ? "승" : "패"}</span>
              <span className="flex-1 min-w-0 truncate">{g.label} · vs {g.opp.pro ? `${ORIG_TEAMS[g.opp.pro.team].short} ` : g.opp.semipro ? "준프로 " : ""}{oppLabel(g.opp)} <span className="text-neutral-500">({mapView(g.mapId).name} · 능력치 약 {Math.round(sumStats(g.opp.stats) / 100) * 100})</span></span>
              {g.fx.ladder && <span className="text-[10.5px] text-neutral-300">{g.fx.ladder[0]}→{g.fx.ladder[1]}</span>}
            </div>
          ))}
        </div>
        <div className="border border-neutral-700 p-2 text-[11.5px] space-y-0.5">
          <div className="text-neutral-400">능력치 변화</div>
          <div>{Object.entries(sum).filter(([, v]) => v).map(([k, v]) => <span key={k} className={cn("mr-2", v! > 0 ? "text-[#bff5c6]" : "text-[#ffb8c8]")}>{STAT_LABELS[k as StatKey]} {v! > 0 ? "+" : ""}{v}</span>)}{!Object.values(sum).some(v => v) && <span className="text-neutral-500">변화 없음</span>}</div>
          <div className="text-neutral-400">컨디션 {games[0]?.fx.cond[0]}% → {games[games.length - 1]?.fx.cond[1]}%{ladder.length ? ` · 래더 ${ladder[0].fx.ladder![0]} → ${ladder[ladder.length - 1].fx.ladder![1]}` : ""}</div>
        </div>
      </div>
    </LegacyFrame>
  );
}
