import type {
  AssociationEntry,
  BriefingEntry,
  ClientEntry,
  DocumentEntry,
  EchangeEntry,
  NotionBlock,
  PartenaireEntry,
  PostItEntry,
  ProjetEntry,
  SousTacheEntry,
  SuiviEntry,
  SuiviProjetEntry,
  TacheEntry,
  TempsEntry,
  TempsProjetEntry,
  TicketEntry,
} from './types';

export type DemoProjectData = {
  taches: TacheEntry[];
  sousTaches: SousTacheEntry[];
  suiviProjets: SuiviProjetEntry[];
  documents: DocumentEntry[];
  tempsProjets: TempsProjetEntry[];
  echanges: EchangeEntry[];
};

export type DemoStore = {
  briefings: BriefingEntry[];
  postits: PostItEntry[];
  partenaires: PartenaireEntry[];
  suivis: SuiviEntry[];
  temps: TempsEntry[];
  tickets: TicketEntry[];
  associations: AssociationEntry[];
  clients: ClientEntry[];
  projets: ProjetEntry[];
  capProjects: Record<string, DemoProjectData>;
  blocks: Record<string, NotionBlock[]>;
};

let _store: DemoStore | null = null;

export const setDemoStore = (d: DemoStore): void => { _store = d; };
export const getDemoStore = (): DemoStore | null => _store;
