import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  Home,
  User,
  Users,
  Dumbbell,
  Medal,
  ShoppingBag,
  Gamepad2,
  BarChart3,
  Trophy,
  Zap,
  Settings,
  CalendarCog,
  LogOut,
  Sword,
  Coins,
  Battery,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RACE_COLORS, RACE_LABELS } from "@shared/gameConstants";

interface NavItem { path: string; label: string; icon: LucideIcon; group: string }

const NAV: NavItem[] = [
  { path: "/lobby", label: "로비", icon: Home, group: "메인" },
  { path: "/practice", label: "연습게임", icon: Gamepad2, group: "경기" },
  { path: "/league", label: "리그", icon: Medal, group: "경기" },
  { path: "/game-results", label: "경기결과", icon: BarChart3, group: "경기" },
  { path: "/team", label: "팀 관리", icon: Users, group: "육성" },
  { path: "/training", label: "훈련장", icon: Dumbbell, group: "육성" },
  { path: "/profile", label: "선수 정보", icon: User, group: "육성" },
  { path: "/shop", label: "상점", icon: ShoppingBag, group: "육성" },
  { path: "/events", label: "퀘스트", icon: Zap, group: "기타" },
  { path: "/ranking", label: "랭킹", icon: Trophy, group: "기타" },
];
const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "관리자 패널", icon: Settings, group: "관리" },
  { path: "/admin/events", label: "이벤트 관리", icon: CalendarCog, group: "관리" },
];

/** 모바일 하단 탭 (나머지는 "메뉴"에서) */
const TABS = ["/lobby", "/team", "/practice", "/league"];

