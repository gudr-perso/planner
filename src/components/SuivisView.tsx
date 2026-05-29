import { useCallback, useEffect, useMemo, useState } from 'react';
import { load, save } from '../persistence';
import { fetchSuivis, fetchPageBlocks, patchBlockChecked } from '../notionService';
import type { NotionBlock, NotionConfig, PartenaireEntry, SuivisConfig, SuiviEntry } from '../types';
import { NotionBlockRenderer } from './NotionBlockRenderer';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

type SortKey = keyof Pick<SuiviEntry, 'title' | 'suivi' | 'createdTime' | 'lastActionDate'> | 'projets' | 'partenaires' | 'contact';

// ── Composant principal ───────────────────────────────────────────────────────

export function SuivisView({
  partenaireFilter,
  onClearFilter,
}: {
  partenaireFilter?: PartenaireEntry | null;
  onClearFilter?: () => void;
}) {
  const notionCfg = load<NotionConfig | null>('notionConfig', null);
  const cfg = load<SuivisConfig | null>('suivisConfig', null);
  const token = notionCfg?.integrationToken ?? '';

  const { width: detailWidth, containerRef, onMouseDown: onPanelResize } =
    useResizableRightPanel('suivisDetailWidth', 480);

  const [entries, setEntries] = useState<SuiviEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [suivisFilter, setSuivisFilter] = useState('');
  const [showClos, setShowClos] = useState(() => load<boolean>('suivis-show-clos', false));
  const [sortKey, setSortKey] = useState<SortKey>('lastActionDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [todoStatus, setTodoStatus] = useState<'saving' | 'ok' | 'error' | null>(null);

  // Recharger quand le filtre partenaire change
  useEffect(() => {
    if (!token || !cfg?.databaseId) return;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    fetchSuivis(token, cfg, partenaireFilter?.id)
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [partenaireFilter?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectEntry = useCallback((id: string) => {
    setSelectedId(id);
    setBlocks([]);
    setBlocksError(null);
    setBlocksLoading(true);
    fetchPageBlocks(token, id)
      .then(setBlocks)
      .catch(e => setBlocksError((e as Error).message))
      .finally(() => setBlocksLoading(false));
  }, [token]);

  const handleToggleTodo = useCallback((blockId: string, checked: boolean) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked } } : b
    ));
    setTodoStatus('saving');
    patchBlockChecked(token, blockId, checked)
      .then(() => { setTodoStatus('ok'); setTimeout(() => setTodoStatus(null), 1500); })
      .catch(() => {
        setBlocks(prev => prev.map(b =>
          b.id === blockId ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked: !checked } } : b
        ));
        setTodoStatus('error');
        setTimeout(() => setTodoStatus(null), 3000);
      });
  }, [token]);

  // Unique suivi values for filter dropdown
  const suivisValues = useMemo(() => {
    const vals = new Set(entries.map(e => e.suivi).filter(Boolean));
    return Array.from(vals).sort();
  }, [entries]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = entries;
    if (!showClos) list = list.filter(e => e.suivi !== 'Clos');
    if (q) list = list.filter(e => e.title.toLowerCase().includes(q));
    if (suivisFilter) list = list.filter(e => e.suivi === suivisFilter);

    return [...list].sort((a, b) => {
      let va = '';
      let vb = '';
      if (sortKey === 'projets') { va = a.projets.join(','); vb = b.projets.join(','); }
      else if (sortKey === 'partenaires') { va = a.partenaires.join(','); vb = b.partenaires.join(','); }
      else if (sortKey === 'contact') { va = a.contact.join(','); vb = b.contact.join(','); }
      else { va = String(a[sortKey] ?? ''); vb = String(b[sortKey] ?? ''); }
      const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, search, suivisFilter, sortKey, sortDir]);

  const selectedEntry = entries.find(e => e.id === selectedId);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  if (!token || !cfg?.databaseId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Suivis</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Configurez la base de données Suivis dans les{' '}
            <span style={{ color: 'var(--accent)' }}>Paramètres</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Liste ── */}
      <div className="flex flex-col overflow-hidden" style={{ flex: 1, minWidth: 0 }}>

        {/* En-tête */}
        <div className="px-5 py-3 shrink-0 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span style={{ fontSize: 18 }}>📋</span>
            Suivis
            {entries.length > 0 && (
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({filtered.length}{filtered.length !== entries.length ? `/${entries.length}` : ''})</span>
            )}
          </h2>

          {/* Chip filtre partenaire */}
          {partenaireFilter && (
            <div
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}
            >
              <span>🤝 {partenaireFilter.title}</span>
              <button
                onClick={onClearFilter}
                className="leading-none transition hover:opacity-70"
                style={{ fontSize: 12 }}
                title="Effacer le filtre"
              >✕</button>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {/* Toggle clos */}
            <button
              onClick={() => { const v = !showClos; setShowClos(v); save('suivis-show-clos', v); }}
              className="text-xs px-2.5 py-1 rounded transition-all"
              style={{
                background: showClos ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-deep)',
                color: showClos ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${showClos ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
              }}
              title={showClos ? 'Masquer les clos' : 'Afficher les clos'}
            >
              {showClos ? '🔓' : '🔒'} Clos
            </button>

            {/* Filtre suivi */}
            {suivisValues.length > 0 && (
              <select
                value={suivisFilter}
                onChange={e => setSuivisFilter(e.target.value)}
                className="text-xs rounded px-2 py-1.5 outline-none"
                style={{ background: 'var(--bg-deep)', color: suivisFilter ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${suivisFilter ? 'var(--accent)' : 'var(--border)'}` }}
              >
                <option value="">Tous les suivis</option>
                {suivisValues.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {/* Recherche */}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="text-xs rounded px-2.5 py-1.5 outline-none w-44"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        {/* Contenu */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-xs text-center" style={{ color: 'var(--color-error)' }}>⚠ {error}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <SortTh col="title" label="Nom" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="suivi" label="Suivi" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={90} />
                  <SortTh col="projets" label="Projets" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={140} />
                  <SortTh col="partenaires" label="Partenaires" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={140} />
                  <SortTh col="contact" label="Contact" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={120} />
                  <SortTh col="createdTime" label="Créé le" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={90} />
                  <SortTh col="lastActionDate" label="Dernière action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={110} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      {search || suivisFilter ? 'Aucun résultat.' : 'Aucun suivi trouvé.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map(entry => (
                    <SuiviRow
                      key={entry.id}
                      entry={entry}
                      isSelected={selectedId === entry.id}
                      onSelect={selectEntry}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Poignée de redimensionnement ── */}
      {selectedId && (
        <div
          className="w-1 shrink-0 cursor-col-resize transition-colors"
          style={{ background: 'var(--border)' }}
          onMouseDown={onPanelResize}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
          title="Redimensionner"
        />
      )}

      {/* ── Panneau détail ── */}
      {selectedId && selectedEntry && (
        <div className="flex flex-col overflow-hidden" style={{ width: detailWidth, flexShrink: 0 }}>
          {/* En-tête */}
          <div
            className="px-6 py-4 shrink-0 flex items-start justify-between gap-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex-1 min-w-0">
              <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.3 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedEntry.title}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {selectedEntry.suivi && (
                  <PropRow icon="🏷" label="Suivi">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded font-medium"
                      style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                    >
                      {selectedEntry.suivi}
                    </span>
                  </PropRow>
                )}
                {selectedEntry.projets.length > 0 && (
                  <PropRow icon="📁" label="Projets">{selectedEntry.projets.join(', ')}</PropRow>
                )}
                {selectedEntry.partenaires.length > 0 && (
                  <PropRow icon="🤝" label="Partenaires">{selectedEntry.partenaires.join(', ')}</PropRow>
                )}
                {selectedEntry.contact.length > 0 && (
                  <PropRow icon="👤" label="Contact">{selectedEntry.contact.join(', ')}</PropRow>
                )}
                {selectedEntry.createdTime && (
                  <PropRow icon="📅" label="Créé le">{formatDate(selectedEntry.createdTime)}</PropRow>
                )}
                {selectedEntry.lastActionDate && (
                  <PropRow icon="🕐" label="Dernière action">{formatDate(selectedEntry.lastActionDate)}</PropRow>
                )}
                {selectedEntry.notion_url && (
                  <PropRow icon="🔗" label="Notion">
                    <a
                      href={selectedEntry.notion_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline transition-opacity hover:opacity-80"
                      style={{ color: 'var(--accent)', fontSize: 11 }}
                      onClick={e => e.stopPropagation()}
                    >
                      Ouvrir dans Notion
                    </a>
                  </PropRow>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {todoStatus && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={todoStatus === 'error'
                    ? { background: 'var(--color-error-bg)', color: 'var(--color-error)' }
                    : todoStatus === 'ok'
                      ? { background: 'var(--color-success-bg)', color: 'var(--color-success)' }
                      : { color: 'var(--text-muted)' }}
                >
                  {todoStatus === 'saving' && <span className="animate-spin inline-block">⟳</span>}
                  {todoStatus === 'ok' && '✓ Sauvegardé'}
                  {todoStatus === 'error' && '⚠ Erreur'}
                </span>
              )}
              <button
                onClick={() => setSelectedId(null)}
                title="Fermer"
                style={{ color: 'var(--text-muted)', fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >✕</button>
            </div>
          </div>

          {/* Corps : blocs Notion */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {blocksLoading ? (
              <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement du contenu…</p>
            ) : blocksError ? (
              <p className="text-xs" style={{ color: 'var(--color-error)' }}>⚠ {blocksError}</p>
            ) : blocks.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>(Page vide)</p>
            ) : (
              <NotionBlockRenderer blocks={blocks} onToggleTodo={handleToggleTodo} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SortTh({
  col, label, sortKey, sortDir, onSort, width,
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  width?: number | string;
}) {
  return (
    <th
      className="px-4 py-2.5 text-left font-medium cursor-pointer select-none hover:opacity-80 transition whitespace-nowrap"
      style={{ color: sortKey === col ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, width }}
      onClick={() => onSort(col)}
    >
      {label}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

function SuiviRow({
  entry, isSelected, onSelect,
}: {
  entry: SuiviEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onClick={() => onSelect(entry.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--border)',
        background: isSelected
          ? 'color-mix(in srgb, var(--accent) 9%, transparent)'
          : hovered
            ? 'color-mix(in srgb, var(--accent) 4%, transparent)'
            : 'transparent',
        cursor: 'pointer',
        transition: 'background 100ms',
      }}
    >
      {/* Nom */}
      <td className="px-4 py-2.5" style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 220 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.title}
        </span>
      </td>

      {/* Suivi */}
      <td className="px-4 py-2.5">
        {entry.suivi ? (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }}
          >
            {entry.suivi}
          </span>
        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>

      {/* Projets */}
      <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)', maxWidth: 140 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.projets.join(', ') || '—'}
        </span>
      </td>

      {/* Partenaires */}
      <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)', maxWidth: 140 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.partenaires.join(', ') || '—'}
        </span>
      </td>

      {/* Contact */}
      <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)', maxWidth: 120 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.contact.join(', ') || '—'}
        </span>
      </td>

      {/* Créé le */}
      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        {formatDate(entry.createdTime)}
      </td>

      {/* Dernière action */}
      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        {formatDate(entry.lastActionDate)}
      </td>
    </tr>
  );
}

function PropRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{icon}</span> {label}
      </span>
      <span style={{ color: 'var(--text)' }}>{children}</span>
    </div>
  );
}
