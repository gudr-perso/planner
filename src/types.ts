export type Project = {
  id: string;
  name: string;
  color: string;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  color: string;
};

export type Status = 'todo' | 'in_progress' | 'to_process' | 'blocked' | 'done';

export type SubProject = {
  id: string;
  name: string;
  project_id: string;
};

export type Task = {
  id: string;
  project_id: string;
  subproject_id?: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  assignee_id: string;
  status: Status;
  planned: boolean;
  showInUnplanned?: boolean;
  notion_url?: string;
  extraFields?: Record<string, string>; // label → valeur affichée
};

export type GoogleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description?: string;
  location?: string;
  hangoutLink?: string; // lien Meet / Teams extrait de conferenceData
};

export type DataBundle = {
  projects: Project[];
  subprojects?: SubProject[];
  people: Person[];
  tasks: Task[];
  googleEvents: GoogleEvent[];
};

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  to_process: 'À traiter',
  blocked: 'Bloquée',
  done: 'Terminée',
};

export const STATUS_COLORS: Record<Status, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  to_process: '#f97316',
  blocked: '#ef4444',
  done: '#10b981',
};

// ── Notion integration ─────────────────────────────────────────────────────────

export type NotionPropertySchema = {
  id: string;
  name: string;
  type: string;
  options?: Array<{ id: string; name: string; color?: string }>;
};

export type NotionFieldMap = {
  title: string;
  assignee: string;
  date: string;
  endDate?: string;
  project: string;
  subProject?: string;
  status: string;
};

export type NotionStatusMapping = {
  notionValue: string;
  internalStatus: Status;
  isUnplanned: boolean;
};

export type NotionExtraField = {
  label: string;       // libellé affiché dans la fiche tâche
  notionField: string; // nom exact de la propriété Notion
};

export type NotionConfig = {
  integrationToken: string;
  databaseId: string;
  fieldMap: Partial<NotionFieldMap>;
  statusMappings: NotionStatusMapping[];
  personColors?: Record<string, string>; // person name → hex color
  extraFields?: NotionExtraField[];
};

// ── Partenaires ───────────────────────────────────────────────────────────────

export type PartenairesConfig = {
  databaseId: string;
  titleField: string;
  shortCodeField: string;   // "Abrégé"
  etatSuivisField: string;  // champ formula Notion (affiché tel quel)
  typeField: string;        // multi_select (regroupement)
};

export type PartenaireEntry = {
  id: string;
  title: string;
  shortCode: string;
  etatSuivis: string;
  types: string[];
  notion_url?: string;
};

// ── Suivis ────────────────────────────────────────────────────────────────────

export type SuivisConfig = {
  databaseId: string;
  titleField: string;
  suivisField: string;          // select
  projetsField: string;         // relation → titres résolus
  partenairesField: string;     // relation → titres résolus
  contactField: string;         // relation ou people
  lastActionDateField?: string; // champ date Notion ; created_time pour Date création
};

export type SuiviEntry = {
  id: string;
  title: string;
  suivi: string;
  projets: string[];
  partenaires: string[];
  contact: string[];
  createdTime: string | null;
  lastActionDate: string | null;
  notion_url?: string;
};

// ── Briefing ───────────────────────────────────────────────────────────────────

export type BriefingConfig = {
  databaseId: string;
  titleField: string;
  dateField: string;
  summaryField: string;
  statusField?: string;   // champ État à filtrer
  statusDoneValue?: string; // valeur à exclure (défaut : "Terminé")
};

export type BriefingEntry = {
  id: string;
  title: string;
  date: string | null;
  summary: string;
  createdTime?: string;
};

export type NotionRichText = {
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
};

export type NotionBlock = {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
};