function titleOf(path: string, items: NavItem[]) {
  return items.find(i => i.path === path)?.label ?? "마이스타크래프트";
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, navigate] = useLocation();
  const items = user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;
  const { data: player, isLoading: playerLoading } = trpc.player.get.useQuery(undefined, { enabled: isAuthenticated });
  const { data: rewardableCount = 0 } = trpc.quest.getRewardableCount.useQuery(undefined, { enabled: isAuthenticated });

  // 10분마다 피로도 5 회복
  const fatigueRecoveryMutation = trpc.player.tickFatigueRecovery.useMutation();
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => fatigueRecoveryMutation.mutate(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/");
  }, [loading, isAuthenticated]);

  useEffect(() => {
    if (!loading && !playerLoading && isAuthenticated && player === null) navigate("/create-player");
  }, [loading, playerLoading, isAuthenticated, player]);

  // 페이지 이동 시 맨 위로
  useEffect(() => { window.scrollTo(0, 0); }, [location]);

  if (loading || playerLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  const go = (path: string) => { navigate(path); setMenuOpen(false); };
  const raceColor = player ? RACE_COLORS[player.race] ?? "#4A9EFF" : "#4A9EFF";
  const fatigue = player?.fatigue ?? 0;
  const groups = Array.from(new Set(items.map(i => i.group)));
  const QuestBadge = ({ className }: { className?: string }) => rewardableCount > 0
    ? <span className={cn("min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center", className)}>{rewardableCount}</span>
    : null;

  const Avatar = ({ size = 40 }: { size?: number }) => (
    <div className="rounded-full overflow-hidden border-2 shrink-0 bg-muted flex items-center justify-center"
      style={{ width: size, height: size, borderColor: raceColor }}>
      {player?.photoUrl
        ? <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
        : <User className="w-1/2 h-1/2 text-muted-foreground" />}
    </div>
  );

  const StatusChips = ({ compact }: { compact?: boolean }) => (
    <div className="flex items-center gap-1.5">
      <span className={cn("flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 font-bold", compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs")}>
        <Coins className="w-3.5 h-3.5" />{(player?.gold ?? 0).toLocaleString()}
      </span>
      <span className={cn("flex items-center gap-1 rounded-full border font-bold",
        fatigue >= 60 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : fatigue >= 30 ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-300" : "bg-rose-500/15 border-rose-500/30 text-rose-300",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs")}>
        <Battery className="w-3.5 h-3.5" />{fatigue}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── 데스크톱 사이드바 ── */}
      <aside className="hidden md:flex w-60 bg-sidebar border-r border-sidebar-border flex-col shrink-0 sticky top-0 h-screen">
        <button onClick={() => go("/lobby")} className="px-5 py-4 flex items-center gap-3 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Sword className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-black text-sm text-sidebar-foreground tracking-wide">마이스타크래프트</div>
            <div className="text-[11px] text-muted-foreground">프로게임단 매니저</div>
          </div>
        </button>

        {player && (
          <button onClick={() => go("/profile")} className="mx-3 mt-3 p-3 rounded-xl bg-sidebar-accent/60 border border-sidebar-border text-left hover:bg-sidebar-accent transition-colors">
            <div className="flex items-center gap-2.5">
              <Avatar size={40} />
              <div className="min-w-0">
                <div className="font-bold text-sm text-sidebar-foreground truncate">{player.name}</div>
                <div className="text-xs font-semibold" style={{ color: raceColor }}>{RACE_LABELS[player.race]} · Lv.{player.level} · {player.grade}</div>
              </div>
            </div>
            <div className="mt-2.5"><StatusChips compact /></div>
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {groups.map(g => (
            <div key={g}>
              <div className="px-2 pb-1 text-[10px] font-bold tracking-wider text-muted-foreground/80">{g}</div>
              <div className="space-y-0.5">
                {items.filter(i => i.group === g).map(({ path, label, icon: Icon }) => {
                  const active = location === path;
                  return (
                    <button
                      key={path}
                      onClick={() => go(path)}
                      className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-sidebar-foreground/90 hover:bg-sidebar-accent")}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 text-left">{label}</span>
                      {path === "/events" && <QuestBadge />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
            {user?.name?.charAt(0) ?? "U"}
          </div>
          <span className="flex-1 text-xs text-muted-foreground truncate">{user?.name ?? "사용자"}</span>
          <button onClick={logout} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="로그아웃">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* ── 모바일 상단 앱바 ── */}
        <header className="md:hidden sticky top-0 z-30 safe-top bg-sidebar/95 backdrop-blur border-b border-sidebar-border">
          <div className="h-14 px-3 flex items-center gap-2">
            <button onClick={() => go("/profile")} className="shrink-0"><Avatar size={32} /></button>
            <div className="flex-1 min-w-0 font-bold text-base text-foreground truncate">{titleOf(location, items)}</div>
            <StatusChips compact />
          </div>
        </header>

        {/* ── 본문 ── */}
        <main key={location} className="flex-1 w-full page-in pb-tabbar md:pb-0">
          {children}
        </main>
      </div>

      {/* ── 모바일 하단 탭바 ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur border-t border-sidebar-border safe-bottom">
        <div className="grid grid-cols-5 h-16">
          {TABS.map(path => {
            const item = items.find(i => i.path === path)!;
            const active = location === path;
            const Icon = item.icon;
            return (
              <button key={path} onClick={() => go(path)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("w-12 h-7 rounded-full flex items-center justify-center transition-colors", active && "bg-primary/20")}>
                  <Icon className="w-5 h-5" />
                </span>
                {item.label === "연습게임" ? "경기" : item.label === "팀 관리" ? "팀" : item.label}
              </button>
            );
          })}
          <button onClick={() => setMenuOpen(true)} className={cn("relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", !TABS.includes(location) ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("w-12 h-7 rounded-full flex items-center justify-center", !TABS.includes(location) && "bg-primary/20")}>
              <LayoutGrid className="w-5 h-5" />
            </span>
            메뉴
            <QuestBadge className="absolute top-1.5 right-[22%]" />
          </button>
        </div>
      </nav>

      {/* ── 모바일 메뉴 (아래에서 올라오는 시트) ── */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="md:hidden rounded-t-2xl bg-sidebar border-sidebar-border p-0 safe-bottom">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-left text-base">전체 메뉴</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2 px-4 pb-3">
            {items.map(({ path, label, icon: Icon }) => {
              const active = location === path;
              return (
                <button key={path} onClick={() => go(path)}
                  className={cn("relative flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold border transition-colors",
                    active ? "bg-primary/20 border-primary/50 text-primary" : "bg-sidebar-accent/60 border-sidebar-border text-sidebar-foreground")}>
                  <Icon className="w-5 h-5" />
                  {label}
                  {path === "/events" && <QuestBadge className="absolute top-1.5 right-1.5" />}
                </button>
              );
            })}
          </div>
          <div className="px-4 pb-5">
            <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30">
              <LogOut className="w-4 h-4" /> 로그아웃
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
