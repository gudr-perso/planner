import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Task } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso.includes(' ') ? iso.replace(' ', 'T') : iso)
      .toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none',
};

const btnStyle = (active?: boolean): React.CSSProperties => ({
  ...inputStyle, cursor: 'pointer',
  background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-deep)',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
});

type SortCol = 'origine' | 'title' | 'date' | 'planifie' | 'priorite' | 'statut' | 'sousprojet' | 'projet';
type GroupBy = 'none' | 'projet' | 'sousprojet';

function SortTh({
  col, label, current, dir, onSort, style,
}: {
  col: SortCol; label: string; current: SortCol; dir: 'asc' | 'desc';
  onSort: (c: SortCol) => void; style?: React.CSSProperties;
}) {
  const active = col === current;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', textAlign: 'left',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: 'var(--surface)',
        position: 'sticky', top: 0, zIndex: 1,
        borderBottom: '1px solid var(--border)',
        ...style,
      }}
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TodoView() {
  const store = useStore();
  const tasks = store.data.tasks;
  const projects = store.data.projects;
  const subprojects = store.data.subprojects ?? [];

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterOrigine, setFilterOrigine] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterResponsable, setFilterResponsable] = useState('Guillaume D.');
  const [filterProjet, setFilterProjet] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function toggleSort(col: SortCol) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  // ── Lookup maps ───────────────────────────────────────────────────────────
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const subprojectById = useMemo(() => new Map(subprojects.map(s => [s.id, s])), [subprojects]);

  // ── Unique values for dropdowns ───────────────────────────────────────────
  const origineValues = useMemo(() => {
    const s = new Set(tasks.map(t => t.extraFields?.['Origine'] ?? '').filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  const prioriteValues = useMemo(() => {
    const s = new Set(tasks.map(t => t.extraFields?.['Priorité'] ?? '').filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  const statutValues = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach(t => s.add(STATUS_LABELS[t.status]));
    return [...s];
  }, [tasks]);

  const responsableValues = useMemo(() => {
    const s = new Set(tasks.map(t => t.extraFields?.['Responsable'] ?? '').filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  const projetValues = useMemo(() => projects.map(p => p.name).sort(), [projects]);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tasks;

    if (!showDone) list = list.filter(t => t.status !== 'done');

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q));
    }
    if (filterOrigine) list = list.filter(t => t.extraFields?.['Origine'] === filterOrigine);
    if (filterPriorite) list = list.filter(t => t.extraFields?.['Priorité'] === filterPriorite);
    if (filterStatut) list = list.filter(t => STATUS_LABELS[t.status] === filterStatut);
    if (filterResponsable) list = list.filter(t => t.extraFields?.['Responsable'] === filterResponsable);
    if (filterProjet) {
      list = list.filter(t => {
        const p = projectById.get(t.project_id);
        return p?.name === filterProjet;
      });
    }

    const compare = (a: Task, b: Task): number => {
      let va = '', vb = '';
      switch (sortCol) {
        case 'origine':   va = a.extraFields?.['Origine'] ?? ''; vb = b.extraFields?.['Origine'] ?? ''; break;
        case 'title':     va = a.title; vb = b.title; break;
        case 'date':      va = a.start_date ?? ''; vb = b.start_date ?? ''; break;
        case 'planifie':  va = a.extraFields?.['Planifié le'] ?? ''; vb = b.extraFields?.['Planifié le'] ?? ''; break;
        case 'priorite':  va = a.extraFields?.['Priorité'] ?? ''; vb = b.extraFields?.['Priorité'] ?? ''; break;
        case 'statut':    va = STATUS_LABELS[a.status]; vb = STATUS_LABELS[b.status]; break;
        case 'sousprojet': {
          const sa = subprojectById.get(a.subproject_id ?? '');
          const sb = subprojectById.get(b.subproject_id ?? '');
          va = sa?.name ?? ''; vb = sb?.name ?? ''; break;
        }
        case 'projet': {
          va = projectById.get(a.project_id)?.name ?? '';
          vb = projectById.get(b.project_id)?.name ?? ''; break;
        }
      }
      const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    };

    return [...list].sort(compare);
  }, [tasks, showDone, search, filterOrigine, filterPriorite, filterStatut, filterResponsable, filterProjet, sortCol, sortDir, projectById, subprojectById]);

  // ── Grouping ──────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, { label: string; items: Task[] }>();
    for (const t of filtered) {
      let key = '';
      let label = '';
      if (groupBy === 'projet') {
        const p = projectById.get(t.project_id);
        key = t.project_id;
        label = p?.name ?? 'Sans projet';
      } else {
        const sp = subprojectById.get(t.subproject_id ?? '');
        key = t.subproject_id ?? '__none__';
        label = sp?.name ?? 'Sans sous-projet';
      }
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(t);
    }
    return [...map.values()];
  }, [filtered, groupBy, projectById, subprojectById]);

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Row render ────────────────────────────────────────────────────────────
  function renderRow(task: Task) {
    const projet = projectById.get(task.project_id);
    const sousProjet = subprojectById.get(task.subproject_id ?? '');
    const selected = task.id === selectedId;

    return (
      <tr
        key={task.id}
        onClick={() => setSelectedId(task.id)}
        onDoubleClick={() => store.openTaskModal(task.id)}
        style={{
          cursor: 'pointer',
          background: selected
            ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
            : undefined,
          borderBottom: '1px solid var(--border)',
        }}
        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = ''; }}
      >
        <td style={td}>{task.extraFields?.['Origine'] ? (
          <span style={{ fontSize: 11, borderRadius: 4, padding: '1px 6px', background: 'color-mix(in srgb, var(--text-muted) 14%, transparent)', color: 'var(--text-muted)' }}>
            {task.extraFields['Origine']}
          </span>
        ) : '—'}</td>
        <td style={{ ...td, fontWeight: 500, color: 'var(--text)' }}>{task.title}</td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>{formatDate(task.start_date)}</td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>{task.extraFields?.['Planifié le'] ? formatDate(task.extraFields['Planifié le']) : '—'}</td>
        <td style={td}>{task.extraFields?.['Priorité'] ? (
          <span style={{ fontSize: 11, borderRadius: 4, padding: '1px 6px', background: 'color-mix(in srgb, var(--text-muted) 14%, transparent)', color: 'var(--text-muted)' }}>
            {task.extraFields['Priorité']}
          </span>
        ) : '—'}</td>
        <td style={td}>
          <span style={{
            fontSize: 11, borderRadius: 4, padding: '1px 6px',
            background: `${STATUS_COLORS[task.status]}22`,
            color: STATUS_COLORS[task.status],
          }}>
            {STATUS_LABELS[task.status]}
          </span>
        </td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>{sousProjet?.name ?? '—'}</td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>
          {projet ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: projet.color, flexShrink: 0 }} />
              {projet.name}
            </span>
          ) : '—'}
        </td>
      </tr>
    );
  }

  const td: React.CSSProperties = { padding: '6px 10px', fontSize: 12, verticalAlign: 'middle' };

  const thStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: 'var(--text-muted)', background: 'var(--surface)',
    position: 'sticky', top: 0, zIndex: 1, borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <input
          placeholder="🔍 Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: 160 }}
        />

        <select value={filterOrigine} onChange={e => setFilterOrigine(e.target.value)} style={inputStyle}>
          <option value="">Origine</option>
          {origineValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)} style={inputStyle}>
          <option value="">Priorité</option>
          {prioriteValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={inputStyle}>
          <option value="">État</option>
          {statutValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={filterResponsable} onChange={e => setFilterResponsable(e.target.value)} style={inputStyle}>
          <option value="">Responsable (tous)</option>
          {responsableValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)} style={inputStyle}>
          <option value="">Projet</option>
          {projetValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} style={inputStyle}>
          <option value="none">Regrouper par…</option>
          <option value="projet">Projet</option>
          <option value="sousprojet">Sous-projet</option>
        </select>

        <button
          onClick={() => setShowDone(d => !d)}
          style={btnStyle(showDone)}
          title={showDone ? 'Masquer les terminées' : 'Afficher les terminées'}
        >
          {showDone ? '🔓' : '🔒'} Terminées
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {filtered.length} tâche{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <SortTh col="origine"   label="Origine"     current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortTh col="title"     label="Objet"       current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '30%' }} />
              <SortTh col="date"      label="Date"        current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortTh col="planifie"  label="Planifié le" current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortTh col="priorite"  label="Priorité"    current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortTh col="statut"    label="État"        current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortTh col="sousprojet" label="Sous-projet" current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortTh col="projet"    label="Projet"      current={sortCol} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {groups === null ? (
              filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '40px 10px' }}>
                    Aucune tâche
                  </td>
                </tr>
              ) : filtered.map(renderRow)
            ) : (
              groups.map(group => {
                const isCollapsed = collapsed.has(group.label);
                return [
                  <tr
                    key={`g-${group.label}`}
                    onClick={() => toggleCollapse(group.label)}
                    style={{ cursor: 'pointer', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
                  >
                    <td colSpan={8} style={{
                      ...thStyle, position: 'static', fontSize: 12, textTransform: 'none',
                      letterSpacing: 0, fontWeight: 700, color: 'var(--text)',
                    }}>
                      {isCollapsed ? '▶' : '▼'} {group.label}
                      <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>
                        {group.items.length} tâche{group.items.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>,
                  ...(!isCollapsed ? group.items.map(renderRow) : []),
                ];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
