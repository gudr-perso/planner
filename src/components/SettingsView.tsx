import { useId, useState } from 'react';
import { fetchDatabaseSchema, syncFromNotion } from '../notionService';
import { save, load } from '../persistence';
import type {
  BriefingConfig,
  DataBundle,
  NotionConfig,
  NotionExtraField,
  NotionFieldMap,
  NotionPropertySchema,
  NotionStatusMapping,
  Status,
} from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';

const DEFAULT_CONFIG: NotionConfig = {
  integrationToken: '',
  databaseId: '',
  fieldMap: { title: '', assignee: '', date: '', project: '', status: '' },
  statusMappings: [],
};

const INTERNAL_STATUSES: Status[] = ['todo', 'in_progress', 'to_process', 'blocked', 'done'];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--accent)' }}>
      {children}
    </h3>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <span className="text-xs w-36 shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

function PropSelect({
  value, onChange, schema, filter, placeholder = 'Sélectionner…',
}: {
  value: string;
  onChange: (v: string) => void;
  schema: NotionPropertySchema[];
  filter?: (p: NotionPropertySchema) => boolean;
  placeholder?: string;
}) {
  const options = filter ? schema.filter(filter) : schema;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex-1 text-xs rounded px-2 py-1.5 outline-none"
      style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      <option value="">{schema.length === 0 ? '(chargez le schéma)' : placeholder}</option>
      {options.map(p => (
        <option key={p.id} value={p.name}>{p.name} ({p.type})</option>
      ))}
    </select>
  );
}

function PropCombo({
  value, onChange, schema, placeholder = 'Sélectionner ou saisir…',
}: {
  value: string;
  onChange: (v: string) => void;
  schema: NotionPropertySchema[];
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={schema.length === 0 ? '(chargez le schéma)' : placeholder}
        className="flex-1 text-xs rounded px-2 py-1.5 outline-none"
        style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
      />
      <datalist id={listId}>
        {schema.map(p => (
          <option key={p.id} value={p.name}>{p.name} ({p.type})</option>
        ))}
      </datalist>
    </>
  );
}

// Like PropCombo but doesn't require flex-1 (used in fixed-width rows)
function ExtraFieldCombo({
  value, onChange, schema,
}: {
  value: string;
  onChange: (v: string) => void;
  schema: NotionPropertySchema[];
}) {
  const listId = useId();
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={schema.length === 0 ? '(chargez le schéma)' : 'Propriété Notion…'}
        className="w-full text-xs rounded px-2 py-1.5 outline-none"
        style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
      />
      <datalist id={listId}>
        {schema.map(p => (
          <option key={p.id} value={p.name}>{p.name} ({p.type})</option>
        ))}
      </datalist>
    </>
  );
}

