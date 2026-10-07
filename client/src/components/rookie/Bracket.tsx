/**
 * 선수 키우기: 토너먼트 대진표 — 다음 상대 정보를 보고 내 경기를 한 판씩 진행
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { RACE_NAMES, oppLabel, roundName, sumStats, type Bracket, type Opp, type RookieState } from "@shared/rookie/model";
import { PlayerPhoto } from "@/components/legacy/Legacy";

const raceShort = (r: Opp["race"]) => RACE_NAMES[r].slice(0, 1);
const tags = (o: Opp) => [o.rival ? "⚡라이벌" : "", o.pro ? `프로 ${ORIG_TEAMS[o.pro.team]?.short ?? ""}` : "", o.semipro ? "준프로" : ""].filter(Boolean);

/** 전체 대진표: 라운드마다 경기 목록 (이긴 쪽은 굵게, 내 경기는 강조) */
export function BracketTree({ b, openRound }: { b: Bracket; openRound?: number }) {
  const total = Math.log2(b.size);
  const [open, setOpen] = useState<number | null>(openRound ?? null);
  return (
    <div className="space-y-1">
      {Array.from({ length: total }, (_, r) => {
        const round = b.rounds[r];
        const isOpen = open === r || (open === null && r === b.round && !b.done);
        const mineOut = round?.find(m => m.a === b.me || m.b === b.me);
        return (
          <div key={r} className="rounded-xl border border-border bg-muted/20">
            <button onClick={() => setOpen(isOpen ? -1 : r)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
              <span className="text-[12.5px] font-black text-foreground">{roundName(b.size, r)}</span>
              <span className="text-[10.5px] text-muted-foreground">{round ? `${round.length}경기` : "아직 정해지지 않음"}</span>
              {mineOut?.w !== undefined && <span className={cn("ml-auto text-[11px] font-black", mineOut.w === b.me ? "text-emerald-300" : "text-rose-300")}>{mineOut.w === b.me ? "승" : "패"}</span>}
              {round && r === b.round && !b.done && <span className="ml-auto text-[10.5px] text-amber-300 font-bold">← 지금</span>}
              <span className="text-[10px] text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && round && (
              <div className="px-2 pb-2 space-y-0.5">
                {round.map((m, i) => {
                  const A = b.players[m.a], B = b.players[m.b];
                  const mine = m.a === b.me || m.b === b.me;
                  const cell = (idx: number, o: Opp) => (
                    <span className={cn("flex-1 min-w-0 truncate", m.w === idx ? "font-black text-foreground" : m.w !== undefined ? "text-muted-foreground line-through decoration-1" : "text-foreground", idx === b.me && "text-primary")}>
                      {oppLabel(o)} <span className="text-[10px] text-muted-foreground">{raceShort(o.race)}</span>
                    </span>
                  );
                  return (
                    <div key={i} className={cn("flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11.5px]", mine ? "bg-primary/10 ring-1 ring-primary/50" : "bg-background/40")}>
                      {cell(m.a, A)}
                      <span className="text-[10px] text-muted-foreground shrink-0">{m.sets ? `${m.sets[0]}:${m.sets[1]}` : "vs"}</span>
                      {cell(m.b, B)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 진행 중인 대회: 다음 상대 정보 + 대진표 */
export function BracketPanel({ s, b, busy, onPlay }: { s: RookieState; b: Bracket; busy: boolean; onPlay: (quick: boolean) => void }) {
  const round = b.rounds[b.round];
  const m = round?.find(x => x.a === b.me || x.b === b.me);
  const opp = m ? b.players[m.a === b.me ? m.b : m.a] : undefined;
  const final = round?.length === 1;
  const me = sumStats(s.stats);
  const them = opp ? sumStats(opp.stats) : 0;
  const k = (c: number) => 0.6 + 0.4 * (c / 100);
  const myPower = Math.round(me * k(s.cond)), oppPower = opp ? Math.round(them * k(opp.cond ?? 80)) : 0;
  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-amber-400/60 bg-amber-500/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{b.kind === "courage" ? "🎓" : "🏆"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-black text-foreground truncate">{b.title}</div>
            <div className="text-[11px] text-muted-foreground">{b.size}강 토너먼트 · 지금 <b className="text-amber-300">{roundName(b.size, b.round)}</b>{final ? " (3판 2선승)" : ""} · 한 번 지면 탈락</div>
          </div>
        </div>
      </div>
      {opp && (
        <div className="rounded-2xl bg-card border border-primary/50 p-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">다음 상대 · {roundName(b.size, b.round)}</div>
          <div className="flex items-center gap-3">
            <PlayerPhoto id={opp.pro ? opp.pro.id : -1} name={opp.name} size={52} />
            <div className="flex-1 min-w-0">
              <div className="font-black text-foreground truncate">{oppLabel(opp)}</div>
              <div className="text-[11.5px] text-muted-foreground">{RACE_NAMES[opp.race]}{tags(opp).length ? ` · ${tags(opp).join(" · ")}` : ""}</div>
              <div className="text-[11.5px]">능력치 <b className="text-foreground">{them.toLocaleString()}</b> <span className="text-muted-foreground">(나 {me.toLocaleString()})</span> · 컨디션 <b className={cn((opp.cond ?? 80) >= 70 ? "text-emerald-300" : "text-amber-300")}>{opp.cond ?? 80}%</b> <span className="text-muted-foreground">(나 {s.cond}%)</span></div>
            </div>
          </div>
          <div className="rounded-xl bg-muted/30 border border-border p-2 space-y-1">
            <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">실전 능력 (컨디션 반영)</span><span><b className="text-primary">{myPower.toLocaleString()}</b> vs <b className="text-rose-300">{oppPower.toLocaleString()}</b></span></div>
            <div className="h-2 rounded-full bg-black/30 overflow-hidden flex"><div className="bg-primary" style={{ width: `${(myPower / Math.max(1, myPower + oppPower)) * 100}%` }} /><div className="bg-rose-400 flex-1" /></div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {STAT_KEYS.map(key => {
              const mv = s.stats[key], ov = opp.stats[key];
              return (
                <div key={key} className="rounded-lg bg-muted/40 px-1 py-1 text-center">
                  <div className="text-[10px] text-muted-foreground">{STAT_LABELS[key]}</div>
                  <div className="text-[11px]"><b className={mv >= ov ? "text-emerald-300" : "text-foreground"}>{mv}</b><span className="text-muted-foreground">/</span><b className={ov > mv ? "text-rose-300" : "text-foreground"}>{ov}</b></div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground">칸마다 나 / 상대 · 컨디션이 낮으면 실전 능력이 떨어집니다 (상점에서 비타비타로 회복할 수 있어요)</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onPlay(false)} disabled={busy} className="rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-black disabled:opacity-40">▶ 경기 시작 (중계)</button>
            <button onClick={() => onPlay(true)} disabled={busy} className="rounded-xl border border-primary text-primary py-2.5 text-sm font-black disabled:opacity-40">⏩ 결과만 보기</button>
          </div>
        </div>
      )}
      <div className="text-[12px] font-black text-foreground px-0.5">📋 대진표</div>
      <BracketTree b={b} />
    </div>
  );
}
