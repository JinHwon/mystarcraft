/**
 * 선수 키우기: 오늘 한 일의 결과 + 다음 선택일까지 자동으로 지나간 날들
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { DOW, dateText, ymd } from "@shared/rookie/model";
import type { DayReport, PlayedGame } from "../../../../server/rookie/logic";
import { BatchBody, type BatchResult } from "./Batch";
import { BracketTree } from "./Bracket";
import { CLAN_BY_ID, type Bracket, type ClanWar } from "@shared/rookie/model";

/** 활동 하나를 마친 결과 (서버 act 의 반환) */
export interface ActResult {
  activity: string;
  title: string;
  reports: DayReport[];
  batch?: BatchResult;
  games?: PlayedGame[];
  stream?: { viewers: number; balloons: number; money: number };
  rest?: { cond: [number, number] };
  work?: { money: number };
  mentor?: { mentor: string; delta: Partial<Record<StatKey, number>>; price: number };
  won?: boolean;
  place?: number; prize?: number; name?: string;
  rank?: number; team?: number; squad?: number;
  /** 대회·커리지 매치 대진표 (시작할 때, 끝났을 때) */
  bracket?: Bracket;
  /** 클랜전 결과 */
  war?: ClanWar; win?: boolean; score?: [number, number]; oppClan?: string; played?: boolean; myWon?: boolean;
}

const dayText = (d: number) => `${dateText(d).slice(5)} (${DOW[ymd(d).dow]})`;
const sumOf = (st: DayReport["stats"]) => Object.values(st).reduce((a, b) => a + (b ?? 0), 0);

function DayRow({ r }: { r: DayReport }) {
  const [open, setOpen] = useState(false);
  const sum = sumOf(r.stats);
  return (
    <div className="rounded-xl bg-muted/30 border border-border">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
        <span className="text-[11px] text-muted-foreground w-[62px] shrink-0">{dayText(r.day)}</span>
        <span className="flex-1 min-w-0 text-[12.5px] text-foreground truncate">{r.title}</span>
        {r.w + r.l > 0 && <span className="text-[11px] shrink-0"><b className="text-emerald-300">{r.w}</b>-<b className="text-rose-300">{r.l}</b></span>}
        {sum !== 0 && <span className={cn("text-[11px] shrink-0 font-bold", sum > 0 ? "text-emerald-300" : "text-rose-300")}>{sum > 0 ? "+" : ""}{sum}</span>}
        <span className="text-[10px] text-muted-foreground shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-[11px] text-muted-foreground space-y-0.5">
          <div>컨디션 {r.cond[0]}% → {r.cond[1]}%{r.money ? ` · 돈 ${r.money > 0 ? "+" : ""}${r.money}만` : ""}</div>
          {Object.entries(r.stats).filter(([, v]) => v).length > 0 && <div>{Object.entries(r.stats).filter(([, v]) => v).map(([k, v]) => `${STAT_LABELS[k as StatKey]} ${v! > 0 ? "+" : ""}${v}`).join(" · ")}</div>}
          {r.notes.map((n, i) => <div key={i} className="text-foreground/80">{n}</div>)}
        </div>
      )}
    </div>
  );
}

