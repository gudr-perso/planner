import { useEffect, useMemo, useState } from 'react';
import { load } from '../persistence';
import { fetchProjets } from '../notionService';
import type { ProjetsConfig, ProjetEntry } from '../types';
import { getDemoStore } from '../demoData';
import { useAuth } from '../store/useAuthStore';

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

let _projetsCache: ProjetEntry[] | null = null;
let _projetsCacheKey = '';

interface Props {
  onSelectProjet: (id: string, nom: string, code?: string) => void;
}

export default function ProjetsView({ onSelectProjet }: Props) {
  const { user } = useAuth();
  const [projets, setProjets] = useState<ProjetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{
    col: 'nom' | 'tiers' | 'typeProjet' | 'dateDebut' | 'statut';
    dir: 'asc' | 'desc';
  }>({ col: 'nom', dir: 'asc' });

  useEffect(() => {
    const cfg = load<ProjetsConfig>('projetsConfig', {
      databaseId: '', nomField: 'Name', tiersField: '', typeProjetField: '', dateDebutField: '', statutField: '',
    });
    if (!cfg.databaseId) {
      const demo = getDemoStore();
      if (demo?.projets.length) { _projetsCache = demo.projets; _projetsCacheKey = 'demo'; setProjets(demo.projets); }
      else setError('Configurez la base Projets dans les Paramètres > CAP CONSULTING.');
      return;
    }
    const cacheKey = cfg.databaseId;
    if (_projetsCache && _projetsCacheKey === cacheKey) {
      setProjets(_projetsCache);
      return;
    }
    setLoading(true);
    fetchProjets(cfg, user?.client_code)
      .then(data => {
        _projetsCache = data;
        _projetsCacheKey = cacheKey;
        setProjets(data);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    projets.filter(p =>
      !search ||
      p.nom.toLowerCase().includes(search.toLowerCase()) ||
      p.tiers.toLowerCase().includes(search.toLowerCase()) ||
      p.typeProjet.toLowerCase().includes(search.toLowerCase())
    ), [projets, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = String(a[sort.col] ?? '');
    const vb = String(b[sort.col] ?? '');
    const cmp = va.localeCompare(vb, 'fr');
    return sort.dir === 'asc' ? cmp : -cmp;
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'tiers', label: 'Tiers' },
    { key: 'statut', label: 'Statut' },
    { key: 'typeProjet', label: 'Type de projet' },
    { key: 'dateDebut', label: 'Date de début' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Projets</h1>
        <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
          {!loading && !error ? `${filtered.length} projet(s)` : ''}
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="text-xs rounded px-2 py-1 ml-auto"
          style={{
            background: 'var(--bg-deep)', color: 'var(--text)',
            border: '1px solid var(--border)', width: 180,
          }}
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        )}
        {error && (
          <p className="text-xs" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>
        )}
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
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelectProjet(p.id, p.nom, p.codeProjet)}
                  className="cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--accent)' }}>
                    {p.nom || '(sans nom)'}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{p.tiers}</td>
                  <td className="px-3 py-2">
                    <Badge label={p.statut} color={p.statutColor} />
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{p.typeProjet}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {p.dateDebut
                      ? new Date(p.dateDebut).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun projet trouvé.
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
