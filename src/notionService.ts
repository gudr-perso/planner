import type {
  BriefingConfig,
  BriefingEntry,
  DataBundle,
  NotionBlock,
  NotionConfig,
  NotionPropertySchema,
  PartenairesConfig,
  PartenaireEntry,
  Person,
  Project,
  Status,
  SubProject,
  SuivisConfig,
  SuiviEntry,
  Task,
} from './types';


const API = '/notion-api';

function hdrs(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };
}

async function nGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: hdrs(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as Record<string, unknown>)?.message as string ?? `Notion ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function nPost(token: string, path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: hdrs(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as Record<string, unknown>)?.message as string ?? `Notion ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function nPatch(token: string, path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: hdrs(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as Record<string, unknown>)?.message as string ?? `Notion ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function patchNotionDates(
  token: string,
  pageId: string,
  dateFieldName: string,
  start: string,
  end: string,
): Promise<void> {
  await nPatch(token, `/pages/${pageId}`, {
    properties: {
      [dateFieldName]: { date: { start, end } },
    },
  });
}

export async function fetchDatabaseSchema(token: string, databaseId: string): Promise<NotionPropertySchema[]> {
  const data = await nGet(token, `/databases/${databaseId}`);
  const props = data.properties as Record<string, Record<string, unknown>>;
  return Object.entries(props).map(([name, prop]) => {
    const type = prop.type as string;
    const schema: NotionPropertySchema = { id: String(prop.id), name, type };
    const src =
      type === 'select' ? (prop.select as Record<string, unknown>)?.options :
      type === 'multi_select' ? (prop.multi_select as Record<string, unknown>)?.options :
      type === 'status' ? (prop.status as Record<string, unknown>)?.options :
      null;
    if (src) schema.options = src as NotionPropertySchema['options'];
    return schema;
  });
}

// ── property value helpers ─────────────────────────────────────────────────────

type PropVal = Record<string, unknown> | null | undefined;

function plainText(prop: PropVal): string {
  if (!prop) return '';
  const arr = (prop.title ?? prop.rich_text ?? []) as Array<{ plain_text?: string }>;
  return arr.map(t => t.plain_text ?? '').join('');
}

function selectName(prop: PropVal): string {
  if (!prop) return '';
  return (
    (prop.status as Record<string, string>)?.name ??
    (prop.select as Record<string, string>)?.name ??
    (prop.multi_select as Array<{ name: string }>)?.[0]?.name ??
    ''
  );
}

function selectColor(prop: PropVal): string {
  if (!prop) return 'default';
  return (
    (prop.status as Record<string, string>)?.color ??
    (prop.select as Record<string, string>)?.color ??
    'default'
  );
}

// Handles people type AND multi_select/select (when assignee is a choice field)
function assigneeList(prop: PropVal): Array<{ id: string; name: string }> {
  if (!prop) return [];
  if (prop.people) {
    return (prop.people as Array<{ id: string; name?: string; person?: { email?: string } }>).map(p => ({
      id: p.id,
      name: p.name ?? p.person?.email ?? p.id,
    }));
  }
  if (prop.multi_select) {
    return (prop.multi_select as Array<{ name: string }>).map(o => ({ id: o.name, name: o.name }));
  }
  if (prop.select) {
    const s = prop.select as { name: string };
    return [{ id: s.name, name: s.name }];
  }
  return [];
}

function dateRange(prop: PropVal): { start: string | null; end: string | null } {
  const d = (prop?.date ?? null) as { start?: string; end?: string } | null;
  if (!d?.start) return { start: null, end: null };
  return {
    start: d.start.slice(0, 10),
    end: d.end ? d.end.slice(0, 10) : d.start.slice(0, 10),
  };
}

// Extract text from a rollup property (handles array-type and rich_text/title-type rollups)
function rollupText(prop: PropVal): string {
  if (!prop?.rollup) return '';
  const r = prop.rollup as Record<string, unknown>;
  if (r.type === 'array' && Array.isArray(r.array)) {
    const first = (r.array as PropVal[])[0];
    if (!first) return '';
    return plainText(first) || selectName(first) || '';
  }
  if (r.type === 'rich_text') return plainText({ rich_text: r.rich_text } as PropVal);
  if (r.type === 'title') return plainText({ title: r.title } as PropVal);
  return '';
}

// Extracts a display string for any Notion property type (used for extra fields)
function extractExtraValue(prop: PropVal, relIdToTitle: Map<string, string>): string {
  if (!prop) return '';
  const type = prop.type as string | undefined;

  // Relation → resolved titles joined
  if (type === 'relation' || Array.isArray((prop as Record<string, unknown>).relation)) {
    const rels = (prop as Record<string, unknown>).relation as Array<{ id: string }> | undefined ?? [];
    const names = rels.map(r => relIdToTitle.get(r.id) ?? r.id.slice(0, 8)).filter(Boolean);
    return names.join(', ');
  }
  // Formula (boolean, string, number)
  if (type === 'formula') {
    const f = (prop as Record<string, unknown>).formula as Record<string, unknown> | undefined;
    if (!f) return '';
    if (f.type === 'boolean') return f.boolean ? 'Oui' : 'Non';
    if (f.type === 'string') return String(f.string ?? '');
    if (f.type === 'number') return String(f.number ?? '');
    return '';
  }
  // Checkbox
  if (type === 'checkbox') return (prop as Record<string, unknown>).checkbox ? 'Oui' : 'Non';
  // Date
  if (type === 'date') return dateRange(prop).start ?? '';
  // URL / email / phone
  if (type === 'url') return String((prop as Record<string, unknown>).url ?? '');
  if (type === 'email') return String((prop as Record<string, unknown>).email ?? '');
  if (type === 'phone_number') return String((prop as Record<string, unknown>).phone_number ?? '');
  // Number
  if (type === 'number') {
    const n = (prop as Record<string, unknown>).number;
    return n != null ? String(n) : '';
  }
  // People
  if (type === 'people') return assigneeList(prop).map(p => p.name).join(', ');
  // Select / status / multi_select / text / rollup
  return selectName(prop) || plainText(prop) || rollupText(prop) || '';
}

// For non-relation project fields (select, multi_select, rollup, rich_text)
function simpleProjectName(prop: PropVal): string {
  if (!prop) return '';
  return (
    rollupText(prop) ||
    (prop.select as Record<string, string>)?.name ||
    (prop.multi_select as Array<{ name: string }>)?.[0]?.name ||
    plainText(prop) ||
    ''
  );
}

// Resolve Notion page IDs → titles in parallel (cap 100, timeout 5s per page)
async function resolvePageTitles(token: string, ids: Iterable<string>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids)).slice(0, 100);
  const result = new Map<string, string>();
  const withTimeout = (id: string) =>
    Promise.race([
      nGet(token, `/pages/${id}`).then((page) => {
        const props = page.properties as Record<string, PropVal>;
        const titleProp = Object.values(props).find(p => p?.type === 'title');
        result.set(id, plainText(titleProp) || id.slice(0, 8));
      }),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]).catch(() => { result.set(id, id.slice(0, 8)); });
  await Promise.all(unique.map(withTimeout));
  return result;
}

// ── sync ───────────────────────────────────────────────────────────────────────

const PROJ_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
const PERS_COLORS = ['#B1DCE2', '#F59E0B', '#10B981', '#6366F1', '#EC4899', '#94a3b8'];
const DEFAULT_PERSON_COLORS: Record<string, string> = {
  'Guillaume D.': '#F97316',
  'Céline L.':    '#EC4899',
  'Philippe D.':  '#10B981',
  'Dimitri L.':   '#3B82F6',
};

export async function syncFromNotion(config: NotionConfig): Promise<DataBundle> {
  const { integrationToken: token, databaseId, fieldMap, statusMappings } = config;

  // 1. Paginate through all task pages, excluding "done" statuses
  // Build server-side filter: exclude every Notion value that maps to internalStatus 'done'
  const doneValues = statusMappings
    .filter(m => m.internalStatus === 'done')
    .map(m => m.notionValue)
    .filter(Boolean);

  // Notion filter (works for "status" type properties — most common case)
  const buildFilter = (): Record<string, unknown> | undefined => {
    if (!fieldMap.status || doneValues.length === 0) return undefined;
    const conditions = doneValues.map(v => ({ property: fieldMap.status!, status: { does_not_equal: v } }));
    return conditions.length === 1 ? conditions[0] : { and: conditions };
  };

  const pages: Array<{ id: string; url?: string; properties: Record<string, PropVal> }> = [];
  let cursor: string | undefined;
  let activeFilter: Record<string, unknown> | undefined = buildFilter();

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (activeFilter) body.filter = activeFilter;

    let res: Record<string, unknown>;
    try {
      res = await nPost(token, `/databases/${databaseId}/query`, body);
    } catch (e) {
      if (activeFilter && !cursor) {
        // Filter was rejected (likely wrong property type) — retry without filter
        console.warn('[Notion] Filtre serveur rejeté, fallback sans filtre:', e);
        activeFilter = undefined;
        delete body.filter;
        res = await nPost(token, `/databases/${databaseId}/query`, body);
      } else {
        throw e;
      }
    }

    pages.push(...((res!.results as typeof pages) ?? []));
    cursor = res!.has_more ? String(res!.next_cursor) : undefined;
  } while (cursor);

  // DEBUG: log available property keys and configured field values
  if (pages.length > 0) {
    const sample = pages[0];
    console.log('[Notion] Propriétés disponibles:', Object.keys(sample.properties));
    console.log('[Notion] Config projet:', fieldMap.project, '→', sample.properties[fieldMap.project ?? '']);
    console.log('[Notion] Config sous-projet:', fieldMap.subProject, '→', sample.properties[fieldMap.subProject ?? '']);
  }

  // 2. Collect ALL relation IDs that need to be resolved (project relation + subProject relation)
  const allRelIds = new Set<string>();
  const projectFieldName = fieldMap.project ?? '';
  const subProjectFieldName = fieldMap.subProject ?? '';

  for (const page of pages) {
    const projProp = page.properties[projectFieldName];
    const subProjProp = page.properties[subProjectFieldName];
    const getRelIds = (prop: PropVal) => {
      const rels = (prop as Record<string, unknown>)?.relation as Array<{ id: string }> | undefined;
      rels?.forEach(r => allRelIds.add(r.id));
    };
    getRelIds(projProp);
    getRelIds(subProjProp);
    // Also collect relation IDs from extra fields (Partenaires, CRM Suivi, Contacts, etc.)
    for (const ef of config.extraFields ?? []) {
      getRelIds(page.properties[ef.notionField]);
    }
  }

  // Resolve in one parallel batch
  console.log('[Notion] Relation IDs à résoudre:', allRelIds.size, [...allRelIds].slice(0, 5));
  const relIdToTitle = allRelIds.size > 0
    ? await resolvePageTitles(token, allRelIds)
    : new Map<string, string>();
  console.log('[Notion] Titres résolus:', Object.fromEntries(relIdToTitle));

  // Helper: is a field value a relation?
  const isRelationProp = (prop: PropVal) => Array.isArray((prop as Record<string, unknown>)?.relation);
  const firstRelId = (prop: PropVal) =>
    ((prop as Record<string, unknown>)?.relation as Array<{ id: string }> | undefined)?.[0]?.id;

  // 3. Map pages to Tasks, building project/subproject/people maps along the way
  const peopleMap = new Map<string, Person>();
  const projectMap = new Map<string, Project>();
  const subprojectMap = new Map<string, SubProject>(); // keyed by Notion page ID

  const ensurePerson = (id: string, name: string) => {
    if (!peopleMap.has(id)) {
      const color = config.personColors?.[name] ?? config.personColors?.[id] ?? DEFAULT_PERSON_COLORS[name] ?? PERS_COLORS[peopleMap.size % PERS_COLORS.length];
      peopleMap.set(id, { id, name, role: '', color });
    }
    return id;
  };

  const ensureProject = (key: string, name: string) => {
    if (!projectMap.has(key)) {
      projectMap.set(key, { id: key, name: name || 'Sans projet', color: PROJ_COLORS[projectMap.size % PROJ_COLORS.length] });
    }
    return key;
  };

  const tasks: Task[] = pages.flatMap((page) => {
    const props = page.properties;
    const fm = fieldMap;

    // Title
    const title = plainText(
      (fm.title ? props[fm.title] : null) ??
      Object.values(props).find(p => p?.type === 'title')
    ) || '(sans titre)';

    // Status
    const statusRaw = selectName((fm.status ? props[fm.status] : null) ?? props['Status'] ?? props['Statut']);
    const mapping = statusMappings.find(m => m.notionValue === statusRaw);
    const internalStatus: Status = mapping?.internalStatus ?? 'todo';
    const isUnplanned = mapping?.isUnplanned ?? false;

    // Client-side guard: skip done tasks (safety net if server filter didn't apply)
    if (internalStatus === 'done') return [];

    // Assignees (people OR multi_select OR select)
    const people = assigneeList(
      (fm.assignee ? props[fm.assignee] : null) ?? props['Assignee'] ?? props['Affecté à']
    );
    const primaryId = people.length > 0
      ? ensurePerson(people[0].id, people[0].name)
      : ensurePerson('__unassigned__', 'Non affecté');
    people.slice(1).forEach(p => ensurePerson(p.id, p.name));

    // Project — rollup (text extraction) or relation (resolved) or select/text
    const projProp = (fm.project ? props[fm.project] : null) ?? props['Project'] ?? props['Projet'];
    let pName = '';
    if (isRelationProp(projProp)) {
      const relId = firstRelId(projProp);
      pName = relId ? (relIdToTitle.get(relId) ?? relId.slice(0, 8)) : '';
    } else {
      pName = simpleProjectName(projProp);
    }
    const projKey = pName || '__none__';
    ensureProject(projKey, pName);

    // Sub-project — always a relation field (or absent)
    let subprojectId: string | undefined;
    if (subProjectFieldName) {
      const subProjProp = props[subProjectFieldName];
      const spRelId = firstRelId(subProjProp);
      if (spRelId) {
        const spName = relIdToTitle.get(spRelId) ?? spRelId.slice(0, 8);
        if (!subprojectMap.has(spRelId)) {
          subprojectMap.set(spRelId, { id: spRelId, name: spName, project_id: projKey });
        }
        subprojectId = spRelId;
      }
    }

    // Dates
    const primary = dateRange((fm.date ? props[fm.date] : null) ?? props['Date']);
    const endOverride = fm.endDate ? dateRange(props[fm.endDate]).start : null;
    const start = primary.start;
    const end = endOverride ?? primary.end;
    const planned = !!(start && end) && !isUnplanned;

    // Extra fields (configurable in settings)
    const extraFields: Record<string, string> = {};
    for (const ef of config.extraFields ?? []) {
      const val = extractExtraValue(props[ef.notionField], relIdToTitle);
      if (val) extraFields[ef.label] = val;
    }

    return [{
      id: page.id,
      title,
      project_id: projKey,
      subproject_id: subprojectId,
      assignee_id: primaryId,
      status: internalStatus,
      start_date: start,
      end_date: end,
      planned,
      showInUnplanned: isUnplanned,
      notion_url: page.url,
      extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
    }];
  });

  console.log('[Notion] Sous-projets détectés:', Array.from(subprojectMap.values()).map(sp => `${sp.name} (proj: ${sp.project_id})`));
  console.log('[Notion] Tâches avec subproject_id:', tasks.filter(t => t.subproject_id).length, '/', tasks.length);

  return {
    tasks,
    projects: Array.from(projectMap.values()),
    subprojects: subprojectMap.size > 0 ? Array.from(subprojectMap.values()) : undefined,
    people: Array.from(peopleMap.values()),
    googleEvents: [],
  };
}

// ── Briefing ───────────────────────────────────────────────────────────────────

export async function fetchBriefings(token: string, config: BriefingConfig): Promise<BriefingEntry[]> {
  const entries: BriefingEntry[] = [];
  let cursor: string | undefined;

  const doneValue = config.statusDoneValue || 'Terminé';
  // Filtre d'exclusion : essaie d'abord le type "status", puis "select" en fallback
  const buildFilter = (type: 'status' | 'select'): Record<string, unknown> | undefined =>
    config.statusField
      ? { property: config.statusField, [type]: { does_not_equal: doneValue } }
      : undefined;

  let activeFilter = buildFilter('status');

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (activeFilter) body.filter = activeFilter;
    body.sorts = config.dateField
      ? [{ property: config.dateField, direction: 'descending' }]
      : [{ timestamp: 'created_time', direction: 'descending' }];

    let res: Record<string, unknown>;
    try {
      res = await nPost(token, `/databases/${config.databaseId}/query`, body);
    } catch (e) {
      if (activeFilter && !cursor) {
        // Le type "status" a été rejeté → on tente "select"
        activeFilter = buildFilter('select');
        if (activeFilter) {
          body.filter = activeFilter;
          try {
            res = await nPost(token, `/databases/${config.databaseId}/query`, body);
          } catch {
            // Dernier fallback : sans filtre
            delete body.filter;
            activeFilter = undefined;
            res = await nPost(token, `/databases/${config.databaseId}/query`, body);
          }
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    const pages = (res!.results ?? []) as Array<{ id: string; created_time?: string; properties: Record<string, PropVal> }>;

    for (const page of pages) {
      const props = page.properties;
      const titleProp = config.titleField
        ? props[config.titleField]
        : Object.values(props).find(p => p?.type === 'title');
      const title = plainText(titleProp) || '(sans titre)';
      const date = config.dateField ? dateRange(props[config.dateField]).start : null;
      const summary = config.summaryField ? plainText(props[config.summaryField]) : '';
      entries.push({ id: page.id, title, date, summary, createdTime: page.created_time });
    }

    cursor = res.has_more ? String(res.next_cursor) : undefined;
  } while (cursor);

  return entries;
}

async function fetchBlocksFlat(token: string, blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const path = `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await nGet(token, path);
    blocks.push(...((res.results as NotionBlock[]) ?? []));
    cursor = res.has_more ? String(res.next_cursor) : undefined;
  } while (cursor);
  return blocks;
}

