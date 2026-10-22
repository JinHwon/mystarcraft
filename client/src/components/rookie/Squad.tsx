/**
 * 선수 키우기: 팀 내 입지(역할·코치 신뢰도·면담·임대)와 에이전트
 */
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useRookieSync, type RookieToday } from "@/lib/rookie";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { dateText, type RookieState } from "@shared/rookie/model";
import { AGENTS, CLAUSES, LOAN_DAYS, ROLES, TALK_COOLDOWN, agentOf } from "@shared/rookie/squad";

export function SquadCard({ s, today }: { s: RookieState; today: RookieToday }) {
  const sync = useRookieSync();
  const talk = trpc.rookie.askPlayTime.useMutation(sync);
  const loan = trpc.rookie.requestLoan.useMutation(sync);
  const t = s.team, info = today.squad;
  if (!t || !info) return null;
  const role = info.role ? ROLES[info.role] : null;
  const trustColor = info.trust >= 70 ? "#4ade80" : info.trust >= 45 ? "#facc15" : "#f87171";
  const talkLeft = (s.flags?.talk ?? -999) + TALK_COOLDOWN - s.day;
  const loanLeft = (s.flags?.loanTry ?? -999) + 14 - s.day;
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-black text-foreground">🧢 팀 내 입지</span>
        {role ? <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-primary/15 text-primary">{role.icon} {role.name}</span> : <span className="text-[11px] rounded-full px-2 py-0.5 bg-muted text-muted-foreground">2군 유망주</span>}
        {t.loan && <span className="text-[11px] rounded-full px-2 py-0.5 bg-sky-500/15 text-sky-300">🔁 임대 중 · {dateText(t.loan.until).slice(5)}까지</span>}
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="w-[74px] shrink-0 text-muted-foreground">코치 신뢰도</span>
        <div className="flex-1 h-2.5 rounded bg-muted/50 overflow-hidden"><div className="h-full rounded" style={{ width: `${info.trust}%`, background: trustColor }} /></div>
        <span className="w-8 text-right font-bold tabular-nums" style={{ color: trustColor }}>{info.trust}</span>
      </div>
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {role && <div>· {role.desc}{t.squad === 1 ? ` · 1군에 나보다 강한 동료 ${info.rank}명` : ""}</div>}
        {(t.promiseUntil ?? -1) >= s.day && <div className="text-emerald-300">· 감독의 출전 약속: {dateText(t.promiseUntil!).slice(5)}까지</div>}
        {t.clause && <div>· 계약 조건: {CLAUSES[t.clause.kind].name}{t.clause.winBonus ? ` (1승마다 ${t.clause.winBonus}만원)` : ""}{t.squad === 1 ? ` · 이번 달 프로리그 ${t.monthPro ?? 0}경기` : ""}</div>}
        {t.loan && <div>· 임대 평점 {t.loan.n ? (t.loan.sum / t.loan.n).toFixed(2) : "-"} ({t.loan.n}경기) · 평균 7.0 이상이면 원 소속 1군 복귀</div>}
        <div>· 신뢰도는 평점이 좋을수록 오르고, 감독 메일에 어떻게 답하느냐에 따라서도 바뀝니다</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => talk.mutate()} disabled={talk.isPending || talkLeft > 0 || !!t.loan}
          className="rounded-xl border border-primary/50 bg-primary/10 py-2 text-[12px] font-bold text-foreground disabled:opacity-40">
          🗣️ 출전 기회 요구{talkLeft > 0 ? ` (${talkLeft}일 뒤)` : ""}
        </button>
        <button onClick={() => confirm(`다른 구단 1군으로 ${LOAN_DAYS}일 임대를 요청할까요? (2군만, 2주에 한 번)`) && loan.mutate()} disabled={loan.isPending || t.squad === 1 || loanLeft > 0 || !!t.loan}
          className="rounded-xl border border-sky-400/50 bg-sky-500/10 py-2 text-[12px] font-bold text-foreground disabled:opacity-40">
          🔁 임대 요청{t.squad === 1 ? " (2군만)" : loanLeft > 0 ? ` (${loanLeft}일 뒤)` : ""}
        </button>
      </div>
    </div>
  );
}

export function AgentCard({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const hire = trpc.rookie.hireAgent.useMutation(sync);
  const fire = trpc.rookie.fireAgent.useMutation(sync);
  const cur = agentOf(s);
  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-black text-foreground">💼 에이전트</span>
        <span className="text-[11px] text-muted-foreground">{cur ? `${cur.name} (${dateText(s.agent!.since).slice(2)}부터)` : "없음"}</span>
        {cur && <button onClick={() => confirm(`${cur.name}과(와) 계약을 끝낼까요? (계약금은 돌려받지 못합니다)`) && fire.mutate()} className="ml-auto text-[11px] text-rose-300">해지</button>}
      </div>
      <div className="space-y-1">
        {AGENTS.map(a => {
          const mine = s.agent?.tier === a.tier;
          const lock = s.fame < a.fame;
          return (
            <div key={a.tier} className={cn("flex items-center gap-2 rounded-xl border p-2", mine ? "border-primary/60 bg-primary/10" : "border-border")}>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-bold text-foreground">{a.name} <span className="text-[10.5px] font-normal text-muted-foreground">· 인지도 {a.fame}↑ · 계약금 {a.hire}만</span></div>
                <div className="text-[10.5px] text-muted-foreground">{a.desc}</div>
              </div>
              {mine ? <span className="text-[11px] text-primary font-bold shrink-0">계약 중</span> : (
                <button onClick={() => confirm(`${a.name}과(와) 계약할까요? 계약금 ${a.hire}만원, 월급날마다 ${Math.round(a.fee * 100)}% 수수료`) && hire.mutate({ tier: a.tier })}
                  disabled={hire.isPending || lock || s.money < a.hire} className="shrink-0 rounded-lg bg-amber-500 text-black text-[11px] font-black px-2 py-1 disabled:opacity-40">{lock ? "인지도 부족" : "계약"}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
