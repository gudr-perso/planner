import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, useAuth } from '../store/useAuthStore';

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
  created_at?: string;
  snippet?: string | null;
}

const EXT_COLORS: Record<string, string> = {
  pdf: '#ef4444', docx: '#2563eb', pptx: '#ea580c',
  xlsx: '#16a34a', html: '#8b5cf6', htm: '#8b5cf6',
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

function humanSize(n?: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

export default function GedView() {
  const { user } = useAuth();
  const [files, setFiles] = useState<GedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadFiles = useCallback(async (list: FileList | File[]) => {
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await apiFetch('/api/ged', { method: 'POST', body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `Échec de l'upload de ${file.name}`);
      }
      setSearch('');
      loadList();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }, [loadList]);

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
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs rounded px-3 py-1.5 font-medium"
          style={{ background: 'var(--accent)', color: '#fff', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? 'Envoi…' : '+ Ajouter'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.xlsx,.html,.htm"
          className="hidden"
          onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <div
        className="flex-1 overflow-auto p-4"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
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
                    {f.snippet && (
                      <div
                        className="mt-0.5 text-[11px]"
                        style={{ color: 'var(--text-muted)' }}
                        dangerouslySetInnerHTML={{ __html: f.snippet }}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{humanSize(f.taille)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {f.created_at ? new Date(f.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openFile(f, true)} className="px-1.5 hover:underline" style={{ color: 'var(--text-muted)' }} title="Télécharger">⬇</button>
                    {(user?.role === 'admin') && (
                      <button onClick={() => handleDelete(f)} className="px-1.5 hover:underline" style={{ color: 'var(--color-error, #e53e3e)' }} title="Supprimer">🗑</button>
                    )}
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                    {search ? 'Aucun document trouvé.' : 'Aucun document. Glissez-déposez un fichier ou cliquez sur « Ajouter ».'}
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
