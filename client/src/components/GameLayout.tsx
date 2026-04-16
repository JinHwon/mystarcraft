import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  User,
  ShoppingBag,
  LogOut,
  Sword,
  ChevronRight,
  Coins,
  Settings,
  Zap,
  Gamepad2,
  BarChart3,
  Menu,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const getNavItems = (isAdmin: boolean) => {
  const items = [
    { path: "/profile", label: "선수 관리", icon: User },
    { path: "/shop", label: "아이템 상점", icon: ShoppingBag },
    { path: "/practice", label: "연습게임", icon: Gamepad2 },
    { path: "/game-results", label: "경기결과", icon: BarChart3 },
    { path: "/ranking", label: "랭킹", icon: Trophy },
    { path: "/events", label: "퀘스트", icon: Zap },
  ];
  if (isAdmin) {
    items.push({ path: "/admin", label: "관리자 패널", icon: Settings });
  }
  return items;
};

const RACE_LABELS: Record<string, string> = {
  terran: "테란",
  zerg: "저그",
  protoss: "프로토스",
};

const RACE_COLORS: Record<string, string> = {
  terran: "#4A9EFF",
  zerg: "#B44FD8",
  protoss: "#F1C40F",
};

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, loading, logout } = useAuth();
  const navItems = getNavItems(user?.role === "admin");
  const [location, navigate] = useLocation();
  const { data: player, isLoading: playerLoading } = trpc.player.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 10분마다 피로도 5 회복
  const fatigueRecoveryMutation = trpc.player.tickFatigueRecovery.useMutation();
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      fatigueRecoveryMutation.mutate();
    }, 10 * 60 * 1000); // 10분
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    if (!loading && !playerLoading && isAuthenticated && player === null) {
      navigate("/create-player");
    }
  }, [loading, playerLoading, isAuthenticated, player]);

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 모바일 헤더 - 햄버거 메뉴 버튼 */}
      <div className="md:hidden flex items-center justify-between h-16 bg-sidebar border-b border-sidebar-border px-4">
        <div className="flex items-center gap-2">
          <Sword className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm text-sidebar-foreground">마이스타크래프트</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          className="h-9 w-9"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* 모바일 사이드바 - Sheet 오버레이 */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r border-sidebar-border">
          <SheetHeader className="p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center glow-blue">
                <Sword className="w-5 h-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="font-bold text-sm text-sidebar-foreground tracking-wider">마이스타크래프트</SheetTitle>
                <p className="text-xs text-muted-foreground mt-1">선수 육성 시스템</p>
              </div>
            </div>
          </SheetHeader>

          {/* 모바일 선수 미니 프로필 */}
          {player && (
            <div className="p-4 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 shrink-0"
                  style={{ borderColor: RACE_COLORS[player.race] ?? "#4A9EFF" }}>
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-sidebar-foreground truncate">{player.name}</p>
                  <p className="text-xs font-medium" style={{ color: RACE_COLORS[player.race] }}>
                    {RACE_LABELS[player.race]} · Lv.{player.level}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 bg-accent/50 rounded-md px-3 py-1.5">
                  <Coins className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-400">{player.gold.toLocaleString()} G</span>
                </div>
                <div className="flex items-center justify-between bg-accent/50 rounded-md px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">등급 <span className="font-bold text-primary">{player.grade ?? "D"}</span></span>
                  <span className="text-xs text-muted-foreground">
                    {player.gameRecord
                      ? `${player.gameRecord.total}전 ${player.gameRecord.wins}승 ${player.gameRecord.losses}패`
                      : "0전 0승 0패"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 모바일 네비게이션 */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location === path;
              return (
                <button
                  key={path}
                  onClick={() => {
                    navigate(path);
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30 glow-blue"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {isActive && <ChevronRight className="w-3 h-3" />}
                </button>
              );
            })}
          </nav>

          {/* 모바일 하단 유저 정보 */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {user?.name?.charAt(0) ?? "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name ?? "사용자"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 justify-start gap-2"
              onClick={logout}
            >
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex flex-1">
        {/* 사이드바 - 데스크톱에서만 표시 */}
        <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col shrink-0">
          {/* 로고 */}
          <div className="p-6 border-b border-sidebar-border cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center glow-blue">
                <Sword className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-sm text-sidebar-foreground tracking-wider">마이스타크래프트</h1>
                <p className="text-xs text-muted-foreground">선수 육성 시스템</p>
              </div>
            </div>
          </div>

          {/* 선수 미니 프로필 */}
          {player && (
            <div className="p-4 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 shrink-0"
                  style={{ borderColor: RACE_COLORS[player.race] ?? "#4A9EFF" }}>
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-sidebar-foreground truncate">{player.name}</p>
                  <p className="text-xs font-medium" style={{ color: RACE_COLORS[player.race] }}>
                    {RACE_LABELS[player.race]} · Lv.{player.level}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {/* 골드 표시 */}
                <div className="flex items-center gap-2 bg-accent/50 rounded-md px-3 py-1.5">
                  <Coins className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-400">{player.gold.toLocaleString()} G</span>
                </div>
                {/* 등급 · 전적 */}
                <div className="flex items-center justify-between bg-accent/50 rounded-md px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">등급 <span className="font-bold text-primary">{player.grade ?? "D"}</span></span>
                  <span className="text-xs text-muted-foreground">
                    {player.gameRecord
                      ? `${player.gameRecord.total}전 ${player.gameRecord.wins}승 ${player.gameRecord.losses}패`
                      : "0전 0승 0패"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 네비게이션 */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30 glow-blue"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {isActive && <ChevronRight className="w-3 h-3" />}
                </button>
              );
            })}
          </nav>

          {/* 하단 유저 정보 */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {user?.name?.charAt(0) ?? "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name ?? "사용자"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 justify-start gap-2"
              onClick={logout}
            >
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </Button>
          </div>
        </aside>

        {/* 메인 콘텐츠 */}
        <main className="flex-1 overflow-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
