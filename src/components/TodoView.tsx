import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { NotionBlock, Task } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';
import { useIsMobile } from '../hooks/useBreakpoint';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';
import { MobileListCard } from './MobileListCard';
import { NotionBlockRenderer } from './NotionBlockRenderer';
import { fetchPageBlocks, patchNotionProperty } from '../notionService';
import { load } from '../persistence';

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

const PRIORITE_RED = { bg: '#e53e3e22', fg: '#e53e3e' };       // Élevée / Haute / Urgente
const PRIORITE_ORANGE = { bg: '#d9730d22', fg: '#d9730d' };    // Normale / Moyenne
const PRIORITE_GREEN = { bg: '#0f7b6c22', fg: '#0f7b6c' };     // Basse / Faible

// Normalise (minuscules, sans accents ni emoji/espaces) pour un match tolérant : une valeur
// Notion comme « Élevée 🔴 » ou « 🟧 Élevée » doit quand même ressortir en rouge.
function normalizePriorite(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

function prioriteStyle(value: string): React.CSSProperties {
  const n = normalizePriorite(value);
  const has = (...keys: string[]) => keys.some(k => n.includes(k));
  let c: { bg: string; fg: string } | null = null;
  if (has('urgent', 'haut', 'eleve', 'critique', 'high')) c = PRIORITE_RED;
  else if (has('normal', 'moyen', 'medium')) c = PRIORITE_ORANGE;
  else if (has('bass', 'bas', 'faible', 'low', 'mineur')) c = PRIORITE_GREEN;
  return c
    ? { background: c.bg, color: c.fg }
    : { background: 'color-mix(in srgb, var(--text-muted) 14%, transparent)', color: 'var(--text-muted)' };
}

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
        background: 'var(--bg-deep)',
        position: 'sticky', top: 0, zIndex: 1,
        borderBottom: '1px solid var(--border)',
        ...style,
      }}
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', width: 110, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ color: 'var(--text)', flex: 1 }}>{children}</span>
    </div>
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
  const [filterResponsable, setFilterResponsable] = useState<string>(() => {
    for (const [id, p] of store.personById.entries()) {
      if (p.name === 'Guillaume D.') return id;
    }
    return '';
  });
  const [filterProjet, setFilterProjet] = useState('');
  const [filterPlanifie, setFilterPlanifie] = useState<'' | 'yes' | 'no'>('');
  const [filterEnRetard, setFilterEnRetard] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Detail panel state ────────────────────────────────────────────────────
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [statusEditVal, setStatusEditVal] = useState('');
  const [statusEditSaving, setStatusEditSaving] = useState(false);
  const [statusEditSaved, setStatusEditSaved] = useState(false);

  const { width: panelWidth, containerRef, onMouseDown: onPanelResize } = useResizableRightPanel('todoPanelWidth', 400);

  // ── Notion config (synchronous read) ─────────────────────────────────────
  const notionConfig = load<{
    extraFields?: Array<{ label: string; editable?: boolean; notionField: string }>;
    statusMappings?: Array<{ internalStatus: string; notionValue: string }>;
    fieldMap?: { status?: string };
  } | null>('notionConfig', null);
  const notionSchema = load<Array<{ name: string; type: string; options?: Array<{ id?: string; name: string }> }>>('notionSchema', []);

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
    const ids = new Set(tasks.map(t => t.assignee_id).filter(Boolean));
    return [...ids]
      .map(id => ({ id, name: store.personById.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [tasks, store.personById]);

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
    if (filterResponsable) list = list.filter(t => t.assignee_id === filterResponsable);
    if (filterProjet) {
      list = list.filter(t => {
        const p = projectById.get(t.project_id);
        return p?.name === filterProjet;
      });
    }
    // Planifié = présence d'une date de planification (start_date)
    if (filterPlanifie === 'yes') list = list.filter(t => !!t.start_date);
    if (filterPlanifie === 'no') list = list.filter(t => !t.start_date);
    // Planifié non terminé : planifié avant hier (minuit) et pas dans un état terminé
    if (filterEnRetard) {
      const hier = new Date();
      hier.setHours(0, 0, 0, 0);
      hier.setDate(hier.getDate() - 1);
      list = list.filter(t => t.start_date && new Date(t.start_date) < hier && t.status !== 'done');
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
  }, [tasks, showDone, search, filterOrigine, filterPriorite, filterStatut, filterResponsable, filterProjet, filterPlanifie, filterEnRetard, sortCol, sortDir, projectById, subprojectById]);

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

  // ── Select task → open panel ──────────────────────────────────────────────
  const selectTask = useCallback((task: Task) => {
    setSelectedId(task.id);
    // Init status dropdown
    const initStatus = notionConfig?.statusMappings?.find(m => m.internalStatus === task.status)?.notionValue ?? '';
    setStatusEditVal(initStatus);
    setStatusEditSaved(false);
    // Load Notion blocks
    setBlocks([]);
    setBlocksError(null);
    setBlocksLoading(true);
    fetchPageBlocks(task.id)
      .then(setBlocks)
      .catch(e => setBlocksError((e as Error).message))
      .finally(() => setBlocksLoading(false));
  }, [notionConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset status saved indicator when task changes
  useEffect(() => { setStatusEditSaved(false); }, [selectedId]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedId), [tasks, selectedId]);

  // ── Row render ────────────────────────────────────────────────────────────
  const td: React.CSSProperties = { padding: '6px 10px', fontSize: 12, verticalAlign: 'middle' };

  function renderRow(task: Task) {
    const projet = projectById.get(task.project_id);
    const sousProjet = subprojectById.get(task.subproject_id ?? '');
    const selected = task.id === selectedId;

    return (
      <tr
        key={task.id}
        onClick={() => selectTask(task)}
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
        <td style={{ ...td, color: 'var(--text-muted)' }}>
          {projet ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: projet.color, flexShrink: 0 }} />
              {projet.name}
            </span>
          ) : '—'}
        </td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>{sousProjet?.name ?? '—'}</td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>{formatDate(task.start_date)}</td>
        <td style={{ ...td, color: 'var(--text-muted)' }}>{task.extraFields?.['Planifié le'] ? formatDate(task.extraFields['Planifié le']) : '—'}</td>
        <td style={td}>{task.extraFields?.['Priorité'] ? (
          <span style={{ fontSize: 11, borderRadius: 4, padding: '1px 6px', ...prioriteStyle(task.extraFields['Priorité']) }}>
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
      </tr>
    );
  }

  const isMobile = useIsMobile();

  // ── Vue mobile : cartes empilées ─────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0, alignItems: 'center' }}>
          <input
            placeholder="🔍 Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 120 }}
          />
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...inputStyle, maxWidth: 130 }}>
            <option value="">État</option>
            {statutValues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <button onClick={() => setShowDone(d => !d)} style={btnStyle(showDone)} title="Terminées">
            {showDone ? '🔓' : '🔒'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>Aucune tâche</div>
          ) : (
            filtered.map(task => {
              const projet = projectById.get(task.project_id);
              return (
                <MobileListCard
                  key={task.id}
                  title={task.title}
                  selected={task.id === selectedId}
                  badges={[{
                    label: STATUS_LABELS[task.status],
                    style: { background: `${STATUS_COLORS[task.status]}22`, color: STATUS_COLORS[task.status] },
                  }]}
                  meta={[
                    ...(projet ? [{ icon: '📁', text: projet.name }] : []),
                    ...(task.extraFields?.['Priorité'] ? [{ icon: '⚡', text: task.extraFields['Priorité'] }] : []),
                    ...(task.start_date ? [{ icon: '📅', text: formatDate(task.start_date) }] : []),
                  ]}
                  onClick={() => selectTask(task)}
                />
              );
            })
          )}
        </div>
        {/* Modal plein écran mobile */}
        {selectedId && selectedTask && (
          <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
            <DetailPanel
              task={selectedTask}
              projectById={projectById}
              subprojectById={subprojectById}
              notionConfig={notionConfig}
              notionSchema={notionSchema}
              blocks={blocks}
              blocksLoading={blocksLoading}
              blocksError={blocksError}
              statusEditVal={statusEditVal}
              setStatusEditVal={setStatusEditVal}
              statusEditSaving={statusEditSaving}
              setStatusEditSaving={setStatusEditSaving}
              statusEditSaved={statusEditSaved}
              setStatusEditSaved={setStatusEditSaved}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Barre de filtres ──────────────────────────────────────────────────────
  const toolbar = (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 12px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0, alignItems: 'center',
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
        {responsableValues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)} style={inputStyle}>
        <option value="">Projet</option>
        {projetValues.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select
        value={filterPlanifie}
        onChange={e => setFilterPlanifie(e.target.value as '' | 'yes' | 'no')}
        style={inputStyle}
        title="Filtrer selon la présence d'une date de planification"
      >
        <option value="">Planifié (tous)</option>
        <option value="yes">Planifié : oui</option>
        <option value="no">Planifié : non</option>
      </select>
      <button
        onClick={() => setFilterEnRetard(v => !v)}
        style={btnStyle(filterEnRetard)}
        title="Tâches planifiées avant hier et non terminées"
      >
        ⏰ Planifié non terminé
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Grouper :</span>
        {(['none', 'projet', 'sousprojet'] as GroupBy[]).map(g => (
          <button
            key={g}
            onClick={() => { setGroupBy(g); setCollapsed(new Set()); }}
            style={{
              ...inputStyle, cursor: 'pointer', padding: '3px 10px',
              background: groupBy === g ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--bg-deep)',
              color: groupBy === g ? 'var(--accent)' : 'var(--text-muted)',
              border: groupBy === g ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid var(--border)',
              fontWeight: groupBy === g ? 600 : 400,
            }}
          >
            {g === 'none' ? 'Aucun' : g === 'projet' ? 'Projet' : 'Sous-projet'}
          </button>
        ))}
      </div>
      <button onClick={() => setShowDone(d => !d)} style={btnStyle(showDone)} title={showDone ? 'Masquer les terminées' : 'Afficher les terminées'}>
        {showDone ? '🔓' : '🔒'} Terminées
      </button>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
        {filtered.length} tâche{filtered.length !== 1 ? 's' : ''}
      </span>
    </div>
  );

  // ── Table ─────────────────────────────────────────────────────────────────
  const tableContent = (
    <div className="themed-scroll" style={{ flex: 1, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <SortTh col="origine"    label="Origine"     current={sortCol} dir={sortDir} onSort={toggleSort} />
            <SortTh col="title"      label="Objet"       current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '26%' }} />
            <SortTh col="projet"     label="Projet"      current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '16%' }} />
            <SortTh col="sousprojet" label="Sous-projet" current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '13%' }} />
            <SortTh col="date"       label="Date"        current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '90px' }} />
            <SortTh col="planifie"   label="Planifié le" current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '90px' }} />
            <SortTh col="priorite"   label="Priorité"    current={sortCol} dir={sortDir} onSort={toggleSort} />
            <SortTh col="statut"     label="État"        current={sortCol} dir={sortDir} onSort={toggleSort} style={{ width: '90px' }} />
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
                  style={{ cursor: 'pointer', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', userSelect: 'none' }}
                >
                  <td colSpan={8} style={{
                    padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    borderBottom: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  }}>
                    <span style={{ marginRight: 6, fontSize: 9, color: 'var(--text-muted)', display: 'inline-block', width: 10 }}>
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                    {group.label}
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
  );

  // ── Layout desktop ────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {toolbar}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Liste */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {tableContent}
        </div>

        {/* Poignée + panel détail */}
        {selectedId && selectedTask && (
          <>
            <div
              style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)', transition: 'background 120ms' }}
              onMouseDown={onPanelResize}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
              title="Redimensionner"
            />
            <div style={{ width: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border)' }}>
              <DetailPanel
                task={selectedTask}
                projectById={projectById}
                subprojectById={subprojectById}
                notionConfig={notionConfig}
                notionSchema={notionSchema}
                blocks={blocks}
                blocksLoading={blocksLoading}
                blocksError={blocksError}
                statusEditVal={statusEditVal}
                setStatusEditVal={setStatusEditVal}
                statusEditSaving={statusEditSaving}
                setStatusEditSaving={setStatusEditSaving}
                statusEditSaved={statusEditSaved}
                setStatusEditSaved={setStatusEditSaved}
                onClose={() => setSelectedId(null)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

type NotionCfg = {
  extraFields?: Array<{ label: string; editable?: boolean; notionField: string }>;
  statusMappings?: Array<{ internalStatus: string; notionValue: string }>;
  fieldMap?: { status?: string };
} | null;
type SchemaProp = { name: string; type: string; options?: Array<{ id?: string; name: string }> };

function DetailPanel({
  task, projectById, subprojectById, notionConfig, notionSchema,
  blocks, blocksLoading, blocksError,
  statusEditVal, setStatusEditVal, statusEditSaving, setStatusEditSaving, statusEditSaved, setStatusEditSaved,
  onClose,
}: {
  task: Task;
  projectById: Map<string, { id: string; name: string; color: string }>;
  subprojectById: Map<string, { id: string; name: string }>;
  notionConfig: NotionCfg;
  notionSchema: SchemaProp[];
  blocks: NotionBlock[];
  blocksLoading: boolean;
  blocksError: string | null;
  statusEditVal: string;
  setStatusEditVal: (v: string) => void;
  statusEditSaving: boolean;
  setStatusEditSaving: (v: boolean) => void;
  statusEditSaved: boolean;
  setStatusEditSaved: (v: boolean) => void;
  onClose: () => void;
}) {
  const projet = projectById.get(task.project_id);
  const sousProjet = subprojectById.get(task.subproject_id ?? '');
  const statusColor = STATUS_COLORS[task.status];
  const statusMappings = notionConfig?.statusMappings ?? [];
  const statusField = notionConfig?.fieldMap?.status ?? '';

  const handleSaveStatus = async (val: string) => {
    if (!statusField) return;
    setStatusEditVal(val);
    setStatusEditSaving(true);
    const schemaProp = notionSchema.find(p => p.name === statusField);
    try {
      await patchNotionProperty(task.id, statusField, schemaProp?.type ?? 'status', val);
      setStatusEditSaved(true);
      setTimeout(() => setStatusEditSaved(false), 2000);
    } finally {
      setStatusEditSaving(false);
    }
  };

  return (
    <>
      {/* En-tête */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, borderLeft: `3px solid ${statusColor}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
            {task.title}
          </h2>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
          >✕</button>
        </div>
        <span style={{
          display: 'inline-block', marginTop: 6, fontSize: 10, borderRadius: 99, padding: '2px 8px', fontWeight: 600,
          background: statusColor + '25', color: statusColor,
        }}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>

      {/* Champs */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* État éditable */}
        {statusField && statusMappings.length > 0 && (
          <PropRow label="État">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <select
                value={statusEditVal}
                onChange={e => handleSaveStatus(e.target.value)}
                disabled={statusEditSaving}
                style={{
                  background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '2px 6px', fontSize: 11, outline: 'none',
                }}
              >
                {statusMappings.map(m => (
                  <option key={m.notionValue} value={m.notionValue}>{m.notionValue}</option>
                ))}
              </select>
              {statusEditSaving && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
              {statusEditSaved && <span style={{ fontSize: 10, color: 'var(--color-success)' }}>✓</span>}
            </div>
          </PropRow>
        )}

        {/* Champs fixes */}
        {projet && (
          <PropRow label="Projet">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: projet.color, flexShrink: 0 }} />
              {projet.name}
            </span>
          </PropRow>
        )}
        {sousProjet && <PropRow label="Sous-projet"><span>{sousProjet.name}</span></PropRow>}
        {task.start_date && <PropRow label="Date"><span>{formatDate(task.start_date)}</span></PropRow>}
        {task.extraFields?.['Planifié le'] && (
          <PropRow label="Planifié le"><span>{formatDate(task.extraFields['Planifié le'])}</span></PropRow>
        )}

        {/* Champs additionnels */}
        {task.extraFields && Object.entries(task.extraFields)
          .filter(([k]) => k !== 'Planifié le') // déjà affiché ci-dessus
          .map(([label, value]) => {
            if (!value) return null;
            if (label === 'Priorité') {
              return (
                <PropRow key={label} label={label}>
                  <span style={{ fontSize: 11, borderRadius: 4, padding: '1px 6px', ...prioriteStyle(value) }}>{value}</span>
                </PropRow>
              );
            }
            return (
              <PropRow key={label} label={label}>
                <span style={{ color: 'var(--text)' }}>{value}</span>
              </PropRow>
            );
          })}

        {/* Lien Notion */}
        {task.notion_url && (
          <div style={{ paddingTop: 4 }}>
            <a
              href={task.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11,
                padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
                background: 'var(--bg-deep)', color: 'var(--accent)', border: '1px solid var(--border)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
              </svg>
              Ouvrir dans Notion
            </a>
          </div>
        )}
      </div>

      {/* Contenu Notion */}
      <div className="themed-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {blocksLoading ? (
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }} className="animate-pulse">Chargement…</p>
        ) : blocksError ? (
          <p style={{ fontSize: 11, color: 'var(--color-error)' }}>⚠ {blocksError}</p>
        ) : blocks.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Page vide)</p>
        ) : (
          <NotionBlockRenderer blocks={blocks} />
        )}
      </div>
    </>
  );
}
