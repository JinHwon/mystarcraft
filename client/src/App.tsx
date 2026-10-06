import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import { lazy, Suspense, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resetUserSession } from "./lib/session";
import { Redirect } from "wouter";
import { useAuth } from "./_core/hooks/useAuth";
import { ManagerNameGate } from "./components/ManagerName";
import { useCareerRevWatch } from "./lib/career";
import GameLayout from "./components/GameLayout";
import { UpdateNotification } from "./components/UpdateNotification";
import { NewVersionWatcher } from "./components/NewVersionWatcher";

/**
 * 게임 화면은 들어갈 때 불러온다 (첫 화면 번들을 작게).
 * 화면을 연 채로 새 버전이 배포되면 예전 파일 이름의 조각이 사라져 불러오기에 실패하므로, 그때는 한 번 새로고침한다.
 */
const RELOAD_KEY = "mysc-chunk-reload";
function page(load: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() => load().then(
    m => { sessionStorage.removeItem(RELOAD_KEY); return m; },
    err => {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    },
  ));
}
const Admin = page(() => import("./pages/Admin"));
const AdminEvents = page(() => import("./pages/AdminEvents"));
const Team = page(() => import("./pages/Team"));
const Training = page(() => import("./pages/Training"));
const League = page(() => import("./pages/League"));
const Lobby = page(() => import("./pages/Lobby"));
const Transfer = page(() => import("./pages/Transfer"));
const Teams = page(() => import("./pages/Teams"));
const Records = page(() => import("./pages/Records"));
const Ranking = page(() => import("./pages/Ranking"));
const StarLeague = page(() => import("./pages/StarLeague"));
const Shop = page(() => import("./pages/Shop"));
const Club = page(() => import("./pages/Club"));
const Finance = page(() => import("./pages/Finance"));
const Rookie = page(() => import("./pages/Rookie"));

const PageLoading = () => (
  <div className="flex items-center justify-center py-20" role="status" aria-label="불러오는 중">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const withLayout = (Page: React.ComponentType) => () => (
  <GameLayout>
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  </GameLayout>
);

/** 관리자 화면: 관리자가 아니면 내용을 그리지 않는다 (실제 권한 확인은 서버의 adminProcedure) */
const adminOnly = (Page: React.ComponentType) => (): React.JSX.Element | null => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== "admin") return <div className="p-6 text-muted-foreground">관리자만 볼 수 있습니다</div>;
  return <Page />;
};

// 레이아웃을 씌운 화면은 모듈에서 한 번만 만든다 (렌더마다 새 컴포넌트가 되어 다시 마운트되지 않도록)
const GAME_PAGES: Array<[string, () => React.JSX.Element]> = [
  ["/lobby", withLayout(Lobby)],
  ["/team", withLayout(Team)],
  ["/training", withLayout(Training)],
  ["/league", withLayout(League)],
  ["/transfer", withLayout(Transfer)],
  ["/teams", withLayout(Teams)],
  ["/records", withLayout(Records)],
  ["/ranking", withLayout(Ranking)],
  ["/starleague", withLayout(StarLeague)],
  ["/shop", withLayout(Shop)],
  ["/club", withLayout(Club)],
  ["/finance", withLayout(Finance)],
  ["/admin", withLayout(adminOnly(Admin))],
  ["/admin/events", withLayout(adminOnly(AdminEvents))],
];

/** 선수 키우기 모드: 감독 모드 화면 틀 없이 (로그인 필요) */
function RookiePage() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Suspense fallback={<PageLoading />}><Rookie /></Suspense>;
}

/** 없앤 "내 선수 육성" 모드의 옛 주소 (북마크 대비) */
const OLD_PATHS = ["/create-player", "/profile", "/practice", "/game-results", "/events"];

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      {GAME_PAGES.map(([path, Page]) => <Route key={path} path={path} component={Page} />)}
      <Route path="/rookie" component={RookiePage} />
      {OLD_PATHS.map(p => (
        <Route key={p} path={p}><Redirect to="/lobby" /></Route>
      ))}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** 로그인 사용자가 바뀌면 (세션 만료 뒤 다른 아이디 등) 이전 사용자의 화면 데이터를 지움 */
function UserWatcher() {
  const { user } = useAuth();
  useCareerRevWatch(!!user);
  const queryClient = useQueryClient();
  const last = useRef<number | null>(null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (id === null) return;
    if (last.current !== null && last.current !== id) resetUserSession(queryClient);
    last.current = id;
  }, [user?.id]);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <UpdateNotification />
          <NewVersionWatcher />
          <UserWatcher />
          <ManagerNameGate />
          <Toaster position="top-center" closeButton />
          <div className="app-frame">
            <Router />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
