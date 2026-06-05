import { useEffect, useMemo, useState } from 'react';
import { load } from '../persistence';
import { fetchTaches } from '../notionService';
import type { NotionConfig, TacheEntry, TachesConfig } from '../types';

interface Props {
  projetId: string;
  projetNom: string;
  onBack: () => void;
}

export default function ProjetDetailView({ projetId, projetNom, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'taches'>('taches');

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
        <button
          onClick={() => setActiveTab('taches')}
          className="text-xs px-4 py-2 font-medium transition"
          style={{
            color: activeTab === 'taches' ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: activeTab === 'taches' ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          Tâches
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'taches' && <TachesTab projetId={projetId} />}
      </div>
    </div>
  );
}

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

function TachesTab({ projetId }: { projetId: string }) {
  const [taches, setTaches] = useState<TacheEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{
    col: 'nom' | 'canal' | 'statut' | 'priorite' | 'dateEcheance' | 'planifieLe';
    dir: 'asc' | 'desc';
  }>({ col: 'nom', dir: 'asc' });

  const config = load<TachesConfig>('tachesConfig', {
    databaseId: '', nomField: 'Name', canalField: '', statutField: '',
    prioriteField: '', dateEcheanceField: '', planifieLeField: '',
    projetField: '', statutTermineValue: 'Terminé',
  });

  useEffect(() => {
    const notionCfg = load<NotionConfig>('notionConfig', {
      integrationToken: '', databaseId: '', fieldMap: {}, statusMappings: [],
    });
    if (!notionCfg.integrationToken || !config.databaseId) {
      setError('Configurez la base Tâches dans les Paramètres > CAP CONSULTING.');
      return;
    }
    setLoading(true);
    fetchTaches(notionCfg.integrationToken, config, projetId)
      .then(setTaches)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() =>
    showTermine
      ? taches
      : taches.filter(t => t.statut !== config.statutTermineValue),
    [taches, showTermine, config.statutTermineValue]
  );

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
    { key: 'canal', label: 'Canal' },
    { key: 'statut', label: 'Statut' },
    { key: 'priorite', label: 'Priorité' },
    { key: 'dateEcheance', label: 'Échéance' },
    { key: 'planifieLe', label: 'Planifié le' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Barre d'outils tâches */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} tâche{filtered.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowTermine(v => !v)}
          className="text-xs px-3 py-1.5 rounded ml-auto"
          style={{
            background: showTermine ? 'var(--accent)' : 'var(--border)',
            color: showTermine ? 'var(--accent-fg)' : 'var(--text)',
          }}
        >
          {showTermine ? 'Masquer Terminé' : 'Afficher Terminé'}
        </button>
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
              {sorted.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    {t.nom || '(sans nom)'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge label={t.canal} color={t.canalColor} />
                  </td>
                  <td className="px-3 py-2">
                    <Badge label={t.statut} color={t.statutColor} />
                  </td>
                  <td className="px-3 py-2">
                    <Badge label={t.priorite} color={t.prioriteColor} />
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {t.dateEcheance
                      ? new Date(t.dateEcheance).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {t.planifieLe
                      ? new Date(t.planifieLe).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
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
