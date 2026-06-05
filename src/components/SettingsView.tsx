import React, { useEffect, useId, useRef, useState } from 'react';
import { fetchDatabaseSchema, syncFromNotion } from '../notionService';
import { save, load } from '../persistence';
import { downloadConfig, importConfig, uploadConfigToCloud, downloadConfigFromCloud, fetchCloudConfigMeta } from '../configIO';
import type {
  AssociationsConfig,
  BriefingConfig,
  ClientsConfig,
  DataBundle,
  NotionConfig,
  NotionExtraField,
  NotionFieldMap,
  NotionPropertySchema,
  NotionStatusMapping,
  PartenairesConfig,
  PostItsConfig,
  ProjetsConfig,
  Status,
  SuivisConfig,
  TachesConfig,
  TempsConfig,
  TicketsConfig,
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

// ── CAP CONSULTING config sections ───────────────────────────────────────────

function CapClientsSection({ token, clientsConfig, setClientsConfig }: {
  token: string;
  clientsConfig: ClientsConfig;
  setClientsConfig: React.Dispatch<React.SetStateAction<ClientsConfig>>;
}) {
  const [schema, setSchema] = useState<NotionPropertySchema[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSchema() {
    if (!token || !clientsConfig.databaseId) return;
    setLoading(true);
    try {
      const s = await fetchDatabaseSchema(token, clientsConfig.databaseId);
      setSchema(s);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <SectionTitle>Base Clients</SectionTitle>
      <FieldRow label="Database ID">
        <input
          className="flex-1 text-xs rounded px-2 py-1.5 font-mono"
          style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
          value={clientsConfig.databaseId}
          onChange={e => setClientsConfig(p => ({ ...p, databaseId: e.target.value }))}
          placeholder="ID de la base Clients Notion"
        />
        <button
          onClick={loadSchema}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
        >
          {loading ? '…' : 'Charger'}
        </button>
      </FieldRow>
      <FieldRow label="Raison sociale">
        <PropSelect value={clientsConfig.titreField} onChange={v => setClientsConfig(p => ({ ...p, titreField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Code tiers">
        <PropSelect value={clientsConfig.codeTiersField} onChange={v => setClientsConfig(p => ({ ...p, codeTiersField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Lieu">
        <PropSelect value={clientsConfig.lieuField} onChange={v => setClientsConfig(p => ({ ...p, lieuField: v }))} schema={schema} />
      </FieldRow>
    </section>
  );
}

function CapProjetsSection({ token, projetsConfig, setProjetsConfig }: {
  token: string;
  projetsConfig: ProjetsConfig;
  setProjetsConfig: React.Dispatch<React.SetStateAction<ProjetsConfig>>;
}) {
  const [schema, setSchema] = useState<NotionPropertySchema[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSchema() {
    if (!token || !projetsConfig.databaseId) return;
    setLoading(true);
    try {
      const s = await fetchDatabaseSchema(token, projetsConfig.databaseId);
      setSchema(s);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <SectionTitle>Base Projets</SectionTitle>
      <FieldRow label="Database ID">
        <input
          className="flex-1 text-xs rounded px-2 py-1.5 font-mono"
          style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
          value={projetsConfig.databaseId}
          onChange={e => setProjetsConfig(p => ({ ...p, databaseId: e.target.value }))}
          placeholder="ID de la base Projets Notion"
        />
        <button
          onClick={loadSchema}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
        >
          {loading ? '…' : 'Charger'}
        </button>
      </FieldRow>
      <FieldRow label="Nom">
        <PropCombo value={projetsConfig.nomField} onChange={v => setProjetsConfig(p => ({ ...p, nomField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Tiers (relation)">
        <PropCombo value={projetsConfig.tiersField} onChange={v => setProjetsConfig(p => ({ ...p, tiersField: v }))} schema={schema} placeholder="Nom exact du champ relation…" />
      </FieldRow>
      <FieldRow label="Type de projet">
        <PropCombo value={projetsConfig.typeProjetField} onChange={v => setProjetsConfig(p => ({ ...p, typeProjetField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Date de début">
        <PropCombo value={projetsConfig.dateDebutField} onChange={v => setProjetsConfig(p => ({ ...p, dateDebutField: v }))} schema={schema} />
      </FieldRow>
    </section>
  );
}

function CapTachesSection({ token, tachesConfig, setTachesConfig }: {
  token: string;
  tachesConfig: TachesConfig;
  setTachesConfig: React.Dispatch<React.SetStateAction<TachesConfig>>;
}) {
  const [schema, setSchema] = useState<NotionPropertySchema[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSchema() {
    if (!token || !tachesConfig.databaseId) return;
    setLoading(true);
    try {
      const s = await fetchDatabaseSchema(token, tachesConfig.databaseId);
      setSchema(s);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <SectionTitle>Base Tâches</SectionTitle>
      <FieldRow label="Database ID">
        <input
          className="flex-1 text-xs rounded px-2 py-1.5 font-mono"
          style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
          value={tachesConfig.databaseId}
          onChange={e => setTachesConfig(p => ({ ...p, databaseId: e.target.value }))}
          placeholder="ID de la base Tâches Notion"
        />
        <button
          onClick={loadSchema}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
        >
          {loading ? '…' : 'Charger'}
        </button>
      </FieldRow>
      <FieldRow label="Nom">
        <PropSelect value={tachesConfig.nomField} onChange={v => setTachesConfig(p => ({ ...p, nomField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Canal">
        <PropSelect value={tachesConfig.canalField} onChange={v => setTachesConfig(p => ({ ...p, canalField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Statut">
        <PropSelect value={tachesConfig.statutField} onChange={v => setTachesConfig(p => ({ ...p, statutField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Priorité">
        <PropSelect value={tachesConfig.prioriteField} onChange={v => setTachesConfig(p => ({ ...p, prioriteField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Date d'échéance">
        <PropSelect value={tachesConfig.dateEcheanceField} onChange={v => setTachesConfig(p => ({ ...p, dateEcheanceField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Planifié le">
        <PropSelect value={tachesConfig.planifieLeField} onChange={v => setTachesConfig(p => ({ ...p, planifieLeField: v }))} schema={schema} />
      </FieldRow>
      <FieldRow label="Projet (relation)">
        <PropCombo value={tachesConfig.projetField} onChange={v => setTachesConfig(p => ({ ...p, projetField: v }))} schema={schema} placeholder="Nom exact du champ relation…" />
      </FieldRow>
      <FieldRow label="Valeur Terminé">
        <input
          className="flex-1 text-xs rounded px-2 py-1.5"
          style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
          value={tachesConfig.statutTermineValue}
          onChange={e => setTachesConfig(p => ({ ...p, statutTermineValue: e.target.value }))}
          placeholder="Terminé"
        />
      </FieldRow>
    </section>
  );
}

export function SettingsView({
  onSync,
  onGcalClientIdSave,
}: {
  onSync: (data: DataBundle) => void;
  onGcalClientIdSave?: (id: string) => void;
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
  const [gcalClientId, setGcalClientId] = useState<string>(() => load<string>('gcalClientId', ''));

  const [briefingConfig, setBriefingConfig] = useState<BriefingConfig>(() =>
    load<BriefingConfig>('briefingConfig', DEFAULT_BRIEFING)
  );
  const [briefingSchema, setBriefingSchema] = useState<NotionPropertySchema[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const DEFAULT_PARTENAIRES: PartenairesConfig = { databaseId: '', titleField: '', shortCodeField: '', etatSuivisField: '', typeField: '' };
  const [partenairesConfig, setPartenairesConfig] = useState<PartenairesConfig>(() =>
    load<PartenairesConfig>('partenairesConfig', DEFAULT_PARTENAIRES)
  );
  const [partenairesSchema, setPartenairesSchema] = useState<NotionPropertySchema[]>([]);
  const [partenairesLoading, setPartenairesLoading] = useState(false);

  const DEFAULT_SUIVIS: SuivisConfig = { databaseId: '', titleField: '', suivisField: '', projetsField: '', partenairesField: '', contactField: '' };
  const [suivisConfig, setSuivisConfig] = useState<SuivisConfig>(() =>
    load<SuivisConfig>('suivisConfig', DEFAULT_SUIVIS)
  );
  const [suivisSchema, setSuivisSchema] = useState<NotionPropertySchema[]>([]);
  const [suivisLoading, setSuivisLoading] = useState(false);

  const DEFAULT_TEMPS: TempsConfig = { databaseId: '', titleField: '', startField: '', endField: '', dureeHField: '', dureeMinField: '', commentaireField: '', projetsField: '', sousProjetField: '', objectifHebdoH: 39 };
  const [tempsConfig, setTempsConfig] = useState<TempsConfig>(() =>
    load<TempsConfig>('tempsConfig', DEFAULT_TEMPS)
  );
  const [tempsSchema, setTempsSchema] = useState<NotionPropertySchema[]>([]);
  const [tempsLoading, setTempsLoading] = useState(false);

  const DEFAULT_TICKETS: TicketsConfig = { databaseId: '', ticketIdField: '', sujetField: '', codeAssocField: '', statutField: '', prioriteField: '', niveauField: '', dateModifField: '', demandeurField: '', lienField: '', zoneField: '', memoField: '', codeDossierField: '', categorieField: '', sousCategorieField: '', conclusionField: '', departementField: '', associationField: '', statutsTerminesValues: [] };
  const [ticketsConfig, setTicketsConfig] = useState<TicketsConfig>(() =>
    load<TicketsConfig>('ticketsConfig', DEFAULT_TICKETS)
  );
  const [ticketsSchema, setTicketsSchema] = useState<NotionPropertySchema[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const DEFAULT_ASSOCIATIONS: AssociationsConfig = { databaseId: '', nomField: '', codeField: '', statutField: '', prioriteField: '', solutionField: '', suiviField: '', statutsTerminesValues: [] };
  const [assocConfig, setAssocConfig] = useState<AssociationsConfig>(() =>
    load<AssociationsConfig>('associationsConfig', DEFAULT_ASSOCIATIONS)
  );
  const [assocSchema, setAssocSchema] = useState<NotionPropertySchema[]>([]);
  const [assocLoading, setAssocLoading] = useState(false);

  const DEFAULT_POSTITS: PostItsConfig = { databaseId: '', titleField: '', createdTimeField: '', dueDateField: '', statusField: '' };
  const [postitsConfig, setPostitsConfig] = useState<PostItsConfig>(() =>
    load<PostItsConfig>('postitsConfig', DEFAULT_POSTITS)
  );
  const [postitsSchema, setPostitsSchema] = useState<NotionPropertySchema[]>([]);
  const [postitsLoading, setPostitsLoading] = useState(false);

  const [tab, setTab] = useState<'cuma' | 'cap'>('cuma');

  const [clientsConfig, setClientsConfig] = useState<ClientsConfig>(() =>
    load<ClientsConfig>('clientsConfig', { databaseId: '', titreField: 'Name', codeTiersField: '', lieuField: '' })
  );
  const [projetsConfig, setProjetsConfig] = useState<ProjetsConfig>(() =>
    load<ProjetsConfig>('projetsConfig', { databaseId: '', nomField: 'Name', tiersField: '', typeProjetField: '', dateDebutField: '' })
  );
  const [tachesConfig, setTachesConfig] = useState<TachesConfig>(() =>
    load<TachesConfig>('tachesConfig', {
      databaseId: '', nomField: 'Name', canalField: '', statutField: '',
      prioriteField: '', dateEcheanceField: '', planifieLeField: '',
      projetField: '', statutTermineValue: 'Terminé',
    })
  );

  // Local string states for comma-separated inputs (controlled inputs that split on comma break mid-typing)
  const [ticketsStatutsStr, setTicketsStatutsStr] = useState(() =>
    load<TicketsConfig>('ticketsConfig', DEFAULT_TICKETS).statutsTerminesValues.join(', ')
  );
  const [assocStatutsStr, setAssocStatutsStr] = useState(() =>
    load<AssociationsConfig>('associationsConfig', DEFAULT_ASSOCIATIONS).statutsTerminesValues.join(', ')
  );

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

  const handleLoadPartenairesSchema = async () => {
    if (!config.integrationToken || !partenairesConfig.databaseId) {
      setError('Token d\'intégration et ID base Partenaires requis');
      return;
    }
    setPartenairesLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, partenairesConfig.databaseId);
      setPartenairesSchema(props);
      flash(`${props.length} propriétés chargées (Partenaires)`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPartenairesLoading(false);
    }
  };

  const handleSavePartenaires = () => {
    save('partenairesConfig', partenairesConfig);
    flash('Configuration Partenaires sauvegardée');
  };

  const handleLoadSuivisSchema = async () => {
    if (!config.integrationToken || !suivisConfig.databaseId) {
      setError('Token d\'intégration et ID base Suivis requis');
      return;
    }
    setSuivisLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, suivisConfig.databaseId);
      setSuivisSchema(props);
      flash(`${props.length} propriétés chargées (Suivis)`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuivisLoading(false);
    }
  };

  const handleSaveSuivis = () => {
    save('suivisConfig', suivisConfig);
    flash('Configuration Suivis sauvegardée');
  };

  const handleLoadTempsSchema = async () => {
    if (!config.integrationToken || !tempsConfig.databaseId) {
      setError('Token d\'intégration et ID base Temps requis');
      return;
    }
    setTempsLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, tempsConfig.databaseId);
      setTempsSchema(props);
      flash(`${props.length} propriétés chargées (Temps)`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTempsLoading(false);
    }
  };

  const handleSaveTemps = () => {
    save('tempsConfig', tempsConfig);
    flash('Configuration Temps sauvegardée');
  };

  const handleLoadTicketsSchema = async () => {
    if (!config.integrationToken || !ticketsConfig.databaseId) {
      setError('Token d\'intégration et ID base Tickets requis');
      return;
    }
    setTicketsLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, ticketsConfig.databaseId);
      setTicketsSchema(props);
      flash(`${props.length} propriétés chargées (Tickets)`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleSaveTickets = () => {
    save('ticketsConfig', ticketsConfig);
    flash('Configuration Tickets sauvegardée');
  };

  const handleLoadAssocSchema = async () => {
    if (!config.integrationToken || !assocConfig.databaseId) {
      setError('Token d\'intégration et ID base Associations requis');
      return;
    }
    setAssocLoading(true);
    setError(null);
    try {
      const props = await fetchDatabaseSchema(config.integrationToken, assocConfig.databaseId);
      setAssocSchema(props);
      flash(`${props.length} propriétés chargées (Associations)`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAssocLoading(false);
    }
  };

  const handleSaveAssoc = () => {
    save('associationsConfig', assocConfig);
    flash('Configuration Associations sauvegardée');
  };

  const handleLoadPostitsSchema = async () => {
    if (!config.integrationToken || !postitsConfig.databaseId) {
      setError('Token d\'intégration et ID base Post-its requis');
      return;
    }
    setPostitsLoading(true);
    try {
      const s = await fetchDatabaseSchema(config.integrationToken, postitsConfig.databaseId);
      setPostitsSchema(s);
      flash(`Schéma Post-its chargé — ${s.length} propriétés`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPostitsLoading(false);
    }
  };

  const handleSavePostits = () => {
    save('postitsConfig', postitsConfig);
    flash('Configuration Post-its sauvegardée');
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
      save('notionSchema', props);
      flash(`${props.length} propriétés chargées`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    save('notionConfig', config);
    save('clientsConfig', clientsConfig);
    save('projetsConfig', projetsConfig);
    save('tachesConfig', tachesConfig);
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

  const [importBanner, setImportBanner] = useState<boolean>(() => {
    const flag = localStorage.getItem('planner:_justImported');
    if (flag) {
      localStorage.removeItem('planner:_justImported');
      return true;
    }
    return false;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cloudStatus, setCloudStatus] = useState<{ saving: boolean; loading: boolean; savedAt: string | null; error: string | null }>({
    saving: false, loading: false, savedAt: null, error: null,
  });

  useEffect(() => {
    fetchCloudConfigMeta()
      .then(meta => meta && setCloudStatus(s => ({ ...s, savedAt: meta.saved_at })))
      .catch(() => {});
  }, []);

  const handleCloudUpload = async () => {
    setCloudStatus(s => ({ ...s, saving: true, error: null }));
    try {
      const { saved_at } = await uploadConfigToCloud();
      setCloudStatus(s => ({ ...s, saving: false, savedAt: saved_at }));
    } catch (e) {
      setCloudStatus(s => ({ ...s, saving: false, error: String(e) }));
    }
  };

  const handleCloudDownload = async () => {
    setCloudStatus(s => ({ ...s, loading: true, error: null }));
    try {
      await downloadConfigFromCloud();
    } catch (e) {
      setCloudStatus(s => ({ ...s, loading: false, error: String(e) }));
    }
  };

  useEffect(() => {
    if (importBanner && config.integrationToken && config.databaseId && schema.length === 0) {
      fetchDatabaseSchema(config.integrationToken, config.databaseId)
        .then(setSchema)
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importBanner]);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importConfig(ev.target!.result as string);
      } catch {
        setError('Fichier invalide — vérifiez le format JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const hasConfig = !!(config.fieldMap.title || config.fieldMap.status);

  return (
    <div
      className="themed-scroll h-full overflow-y-auto"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>⚙ Paramètres</h2>
        </div>

        {/* ── Export / Import ── */}
        <section className="mb-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <SectionTitle>Export / Import de configuration</SectionTitle>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadConfig}
              className="text-xs px-3 py-1.5 rounded font-medium transition"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              ↓ Exporter la config
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1.5 rounded font-medium transition"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              ↑ Importer…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Les clefs API (tokens Notion et Google) ne sont pas exportées.
          </p>
        </section>

        {/* ── Sync Cloud ── */}
        <section className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <SectionTitle>Sync Cloud</SectionTitle>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCloudUpload}
              disabled={cloudStatus.saving}
              className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {cloudStatus.saving ? '…' : '↑ Envoyer vers le cloud'}
            </button>
            <button
              onClick={handleCloudDownload}
              disabled={cloudStatus.loading}
              className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
              style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {cloudStatus.loading ? '…' : '↓ Télécharger depuis le cloud'}
            </button>
          </div>
          {cloudStatus.savedAt && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Dernière sauvegarde : {new Date(cloudStatus.savedAt + 'Z').toLocaleString()}
            </p>
          )}
          {cloudStatus.error && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-error, #e53e3e)' }}>
              {cloudStatus.error}
            </p>
          )}
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Les clefs API (tokens Notion et Google) ne sont pas incluses.
          </p>
        </section>

        {/* ── Onglets ── */}
        <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          {(['cuma', 'cap'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-xs px-4 py-2 font-medium transition rounded-t"
              style={{
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? 'var(--accent-fg)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {t === 'cuma' ? 'CUMA' : 'CAP CONSULTING'}
            </button>
          ))}
        </div>

        {tab === 'cuma' && <div className="space-y-8">

          {/* ── Bannière post-import ── */}
          {importBanner && (
            <div
              className="flex items-start gap-3 rounded-lg px-4 py-3 text-xs"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid var(--accent)', color: 'var(--text)' }}
            >
              <span className="text-base leading-none mt-0.5">✓</span>
              <div>
                <p className="font-medium mb-0.5">Configuration importée avec succès.</p>
                <p style={{ color: 'var(--text-muted)' }}>
                  Saisissez votre token d'intégration Notion ci-dessous puis cliquez <strong>Charger le schéma</strong> pour finaliser.
                </p>
              </div>
              <button
                onClick={() => setImportBanner(false)}
                className="ml-auto text-base leading-none opacity-50 hover:opacity-100"
                style={{ color: 'var(--text)' }}
              >×</button>
            </div>
          )}

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

          {/* ── Google Agenda ── */}
          <section>
            <SectionTitle>Google Agenda</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Client ID OAuth 2.0 (console.cloud.google.com → Identifiants → OAuth 2.0).
              Stocké localement, jamais intégré dans le bundle.
            </p>
            <FieldRow label="Client ID">
              <input
                type="password"
                value={gcalClientId}
                onChange={e => setGcalClientId(e.target.value)}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={() => { save('gcalClientId', gcalClientId); onGcalClientIdSave?.(gcalClientId); flash('Client ID Google sauvegardé'); }}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
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
                    <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="Afficher un dropdown éditable dans la fiche tâche">
                      <input
                        type="checkbox"
                        checked={ef.editable ?? false}
                        onChange={e => {
                          const next: NotionExtraField[] = [...(config.extraFields ?? [])];
                          next[i] = { ...next[i], editable: e.target.checked };
                          setConfig(prev => ({ ...prev, extraFields: next }));
                        }}
                        className="w-3 h-3"
                      />
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Édit.</span>
                    </label>
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
                <FieldRow label="Champ État">
                  <PropCombo value={briefingConfig.statusField ?? ''} onChange={v => setBriefingConfig(prev => ({ ...prev, statusField: v }))} schema={briefingSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Valeur Terminé">
                  <input
                    type="text"
                    value={briefingConfig.statusDoneValue ?? ''}
                    onChange={e => setBriefingConfig(prev => ({ ...prev, statusDoneValue: e.target.value }))}
                    placeholder="Terminé"
                    className="flex-1 text-xs rounded px-2 py-1.5 outline-none"
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
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

          {/* ── Base Partenaires ── */}
          <section>
            <SectionTitle>Partenaires</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Base Notion pour les partenaires (clients, fournisseurs…). Réutilise le token d'intégration ci-dessus.
            </p>
            <FieldRow label="ID base Partenaires">
              <input
                type="text"
                value={partenairesConfig.databaseId}
                onChange={e => setPartenairesConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadPartenairesSchema}
                disabled={partenairesLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {partenairesLoading ? '…' : 'Charger le schéma'}
              </button>
              {partenairesSchema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {partenairesSchema.length} propriétés</span>
              )}
            </div>
            {(partenairesSchema.length > 0 || partenairesConfig.titleField || partenairesConfig.shortCodeField) && (
              <>
                <FieldRow label="Champ Nom">
                  <PropCombo value={partenairesConfig.titleField} onChange={v => setPartenairesConfig(prev => ({ ...prev, titleField: v }))} schema={partenairesSchema} />
                </FieldRow>
                <FieldRow label="Champ Abrégé">
                  <PropCombo value={partenairesConfig.shortCodeField} onChange={v => setPartenairesConfig(prev => ({ ...prev, shortCodeField: v }))} schema={partenairesSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="État des suivis">
                  <PropCombo value={partenairesConfig.etatSuivisField} onChange={v => setPartenairesConfig(prev => ({ ...prev, etatSuivisField: v }))} schema={partenairesSchema} placeholder="(champ formula, optionnel)" />
                </FieldRow>
                <FieldRow label="Champ Type">
                  <PropCombo value={partenairesConfig.typeField} onChange={v => setPartenairesConfig(prev => ({ ...prev, typeField: v }))} schema={partenairesSchema} placeholder="(select ou multi_select)" />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSavePartenaires}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
          </section>

          {/* ── Base Suivis ── */}
          <section>
            <SectionTitle>Suivis</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Base Notion pour les suivis commerciaux / relationnels. Réutilise le token d'intégration ci-dessus.
            </p>
            <FieldRow label="ID base Suivis">
              <input
                type="text"
                value={suivisConfig.databaseId}
                onChange={e => setSuivisConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadSuivisSchema}
                disabled={suivisLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {suivisLoading ? '…' : 'Charger le schéma'}
              </button>
              {suivisSchema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {suivisSchema.length} propriétés</span>
              )}
            </div>
            {(suivisSchema.length > 0 || suivisConfig.titleField || suivisConfig.suivisField) && (
              <>
                <FieldRow label="Champ Nom">
                  <PropCombo value={suivisConfig.titleField} onChange={v => setSuivisConfig(prev => ({ ...prev, titleField: v }))} schema={suivisSchema} />
                </FieldRow>
                <FieldRow label="Champ Suivi">
                  <PropSelect value={suivisConfig.suivisField} onChange={v => setSuivisConfig(prev => ({ ...prev, suivisField: v }))} schema={suivisSchema} filter={p => ['select', 'multi_select', 'status'].includes(p.type)} placeholder="(select)" />
                </FieldRow>
                <FieldRow label="Champ Projets">
                  <PropCombo value={suivisConfig.projetsField} onChange={v => setSuivisConfig(prev => ({ ...prev, projetsField: v }))} schema={suivisSchema} placeholder="(relation)" />
                </FieldRow>
                <FieldRow label="Champ Partenaires">
                  <PropCombo value={suivisConfig.partenairesField} onChange={v => setSuivisConfig(prev => ({ ...prev, partenairesField: v }))} schema={suivisSchema} placeholder="(relation)" />
                </FieldRow>
                <FieldRow label="Champ Contact">
                  <PropCombo value={suivisConfig.contactField} onChange={v => setSuivisConfig(prev => ({ ...prev, contactField: v }))} schema={suivisSchema} placeholder="(relation ou people)" />
                </FieldRow>
                <FieldRow label="Dernière action">
                  <PropCombo value={suivisConfig.lastActionDateField ?? ''} onChange={v => setSuivisConfig(prev => ({ ...prev, lastActionDateField: v }))} schema={suivisSchema} placeholder="(optionnel)" />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSaveSuivis}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
          </section>

          {/* ── Base Temps ── */}
          <section>
            <SectionTitle>Temps</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Base Notion pour le suivi du temps de travail. Réutilise le token d'intégration ci-dessus.
            </p>
            <FieldRow label="ID base Temps">
              <input
                type="text"
                value={tempsConfig.databaseId}
                onChange={e => setTempsConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadTempsSchema}
                disabled={tempsLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {tempsLoading ? '…' : 'Charger le schéma'}
              </button>
              {tempsSchema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {tempsSchema.length} propriétés</span>
              )}
            </div>
            {(tempsSchema.length > 0 || tempsConfig.titleField || tempsConfig.startField) && (
              <>
                <FieldRow label="Champ Nom">
                  <PropCombo value={tempsConfig.titleField} onChange={v => setTempsConfig(prev => ({ ...prev, titleField: v }))} schema={tempsSchema} />
                </FieldRow>
                <FieldRow label="Début session">
                  <PropCombo value={tempsConfig.startField} onChange={v => setTempsConfig(prev => ({ ...prev, startField: v }))} schema={tempsSchema} placeholder="(date + heure)" />
                </FieldRow>
                <FieldRow label="Fin session">
                  <PropCombo value={tempsConfig.endField} onChange={v => setTempsConfig(prev => ({ ...prev, endField: v }))} schema={tempsSchema} placeholder="(date + heure)" />
                </FieldRow>
                <FieldRow label="Temps [h]">
                  <PropCombo value={tempsConfig.dureeHField} onChange={v => setTempsConfig(prev => ({ ...prev, dureeHField: v }))} schema={tempsSchema} placeholder="(formule)" />
                </FieldRow>
                <FieldRow label="Temps [min]">
                  <PropCombo value={tempsConfig.dureeMinField} onChange={v => setTempsConfig(prev => ({ ...prev, dureeMinField: v }))} schema={tempsSchema} placeholder="(formule)" />
                </FieldRow>
                <FieldRow label="Commentaire">
                  <PropCombo value={tempsConfig.commentaireField} onChange={v => setTempsConfig(prev => ({ ...prev, commentaireField: v }))} schema={tempsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Projets">
                  <PropCombo value={tempsConfig.projetsField} onChange={v => setTempsConfig(prev => ({ ...prev, projetsField: v }))} schema={tempsSchema} placeholder="(relation)" />
                </FieldRow>
                <FieldRow label="Sous-projets">
                  <PropCombo value={tempsConfig.sousProjetField} onChange={v => setTempsConfig(prev => ({ ...prev, sousProjetField: v }))} schema={tempsSchema} placeholder="(relation, optionnel)" />
                </FieldRow>
                <FieldRow label="Objectif hebdo (h)">
                  <input
                    type="number"
                    value={tempsConfig.objectifHebdoH}
                    onChange={e => setTempsConfig(prev => ({ ...prev, objectifHebdoH: parseFloat(e.target.value) || 39 }))}
                    min={1} max={80} step={0.5}
                    className="w-24 text-xs rounded px-2 py-1.5 outline-none"
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSaveTemps}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
          </section>

          {/* ── Base Tickets ── */}
          <section>
            <SectionTitle>Tickets</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Base Notion pour le suivi des tickets. Réutilise le token d'intégration ci-dessus.
            </p>
            <FieldRow label="ID base Tickets">
              <input
                type="text"
                value={ticketsConfig.databaseId}
                onChange={e => setTicketsConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadTicketsSchema}
                disabled={ticketsLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {ticketsLoading ? '…' : 'Charger le schéma'}
              </button>
              {ticketsSchema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {ticketsSchema.length} propriétés</span>
              )}
            </div>
            {(ticketsSchema.length > 0 || ticketsConfig.ticketIdField || ticketsConfig.sujetField) && (
              <>
                <FieldRow label="Ticket ID">
                  <PropCombo value={ticketsConfig.ticketIdField} onChange={v => setTicketsConfig(prev => ({ ...prev, ticketIdField: v }))} schema={ticketsSchema} />
                </FieldRow>
                <FieldRow label="Sujet">
                  <PropCombo value={ticketsConfig.sujetField} onChange={v => setTicketsConfig(prev => ({ ...prev, sujetField: v }))} schema={ticketsSchema} placeholder="(titre)" />
                </FieldRow>
                <FieldRow label="Code Association">
                  <PropCombo value={ticketsConfig.codeAssocField} onChange={v => setTicketsConfig(prev => ({ ...prev, codeAssocField: v }))} schema={ticketsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Statut">
                  <PropCombo value={ticketsConfig.statutField} onChange={v => setTicketsConfig(prev => ({ ...prev, statutField: v }))} schema={ticketsSchema} />
                </FieldRow>
                <FieldRow label="Priorité">
                  <PropCombo value={ticketsConfig.prioriteField} onChange={v => setTicketsConfig(prev => ({ ...prev, prioriteField: v }))} schema={ticketsSchema} />
                </FieldRow>
                <FieldRow label="Niveau">
                  <PropCombo value={ticketsConfig.niveauField} onChange={v => setTicketsConfig(prev => ({ ...prev, niveauField: v }))} schema={ticketsSchema} />
                </FieldRow>
                <FieldRow label="Date modif.">
                  <PropCombo value={ticketsConfig.dateModifField} onChange={v => setTicketsConfig(prev => ({ ...prev, dateModifField: v }))} schema={ticketsSchema} />
                </FieldRow>
                <FieldRow label="Demandeur">
                  <PropCombo value={ticketsConfig.demandeurField} onChange={v => setTicketsConfig(prev => ({ ...prev, demandeurField: v }))} schema={ticketsSchema} placeholder="(email)" />
                </FieldRow>
                <FieldRow label="Lien">
                  <PropCombo value={ticketsConfig.lienField} onChange={v => setTicketsConfig(prev => ({ ...prev, lienField: v }))} schema={ticketsSchema} placeholder="(formule)" />
                </FieldRow>
                <FieldRow label="Zone">
                  <PropCombo value={ticketsConfig.zoneField} onChange={v => setTicketsConfig(prev => ({ ...prev, zoneField: v }))} schema={ticketsSchema} placeholder="(formule)" />
                </FieldRow>
                <FieldRow label="Mémo">
                  <PropCombo value={ticketsConfig.memoField} onChange={v => setTicketsConfig(prev => ({ ...prev, memoField: v }))} schema={ticketsSchema} />
                </FieldRow>
                <FieldRow label="Code dossier">
                  <PropCombo value={ticketsConfig.codeDossierField} onChange={v => setTicketsConfig(prev => ({ ...prev, codeDossierField: v }))} schema={ticketsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Catégorie">
                  <PropCombo value={ticketsConfig.categorieField} onChange={v => setTicketsConfig(prev => ({ ...prev, categorieField: v }))} schema={ticketsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Sous-catégorie">
                  <PropCombo value={ticketsConfig.sousCategorieField} onChange={v => setTicketsConfig(prev => ({ ...prev, sousCategorieField: v }))} schema={ticketsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Conclusion">
                  <PropCombo value={ticketsConfig.conclusionField} onChange={v => setTicketsConfig(prev => ({ ...prev, conclusionField: v }))} schema={ticketsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Département">
                  <PropCombo value={ticketsConfig.departementField} onChange={v => setTicketsConfig(prev => ({ ...prev, departementField: v }))} schema={ticketsSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Association">
                  <PropCombo value={ticketsConfig.associationField} onChange={v => setTicketsConfig(prev => ({ ...prev, associationField: v }))} schema={ticketsSchema} placeholder="(relation)" />
                </FieldRow>
                <FieldRow label="Statuts terminés">
                  <input
                    type="text"
                    value={ticketsStatutsStr}
                    onChange={e => setTicketsStatutsStr(e.target.value)}
                    onBlur={e => setTicketsConfig(prev => ({ ...prev, statutsTerminesValues: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                    placeholder="Annulé, Clos"
                    className="flex-1 text-xs rounded px-2 py-1.5 outline-none"
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSaveTickets}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
          </section>

          {/* ── Base Associations ── */}
          <section>
            <SectionTitle>Associations (Tickets)</SectionTitle>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Base Notion des associations liées aux tickets. Réutilise le token d'intégration ci-dessus.
            </p>
            <FieldRow label="ID base Associations">
              <input
                type="text"
                value={assocConfig.databaseId}
                onChange={e => setAssocConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-3 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadAssocSchema}
                disabled={assocLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {assocLoading ? '…' : 'Charger le schéma'}
              </button>
              {assocSchema.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ {assocSchema.length} propriétés</span>
              )}
            </div>
            {(assocSchema.length > 0 || assocConfig.nomField || assocConfig.codeField) && (
              <>
                <FieldRow label="Champ Nom">
                  <PropCombo value={assocConfig.nomField} onChange={v => setAssocConfig(prev => ({ ...prev, nomField: v }))} schema={assocSchema} />
                </FieldRow>
                <FieldRow label="Champ Code">
                  <PropCombo value={assocConfig.codeField} onChange={v => setAssocConfig(prev => ({ ...prev, codeField: v }))} schema={assocSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Champ Statut">
                  <PropCombo value={assocConfig.statutField} onChange={v => setAssocConfig(prev => ({ ...prev, statutField: v }))} schema={assocSchema} />
                </FieldRow>
                <FieldRow label="Champ Priorité">
                  <PropCombo value={assocConfig.prioriteField} onChange={v => setAssocConfig(prev => ({ ...prev, prioriteField: v }))} schema={assocSchema} placeholder="(optionnel)" />
                </FieldRow>
                <FieldRow label="Solution contournement">
                  <PropCombo value={assocConfig.solutionField} onChange={v => setAssocConfig(prev => ({ ...prev, solutionField: v }))} schema={assocSchema} placeholder="(rich_text)" />
                </FieldRow>
                <FieldRow label="Champ Suivi">
                  <PropCombo value={assocConfig.suiviField} onChange={v => setAssocConfig(prev => ({ ...prev, suiviField: v }))} schema={assocSchema} placeholder="(formule → URL)" />
                </FieldRow>
                <FieldRow label="Statuts terminés">
                  <input
                    type="text"
                    value={assocStatutsStr}
                    onChange={e => setAssocStatutsStr(e.target.value)}
                    onBlur={e => setAssocConfig(prev => ({ ...prev, statutsTerminesValues: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                    placeholder="Annulé, Clos"
                    className="flex-1 text-xs rounded px-2 py-1.5 outline-none"
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSaveAssoc}
                className="text-xs px-4 py-2 rounded font-medium transition"
                style={{ background: 'var(--border)', color: 'var(--text)' }}
              >
                Sauvegarder
              </button>
            </div>
          </section>

          {/* ── Post-its ── */}
          <section>
            <SectionTitle>Post-its</SectionTitle>
            <FieldRow label="ID Base Notion">
              <input
                type="text"
                value={postitsConfig.databaseId}
                onChange={e => setPostitsConfig(prev => ({ ...prev, databaseId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded px-2 py-1.5 outline-none font-mono"
                style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </FieldRow>
            <div className="flex items-center gap-3 mt-1 mb-4 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleLoadPostitsSchema}
                disabled={postitsLoading}
                className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {postitsLoading ? '…' : 'Charger le schéma'}
              </button>
            </div>
            {(postitsSchema.length > 0 || postitsConfig.titleField) && (
              <>
                <FieldRow label="Champ Sujet">
                  <PropCombo value={postitsConfig.titleField} onChange={v => setPostitsConfig(prev => ({ ...prev, titleField: v }))} schema={postitsSchema} />
                </FieldRow>
                <FieldRow label="Champ Créé le">
                  <PropCombo value={postitsConfig.createdTimeField} onChange={v => setPostitsConfig(prev => ({ ...prev, createdTimeField: v }))} schema={postitsSchema} placeholder="(optionnel, ex. created_time)" />
                </FieldRow>
                <FieldRow label="Champ Échéance">
                  <PropCombo value={postitsConfig.dueDateField} onChange={v => setPostitsConfig(prev => ({ ...prev, dueDateField: v }))} schema={postitsSchema} />
                </FieldRow>
                <FieldRow label="Champ Statut">
                  <PropCombo value={postitsConfig.statusField} onChange={v => setPostitsConfig(prev => ({ ...prev, statusField: v }))} schema={postitsSchema} />
                </FieldRow>
                <FieldRow label="Valeur Terminé">
                  <input
                    type="text"
                    value={postitsConfig.statusDoneValue ?? ''}
                    onChange={e => setPostitsConfig(prev => ({ ...prev, statusDoneValue: e.target.value }))}
                    placeholder="Terminé"
                    className="flex-1 text-xs rounded px-2 py-1.5 outline-none"
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </FieldRow>
              </>
            )}
            <div className="flex items-center gap-3 mt-3 ml-[calc(9rem+0.75rem)]">
              <button
                onClick={handleSavePostits}
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

        </div>}

        {tab === 'cap' && (
          <div className="space-y-6">
            <CapClientsSection
              token={config.integrationToken}
              clientsConfig={clientsConfig}
              setClientsConfig={setClientsConfig}
            />
            <CapProjetsSection
              token={config.integrationToken}
              projetsConfig={projetsConfig}
              setProjetsConfig={setProjetsConfig}
            />
            <CapTachesSection
              token={config.integrationToken}
              tachesConfig={tachesConfig}
              setTachesConfig={setTachesConfig}
            />
          </div>
        )}

        {/* ── Messages ── */}
        {error && (
          <div className="mt-4 text-xs rounded px-3 py-2" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--color-error-deep)' }}>
            ⚠ {error}
          </div>
        )}
        {statusMsg && (
          <div className="mt-4 text-xs rounded px-3 py-2" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-deep)' }}>
            ✓ {statusMsg}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 mt-6 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleSave}
            className="text-xs px-4 py-2 rounded font-medium transition"
            style={{ background: 'var(--border)', color: 'var(--text)' }}
          >
            Sauvegarder
          </button>
          {tab === 'cuma' && (
            <button
              onClick={handleSync}
              disabled={loading}
              className="text-xs px-4 py-2 rounded font-medium transition disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {loading ? 'Synchronisation…' : 'Synchroniser depuis Notion'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
