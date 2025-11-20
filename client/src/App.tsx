import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import CaseView from "@/pages/case-view";
import AdminPanel from "@/pages/admin";
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

function Router() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (user && location === "/") {
      setLocation("/dashboard");
    }
  }, [user, location, setLocation]);

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} path="/dashboard" />
        </Route>
        <Route path="/cases/:id">
          <ProtectedRoute component={CaseView} path="/cases/:id" />
        </Route>
        <Route path="/admin">
          <ProtectedRoute component={AdminPanel} path="/admin" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
