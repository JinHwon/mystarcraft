/**
 * 상단 알림 (🔔): 어느 화면에서든 영입 제안·감독 제의·자금 위기 등을 보고 바로 그 화면으로
 * - 아직 안 본 알림 수를 빨간 뱃지로, 중요한 알림이 새로 생기면 팝업(토스트)
 * - 최근 소식(뉴스)도 함께
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { careerAlerts } from "@/lib/alerts";
import { isAlertsPaused, useAlertsPaused } from "@/lib/alertPause";
import type { CareerState } from "@shared/career/rules";

const SEEN_KEY = "mysc-seen-alerts";
const readSeen = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { return new Set(); }
};
const writeSeen = (keys: Set<string>) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...keys].slice(-200))); } catch { /* 저장 불가여도 진행 */ }
};

export function Notifications({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  // 관전 중에는 멈췄다가, 관전을 마치면 그동안 생긴 알림을 띄움
  // 주 진행 응답이 세이브에 먼저 반영되고 관전 화면은 그 직후에 뜨므로, 새 알림은 잠깐 기다렸다가 그때도 관전 중이 아니면 반영
  const paused = useAlertsPaused();
  const all = useMemo(() => careerAlerts(s), [s]);
  const [alerts, setAlerts] = useState(all);
  const [seen, setSeen] = useState(readSeen);
  const unseen = alerts.filter(a => !seen.has(a.key));
  // 새 중요 알림은 어느 화면에서든 팝업 (처음 불러올 때는 뱃지로만)
  const toasted = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (paused) return;
    const first = toasted.current === null;
    const id = setTimeout(() => {
      if (isAlertsPaused()) return;
      if (!first) {
        for (const a of all) {
          if (a.urgent && !toasted.current!.has(a.key) && !seen.has(a.key)) {
            toast(`${a.icon} ${a.text}`, { action: { label: "보기", onClick: () => navigate(a.to) }, duration: 6000 });
          }
        }
      }
      toasted.current = new Set([...(toasted.current ?? []), ...all.map(a => a.key)]);
      setAlerts(all);
    }, first ? 0 : 400);
    return () => clearTimeout(id);
  }, [all, paused]);
  const markAll = () => {
    const next = new Set([...seen, ...alerts.map(a => a.key)]);
    setSeen(next);
    writeSeen(next);
  };
  const go = (to: string) => { setOpen(false); navigate(to); };
  const news = s.news.slice(0, 20);

  return (
    <>
      <button onClick={() => { setOpen(true); markAll(); }} aria-label="알림" className="relative w-9 h-9 rounded-xl flex items-center justify-center text-foreground hover:bg-muted/40">
        <Bell className="w-5 h-5" />
        {unseen.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">{unseen.length}</span>
        )}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border max-h-[80vh] overflow-y-auto safe-bottom">
          <SheetHeader className="px-1 pt-1">
            <SheetTitle className="text-left text-base">🔔 알림</SheetTitle>
          </SheetHeader>
          <div className="space-y-1.5 px-1">
            {alerts.length === 0 && <div className="text-sm text-muted-foreground py-2">확인할 일이 없습니다</div>}
            {alerts.map(a => (
              <button key={a.key} onClick={() => go(a.to)} className={cn("w-full text-left rounded-xl border px-3 py-2 text-sm", a.urgent ? "bg-amber-500/10 border-amber-400/40" : "bg-card border-border")}>
                <span className="mr-1">{a.icon}</span>{a.text}
                <span className="float-right text-xs text-primary font-bold">›</span>
              </button>
            ))}
          </div>
          <div className="px-1 pt-3 pb-2">
            <div className="text-sm font-bold text-foreground mb-1">📰 최근 소식</div>
            <div className="space-y-1">
              {news.map((n, i) => (
                <div key={i} className="text-xs text-foreground/90 flex gap-2">
                  <span className="text-muted-foreground shrink-0 w-14">{n.season}시즌 {n.week}주</span>
                  <span>{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
