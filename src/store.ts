import { createContext, useContext } from 'react';
import type { DataBundle, Person, Project, Task } from './types';

export type StoreCtx = {
  data: DataBundle;
  projectById: Map<string, Project>;
  personById: Map<string, Person>;
  filters: {
    projectIds: Set<string>;
    assigneeIds: Set<string>;
    subprojectIds: Set<string>;
    colorBy: 'status' | 'assignee' | 'project';
    showGcal: boolean;
  };
  gcal: {
    accessToken: string | null;
    loading: boolean;
    error: string | null;
    connect: () => void;
    disconnect: () => void;
  };
  setFilters: (f: Partial<StoreCtx['filters']>) => void;
  planTask: (taskId: string, startISO: string, endISO: string) => void;
  unplanTask: (taskId: string) => void;
  updateTaskDates: (taskId: string, startISO: string, endISO: string) => void;
  openTaskModal: (taskId: string) => void;
  openGcalModal: (eventId: string) => void;
};

export const StoreContext = createContext<StoreCtx | null>(null);

export function useStore(): StoreCtx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function colorForTask(
  task: Task,
  store: Pick<StoreCtx, 'projectById' | 'personById' | 'filters'>,
): string {
  const { colorBy } = store.filters;
  if (colorBy === 'project') return store.projectById.get(task.project_id)?.color ?? '#94a3b8';
  if (colorBy === 'assignee') return store.personById.get(task.assignee_id)?.color ?? '#94a3b8';
  switch (task.status) {
    case 'todo': return '#64748b';
    case 'in_progress': return '#3b82f6';
    case 'to_process': return '#f97316';
    case 'blocked': return '#ef4444';
    case 'done': return '#10b981';
    default: return '#94a3b8';
  }
}
