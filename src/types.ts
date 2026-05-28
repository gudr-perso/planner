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