export async function fetchPageBlocks(token: string, pageId: string, depth = 0): Promise<NotionBlock[]> {
  const blocks = await fetchBlocksFlat(token, pageId);

  // Récupérer les enfants des blocs qui en ont (toggle, synced_block, column_list…)
  // Limité à 3 niveaux pour éviter les appels excessifs
  if (depth < 3) {
    await Promise.all(
      blocks
        .filter(b => b.has_children)
        .map(async b => {
          const children = await fetchPageBlocks(token, b.id, depth + 1);
          (b as Record<string, unknown>)._children = children;
        })
    );
  }

  return blocks;
}

export async function patchBlockChecked(token: string, blockId: string, checked: boolean): Promise<void> {
  await nPatch(token, `/blocks/${blockId}`, { to_do: { checked } });
}

// ── Partenaires ───────────────────────────────────────────────────────────────

export async function fetchPartenaires(token: string, config: PartenairesConfig): Promise<PartenaireEntry[]> {
  const entries: PartenaireEntry[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ property: config.titleField || 'Name', direction: 'ascending' }],
    };
    if (cursor) body.start_cursor = cursor;

    let res: Record<string, unknown>;
    try {
      res = await nPost(token, `/databases/${config.databaseId}/query`, body);
    } catch (e) {
      // Fallback sans tri si le champ de titre est mal configuré
      if (!cursor) {
        res = await nPost(token, `/databases/${config.databaseId}/query`, { page_size: 100 });
      } else {
        throw e;
      }
    }

    const pages = (res!.results ?? []) as Array<{
      id: string;
      url?: string;
      created_time?: string;
      properties: Record<string, PropVal>;
    }>;

    for (const page of pages) {
      const props = page.properties;

      // Title
      const titleProp = config.titleField
        ? props[config.titleField]
        : Object.values(props).find(p => p?.type === 'title');
      const title = plainText(titleProp) || '(sans nom)';

      // Code abrégé (rich_text ou title)
      const shortCode = config.shortCodeField ? plainText(props[config.shortCodeField]) : '';

      // État des suivis — champ formula Notion
      let etatSuivis = '';
      if (config.etatSuivisField) {
        const ep = props[config.etatSuivisField];
        if (ep) {
          const f = (ep as Record<string, unknown>).formula as Record<string, unknown> | undefined;
          if (f?.type === 'string') etatSuivis = String(f.string ?? '');
          else if (f?.type === 'number') etatSuivis = String(f.number ?? '');
          else etatSuivis = plainText(ep) || selectName(ep);
        }
      }

      // Type (select ou multi_select)
      const types: string[] = (() => {
        if (!config.typeField) return [];
        const prop = props[config.typeField] as Record<string, unknown> | undefined;
        if (!prop) return [];
        if (Array.isArray(prop.multi_select))
          return (prop.multi_select as Array<{ name: string }>).map(o => o.name);
        const sel = (prop.select as { name?: string } | undefined)?.name;
        if (sel) return [sel];
        return [];
      })();

      entries.push({ id: page.id, title, shortCode, etatSuivis, types, notion_url: page.url });
    }

    cursor = res!.has_more ? String(res!.next_cursor) : undefined;
  } while (cursor);

  // Tri client-side par titre
  entries.sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));

  return entries;
}

