import { createContext, useContext } from 'react';

export interface WorkspacePageContextValue { route: string; active: boolean }
export const WorkspacePageContext = createContext<WorkspacePageContextValue | null>(null);

/** Future pages can pause their own background work without discarding forms or filters. */
export function useWorkspacePage() {
  const page = useContext(WorkspacePageContext);
  if (!page) throw new Error('useWorkspacePage must be used inside a subscriber workspace page.');
  return page;
}
