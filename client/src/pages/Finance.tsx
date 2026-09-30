/**
 * 재정 관리 (가계부): 현재 자금, 시즌 수입·지출, 주차별 거래 내역(항목·내용·금액·잔액)
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { OPERATING_COST, type CareerState, type CashEntry } from "@shared/career/rules";
import { teamWages } from "@shared/career/contract";
import { activeSponsors } from "@shared/career/sponsor";
import { useCareer } from "@/lib/career";

type Filter = "all" | "in" | "out";

const won = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString()}`;
const tone = (v: number) => (v > 0 ? "text-emerald-300" : v < 0 ? "text-rose-300" : "text-muted-foreground");

function Summary({ s, entries }: { s: CareerState; entries: CashEntry[] }) {
  const me = s.teams[s.myTeam];
  const income = entries.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const expense = entries.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0);
  const wages = teamWages(s, s.myTeam);
  const sponsor = activeSponsors(s).reduce((a, x) => a + x.weekly, 0);
  const weekly = sponsor - Math.round(wages / 11) - OPERATING_COST;
  return (
    <div className="rounded-2xl bg-card border border-border p-3.5 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">현재 보유 금액</span>
        <span className={cn("text-2xl font-black", me.money < 0 ? "text-rose-300" : "text-amber-300")}>{me.money.toLocaleString()}<span className="text-sm font-bold"> 만원</span></span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
        <div className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">수입</div><div className="font-bold text-emerald-300">+{income.toLocaleString()}</div></div>
        <div className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">지출</div><div className="font-bold text-rose-300">{expense.toLocaleString()}</div></div>
        <div className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">손익</div><div className={cn("font-bold", tone(income + expense))}>{won(income + expense)}</div></div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        매주 고정: 스폰서 +{sponsor} · 연봉 -{Math.round(wages / 11)} (정규시즌) · 운영비 -{OPERATING_COST} → <b className={tone(weekly)}>{won(weekly)}만원</b> (경기 수당 제외)
      </div>
    </div>
  );
}

/** 항목별 합계 */
function ByCategory({ entries }: { entries: CashEntry[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const e of entries) { const r = m.get(e.cat) ?? { sum: 0, n: 0 }; r.sum += e.amount; r.n++; m.set(e.cat, r); }
    return [...m.entries()].sort((a, b) => b[1].sum - a[1].sum);
  }, [entries]);
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl bg-card border border-border p-3.5">
      <div className="text-sm font-bold text-foreground mb-1.5">📊 항목별 합계</div>
      {rows.map(([cat, r]) => (
        <div key={cat} className="flex justify-between text-xs py-0.5">
          <span className="text-muted-foreground">{cat} <span className="text-[10px]">({r.n}건)</span></span>
          <span className={cn("font-bold", tone(r.sum))}>{won(r.sum)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Finance() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  return <FinanceScreen s={s} />;
}

function FinanceScreen({ s }: { s: CareerState }) {
  const all = s.cashbook ?? [];
  const seasons = useMemo(() => [...new Set(all.map(e => e.season))].sort((a, b) => b - a), [all]);
  const [season, setSeason] = useState(s.season);
  const [filter, setFilter] = useState<Filter>("all");
  const inSeason = all.filter(e => e.season === season);
  const shown = inSeason.filter(e => filter === "all" || (filter === "in" ? e.amount > 0 : e.amount < 0));
  // 주차별로 묶어 최근 주부터 (주 안에서는 일어난 순서)
  const weeks = useMemo(() => {
    const m = new Map<number, CashEntry[]>();
    for (const e of shown) m.set(e.week, [...(m.get(e.week) ?? []), e]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [shown]);
  const weekEnd = (w: number) => [...inSeason].reverse().find(e => e.week === w)?.balance;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-foreground">💰 재정 관리</h1>
        <span className="text-xs text-muted-foreground">{s.teams[s.myTeam].name} · {s.season}시즌 {s.phase === "offseason" ? "비시즌" : `${s.week}주차`}</span>
      </div>
      <Summary s={s} entries={inSeason} />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="보기 설정">
        {(seasons.length ? seasons : [s.season]).map(x => (
          <button key={x} onClick={() => setSeason(x)} aria-pressed={season === x}
            className={cn("px-2.5 py-1 rounded-full text-xs border", season === x ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{x}시즌</button>
        ))}
        <span className="flex-1" />
        {([["all", "전체"], ["in", "수입"], ["out", "지출"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
            className={cn("px-2.5 py-1 rounded-full text-xs border", filter === k ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground")}>{label}</button>
        ))}
      </div>

      {!weeks.length && (
        <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
          아직 기록된 거래가 없습니다<br /><span className="text-xs">경기 수당·연봉·아이템 구입 등 돈이 움직이면 여기에 쌓입니다</span>
        </div>
      )}
      {weeks.map(([w, list]) => {
        const net = list.reduce((a, e) => a + e.amount, 0);
        const end = weekEnd(w);
        return (
          <section key={w} className="rounded-2xl bg-card border border-border overflow-hidden" aria-label={`${w}주차 거래`}>
            <div className="flex items-center justify-between px-3.5 py-2 bg-muted/50">
              <span className="text-sm font-bold text-foreground">{w}주차</span>
              <span className="text-xs text-muted-foreground">
                합계 <b className={tone(net)}>{won(net)}</b>{end !== undefined && <> · 주말 잔액 <b className="text-foreground">{end.toLocaleString()}</b></>}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {list.map((e, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-x-2 px-3.5 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{e.cat}</div>
                    {e.note && <div className="text-[11px] text-muted-foreground truncate">{e.note}</div>}
                  </div>
                  <div className="text-right">
                    <div className={cn("text-sm font-bold", tone(e.amount))}>{won(e.amount)}</div>
                    <div className="text-[10.5px] text-muted-foreground">잔액 {e.balance.toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <ByCategory entries={inSeason} />
      <p className="text-[11px] text-muted-foreground text-center">금액 단위: 만원 · 최근 거래 {all.length}건 보관</p>
    </div>
  );
}
