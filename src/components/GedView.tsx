import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, useAuth } from '../store/useAuthStore';
import { load } from '../persistence';
import { fetchClients } from '../notionService';
import { getDemoStore } from '../demoData';
import type { ClientsConfig, ClientEntry } from '../types';

type Visibility = 'internal' | 'public' | 'restricted';

interface GedFile {
  id: string;
  nom: string;
  kind: 'file' | 'link';
  url?: string | null;
  ext?: string | null;
  mime?: string | null;
  taille?: number;
  projet_id?: string | null;
  projet_code?: string | null;
  tags?: string | null;
  description?: string | null;
  visibility?: Visibility;
  clients?: string[];
  created_at?: string;
  snippet?: string | null;
}

const EXT_COLORS: Record<string, string> = {
  pdf: '#ef4444', docx: '#2563eb', pptx: '#ea580c',
  xlsx: '#16a34a', html: '#8b5cf6', htm: '#8b5cf6',
};

const VIS_META: Record<Visibility, { label: string; color: string }> = {
  internal: { label: 'Interne', color: '#6b7280' },
  public: { label: 'Public', color: '#16a34a' },
  restricted: { label: 'Restreint', color: '#d97706' },
};

function ExtBadge({ ext }: { ext?: string | null }) {
  const e = (ext || '?').toLowerCase();
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-bold uppercase"
      style={{ background: EXT_COLORS[e] ?? '#6b7280' }}
    >
      {e}
    </span>
  );
}

function VisBadge({ visibility, count }: { visibility?: Visibility; count?: number }) {
  const v = visibility ?? 'internal';
  const meta = VIS_META[v];
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
      style={{ background: meta.color }}
    >
      {meta.label}{v === 'restricted' && count ? ` (${count})` : ''}
    </span>
  );
}

