import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { load } from '../persistence';
import { fetchTaches, fetchSousTaches, fetchSuivisProjet, fetchEchanges, fetchDocuments, fetchTempsProjet, fetchPageBlocks } from '../notionService';
import type {
  DocumentEntry,
  DocumentsConfig,
  EchangeEntry,
  EchangesConfig,
  NotionBlock,
  NotionConfig,
  SousTacheEntry,
  SousTachesConfig,
  SuiviProjetEntry,
  SuiviProjetConfig,
  TacheEntry,
  TachesConfig,
  TempsProjetConfig,
  TempsProjetEntry,
} from '../types';
import { NotionBlockRenderer } from './NotionBlockRenderer';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';

// ── Helpers partagés ──────────────────────────────────────────────────────────

function notionColor(color?: string): string {
  const map: Record<string, string> = {
    blue: '#3b82f6', green: '#10b981', red: '#ef4444', orange: '#f97316',
    yellow: '#eab308', purple: '#8b5cf6', pink: '#ec4899', gray: '#6b7280',
    brown: '#92400e', default: '#6b7280',
  };
  return color ? (map[color] ?? map.default) : map.default;
}

function Badge({ label, color }: { label: string; color?: string }) {
  if (!label) return null;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-white text-xs font-medium"
      style={{ background: notionColor(color) }}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('fr-FR');
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function LienCell({ url }: { url?: string }) {
  if (!url) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={e => e.stopPropagation()}
      className="hover:opacity-70 transition-opacity"
      style={{ color: 'var(--accent)', fontSize: 13 }}
      title="Ouvrir dans Notion"
    >
      ↗
    </a>
  );
}

