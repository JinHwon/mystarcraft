import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminEvents from "./pages/AdminEvents";
import Team from "./pages/Team";
import Training from "./pages/Training";
import League from "./pages/League";
import Lobby from "./pages/Lobby";
import Transfer from "./pages/Transfer";
import Records from "./pages/Records";
import StarLeague from "./pages/StarLeague";
import { Redirect } from "wouter";
import GameLayout from "./components/GameLayout";
import { UpdateNotification } from "./components/UpdateNotification";

const withLayout = (Page: React.ComponentType) => () => (
  <GameLayout>
    <Page />
  </GameLayout>
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/lobby" component={withLayout(Lobby)} />
      <Route path="/team" component={withLayout(Team)} />
      <Route path="/training" component={withLayout(Training)} />
      <Route path="/league" component={withLayout(League)} />
      <Route path="/transfer" component={withLayout(Transfer)} />
      <Route path="/records" component={withLayout(Records)} />
      <Route path="/starleague" component={withLayout(StarLeague)} />
      <Route path="/admin" component={withLayout(Admin)} />
      <Route path="/admin/events" component={withLayout(AdminEvents)} />
      {/* 예전(내 선수 육성) 화면 주소는 감독실로 */}
      {["/create-player", "/profile", "/shop", "/practice", "/game-results", "/ranking", "/events"].map(p => (
        <Route key={p} path={p}><Redirect to="/lobby" /></Route>
      ))}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <UpdateNotification />
          <Toaster position="top-center" />
          <div className="app-frame">
            <Router />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
