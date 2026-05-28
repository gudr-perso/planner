import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useStore, colorForTask } from '../store';
import { STATUS_COLORS, STATUS_LABELS } from '../types';
import { save, load } from '../persistence';
import type { Task } from '../types';

// ── Grouping ──────────────────────────────────────────────────────────────────

type GroupBy = 'none' | 'project' | 'subproject' | 'status';

const GROUP_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: '—',        value: 'none'       },
  { label: 'Projet',   value: 'project'    },
  { label: 'S-Projet', value: 'subproject' },
  { label: 'Statut',   value: 'status'     },
];

// ── Task card ─────────────────────────────────────────────────────────────────

function DraggableTask({ task, hideProject, hideStatus }: { task: Task; hideProject?: boolean; hideStatus?: boolean }) {
  const store = useStore();
  const color = colorForTask(task, store);
  const project = store.projectById.get(task.project_id);
  const person = store.personById.get(task.assignee_id);

  const subproject = task.subproject_id
    ? store.data.subprojects?.find((sp) => sp.id === task.subproject_id)
    : null;
  const displayProject = subproject?.name ?? project?.name;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { taskId: task.id, source: 'unplanned' },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`select-none rounded-lg p-2.5 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-30 scale-95' : 'hover:brightness-110'
      }`}
      style={{
        background: `${color}18`,
        border: `1px solid ${color}30`,
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      <div className="text-[12px] font-medium leading-snug" style={{ color: 'var(--text)' }}>{task.title}</div>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        {!hideProject && (
          <div className="flex flex-col min-w-0">
            {subproject && (
              <span className="text-[9px] truncate max-w-[110px]" style={{ color: 'var(--accent)' }}>{project?.name}</span>
            )}
            <span className="text-[10px] truncate max-w-[110px]" style={{ color: 'var(--text-muted)' }}>{displayProject}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <span className="text-[10px]" style={{ color: person?.color }}>{person?.name}</span>
          {!hideStatus && (
            <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: color + '30', color }}>
              {STATUS_LABELS[task.status]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({
  label, color, count, collapsed, onToggle,
}: {
  label: string;
  color: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-2 py-1 rounded mb-1 transition hover:brightness-110 text-left"
      style={{ background: color + '15', borderLeft: `2px solid ${color}` }}
    >
      <span
        className="text-[9px] shrink-0 transition-transform"
        style={{ color, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}
      >▼</span>
      <span className="text-[10px] font-semibold truncate flex-1" style={{ color }}>{label}</span>
      <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>{count}</span>
    </button>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function UnplannedPanel({ width }: { width: number }) {
  const store = useStore();
  const [groupBy, setGroupBy] = useState<GroupBy>(() => load<GroupBy>('unplannedGroup', 'none'));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const handleGroup = (g: GroupBy) => {
    setGroupBy(g);
    setCollapsed(new Set()); // reset collapsed quand on change de regroupement
    save('unplannedGroup', g);
  };

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // showInUnplanned set explicitly for Notion data; demo data falls back to !planned
  const unplanned = store.data.tasks.filter((t) =>
    t.showInUnplanned !== undefined ? t.showInUnplanned : !t.planned
  );
  const visible = unplanned.filter((t) => {
    const projOk = store.filters.projectIds.size === 0 || store.filters.projectIds.has(t.project_id);
    const persOk = store.filters.assigneeIds.size === 0 || store.filters.assigneeIds.has(t.assignee_id);
    const spOk = store.filters.subprojectIds.size === 0 || (t.subproject_id ? store.filters.subprojectIds.has(t.subproject_id) : true);
    return projOk && persOk && spOk;
  });

  // Build groups
  type Group = { key: string; label: string | null; color: string; tasks: Task[] };
  const groups = useMemo((): Group[] => {
    if (groupBy === 'none') return [{ key: 'all', label: null, color: '', tasks: visible }];

    const map = new Map<string, Group>();

    for (const task of visible) {
      let key: string;
      let label: string;
      let color: string;

      if (groupBy === 'project') {
        const proj = store.projectById.get(task.project_id);
        key = task.project_id;
        label = proj?.name ?? 'Sans projet';
        color = proj?.color ?? '#94a3b8';
      } else if (groupBy === 'subproject') {
        const sp = task.subproject_id
          ? store.data.subprojects?.find((s) => s.id === task.subproject_id)
          : null;
        key = task.subproject_id ?? '__none__';
        label = sp?.name ?? 'Sans sous-projet';
        const proj = sp ? store.projectById.get(sp.project_id) : null;
        color = proj?.color ?? '#94a3b8';
      } else {
        // status
        key = task.status;
        label = STATUS_LABELS[task.status];
        color = STATUS_COLORS[task.status];
      }

      if (!map.has(key)) map.set(key, { key, label, color, tasks: [] });
      map.get(key)!.tasks.push(task);
    }

    return Array.from(map.values());
  }, [visible, groupBy, store.projectById, store.data.subprojects]);

  return (
    <aside
      className="shrink-0 flex flex-col h-full overflow-hidden"
      style={{ width, background: 'var(--bg-deep)', borderRight: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="px-3 pt-2.5 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>À planifier</h2>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{visible.length}</span>
        </div>

        {/* Group selector */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[10px] shrink-0 mr-0.5" style={{ color: 'var(--text-muted)' }}>Groupe :</span>
          {GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleGroup(opt.value)}
              title={opt.value === 'none' ? 'Sans groupement' : `Grouper par ${opt.label}`}
              className="text-[10px] px-1.5 py-0.5 rounded transition flex-1"
              style={groupBy === opt.value
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
                : { background: 'var(--bg)', color: 'var(--text-muted)' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="mx-2 mt-2 px-2 py-1.5 rounded flex items-center gap-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>↔</span>
        <span className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>Glisse vers le calendrier ou le gantt pour planifier</span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2 mt-1">
        {visible.length === 0 && (
          <p className="text-[11px] text-center py-8" style={{ color: 'var(--border)' }}>Aucune tâche</p>
        )}

        {groups.map((group, gi) => {
          const key = group.key ?? String(gi);
          // collapsed Set now tracks EXPANDED groups (not collapsed ones)
          // → empty Set by default = all groups collapsed
          // → group.label null (groupBy='none') always shows tasks
          const isCollapsed = group.label !== null && !collapsed.has(key);
          return (
            <div key={key} className={gi > 0 ? 'mt-3' : ''}>
              {group.label && (
                <GroupHeader
                  label={group.label}
                  color={group.color}
                  count={group.tasks.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggleGroup(key)}
                />
              )}
              {!isCollapsed && (
                <div className="space-y-1.5">
                  {group.tasks.map((t) => (
                    <DraggableTask
                      key={t.id}
                      task={t}
                      hideProject={groupBy === 'project' || groupBy === 'subproject'}
                      hideStatus={groupBy === 'status'}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
