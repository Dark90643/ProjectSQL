import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Login from "@/pages/login";
import ServerSelector from "@/pages/server-selector";
import Dashboard from "@/pages/dashboard";
import PublicDashboard from "@/pages/public-dashboard";
import CaseView from "@/pages/case-view";
import AdminPanel from "@/pages/admin";
import Recovery from "@/pages/recovery";
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
      <Route path="/public" component={PublicDashboard} />
      <Route path="/" component={Login} />
      <Route path="/server-selector" component={ServerSelector} />
      
      {/* Protected Routes need Layout */}
      <Route path="/dashboard">
        <Layout><ProtectedRoute component={Dashboard} path="/dashboard" /></Layout>
      </Route>
      <Route path="/cases/:id">
        <Layout><ProtectedRoute component={CaseView} path="/cases/:id" /></Layout>
      </Route>
      <Route path="/admin">
        <Layout><ProtectedRoute component={AdminPanel} path="/admin" /></Layout>
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
