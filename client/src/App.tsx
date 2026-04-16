import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CreatePlayer from "./pages/CreatePlayer";
import PlayerProfile from "./pages/PlayerProfile";
import Shop from "./pages/Shop";
import Admin from "./pages/Admin";
import Events from "./pages/Events";
import Practice from "./pages/Practice";
import GameResults from "./pages/GameResults";
import Ranking from "./pages/Ranking";
import GameLayout from "./components/GameLayout";
import { UpdateNotification } from "./components/UpdateNotification";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/create-player" component={CreatePlayer} />
      <Route path="/profile">
        <GameLayout>
          <PlayerProfile />
        </GameLayout>
      </Route>
      <Route path="/shop">
        <GameLayout>
          <Shop />
        </GameLayout>
      </Route>
      <Route path="/admin">
        <GameLayout>
          <Admin />
        </GameLayout>
      </Route>
      <Route path="/events">
        <GameLayout>
          <Events />
        </GameLayout>
      </Route>
      <Route path="/practice">
        <GameLayout>
          <Practice />
        </GameLayout>
      </Route>
      <Route path="/game-results">
        <GameLayout>
          <GameResults />
        </GameLayout>
      </Route>
      <Route path="/ranking">
        <GameLayout>
          <Ranking />
        </GameLayout>
      </Route>
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
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
