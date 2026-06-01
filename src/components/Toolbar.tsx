import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { HamburgerButton } from './SideNav';
import { useIsMobile, useIsTablet } from '../hooks/useBreakpoint';
import { load } from '../persistence';
import { fetchDatabaseSchema, searchNotionDatabase, type NotionSearchResult } from '../notionService';

export type ViewKey = 'home' | 'calendar' | 'rolling' | 'rolling2' | 'gantt' | 'settings' | 'briefing' | 'partenaires' | 'suivis' | 'temps' | 'tickets' | 'postits' | 'users';

// ── Types internes pour la config des bases disponibles ───────────────────────
interface DbOption { key: string; label: string; databaseId: string }

function getAvailableDbs(): DbOption[] {
  const entries: Array<[string, string]> = [
    ['notionConfig',       'Tâches'],
    ['briefingConfig',     'Briefings'],
    ['partenairesConfig',  'Partenaires'],
    ['suivisConfig',       'Suivis'],
    ['tempsConfig',        'Temps'],
    ['ticketsConfig',      'Tickets'],
    ['associationsConfig', 'Associations'],
    ['postitsConfig',      'Post-its'],
  ];
  return entries.flatMap(([key, label]) => {
    const cfg = load<{ databaseId?: string }>(key, {});
    return cfg.databaseId ? [{ key, label, databaseId: cfg.databaseId }] : [];
  });
}

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [selectedDb, setSelectedDb] = useState<DbOption | null>(null);
  const [results, setResults] = useState<NotionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [titlePropCache, setTitlePropCache] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dbs = getAvailableDbs();

  // Initialise la base par défaut au premier rendu
  useEffect(() => {
    if (dbs.length > 0 && !selectedDb) setSelectedDb(dbs[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fermeture au clic extérieur / Escape
  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const doSearch = useCallback(async (q: string, db: DbOption) => {
    const token = load<{ integrationToken?: string }>('notionConfig', {}).integrationToken;
    if (!token) { setError('Token Notion manquant'); setLoading(false); return; }

    let titleProp = titlePropCache[db.databaseId];
    if (!titleProp) {
      try {
        const schema = await fetchDatabaseSchema(token, db.databaseId);
        const found = schema.find(p => p.type === 'title');
        titleProp = found?.name ?? 'Name';
        setTitlePropCache(prev => ({ ...prev, [db.databaseId]: titleProp! }));
      } catch {
        titleProp = 'Name';
      }
    }

    try {
      const res = await searchNotionDatabase(token, db.databaseId, q, titleProp);
      setResults(res);
      setOpen(true);
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? 'Erreur');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [titlePropCache]);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setOpen(false); setResults([]); return; }
    if (!selectedDb) return;
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(value, selectedDb), 400);
  };

  if (dbs.length === 0) return null;

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {/* Sélecteur de base */}
      <select
        value={selectedDb?.key ?? ''}
        onChange={e => {
          const db = dbs.find(d => d.key === e.target.value) ?? null;
          setSelectedDb(db);
          setResults([]);
          setOpen(false);
          setQuery('');
        }}
        className="text-[11px] rounded px-1.5 py-1 outline-none border shrink-0"
        style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)', maxWidth: 110 }}
      >
        {dbs.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>

      {/* Champ de recherche */}
      <div className="relative flex items-center">
        <span className="absolute left-2 pointer-events-none text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {loading ? <span className="animate-spin inline-block">⟳</span> : '🔍'}
        </span>
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder="Rechercher…"
          className="text-[11px] rounded pl-6 pr-2 py-1 outline-none border w-44 transition-all focus:w-56"
          style={{ background: 'var(--bg-deep)', color: 'var(--text)', borderColor: 'var(--border)' }}
        />
      </div>

      {/* Popup résultats */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
          style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', minWidth: 320, maxWidth: 420 }}
        >
          {error && (
            <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--color-error)' }}>⚠ {error}</div>
          )}
          {!error && results.length === 0 && (
            <div className="px-3 py-2.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>Aucun résultat</div>
          )}
          <div className="themed-scroll max-h-72 overflow-y-auto">
            {results.map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 px-3 py-2 border-b last:border-0 hover:opacity-80 transition"
                style={{ borderColor: 'var(--border-soft)' }}
              >
                <span className="text-[12px] truncate flex-1" style={{ color: 'var(--text)' }} title={r.title}>
                  {r.title}
                </span>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11px] px-2 py-0.5 rounded border transition hover:opacity-80"
                  style={{ color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', whiteSpace: 'nowrap' }}
                >
                  Ouvrir ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectDropdown({
  projects,
  selected,
  onChange,
}: {
  projects: { id: string; name: string; color: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeCount = selected.size;
  const allActive = selected.size === 0;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition"
        style={open || activeCount > 0
          ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }
          : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
      >
        <span>Projets</span>
        {activeCount > 0 && (
          <span
            className="text-[10px] font-bold rounded-full px-1 leading-none"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {activeCount}
          </span>
        )}
        <span style={{ fontSize: 8 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', minWidth: 300 }}
        >
          <button
            onClick={() => onChange(new Set())}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition hover:opacity-80 border-b"
            style={{ color: allActive ? 'var(--accent)' : 'var(--text-muted)', borderColor: 'var(--border)', background: allActive ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent' }}
          >
            <span
              className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
              style={{ borderColor: allActive ? 'var(--accent)' : 'var(--border)', background: allActive ? 'var(--accent)' : 'transparent' }}
            >
              {allActive && <span style={{ color: 'var(--accent-fg)', fontSize: 9, fontWeight: 700 }}>✓</span>}
            </span>
            Tous
          </button>
          <div className="themed-scroll max-h-64 overflow-y-auto">
            {projects.map((p) => {
              const checked = !allActive && selected.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition hover:opacity-80"
                  style={{ color: checked ? p.color : 'var(--text)', background: checked ? p.color + '15' : 'transparent' }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                    style={{ borderColor: checked ? p.color : 'var(--border-soft)', background: checked ? p.color : 'transparent' }}
                  >
                    {checked && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                  </span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function SubprojectDropdown({
  subprojects,
  projectById,
  selected,
  onChange,
}: {
  subprojects: { id: string; name: string; project_id: string }[];
  projectById: Map<string, { id: string; name: string; color: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeCount = selected.size;
  const allActive = selected.size === 0;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  // Group subprojects by project
  const grouped = new Map<string, typeof subprojects>();
  for (const sp of subprojects) {
    if (!grouped.has(sp.project_id)) grouped.set(sp.project_id, []);
    grouped.get(sp.project_id)!.push(sp);
  }

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition"
        style={open || activeCount > 0
          ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }
          : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
      >
        <span>S-Projets</span>
        {activeCount > 0 && (
          <span
            className="text-[10px] font-bold rounded-full px-1 leading-none"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {activeCount}
          </span>
        )}
        <span style={{ fontSize: 8 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', minWidth: 300 }}
        >
          {/* Reset */}
          <button
            onClick={() => onChange(new Set())}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition hover:opacity-80 border-b"
            style={{ color: allActive ? 'var(--accent)' : 'var(--text-muted)', borderColor: 'var(--border)', background: allActive ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent' }}
          >
            <span
              className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
              style={{ borderColor: allActive ? 'var(--accent)' : 'var(--border)', background: allActive ? 'var(--accent)' : 'transparent' }}
            >
              {allActive && <span style={{ color: 'var(--accent-fg)', fontSize: 9, fontWeight: 700 }}>✓</span>}
            </span>
            Tous
          </button>

          {/* Per-project groups */}
          <div className="themed-scroll max-h-64 overflow-y-auto">
            {Array.from(grouped.entries()).map(([projId, sps]) => {
              const proj = projectById.get(projId);
              return (
                <div key={projId}>
                  {grouped.size > 1 && (
                    <div
                      className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: proj?.color ?? 'var(--text-muted)' }}
                    >
                      {proj?.name ?? projId}
                    </div>
                  )}
                  {sps.map((sp) => {
                    const checked = !allActive && selected.has(sp.id);
                    const color = proj?.color ?? '#94a3b8';
                    return (
                      <button
                        key={sp.id}
                        onClick={() => toggle(sp.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition hover:opacity-80"
                        style={{ color: checked ? color : 'var(--text)', background: checked ? color + '15' : 'transparent' }}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                          style={{ borderColor: checked ? color : 'var(--border-soft)', background: checked ? color : 'transparent' }}
                        >
                          {checked && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                        </span>
                        {sp.name}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 text-xs transition"
      style={{ color: 'var(--text)' }}
      title={label}
    >
      <span>{label}</span>
      <span
        className="relative inline-flex h-5 w-9 rounded-full transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--border)' }}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow transition-transform ${on ? 'translate-x-4' : ''}`}
          style={{ background: on ? 'var(--accent-fg)' : 'var(--text-muted)' }}
        />
      </span>
    </button>
  );
}

export function Toolbar({
  view,
  onView,
  dataSource,
  onToggleDataSource,
  theme,
  onToggleTheme,
  // Suivis toolbar
  suivisSearch,
  onSuivisSearch,
  suivisPartenaireFilterLabel,
  onClearSuivisFilter,
  onRefresh,
  refreshing,
  onOpenMobileNav,
}: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  dataSource: 'demo' | 'notion';
  onToggleDataSource: () => void;
  theme: 'default' | 'forge';
  onToggleTheme: () => void;
  suivisSearch?: string;
  onSuivisSearch?: (s: string) => void;
  suivisPartenaireFilterLabel?: string;
  onClearSuivisFilter?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onOpenMobileNav?: () => void;
}) {
  const store = useStore();
  const { filters, setFilters, gcal } = store;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  // Vues sans planning (pas de filtres projet/personnes)
  const isNonPlanningView = view === 'home' || view === 'briefing' || view === 'settings' || view === 'partenaires' || view === 'suivis' || view === 'tickets' || view === 'temps' || view === 'postits' || view === 'users';

  // ─── Barre de filtres planification (partagée desktop & mobile dropdown) ───
  const planningFilters = !isNonPlanningView ? (
    <>
      <ProjectDropdown
        projects={store.data.projects}
        selected={filters.projectIds}
        onChange={(next) => setFilters({ projectIds: next })}
      />
      {(store.data.subprojects?.length ?? 0) > 0 && (
        <SubprojectDropdown
          subprojects={store.data.subprojects!}
          projectById={store.projectById}
          selected={filters.subprojectIds}
          onChange={(next) => setFilters({ subprojectIds: next })}
        />
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Personnes :</span>
        {store.data.people.map((p) => {
          const active = filters.assigneeIds.size === 0 || filters.assigneeIds.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setFilters({ assigneeIds: toggleSet(filters.assigneeIds, p.id) })}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition flex items-center gap-1 ${active ? 'opacity-100' : 'opacity-30'}`}
              style={{
                borderColor: p.color,
                color: active ? p.color : 'var(--text-dim)',
                background: active ? p.color + '20' : 'transparent',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
              {p.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Couleur :</span>
        {(['status', 'project', 'assignee'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilters({ colorBy: mode })}
            className="text-[11px] px-2 py-0.5 rounded transition"
            style={filters.colorBy === mode
              ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
              : { color: 'var(--text-muted)' }}
          >
            {mode === 'status' ? 'Statut' : mode === 'project' ? 'Projet' : 'Personne'}
          </button>
        ))}
      </div>
    </>
  ) : null;

  // ─── Vue mobile (<768px) ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <header className="border-b shrink-0" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        {/* Ligne principale */}
        <div className="flex items-center gap-2 px-3 py-2">
          <HamburgerButton onClick={() => onOpenMobileNav?.()} />
          <span className="text-sm font-bold tracking-tight flex-1" style={{ color: 'var(--text)' }}>CAP Planner</span>

          {/* Vue selector compact pour vues planning */}
          {!isNonPlanningView && (
            <select
              value={view}
              onChange={e => onView(e.target.value as ViewKey)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', borderColor: 'var(--border)' }}
            >
              <option value="calendar">📅 Calendrier</option>
              <option value="rolling">📆 Sem. ①</option>
              <option value="rolling2">📆 Sem. ②</option>
              <option value="gantt">📊 Gantt</option>
            </select>
          )}

          {/* Bouton filtres (planning seulement) */}
          {!isNonPlanningView && (
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="text-xs px-2 py-1 rounded border transition"
              style={filtersOpen
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' }
                : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              ⚙ Filtres
            </button>
          )}

          {/* Theme */}
          <button
            onClick={onToggleTheme}
            className="flex items-center text-[11px] px-1.5 py-1 rounded border transition"
            style={theme === 'forge'
              ? { background: 'var(--bg-elev)', color: 'var(--accent)', borderColor: 'var(--accent)' }
              : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            {theme === 'forge' ? '🔥' : '🌙'}
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center text-[11px] px-1.5 py-1 rounded border transition disabled:opacity-50"
              style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              <span className={refreshing ? 'animate-spin' : ''}>⟳</span>
            </button>
          )}
        </div>

        {/* Panneau filtres dépliable */}
        {filtersOpen && !isNonPlanningView && (
          <div
            className="flex flex-col gap-3 px-3 pb-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="pt-2 flex flex-col gap-2">
              {planningFilters}
            </div>
          </div>
        )}

        {/* Suivis */}
        {view === 'suivis' && (
          <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
            {suivisPartenaireFilterLabel && (
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                <span>🤝 {suivisPartenaireFilterLabel}</span>
                <button onClick={onClearSuivisFilter} style={{ fontSize: 12 }}>✕</button>
              </div>
            )}
            <input
              type="text"
              value={suivisSearch ?? ''}
              onChange={e => onSuivisSearch?.(e.target.value)}
              placeholder="Rechercher un suivi…"
              className="text-xs rounded px-2.5 py-1.5 outline-none flex-1"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </div>
        )}
      </header>
    );
  }

  // ─── Vue tablette (768–1023px) ────────────────────────────────────────────
  if (isTablet) {
    return (
      <header className="border-b shrink-0" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
          <HamburgerButton onClick={() => onOpenMobileNav?.()} />
          <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>CAP Planner</span>
          <button
            onClick={onToggleDataSource}
            className="text-[10px] rounded px-1.5 py-0.5 border transition-colors"
            style={dataSource === 'notion'
              ? { color: 'var(--accent)', background: 'var(--bg-elev)', borderColor: 'var(--accent)' }
              : { color: 'var(--text-muted)', background: 'var(--bg-deep)', borderColor: 'var(--border)' }}
          >
            {dataSource === 'notion' ? 'Notion' : 'démo'}
          </button>

          {/* Recherche globale Notion */}
          <GlobalSearch />

          {/* Suivis */}
          {view === 'suivis' && (
            <>
              {suivisPartenaireFilterLabel && (
                <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                  <span>🤝 {suivisPartenaireFilterLabel}</span>
                  <button onClick={onClearSuivisFilter} style={{ fontSize: 12 }}>✕</button>
                </div>
              )}
              <input
                type="text"
                value={suivisSearch ?? ''}
                onChange={e => onSuivisSearch?.(e.target.value)}
                placeholder="Rechercher un suivi…"
                className="text-xs rounded px-2.5 py-1.5 outline-none w-48"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </>
          )}

          {/* View toggle icônes seules */}
          {!isNonPlanningView && (
            <div className="inline-flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {([
                { key: 'calendar', icon: '📅' },
                { key: 'rolling', icon: '📆①' },
                { key: 'rolling2', icon: '📆②' },
                { key: 'gantt', icon: '📊' },
              ] as const).map((btn, i) => (
                <button
                  key={btn.key}
                  onClick={() => onView(btn.key)}
                  title={btn.key}
                  className={`px-2.5 py-1.5 text-xs font-medium transition${i > 0 ? ' border-l' : ''}`}
                  style={view === btn.key
                    ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--border)' }
                    : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          )}

          {/* Filtres en dropdown sur tablette */}
          {!isNonPlanningView && (
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="text-xs px-2.5 py-1.5 rounded border transition"
              style={filtersOpen
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' }
                : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              ⚙ Filtres
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition disabled:opacity-50"
                style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                <span className={refreshing ? 'animate-spin' : ''}>⟳</span>
              </button>
            )}
            <button
              onClick={onToggleTheme}
              className="flex items-center text-[11px] px-2 py-1 rounded border transition"
              style={theme === 'forge'
                ? { background: 'var(--bg-elev)', color: 'var(--accent)', borderColor: 'var(--accent)' }
                : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              {theme === 'forge' ? '🔥' : '🌙'}
            </button>
          </div>
        </div>

        {/* Panneau filtres dépliable tablette */}
        {filtersOpen && !isNonPlanningView && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            {planningFilters}
          </div>
        )}
      </header>
    );
  }

  // ─── Vue desktop (≥1024px) : comportement original ───────────────────────
  return (
    <header className="border-b px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-2 shrink-0" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
      {/* Brand */}
      <div className="flex items-center gap-2 mr-1">
        <span className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>CAP Planner</span>
        <button
          onClick={onToggleDataSource}
          title={dataSource === 'demo' ? 'Passer en mode Notion' : 'Revenir aux données de démo'}
          className="text-[10px] rounded px-1.5 py-0.5 border transition-colors"
          style={dataSource === 'notion'
            ? { color: 'var(--accent)', background: 'var(--bg-elev)', borderColor: 'var(--accent)' }
            : { color: 'var(--text-muted)', background: 'var(--bg-deep)', borderColor: 'var(--border)' }}
        >
          {dataSource === 'notion' ? 'Notion' : 'démo'}
        </button>
      </div>

      {/* Recherche globale Notion */}
      <GlobalSearch />

      {/* ── Suivis toolbar ── */}
      {view === 'suivis' && (
        <>
          {suivisPartenaireFilterLabel && (
            <div
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}
            >
              <span>🤝 {suivisPartenaireFilterLabel}</span>
              <button
                onClick={onClearSuivisFilter}
                className="leading-none transition hover:opacity-70"
                title="Effacer le filtre partenaire"
                style={{ fontSize: 12 }}
              >✕</button>
            </div>
          )}
          <input
            type="text"
            value={suivisSearch ?? ''}
            onChange={e => onSuivisSearch?.(e.target.value)}
            placeholder="Rechercher un suivi…"
            className="text-xs rounded px-2.5 py-1.5 outline-none w-56"
            style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
        </>
      )}

      {/* View toggle — Planning uniquement */}
      {!isNonPlanningView && <div className="inline-flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => onView('calendar')}
          className="px-3 py-1.5 text-xs font-medium transition"
          style={view === 'calendar'
            ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}
        >
          📅 Calendrier
        </button>
        <button
          onClick={() => onView('rolling')}
          className="px-3 py-1.5 text-xs font-medium transition border-l"
          style={view === 'rolling'
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--border)' }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >
          📆 Sem. ①
        </button>
        <button
          onClick={() => onView('rolling2')}
          className="px-3 py-1.5 text-xs font-medium transition border-l"
          style={view === 'rolling2'
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--border)' }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >
          📆 Sem. ②
        </button>
        <button
          onClick={() => onView('gantt')}
          className="px-3 py-1.5 text-xs font-medium transition border-l"
          style={view === 'gantt'
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--border)' }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >
          📊 Gantt
        </button>
      </div>}

      {/* Project filters — dropdown, Planning uniquement */}
      {!isNonPlanningView && (
        <ProjectDropdown
          projects={store.data.projects}
          selected={filters.projectIds}
          onChange={(next) => setFilters({ projectIds: next })}
        />
      )}

      {/* Subproject filters */}
      {!isNonPlanningView && (store.data.subprojects?.length ?? 0) > 0 && (
        <SubprojectDropdown
          subprojects={store.data.subprojects!}
          projectById={store.projectById}
          selected={filters.subprojectIds}
          onChange={(next) => setFilters({ subprojectIds: next })}
        />
      )}

      {/* People filters — Planning uniquement */}
      {!isNonPlanningView && <div className="flex items-center gap-1.5">
        <span className="text-[11px] mr-0.5" style={{ color: 'var(--text-muted)' }}>Personnes :</span>
        {store.data.people.map((p) => {
          const active = filters.assigneeIds.size === 0 || filters.assigneeIds.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setFilters({ assigneeIds: toggleSet(filters.assigneeIds, p.id) })}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition flex items-center gap-1 ${active ? 'opacity-100' : 'opacity-30'}`}
              style={{
                borderColor: p.color,
                color: active ? p.color : 'var(--text-dim)',
                background: active ? p.color + '20' : 'transparent',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
              {p.name}
            </button>
          );
        })}
      </div>}

      {/* Right section */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Color by — Planning uniquement */}
        {!isNonPlanningView && <div className="flex items-center gap-1">
          <span className="text-[11px] mr-0.5" style={{ color: 'var(--text-muted)' }}>Couleur :</span>
          {(['status', 'project', 'assignee'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilters({ colorBy: mode })}
              className="text-[11px] px-2 py-0.5 rounded transition"
              style={filters.colorBy === mode
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
                : { color: 'var(--text-muted)' }}
            >
              {mode === 'status' ? 'Statut' : mode === 'project' ? 'Projet' : 'Personne'}
            </button>
          ))}
        </div>}

        {/* Gcal toggle — Planning uniquement */}
        {!isNonPlanningView && (
        <div className="flex items-center gap-2 border-l pl-4" style={{ borderColor: 'var(--border)' }}>
          {gcal.accessToken ? (
            <>
              <Toggle
                on={filters.showGcal}
                onToggle={() => setFilters({ showGcal: !filters.showGcal })}
                label="Agenda Google"
              />
              <button
                onClick={gcal.disconnect}
                className="text-[10px] text-slate-500 hover:text-red-400 transition"
                title="Déconnecter Google"
              >✕</button>
            </>
          ) : (
            <button
              onClick={gcal.connect}
              disabled={gcal.loading}
              className="flex items-center gap-1.5 text-[11px] bg-white text-slate-800 hover:bg-slate-100 px-2.5 py-1 rounded font-medium transition disabled:opacity-50"
            >
              {gcal.loading ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Connecter Agenda
            </button>
          )}
          {gcal.error && (
            <span className="text-[10px] text-red-400 max-w-xs truncate" title={gcal.error}>
              ⚠ {gcal.error}
            </span>
          )}
        </div>
        )}

        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition disabled:opacity-50"
            style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            title="Recharger les données"
          >
            <span className={refreshing ? 'animate-spin' : ''} style={{ fontSize: 13 }}>⟳</span>
          </button>
        )}

        {/* Theme switch */}
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition"
          style={theme === 'forge'
            ? { background: 'var(--bg-elev)', color: 'var(--accent)', borderColor: 'var(--accent)' }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          title={theme === 'default' ? 'Passer au thème Forge' : 'Revenir au thème par défaut'}
        >
          <span style={{ fontSize: 12 }}>{theme === 'forge' ? '🔥' : '🌙'}</span>
          <span>{theme === 'forge' ? 'Forge' : 'Default'}</span>
        </button>

      </div>
    </header>
  );
}
