/**
 * 상단 📢: 시스템 업데이트 내역
 * - 누르면 아래에서 업데이트 목록(한 줄 요약)이 올라오고, 하나를 누르면 자세한 내용 팝업
 * - 아직 안 본 업데이트가 있으면 빨간 숫자 (본 마지막 번호는 이 기기에 저장)
 */
import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LATEST_UPDATE_ID, UPDATES, type UpdateNote } from "@/lib/updates";

const SEEN_KEY = "mysc-seen-update";
const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0); } catch { return 0; } };

export function UpdatesButton() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<UpdateNote | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const fresh = UPDATES.filter(u => u.id > seen).length;
  const show = () => {
    setOpen(true);
    setSeen(LATEST_UPDATE_ID);
    try { localStorage.setItem(SEEN_KEY, String(LATEST_UPDATE_ID)); } catch { /* 저장 불가여도 진행 */ }
  };
  return (
    <>
      <button onClick={show} aria-label="업데이트 내역" className="relative w-9 h-9 rounded-xl flex items-center justify-center text-foreground hover:bg-muted/40">
        <Megaphone className="w-5 h-5" />
        {fresh > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">{fresh}</span>}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border max-h-[80vh] overflow-y-auto safe-bottom">
          <SheetHeader className="px-1 pt-1">
            <SheetTitle className="text-left text-base">📢 업데이트 내역</SheetTitle>
          </SheetHeader>
          <div className="space-y-1.5 px-1 pb-3">
            {UPDATES.map((u, i) => (
              <button key={u.id} onClick={() => setDetail(u)} className="w-full text-left rounded-xl border bg-card border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  {i === 0 && <span className="text-[10px] font-black rounded-full bg-rose-500 text-white px-1.5">NEW</span>}
                  <span className="font-bold text-sm text-foreground flex-1 min-w-0 truncate">{u.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{u.date.slice(5).replace("-", ".")}</span>
                  <span className="text-xs text-primary font-bold">›</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{u.summary}</div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{detail.title}</DialogTitle>
                <div className="text-xs text-muted-foreground text-left">{detail.date}</div>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {detail.details.map(sec => (
                  <div key={sec.head}>
                    <div className="font-bold text-foreground mb-1">{sec.head}</div>
                    <ul className="space-y-1 list-disc pl-4 text-foreground/90">
                      {sec.items.map((t, i) => <li key={i} className="leading-snug">{t}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
