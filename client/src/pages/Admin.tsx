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
import { ITEMS, isStackable } from "@shared/career/items";
import { EVENT_INFO, type CareerEventType } from "@shared/career/events";

const STOCK_ITEMS = ITEMS.filter(isStackable);

function EditPanel({ userId, onDone }: { userId: number; onDone: () => void }) {
  const utils = trpc.useUtils();
  const list = trpc.career.adminUsers.useQuery();
  const row = list.data?.find(r => r.userId === userId);
  const s = row?.summary;
  const [money, setMoney] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [rep, setRep] = useState<string>("");
  const [items, setItems] = useState<Record<string, string>>({});
  // 내 계정을 고쳤으면 내 화면의 세이브도 바로 다시 받음 (다른 사용자는 그 화면이 곧 알아서 다시 받음)
  const refresh = () => { utils.career.adminUsers.invalidate(); utils.career.ranking.invalidate(); if (userId === utils.auth.me.getData()?.id) utils.career.get.invalidate(); };
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
        <div className="font-bold text-foreground">{row.name}{row.managerName ? ` (감독명 ${row.managerName})` : ""} <span className="text-xs text-muted-foreground">#{row.userId} · {row.role === "admin" ? "관리자" : "사용자"}</span></div>
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

/** 선수 키우기 모드 공개/비공개 */
function RookieSwitch() {
  const utils = trpc.useUtils();
  const q = trpc.admin.rookieOpen.useQuery();
  const set = trpc.admin.setRookieOpen.useMutation({
    onSuccess: r => { utils.admin.rookieOpen.setData(undefined, r); utils.rookie.access.invalidate(); toast.success(r.open ? "선수 키우기 모드를 모든 사용자에게 공개했습니다" : "선수 키우기 모드를 관리자 전용으로 닫았습니다"); },
    onError: e => toast.error(e.message),
  });
  const open = !!q.data?.open;
  return (
    <div className={cn("rounded-2xl border p-3.5 flex items-center gap-3", open ? "bg-emerald-500/10 border-emerald-400/50" : "bg-card border-border")}>
      <span className="text-2xl">🎮</span>
      <div className="flex-1 min-w-0">
        <div className="font-black text-foreground">선수 키우기 모드</div>
        <div className="text-xs text-muted-foreground">{q.isLoading ? "불러오는 중..." : open ? "공개 중 · 모든 사용자가 쓸 수 있습니다" : "비공개 · 관리자만 테스트할 수 있습니다"}</div>
      </div>
      <button disabled={q.isLoading || set.isPending}
        onClick={() => confirm(open ? "선수 키우기 모드를 닫을까요? (일반 사용자는 메뉴가 사라지고 들어갈 수 없습니다. 기록은 남아 있습니다)" : "선수 키우기 모드를 모든 사용자에게 공개할까요?") && set.mutate({ open: !open })}
        className={cn("shrink-0 rounded-xl px-3 py-2 text-sm font-black disabled:opacity-40", open ? "border border-rose-400/60 text-rose-300" : "bg-emerald-600 text-white")}>
        {open ? "닫기" : "공개하기"}
      </button>
    </div>
  );
}

/** 선수 키우기 베타 테스터: 공개 전에도 들어갈 수 있는 사용자 */
function RookieBeta() {
  const utils = trpc.useUtils();
  const q = trpc.admin.rookieBeta.useQuery();
  const [who, setWho] = useState("");
  const done = { onSuccess: () => { utils.admin.rookieBeta.invalidate(); setWho(""); }, onError: (e: { message: string }) => toast.error(e.message) };
  const add = trpc.admin.rookieBetaAdd.useMutation(done);
  const del = trpc.admin.rookieBetaRemove.useMutation(done);
  return (
    <div className="rounded-2xl border bg-card border-border p-3.5 space-y-2">
      <div className="font-black text-foreground">🧪 선수 키우기 베타 테스터</div>
      <div className="text-xs text-muted-foreground">비공개 중에도 이 사람들은 선수 키우기에 들어갈 수 있습니다</div>
      <div className="flex flex-wrap gap-1.5">
        {(q.data ?? []).map(u => (
          <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-400/40 text-sky-200 text-xs px-2 py-0.5">
            {u.name} <span className="text-sky-300/60">#{u.id}</span>
            <button disabled={del.isPending} onClick={() => del.mutate({ id: u.id })} className="ml-0.5 text-rose-300">✕</button>
          </span>
        ))}
        {q.data?.length === 0 && <span className="text-xs text-muted-foreground">아직 없음</span>}
      </div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (who.trim()) add.mutate({ who: who.trim() }); }}>
        <input value={who} onChange={e => setWho(e.target.value)} placeholder="사용자 번호 또는 감독명" className="flex-1 min-w-0 rounded-xl bg-background border border-border px-3 py-1.5 text-sm" />
        <button disabled={add.isPending || !who.trim()} className="shrink-0 rounded-xl bg-sky-600 text-white px-3 py-1.5 text-sm font-black disabled:opacity-40">추가</button>
      </form>
    </div>
  );
}

