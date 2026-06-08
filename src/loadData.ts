import * as XLSX from 'xlsx';
import type {
  AssociationEntry,
  BriefingEntry,
  ClientEntry,
  DataBundle,
  DocumentEntry,
  EchangeEntry,
  GoogleEvent,
  NotionBlock,
  PartenaireEntry,
  Person,
  PostItEntry,
  Project,
  ProjetEntry,
  SousTacheEntry,
  SubProject,
  SuiviEntry,
  SuiviProjetEntry,
  TacheEntry,
  Task,
  TempsEntry,
  TempsProjetEntry,
  TicketEntry,
} from './types';
import type { DemoStore, DemoProjectData } from './demoData';

const parseArr = (val: unknown): string[] =>
  String(val || '').split('|').map(s => s.trim()).filter(Boolean);

const parseBlocks = (val: unknown): NotionBlock[] => {
  if (!val) return [];
  try { return JSON.parse(String(val)) as NotionBlock[]; }
  catch { return []; }
};

const str = (v: unknown) => String(v || '');

export type FullDemoData = DataBundle & { demoExtras: DemoStore };

export async function loadDemoData(url = '/demo-data.xlsx'): Promise<FullDemoData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cannot fetch demo data: ${res.status}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const sheetOpt = { defval: '' };
  const sheet = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, sheetOpt);
  };
  const sheetOrThrow = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Sheet "${name}" missing`);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, sheetOpt);
  };

  // ── Planning data (required) ─────────────────────────────────────────────────

  const projects = sheetOrThrow('Projects') as unknown as Project[];
  const people = sheetOrThrow('People') as unknown as Person[];

  const rawSubprojects = sheet('SubProjects');
  const subprojects: SubProject[] = rawSubprojects.map(r => ({
    id: str(r.id), name: str(r.name), project_id: str(r.project_id),
  }));

  const tasks: Task[] = sheetOrThrow('Tasks').map(row => ({
    id: str(row.id),
    project_id: str(row.project_id),
    subproject_id: str(row.subproject_id) || undefined,
    title: str(row.title),
    start_date: row.start_date ? str(row.start_date) : null,
    end_date: row.end_date ? str(row.end_date) : null,
    assignee_id: str(row.assignee_id),
    status: str(row.status) as Task['status'],
    planned: Number(row.planned) === 1,
  }));

  const googleEvents: GoogleEvent[] = sheetOrThrow('GoogleEvents').map(row => ({
    id: str(row.id),
    title: str(row.title),
    start: str(row.start),
    end: str(row.end),
    attendees: str(row.attendees).split(',').map(s => s.trim()).filter(Boolean),
  }));

  // ── CUMA demo data (optional sheets) ────────────────────────────────────────

  const blocks: Record<string, NotionBlock[]> = {};

  const briefings: BriefingEntry[] = sheet('Briefing').map(r => {
    const blks = parseBlocks(r.blocks_json);
    if (blks.length) blocks[str(r.id)] = blks;
    return {
      id: str(r.id), title: str(r.title),
      date: str(r.date) || null, summary: str(r.summary),
    };
  });

  const postits: PostItEntry[] = sheet('PostIts').map(r => {
    const blks = parseBlocks(r.blocks_json);
    if (blks.length) blocks[str(r.id)] = blks;
    return {
      id: str(r.id), title: str(r.title),
      createdTime: str(r.createdTime) || null,
      dueDate: str(r.dueDate) || null,
      status: str(r.status),
      statusColor: str(r.statusColor) || undefined,
    };
  });

  const partenaires: PartenaireEntry[] = sheet('Partenaires').map(r => {
    const iconRaw = str(r.icon_json);
    return {
      id: str(r.id), title: str(r.title),
      shortCode: str(r.shortCode), etatSuivis: str(r.etatSuivis),
      types: parseArr(r.types),
      icon: iconRaw ? (() => { try { return JSON.parse(iconRaw); } catch { return undefined; } })() : undefined,
    };
  });

  const suivis: SuiviEntry[] = sheet('Suivis').map(r => {
    const blks = parseBlocks(r.blocks_json);
    if (blks.length) blocks[str(r.id)] = blks;
    return {
      id: str(r.id), title: str(r.title),
      suivi: str(r.suivi), suiviColor: str(r.suiviColor),
      projets: parseArr(r.projets), partenaires: parseArr(r.partenaires),
      contact: parseArr(r.contact),
      createdTime: str(r.createdTime) || null,
      lastActionDate: str(r.lastActionDate) || null,
    };
  });

  const temps: TempsEntry[] = sheet('Temps').map(r => ({
    id: str(r.id), title: str(r.title),
    start: str(r.start) || null, end: str(r.end) || null,
    dureeH: str(r.dureeH), dureeMin: str(r.dureeMin),
    commentaire: str(r.commentaire),
    projets: parseArr(r.projets), sousProjets: parseArr(r.sousProjets),
  }));

  const associations: AssociationEntry[] = sheet('Associations').map(r => ({
    id: str(r.id), nom: str(r.nom), code: str(r.code),
    statut: str(r.statut), priorite: str(r.priorite),
    solution: str(r.solution), suivi: str(r.suivi),
  }));

  const tickets: TicketEntry[] = sheet('Tickets').map(r => ({
    id: str(r.id), ticketId: str(r.ticketId), sujet: str(r.sujet),
    codeAssoc: str(r.codeAssoc), statut: str(r.statut), priorite: str(r.priorite),
    niveau: str(r.niveau), dateModif: str(r.dateModif) || null,
    demandeur: str(r.demandeur), lien: str(r.lien), zone: str(r.zone),
    memo: str(r.memo), codeDossier: str(r.codeDossier),
    categorie: str(r.categorie), sousCategorie: str(r.sousCategorie),
    conclusion: str(r.conclusion), departement: str(r.departement),
    associationId: str(r.associationId), associationName: str(r.associationName),
  }));

  // ── CAP demo data (optional sheets) ─────────────────────────────────────────

  const clients: ClientEntry[] = sheet('CAP_Clients').map(r => ({
    id: str(r.id), titre: str(r.titre), codeTiers: str(r.codeTiers), lieu: str(r.lieu),
  }));

  const projets: ProjetEntry[] = sheet('CAP_Projets').map(r => ({
    id: str(r.id), nom: str(r.nom), tiers: str(r.tiers), tiersId: str(r.tiersId),
    typeProjet: str(r.typeProjet), dateDebut: str(r.dateDebut) || null,
    statut: str(r.statut), statutColor: str(r.statutColor) || undefined,
    codeProjet: str(r.codeProjet) || undefined,
  }));

  // CAP sub-data grouped by projetId
  const capProjects: Record<string, DemoProjectData> = {};
  const ensureCap = (pid: string): DemoProjectData => {
    if (!capProjects[pid]) capProjects[pid] = { taches: [], sousTaches: [], suiviProjets: [], documents: [], tempsProjets: [], echanges: [] };
    return capProjects[pid];
  };

  sheet('CAP_Taches').forEach(r => {
    const pid = str(r.projetId);
    const entry: TacheEntry = {
      id: str(r.id), nom: str(r.nom), canal: str(r.canal), canalColor: str(r.canalColor) || undefined,
      statut: str(r.statut), statutColor: str(r.statutColor) || undefined,
      priorite: str(r.priorite), prioriteColor: str(r.prioriteColor) || undefined,
      dateEcheance: str(r.dateEcheance) || null, planifieLe: str(r.planifieLe) || null,
      suivis: parseArr(r.suivis),
    };
    ensureCap(pid).taches.push(entry);
  });

  sheet('CAP_SousTaches').forEach(r => {
    const pid = str(r.projetId);
    const entry: SousTacheEntry = {
      id: str(r.id), nom: str(r.nom),
      statut: str(r.statut), statutColor: str(r.statutColor) || undefined,
      priorite: str(r.priorite), prioriteColor: str(r.prioriteColor) || undefined,
      canal: str(r.canal), canalColor: str(r.canalColor) || undefined,
      date: str(r.date) || null,
      tacheIds: [], tacheNoms: parseArr(r.tacheNoms),
    };
    ensureCap(pid).sousTaches.push(entry);
  });

  sheet('CAP_SuiviProjet').forEach(r => {
    const pid = str(r.projetId);
    const entry: SuiviProjetEntry = {
      id: str(r.id), nom: str(r.nom),
      date: str(r.date) || null,
      statut: str(r.statut), statutColor: str(r.statutColor) || undefined,
      tacheIds: [], tacheNoms: parseArr(r.tacheNoms),
    };
    ensureCap(pid).suiviProjets.push(entry);
  });

  sheet('CAP_Echanges').forEach(r => {
    const pid = str(r.projetId);
    const entry: EchangeEntry = {
      id: str(r.id), nom: str(r.nom),
      date: str(r.date) || null,
      canal: str(r.canal), canalColor: str(r.canalColor) || undefined,
      contact: parseArr(r.contact), suivi: parseArr(r.suivi),
      tacheNoms: parseArr(r.tacheNoms),
    };
    ensureCap(pid).echanges.push(entry);
  });

  sheet('CAP_Documents').forEach(r => {
    const pid = str(r.projetId);
    const blks = parseBlocks(r.blocks_json);
    const id = str(r.id);
    if (blks.length) blocks[id] = blks;
    const entry: DocumentEntry = {
      id, nom: str(r.nom),
      statut: str(r.statut), statutColor: str(r.statutColor) || undefined,
      date: str(r.date) || undefined,
      projet: str(r.projet) || undefined,
    };
    ensureCap(pid).documents.push(entry);
  });

  sheet('CAP_TempsProjet').forEach(r => {
    const pid = str(r.projetId);
    const entry: TempsProjetEntry = {
      id: str(r.id), description: str(r.description),
      debut: str(r.debut) || null, fin: str(r.fin) || null,
      dureeMin: str(r.dureeMin), dureeH: str(r.dureeH),
      tacheIds: [], tacheNoms: parseArr(r.tacheNoms),
      facturable: Number(r.facturable) === 1,
      facturableH: str(r.facturableH) || undefined,
    };
    ensureCap(pid).tempsProjets.push(entry);
  });

  const demoExtras: DemoStore = {
    briefings, postits, partenaires, suivis, temps, tickets, associations,
    clients, projets, capProjects, blocks,
  };

  return { projects, subprojects: subprojects.length ? subprojects : undefined, people, tasks, googleEvents, demoExtras };
}
