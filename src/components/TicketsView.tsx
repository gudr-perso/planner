import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { load, save } from '../persistence';
import { fetchAssociations, fetchTickets, patchRichTextField } from '../notionService';
import type { AssociationEntry, AssociationsConfig, NotionConfig, TicketEntry, TicketsConfig } from '../types';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';

// ── helpers ───────────────────────────────────────────────────────────────────

const NOTION_COLOR: Record<string, { bg: string; fg: string }> = {
  gray:    { bg: '#80808022', fg: '#808080' },
  brown:   { bg: '#9f6b5322', fg: '#9f6b53' },
  orange:  { bg: '#d9730d22', fg: '#d9730d' },
  yellow:  { bg: '#ca8a0422', fg: '#ca8a04' },
  green:   { bg: '#0f7b6c22', fg: '#0f7b6c' },
  blue:    { bg: '#0b6e9922', fg: '#0b6e99' },
  purple:  { bg: '#6940a522', fg: '#6940a5' },
  pink:    { bg: '#ad1a7222', fg: '#ad1a72' },
  red:     { bg: '#e03e3e22', fg: '#e03e3e' },
};

function colorForStatut(text: string): string {
  const t = text.toLowerCase();
  if (/termin|clos|fait|résolu|done|valid|résolv/.test(t)) return 'green';
  if (/cours|traitement|progress|actif|ouvert|en cours/.test(t)) return 'blue';
  if (/annul|rejet|abandon|refus/.test(t)) return 'gray';
  if (/bloqu|erreur/.test(t)) return 'red';
  if (/attente|pending|suspen/.test(t)) return 'yellow';
  return 'gray';
}

function colorForPriorite(text: string): string {
  const t = text.toLowerCase();
  if (/urgent|critic|haute|élevé|high|p0|p1/.test(t)) return 'red';
  if (/moyen|normal|medium|p2/.test(t)) return 'orange';
  if (/basse|faible|low|mineur|p3|p4/.test(t)) return 'blue';
  return 'gray';
}

function colorForNiveau(text: string): string {
  const t = text.toLowerCase();
  if (/critic/.test(t)) return 'red';
  if (/major|élevé|haut|high/.test(t)) return 'orange';
  if (/minor|faible|bas|low/.test(t)) return 'blue';
  return 'gray';
}

function badge(text: string, color?: string) {
  const key = color ?? '';
  const c = NOTION_COLOR[key];
  const style = c
    ? { background: c.bg, color: c.fg }
    : { background: 'color-mix(in srgb, var(--text-muted) 12%, transparent)', color: 'var(--text-muted)' };
  return (
    <span style={{ ...style, fontSize: 10, borderRadius: 4, padding: '1px 6px', display: 'inline-block', marginRight: 2 }}>
      {text}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso.includes(' ') ? iso.replace(' ', 'T') : iso)
      .toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', fontSize: 12, outline: 'none',
};

const btnStyle = (active?: boolean): React.CSSProperties => ({
  ...inputStyle, cursor: 'pointer',
  background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-deep)',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
});

// ── Modal ticket ──────────────────────────────────────────────────────────────

