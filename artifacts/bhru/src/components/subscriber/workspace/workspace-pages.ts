import { resolveSlug } from '../nav-catalog';
import { HOME_PAGE, type WorkspacePage } from './workspace-model';

/** Only existing subscriber routes belong to this workspace; never absorb admin or auth routes. */
export const isWorkspacePath = (path: string) =>
  path === '/' || path === '/dashboard' || path === '/settings' || /^\/m\/[^/]+$/.test(path);

export function workspacePageForPath(path: string): WorkspacePage | undefined {
  if (path === '/' || path === '/dashboard') return HOME_PAGE;
  if (path === '/settings') return { route: path, title: 'Settings', closable: true, kind: 'settings' };
  if (!/^\/m\/[^/]+$/.test(path)) return undefined;
  return {
    route: path,
    title: resolveSlug(path.slice(3))?.title ?? 'Page not found',
    closable: true,
    kind: 'module',
  };
}