/** 선수 키우기 난이도 체감 통계 */
function RookieStats() {
  const q = trpc.admin.rookieStats.useQuery();
  const d = q.data;
  if (!d) return null;
  const days = (x: number | null) => (x === null ? "-" : `${x}일 (${(x / 30).toFixed(1)}개월)`);
  const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="font-bold text-foreground text-right">{v}</span></div>;
  return (
    <div className="rounded-2xl border bg-card border-border p-3.5 space-y-1.5 text-xs">
      <div className="font-black text-foreground text-sm">📊 선수 키우기 통계 ({d.n}명)</div>
      <Row k="신분" v={`아마추어 ${d.by.amateur} · 준프로 ${d.by.semipro} · 프로 ${d.by.pro} · FA ${d.by.fa} · 은퇴 ${d.by.retired}`} />
      <Row k="평균 능력치 · 래더" v={`${d.avgTotal.toLocaleString()} · ${d.avgLadder}점`} />
      <Row k="평균 진행 · 승률" v={`${d.avgDays}일 · ${d.winRate}%`} />
      <Row k="평균 피로 · 부상 중" v={`${d.avgFatigue} · ${d.injured}명`} />
      <Row k={`준프로 달성 (${d.semipro.count}명)`} v={`중간값 ${days(d.semipro.median)} · 최단 ${days(d.semipro.fastest)}`} />
      <Row k={`프로 입단 (${d.pro.count}명)`} v={`중간값 ${days(d.pro.median)} · 최단 ${days(d.pro.fastest)}`} />
    </div>
  );
}

