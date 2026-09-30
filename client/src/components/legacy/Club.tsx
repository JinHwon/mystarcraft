/**
 * 구단 운영 공용 조각: 금액 입력, 계약 조건 편집기
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BONUS_NAMES, type BonusKey, type Contract, type CPlayer } from "@shared/career/rules";

export function FeeStepper({ value, onChange, steps = [100, 500], max }: { value: number; onChange: (v: number) => void; steps?: number[]; max?: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(max ?? Infinity, Math.round(v / 10) * 10));
  return (
    <div className="flex items-center gap-1">
      {[...steps].reverse().map(d => <button key={-d} onClick={() => onChange(clamp(value - d))} className="border border-neutral-600 px-1.5 text-[11px]">-{d}</button>)}
      <input
        value={value}
        onChange={e => onChange(clamp(Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
        inputMode="numeric"
        className="w-20 bg-black border border-neutral-500 text-center text-[#ffe45c] text-[13px] py-0.5"
      />
      {steps.map(d => <button key={d} onClick={() => onChange(clamp(value + d))} className="border border-neutral-600 px-1.5 text-[11px]">+{d}</button>)}
    </div>
  );
}

export function ContractText({ c }: { c?: Contract }) {
  if (!c) return <span className="text-neutral-500">계약 없음</span>;
  return (
    <span>
      연봉 {c.salary.toLocaleString()}만 · {c.years}년
      {c.minApps ? ` · 출전보장 ${c.minApps}경기` : ""}
      {Object.entries(c.bonus ?? {}).map(([k, v]) => ` · ${BONUS_NAMES[k as BonusKey]} ${v}만`).join("")}
    </span>
  );
}

/** 계약 조건 편집: 선수 요구안을 보고 연봉·기간·출전 보장·보너스를 조정해 제안 */
export function ContractEditor({ player, demand, onSubmit, pending, submitLabel = "계약 제안" }: {
  player: CPlayer; demand: Contract; onSubmit: (c: Contract) => void; pending: boolean; submitLabel?: string;
}) {
  const [c, setC] = useState<Contract>(demand);
  useEffect(() => setC(demand), [player.id, demand.salary, demand.years, demand.minApps]);
  const setBonus = (k: BonusKey, v: number) => setC(prev => {
    const bonus = { ...prev.bonus, [k]: v };
    if (!v) delete bonus[k];
    return { ...prev, bonus };
  });
  return (
    <div className="border border-neutral-600 p-2 space-y-1.5 text-[12px]">
      <div className="text-[#ffe45c] text-[13px]">{player.name} 선수 계약 협상</div>
      <div className="text-neutral-400 text-[11px]">선수 요구: <ContractText c={demand} /></div>
      <div className="flex items-center justify-between"><span>연봉 (만원/시즌)</span><FeeStepper value={c.salary} onChange={v => setC({ ...c, salary: Math.max(10, v) })} steps={[10, 50]} /></div>
      <div className="flex items-center justify-between">
        <span>계약 기간</span>
        <div className="flex gap-1 flex-wrap justify-end">{[1, 2, 3, 5, 10, 20].map(y => <button key={y} onClick={() => setC({ ...c, years: y })} className={cn("border px-2", c.years === y ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>{y}년</button>)}</div>
      </div>
      <div className="flex items-center justify-between">
        <span>출전 보장 (시즌 경기 수)</span>
        <div className="flex gap-1">{[0, 3, 5, 7].map(n => <button key={n} onClick={() => setC({ ...c, minApps: n || undefined })} className={cn("border px-1.5", (c.minApps ?? 0) === n ? "border-white text-white" : "border-neutral-700 text-neutral-400")}>{n ? `${n}경기` : "없음"}</button>)}</div>
      </div>
      <div className="text-neutral-300">성과 보너스 (달성하면 시즌 끝에 지급)</div>
      {(Object.keys(BONUS_NAMES) as BonusKey[]).map(k => (
        <div key={k} className="flex items-center justify-between">
          <span className="text-neutral-400">{BONUS_NAMES[k]}</span>
          <FeeStepper value={c.bonus?.[k] ?? 0} onChange={v => setBonus(k, v)} steps={[10, 50]} />
        </div>
      ))}
      <button disabled={pending} onClick={() => onSubmit(c)} className="w-full py-1.5 text-[13px] font-bold text-black border border-neutral-500 disabled:opacity-40" style={{ background: "linear-gradient(#ffffff,#d6d6d6)" }}>
        {pending ? "협상 중..." : submitLabel}
      </button>
    </div>
  );
}

export function Reply({ text, ok }: { text: string; ok?: boolean }) {
  return <div className={cn("border px-2 py-1.5 text-center text-[12.5px]", ok ? "border-[#8fe07a] text-[#bff5c6]" : "border-[#f4b060] text-[#ffd9a8]")}>{text}</div>;
}

export function MoraleBar({ p }: { p: CPlayer }) {
  const m = p.morale ?? 70;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-10 h-1.5 bg-neutral-800 inline-block"><span className="h-full block" style={{ width: `${m}%`, background: m >= 60 ? "#8fe07a" : m >= 35 ? "#f8e070" : "#ff6b6b" }} /></span>
      {p.wantsOut && <span className="text-[10px] text-[#ff9a9a]">이적희망</span>}
    </span>
  );
}
