import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import Login from '@/pages/login';
import Register from '@/pages/register';
import SubscriberWorkspace from '@/components/subscriber/workspace/SubscriberWorkspace';
import { isWorkspacePath } from '@/components/subscriber/workspace/workspace-pages';
import Overview from '@/pages/admin/overview';
import Subscribers from '@/pages/admin/subscribers';
import Plans from '@/pages/admin/plans';
import { Licences, Activations } from '@/pages/admin/licences';
import { AdminUsers, ActivityLogs, PlatformSettings } from '@/pages/admin/misc';
import { useStore, refreshState } from '@/lib/store';
import { resolveAuthEntry, type AuthEntry } from '@workspace/api-client-react';
import { AdminEntryContext } from '@/lib/admin-entry';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const { session } = useStore();
  const [entry, setEntry] = useState<{ key: string; data?: AuthEntry; error?: string; denied?: boolean }>({ key: '' });
  const publicPath = ['/', '/dashboard', '/login', '/register', '/settings'].includes(location) || location.startsWith('/m/');
  const key = `${location}:${session.role}`;
  const needsContext = !publicPath || session.role === 'admin';
  useEffect(() => {
    if (!needsContext) return;
    let cancelled = false;
    resolveAuthEntry({ path: location }, { credentials: 'same-origin', headers: { 'X-BHRU-Auth': session.role === 'admin' ? 'admin' : 'subscriber' } }).then(data => {
      if (!cancelled) setEntry({ key, data });
    }).catch(error => {
      if (!cancelled) setEntry({ key, denied: error.status === 403, error: error.message });
    });
    return () => { cancelled = true; };
  }, [key, location, needsContext]);
  if (needsContext && entry.key !== key) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading...</div>;
  if (needsContext && entry.error) return (
    <div className="grid min-h-screen place-items-center p-4"><div className="card max-w-md space-y-3 p-5" data-testid="admin-access-denied">
      <h1 className="text-[17px] font-semibold">{entry.denied ? '403 — Access denied' : 'Connection unavailable'}</h1>
      <p className="text-sm text-muted-foreground">{entry.denied ? 'This account does not have platform administrator access.' : entry.error}</p>
    </div></div>
  );
  const adminPath = needsContext ? entry.data?.adminPath || '' : '';
  if (needsContext && entry.data?.isAdminEntry && session.role !== 'admin') return <Login adminPath={adminPath} />;
  return (
    <AdminEntryContext.Provider value={adminPath}>
    <RoutedErrorBoundary>
      {isWorkspacePath(location) ? (
        <SubscriberWorkspace key={session.subscriberId ?? 'anonymous'} />
      ) : (
      <Switch>
        <Route path="/login"><Login /></Route>
        <Route path="/register" component={Register} />
        {adminPath && session.role === 'admin' && [
          ['', Overview], ['/subscribers', Subscribers], ['/plans', Plans], ['/licences', Licences],
          ['/activations', Activations], ['/users', AdminUsers], ['/logs', ActivityLogs], ['/settings', PlatformSettings],
        ].map(([suffix, Component]) => <Route key={suffix as string} path={`${adminPath}${suffix}`} component={Component as typeof Overview} />)}
        <Route component={NotFound} />
      </Switch>
      )}
    </RoutedErrorBoundary>
    </AdminEntryContext.Provider>
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
