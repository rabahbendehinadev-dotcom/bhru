import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import Login from '@/pages/login';
import Register from '@/pages/register';
import Dashboard from '@/pages/dashboard';
import Module from '@/pages/module';
import Settings from '@/pages/settings';
import Overview from '@/pages/admin/overview';
import Subscribers from '@/pages/admin/subscribers';
import Plans from '@/pages/admin/plans';
import { Licences, Activations } from '@/pages/admin/licences';
import { AdminUsers, ActivityLogs, PlatformSettings } from '@/pages/admin/misc';
import { useStore, refreshState } from '@/lib/store';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/settings" component={Settings} />
        <Route path="/m/:slug" component={Module} />
        <Route path="/admin" component={Overview} />
        <Route path="/admin/subscribers" component={Subscribers} />
        <Route path="/admin/plans" component={Plans} />
        <Route path="/admin/licences" component={Licences} />
        <Route path="/admin/activations" component={Activations} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/logs" component={ActivityLogs} />
        <Route path="/admin/settings" component={PlatformSettings} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const state = useStore();
  if (state.loading) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading account...</div>;
  if (state.error) return <div className="grid min-h-screen place-items-center p-4"><div className="card max-w-md space-y-3 p-5"><h1>Connection unavailable</h1><p className="text-sm text-muted-foreground">{state.error}</p><button className="btn btn-primary" onClick={() => void refreshState()}>Retry</button></div></div>;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
