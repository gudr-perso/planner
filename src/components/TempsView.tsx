import { useEffect, useMemo, useState } from 'react';
import { load } from '../persistence';
import { fetchTemps } from '../notionService';
import type { NotionConfig, TempsConfig, TempsEntry } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

const NOTION_COLOR: Record<string, { bg: string; fg: string }> = {
  gray:   { bg: '#80808022', fg: '#808080' },
  blue:   { bg: '#0b6e9922', fg: '#0b6e99' },
  green:  { bg: '#0f7b6c22', fg: '#0f7b6c' },
  purple: { bg: '#6940a522', fg: '#6940a5' },
  orange: { bg: '#d9730d22', fg: '#d9730d' },
};

function badgeStyle(color?: string) {
  const c = NOTION_COLOR[color ?? ''];
  return c
    ? { background: c.bg, color: c.fg }
    : { background: 'color-mix(in srgb, var(--text-muted) 12%, transparent)', color: 'var(--text-muted)' };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso.includes(' ') ? iso.replace(' ', 'T') : iso);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function parseH(val: string): number {
  const n = parseFloat(val.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** ISO date string → Monday of that week (Monday-based) */
function mondayOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.includes(' ') ? iso.replace(' ', 'T') : iso);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function isoWeekRange(monday: string): { start: string; end: string } {
  return { start: monday, end: addDays(monday, 6) };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonday(): string {
  return mondayOf(todayIso());
}

function prevMonday(): string {
  return addDays(currentMonday(), -7);
}

function firstDayOfMonth(offset = 0): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toISOString().slice(0, 10);
}

function entryDate(e: TempsEntry): string {
  return (e.start ?? '').slice(0, 10);
}

function sumH(entries: TempsEntry[]): number {
  return entries.reduce((acc, e) => acc + parseH(e.dureeH), 0);
}

function formatHM(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${mm.toString().padStart(2, '0')}`;
}

type SortKey = keyof Pick<TempsEntry, 'title' | 'start' | 'end' | 'dureeH' | 'dureeMin' | 'commentaire'> | 'projets' | 'sousProjets';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ── Onglet Liste ──────────────────────────────────────────────────────────────

function ListView({ entries }: { entries: TempsEntry[] }) {
  const [search, setSearch] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterSousProjet, setFilterSousProjet] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('start');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const allProjets = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => e.projets.forEach(p => s.add(p)));
    return Array.from(s).sort();
  }, [entries]);

  const allSousProjets = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => e.sousProjets.forEach(p => s.add(p)));
    return Array.from(s).sort();
  }, [entries]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let list = entries;
    if (search) list = list.filter(e => e.title.toLowerCase().includes(search.toLowerCase()));
    if (filterProjet) list = list.filter(e => e.projets.includes(filterProjet));
    if (filterSousProjet) list = list.filter(e => e.sousProjets.includes(filterSousProjet));
    if (filterDateFrom) list = list.filter(e => (e.start ?? '') >= filterDateFrom);
    if (filterDateTo) list = list.filter(e => (e.start ?? '') <= filterDateTo + 'T23:59');

    return [...list].sort((a, b) => {
      let va = '', vb = '';
      if (sortKey === 'projets') { va = a.projets[0] ?? ''; vb = b.projets[0] ?? ''; }
      else if (sortKey === 'sousProjets') { va = a.sousProjets[0] ?? ''; vb = b.sousProjets[0] ?? ''; }
      else { va = String(a[sortKey] ?? ''); vb = String(b[sortKey] ?? ''); }
      const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, search, filterProjet, filterSousProjet, filterDateFrom, filterDateTo, sortKey, sortDir]);

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', padding: '6px 10px',
        color: sortKey === col ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11, fontWeight: 600, textAlign: 'left', background: 'var(--bg-deep)',
        borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}
    >
      {label}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const inputStyle = {
    background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
        <input style={{ ...inputStyle, width: 160 }} placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
        <input style={{ ...inputStyle, width: 140 }} type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Date début (depuis)" />
        <input style={{ ...inputStyle, width: 140 }} type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="Date début (jusqu'à)" />
        <select style={{ ...inputStyle, width: 160 }} value={filterProjet} onChange={e => setFilterProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {allProjets.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 160 }} value={filterSousProjet} onChange={e => setFilterSousProjet(e.target.value)}>
          <option value="">Tous les sous-projets</option>
          {allSousProjets.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(search || filterProjet || filterSousProjet || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setSearch(''); setFilterProjet(''); setFilterSousProjet(''); setFilterDateFrom(''); setFilterDateTo(''); }}
            style={{ ...inputStyle, cursor: 'pointer', color: 'var(--text-muted)' }}
          >✕ Effacer</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{filtered.length} entrée{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <SortTh col="title" label="Nom" />
              <SortTh col="start" label="Début" />
              <SortTh col="end" label="Fin" />
              <SortTh col="dureeH" label="Temps [h]" />
              <SortTh col="dureeMin" label="Temps [min]" />
              <SortTh col="commentaire" label="Commentaire" />
              <SortTh col="projets" label="Projets" />
              <SortTh col="sousProjets" label="Sous-projets" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-deep) 40%, transparent)' }}>
                <td style={{ padding: '5px 10px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</td>
                <td style={{ padding: '5px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDateTime(e.start)}</td>
                <td style={{ padding: '5px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDateTime(e.end)}</td>
                <td style={{ padding: '5px 10px', color: 'var(--text)', textAlign: 'right' }}>{e.dureeH || '—'}</td>
                <td style={{ padding: '5px 10px', color: 'var(--text)', textAlign: 'right' }}>{e.dureeMin || '—'}</td>
                <td style={{ padding: '5px 10px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.commentaire || '—'}</td>
                <td style={{ padding: '5px 10px' }}>
                  {e.projets.map(p => (
                    <span key={p} style={{ ...badgeStyle('blue'), fontSize: 10, borderRadius: 4, padding: '1px 6px', marginRight: 3, display: 'inline-block' }}>{p}</span>
                  ))}
                </td>
                <td style={{ padding: '5px 10px' }}>
                  {e.sousProjets.map(p => (
                    <span key={p} style={{ ...badgeStyle('purple'), fontSize: 10, borderRadius: 4, padding: '1px 6px', marginRight: 3, display: 'inline-block' }}>{p}</span>
                  ))}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Aucune entrée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Onglet Statistiques ───────────────────────────────────────────────────────

function StatView({ entries, objectifH }: { entries: TempsEntry[]; objectifH: number }) {
  const curMon = currentMonday();
  const prevMon = prevMonday();
  const curRange = isoWeekRange(curMon);
  const prevRange = isoWeekRange(prevMon);
  const curMonthStart = firstDayOfMonth(0);
  const prevMonthStart = firstDayOfMonth(-1);
  const curMonthEnd = firstDayOfMonth(1);

  const inRange = (e: TempsEntry, from: string, to: string) => {
    const d = entryDate(e);
    return d >= from && d <= to;
  };

  const curWeekEntries = entries.filter(e => inRange(e, curRange.start, curRange.end));
  const prevWeekEntries = entries.filter(e => inRange(e, prevRange.start, prevRange.end));
  const curMonthEntries = entries.filter(e => entryDate(e) >= curMonthStart && entryDate(e) < curMonthEnd);
  const prevMonthEntries = entries.filter(e => entryDate(e) >= prevMonthStart && entryDate(e) < curMonthStart);

  const curWeekH = sumH(curWeekEntries);
  const prevWeekH = sumH(prevWeekEntries);
  const progress = Math.min(100, objectifH > 0 ? (curWeekH / objectifH) * 100 : 0);

  // Temps par jour cette semaine et semaine écoulée
  const dayTotals = (mon: string, weekEntries: TempsEntry[]) =>
    Array.from({ length: 7 }, (_, i) => {
      const dayIso = addDays(mon, i);
      return sumH(weekEntries.filter(e => entryDate(e) === dayIso));
    });

  const curDays = dayTotals(curMon, curWeekEntries);
  const prevDays = dayTotals(prevMon, prevWeekEntries);

  // Temps par projet
  const allProjets = Array.from(new Set(entries.flatMap(e => e.projets))).sort();

  const projTotals = (proj: string, list: TempsEntry[]) =>
    sumH(list.filter(e => e.projets.includes(proj)));

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '16px 20px', marginBottom: 16,
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const bigStyle: React.CSSProperties = { fontSize: 28, fontWeight: 700, color: 'var(--text)' };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: 'var(--bg)' }}>
      {/* Totaux semaine */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
          <div style={labelStyle}>Semaine en cours</div>
          <div style={bigStyle}>{formatHM(curWeekH)}</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
          <div style={labelStyle}>Semaine écoulée</div>
          <div style={bigStyle}>{formatHM(prevWeekH)}</div>
        </div>
        <div style={{ ...cardStyle, flex: 2, minWidth: 260 }}>
          <div style={labelStyle}>Progression / objectif ({objectifH} h)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 6, transition: 'width 400ms',
                width: `${progress}%`,
                background: progress >= 100 ? '#10b981' : progress >= 70 ? '#3b82f6' : '#f97316',
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {formatHM(curWeekH)} / {objectifH} h
            </span>
          </div>
        </div>
      </div>

      {/* Temps par jour */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Temps par jour</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600, width: 120 }}></th>
              {DAYS_FR.map(d => (
                <th key={d} style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>{d}</th>
              ))}
              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Cette semaine', days: curDays, total: curWeekH },
              { label: 'Semaine écoulée', days: prevDays, total: prevWeekH },
            ].map(row => (
              <tr key={row.label}>
                <td style={{ padding: '5px 8px', color: 'var(--text)', fontWeight: 500 }}>{row.label}</td>
                {row.days.map((h, i) => (
                  <td key={i} style={{ textAlign: 'center', padding: '5px 8px', color: h > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                    {h > 0 ? formatHM(h) : '—'}
                  </td>
                ))}
                <td style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 600, color: 'var(--accent)' }}>{formatHM(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Temps par projet */}
      {allProjets.length > 0 && (
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 12 }}>Temps par projet</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Projet</th>
                {['Cette sem.', 'Sem. écoulée', 'Mois en cours', 'Mois précédent'].map(h => (
                  <th key={h} style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allProjets.map((proj, i) => (
                <tr key={proj} style={{ background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-deep) 40%, transparent)' }}>
                  <td style={{ padding: '5px 8px', color: 'var(--text)' }}>{proj}</td>
                  {[curWeekEntries, prevWeekEntries, curMonthEntries, prevMonthEntries].map((list, j) => {
                    const h = projTotals(proj, list);
                    return (
                      <td key={j} style={{ textAlign: 'center', padding: '5px 8px', color: h > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                        {h > 0 ? formatHM(h) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function TempsView() {
  const notionCfg = load<NotionConfig | null>('notionConfig', null);
  const cfg = load<TempsConfig | null>('tempsConfig', null);
  const token = notionCfg?.integrationToken ?? '';

  const [entries, setEntries] = useState<TempsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'liste' | 'statistiques'>('liste');

  useEffect(() => {
    if (!token || !cfg?.databaseId) return;
    setLoading(true);
    setError(null);
    fetchTemps(token, cfg)
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const objectifH = cfg?.objectifHebdoH ?? 39;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    border: 'none', background: 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'color 120ms',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
        <button style={tabStyle(tab === 'liste')} onClick={() => setTab('liste')}>Liste</button>
        <button style={tabStyle(tab === 'statistiques')} onClick={() => setTab('statistiques')}>Statistiques</button>
        {loading && <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--text-dim)' }}>Chargement…</span>}
        {!cfg?.databaseId && <span style={{ marginLeft: 12, fontSize: 11, color: '#f97316' }}>Base non configurée — aller dans Paramètres</span>}
        {error && <span style={{ marginLeft: 12, fontSize: 11, color: '#ef4444' }}>{error}</span>}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'liste' ? (
          <ListView entries={entries} />
        ) : (
          <StatView entries={entries} objectifH={objectifH} />
        )}
      </div>
    </div>
  );
}