function Primary({ res }: { res: ActResult }) {
  if (res.batch) return <BatchBody r={res.batch} />;
  const line = (children: React.ReactNode) => <div className="text-center text-[14px] text-foreground py-2 space-y-1">{children}</div>;
  if (res.stream) return line(<><div className="text-2xl">📺</div><div>시청자 <b className="text-amber-300">{res.stream.viewers}명</b> · 별풍선 {res.stream.balloons}개</div><div className="text-emerald-300 font-bold">+{res.stream.money}만원</div></>);
  if (res.rest) return line(<><div className="text-2xl">💤</div><div>컨디션 {res.rest.cond[0]}% → <b className="text-emerald-300">{res.rest.cond[1]}%</b></div></>);
  if (res.work) return line(<><div className="text-2xl">💼</div><div>아르바이트로 <b className="text-emerald-300">+{res.work.money}만원</b></div></>);
  if (res.mentor) return line(<><div className="text-2xl">📚</div><div>{res.mentor.mentor} 선수에게 과외 (-{res.mentor.price}만원)</div><div className="text-emerald-300">{Object.entries(res.mentor.delta).filter(([, v]) => v).map(([k, v]) => `${STAT_LABELS[k as StatKey]} ${v! > 0 ? "+" : ""}${v}`).join(" · ")}</div></>);
  if (res.place !== undefined) return line(<><div className="text-2xl">{res.place === 1 ? "🏆" : res.place === 2 ? "🥈" : res.place === 3 ? "🥉" : "🎮"}</div><div className="font-black text-[16px] text-amber-300">{res.place === 1 ? "우승!" : res.place === 2 ? "준우승" : res.place === 3 ? "3위" : `${res.place}강 탈락`}</div>{res.prize ? <div className="text-emerald-300">상금 {res.prize}만원</div> : null}</>);
  if (res.score && res.oppClan) return line(<><div className="text-2xl">{res.win ? "🏆" : "💧"}</div><div className="font-black text-[16px] text-amber-300">클랜전 {res.score[0]} : {res.score[1]} {res.win ? "승리!" : "패배"}</div><div className="text-[12px] text-muted-foreground">vs [{CLAN_BY_ID[res.oppClan]?.tag}] {CLAN_BY_ID[res.oppClan]?.name}{res.played ? ` · 내 세트 ${res.myWon ? "승" : "패"}` : " · 관전"}</div></>);
  if (res.rank !== undefined) return line(<><div className="text-2xl">📋</div><div>드래프트 {res.rank}위{res.team !== undefined ? " · 구단에 지명되었습니다 🎉" : ""}</div></>);
  if (res.squad !== undefined) return line(<><div className="text-2xl">{res.won ? "⬆️" : "🛡️"}</div><div>승강전 {res.won ? "승리" : "패배"} · 지금 {res.squad}군</div></>);
  if (res.won !== undefined) return line(<><div className="text-2xl">{res.won ? "🎉" : "💧"}</div><div className="font-black">{res.won ? "합격!" : "불합격"}</div></>);
  return null;
}

export function ReportView({ res, nextStop, onClose }: { res: ActResult; nextStop?: string; onClose: () => void }) {
  const [first, ...autos] = res.reports;
  const total = autos.reduce((a, r) => ({ w: a.w + r.w, l: a.l + r.l, st: a.st + sumOf(r.stats), money: a.money + r.money }), { w: 0, l: 0, st: 0, money: 0 });
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-card border border-border p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <div className="text-[11px] text-muted-foreground">{first ? dayText(first.day) : ""}</div>
          <div className="text-lg font-black text-foreground">{res.title}</div>
        </div>
        <Primary res={res} />
        {res.bracket && res.place !== undefined && <details className="rounded-xl border border-border bg-muted/20 px-2.5 py-1.5"><summary className="text-[12px] font-black text-foreground cursor-pointer">📋 최종 대진표 보기</summary><div className="mt-1.5"><BracketTree b={res.bracket} openRound={res.bracket.rounds.length - 1} /></div></details>}
        {first && first.notes.length > 0 && (
          <div className="rounded-xl bg-muted/30 border border-border p-2 space-y-0.5">
            {first.notes.map((n, i) => <div key={i} className="text-[11.5px] text-foreground/85">{n}</div>)}
          </div>
        )}
        {autos.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-black text-foreground">🌙 자동으로 지나간 {autos.length}일</span>
              <span className="text-[11px] text-muted-foreground">{total.w + total.l ? `${total.w}승 ${total.l}패 · ` : ""}능력치 {total.st >= 0 ? "+" : ""}{total.st}{total.money ? ` · 돈 ${total.money > 0 ? "+" : ""}${total.money}만` : ""}</span>
            </div>
            {autos.map(r => <DayRow key={r.day} r={r} />)}
          </div>
        )}
        {nextStop && <div className="rounded-xl bg-primary/10 border border-primary/40 px-3 py-2 text-center text-[12.5px] text-foreground">⭐ 이제 <b>{nextStop}</b> — 다음 활동을 고르세요</div>}
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-black">확인</button>
      </div>
    </div>
  );
}