export function SettingsView({
  onSync,
}: {
  onSync: (data: DataBundle) => void;
}) {
  const [config, setConfig] = useState<NotionConfig>(() =>
    load<NotionConfig>('notionConfig', DEFAULT_CONFIG)
  );
  const [knownPeople, setKnownPeople] = useState<Array<{ id: string; name: string }>>(() =>
    load<Array<{ id: string; name: string }>>('notionPeople', [])
  );
  const [schema, setSchema] = useState<NotionPropertySchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const DEFAULT_BRIEFING: BriefingConfig = { databaseId: '', titleField: '', dateField: '', summaryField: '' };
  const [briefingConfig, setBriefingConfig] = useState<BriefingConfig>(() =>
    load<BriefingConfig>('briefingConfig', DEFAULT_BRIEFING)
  );
  const [briefingSchema, setBriefingSchema] = useState<NotionPropertySchema[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleLoadBriefingSchema = async () => {
    if (!config.integrationToken || !briefingConfig.databaseId) {
      setError('Token d\'intégration et ID base Briefing requis');
      return;
    }
    setBriefingLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, briefingConfig.databaseId);
      setBriefingSchema(props);
      flash(`${props.length} propriétés chargées (Briefing)`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBriefingLoading(false);
    }
  };

  const handleSaveBriefing = () => {
    save('briefingConfig', briefingConfig);
    flash('Configuration Briefing sauvegardée');
  };

  const handleLoadSchema = async () => {
    if (!config.integrationToken || !config.databaseId) {
      setError('Token et ID de base de données requis');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, config.databaseId);
      setSchema(props);
      flash(`${props.length} propriétés chargées`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    save('notionConfig', config);
    flash('Configuration sauvegardée');
  };

  const handleSync = async () => {
    if (!config.integrationToken || !config.databaseId) {
      setError('Configuration incomplète');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await syncFromNotion(config);
      const people = data.people.map(p => ({ id: p.id, name: p.name }));
      save('notionPeople', people);
      setKnownPeople(people);
      save('notionConfig', config);
      const projNames = data.projects.filter(p => p.name !== 'Sans projet').map(p => p.name).join(', ') || '(aucun)';
      flash(`${data.tasks.length} tâches · ${data.projects.length} projets : ${projNames}`);
      setTimeout(() => { onSync(data); }, 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (key: keyof NotionFieldMap, value: string) => {
    if (key === 'status') {
      const prop = schema.find(p => p.name === value);
      const options = prop?.options ?? [];
      setConfig(prev => ({
        ...prev,
        fieldMap: { ...prev.fieldMap, status: value },
        statusMappings: options.map(o => {
          const existing = prev.statusMappings.find(m => m.notionValue === o.name);
          return existing ?? { notionValue: o.name, internalStatus: 'todo' as Status, isUnplanned: false };
        }),
      }));
    } else {
      setConfig(prev => ({ ...prev, fieldMap: { ...prev.fieldMap, [key]: value } }));
    }
  };

  const updateStatusMapping = (i: number, patch: Partial<NotionStatusMapping>) => {
    setConfig(prev => ({
      ...prev,
      statusMappings: prev.statusMappings.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  };

  const hasConfig = !!(config.fieldMap.title || config.fieldMap.status);

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>⚙ Paramètres</h2>
        </div>

        <div className="space-y-8">

          {/* ── Connexion Notion ── */}
          <section>
            <SectionTitle>Connexion Notion</SectionTitle>
            <FieldRow label="Token d'intégration">
              <input
                type="password"
                value={config.integrationToken}
                onChange={e => setConfig(prev => ({ ...prev, integrationToken: e.target.value }))}
                placeholder="secret_xxx…"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <FieldRow label="ID base de données">
              <input
                type="text"
                value={config.databaseId}
                onChange={e => setConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadSchema}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {loading ? '…' : 'Charger le schéma'}
              </button>
              {schema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {schema.length} propriétés</span>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed ml-[calc(9rem+0.75rem)]" style={{ color: 'var(--text-muted)' }}>
              Créez une intégration interne sur{' '}
              <span style={{ color: 'var(--accent)' }}>notion.so/my-integrations</span>,
              partagez votre base de données avec elle, puis collez le token.
            </p>
          </section>

          {/* ── Mapping des champs ── */}
          {(schema.length > 0 || hasConfig) && (
            <section>
              <SectionTitle>Mapping des champs</SectionTitle>
              <FieldRow label="Nom de la tâche">
                <PropSelect value={config.fieldMap.title ?? ''} onChange={v => updateField('title', v)} schema={schema} filter={p => ['title', 'rich_text'].includes(p.type)} />
              </FieldRow>
              <FieldRow label="Affecté à">
                <PropSelect value={config.fieldMap.assignee ?? ''} onChange={v => updateField('assignee', v)} schema={schema} filter={p => ['people', 'multi_select', 'select'].includes(p.type)} />
              </FieldRow>
              <FieldRow label="Date (début / fin)">
                <PropSelect value={config.fieldMap.date ?? ''} onChange={v => updateField('date', v)} schema={schema} filter={p => p.type === 'date'} />
              </FieldRow>
              <FieldRow label="Date de fin (opt.)">
                <PropSelect value={config.fieldMap.endDate ?? ''} onChange={v => updateField('endDate', v)} schema={schema} filter={p => p.type === 'date'} placeholder="(même champ que début)" />
              </FieldRow>
              <FieldRow label="Projet">
                <PropCombo value={config.fieldMap.project ?? ''} onChange={v => updateField('project', v)} schema={schema} />
              </FieldRow>
              <FieldRow label="Sous-projet">
                <PropCombo value={config.fieldMap.subProject ?? ''} onChange={v => updateField('subProject', v)} schema={schema} placeholder="(optionnel)" />
              </FieldRow>
              <FieldRow label="Statut">
                <PropSelect value={config.fieldMap.status ?? ''} onChange={v => updateField('status', v)} schema={schema} filter={p => ['status', 'select', 'multi_select'].includes(p.type)} />
              </FieldRow>
            </section>
          )}

          {/* ── Mapping des statuts ── */}
          {config.statusMappings.length > 0 && (
            <section>
              <SectionTitle>Statuts</SectionTitle>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Associez chaque statut Notion à un statut interne.
                Cochez <strong style={{ color: 'var(--text)' }}>À planifier</strong> pour que ces tâches apparaissent dans le panneau de gauche (sans date).
              </p>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-deep)' }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Statut Notion</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Statut interne</th>
                      <th className="text-center px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>À planifier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.statusMappings.map((m, i) => (
                      <tr key={m.notionValue} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{m.notionValue}</td>
                        <td className="px-3 py-2">
                          <select
                            value={m.internalStatus}
                            onChange={e => updateStatusMapping(i, { internalStatus: e.target.value as Status })}
                            className="text-xs rounded px-2 py-1 outline-none w-36"
                            style={{ background: 'var(--bg-deep)', color: STATUS_COLORS[m.internalStatus], border: '1px solid var(--border)' }}
                          >
                            {INTERNAL_STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={m.isUnplanned}
                            onChange={e => updateStatusMapping(i, { isUnplanned: e.target.checked })}
                            className="cursor-pointer"
                            style={{ accentColor: 'var(--accent)' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Champs additionnels ── */}
          {(schema.length > 0 || (config.extraFields?.length ?? 0) > 0) && (
            <section>
              <SectionTitle>Champs additionnels (fiche tâche)</SectionTitle>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Ces champs s'afficheront dans le popup de détail de chaque tâche.
                Les relations (Partenaires, Contacts…) sont résolues automatiquement.
              </p>
              <div className="space-y-2 mb-3">
                {(config.extraFields ?? []).map((ef, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ef.label}
                      onChange={e => {
                        const next: NotionExtraField[] = [...(config.extraFields ?? [])];
                        next[i] = { ...next[i], label: e.target.value };
                        setConfig(prev => ({ ...prev, extraFields: next }));
                      }}
                      placeholder="Libellé…"
                      className="text-xs rounded px-2 py-1.5 outline-none w-32 shrink-0"
                      style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
                    />
                    <div className="flex-1">
                      <ExtraFieldCombo
                        value={ef.notionField}
                        schema={schema}
                        onChange={v => {
                          const next: NotionExtraField[] = [...(config.extraFields ?? [])];
                          next[i] = { ...next[i], notionField: v };
                          setConfig(prev => ({ ...prev, extraFields: next }));
                        }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const next = (config.extraFields ?? []).filter((_, idx) => idx !== i);
                        setConfig(prev => ({ ...prev, extraFields: next }));
                      }}
                      className="shrink-0 text-sm transition hover:opacity-80"
                      style={{ color: 'var(--color-error)' }}
                      title="Supprimer"
                    >✕</button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  extraFields: [...(prev.extraFields ?? []), { label: '', notionField: '' }],
                }))}
                className="text-xs px-3 py-1.5 rounded transition"
                style={{ background: 'var(--bg-deep)', color: 'var(--accent)', border: '1px solid var(--border)' }}
              >
                + Ajouter un champ
              </button>
            </section>
          )}

          {/* ── Base Briefing ── */}
          <section>
            <SectionTitle>Briefing du matin</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Base Notion séparée pour les briefings. Réutilise le token d'intégration ci-dessus.
            </p>
            <FieldRow label="ID base Briefing">
              <input
                type="text"
                value={briefingConfig.databaseId}
                onChange={e => setBriefingConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadBriefingSchema}
                disabled={briefingLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {briefingLoading ? '…' : 'Charger le schéma'}
              </button>
              {briefingSchema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {briefingSchema.length} propriétés</span>
              )}
            </div>
            {(briefingSchema.length > 0 || briefingConfig.titleField || briefingConfig.dateField || briefingConfig.summaryField) && (
              <>
                <FieldRow label="Champ Nom">
                  <PropCombo value={briefingConfig.titleField} onChange={v => setBriefingConfig(prev => ({ ...prev, titleField: v }))} schema={briefingSchema} />
                </FieldRow>
                <FieldRow label="Champ Date">
                  <PropCombo value={briefingConfig.dateField} onChange={v => setBriefingConfig(prev => ({ ...prev, dateField: v }))} schema={briefingSchema} />
                </FieldRow>
                <FieldRow label="Champ En bref">
                  <PropCombo value={briefingConfig.summaryField} onChange={v => setBriefingConfig(prev => ({ ...prev, summaryField: v }))} schema={briefingSchema} />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSaveBriefing}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
          </section>

          {/* ── Couleurs des personnes ── */}
          {knownPeople.length > 0 && (
            <section>
              <SectionTitle>Couleurs des personnes</SectionTitle>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-deep)' }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Personne</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Couleur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knownPeople.map(p => {
                      const color = config.personColors?.[p.name] ?? '#94a3b8';
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{p.name}</td>
                          <td className="px-3 py-2 flex items-center gap-2">
                            <input
                              type="color"
                              value={color}
                              onChange={e => setConfig(prev => ({
                                ...prev,
                                personColors: { ...prev.personColors, [p.name]: e.target.value },
                              }))}
                              className="w-7 h-7 rounded cursor-pointer border-0"
                              style={{ background: 'none' }}
                            />
                            <span style={{ color }}>{color}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Messages ── */}
          {error && (
            <div className="text-xs rounded px-3 py-2" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--color-error-deep)' }}>
              ⚠ {error}
            </div>
          )}
          {statusMsg && (
            <div className="text-xs rounded px-3 py-2" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-deep)' }}>
              ✓ {statusMsg}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-2 rounded font-medium transition"
              style={{ background: 'var(--border)', color: 'var(--text)' }}
            >
              Sauvegarder
            </button>
            <button
              onClick={handleSync}
              disabled={loading}
              className="text-xs px-4 py-2 rounded font-medium transition disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {loading ? 'Synchronisation…' : 'Synchroniser depuis Notion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
