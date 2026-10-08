import { resolveSlug } from '../nav-catalog';
import { HOME_PAGE, type WorkspacePage } from './workspace-model';

const CLIENT_DETAIL = /^\/m\/clients\/[0-9a-fA-F-]{36}$/;

/** Only existing subscriber routes belong to this workspace; never absorb admin or auth routes. */
export const isWorkspacePath = (path: string) =>
  path === '/' || path === '/dashboard' || path === '/settings' || /^\/m\/[^/]+$/.test(path) || CLIENT_DETAIL.test(path);

export const LEGACY_CLIENTS_PATH = '/m/view-search-clients';

export function workspacePageForPath(path: string): WorkspacePage | undefined {
  if (path === LEGACY_CLIENTS_PATH) path = '/m/clients';
  if (path === '/' || path === '/dashboard') return HOME_PAGE;
  if (path === '/settings') return { route: path, title: 'Settings', closable: true, kind: 'settings' };
  if (CLIENT_DETAIL.test(path)) return { route: path, title: 'Client', closable: true, kind: 'module' };
  if (!/^\/m\/[^/]+$/.test(path)) return undefined;
  return {
    route: path,
    title: resolveSlug(path.slice(3))?.title ?? 'Page not found',
    closable: true,
    kind: 'module',
  };
}