function humanSize(n?: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

let _gedClientsCache: ClientEntry[] | null = null;

export default function GedView() {
  const { user } = useAuth();
  const isInternal = !user?.client_code;
  const [files, setFiles] = useState<GedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [clientsList, setClientsList] = useState<ClientEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modale propriétés/partage : création (avec fichiers) ou édition (doc existant)
  const [modal, setModal] = useState<
    | { mode: 'create'; files: File[] }
    | { mode: 'edit'; file: GedFile }
    | null
  >(null);

  const loadList = useCallback(() => {
    setLoading(true);
    setError('');
    apiFetch('/api/ged')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setFiles(d.files ?? []);
      })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // Charge la liste des clients (pour le sélecteur de partage) — internes uniquement
  useEffect(() => {
    if (!isInternal) return;
    if (_gedClientsCache) { setClientsList(_gedClientsCache); return; }
    const cfg = load<ClientsConfig>('clientsConfig', { databaseId: '', titreField: 'Name', codeTiersField: '', lieuField: '' });
    if (!cfg.databaseId) {
      const demo = getDemoStore();
      if (demo?.clients?.length) { _gedClientsCache = demo.clients; setClientsList(demo.clients); }
      return;
    }
    fetchClients(cfg)
      .then(data => { _gedClientsCache = data; setClientsList(data); })
      .catch(() => { /* le partage restreint reste possible en saisie manuelle si besoin */ });
  }, [isInternal]);

  // Recherche plein texte (débouncée)
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearching(false); loadList(); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/api/ged/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) throw new Error(d.error);
          setFiles(d.results ?? []);
        })
        .catch(e => setError(String(e.message ?? e)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, loadList]);

  async function handleDelete(f: GedFile) {
    if (!confirm(`Supprimer « ${f.nom} » ?`)) return;
    const res = await apiFetch(`/api/ged/${f.id}`, { method: 'DELETE' });
    if (res.ok) setFiles(fs => fs.filter(x => x.id !== f.id));
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Échec de la suppression'); }
  }

  function openFile(f: GedFile, download = false) {
    if (f.kind === 'link' && f.url) { window.open(f.url, '_blank', 'noopener'); return; }
    window.open(`/api/ged/${f.id}/content${download ? '?dl=1' : ''}`, '_blank', 'noopener');
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>GED</h1>
        <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
          {!loading && !error ? `${files.length} document(s)` : ''}
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (nom & contenu)…"
          className="text-xs rounded px-2 py-1 ml-auto"
          style={{
            background: 'var(--bg-deep)', color: 'var(--text)',
            border: '1px solid var(--border)', width: 240,
          }}
        />
        {isInternal && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs rounded px-3 py-1.5 font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              + Ajouter
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.pptx,.xlsx,.html,.htm"
              className="hidden"
              onChange={e => {
                if (e.target.files?.length) setModal({ mode: 'create', files: Array.from(e.target.files) });
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      <div
        className="flex-1 overflow-auto p-4"
        onDragOver={isInternal ? (e => { e.preventDefault(); setDragOver(true); }) : undefined}
        onDragLeave={isInternal ? (() => setDragOver(false)) : undefined}
        onDrop={isInternal ? (e => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) setModal({ mode: 'create', files: Array.from(e.dataTransfer.files) });
        }) : undefined}
        style={dragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -8 } : undefined}
      >
        {(loading || searching) && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {searching ? 'Recherche…' : 'Chargement…'}
          </p>
        )}
        {error && (
          <p className="text-xs" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>
        )}
        {!loading && !searching && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Nom</th>
                {isInternal && <th className="text-left px-3 py-2 font-medium">Accès</th>}
                <th className="text-left px-3 py-2 font-medium">Taille</th>
                <th className="text-left px-3 py-2 font-medium">Ajouté le</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2"><ExtBadge ext={f.kind === 'link' ? 'html' : f.ext} /></td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => openFile(f)}
                      className="font-medium text-left hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {f.nom || '(sans nom)'}
                    </button>
                    {f.description && (
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{f.description}</div>
                    )}
                    {f.snippet && (
                      <div
                        className="mt-0.5 text-[11px]"
                        style={{ color: 'var(--text-muted)' }}
                        dangerouslySetInnerHTML={{ __html: f.snippet }}
                      />
                    )}
                  </td>
                  {isInternal && (
                    <td className="px-3 py-2"><VisBadge visibility={f.visibility} count={f.clients?.length} /></td>
                  )}
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{humanSize(f.taille)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {f.created_at ? new Date(f.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openFile(f, true)} className="px-1.5 hover:underline" style={{ color: 'var(--text-muted)' }} title="Télécharger">⬇</button>
                    {isInternal && (
                      <>
                        <button onClick={() => setModal({ mode: 'edit', file: f })} className="px-1.5 hover:underline" style={{ color: 'var(--text-muted)' }} title="Propriétés & partage">✎</button>
                        <button onClick={() => handleDelete(f)} className="px-1.5 hover:underline" style={{ color: 'var(--color-error, #e53e3e)' }} title="Supprimer">🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={isInternal ? 6 : 5} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                    {search ? 'Aucun document trouvé.' : (isInternal
                      ? 'Aucun document. Glissez-déposez un fichier ou cliquez sur « Ajouter ».'
                      : 'Aucun document disponible.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal && isInternal && (
        <PropertiesModal
          modal={modal}
          clientsList={clientsList}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setSearch(''); loadList(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ─── Modale propriétés / partage (création multi-fichiers ou édition) ───────────
function PropertiesModal({
  modal, clientsList, onClose, onSaved, onError,
}: {
  modal: { mode: 'create'; files: File[] } | { mode: 'edit'; file: GedFile };
  clientsList: ClientEntry[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const isCreate = modal.mode === 'create';
  const single = isCreate && modal.files.length === 1;
  const existing = modal.mode === 'edit' ? modal.file : null;

  const [nom, setNom] = useState(
    existing ? existing.nom : (single ? (modal as { files: File[] }).files[0].name.replace(/\.[^.]+$/, '') : '')
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [tags, setTags] = useState(existing?.tags ?? '');
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? 'internal');
  const [selected, setSelected] = useState<Set<string>>(new Set(existing?.clients ?? []));
  const [clientSearch, setClientSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return clientsList.filter(c =>
      !q || c.titre.toLowerCase().includes(q) || c.codeTiers.toLowerCase().includes(q)
    );
  }, [clientsList, clientSearch]);

  function toggleClient(code: string) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const clients = visibility === 'restricted' ? [...selected] : [];
      if (modal.mode === 'edit') {
        const res = await apiFetch(`/api/ged/${existing!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom, description, tags, visibility, clients }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Échec de l’enregistrement');
      } else {
        for (const file of modal.files) {
          const fd = new FormData();
          fd.append('file', file);
          if (single) fd.append('nom', nom);
          fd.append('description', description);
          fd.append('tags', tags);
          fd.append('visibility', visibility);
          fd.append('clients', JSON.stringify(clients));
          const res = await apiFetch('/api/ged', { method: 'POST', body: fd });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || `Échec de l'upload de ${file.name}`);
        }
      }
      onSaved();
    } catch (e) {
      onError(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  const title = modal.mode === 'edit'
    ? 'Propriétés & partage'
    : (single ? 'Nouveau document' : `Nouveaux documents (${modal.files.length})`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[85vh]"
        style={{ background: 'var(--bg-card, var(--bg))', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>

        <div className="p-4 overflow-auto flex flex-col gap-3 text-xs" style={{ color: 'var(--text)' }}>
          {(single || modal.mode === 'edit') && (
            <label className="flex flex-col gap-1">
              <span style={{ color: 'var(--text-muted)' }}>Nom</span>
              <input
                value={nom}
                onChange={e => setNom(e.target.value)}
                className="rounded px-2 py-1.5"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--text-muted)' }}>Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="rounded px-2 py-1.5 resize-none"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--text-muted)' }}>Tags (séparés par des virgules)</span>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              className="rounded px-2 py-1.5"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span style={{ color: 'var(--text-muted)' }}>Accès</span>
            <div className="flex flex-col gap-1.5">
              {(['internal', 'public', 'restricted'] as Visibility[]).map(v => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
                  <span style={{ color: VIS_META[v].color, fontWeight: 600 }}>{VIS_META[v].label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {v === 'internal' ? '— admins uniquement'
                      : v === 'public' ? '— tous les clients'
                      : '— clients désignés ci-dessous'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {visibility === 'restricted' && (
            <div className="flex flex-col gap-1">
              <span style={{ color: 'var(--text-muted)' }}>Clients autorisés ({selected.size})</span>
              <input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Filtrer les clients…"
                className="rounded px-2 py-1.5 mb-1"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
              <div
                className="rounded overflow-auto"
                style={{ border: '1px solid var(--border)', maxHeight: 180 }}
              >
                {filteredClients.length === 0 && (
                  <p className="px-2 py-2" style={{ color: 'var(--text-muted)' }}>
                    Aucun client (configurez la base CAP Clients dans les Paramètres).
                  </p>
                )}
                {filteredClients.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { if (c.codeTiers) toggleClient(c.codeTiers); }}
                    className="flex items-center gap-2 px-2 py-1.5"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: c.codeTiers ? 'pointer' : 'not-allowed',
                      opacity: c.codeTiers ? 1 : 0.5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.codeTiers)}
                      readOnly
                      disabled={!c.codeTiers}
                      style={{ accentColor: 'var(--accent)', pointerEvents: 'none' }}
                    />
                    <span className="flex-1 truncate">{c.titre || '(sans nom)'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{c.codeTiers || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'var(--border)', color: 'var(--text)' }}
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{ background: 'var(--accent)', color: '#fff', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Enregistrement…' : (modal.mode === 'edit' ? 'Enregistrer' : 'Importer')}
          </button>
        </div>
      </div>
    </div>
  );
}
