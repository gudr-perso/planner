import { useEffect, useMemo, useState } from 'react';
import { load, save } from '../persistence';
import { fetchPartenaires } from '../notionService';
import type { NotionConfig, PartenairesConfig, PartenaireEntry } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse "etatSuivis" string comme "[Ouverts : 2] [En cours : 1]"
 * et retourne un tableau de {label, count} pour un rendu en badges.
 * Si le format ne correspond pas, retourne le texte brut.
 */
function parseEtatBadges(raw: string): Array<{ label: string; count?: string }> {
  if (!raw) return [];
  const matches = [...raw.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length === 0) return [{ label: raw }];
  return matches.map(m => {
    const parts = m[1].split(':');
    return parts.length === 2
      ? { label: parts[0].trim(), count: parts[1].trim() }
      : { label: m[1].trim() };
  });
}

type SortKey = 'title' | 'shortCode' | 'etatSuivis';

// ── Composant principal ───────────────────────────────────────────────────────

export function PartenairesView({
  onOpenSuivis,
  viewMode: viewModeProp,
  search: searchProp,
}: {
  onOpenSuivis: (p: PartenaireEntry) => void;
  viewMode?: 'card' | 'list';
  search?: string;
}) {
  const notionCfg = load<NotionConfig | null>('notionConfig', null);
  const cfg = load<PartenairesConfig | null>('partenairesConfig', null);
  const token = notionCfg?.integrationToken ?? '';

  const [entries, setEntries] = useState<PartenaireEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  // Use props from Toolbar if provided, otherwise local state
  const [localViewMode, setLocalViewMode] = useState<'card' | 'list'>(() =>
    load<'card' | 'list'>('partenaires-view-mode', 'card')
  );
  const [localSearch, setLocalSearch] = useState('');

  const viewMode = viewModeProp ?? localViewMode;
  const search = searchProp ?? localSearch;

  useEffect(() => { save('partenaires-view-mode', localViewMode); }, [localViewMode]);

  useEffect(() => {
    if (!token || !cfg?.databaseId) return;
    setLoading(true);
    setError(null);
    fetchPartenaires(token, cfg)
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered + sorted entries
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = q
      ? entries.filter(e =>
          e.title.toLowerCase().includes(q) || e.shortCode.toLowerCase().includes(q)
        )
      : entries;

    list = [...list].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [entries, search, sortKey, sortDir]);

  // Grouped by types — each entry appears in all its type groups
  const groups = useMemo(() => {
    const map = new Map<string, PartenaireEntry[]>();
    for (const entry of filtered) {
      const types = entry.types.length > 0 ? entry.types : ['(Sans type)'];
      for (const t of types) {
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(entry);
      }
    }
    // Sort groups alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleCollapse = (type: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (!token || !cfg?.databaseId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤝</div>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Partenaires</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Configurez la base de données Partenaires dans les{' '}
            <span style={{ color: 'var(--accent)' }}>Paramètres</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* ── Barre de contrôle interne (vue + recherche) ── */}
      <div
        className="px-5 py-3 shrink-0 flex items-center justify-between gap-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span style={{ fontSize: 18 }}>🤝</span>
          Partenaires
          {entries.length > 0 && (
            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
              ({entries.length})
            </span>
          )}
        </h2>

        <div className="flex items-center gap-3">
          {/* Toggle vue cartes/liste (contrôles locaux, en complément du toolbar) */}
          <div className="inline-flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setLocalViewMode('card')}
              className="px-2.5 py-1.5 text-xs font-medium transition"
              style={viewMode === 'card'
                ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}
              title="Vue cartes"
            >⊞</button>
            <button
              onClick={() => setLocalViewMode('list')}
              className="px-2.5 py-1.5 text-xs font-medium transition border-l"
              style={viewMode === 'list'
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--border)' }
                : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              title="Vue liste"
            >☰</button>
          </div>
          {/* Recherche locale (si pas contrôlée par le toolbar) */}
          {searchProp === undefined && (
            <input
              type="text"
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              placeholder="Rechercher…"
              className="text-xs rounded px-2.5 py-1.5 outline-none w-48"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          )}
        </div>
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-xs text-center" style={{ color: 'var(--color-error)' }}>⚠ {error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {search ? 'Aucun résultat pour cette recherche.' : 'Aucun partenaire trouvé.'}
          </p>
        </div>
      ) : viewMode === 'card' ? (
        <CardView
          groups={groups}
          collapsedTypes={collapsedTypes}
          onToggleCollapse={toggleCollapse}
          onOpenSuivis={onOpenSuivis}
        />
      ) : (
        <ListView
          groups={groups}
          collapsedTypes={collapsedTypes}
          onToggleCollapse={toggleCollapse}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onOpenSuivis={onOpenSuivis}
        />
      )}
    </div>
  );
}

