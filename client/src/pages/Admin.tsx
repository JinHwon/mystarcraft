/**
 * 관리자 패널 (커리어 모드): 사용자별 커리어 요약·수정·초기화, 권한, 운영 이벤트
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { TeamBadge } from "@/components/career/Bits";
import { ITEMS } from "@shared/career/items";
import { EVENT_INFO, type CareerEventType } from "@shared/career/events";

const STOCK_ITEMS = ITEMS.filter(i => i.kind === "match" || i.kind === "stock");

function EditPanel({ userId, onDone }: { userId: number; onDone: () => void }) {
  const utils = trpc.useUtils();
  const list = trpc.career.adminUsers.useQuery();
  const row = list.data?.find(r => r.userId === userId);
  const s = row?.summary;
  const [money, setMoney] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [rep, setRep] = useState<string>("");
  const [items, setItems] = useState<Record<string, string>>({});
  const refresh = () => { utils.career.adminUsers.invalidate(); utils.career.ranking.invalidate(); };
  const edit = trpc.career.adminEdit.useMutation({ onSuccess: () => { toast.success("저장했습니다"); refresh(); }, onError: e => toast.error(e.message) });
  const reset = trpc.career.adminResetCareer.useMutation({ onSuccess: () => { toast.success("커리어를 초기화했습니다"); refresh(); onDone(); }, onError: e => toast.error(e.message) });
  const role = trpc.admin.updateUserRole.useMutation({ onSuccess: () => { toast.success("권한을 바꿨습니다"); refresh(); }, onError: e => toast.error(e.message) });
  if (!row) return null;
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const save = () => edit.mutate({
    userId,
    money: num(money), level: num(level), reputation: num(rep),
    items: Object.fromEntries(Object.entries(items).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)])),
  });
  const input = "w-full rounded-lg bg-background border border-border px-2 py-1.5 text-sm";
  return (
    <div className="rounded-2xl bg-card border border-primary/40 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-bold text-foreground">{row.name} <span className="text-xs text-muted-foreground">#{row.userId} · {row.role === "admin" ? "관리자" : "사용자"}</span></div>
        <button onClick={onDone} className="text-xs text-muted-foreground">닫기 ✕</button>
      </div>
      {!s ? (
        <div className="text-sm text-muted-foreground">커리어가 없습니다 (아직 팀을 고르지 않음)</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
            {[
              ["구단", s.team.name], ["시즌", `${s.season}시즌 ${s.week}주`], ["감독", `Lv.${s.level} · 명성 ${s.reputation}`],
              ["자금", `${s.money.toLocaleString()}만`], ["구단 가치", `${s.clubValue.toLocaleString()}만`], ["전력", s.power.toLocaleString()],
            ].map(([k, v]) => <div key={k} className="rounded-xl bg-muted/60 py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="font-bold text-foreground truncate px-1">{v}</div></div>)}
          </div>
          {s.gameOver && <div className="text-xs text-rose-300">게임 종료 상태: {s.gameOver}</div>}
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-muted-foreground">구단 자금(만)<input className={input} placeholder={String(s.money)} value={money} onChange={e => setMoney(e.target.value)} inputMode="numeric" /></label>
            <label className="text-[11px] text-muted-foreground">감독 레벨<input className={input} placeholder={String(s.level)} value={level} onChange={e => setLevel(e.target.value)} inputMode="numeric" /></label>
            <label className="text-[11px] text-muted-foreground">명성(0~100)<input className={input} placeholder={String(s.reputation)} value={rep} onChange={e => setRep(e.target.value)} inputMode="numeric" /></label>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">보관 아이템 개수 지정 (빈칸 = 그대로)</div>
            <div className="grid grid-cols-3 gap-1.5">
              {STOCK_ITEMS.map(it => (
                <label key={it.key} className="text-[11px] text-muted-foreground">{it.name}
                  <input className={input} value={items[it.key] ?? ""} onChange={e => setItems({ ...items, [it.key]: e.target.value })} inputMode="numeric" />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={save} disabled={edit.isPending} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">저장</button>
            <button onClick={() => edit.mutate({ userId, healAll: true })} className="px-3 py-2 rounded-xl bg-muted border border-border text-sm">전원 컨디션 회복</button>
            {s.gameOver && <button onClick={() => edit.mutate({ userId, clearGameOver: true })} className="px-3 py-2 rounded-xl bg-muted border border-border text-sm">게임 종료 해제</button>}
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
        <button onClick={() => role.mutate({ userId, role: row.role === "admin" ? "user" : "admin" })} className="px-3 py-2 rounded-xl bg-muted border border-border text-xs">
          {row.role === "admin" ? "관리자 권한 해제" : "관리자로 지정"}
        </button>
        {s && (
          <button onClick={() => { if (confirm(`${row.name} 님의 커리어를 삭제할까요? 되돌릴 수 없습니다.`)) reset.mutate({ userId }); }} className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-300 text-xs">
            커리어 초기화(삭제)
          </button>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const list = trpc.career.adminUsers.useQuery(undefined, { enabled: user?.role === "admin" });
  const events = trpc.event.listActive.useQuery();
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState("");
  if (user && user.role !== "admin") return <div className="p-6 text-muted-foreground">관리자만 볼 수 있습니다</div>;
  const rows = (list.data ?? []).filter(r => !q || r.name.includes(q) || String(r.userId) === q);
  const withCareer = rows.filter(r => r.summary).length;
  return (
    <div className="p-4 space-y-3">
      <div className="rounded-2xl bg-card border border-border p-3.5">
        <div className="font-black text-foreground">⚙️ 관리자 패널</div>
        <div className="text-xs text-muted-foreground mt-0.5">가입자 {list.data?.length ?? 0}명 · 커리어 진행 {withCareer}명</div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {(events.data ?? []).length === 0 && <span className="text-muted-foreground">켜진 이벤트 없음</span>}
          {(events.data ?? []).map(e => {
            const info = EVENT_INFO[e.type as CareerEventType];
            return <span key={e.id} className="rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 px-2 py-0.5">{info?.icon} {e.name} ({info?.label})</span>;
          })}
        </div>
        <button onClick={() => navigate("/admin/events")} className="mt-2 w-full py-2 rounded-xl bg-primary/20 border border-primary/40 text-primary text-sm font-bold">📅 이벤트 관리</button>
      </div>

      {sel !== null && <EditPanel userId={sel} onDone={() => setSel(null)} />}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 또는 번호로 찾기" className="w-full rounded-xl bg-card border border-border px-3 py-2 text-sm" />
      {list.isLoading && <div className="text-sm text-muted-foreground">불러오는 중...</div>}
      <div className="space-y-1.5">
        {rows.map(r => (
          <button key={r.userId} onClick={() => setSel(r.userId)} className={cn("w-full text-left rounded-2xl border p-3", sel === r.userId ? "bg-primary/10 border-primary/50" : "bg-card border-border")}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground truncate">{r.name}</span>
              <span className="text-[10px] text-muted-foreground">#{r.userId}</span>
              {r.role === "admin" && <span className="text-[10px] text-amber-300 font-bold">관리자</span>}
              <span className="ml-auto text-[10px] text-muted-foreground">{r.lastSignedIn ? new Date(r.lastSignedIn).toLocaleDateString("ko-KR") : ""}</span>
            </div>
            {r.summary ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                <TeamBadge short={r.summary.team.short} color={r.summary.team.color} />
                <span>{r.summary.season}시즌 {r.summary.week}주 · Lv.{r.summary.level} · 자금 {r.summary.money.toLocaleString()}만 · 가치 {r.summary.clubValue.toLocaleString()}만</span>
                {r.summary.gameOver && <span className="text-rose-300">종료</span>}
              </div>
            ) : <div className="text-[11px] text-muted-foreground mt-1">커리어 없음</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
