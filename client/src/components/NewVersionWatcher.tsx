/**
 * 새 버전 배포 알림: 열어 둔 화면은 예전 코드로 계속 돌아가므로,
 * 서버의 index.html 이 가리키는 스크립트가 바뀌면 새로고침을 권한다 (5분마다 · 화면으로 돌아올 때)
 */
import { useEffect } from "react";
import { toast } from "sonner";

const scriptOf = (html: string) => html.match(/\/assets\/index-[\w-]+\.js/)?.[0];

export function NewVersionWatcher() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const current = [...document.scripts].map(x => x.getAttribute("src") ?? "").find(src => /\/assets\/index-[\w-]+\.js/.test(src));
    if (!current) return;
    let shown = false;
    const check = async () => {
      if (shown || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/", { cache: "no-store" });
        const next = scriptOf(await res.text());
        if (next && !current.endsWith(next)) {
          shown = true;
          toast("🔄 새 버전이 배포되었습니다", {
            id: "new-version",
            description: "새로고침하면 바뀐 내용이 적용됩니다 (진행 상황은 저장되어 있습니다)",
            duration: Infinity,
            action: { label: "새로고침", onClick: () => window.location.reload() },
          });
        }
      } catch { /* 네트워크 오류는 다음에 다시 */ }
    };
    const id = setInterval(check, 5 * 60_000);
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
