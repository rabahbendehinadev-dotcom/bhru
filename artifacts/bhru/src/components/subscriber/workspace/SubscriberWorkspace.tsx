import { useCallback, useEffect, useLayoutEffect, useReducer, type ReactNode } from 'react';
import { Router, useLocation, useRouter } from 'wouter';
import { SubscriberShell } from '@/components/bhru/shells';
import { ErrorBoundary } from '@/components/error-boundary';
import Dashboard from '@/pages/dashboard';
import Module from '@/pages/module';
import Settings from '@/pages/settings';
import { WorkspaceTabs, panelId, tabId } from './WorkspaceTabs';
import { workspaceReducer, createWorkspaceState, type WorkspacePage } from './workspace-model';
import { workspacePageForPath, LEGACY_CLIENTS_PATH } from './workspace-pages';
import { WorkspacePageContext } from './WorkspacePageContext';

/**
 * Retained panels have their own route context. Inactive pages must not accidentally read
 * the active page's parameters, while links still navigate through the real browser router.
 */
function PageRouter({ route, children }: { route: string; children: ReactNode }) {
  const [, navigate] = useLocation();
  const parent = useRouter();
  const hook = useCallback((): [string, typeof navigate] => [route, navigate], [route, navigate]);
  const hrefs = useCallback((href: string) => parent.hrefs(`${parent.base}${href}`), [parent]);
  return <Router hook={hook} hrefs={hrefs}>{children}</Router>;
}

function PageContent({ page }: { page: WorkspacePage }) {
  if (page.kind === 'dashboard') return <Dashboard />;
  if (page.kind === 'settings') return <Settings />;
  return <Module />;
}

function Workspace() {
  const [location, navigate] = useLocation();
  const current = workspacePageForPath(location)!;
  useLayoutEffect(() => { if (location === LEGACY_CLIENTS_PATH) navigate('/m/clients', { replace: true }); }, [location, navigate]);
  const [state, dispatch] = useReducer(workspaceReducer, current, createWorkspaceState);
  useLayoutEffect(() => {
    dispatch({ type: 'visit', page: current });
  }, [current.route, current.title]);
  useEffect(() => {
    const previous = document.title;
    document.title = `${current.title} | BHRU`;
    return () => { document.title = previous; };
  }, [current.title]);

  const close = (route: string) => {
    const next = workspaceReducer(state, { type: 'close', route });
    if (next === state) return;
    dispatch({ type: 'close', route });
    // Closing a background tab must not add a history entry or change the active URL.
    // Keep the closed page's history entry: browser Back can reopen that URL as a tab.
    if (current.route === route) navigate(next.activeRoute);
  };

  return (
    <div className="min-w-0 max-w-full" data-testid="subscriber-workspace">
      <WorkspaceTabs tabs={state.tabs} activeRoute={current.route} onActivate={navigate} onClose={close} />
      <div className="mt-4 min-w-0">
        {state.tabs.map(page => (
          <section key={page.route} id={panelId(page.route)} role="tabpanel" aria-labelledby={tabId(page.route)}
            hidden={page.route !== current.route} data-workspace-route={page.route}
            data-active={page.route === current.route} className="min-w-0"
            data-testid={`workspace-panel-${panelId(page.route).slice('workspace-panel-'.length)}`}>
            <WorkspacePageContext.Provider value={{ route: page.route, active: page.route === current.route }}>
              <PageRouter route={page.route}>
                <ErrorBoundary resetKey={page.route}><PageContent page={page} /></ErrorBoundary>
              </PageRouter>
            </WorkspacePageContext.Provider>
          </section>
        ))}
      </div>
    </div>
  );
}

/** One existing authorization gate and one persistent layout for the entire subscriber workspace. */
export default function SubscriberWorkspace() {
  return <SubscriberShell><Workspace /></SubscriberShell>;
}
