import { useCallback, useEffect, useState } from 'react';
import { load } from '../persistence';
import { fetchBriefings, fetchPageBlocks, patchBlockChecked } from '../notionService';
import { getDemoStore } from '../demoData';
import type { BriefingConfig, BriefingEntry, NotionBlock, NotionConfig } from '../types';
import { NotionBlockRenderer } from './NotionBlockRenderer';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';
import { useIsMobile } from '../hooks/useBreakpoint';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Module-level cache (survit aux démontages)
let _briefingCache: BriefingEntry[] | null = null;
let _briefingCacheKey = -1;

export function BriefingView({ refreshKey = 0 }: { refreshKey?: number }) {
  const notionCfg = load<NotionConfig | null>('notionConfig', null);
  const briefingCfg = load<BriefingConfig | null>('briefingConfig', null);
  const token = notionCfg?.integrationToken ?? '';
  const isMobile = useIsMobile();

  const { width: detailWidth, containerRef, onMouseDown: onPanelResize } = useResizableRightPanel('briefingDetailWidth', 480);

  const [entries, setEntries] = useState<BriefingEntry[]>(_briefingCache ?? []);
  const [loading, setLoading] = useState(_briefingCache === null);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [todoStatus, setTodoStatus] = useState<'saving' | 'ok' | 'error' | null>(null);

  useEffect(() => {
    if (_briefingCache !== null && _briefingCacheKey === refreshKey) return;
    if (!token || !briefingCfg?.databaseId) {
      const demo = getDemoStore();
      if (demo) { _briefingCache = demo.briefings; _briefingCacheKey = refreshKey; setEntries(demo.briefings); }
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchBriefings(token, briefingCfg)
      .then(data => {
        _briefingCache = data;
        _briefingCacheKey = refreshKey;
        setEntries(data);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectEntry = useCallback((id: string) => {
    setSelectedId(id);
    const demoBlocks = getDemoStore()?.blocks[id];
    if (demoBlocks) { setBlocks(demoBlocks); setBlocksLoading(false); return; }
    setBlocks([]);
    setBlocksError(null);
    setBlocksLoading(true);
    fetchPageBlocks(token, id)
      .then(setBlocks)
      .catch(e => setBlocksError((e as Error).message))
      .finally(() => setBlocksLoading(false));
  }, [token]);

  const handleToggleTodo = useCallback((blockId: string, checked: boolean) => {
    // Mise à jour optimiste
    setBlocks(prev => prev.map(b =>
      b.id === blockId
        ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked } }
        : b
    ));
    setTodoStatus('saving');
    patchBlockChecked(token, blockId, checked)
      .then(() => {
        setTodoStatus('ok');
        setTimeout(() => setTodoStatus(null), 1500);
      })
      .catch(() => {
        // Revert
        setBlocks(prev => prev.map(b =>
          b.id === blockId
            ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked: !checked } }
            : b
        ));
        setTodoStatus('error');
        setTimeout(() => setTodoStatus(null), 3000);
      });
  }, [token]);

  const selectedEntry = entries.find(e => e.id === selectedId);

  if (!token || !briefingCfg?.databaseId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div style={{ fontSize: 36, marginBottom: 12 }}>☀️</div>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Briefing du matin</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Configurez la base de données Briefing dans les{' '}
            <span style={{ color: 'var(--accent)' }}>Paramètres</span>.
          </p>
        </div>
      </div>
    );
  }

  // ── Contenu détail partagé ───────────────────────────────────────────────
  const detailPanel = selectedId && selectedEntry ? (
    <>
      {/* En-tête détail */}
      <div
        className="px-4 py-4 shrink-0 flex items-start justify-between gap-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex-1 min-w-0">
          <h2 className="font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.3 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>☀️</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedEntry.title}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {selectedEntry.date && <PropRow icon="📅" label="Date">{selectedEntry.date}</PropRow>}
            {selectedEntry.summary && <PropRow icon="≡" label="En bref"><span style={{ lineHeight: 1.5 }}>{selectedEntry.summary}</span></PropRow>}
            {selectedEntry.createdTime && <PropRow icon="🕐" label="Créé le">{formatFullDate(selectedEntry.createdTime)}</PropRow>}
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
            style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1, marginTop: 2, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >✕</button>
        </div>
      </div>
      {/* Contenu des blocs */}
      <div className="themed-scroll flex-1 overflow-y-auto px-4 py-5">
        {blocksLoading ? (
          <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement du contenu…</p>
        ) : blocksError ? (
          <p className="text-xs" style={{ color: 'var(--color-error)' }}>⚠ {blocksError}</p>
        ) : blocks.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>(Page vide)</p>
        ) : (
          <NotionBlockRenderer blocks={blocks} onToggleTodo={handleToggleTodo} token={token} />
        )}
      </div>
    </>
  ) : null;

  // ── Liste briefings ───────────────────────────────────────────────────────
  const listContent = (
    <>
      <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span style={{ fontSize: 18 }}>☀️</span>
          Centre des briefings du matin
        </h2>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-xs text-center" style={{ color: 'var(--color-error)' }}>⚠ {error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun briefing trouvé.</p>
        </div>
      ) : (
        <div className="themed-scroll flex-1 overflow-y-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-5 py-2 font-medium" style={{ color: 'var(--text-muted)', width: 240 }}>Aa Nom</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)', width: 64 }}>Date</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>≡ En bref</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <BriefingRow key={entry.id} entry={entry} isSelected={selectedId === entry.id} onSelect={selectEntry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  // ── Mode mobile : modal plein écran ──────────────────────────────────────
  if (isMobile) {
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {listContent}

        {/* Modal plein écran sur mobile */}
        {selectedId && selectedEntry && (
          <div
            className="fixed inset-0 z-50 flex flex-col overflow-hidden"
            style={{ background: 'var(--bg)' }}
          >
            {detailPanel}
          </div>
        )}
      </div>
    );
  }

  // ── Mode desktop : layout côte à côte ────────────────────────────────────
  return (
    <div ref={containerRef} className="h-full flex overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
        {listContent}
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
      {selectedId && selectedEntry && (
        <div className="flex flex-col overflow-hidden" style={{ width: detailWidth, flexShrink: 0 }}>
          {detailPanel}
        </div>
      )}
    </div>
  );
}

function BriefingRow({
  entry, isSelected, onSelect,
}: {
  entry: BriefingEntry;
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
      <td className="px-5 py-2.5" style={{ color: 'var(--text)', fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ flexShrink: 0 }}>☀️</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>
            {entry.title}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {formatDate(entry.date)}
      </td>
      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)', overflow: 'hidden' }}>
        <span style={{
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entry.summary}
        </span>
      </td>
    </tr>
  );
}

function PropRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', width: 100, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{icon}</span> {label}
      </span>
      <span style={{ color: 'var(--text)' }}>{children}</span>
    </div>
  );
}