function TicketModal({
  ticket,
  token,
  memoField,
  onClose,
  onAssocClick,
}: {
  ticket: TicketEntry;
  token: string;
  memoField: string;
  onClose: () => void;
  onAssocClick: (assocId: string, assocName: string) => void;
}) {
  const [memo, setMemo] = useState(ticket.memo);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'ok' | 'error' | null>(null);

  const handleSaveMemo = async () => {
    if (!token || !memoField) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      await patchRichTextField(token, ticket.id, memoField, memo);
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const PropRow = ({ label, value }: { label: string; value: string }) =>
    value ? (
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
        <span style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)', textAlign: 'right' }}>{label}</span>
        <span style={{ color: 'var(--text)' }}>{value}</span>
      </div>
    ) : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
        width: 600, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>Ticket {ticket.ticketId}</div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{ticket.sujet}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <PropRow label="Code Association" value={ticket.codeAssoc} />
        <PropRow label="Statut" value={ticket.statut} />
        <PropRow label="Priorité" value={ticket.priorite} />
        <PropRow label="Niveau" value={ticket.niveau} />
        <PropRow label="Zone" value={ticket.zone} />
        <PropRow label="Date modif." value={formatDate(ticket.dateModif)} />
        <PropRow label="Demandeur" value={ticket.demandeur} />
        <PropRow label="Code dossier" value={ticket.codeDossier} />
        <PropRow label="Catégorie" value={ticket.categorie} />
        <PropRow label="Sous-catégorie" value={ticket.sousCategorie} />
        <PropRow label="Département" value={ticket.departement} />
        <PropRow label="Conclusion" value={ticket.conclusion} />

        {ticket.lien && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)', textAlign: 'right' }}>Lien</span>
            <a href={ticket.lien} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{ticket.lien}</a>
          </div>
        )}

        {ticket.associationId && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, alignItems: 'center' }}>
            <span style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)', textAlign: 'right' }}>Association</span>
            <button
              onClick={() => { onClose(); onAssocClick(ticket.associationId, ticket.associationName); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, fontSize: 12, textDecoration: 'underline' }}
            >
              {ticket.associationName || ticket.associationId}
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Mémo</div>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={4}
            style={{ width: '100%', ...inputStyle, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button
              onClick={handleSaveMemo}
              disabled={saving}
              style={{ ...btnStyle(), color: 'var(--accent)', border: '1px solid var(--accent)', padding: '5px 14px', fontWeight: 600 }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {saveStatus === 'ok' && <span style={{ fontSize: 11, color: '#10b981' }}>✓ Sauvegardé</span>}
            {saveStatus === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>Erreur lors de la sauvegarde</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ligne ticket ─────────────────────────────────────────────────────────────

function TicketRow({ e, i, onOpen }: { e: TicketEntry; i: number; onOpen: (t: TicketEntry) => void }) {
  const num = e.ticketId.replace(/^[A-Za-z]+-/, '');
  return (
    <tr
      onDoubleClick={() => onOpen(e)}
      style={{ background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-deep) 40%, transparent)', cursor: 'default' }}
      title="Double-cliquez pour le détail"
    >
      <td style={{ padding: '5px 10px', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.ticketId || '—'}</td>
      <td style={{ padding: '5px 10px', color: 'var(--text)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sujet}</td>
      <td style={{ padding: '5px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{e.codeAssoc || '—'}</td>
      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{e.statut ? badge(e.statut, colorForStatut(e.statut)) : '—'}</td>
      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{e.priorite ? badge(e.priorite, colorForPriorite(e.priorite)) : '—'}</td>
      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{e.niveau ? badge(e.niveau, colorForNiveau(e.niveau)) : '—'}</td>
      <td style={{ padding: '5px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(e.dateModif)}</td>
      <td style={{ padding: '5px 10px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.demandeur || '—'}</td>
      <td style={{ padding: '5px 10px' }}>
        {e.ticketId
          ? <a href={`https://cuma.freshservice.com/a/tickets/${num}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 11 }} onClick={ev => ev.stopPropagation()}>↗ Ouvrir</a>
          : '—'}
      </td>
      <td style={{ padding: '5px 10px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.memo || '—'}</td>
    </tr>
  );
}

// ── Onglet Tickets ────────────────────────────────────────────────────────────

type TicketSortKey = keyof Pick<TicketEntry, 'ticketId' | 'sujet' | 'codeAssoc' | 'statut' | 'priorite' | 'niveau' | 'dateModif' | 'demandeur' | 'zone' | 'memo'>;

function TicketsTab({
  token,
  cfg,
  onAssocClick,
}: {
  token: string;
  cfg: TicketsConfig;
  onAssocClick: (id: string, name: string) => void;
}) {
  const [entries, setEntries] = useState<TicketEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTermines, setShowTermines] = useState(() => load<boolean>('tickets-show-termines', false));
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [filterNiveau, setFilterNiveau] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterCodeDossier, setFilterCodeDossier] = useState('');
  const [sortKey, setSortKey] = useState<TicketSortKey>('ticketId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [subTab, setSubTab] = useState<'all' | 'noassoc' | 'arepondu' | 'zoneneo' | 'prb' | 'sf' | 'chn'>('all');
  const [groupByAssoc, setGroupByAssoc] = useState(true);
  const [modalTicket, setModalTicket] = useState<TicketEntry | null>(null);

  const load_ = useCallback((inclTermines: boolean) => {
    setLoading(true);
    setError(null);
    fetchTickets(token, cfg, inclTermines)
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, cfg]);

  useEffect(() => { load_(showTermines); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTermines = () => {
    const next = !showTermines;
    setShowTermines(next);
    save('tickets-show-termines', next);
    load_(next);
  };

  const allStatuts = useMemo(() => Array.from(new Set(entries.map(e => e.statut).filter(Boolean))).sort(), [entries]);
  const allPriorites = useMemo(() => Array.from(new Set(entries.map(e => e.priorite).filter(Boolean))).sort(), [entries]);
  const allNiveaux = useMemo(() => Array.from(new Set(entries.map(e => e.niveau).filter(Boolean))).sort(), [entries]);
  const allZones = useMemo(() => Array.from(new Set(entries.map(e => e.zone).filter(Boolean))).sort(), [entries]);

  const toggleSort = (key: TicketSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let list = entries;
    const q = search.toLowerCase();
    if (q) list = list.filter(e => e.ticketId.toLowerCase().includes(q) || e.sujet.toLowerCase().includes(q));
    if (filterStatut) list = list.filter(e => e.statut.includes(filterStatut));
    if (filterPriorite) list = list.filter(e => e.priorite.includes(filterPriorite));
    if (filterNiveau) list = list.filter(e => e.niveau.includes(filterNiveau));
    if (filterZone) list = list.filter(e => e.zone.includes(filterZone));
    if (filterCodeDossier) list = list.filter(e => e.codeDossier.toLowerCase().includes(filterCodeDossier.toLowerCase()));
    if (subTab === 'noassoc') list = list.filter(e => !e.codeAssoc);
    else if (subTab === 'arepondu') list = list.filter(e => e.statut.toLowerCase().includes('a répondu') || e.statut.toLowerCase().includes('répondu'));
    else if (subTab === 'zoneneo') list = list.filter(e => !!e.zone);
    else if (subTab === 'prb') list = list.filter(e => e.codeAssoc.toUpperCase().startsWith('PRB'));
    else if (subTab === 'sf') list = list.filter(e => e.codeAssoc.toUpperCase().startsWith('SF'));
    else if (subTab === 'chn') list = list.filter(e => e.codeAssoc.toUpperCase().startsWith('CHN'));
    return [...list].sort((a, b) => {
      const va = String(a[sortKey] ?? '');
      const vb = String(b[sortKey] ?? '');
      const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, search, filterStatut, filterPriorite, filterNiveau, filterZone, filterCodeDossier, sortKey, sortDir, subTab]);

  const isGroupable = subTab === 'prb' || subTab === 'sf' || subTab === 'chn';

  const grouped = useMemo(() => {
    if (!isGroupable || !groupByAssoc) return null;
    const map = new Map<string, TicketEntry[]>();
    for (const e of filtered) {
      const key = e.codeAssoc || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [filtered, isGroupable, groupByAssoc]);

  const SortTh = ({ col, label, align = 'left' }: { col: TicketSortKey; label: string; align?: string }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', padding: '6px 10px',
        color: sortKey === col ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11, fontWeight: 600, textAlign: align as 'left' | 'right',
        background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0,
      }}
    >
      {label}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const subTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
    border: 'none', background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 6, transition: 'color 120ms',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Sous-onglets */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
        <button style={subTabStyle(subTab === 'all')} onClick={() => setSubTab('all')}>Tous</button>
        <button style={subTabStyle(subTab === 'noassoc')} onClick={() => setSubTab('noassoc')}>Sans code assoc.</button>
        <button style={subTabStyle(subTab === 'arepondu')} onClick={() => setSubTab('arepondu')}>A répondu</button>
        <button style={subTabStyle(subTab === 'zoneneo')} onClick={() => setSubTab('zoneneo')}>Zone Néo</button>
        <button style={subTabStyle(subTab === 'prb')} onClick={() => setSubTab('prb')}>Problèmes</button>
        <button style={subTabStyle(subTab === 'sf')} onClick={() => setSubTab('sf')}>Correctifs</button>
        <button style={subTabStyle(subTab === 'chn')} onClick={() => setSubTab('chn')}>Changements</button>
      </div>
      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
        <input style={{ ...inputStyle, width: 160 }} placeholder="ID / Sujet…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inputStyle, width: 140 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="">Statut</option>{allStatuts.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 140 }} value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)}>
          <option value="">Priorité</option>{allPriorites.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 140 }} value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)}>
          <option value="">Niveau</option>{allNiveaux.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 140 }} value={filterZone} onChange={e => setFilterZone(e.target.value)}>
          <option value="">Zone</option>{allZones.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <input style={{ ...inputStyle, width: 140 }} placeholder="Code dossier…" value={filterCodeDossier} onChange={e => setFilterCodeDossier(e.target.value)} />
        {isGroupable && (
          <button onClick={() => setGroupByAssoc(v => !v)} style={btnStyle(groupByAssoc)} title="Regrouper par code association">
            ⊞ Regrouper
          </button>
        )}
        <button onClick={toggleTermines} style={btnStyle(showTermines)} title="Inclure les tickets terminés">
          {showTermines ? '🔓' : '🔒'} Terminés
        </button>
        {loading && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Chargement…</span>}
        {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <SortTh col="ticketId" label="ID" />
              <SortTh col="sujet" label="Sujet" />
              <SortTh col="codeAssoc" label="Code Asso." />
              <SortTh col="statut" label="Statut" />
              <SortTh col="priorite" label="Priorité" />
              <SortTh col="niveau" label="Niveau" />
              <SortTh col="dateModif" label="Modif." />
              <SortTh col="demandeur" label="Demandeur" />
              <th style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>Lien</th>
              <SortTh col="memo" label="Mémo" />
            </tr>
          </thead>
          <tbody>
            {grouped
              ? grouped.map(([code, rows]) => (
                  <>
                    <tr key={`grp-${code}`}>
                      <td colSpan={10} style={{
                        padding: '6px 10px', fontWeight: 700, fontSize: 11,
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        color: 'var(--accent)', borderTop: '1px solid var(--border)',
                        position: 'sticky', top: 33,
                      }}>
                        {code} <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>{rows.length} ticket{rows.length !== 1 ? 's' : ''}</span>
                      </td>
                    </tr>
                    {rows.map((e, i) => <TicketRow key={e.id} e={e} i={i} onOpen={setModalTicket} />)}
                  </>
                ))
              : filtered.map((e, i) => <TicketRow key={e.id} e={e} i={i} onOpen={setModalTicket} />)
            }
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Aucun ticket</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalTicket && (
        <TicketModal
          ticket={modalTicket}
          token={token}
          memoField={cfg.memoField}
          onClose={() => setModalTicket(null)}
          onAssocClick={onAssocClick}
        />
      )}
    </div>
  );
}

// ── Onglet Associations ───────────────────────────────────────────────────────

type AssocSortKey = keyof Pick<AssociationEntry, 'nom' | 'code' | 'statut' | 'priorite' | 'solution' | 'suivi'>;

function AssociationsTab({
  token,
  cfg,
  initialFilterName,
}: {
  token: string;
  cfg: AssociationsConfig;
  initialFilterName?: string;
}) {
  const [entries, setEntries] = useState<AssociationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTermines, setShowTermines] = useState(() => load<boolean>('assoc-show-termines', false));
  const [search, setSearch] = useState(initialFilterName ?? '');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [sortKey, setSortKey] = useState<AssocSortKey>('nom');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editSolution, setEditSolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'ok' | 'error' | null>(null);

  const { width: panelWidth, containerRef, onMouseDown: onPanelResize } =
    useResizableRightPanel('assocDetailWidth', 420);

  const load_ = useCallback((inclTermines: boolean) => {
    setLoading(true);
    setError(null);
    fetchAssociations(token, cfg, inclTermines)
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, cfg]);

  useEffect(() => { load_(showTermines); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mise à jour du filtre si on arrive depuis l'onglet Tickets
  const prevFilterName = useRef(initialFilterName);
  useEffect(() => {
    if (initialFilterName && initialFilterName !== prevFilterName.current) {
      setSearch(initialFilterName);
      prevFilterName.current = initialFilterName;
    }
  }, [initialFilterName]);

  const toggleTermines = () => {
    const next = !showTermines;
    setShowTermines(next);
    save('assoc-show-termines', next);
    load_(next);
  };

  const selectedEntry = useMemo(() => entries.find(e => e.id === selectedId) ?? null, [entries, selectedId]);

  const allStatuts = useMemo(() => Array.from(new Set(entries.map(e => e.statut).filter(Boolean))).sort(), [entries]);
  const allPriorites = useMemo(() => Array.from(new Set(entries.map(e => e.priorite).filter(Boolean))).sort(), [entries]);

  const toggleSort = (key: AssocSortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let list = entries;
    const q = search.toLowerCase();
    if (q) list = list.filter(e => e.nom.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
    if (filterStatut) list = list.filter(e => e.statut === filterStatut);
    if (filterPriorite) list = list.filter(e => e.priorite.includes(filterPriorite));
    return [...list].sort((a, b) => {
      const va = String(a[sortKey] ?? '');
      const vb = String(b[sortKey] ?? '');
      const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, search, filterStatut, filterPriorite, sortKey, sortDir]);

  const handleSelect = (e: AssociationEntry) => {
    setSelectedId(e.id);
    setEditSolution(e.solution);
    setSaveStatus(null);
  };

  const handleSaveSolution = async () => {
    if (!selectedEntry || !token || !cfg.solutionField) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      await patchRichTextField(token, selectedEntry.id, cfg.solutionField, editSolution);
      setEntries(prev => prev.map(e => e.id === selectedEntry.id ? { ...e, solution: editSolution } : e));
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const SortTh = ({ col, label }: { col: AssocSortKey; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', padding: '6px 10px',
        color: sortKey === col ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11, fontWeight: 600, textAlign: 'left',
        background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0,
      }}
    >
      {label}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div ref={containerRef} style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Filtres */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
          <input style={{ ...inputStyle, width: 180 }} placeholder="Nom / Code…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...inputStyle, width: 140 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Statut</option>{allStatuts.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select style={{ ...inputStyle, width: 140 }} value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)}>
            <option value="">Priorité</option>{allPriorites.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <button onClick={toggleTermines} style={btnStyle(showTermines)} title="Inclure les terminées">
            {showTermines ? '🔓' : '🔒'} Terminées
          </button>
          {loading && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Chargement…</span>}
          {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{filtered.length} association{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <SortTh col="nom" label="Nom" />
                <SortTh col="code" label="Code" />
                <SortTh col="statut" label="Statut" />
                <SortTh col="priorite" label="Priorité" />
                <SortTh col="solution" label="Solution de contournement" />
                <SortTh col="suivi" label="Suivi" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr
                  key={e.id}
                  onDoubleClick={() => handleSelect(e)}
                  style={{
                    background: selectedId === e.id
                      ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                      : i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-deep) 40%, transparent)',
                    cursor: 'default',
                  }}
                  title="Double-cliquez pour le détail"
                >
                  <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500 }}>{e.nom}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{e.code || '—'}</td>
                  <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{e.statut ? badge(e.statut, colorForStatut(e.statut)) : '—'}</td>
                  <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{e.priorite ? badge(e.priorite, colorForPriorite(e.priorite)) : '—'}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.solution || '—'}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.suivi || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Aucune association</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resize handle */}
      {selectedId && selectedEntry && (
        <div
          onMouseDown={onPanelResize}
          style={{ width: 4, cursor: 'col-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 120ms' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
        />
      )}

      {/* Panel droit */}
      {selectedId && selectedEntry && (
        <div style={{ width: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border)', background: 'var(--bg)' }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 2 }}>{selectedEntry.code}</div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selectedEntry.nom}</h3>
            </div>
            <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {/* Propriétés */}
          <div style={{ padding: '12px 16px', flex: 1, overflow: 'auto' }}>
            {[
              { label: 'Statut', value: selectedEntry.statut, color: colorForStatut(selectedEntry.statut) },
              { label: 'Priorité', value: selectedEntry.priorite, color: colorForPriorite(selectedEntry.priorite) },
            ].filter(r => r.value).map(r => (
              <div key={r.label} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12 }}>
                <span style={{ width: 80, flexShrink: 0, color: 'var(--text-muted)', textAlign: 'right' }}>{r.label}</span>
                <span>{badge(r.value, r.color)}</span>
              </div>
            ))}

            {/* Solution de contournement éditable */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Solution de contournement</div>
              <textarea
                value={editSolution}
                onChange={e => setEditSolution(e.target.value)}
                rows={5}
                style={{ width: '100%', ...inputStyle, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button
                  onClick={handleSaveSolution}
                  disabled={saving}
                  style={{ ...btnStyle(), color: 'var(--accent)', border: '1px solid var(--accent)', padding: '5px 14px', fontWeight: 600 }}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {saveStatus === 'ok' && <span style={{ fontSize: 11, color: '#10b981' }}>✓ Sauvegardé</span>}
                {saveStatus === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>Erreur</span>}
              </div>
            </div>

            {/* Bouton Suivi */}
            {selectedEntry.suivi && (
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={() => window.open(selectedEntry.suivi, '_blank')}
                  style={{ ...btnStyle(), color: 'var(--accent)', border: '1px solid var(--accent)', padding: '6px 14px', fontWeight: 600, width: '100%' }}
                >
                  ↗ Voir les tickets
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export function TicketsView() {
  const notionCfg = load<NotionConfig | null>('notionConfig', null);
  const ticketsCfg = load<TicketsConfig | null>('ticketsConfig', null);
  const assocCfg = load<AssociationsConfig | null>('associationsConfig', null);
  const token = notionCfg?.integrationToken ?? '';

  const [tab, setTab] = useState<'tickets' | 'associations'>('tickets');
  const [assocFilter, setAssocFilter] = useState<string>('');

  const handleAssocClick = (assocId: string, assocName: string) => {
    setAssocFilter(assocName || assocId);
    setTab('associations');
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    border: 'none', background: 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'color 120ms',
  });

  const notConfigured = !ticketsCfg?.databaseId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header tabs */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-deep)', flexShrink: 0 }}>
        <button style={tabStyle(tab === 'tickets')} onClick={() => setTab('tickets')}>Tickets</button>
        <button style={tabStyle(tab === 'associations')} onClick={() => setTab('associations')}>Association</button>
        {notConfigured && <span style={{ marginLeft: 12, fontSize: 11, color: '#f97316' }}>Base Tickets non configurée — aller dans Paramètres</span>}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
        {tab === 'tickets' ? (
          ticketsCfg ? (
            <TicketsTab token={token} cfg={ticketsCfg} onAssocClick={handleAssocClick} />
          ) : (
            <div style={{ padding: 40, color: 'var(--text-dim)', textAlign: 'center' }}>Configurez la base Tickets dans Paramètres</div>
          )
        ) : (
          assocCfg ? (
            <AssociationsTab token={token} cfg={assocCfg} initialFilterName={assocFilter} />
          ) : (
            <div style={{ padding: 40, color: 'var(--text-dim)', textAlign: 'center' }}>Configurez la base Associations dans Paramètres</div>
          )
        )}
      </div>
    </div>
  );
}
