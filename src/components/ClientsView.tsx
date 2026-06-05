import { useEffect, useMemo, useState } from 'react';
import { load } from '../persistence';
import { fetchClients } from '../notionService';
import type { ClientsConfig, ClientEntry, NotionConfig } from '../types';

let _clientsCache: ClientEntry[] | null = null;
let _clientsCacheKey = '';


function MapsButton({ lieu }: { lieu: string }) {
  if (!lieu) return null;
  return (
    <a
      href={`https://maps.google.com/?q=${encodeURIComponent(lieu)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Ouvrir dans Google Maps"
      className="shrink-0"
      style={{ color: 'var(--accent)', fontSize: '1rem', lineHeight: 1 }}
      onClick={e => e.stopPropagation()}
    >
      📍
    </a>
  );
}

function ListView({ clients }: { clients: ClientEntry[] }) {
  const [sort, setSort] = useState<{ col: 'titre' | 'codeTiers' | 'lieu'; dir: 'asc' | 'desc' }>({ col: 'titre', dir: 'asc' });

  const sorted = useMemo(() => [...clients].sort((a, b) => {
    const v = (a[sort.col] ?? '').localeCompare(b[sort.col] ?? '', 'fr');
    return sort.dir === 'asc' ? v : -v;
  }), [clients, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  const colDefs: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'titre', label: 'Raison sociale' },
    { key: 'codeTiers', label: 'Code tiers' },
    { key: 'lieu', label: 'Lieu' },
  ];

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {colDefs.map(({ key, label }) => (
            <th
              key={key}
              onClick={() => toggleSort(key)}
              className="text-left px-3 py-2 cursor-pointer select-none font-medium"
            >
              {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
          <th className="px-3 py-2 w-8" />
        </tr>
      </thead>
      <tbody>
        {sorted.map(c => (
          <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{c.titre || '(sans nom)'}</td>
            <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{c.codeTiers}</td>
            <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{c.lieu}</td>
            <td className="px-3 py-2 text-center">
              <MapsButton lieu={c.lieu} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardView({ clients }: { clients: ClientEntry[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {clients.map(c => (
        <div
          key={c.id}
          className="rounded-lg p-3 flex flex-col gap-1"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{c.titre || '(sans nom)'}</div>
          {c.codeTiers && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.codeTiers}</div>
          )}
          {c.lieu && (
            <div className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span className="flex-1 truncate">{c.lieu}</span>
              <MapsButton lieu={c.lieu} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ClientsView() {
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() =>
    (localStorage.getItem('clients-view-mode') as 'card' | 'list') ?? 'card'
  );

  useEffect(() => {
    const notionCfg = load<NotionConfig>('notionConfig', {
      integrationToken: '', databaseId: '', fieldMap: {}, statusMappings: [],
    });
    const cfg = load<ClientsConfig>('clientsConfig', {
      databaseId: '', titreField: 'Name', codeTiersField: '', lieuField: '',
    });
    if (!notionCfg.integrationToken || !cfg.databaseId) {
      setError('Configurez la base Clients dans les Paramètres > CAP CONSULTING.');
      return;
    }
    const cacheKey = cfg.databaseId;
    if (_clientsCache && _clientsCacheKey === cacheKey) {
      setClients(_clientsCache);
      return;
    }
    setLoading(true);
    fetchClients(notionCfg.integrationToken, cfg)
      .then(data => {
        _clientsCache = data;
        _clientsCacheKey = cacheKey;
        setClients(data);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    clients.filter(c =>
      !search ||
      c.titre.toLowerCase().includes(search.toLowerCase()) ||
      c.codeTiers.toLowerCase().includes(search.toLowerCase()) ||
      c.lieu.toLowerCase().includes(search.toLowerCase())
    ), [clients, search]);

  function toggleViewMode() {
    const m = viewMode === 'card' ? 'list' : 'card';
    setViewMode(m);
    localStorage.setItem('clients-view-mode', m);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Clients</h1>
        <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
          {!loading && !error ? `${filtered.length} entrée(s)` : ''}
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
        <button
          onClick={toggleViewMode}
          className="text-xs px-3 py-1.5 rounded shrink-0"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
        >
          {viewMode === 'card' ? 'Liste' : 'Cartes'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        )}
        {error && (
          <p className="text-xs" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun client trouvé.</p>
        )}
        {!loading && !error && filtered.length > 0 && viewMode === 'list' && (
          <ListView clients={filtered} />
        )}
        {!loading && !error && filtered.length > 0 && viewMode === 'card' && (
          <CardView clients={filtered} />
        )}
      </div>
    </div>
  );
}
