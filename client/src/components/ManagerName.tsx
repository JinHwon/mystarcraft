/**
 * 감독명: 처음 접속(또는 감독명이 없는 기존 사용자)이면 정하게 하고, 구단 운영 → 감독에서 게임 재화로 바꿈
 * 감독 랭킹 등 다른 사용자에게는 감독명이 보임 (로그인 아이디는 보이지 않음)
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCareerPatch } from "@/lib/career";
import type { CareerDiff } from "@shared/career/diff";

const NAME_RE = /^[가-힣A-Za-z0-9_]{2,10}$/;

function useSetName(onDone?: (name: string) => void) {
  const utils = trpc.useUtils();
  const patch = useCareerPatch();
  const [err, setErr] = useState<string | null>(null);
  const m = trpc.career.setManagerName.useMutation({
    onSuccess: r => {
      setErr(null);
      if (r.diff) patch(r.diff as CareerDiff);
      utils.auth.me.setData(undefined, old => (old ? { ...old, managerName: r.name } : old));
      utils.career.managerNameHistory.invalidate();
      utils.career.ranking.invalidate();
      onDone?.(r.name);
    },
    onError: e => setErr(e.message),
  });
  const submit = (name: string) => {
    const v = name.trim();
    if (!NAME_RE.test(v)) { setErr("감독명은 2~10자의 한글·영문·숫자·_ 만 쓸 수 있습니다"); return; }
    m.mutate({ name: v });
  };
  return { submit, err, pending: m.isPending };
}

/** 감독명이 없으면 (로그인한 게임 화면에서) 먼저 정하게 함 */
export function ManagerNameGate() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [name, setName] = useState("");
  const { submit, err, pending } = useSetName();
  if (!user || user.managerName || location === "/" || location === "/login") return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 space-y-3">
        <div className="text-center space-y-1">
          <div className="text-3xl">🎓</div>
          <div className="font-black text-lg text-foreground">감독명을 정해 주세요</div>
          <div className="text-xs text-muted-foreground">감독 랭킹 등 다른 감독에게 보이는 이름입니다. 로그인 아이디는 보이지 않습니다. (다른 감독과 같은 이름은 쓸 수 없고, 나중에 구단 자금으로 바꿀 수 있습니다)</div>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit(name)} maxLength={10} placeholder="2~10자 (한글·영문·숫자·_)"
          className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-foreground" autoFocus />
        {err && <div className="text-sm text-rose-400">{err}</div>}
        <button disabled={pending} onClick={() => submit(name)} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black disabled:opacity-50">{pending ? "확인 중..." : "이 이름으로 시작"}</button>
      </div>
    </div>
  );
}

/** 구단 운영 → 감독: 감독명 변경 (비용) + 변경 이력 */
export function ManagerNameBox() {
  const { user } = useAuth();
  const history = trpc.career.managerNameHistory.useQuery(undefined, { staleTime: 60_000 });
  const [name, setName] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const { submit, err, pending } = useSetName(n => { setOk(`감독명이 "${n}"(으)로 바뀌었습니다`); setName(""); });
  const cost = history.data?.cost ?? 500;
  return (
    <div className="border border-neutral-600 p-2 space-y-1.5 text-[12px]">
      <div className="flex justify-between items-baseline"><span className="text-[#ffe45c]">감독명</span><span className="text-[14px] text-white">{user?.managerName ?? "-"}</span></div>
      <div className="flex gap-1">
        <input value={name} onChange={e => { setName(e.target.value); setOk(null); }} maxLength={10} placeholder="새 감독명 (2~10자)" className="flex-1 min-w-0 bg-black border border-neutral-600 px-2 py-1 text-white" />
        <button disabled={pending || !name.trim()} onClick={() => confirm(`감독명을 "${name.trim()}"(으)로 바꿀까요?\n구단 자금 ${cost.toLocaleString()}만원이 듭니다.`) && submit(name)}
          className="border border-[#f8e070] text-[#ffe45c] px-2 disabled:opacity-40">{pending ? "변경 중…" : `변경 (${cost.toLocaleString()}만)`}</button>
      </div>
      {err && <div className="text-[#ffb8c8]">{err}</div>}
      {ok && <div className="text-[#bff5c6]">{ok}</div>}
      {!!history.data?.rows.length && (
        <div className="pt-1 space-y-0.5">
          <div className="text-neutral-400 text-[11px]">변경 이력</div>
          {history.data.rows.map((r, i) => (
            <div key={i} className="flex justify-between text-[11px] text-neutral-300">
              <span>{r.oldName ? `${r.oldName} → ${r.newName}` : `처음 정함: ${r.newName}`}</span>
              <span className="text-neutral-500">{r.cost ? `${r.cost.toLocaleString()}만 · ` : ""}{r.at ? new Date(r.at).toLocaleDateString("ko-KR") : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
