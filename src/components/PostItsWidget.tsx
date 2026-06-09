import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import { load } from '../persistence';
import {
  fetchPostIts,
  fetchDatabaseSchema,
  fetchPageBlocks,
  patchPostItStatus,
  patchBlockChecked,
  createPostIt,
} from '../notionService';
import type { NotionBlock, NotionPropertySchema, PostItEntry, PostItsConfig } from '../types';
import { NotionBlockRenderer } from './NotionBlockRenderer';

const NOTION_COLORS: Record<string, string> = {
  default: '#94a3b8',
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

function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const s = iso.split('T')[0];
  const parts = s.split('-');
  if (parts.length < 3) return s;
  return `${parts[2]}/${parts[1]}`;
}

// ── Popup lecture/édition ──────────────────────────────────────────────────────

function PostItPopup({
  entry,
  statusOptions,
  doneValue,
  onClose,
  onStatusChange,
}: {
  entry: PostItEntry;
  statusOptions: string[];
  doneValue: string | null;
  onClose: () => void;
  onStatusChange: (newStatus: string) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [updating, setUpdating] = useState(false);
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [todoStatus, setTodoStatus] = useState<'saving' | 'ok' | 'error' | null>(null);

  useEffect(() => {
    setBlocksLoading(true);
    fetchPageBlocks(entry.id)
      .then(setBlocks)
      .catch(() => {})
      .finally(() => setBlocksLoading(false));
  }, [entry.id]);

  const handleToggleTodo = (blockId: string, checked: boolean) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked } } : b
    ));
    setTodoStatus('saving');
    patchBlockChecked(blockId, checked)
      .then(() => { setTodoStatus('ok'); setTimeout(() => setTodoStatus(null), 1500); })
      .catch(() => {
        setBlocks(prev => prev.map(b =>
          b.id === blockId ? { ...b, to_do: { ...(b.to_do as Record<string, unknown>), checked: !checked } } : b
        ));
        setTodoStatus('error');
        setTimeout(() => setTodoStatus(null), 3000);
      });
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleStatus = async (val: string) => {
    setUpdating(true);
    await onStatusChange(val);
    setUpdating(false);
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(13,14,30,0.75)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: 'var(--bg)',
        borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        width: '100%',
        maxWidth: 520,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${notionColor(entry.statusColor)}`,
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 8 }}>{entry.title}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                padding: '2px 10px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                background: `color-mix(in srgb, ${notionColor(entry.statusColor)} 18%, transparent)`,
                color: notionColor(entry.statusColor),
                border: `1px solid color-mix(in srgb, ${notionColor(entry.statusColor)} 35%, transparent)`,
              }}>
                {entry.status || '—'}
              </span>
              {doneValue && entry.status !== doneValue && (
                <button
                  disabled={updating}
                  onClick={() => handleStatus(doneValue)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'color-mix(in srgb, #059669 15%, transparent)',
                    color: '#059669',
                    border: '1px solid color-mix(in srgb, #059669 35%, transparent)',
                    borderRadius: 6,
                    padding: '2px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  ✓ Terminé
                </button>
              )}
              {statusOptions.length > 0 && (
                <select
                  disabled={updating}
                  value=""
                  onChange={e => { if (e.target.value) handleStatus(e.target.value); }}
                  style={{
                    fontSize: 11,
                    background: 'var(--bg-deep)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Changer…</option>
                  {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {updating && <span style={{ fontSize: 11, color: 'var(--text-muted)' }} className="animate-pulse">⟳</span>}
              {todoStatus === 'ok' && <span style={{ fontSize: 10, color: 'var(--color-success)' }}>✓ Sauvegardé</span>}
              {todoStatus === 'error' && <span style={{ fontSize: 10, color: 'var(--color-error)' }}>⚠ Erreur</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Métadonnées */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, flexShrink: 0 }}>
          <ModalRow label="Créé le">
            <span style={{ fontSize: 12, color: 'var(--text)' }}>{formatShortDate(entry.createdTime) || '—'}</span>
          </ModalRow>
          <ModalRow label="Échéance">
            <span style={{ fontSize: 12, color: entry.dueDate ? 'var(--text)' : 'var(--text-muted)' }}>
              {formatShortDate(entry.dueDate) || '—'}
            </span>
          </ModalRow>
          {entry.notion_url && (
            <ModalRow label="">
              <a
                href={entry.notion_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Ouvrir <ExternalLink size={11} />
              </a>
            </ModalRow>
          )}
        </div>

        {/* Contenu de la page */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 18px' }}>
          {blocksLoading ? (
            <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement du contenu…</p>
          ) : blocks.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>(Page vide)</p>
          ) : (
            <NotionBlockRenderer blocks={blocks} onToggleTodo={handleToggleTodo} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Popup création ─────────────────────────────────────────────────────────────

function PostItCreatePopup({
  statusOptions,
  onClose,
  onCreated,
  config,
}: {
  statusOptions: string[];
  onClose: () => void;
  onCreated: () => void;
  config: PostItsConfig;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState(statusOptions[0] ?? '');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setErr('Le sujet est requis.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await createPostIt(config, { title: title.trim(), dueDate, status, content });
      onCreated();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 1001,
        background: 'rgba(13,14,30,0.78)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: 'var(--bg)',
        borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        width: '100%',
        maxWidth: 440,
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>📌 Nouveau Post-it</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormRow label="Sujet *">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titre du post-it…"
              autoFocus
              className="w-full text-xs rounded px-2 py-1.5 outline-none"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </FormRow>
          <FormRow label="Échéance">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="postit-duedate"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-xs rounded px-2 py-1.5 outline-none"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)', paddingRight: 28 }}
              />
              <span
                onClick={() => (document.getElementById('postit-duedate') as HTMLInputElement)?.showPicker?.()}
                style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'all', lineHeight: 1 }}
              >📅</span>
            </div>
          </FormRow>
          {statusOptions.length > 0 && (
            <FormRow label="Statut">
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full text-xs rounded px-2 py-1.5 outline-none"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </FormRow>
          )}
          <FormRow label="Contenu">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Notes, détails…"
              rows={4}
              className="w-full text-xs rounded px-2 py-1.5 outline-none resize-none"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </FormRow>

          {err && <p className="text-xs" style={{ color: 'var(--color-error)' }}>⚠ {err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded font-medium"
              style={{ background: 'var(--border)', color: 'var(--text)' }}
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="text-xs px-4 py-2 rounded font-medium transition disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper rows ────────────────────────────────────────────────────────────────

function ModalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 70, flexShrink: 0, paddingTop: 6 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ── Carte ──────────────────────────────────────────────────────────────────────

function PostItCard({ entry, onClick }: { entry: PostItEntry; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const color = notionColor(entry.statusColor);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '10px 12px 12px',
        borderRadius: 10,
        background: hovered
          ? `color-mix(in srgb, ${color} 10%, #0e1e45)`
          : `color-mix(in srgb, ${color} 5%, #0b1a3e)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, rgba(100,160,255,0.12))`,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 150ms, border-color 150ms',
        minWidth: 0,
        width: '100%',
      }}
    >
      {/* Titre */}
      <p style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text)',
        lineHeight: 1.4,
        marginBottom: 6,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
      }}>
        {entry.title}
      </p>

      {/* Dates + Statut sur une ligne */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        {entry.createdTime && <span>🕐 {formatShortDate(entry.createdTime)}</span>}
        {entry.dueDate && <span>📅 {formatShortDate(entry.dueDate)}</span>}
        {entry.status && (
          <span style={{
            padding: '1px 7px',
            borderRadius: 99,
            fontSize: 10,
            fontWeight: 600,
            background: `color-mix(in srgb, ${color} 20%, transparent)`,
            color,
            border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
          }}>
            {entry.status}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Widget principal ───────────────────────────────────────────────────────────

export function PostItsWidget({ refreshKey }: { refreshKey?: number }) {
  const postitsCfg = load<PostItsConfig | null>('postitsConfig', null);

  const [entries, setEntries] = useState<PostItEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<PostItEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadEntries = () => {
    if (!postitsCfg?.databaseId) return;
    setLoading(true);
    fetchPostIts(postitsCfg)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEntries();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!postitsCfg?.databaseId || !postitsCfg.statusField) return;
    fetchDatabaseSchema(postitsCfg.databaseId).then(schema => {
      const prop = schema.find((p: NotionPropertySchema) => p.name === postitsCfg.statusField);
      if (prop?.options) {
        setStatusOptions(prop.options.map((o: { name: string }) => o.name));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (entry: PostItEntry, newStatus: string) => {
    if (!postitsCfg?.statusField) return;
    try {
      await patchPostItStatus(entry.id, postitsCfg.statusField, newStatus, 'status');
    } catch {
      try {
        await patchPostItStatus(entry.id, postitsCfg.statusField, newStatus, 'select');
      } catch { return; }
    }
    setSelectedEntry(null);
    loadEntries();
  };

  if (!postitsCfg?.databaseId) return null;

  return (
    <>
      {/* Widget */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            📌 Post-its
          </p>
          <button
            onClick={() => setShowCreate(true)}
            title="Nouveau Post-it"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600,
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              borderRadius: 6,
              padding: '3px 8px',
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
          >
            <Plus size={11} /> Nouveau
          </button>
        </div>

        {loading && (
          <p className="text-xs animate-pulse" style={{ color: 'var(--text-dim)' }}>Chargement…</p>
        )}

        {!loading && entries.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun post-it actif.</p>
        )}

        {!loading && entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {entries.map(e => (
              <PostItCard key={e.id} entry={e} onClick={() => setSelectedEntry(e)} />
            ))}
          </div>
        )}
      </div>

      {/* Popup lecture */}
      {selectedEntry && (
        <PostItPopup
          entry={selectedEntry}
          statusOptions={statusOptions}
          doneValue={postitsCfg?.statusDoneValue
            ?? statusOptions.find(o => /termin/i.test(o))
            ?? null}
          onClose={() => setSelectedEntry(null)}
          onStatusChange={val => handleStatusChange(selectedEntry, val)}
        />
      )}

      {/* Popup création */}
      {showCreate && postitsCfg && (
        <PostItCreatePopup
          statusOptions={statusOptions}
          onClose={() => setShowCreate(false)}
          onCreated={loadEntries}
          config={postitsCfg}
        />
      )}
    </>
  );
}