function TermineButton({ showTermine, onToggle }: { showTermine: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-xs px-2.5 py-1 rounded transition-all"
      style={{
        background: showTermine ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-deep)',
        color: showTermine ? 'var(--accent)' : 'var(--text-muted)',
        border: `1px solid ${showTermine ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
      }}
      title={showTermine ? 'Masquer les terminés' : 'Afficher les terminés'}
    >
      {showTermine ? '🔓' : '🔒'} Terminé
    </button>
  );
}

// ── Panneau détail ────────────────────────────────────────────────────────────

function DetailPanel({
  title,
  url,
  blocks,
  blocksLoading,
  blocksError,
  onClose,
  token,
}: {
  title: string;
  url: string | null;
  blocks: NotionBlock[];
  blocksLoading: boolean;
  blocksError: string | null;
  onClose: () => void;
  token: string;
}) {
  return (
    <>
      <div
        className="px-5 py-4 shrink-0 flex items-start justify-between gap-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex-1 min-w-0">
          <h2
            className="font-bold mb-2"
            style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {title}
          </h2>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Ouvrir dans Notion ↗
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          title="Fermer"
          style={{ color: 'var(--text-muted)', fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        >
          ✕
        </button>
      </div>
      <div className="themed-scroll flex-1 overflow-y-auto px-5 py-5">
        {blocksLoading ? (
          <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        ) : blocksError ? (
          <p className="text-xs" style={{ color: 'var(--color-error)' }}>⚠ {blocksError}</p>
        ) : blocks.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>(Page vide)</p>
        ) : (
          <NotionBlockRenderer blocks={blocks} token={token} />
        )}
      </div>
    </>
  );
}

// ── Props principal ───────────────────────────────────────────────────────────

interface Props {
  projetId: string;
  projetNom: string;
  onBack: () => void;
}

type TabId = 'taches' | 'sousTaches' | 'suivi' | 'echanges' | 'documents' | 'temps';

// ── Composant principal ───────────────────────────────────────────────────────

export default function ProjetDetailView({ projetId, projetNom, onBack }: Props) {
  const notionCfg = load<NotionConfig>('notionConfig', {
    integrationToken: '', databaseId: '', fieldMap: {}, statusMappings: [],
  });
  const token = notionCfg.integrationToken;

  const [activeTab, setActiveTab] = useState<TabId>('taches');

  // Tâches partagées (chargées une fois, utilisées par les sous-onglets)
  const [taches, setTaches] = useState<TacheEntry[]>([]);
  const [tachesLoading, setTachesLoading] = useState(true);
  const [tachesError, setTachesError] = useState('');

  // Panneau détail partagé
  const { width: detailWidth, containerRef, onMouseDown: onPanelResize } =
    useResizableRightPanel('projetDetailWidth', 480);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);

  // Chargement des tâches du projet
  useEffect(() => {
    const config = load<TachesConfig>('tachesConfig', {
      databaseId: '', nomField: 'Name', canalField: '', statutField: '',
      prioriteField: '', dateEcheanceField: '', planifieLeField: '',
      projetField: '', statutTermineValue: 'Terminé', suiviField: '',
    });
    if (!token || !config.databaseId) {
      setTachesLoading(false);
      return;
    }
    setTachesLoading(true);
    setTachesError('');
    fetchTaches(token, config, projetId)
      .then(data => { setTaches(data); })
      .catch(e => setTachesError(String(e)))
      .finally(() => setTachesLoading(false));
  }, [projetId, token]);

  const tacheIdToName = useMemo(
    () => new Map(taches.map(t => [t.id, t.nom])),
    [taches],
  );

  const openDetail = useCallback((id: string, title: string, url?: string) => {
    setSelectedId(id);
    setSelectedTitle(title);
    setSelectedUrl(url ?? null);
    setBlocks([]);
    setBlocksError(null);
    setBlocksLoading(true);
    fetchPageBlocks(token, id)
      .then(setBlocks)
      .catch(e => setBlocksError((e as Error).message))
      .finally(() => setBlocksLoading(false));
  }, [token]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setBlocks([]);
    setBlocksError(null);
  }, []);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    closeDetail();
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'taches', label: 'Tâches' },
    { id: 'sousTaches', label: 'Sous-tâches' },
    { id: 'suivi', label: 'Suivi' },
    { id: 'echanges', label: 'Echanges' },
    { id: 'documents', label: 'Documents' },
    { id: 'temps', label: 'Temps' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={onBack}
          className="text-xs px-2 py-1 rounded shrink-0"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
        >
          ← Projets
        </button>
        <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
          {projetNom || '(sans nom)'}
        </h1>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 px-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className="text-xs px-4 py-2 font-medium transition"
            style={{
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'taches' && (
            <TachesTab
              taches={taches}
              loading={tachesLoading}
              error={tachesError}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'sousTaches' && (
            <SousTachesTab
              projetId={projetId}
              token={token}
              tacheIdToName={tacheIdToName}
              tachesReady={!tachesLoading}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'suivi' && (
            <SuiviProjetTab
              projetId={projetId}
              token={token}
              tacheIdToName={tacheIdToName}
              tachesReady={!tachesLoading}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'echanges' && (
            <EchangesTab
              projetId={projetId}
              token={token}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'documents' && (
            <DocumentsTab
              projetId={projetId}
              token={token}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'temps' && (
            <TempsProjetTab
              projetId={projetId}
              token={token}
              tacheIdToName={tacheIdToName}
              tachesReady={!tachesLoading}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
        </div>

        {/* Poignée de redimensionnement */}
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

        {/* Panneau détail */}
        {selectedId && (
          <div className="flex flex-col overflow-hidden" style={{ width: detailWidth, flexShrink: 0 }}>
            <DetailPanel
              title={selectedTitle}
              url={selectedUrl}
              blocks={blocks}
              blocksLoading={blocksLoading}
              blocksError={blocksError}
              onClose={closeDetail}
              token={token}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── TachesTab ─────────────────────────────────────────────────────────────────

function TachesTab({
  taches,
  loading,
  error,
  selectedId,
  onSelectRow,
}: {
  taches: TacheEntry[];
  loading: boolean;
  error: string;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<TachesConfig>('tachesConfig', {
    databaseId: '', nomField: 'Name', canalField: '', statutField: '',
    prioriteField: '', dateEcheanceField: '', planifieLeField: '',
    projetField: '', statutTermineValue: 'Terminé', suiviField: '',
  });

  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{
    col: 'nom' | 'canal' | 'statut' | 'priorite' | 'dateEcheance';
    dir: 'asc' | 'desc';
  }>({ col: 'nom', dir: 'asc' });

  const filtered = useMemo(() =>
    showTermine ? taches : taches.filter(t => t.statut !== config.statutTermineValue),
    [taches, showTermine, config.statutTermineValue],
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = String(a[sort.col] ?? '');
    const vb = String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'canal', label: 'Canal' },
    { key: 'statut', label: 'Statut' },
    { key: 'priorite', label: 'Priorité' },
    { key: 'dateEcheance', label: 'Échéance' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} tâche{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto">
          <TermineButton showTermine={showTermine} onToggle={() => setShowTermine(v => !v)} />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="text-left px-3 py-2 cursor-pointer select-none font-medium"
                  >
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Suivi</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Lien</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr
                  key={t.id}
                  onClick={() => onSelectRow(t.id, t.nom, t.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === t.id
                      ? 'color-mix(in srgb, var(--accent) 9%, transparent)'
                      : undefined,
                  }}
                  onMouseEnter={e => {
                    if (selectedId !== t.id) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)';
                  }}
                  onMouseLeave={e => {
                    if (selectedId !== t.id) e.currentTarget.style.background = '';
                  }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{t.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2"><Badge label={t.canal} color={t.canalColor} /></td>
                  <td className="px-3 py-2"><Badge label={t.statut} color={t.statutColor} /></td>
                  <td className="px-3 py-2"><Badge label={t.priorite} color={t.prioriteColor} /></td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(t.dateEcheance)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.suivis.join(', ') || '—'}</td>
                  <td className="px-3 py-2"><LienCell url={t.notion_url} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucune tâche{!showTermine ? ' en cours' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── SousTachesTab ─────────────────────────────────────────────────────────────

function SousTacheRow({ e, selectedId, onSelectRow }: {
  e: SousTacheEntry;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
      className="cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border)',
        background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
      }}
      onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
      onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
    >
      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
      <td className="px-3 py-2"><Badge label={e.statut} color={e.statutColor} /></td>
      <td className="px-3 py-2"><Badge label={e.priorite} color={e.prioriteColor} /></td>
      <td className="px-3 py-2"><Badge label={e.canal} color={e.canalColor} /></td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
      <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
    </tr>
  );
}

function SousTachesTab({
  projetId: _projetId,
  token,
  tacheIdToName,
  tachesReady,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  token: string;
  tacheIdToName: Map<string, string>;
  tachesReady: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<SousTachesConfig>('sousTachesConfig', {
    databaseId: '', nomField: 'Name', statutField: '', prioriteField: '',
    canalField: '', dateField: '', tacheField: '', statutTermineValue: 'Terminé',
  });

  const [entries, setEntries] = useState<SousTacheEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{ col: 'nom' | 'statut' | 'priorite' | 'canal' | 'date'; dir: 'asc' | 'desc' }>({ col: 'nom', dir: 'asc' });
  const [groupByTache, setGroupByTache] = useState(false);

  useEffect(() => {
    if (!tachesReady || !token || !config.databaseId) return;
    setLoading(true);
    fetchSousTaches(token, config, tacheIdToName)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tachesReady, token, config.databaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() =>
    showTermine ? entries : entries.filter(e => e.statut !== config.statutTermineValue),
    [entries, showTermine, config.statutTermineValue],
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = sort.col === 'date' ? (a.date ?? '') : String(a[sort.col] ?? '');
    const vb = sort.col === 'date' ? (b.date ?? '') : String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  const grouped = useMemo(() => {
    if (!groupByTache) return null;
    const map = new Map<string, SousTacheEntry[]>();
    for (const e of sorted) {
      const key = e.tacheNoms[0] ?? '(Sans tâche)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [sorted, groupByTache]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Sous-tâches dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'statut', label: 'Statut' },
    { key: 'priorite', label: 'Priorité' },
    { key: 'canal', label: 'Canal' },
    { key: 'date', label: 'Date' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} sous-tâche{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setGroupByTache(v => !v)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: groupByTache ? 'var(--accent)' : 'var(--border)',
              color: groupByTache ? 'var(--accent-fg)' : 'var(--text)',
            }}
            title="Regrouper par tâche"
          >
            ⊞ Par tâche
          </button>
          <TermineButton showTermine={showTermine} onToggle={() => setShowTermine(v => !v)} />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Tâche liée</th>
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {grouped
                ? grouped.map(([tacheNom, rows]) => (
                    <React.Fragment key={`grp-${tacheNom}`}>
                      <tr>
                        <td colSpan={7} style={{
                          padding: '4px 12px', fontWeight: 700, fontSize: 11,
                          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                          color: 'var(--accent)', borderTop: '1px solid var(--border)',
                        }}>
                          {tacheNom}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {rows.length} sous-tâche{rows.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>
                      {rows.map(e => <SousTacheRow key={e.id} e={e} selectedId={selectedId} onSelectRow={onSelectRow} />)}
                    </React.Fragment>
                  ))
                : sorted.map(e => <SousTacheRow key={e.id} e={e} selectedId={selectedId} onSelectRow={onSelectRow} />)
              }
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucune sous-tâche{!showTermine ? ' en cours' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── SuiviProjetTab ────────────────────────────────────────────────────────────

function SuiviProjetTab({
  projetId: _projetId,
  token,
  tacheIdToName,
  tachesReady,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  token: string;
  tacheIdToName: Map<string, string>;
  tachesReady: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<SuiviProjetConfig>('suiviProjetConfig', {
    databaseId: '', nomField: 'Name', dateField: '', statutField: '',
    tacheField: '', statutTermineValue: 'Terminé',
  });

  const [entries, setEntries] = useState<SuiviProjetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{ col: 'nom' | 'date' | 'statut'; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });

  useEffect(() => {
    if (!tachesReady || !token || !config.databaseId) return;
    setLoading(true);
    fetchSuivisProjet(token, config, tacheIdToName)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tachesReady, token, config.databaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() =>
    showTermine ? entries : entries.filter(e => e.statut !== config.statutTermineValue),
    [entries, showTermine, config.statutTermineValue],
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = sort.col === 'date' ? (a.date ?? '') : String(a[sort.col] ?? '');
    const vb = sort.col === 'date' ? (b.date ?? '') : String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Suivi dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'date', label: 'Date' },
    { key: 'statut', label: 'Statut' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} suivi{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto">
          <TermineButton showTermine={showTermine} onToggle={() => setShowTermine(v => !v)} />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Tâche liée</th>
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr
                  key={e.id}
                  onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
                  }}
                  onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
                  onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</td>
                  <td className="px-3 py-2"><Badge label={e.statut} color={e.statutColor} /></td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
                  <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun suivi{!showTermine ? ' en cours' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── EchangesTab ───────────────────────────────────────────────────────────────

function EchangesTab({
  projetId,
  token,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  token: string;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<EchangesConfig>('echangesConfig', {
    databaseId: '', nomField: 'Name', dateField: '', canalField: '',
    contactField: '', projetField: '', suiviField: '', tacheField: '',
  });

  const [entries, setEntries] = useState<EchangeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ col: 'nom' | 'date' | 'canal' | 'contact' | 'suivi' | 'tacheNoms'; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });

  useEffect(() => {
    if (!token || !config.databaseId) return;
    setLoading(true);
    fetchEchanges(token, config, projetId)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token, projetId, config.databaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    let va: string, vb: string;
    if (sort.col === 'date') {
      va = a.date ?? ''; vb = b.date ?? '';
    } else if (sort.col === 'contact' || sort.col === 'suivi' || sort.col === 'tacheNoms') {
      va = a[sort.col][0] ?? ''; vb = b[sort.col][0] ?? '';
    } else {
      va = String(a[sort.col] ?? ''); vb = String(b[sort.col] ?? '');
    }
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [entries, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Echanges dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'date', label: 'Date' },
    { key: 'canal', label: 'Canal' },
    { key: 'contact', label: 'Contact' },
    { key: 'suivi', label: 'Suivi' },
    { key: 'tacheNoms', label: 'Tâche' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} échange{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr
                  key={e.id}
                  onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
                  }}
                  onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
                  onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</td>
                  <td className="px-3 py-2"><Badge label={e.canal} color={e.canalColor} /></td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.contact.join(', ') || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.suivi.join(', ') || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
                  <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun échange.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── DocumentsTab ──────────────────────────────────────────────────────────────

function DocumentsTab({
  projetId,
  token,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  token: string;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<DocumentsConfig>('documentsConfig', {
    databaseId: '', nomField: 'Name', statutField: '',
  });

  const [entries, setEntries] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ col: 'nom' | 'statut'; dir: 'asc' | 'desc' }>({ col: 'nom', dir: 'asc' });

  useEffect(() => {
    if (!token || !config.databaseId) return;
    setLoading(true);
    fetchDocuments(token, config, projetId)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token, projetId, config.databaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    const va = String(a[sort.col] ?? '');
    const vb = String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [entries, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Documents dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'statut', label: 'Statut' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} document{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr
                  key={e.id}
                  onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
                  }}
                  onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
                  onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2"><Badge label={e.statut} color={e.statutColor} /></td>
                  <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun document.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── TempsProjetTab ────────────────────────────────────────────────────────────

function TempsRow({ e, selectedId, onSelectRow }: {
  e: TempsProjetEntry;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelectRow(e.id, e.description, e.notion_url)}
      className="cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border)',
        background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
      }}
      onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
      onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
    >
      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.description || '(sans titre)'}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDateTime(e.debut)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDateTime(e.fin)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.dureeMin || '—'}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.dureeH || '—'}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
      <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
    </tr>
  );
}

function TempsProjetTab({
  projetId: _projetId,
  token,
  tacheIdToName,
  tachesReady,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  token: string;
  tacheIdToName: Map<string, string>;
  tachesReady: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<TempsProjetConfig>('tempsProjetConfig', {
    databaseId: '', descriptionField: 'Name', debutField: '', finField: '',
    dureeMinField: '', dureeHField: '', tacheField: '',
  });

  const [entries, setEntries] = useState<TempsProjetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ col: 'description' | 'debut' | 'fin' | 'dureeMin' | 'dureeH'; dir: 'asc' | 'desc' }>({ col: 'debut', dir: 'desc' });
  const [groupByTache, setGroupByTache] = useState(false);

  useEffect(() => {
    if (!tachesReady || !token || !config.databaseId) return;
    setLoading(true);
    fetchTempsProjet(token, config, tacheIdToName)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tachesReady, token, config.databaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    const va = (sort.col === 'debut' || sort.col === 'fin') ? (a[sort.col] ?? '') : String(a[sort.col] ?? '');
    const vb = (sort.col === 'debut' || sort.col === 'fin') ? (b[sort.col] ?? '') : String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [entries, sort]);

  const grouped = useMemo(() => {
    if (!groupByTache) return null;
    const map = new Map<string, TempsProjetEntry[]>();
    for (const e of sorted) {
      const key = e.tacheNoms[0] ?? '(Sans tâche)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [sorted, groupByTache]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Temps dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'description', label: 'Description' },
    { key: 'debut', label: 'Début session' },
    { key: 'fin', label: 'Fin session' },
    { key: 'dureeMin', label: 'Durée (min)' },
    { key: 'dureeH', label: 'Durée (h)' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} session{sorted.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto">
          <button
            onClick={() => setGroupByTache(v => !v)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: groupByTache ? 'var(--accent)' : 'var(--border)',
              color: groupByTache ? 'var(--accent-fg)' : 'var(--text)',
            }}
            title="Regrouper par tâche"
          >
            ⊞ Par tâche
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Tâches</th>
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {grouped
                ? grouped.map(([tacheNom, rows]) => (
                    <React.Fragment key={`grp-${tacheNom}`}>
                      <tr>
                        <td colSpan={7} style={{
                          padding: '4px 12px', fontWeight: 700, fontSize: 11,
                          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                          color: 'var(--accent)', borderTop: '1px solid var(--border)',
                        }}>
                          {tacheNom}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {rows.length} session{rows.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>
                      {rows.map(e => <TempsRow key={e.id} e={e} selectedId={selectedId} onSelectRow={onSelectRow} />)}
                    </React.Fragment>
                  ))
                : sorted.map(e => <TempsRow key={e.id} e={e} selectedId={selectedId} onSelectRow={onSelectRow} />)
              }
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucune session de temps.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── EmptyConfig ───────────────────────────────────────────────────────────────

function EmptyConfig({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full px-6">
      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{message}</p>
    </div>
  );
}