/** 서버 상태: 디스크·DB 백업 (디스크가 가득 차 접속이 멈춘 일이 있어서 한눈에 보이게) */
function ServerStatus() {
  const q = trpc.admin.serverStatus.useQuery(undefined, { refetchInterval: 60_000 });
  if (!q.data) return null;
  const { disk, backup } = q.data;
  const diskLevel = disk.ok ? disk.level : "warn";
  const bad = diskLevel !== "ok" || (backup.ok && backup.stale);
  return (
    <div className={cn("rounded-2xl border p-3.5 space-y-1.5", bad ? "bg-rose-500/10 border-rose-400/50" : "bg-card border-border")}>
      <div className="font-black text-foreground">🖥️ 서버 상태</div>
      {disk.ok ? (
        <div className="text-xs">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">디스크</span><span className={cn("font-bold", diskLevel === "critical" ? "text-rose-300" : diskLevel === "warn" ? "text-amber-300" : "text-emerald-300")}>{Math.round(disk.ratio * 100)}% 사용 · 남은 {disk.freeGB}GB / {disk.totalGB}GB</span></div>
          <div className="h-1.5 rounded bg-black/40 mt-1 overflow-hidden"><div className={cn("h-full", diskLevel === "critical" ? "bg-rose-400" : diskLevel === "warn" ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${Math.min(100, disk.ratio * 100)}%` }} /></div>
          {diskLevel !== "ok" && <div className="mt-1 text-rose-200">⚠️ 디스크가 {diskLevel === "critical" ? "거의 가득 찼습니다. 지금 정리하지 않으면 접속·저장이 멈출 수 있습니다" : "80%를 넘었습니다. 오래된 로그·백업을 확인하세요"}</div>}
        </div>
      ) : <div className="text-xs text-amber-300">디스크 상태를 읽지 못했습니다</div>}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">DB 백업</span>
        {backup.ok ? (backup.count ? <span className={cn("font-bold", backup.stale ? "text-rose-300" : "text-emerald-300")}>{backup.stale ? "오래됨 · " : ""}최근 {new Date(backup.latestAt!).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {backup.latestMB}MB · {backup.count}개 보관</span> : <span className="text-rose-300 font-bold">백업 없음 (다음 배포 후 매일 새벽 자동 생성)</span>) : <span className="text-amber-300">{backup.error}</span>}
      </div>
    </div>
  );
}

const won = (v: number) => `${Math.round(v).toLocaleString()}만`;

/** 세이브 이상 징후 점검: 돈·능력치 분포, 부정 이용 의심 계정, 최근 활동 기록 */
function AnalysisPanel({ onPick }: { onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const q = trpc.career.adminAnalysis.useQuery(undefined, { enabled: open, staleTime: 600_000 });
  const audit = trpc.career.adminAudit.useQuery({ limit: 40 }, { enabled: open });
  const utils = trpc.useUtils();
  const d = q.data;
  const KIND: Record<string, string> = { big_money: "큰 자금 변동", season: "시즌 진행", burst: "요청 폭주", admin_edit: "관리자 수정" };
  return (
    <div className="rounded-2xl bg-card border border-border p-3.5 space-y-2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left">
        <span className="text-2xl">🔍</span>
        <span className="flex-1"><span className="font-black text-foreground block">이상 징후 점검</span><span className="text-xs text-muted-foreground">돈·능력치 분포와 부정 이용 의심 계정</span></span>
        <span className="text-xs text-primary font-bold">{open ? "접기" : "열기"}</span>
      </button>
      {open && (q.isLoading ? <div className="text-sm text-muted-foreground">세이브를 분석하는 중... (몇 초 걸립니다)</div> : d && (
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>세이브 {d.total}개 · {new Date(d.at).toLocaleTimeString("ko-KR")} 기준</span>
            <button onClick={() => { void utils.career.adminAnalysis.fetch({ force: true }).then(() => q.refetch()); }} className="text-primary font-bold">다시 분석</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {[["자금 중앙", won(d.money.median)], ["자금 90%", won(d.money.p90)], ["자금 최대", won(d.money.max)], ["진행 시즌 중앙", `${d.seasons.median}`], ["우리 평균 능력치", `${Math.round(d.myAvg.median)}`], ["SSS 보유 유저", `${d.sssUsers}명`]].map(([k, v]) => (
              <div key={k} className="border border-border rounded-lg py-1.5"><div className="text-[10px] text-muted-foreground">{k}</div><div className="font-bold text-foreground">{v}</div></div>
            ))}
          </div>
          <div>
            <div className="font-bold text-foreground mb-1">수입 상위 항목</div>
            <div className="text-muted-foreground">{d.incomeTop.map(x => `${x.cat} ${won(x.amount)}`).join(" · ") || "-"}</div>
          </div>
          <div>
            <div className="font-bold text-foreground mb-1">진행 시즌별 (중앙값)</div>
            {d.bySeasons.map(b => <div key={b.label} className="flex justify-between text-muted-foreground"><span>{b.label} ({b.n}명)</span><span>자금 {won(b.money)} · 능력치 {b.avg} · SSS {b.sss}명</span></div>)}
          </div>
          <div>
            <div className="font-bold text-foreground mb-1">의심 계정 {d.flags.length}건</div>
            {d.flags.length === 0 && <div className="text-emerald-300">없음</div>}
            <div className="space-y-1">
              {d.flags.map(f => (
                <button key={f.userId} onClick={() => onPick(f.userId)} className="w-full text-left rounded-lg border border-border p-2 hover:border-primary/50">
                  <div className="font-bold text-foreground">{f.name} <span className="text-[10px] text-muted-foreground">#{f.userId} · {f.season}시즌{f.role === "admin" ? " · 관리자" : ""}</span></div>
                  <ul className="list-disc pl-4 text-amber-200/90">{f.why.map(w => <li key={w}>{w}</li>)}</ul>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-bold text-foreground mb-1">최근 활동 기록</div>
            {(audit.data ?? []).length === 0 && <div className="text-muted-foreground">아직 기록이 없습니다 (배포 이후부터 쌓입니다)</div>}
            <div className="space-y-0.5">
              {(audit.data ?? []).map(a => (
                <div key={a.id} className="flex gap-1.5 text-muted-foreground">
                  <span className="shrink-0">{new Date(a.createdAt.replace(" ", "T") + "Z").toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <button className="shrink-0 text-primary" onClick={() => onPick(a.userId)}>#{a.userId}</button>
                  <span className="text-foreground shrink-0">{KIND[a.kind] ?? a.kind}</span>
                  <span className="truncate">{a.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
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

      <ServerStatus />
      <RookieSwitch />
      <RookieBeta />
      <RookieStats />
      <AnalysisPanel onPick={setSel} />

      {sel !== null && <EditPanel userId={sel} onDone={() => setSel(null)} />}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 또는 번호로 찾기" className="w-full rounded-xl bg-card border border-border px-3 py-2 text-sm" />
      {list.isLoading && <div className="text-sm text-muted-foreground">불러오는 중...</div>}
      <div className="space-y-1.5">
        {rows.map(r => (
          <button key={r.userId} onClick={() => setSel(r.userId)} className={cn("w-full text-left rounded-2xl border p-3", sel === r.userId ? "bg-primary/10 border-primary/50" : "bg-card border-border")}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground truncate">{r.name}{r.managerName ? ` · ${r.managerName}` : ""}</span>
              <span className="text-[10px] text-muted-foreground">#{r.userId}</span>
              {r.role === "admin" && <span className="text-[10px] text-amber-300 font-bold">관리자</span>}
              <span className="ml-auto text-[10px] text-muted-foreground text-right">{r.lastSignedIn ? `접속 ${new Date(r.lastSignedIn).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}{r.summary?.lastLeagueAt ? <><br />진행 {new Date(r.summary.lastLeagueAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</> : null}</span>
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
