import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Login from "@/pages/login";
import ServerSelector from "@/pages/server-selector";
import DiscordAuth from "@/pages/discord-auth";
import BotInvite from "@/pages/bot-invite";
import SupportPanel from "@/pages/support-panel";
import Dashboard from "@/pages/dashboard";
import CaseView from "@/pages/case-view";
import AdminPanel from "@/pages/admin";
import SettingsPage from "@/pages/settings";
import Recovery from "@/pages/recovery";
import PublicDashboard from "@/pages/public-dashboard";
import Layout from "@/components/layout";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType<any>, path: string }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (!user) return null;
  return <Component />;
}

function RouterContent() {
  const { user, discordUser } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (user && location === "/") {
      setLocation("/dashboard");
    }
    if (discordUser && location === "/") {
      setLocation("/server-selector");
    }
  }, [user, discordUser, location, setLocation]);

  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/public" component={PublicDashboard} />
      <Route path="/server-selector" component={ServerSelector} />
      <Route path="/discord-auth" component={DiscordAuth} />
      <Route path="/bot-invite" component={BotInvite} />
      <Route path="/support-panel">
        <Layout><SupportPanel /></Layout>
      </Route>
      
      {/* Protected Routes need Layout */}
      <Route path="/dashboard">
        <Layout><ProtectedRoute component={Dashboard} path="/dashboard" /></Layout>
      </Route>
      <Route path="/cases/:id">
        <Layout><CaseView /></Layout>
      </Route>
      <Route path="/admin">
        <Layout><ProtectedRoute component={AdminPanel} path="/admin" /></Layout>
      </Route>
      <Route path="/settings">
        <Layout><ProtectedRoute component={SettingsPage} path="/settings" /></Layout>
      </Route>
      <Route path="/recovery">
        <Layout><ProtectedRoute component={Recovery} path="/recovery" /></Layout>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterContent />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