// ── Suivis ────────────────────────────────────────────────────────────────────

export async function fetchSuivis(
  token: string,
  config: SuivisConfig,
  partenairePageId?: string,
): Promise<SuiviEntry[]> {
  const entries: SuiviEntry[] = [];
  let cursor: string | undefined;

  // Filtre optionnel par partenaire (relation)
  const filter: Record<string, unknown> | undefined = partenairePageId && config.partenairesField
    ? { property: config.partenairesField, relation: { contains: partenairePageId } }
    : undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;

    let res: Record<string, unknown>;
    try {
      res = await nPost(token, `/databases/${config.databaseId}/query`, body);
    } catch (e) {
      if (filter && !cursor) {
        // Fallback sans filtre si la relation est rejetée
        console.warn('[Notion] Filtre relation rejeté, fallback sans filtre:', e);
        delete body.filter;
        res = await nPost(token, `/databases/${config.databaseId}/query`, body);
      } else {
        throw e;
      }
    }

    const pages = (res!.results ?? []) as Array<{
      id: string;
      url?: string;
      created_time?: string;
      properties: Record<string, PropVal>;
    }>;

    // Collecter les IDs relation à résoudre
    const relIds = new Set<string>();
    for (const page of pages) {
      const props = page.properties;
      const collectRels = (fieldName: string) => {
        const rels = (props[fieldName] as Record<string, unknown>)?.relation as Array<{ id: string }> | undefined;
        rels?.forEach(r => relIds.add(r.id));
        // People field
        const people = (props[fieldName] as Record<string, unknown>)?.people as Array<{ id: string }> | undefined;
        people?.forEach(p => relIds.add(p.id));
      };
      if (config.projetsField) collectRels(config.projetsField);
      if (config.partenairesField) collectRels(config.partenairesField);
      if (config.contactField) collectRels(config.contactField);
    }

    const relIdToTitle = relIds.size > 0 ? await resolvePageTitles(token, relIds) : new Map<string, string>();

    for (const page of pages) {
      const props = page.properties;

      // Title
      const titleProp = config.titleField
        ? props[config.titleField]
        : Object.values(props).find(p => p?.type === 'title');
      const title = plainText(titleProp) || '(sans titre)';

      // Suivi (select + couleur)
      const suivi = config.suivisField ? selectName(props[config.suivisField]) : '';
      const suiviColor = config.suivisField ? selectColor(props[config.suivisField]) : 'default';

      // Relations → titres résolus
      const resolveRel = (fieldName: string): string[] => {
        if (!fieldName || !props[fieldName]) return [];
        const prop = props[fieldName] as Record<string, unknown>;
        // relation type
        if (Array.isArray(prop.relation)) {
          return (prop.relation as Array<{ id: string }>)
            .map(r => relIdToTitle.get(r.id) ?? r.id.slice(0, 8))
            .filter(Boolean);
        }
        // people type
        if (Array.isArray(prop.people)) {
          return (prop.people as Array<{ id: string; name?: string }>)
            .map(p => p.name ?? relIdToTitle.get(p.id) ?? p.id.slice(0, 8))
            .filter(Boolean);
        }
        // multi_select fallback
        if (Array.isArray(prop.multi_select)) {
          return (prop.multi_select as Array<{ name: string }>).map(o => o.name);
        }
        return [];
      };

      const projets = resolveRel(config.projetsField);
      const partenaires = resolveRel(config.partenairesField);
      const contact = resolveRel(config.contactField);

      // Dates
      const lastActionDate = config.lastActionDateField
        ? dateRange(props[config.lastActionDateField]).start
        : null;

      entries.push({
        id: page.id,
        title,
        suivi,
        suiviColor,
        projets,
        partenaires,
        contact,
        createdTime: page.created_time ?? null,
        lastActionDate,
        notion_url: page.url,
      });
    }

    cursor = res!.has_more ? String(res!.next_cursor) : undefined;
  } while (cursor);

  // Tri client-side : lastActionDate desc, puis createdTime desc
  entries.sort((a, b) => {
    const da = a.lastActionDate ?? a.createdTime ?? '';
    const db = b.lastActionDate ?? b.createdTime ?? '';
    return db.localeCompare(da);
  });

  return entries;
}
