/**
 * 선수 키우기: 메일함 (코치·기자·팬·라이벌·가족·스폰서의 메일과 답장)
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useRookieSync } from "@/lib/rookie";
import { dateText, type RookieState } from "@shared/rookie/model";
import { MAIL_FROM, pendingMail, type Mail } from "@shared/rookie/inbox";

type Filter = "all" | "pending" | "unread";

export function MailView({ s }: { s: RookieState }) {
  const sync = useRookieSync();
  const read = trpc.rookie.mailRead.useMutation(sync);
  const answer = trpc.rookie.mailAnswer.useMutation(sync);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const inbox = s.inbox ?? [];
  const list = inbox.filter(m => filter === "all" || (filter === "pending" ? pendingMail(m) : !m.read));
  const pending = inbox.filter(pendingMail).length, unread = inbox.filter(m => !m.read).length;
  const toggle = (m: Mail) => {
    setOpen(open === m.id ? null : m.id);
    if (!m.read) read.mutate({ id: m.id });
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-card border border-border p-1">
        {([["all", `전체 ${inbox.length}`], ["pending", `답장 필요 ${pending}`], ["unread", `안 읽음 ${unread}`]] as Array<[Filter, string]>).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("py-1.5 rounded-lg text-[12px] font-bold", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {!list.length && <div className="text-[12px] text-muted-foreground text-center py-8">{inbox.length ? "해당하는 메일이 없습니다" : "아직 메일이 없습니다. 하루하루 지내다 보면 여러 사람에게서 연락이 옵니다"}</div>}
      {list.map(m => {
        const f = MAIL_FROM[m.from];
        const isOpen = open === m.id;
        const wait = pendingMail(m);
        return (
          <div key={m.id} className={cn("rounded-2xl border bg-card", wait ? "border-amber-400/60" : "border-border")}>
            <button onClick={() => toggle(m)} className="w-full text-left p-3 flex gap-2.5">
              <span className="text-2xl leading-none">{f.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {!m.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                  <span className={cn("text-[13px] truncate", m.read ? "text-foreground" : "font-black text-foreground")}>{m.title}</span>
                </div>
                <div className="text-[10.5px] text-muted-foreground truncate">{m.sender} · {dateText(m.day).slice(5)}{wait && m.until !== undefined ? ` · ${dateText(m.until).slice(5)}까지 답장` : ""}</div>
              </div>
              {wait && <span className="shrink-0 self-center text-[10px] font-bold rounded-full bg-amber-400/20 text-amber-300 px-2 py-0.5">답장 필요</span>}
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-2">
                <div className="text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-line rounded-xl bg-muted/30 p-2.5">{m.body}</div>
                {wait && (
                  <div className="space-y-1.5">
                    {m.choices!.map(c => (
                      <button key={c.id} disabled={answer.isPending} onClick={() => answer.mutate({ id: m.id, choice: c.id })}
                        className="w-full text-left rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 disabled:opacity-50 active:scale-[0.99]">
                        <div className="text-[12.5px] font-bold text-foreground">{c.label}</div>
                        {c.hint && <div className="text-[10.5px] text-muted-foreground">{c.hint}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {m.picked && (
                  <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-2.5 text-[12px]">
                    <div className="text-[10.5px] text-emerald-300 font-bold">내 답장 · {m.choices?.find(c => c.id === m.picked)?.label}</div>
                    <div className="text-foreground mt-0.5">{m.result}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
