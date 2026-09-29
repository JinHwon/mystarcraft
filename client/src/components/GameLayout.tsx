import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  Home,
  Users,
  Dumbbell,
  Trophy,
  Handshake,
  ScrollText,
  Settings,
  CalendarCog,
  LogOut,
  Coins,
  Zap,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ACTIONS } from "@shared/career/rules";
import { rosterOf } from "@shared/career/view";
import { useCareer } from "@/lib/career";

interface NavItem { path: string; label: string; tab?: string; icon: LucideIcon }

const NAV: NavItem[] = [
  { path: "/lobby", label: "감독실", tab: "감독실", icon: Home },
  { path: "/team", label: "선수단", tab: "선수단", icon: Users },
  { path: "/training", label: "선수 행동", tab: "행동", icon: Dumbbell },
  { path: "/league", label: "마이프로리그", tab: "리그", icon: Trophy },
  { path: "/transfer", label: "이적시장", icon: Handshake },
  { path: "/records", label: "기록", icon: ScrollText },
];
const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "관리자 패널", icon: Settings },
  { path: "/admin/events", label: "이벤트 관리", icon: CalendarCog },
];
const TABS = NAV.filter(n => n.tab);

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, navigate] = useLocation();
  const items = user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;
  const { state: s } = useCareer();

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/");
  }, [loading, isAuthenticated]);

  // 페이지 이동 시 맨 위로
  useEffect(() => { window.scrollTo(0, 0); }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const go = (path: string) => { navigate(path); setMenuOpen(false); };
  const team = s ? s.teams[s.myTeam] : null;
  const apLeft = s ? s.ap - rosterOf(s, s.myTeam).reduce((sum, p) => sum + (p.action ? ACTIONS.find(a => a.key === p.action)!.ap : 0), 0) : 0;
  const title = items.find(i => i.path === location)?.label ?? "마이스타크래프트";

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* ── 상단 앱바 ── */}
        <header className="sticky top-0 z-30 safe-top bg-sidebar/95 backdrop-blur border-b border-sidebar-border">
          <div className="h-14 px-3 flex items-center gap-2">
            {team ? (
              <button onClick={() => go("/lobby")} className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white shrink-0" style={{ background: team.color }}>{team.short}</button>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-primary/30 flex items-center justify-center text-sm shrink-0">🎮</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base text-foreground truncate leading-tight">{title}</div>
              {s && <div className="text-[10px] text-muted-foreground leading-tight">{s.season}시즌 · {s.phase === "regular" ? `${s.week}주차` : s.phase === "postseason" ? "포스트시즌" : "시즌 종료"}</div>}
            </div>
            {team && (
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 font-bold px-2 py-0.5 text-[11px]">
                  <Coins className="w-3.5 h-3.5" />{team.money.toLocaleString()}만
                </span>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold px-2 py-0.5 text-[11px]">
                  <Zap className="w-3.5 h-3.5" />{apLeft}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* ── 본문 ── */}
        <main key={location} className="flex-1 w-full page-in pb-tabbar">
          {children}
        </main>
      </div>

      {/* ── 하단 탭바 ── */}
      <nav className="fixed bottom-0 app-fixed-x w-full z-40 bg-sidebar/95 backdrop-blur border-t border-sidebar-border safe-bottom">
        <div className="grid grid-cols-5 h-16">
          {TABS.map(item => {
            const active = location === item.path;
            const Icon = item.icon;
            return (
              <button key={item.path} onClick={() => go(item.path)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("w-12 h-7 rounded-full flex items-center justify-center transition-colors", active && "bg-primary/20")}>
                  <Icon className="w-5 h-5" />
                </span>
                {item.tab}
              </button>
            );
          })}
          <button onClick={() => setMenuOpen(true)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", !TABS.some(t => t.path === location) ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("w-12 h-7 rounded-full flex items-center justify-center", !TABS.some(t => t.path === location) && "bg-primary/20")}>
              <LayoutGrid className="w-5 h-5" />
            </span>
            메뉴
          </button>
        </div>
      </nav>

      {/* ── 전체 메뉴 ── */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="app-fixed-x rounded-t-2xl bg-sidebar border-sidebar-border p-0 safe-bottom">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-left text-base">전체 메뉴</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2 px-4 pb-3">
            {items.map(({ path, label, icon: Icon }) => (
              <button key={path} onClick={() => go(path)}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold border transition-colors",
                  location === path ? "bg-primary/20 border-primary/50 text-primary" : "bg-sidebar-accent/60 border-sidebar-border text-sidebar-foreground")}>
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
          <div className="px-4 pb-5">
            <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30">
              <LogOut className="w-4 h-4" /> 로그아웃 ({user?.name ?? "사용자"})
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
