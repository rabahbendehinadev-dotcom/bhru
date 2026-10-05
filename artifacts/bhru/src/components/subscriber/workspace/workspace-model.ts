export interface WorkspacePage {
  route: string;
  title: string;
  closable: boolean;
  kind: 'dashboard' | 'module' | 'settings';
}

export interface WorkspaceState {
  tabs: WorkspacePage[];
  activeRoute: string;
}

export const HOME_PAGE: WorkspacePage = {
  route: '/', title: 'Dashboard', closable: false, kind: 'dashboard',
};

export function createWorkspaceState(page: WorkspacePage): WorkspaceState {
  return { tabs: page.route === '/' ? [HOME_PAGE] : [HOME_PAGE, page], activeRoute: page.route };
}

export type WorkspaceAction =
  | { type: 'visit'; page: WorkspacePage }
  | { type: 'close'; route: string };

/** URL visits open or activate; closing the active page selects its nearest left-hand neighbour. */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === 'visit') {
    const existing = state.tabs.some(tab => tab.route === action.page.route);
    if (existing && state.activeRoute === action.page.route) return state;
    return {
      tabs: existing ? state.tabs : [...state.tabs, action.page],
      activeRoute: action.page.route,
    };
  }
  const index = state.tabs.findIndex(tab => tab.route === action.route);
  if (index < 0 || !state.tabs[index].closable) return state;
  const tabs = state.tabs.filter(tab => tab.route !== action.route);
  return {
    tabs,
    activeRoute: state.activeRoute === action.route
      ? tabs[Math.max(0, index - 1)].route
      : state.activeRoute,
  };
}