// ── Vue Cartes ─────────────────────────────────────────────────────────────────

function CardView({
  groups,
  collapsedTypes,
  onToggleCollapse,
  onOpenSuivis,
}: {
  groups: [string, PartenaireEntry[]][];
  collapsedTypes: Set<string>;
  onToggleCollapse: (t: string) => void;
  onOpenSuivis: (p: PartenaireEntry) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: 'var(--bg)' }}>
      {groups.map(([type, entries]) => {
        const collapsed = collapsedTypes.has(type);
        return (
          <div key={type} className="mb-6">
            {/* En-tête de groupe */}
            <button
              onClick={() => onToggleCollapse(type)}
              className="w-full flex items-center gap-2 mb-3 text-left"
            >
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--accent)' }}
              >
                <span style={{ fontSize: 10, display: 'inline-block', transition: 'transform 150ms', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                {' '}{type}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>• {entries.length}</span>
              <span className="flex-1 h-px ml-1" style={{ background: 'var(--border)' }} />
            </button>

            {!collapsed && (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {entries.map(entry => (
                  <PartenaireCard key={entry.id} entry={entry} onOpen={onOpenSuivis} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PartenaireCard({ entry, onOpen }: { entry: PartenaireEntry; onOpen: (p: PartenaireEntry) => void }) {
  const [hovered, setHovered] = useState(false);
  const badges = parseEtatBadges(entry.etatSuivis);

  return (
    <button
      onClick={() => onOpen(entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="text-left flex flex-col rounded-lg p-4 transition"
      style={{
        background: hovered
          ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))'
          : 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Nom */}
      <span
        className="text-sm font-semibold leading-tight mb-1"
        style={{ color: 'var(--text)' }}
      >
        {entry.title}
      </span>

      {/* Code abrégé */}
      {entry.shortCode && (
        <span className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          {entry.shortCode}
        </span>
      )}

      {/* État des suivis — badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto pt-2">
          {badges.map((b, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                color: 'var(--accent)',
                fontWeight: 500,
              }}
            >
              {b.count !== undefined ? `${b.label} : ${b.count}` : b.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Vue Liste ──────────────────────────────────────────────────────────────────

function ListView({
  groups,
  collapsedTypes,
  onToggleCollapse,
  sortKey,
  sortDir,
  onSort,
  onOpenSuivis,
}: {
  groups: [string, PartenaireEntry[]][];
  collapsedTypes: Set<string>;
  onToggleCollapse: (t: string) => void;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  onOpenSuivis: (p: PartenaireEntry) => void;
}) {
  const SortTh = ({ col, label, className = '' }: { col: SortKey; label: string; className?: string }) => (
    <th
      className={`px-4 py-2.5 text-left font-medium cursor-pointer select-none hover:opacity-80 transition ${className}`}
      style={{ color: sortKey === col ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11 }}
      onClick={() => onSort(col)}
    >
      {label}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)' }}>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <SortTh col="title" label="Nom" />
            <SortTh col="shortCode" label="Abrégé" />
            <th className="px-4 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)', fontSize: 11 }}>Type</th>
            <SortTh col="etatSuivis" label="État des suivis" />
          </tr>
        </thead>
        <tbody>
          {groups.map(([type, entries]) => {
            const collapsed = collapsedTypes.has(type);
            return [
              // Groupe header row
              <tr key={`group-${type}`}>
                <td colSpan={4} style={{ padding: 0 }}>
                  <button
                    onClick={() => onToggleCollapse(type)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left"
                    style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)' }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        display: 'inline-block',
                        transition: 'transform 150ms',
                        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        color: 'var(--accent)',
                      }}
                    >▼</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{type}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entries.length}</span>
                  </button>
                </td>
              </tr>,
              // Rows
              !collapsed && entries.map(entry => (
                <PartenaireRow key={entry.id} entry={entry} onOpen={onOpenSuivis} />
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function PartenaireRow({ entry, onOpen }: { entry: PartenaireEntry; onOpen: (p: PartenaireEntry) => void }) {
  const [hovered, setHovered] = useState(false);
  const badges = parseEtatBadges(entry.etatSuivis);

  return (
    <tr
      onClick={() => onOpen(entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--border)',
        background: hovered ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 100ms',
      }}
    >
      <td className="px-4 py-2.5" style={{ color: 'var(--text)', fontWeight: 500 }}>
        {entry.title}
      </td>
      <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
        {entry.shortCode || '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {entry.types.map(t => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {badges.map((b, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: 'var(--accent)',
                fontWeight: 500,
              }}
            >
              {b.count !== undefined ? `${b.label} : ${b.count}` : b.label}
            </span>
          ))}
          {badges.length === 0 && <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </div>
      </td>
    </tr>
  );
}
