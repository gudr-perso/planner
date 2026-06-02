import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Gantt, ViewMode, TitleColumn, type Task as GanttTask, type TaskOrEmpty, type Column } from '@wamra/gantt-task-react';
import '@wamra/gantt-task-react/dist/style.css';
import { useStore, colorForTask } from '../store';
import { useIsMobile } from '../hooks/useBreakpoint';

const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'Jour', value: ViewMode.Day },
  { label: 'Semaine', value: ViewMode.Week },
  { label: 'Mois', value: ViewMode.Month },
  { label: 'Trimestre', value: ViewMode.QuarterYear },
];

const DEFAULT_COLUMNS: readonly Column[] = [
  { Cell: TitleColumn, id: 'title', title: 'Tâche', width: 240, canResize: true },
];

export function GanttView() {
  const store = useStore();
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Month);
  const [columns, setColumns] = useState<readonly Column[]>(DEFAULT_COLUMNS);

  const ganttTasks: TaskOrEmpty[] = useMemo(() => {
    const out: TaskOrEmpty[] = [];
    const subprojects = store.data.subprojects ?? [];

    for (const proj of store.data.projects) {
      const allProjTasks = store.data.tasks.filter((t) => {
        if (t.project_id !== proj.id) return false;
        if (!t.planned || !t.start_date || !t.end_date) return false;
        const projOk = store.filters.projectIds.size === 0 || store.filters.projectIds.has(t.project_id);
        const persOk = store.filters.assigneeIds.size === 0 || store.filters.assigneeIds.has(t.assignee_id);
        const spOk = store.filters.subprojectIds.size === 0 || (t.subproject_id ? store.filters.subprojectIds.has(t.subproject_id) : true);
        return projOk && persOk && spOk;
      }).sort((a, b) => a.start_date! < b.start_date! ? -1 : 1);
      if (allProjTasks.length === 0) continue;

      const minDate = new Date(Math.min(...allProjTasks.map((t) => +new Date(t.start_date!))));
      const maxDate = new Date(Math.max(...allProjTasks.map((t) => +new Date(t.end_date!))));

      out.push({
        id: `P:${proj.id}`,
        name: proj.name,
        type: 'project',
        start: minDate,
        end: maxDate,
        progress: 0,
        hideChildren: false,
        styles: {
          projectBackgroundColor: proj.color + '80',
          projectBackgroundSelectedColor: proj.color,
          projectProgressColor: proj.color,
          projectProgressSelectedColor: proj.color,
        },
      } as GanttTask);

      const projSubprojects = subprojects.filter((sp) => sp.project_id === proj.id);

      if (projSubprojects.length > 0) {
        // ── 3-level: Project → Sub-project → Task ────────────────────────────
        for (const sp of projSubprojects) {
          const spTasks = allProjTasks.filter((t) => t.subproject_id === sp.id);
          if (spTasks.length === 0) continue;

          const spMin = new Date(Math.min(...spTasks.map((t) => +new Date(t.start_date!))));
          const spMax = new Date(Math.max(...spTasks.map((t) => +new Date(t.end_date!))));

          out.push({
            id: `SP:${sp.id}`,
            name: sp.name,
            type: 'project',
            start: spMin,
            end: spMax,
            progress: 0,
            parent: `P:${proj.id}`,
            hideChildren: false,
            styles: {
              projectBackgroundColor: proj.color + '50',
              projectBackgroundSelectedColor: proj.color + '90',
              projectProgressColor: proj.color + '80',
              projectProgressSelectedColor: proj.color + '90',
            },
          } as GanttTask);

          for (const t of spTasks) {
            const color = colorForTask(t, store);
            const person = store.personById.get(t.assignee_id);
            const initials = person ? person.name.slice(0, 3) : '';
            out.push({
              id: `T:${t.id}`,
              name: initials ? `${t.title} {${initials}}` : t.title,
              type: 'task',
              start: new Date(t.start_date!),
              end: new Date(t.end_date!),
              progress: t.status === 'done' ? 100 : t.status === 'in_progress' ? 40 : 0,
              parent: `SP:${sp.id}`,
              styles: {
                barBackgroundColor: color,
                barBackgroundSelectedColor: color,
                barProgressColor: color + 'cc',
                barProgressSelectedColor: color,
              },
            } as GanttTask);
          }
        }

        // Orphan tasks (no sub-project) → attach directly to project
        for (const t of allProjTasks.filter((t) => !t.subproject_id)) {
          const color = colorForTask(t, store);
          const person = store.personById.get(t.assignee_id);
          const initials = person ? person.name.slice(0, 3) : '';
          out.push({
            id: `T:${t.id}`,
            name: initials ? `${t.title} {${initials}}` : t.title,
            type: 'task',
            start: new Date(t.start_date!),
            end: new Date(t.end_date!),
            progress: t.status === 'done' ? 100 : t.status === 'in_progress' ? 40 : 0,
            parent: `P:${proj.id}`,
            styles: {
              barBackgroundColor: color,
              barBackgroundSelectedColor: color,
              barProgressColor: color + 'cc',
              barProgressSelectedColor: color,
            },
          } as GanttTask);
        }
      } else {
        // ── 2-level: Project → Task (demo data or no sub-projects) ───────────
        for (const t of allProjTasks) {
          const color = colorForTask(t, store);
          const person = store.personById.get(t.assignee_id);
          const initials = person ? person.name.slice(0, 3) : '';
          out.push({
            id: `T:${t.id}`,
            name: initials ? `${t.title} {${initials}}` : t.title,
            type: 'task',
            start: new Date(t.start_date!),
            end: new Date(t.end_date!),
            progress: t.status === 'done' ? 100 : t.status === 'in_progress' ? 40 : 0,
            parent: `P:${proj.id}`,
            styles: {
              barBackgroundColor: color,
              barBackgroundSelectedColor: color,
              barProgressColor: color + 'cc',
              barProgressSelectedColor: color,
            },
          } as GanttTask);
        }
      }
    }

    return out;
  }, [store.data.tasks, store.data.projects, store.data.subprojects, store.filters.projectIds, store.filters.assigneeIds, store.filters.subprojectIds, store.filters.colorBy, store.personById, store.projectById]);

  const isMobile = useIsMobile();
  const { setNodeRef, isOver } = useDroppable({ id: 'drop-gantt' });

  // ── Fallback mobile : liste tâches par projet ────────────────────────────
  if (isMobile) {
    const filteredTasks = store.data.tasks.filter(t => {
      if (!t.planned || !t.start_date || !t.end_date) return false;
      const projOk = store.filters.projectIds.size === 0 || store.filters.projectIds.has(t.project_id);
      const persOk = store.filters.assigneeIds.size === 0 || store.filters.assigneeIds.has(t.assignee_id);
      return projOk && persOk;
    });

    // Group by project
    const byProject = new Map<string, typeof filteredTasks>();
    for (const t of filteredTasks) {
      if (!byProject.has(t.project_id)) byProject.set(t.project_id, []);
      byProject.get(t.project_id)!.push(t);
    }

    const STATUS_LABEL: Record<string, string> = {
      todo: 'À faire', in_progress: 'En cours', done: 'Terminé',
      blocked: 'Bloqué', to_process: 'À traiter',
    };

    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--surface)' }}>
        <div className="px-3 py-2 border-b shrink-0 text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          {filteredTasks.length} tâche{filteredTasks.length !== 1 ? 's' : ''} planifiée{filteredTasks.length !== 1 ? 's' : ''}
          <span className="ml-2 opacity-60">— Vue Gantt disponible sur desktop</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {byProject.size === 0 ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-dim)' }}>
              Aucune tâche planifiée
            </div>
          ) : (
            Array.from(byProject.entries()).map(([projId, tasks]) => {
              const proj = store.projectById.get(projId);
              return (
                <div key={projId}>
                  {/* Entête projet */}
                  <div
                    className="px-3 py-2 sticky top-0 z-10 flex items-center gap-2"
                    style={{
                      background: 'var(--bg)',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${proj?.color ?? 'var(--accent)'}`,
                    }}
                  >
                    <span className="text-xs font-semibold" style={{ color: proj?.color ?? 'var(--accent)' }}>
                      {proj?.name ?? projId}
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</span>
                  </div>

                  {tasks.map(task => {
                    const startFmt = task.start_date ? new Date(task.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                    const endFmt = task.end_date ? new Date(task.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                    const color = colorForTask(task, store);
                    const person = store.personById.get(task.assignee_id);

                    // Progress bar width based on status
                    const progress = task.status === 'done' ? 100 : task.status === 'in_progress' ? 50 : task.status === 'blocked' ? 20 : 0;

                    return (
                      <button
                        key={task.id}
                        onClick={() => store.openTaskModal(task.id)}
                        className="w-full text-left px-3 py-2.5 border-b transition"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-1 rounded-full shrink-0 mt-1" style={{ height: 40, background: color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{task.title}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{startFmt} → {endFmt}</span>
                              {person && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: person.color + '20', color: person.color }}>
                                  {person.name.slice(0, 3)}
                                </span>
                              )}
                            </div>
                            {/* Barre de progression */}
                            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: color }} />
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                              {STATUS_LABEL[task.status] ?? task.status}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (store.dataLoading) return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement des tâches…</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Zoom :</span>
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setViewMode(opt.value)}
            className="text-xs px-2 py-1 rounded transition"
            style={viewMode === opt.value
              ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
              : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div
        ref={setNodeRef}
        className={`themed-scroll flex-1 overflow-auto relative transition ${isOver ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
        style={{ background: 'var(--surface)' }}
      >
        {isOver && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs px-3 py-1 rounded-full shadow">
            Déposer pour planifier (à partir de demain, durée 5 jours)
          </div>
        )}
        {ganttTasks.length > 0 ? (
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            columns={columns}
            canResizeColumns
            onResizeColumn={(next) => setColumns(next)}
            onClick={(t) => {
              if (t.id.startsWith('T:')) store.openTaskModal(t.id.slice(2));
            }}
            onChangeTasks={(next) => {
              for (const t of next) {
                if (t.id.startsWith('T:') && 'start' in t && 'end' in t) {
                  const taskId = t.id.slice(2);
                  const startISO = t.start.toISOString().slice(0, 10);
                  const endISO = t.end.toISOString().slice(0, 10);
                  store.updateTaskDates(taskId, startISO, endISO);
                }
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--surface-text-dim)' }}>
            Aucune tâche planifiée dans ce filtre
          </div>
        )}
      </div>
    </div>
  );
}
