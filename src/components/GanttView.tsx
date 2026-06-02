import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Gantt, ViewMode, TitleColumn, type Task as GanttTask, type TaskOrEmpty, type Column } from '@wamra/gantt-task-react';
import '@wamra/gantt-task-react/dist/style.css';
import { useStore, colorForTask } from '../store';

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

  const { setNodeRef, isOver } = useDroppable({ id: 'drop-gantt' });

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
