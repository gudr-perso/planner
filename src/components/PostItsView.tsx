import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { load } from '../persistence';
import {
  fetchPostIts,
  fetchDatabaseSchema,
  patchPostItStatus,
  fetchPageBlocks,
  patchBlockChecked,
} from '../notionService';
import type { NotionBlock, NotionConfig, NotionPropertySchema, PostItEntry, PostItsConfig } from '../types';
import { NotionBlockRenderer } from './NotionBlockRenderer';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';

const NOTION_COLORS: Record<string, string> = {
  default: 'var(--text-muted)',
  gray: '#9ca3af',
  brown: '#92400e',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  red: '#ef4444',
};

function notionColor(c?: string): string {
  return NOTION_COLORS[c ?? 'default'] ?? NOTION_COLORS.default;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const parts = iso.split('T')[0].split('-');
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export function PostItsView() {
  const notionCfg = load<NotionConfig | null>('notionConfig', null);
  const postitsCfg = load<PostItsConfig | null>('postitsConfig', null);
  const token = notionCfg?.integrationToken ?? '';

  const { width: detailWidth, containerRef, onMouseDown: onPanelResize } = useResizableRightPanel('postitsDetailWidth', 480);

  const [entries, setEntries] = useState<PostItEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusOptions, setStatusOptions] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [todoStatus, setTodoStatus] = useState<'saving' | 'ok' | 'error' | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const loadEntries = useCallback(() => {
    if (!token || !postitsCfg?.databaseId) return;
    setLoading(true);
    setError(null);
    fetchPostIts(token, postitsCfg)
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, postitsCfg]);

  useEffect(() => {
    loadEntries();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !postitsCfg?.databaseId || !postitsCfg.statusField) return;
    fetchDatabaseSchema(token, postitsCfg.databaseId).then(schema => {
      const prop = schema.find((p: NotionPropertySchema) => p.name === postitsCfg.statusField);
      if (prop?.options) {
        const doneVal = postitsCfg.statusDoneValue || 'Terminé';
        setStatusOptions(prop.options.filter((o: { name: string }) => o.name !== doneVal).map((o: { name: string }) => o.name));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      b.id === blockId
        ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked } }
        : b
    ));
    setTodoStatus('saving');
    patchBlockChecked(token, blockId, checked)
      .then(() => { setTodoStatus('ok'); setTimeout(() => setTodoStatus(null), 1500); })
      .catch(() => {
        setBlocks(prev => prev.map(b =>
          b.id === blockId
            ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked: !checked } }
            : b
        ));
        setTodoStatus('error');
        setTimeout(() => setTodoStatus(null), 3000);
      });
  }, [token]);

  const handleStatusChange = useCallback(async (entry: PostItEntry, newStatus: string) => {
    if (!postitsCfg?.statusField) return;
    setStatusUpdating(true);
    try {
      await patchPostItStatus(token, entry.id, postitsCfg.statusField, newStatus, 'status');
    } catch {
      try {
        await patchPostItStatus(token, entry.id, postitsCfg.statusField, newStatus, 'select');
      } catch (e2) {
        console.error('patchPostItStatus failed', e2);
        setStatusUpdating(false);
        return;
      }
    }
    setStatusUpdating(false);
    loadEntries();
    setSelectedId(null);
  }, [token, postitsCfg, loadEntries]);

  const selectedEntry = entries.find(e => e.id === selectedId);

  if (!token || !postitsCfg?.databaseId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📌</div>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Post-its</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Configurez la base de données Post-its dans les{' '}
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
        <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span style={{ fontSize: 18 }}>📌</span>
            Post-its
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
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun post-it actif.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-5 py-2 font-medium" style={{ color: 'var(--text-muted)', width: 240 }}>Aa Sujet</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)', width: 80 }}>Créé le</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)', width: 80 }}>Échéance</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <PostItRow
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedId === entry.id}
                    onSelect={selectEntry}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Poignée ── */}
      {selectedId && (
        <div
          className="w-1 shrink-0 cursor-col-resize transition-colors"
          style={{ background: 'var(--border)' }}
          onMouseDown={onPanelResize}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
        />
      )}

      {/* ── Panneau détail ── */}
      {selectedId && selectedEntry && (
        <div className="flex flex-col overflow-hidden" style={{ width: detailWidth, flexShrink: 0 }}>
          <div
            className="px-6 py-4 shrink-0 flex items-start justify-between gap-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex-1 min-w-0">
              <h2 className="font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.3 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>📌</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedEntry.title}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <PropRow icon="🕐" label="Créé le">{formatDate(selectedEntry.createdTime)}</PropRow>
                <PropRow icon="📅" label="Échéance">{formatDate(selectedEntry.dueDate)}</PropRow>
                <PropRow icon="◉" label="Statut">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 8px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `color-mix(in srgb, ${notionColor(selectedEntry.statusColor)} 18%, transparent)`,
                      color: notionColor(selectedEntry.statusColor),
                      border: `1px solid color-mix(in srgb, ${notionColor(selectedEntry.statusColor)} 35%, transparent)`,
                    }}>
                      {selectedEntry.status || '—'}
                    </span>
                    {statusOptions.length > 0 && (
                      <select
                        disabled={statusUpdating}
                        value=""
                        onChange={e => { if (e.target.value) handleStatusChange(selectedEntry, e.target.value); }}
                        style={{
                          fontSize: 11,
                          background: 'var(--bg-deep)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          padding: '1px 4px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">Changer…</option>
                        {statusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                    {statusUpdating && <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>⟳</span>}
                  </div>
                </PropRow>
                {selectedEntry.notion_url && (
                  <PropRow icon="↗" label="Notion">
                    <a
                      href={selectedEntry.notion_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      Ouvrir <ExternalLink size={11} />
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
                style={{
                  color: 'var(--text-muted)', fontSize: 15, lineHeight: 1,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >✕</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
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
        </div>
      )}
    </div>
  );
}

function PostItRow({
  entry, isSelected, onSelect,
}: {
  entry: PostItEntry;
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
          <span style={{ flexShrink: 0 }}>📌</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>
            {entry.title}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {formatDate(entry.createdTime)}
      </td>
      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {formatDate(entry.dueDate)}
      </td>
      <td className="px-3 py-2.5">
        {entry.status && (
          <span style={{
            display: 'inline-block',
            padding: '1px 8px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            background: `color-mix(in srgb, ${notionColor(entry.statusColor)} 18%, transparent)`,
            color: notionColor(entry.statusColor),
            border: `1px solid color-mix(in srgb, ${notionColor(entry.statusColor)} 35%, transparent)`,
          }}>
            {entry.status}
          </span>
        )}
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
