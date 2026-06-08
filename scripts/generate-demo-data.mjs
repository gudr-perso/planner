// Generates public/demo-data.xlsx with full demo data for all views.
// Run with: node scripts/generate-demo-data.mjs
import * as XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TODAY = new Date('2026-06-08T09:00:00');

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const fmtDT = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isoAgo = (days) => iso(addDays(TODAY, -days));

// ── Block helpers ─────────────────────────────────────────────────────────────

function rt(text) {
  return [{
    type: 'text', plain_text: text, href: null,
    text: { content: text },
    annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
  }];
}
function blk(type, text) {
  return { id: '', type, has_children: false, [type]: { rich_text: rt(text), color: 'default' } };
}
function h2(text) { return blk('heading_2', text); }
function h3(text) { return blk('heading_3', text); }
function p(text)  { return blk('paragraph', text); }
function li(text) { return blk('bulleted_list_item', text); }
function ni(text) { return blk('numbered_list_item', text); }
function div_()   { return { id: '', type: 'divider', has_children: false, divider: {} }; }

function mblocks(...items) {
  return JSON.stringify(items.map((item, i) => ({ ...item, id: `bk${String(i+1).padStart(3,'0')}` })));
}

// ── Projects & People ─────────────────────────────────────────────────────────

const projects = [
  { id: 'P1', name: 'Refonte site web',   color: '#3b82f6' },
  { id: 'P2', name: 'Lancement produit X', color: '#10b981' },
  { id: 'P3', name: 'Migration ERP',       color: '#f59e0b' },
];

const people = [
  { id: 'U1', name: 'Guillaume', role: 'Moi',     color: '#7c3aed' },
  { id: 'U2', name: 'Marie',     role: 'Dev',      color: '#ec4899' },
  { id: 'U3', name: 'Thomas',    role: 'Externe',  color: '#0ea5e9' },
];

// ── SubProjects ───────────────────────────────────────────────────────────────

const subprojects = [
  { id: 'SP1', name: 'Phase 1 – Analyse & maquettes', project_id: 'P1' },
  { id: 'SP2', name: 'Phase 2 – Développement',       project_id: 'P1' },
  { id: 'SP3', name: 'Phase 1 – Backend API',          project_id: 'P2' },
];

// ── Tasks (original + extended to Dec 2026) ───────────────────────────────────

const plannedTasks = [
  // P1 Refonte site web
  ['T01', 'P1', '',    'Audit UX site actuel',                  0,   4, 'U1', 'done'],
  ['T02', 'P1', 'SP1', 'Wireframes nouvelle home',              5,  12, 'U1', 'in_progress'],
  ['T03', 'P1', 'SP1', 'Maquettes Figma pages clés',           10,  22, 'U2', 'in_progress'],
  ['T04', 'P1', '',    'Validation client maquettes',           23,  25, 'U1', 'todo'],
  ['T05', 'P1', 'SP2', 'Intégration HTML/CSS',                 26,  55, 'U2', 'todo'],
  ['T06', 'P1', 'SP2', 'Migration contenu',                    45,  60, 'U3', 'todo'],
  ['T07', 'P1', 'SP2', 'Mise en ligne + redirections',         61,  68, 'U2', 'todo'],
  ['T08', 'P1', '',    'Optimisation performances',            75,  90, 'U2', 'todo'],
  ['T09', 'P1', '',    'Campagne SEO post-lancement',          91, 120, 'U3', 'todo'],
  ['T10', 'P1', '',    'Bilan 3 mois post-lancement',         125, 130, 'U1', 'todo'],
  ['T11', 'P1', '',    'Préparation budget 2027',             160, 180, 'U1', 'todo'],

  // P2 Lancement produit X
  ['T12', 'P2', '',    'Cadrage offre commerciale',             8,  20, 'U1', 'todo'],
  ['T13', 'P2', 'SP3', 'Dev backend API produit',             21,  70, 'U2', 'todo'],
  ['T14', 'P2', '',    'Création visuels marketing',           30,  50, 'U3', 'todo'],
  ['T15', 'P2', '',    'Recrutement développeur senior',       80, 110, 'U1', 'todo'],
  ['T16', 'P2', '',    'Beta test utilisateurs',               75,  95, 'U1', 'todo'],
  ['T17', 'P2', '',    'Lancement officiel',                  100, 102, 'U1', 'todo'],
  ['T18', 'P2', '',    'Onboarding premiers clients',         103, 130, 'U2', 'todo'],
  ['T19', 'P2', '',    'Correctifs v1.1',                     108, 125, 'U2', 'todo'],
  ['T20', 'P2', '',    'Roadmap v2.0',                        135, 165, 'U1', 'todo'],

  // P3 Migration ERP
  ['T21', 'P3', '',    'Cartographie données existantes',      15,  35, 'U3', 'in_progress'],
  ['T22', 'P3', '',    'Spec techniques migration',            36,  55, 'U2', 'todo'],
  ['T23', 'P3', '',    'Dev scripts ETL',                      56, 110, 'U2', 'blocked'],
  ['T24', 'P3', '',    'Recette comptable',                   111, 135, 'U1', 'todo'],
  ['T25', 'P3', '',    'Bascule production',                  140, 145, 'U3', 'todo'],
  ['T26', 'P3', '',    'Formation utilisateurs finaux',       150, 165, 'U1', 'todo'],
  ['T27', 'P3', '',    'Clôture projet & bilan',              166, 172, 'U1', 'todo'],
  ['T28', 'P3', '',    'Audit post-migration',                176, 205, 'U3', 'todo'],
  ['T29', 'P3', '',    'Documentation maintenance',           195, 215, 'U2', 'todo'],
].map(([id, projectId, subprojectId, title, ds, de, assignee, status]) => ({
  id,
  project_id: projectId,
  subproject_id: subprojectId || '',
  title,
  start_date: iso(addDays(TODAY, ds)),
  end_date: iso(addDays(TODAY, de)),
  assignee_id: assignee,
  status,
  planned: 1,
}));

const unplannedTasks = [
  ['U01', 'P1', 'Optimisation SEO technique',         'U2', 'todo'],
  ['U02', 'P1', 'Refonte page tarifs',                'U1', 'todo'],
  ['U03', 'P2', 'Étude marché concurrent',            'U1', 'todo'],
  ['U04', 'P2', 'Plan de communication presse',       'U3', 'todo'],
  ['U05', 'P2', 'Préparation pitch investisseurs',    'U1', 'todo'],
  ['U06', 'P3', 'Documentation utilisateur',          'U2', 'todo'],
  ['U07', 'P3', 'Plan de reprise après incident',     'U3', 'todo'],
].map(([id, projectId, title, assignee, status]) => ({
  id, project_id: projectId, subproject_id: '', title,
  start_date: '', end_date: '', assignee_id: assignee, status, planned: 0,
}));

const allTasks = [...plannedTasks, ...unplannedTasks];

// ── Google Calendar events ────────────────────────────────────────────────────

const googleEvents = [
  ['G01', 'Daily équipe',              at(addDays(TODAY, 1),  9,30), at(addDays(TODAY, 1), 10, 0), 'U1,U2'],
  ['G02', 'RDV client Refonte',        at(addDays(TODAY, 3), 14, 0), at(addDays(TODAY, 3), 15,30), 'U1,U3'],
  ['G03', 'Démo sprint',               at(addDays(TODAY, 7), 16, 0), at(addDays(TODAY, 7), 17, 0), 'U1,U2,U3'],
  ['G04', 'Comité de pilotage',        at(addDays(TODAY,14), 10, 0), at(addDays(TODAY,14), 12, 0), 'U1'],
  ['G05', 'Atelier UX produit X',      at(addDays(TODAY,18),  9, 0), at(addDays(TODAY,18), 12, 0), 'U1,U2'],
  ['G06', 'Déjeuner partenaire',       at(addDays(TODAY,22), 12,30), at(addDays(TODAY,22), 14, 0), 'U1'],
  ['G07', 'Rétro mensuelle',           at(addDays(TODAY,30), 15, 0), at(addDays(TODAY,30), 17, 0), 'U1,U2,U3'],
  ['G08', 'Formation Notion équipe',   at(addDays(TODAY,42), 14, 0), at(addDays(TODAY,42), 16, 0), 'U2,U3'],
  ['G09', 'Revue budget Q3',           at(addDays(TODAY,55), 10, 0), at(addDays(TODAY,55), 11,30), 'U1'],
  ['G10', 'Workshop migration ERP',    at(addDays(TODAY,65),  9, 0), at(addDays(TODAY,65), 17, 0), 'U1,U2,U3'],
  ['G11', 'Conférence sectorielle',    at(addDays(TODAY,88),  9, 0), at(addDays(TODAY,88), 18, 0), 'U1'],
  ['G12', 'Bilan annuel client',       at(addDays(TODAY,120),14, 0), at(addDays(TODAY,120),16, 0), 'U1,U3'],
  ['G13', 'Sprint review Q3',          at(addDays(TODAY,95), 14, 0), at(addDays(TODAY,95), 16, 0), 'U1,U2'],
  ['G14', 'Séminaire équipe',          at(addDays(TODAY,140), 9, 0), at(addDays(TODAY,140),18, 0), 'U1,U2,U3'],
].map(([id, title, start, end, attendees]) => ({
  id, title, start: fmtDT(start), end: fmtDT(end), attendees,
}));

// ── CUMA : Briefing ───────────────────────────────────────────────────────────

const briefings = [
  {
    id: 'BR1',
    title: "AG ordinaire – bilan exercice 2025",
    date: '2026-03-20',
    summary: 'Approbation des comptes, vote plan investissement matériel 2026',
    blocks_json: mblocks(
      h2('Points abordés'),
      ni('Présentation des comptes 2025 : excédent de 12 400 €'),
      ni('Rapport du commissaire aux comptes : quitus donné'),
      ni('Vote plan d\'investissement 2026 : tracteur JD8R approuvé (budget 285 000 €)'),
      ni('Élection CA : 3 membres renouvelés'),
      h2('Décisions votées'),
      p('Budget investissement 2026 validé. Autorisation accordée au Président de négocier le crédit-bail avec la Banque Agricole du Rhin.'),
    ),
  },
  {
    id: 'BR2',
    title: "Comité de pilotage – renouvellement parc tracteurs",
    date: '2026-04-15',
    summary: 'Validation devis tracteurs John Deere, budget 285 000 €',
    blocks_json: mblocks(
      h2('Ordre du jour'),
      li('Validation devis tracteur John Deere 6R 185'),
      li('Arbitrage financement crédit-bail vs achat comptant'),
      li('Planning livraison et mise en service'),
      h2('Décisions'),
      p('Devis John Deere validé à 145 000 € HT. Négociation crédit-bail 5 ans confiée à M. Zimmermann. Livraison souhaitée avant les moissons (juillet 2026).'),
    ),
  },
  {
    id: 'BR3',
    title: "Point hebdo – digitalisation adhérents",
    date: '2026-05-28',
    summary: 'Avancement appli mobile, connexion API préfecture, démo prévue',
    blocks_json: mblocks(
      h2('Avancement'),
      p('Appli mobile : développement en cours (75 % du module réservations). Livraison prévue semaine 30.'),
      h2('Points à traiter'),
      li('API Préfecture : tests d\'intégration en attente d\'accès (demande formulée le 20 mai)'),
      li('Démo appli : planifier entre le 15 et 25 juillet pour le CA'),
      li('Mise à jour emails adhérents : campagne de collecte à préparer (objectif 80 %)'),
    ),
  },
  {
    id: 'BR4',
    title: "Réunion budget – plan prévisionnel 2026-2027",
    date: '2026-06-05',
    summary: 'Présentation CA, ajustement cotisations, plan pluriannuel validé en principe',
    blocks_json: mblocks(
      h2('Synthèse des échanges'),
      p('Présentation du plan prévisionnel 2 ans. Trésorerie solide (réserves 85 000 €). Investissements prévus : tracteur (145 k€) + améliorations bâtiment hangar (22 k€).'),
      h2('Points de vigilance'),
      li('Cotisation 2027 : hausse de 5 % proposée pour absorber le remboursement crédit-bail'),
      li('Subventions attendues : PCAE ≈ 22 k€, LEADER ≈ 8 k€ (dossier en cours)'),
      h2('Suite'),
      p('Vote final prévu lors de l\'AG extraordinaire du 2 septembre 2026.'),
    ),
  },
];

// ── CUMA : Post-its ───────────────────────────────────────────────────────────

const postits = [
  {
    id: 'PI1',
    title: "Relancer Agro-Parts pour devis pneumatiques",
    createdTime: `${isoAgo(19)}T10:00:00.000Z`,
    dueDate: iso(addDays(TODAY, 7)),
    status: 'En cours',
    statusColor: 'orange',
    blocks_json: mblocks(
      p('Devis demandé verbalement le 20 mai. Pas de retour à ce jour.'),
      p('Contact : M. Faber – 03 89 xx xx xx'),
    ),
  },
  {
    id: 'PI2',
    title: "Vérifier attestation Urssaf avant AG de juillet",
    createdTime: `${isoAgo(7)}T09:00:00.000Z`,
    dueDate: iso(addDays(TODAY, 23)),
    status: 'À faire',
    statusColor: 'gray',
    blocks_json: mblocks(
      p('Attestation annuelle à demander avant le 1er juillet pour l\'AG.'),
      li('Vérifier sur Net-Entreprises rubrique « Attestations »'),
      li('Imprimer et joindre au dossier AG'),
    ),
  },
  {
    id: 'PI3',
    title: "Réserver salle Mairie pour réunion adhérents sept.",
    createdTime: `${isoAgo(4)}T14:30:00.000Z`,
    dueDate: iso(addDays(TODAY, 22)),
    status: 'À faire',
    statusColor: 'gray',
    blocks_json: mblocks(
      p('Réunion adhérents prévue semaine du 7 septembre 2026.'),
      p('Contacter Secrétariat Mairie de Gundolsheim – Tel : 03 89 yy yy yy'),
    ),
  },
];

// ── CUMA : Partenaires ────────────────────────────────────────────────────────

const partenaires = [
  {
    id: 'PA1',
    title: "Coopérative du Grand-Est",
    shortCode: 'CGE',
    etatSuivis: '[Ouverts : 2] [En cours : 1]',
    types: 'Partenaire|Institution',
    icon_json: JSON.stringify({ type: 'emoji', emoji: '🌾' }),
  },
  {
    id: 'PA2',
    title: "Agro-Parts SARL",
    shortCode: 'AGP',
    etatSuivis: '[Ouverts : 1]',
    types: 'Fournisseur',
    icon_json: JSON.stringify({ type: 'emoji', emoji: '⚙️' }),
  },
  {
    id: 'PA3',
    title: "Chambre d'Agriculture 68",
    shortCode: 'CA68',
    etatSuivis: '[En cours : 1] [Clôturés : 1]',
    types: 'Institution',
    icon_json: JSON.stringify({ type: 'emoji', emoji: '🏛️' }),
  },
  {
    id: 'PA4',
    title: "Banque Agricole du Rhin",
    shortCode: 'BAR',
    etatSuivis: '[Ouverts : 1] [En cours : 2]',
    types: 'Partenaire',
    icon_json: JSON.stringify({ type: 'emoji', emoji: '🏦' }),
  },
];

// ── CUMA : Suivis (avec blocks_json) ──────────────────────────────────────────

const suivis = [
  {
    id: 'SV1',
    title: "Fourniture pièces hydrauliques JD8R",
    suivi: 'En cours',
    suiviColor: 'orange',
    projets: 'Migration ERP',
    partenaires: 'Agro-Parts SARL',
    contact: 'Pierre Muller',
    createdTime: `${isoAgo(24)}T10:00:00.000Z`,
    lastActionDate: isoAgo(5),
    blocks_json: mblocks(
      h2('Dernier contact'),
      p('Appel téléphonique du 3 juin 2026 avec M. Faber (Agro-Parts SARL). Devis pour 3 kits de joints hydrauliques reçu par email le même jour.'),
      h2('Actions en cours'),
      li('Devis analysé et validé par le CA le 5 juin – bon de commande en préparation'),
      li('Délai de livraison estimé : 10 jours ouvrés'),
      li('Tracteur JD8R maintenu en service réduit en attendant la réparation'),
      h2('Prochaine étape'),
      p('Envoyer le bon de commande à Agro-Parts avant le 10 juin. Suivi livraison prévu pour la semaine du 22 juin.'),
    ),
  },
  {
    id: 'SV2',
    title: "Subvention PCAE équipements irrigation",
    suivi: 'En attente',
    suiviColor: 'blue',
    projets: 'Lancement produit X',
    partenaires: "Chambre d'Agriculture 68",
    contact: 'Sophie Lienhard',
    createdTime: `${isoAgo(68)}T09:00:00.000Z`,
    lastActionDate: isoAgo(11),
    blocks_json: mblocks(
      h2('État du dossier'),
      p('Dossier PCAE déposé le 15 avril 2026 auprès de la Chambre d\'Agriculture 68. Dossier déclaré complet le 2 mai.'),
      h2('Documents transmis'),
      li('Attestation d\'assurance matériel (transmise le 2 mai)'),
      li('Devis fournisseur actualisé (reçu le 28 mai, conforme)'),
      li('Plan de financement et relevé IBAN CUMA'),
      h2('Calendrier prévisionnel'),
      p('Instruction dossier : fin juin 2026. Décision préfectorale : avant le 31 juillet. Subvention potentielle : 35 % du coût HT, soit environ 22 750 €.'),
    ),
  },
  {
    id: 'SV3',
    title: "Renouvellement parc tracteurs 2026-2027",
    suivi: 'Ouvert',
    suiviColor: 'default',
    projets: '',
    partenaires: 'Banque Agricole du Rhin|Agro-Parts SARL',
    contact: 'Marc Zimmermann',
    createdTime: `${isoAgo(99)}T09:00:00.000Z`,
    lastActionDate: isoAgo(3),
    blocks_json: mblocks(
      h2('Contexte'),
      p('Plan pluriannuel de renouvellement : 3 tracteurs à remplacer sur 2 ans. Priorité 2026 : JD8R (12 ans, 9 500 h moteur).'),
      h2('Avancement du processus'),
      ni('Comparatif technique réalisé : John Deere 6R 185 vs Fendt 718 Vario'),
      ni('Négociation prix avec concessionnaire Mulhouse : remise de 4 % obtenue'),
      ni('Vote AG mars 2026 : acquisition JD8R approuvée à 78 % des voix'),
      h2('Points ouverts'),
      li('Financement : arbitrage crédit-bail 5 ans vs achat comptant (réponse attendue de la BAR)'),
      li('Reprise ancienne machine : estimation concessionnaire 28 000 € HT'),
      h2('Budget estimatif'),
      p('Nouveau tracteur JD 6R 185 : 145 000 € HT. Après reprise (28 k€) et subvention PCAE (≈ 20 k€) : coût net ≈ 97 000 € HT.'),
    ),
  },
  {
    id: 'SV4',
    title: "Plan de communication numérique adhérents",
    suivi: 'En cours',
    suiviColor: 'green',
    projets: 'Refonte site web',
    partenaires: 'Coopérative du Grand-Est',
    contact: '',
    createdTime: `${isoAgo(54)}T14:00:00.000Z`,
    lastActionDate: isoAgo(7),
    blocks_json: mblocks(
      h2('Objectifs'),
      p('Moderniser la communication de la CUMA envers ses 235 adhérents : newsletter mensuelle, appli mobile, site web refait.'),
      h2('Décisions prises'),
      li('Newsletter : outil retenu Mailchimp (gratuit jusqu\'à 500 contacts)'),
      li('Appli mobile : développement confié à Alsace Numérique, livraison T3 2026'),
      li('Site web : refonte planifiée septembre-octobre 2026'),
      h2('Indicateurs à suivre'),
      p('Cible 80 % d\'adhérents avec email d\'ici fin 2026. État actuel : 63 % (148/235). Prochain point de suivi : fin juillet 2026.'),
    ),
  },
  {
    id: 'SV5',
    title: "Convention partenariat Chambre d'Agriculture 68",
    suivi: 'Clôturé',
    suiviColor: 'gray',
    projets: '',
    partenaires: "Chambre d'Agriculture 68",
    contact: 'André Kessler',
    createdTime: `${isoAgo(118)}T09:00:00.000Z`,
    lastActionDate: isoAgo(24),
    blocks_json: mblocks(
      h2('Objet de la convention'),
      p('Renouvellement de la convention de partenariat avec la Chambre d\'Agriculture 68 pour l\'accompagnement technique des adhérents de la CUMA.'),
      h2('Termes de la convention signée'),
      li('Durée : 3 ans (2026-2028)'),
      li('Prestations : 2 journées de conseil/an + accès formations Chambre'),
      li('Contribution CUMA : 1 500 €/an + mise à disposition de la salle'),
      h2('Statut et prochaine échéance'),
      p('Convention signée le 15 mai 2026. Première prestation planifiée le 18 septembre 2026 : formation irrigation de précision. 12 participants préinscrits.'),
    ),
  },
];

// ── CUMA : Temps ──────────────────────────────────────────────────────────────

const temps = [
  { id:'TM1', title:'Coordination gestion matériel', start:`${isoAgo(6)} 09:00`, end:`${isoAgo(6)} 11:00`, dureeH:'2', dureeMin:'0', commentaire:'Réunion mensuelle équipe', projets:'Gestion administrative CUMA', sousProjets:'' },
  { id:'TM2', title:'Préparation dossier PCAE',       start:`${isoAgo(5)} 14:00`, end:`${isoAgo(5)} 17:30`, dureeH:'3', dureeMin:'30', commentaire:'Mise en forme pièces justificatives', projets:'Maintenance matériel', sousProjets:'' },
  { id:'TM3', title:'Entretien tracteur JD8R',        start:`${isoAgo(4)} 08:00`, end:`${isoAgo(4)} 12:00`, dureeH:'4', dureeMin:'0', commentaire:'Révision 500h + vidange', projets:'Maintenance matériel', sousProjets:'' },
  { id:'TM4', title:'Réunion CA mensuelle',           start:`${isoAgo(3)} 18:30`, end:`${isoAgo(3)} 20:30`, dureeH:'2', dureeMin:'0', commentaire:'CA ordinaire – points divers', projets:'Gestion administrative CUMA', sousProjets:'' },
  { id:'TM5', title:'Formation logiciel planning',    start:`${isoAgo(10)} 09:00`, end:`${isoAgo(10)} 12:00`, dureeH:'3', dureeMin:'0', commentaire:'Formation adhérents outil réservation en ligne', projets:'Digitalisation adhérents', sousProjets:'' },
  { id:'TM6', title:'Réparation circuit hydraulique', start:`${isoAgo(2)} 08:00`, end:`${isoAgo(2)} 16:00`, dureeH:'8', dureeMin:'0', commentaire:'Intervention prestataire + supervision CUMA', projets:'Maintenance matériel', sousProjets:'' },
  { id:'TM7', title:'Rédaction newsletter juin',      start:`${isoAgo(1)} 14:00`, end:`${isoAgo(1)} 16:00`, dureeH:'2', dureeMin:'0', commentaire:'Rédaction + envoi newsletter adhérents', projets:'Digitalisation adhérents', sousProjets:'' },
];

// ── CUMA : Tickets & Associations ─────────────────────────────────────────────

const associations = [
  { id:'ASS1', nom:'Coopérative du Grand-Est', code:'CGE', statut:'Partenaire actif', priorite:'Haute', solution:'Échanges matériel, formation', suivi:'Suivi régulier' },
  { id:'ASS2', nom:'Agro-Parts SARL',          code:'AGP', statut:'Fournisseur actif', priorite:'Normale', solution:'Fourniture pièces détachées', suivi:'Sur demande' },
  { id:'ASS3', nom:'Banque Agricole du Rhin',  code:'BAR', statut:'Partenaire financier', priorite:'Haute', solution:'Financement équipements, crédit-bail', suivi:'Trimestriel' },
  { id:'ASS4', nom:"Chambre d'Agriculture 68", code:'CA68', statut:'Institution partenaire', priorite:'Normale', solution:'Conseil technique, formation', suivi:'Annuel' },
];

const tickets = [
  { id:'TK1', ticketId:'TK-001', sujet:'Panne circuit hydraulique JD8R', codeAssoc:'CGE', statut:'En cours', priorite:'Haute', niveau:'Majeur', dateModif:isoAgo(6), demandeur:'Pierre Muller', lien:'', zone:'Matériel', memo:'Tracteur JD8R immobilisé depuis le 01/06. Intervenant Agro-Parts contacté.', codeDossier:'MAT-2026-031', categorie:'Panne', sousCategorie:'Hydraulique', conclusion:'', departement:'Maintenance', associationId:'ASS1', associationName:'Coopérative du Grand-Est' },
  { id:'TK2', ticketId:'TK-002', sujet:'Dysfonctionnement module export Télago', codeAssoc:'AGP', statut:'Ouvert', priorite:'Normale', niveau:'Mineur', dateModif:isoAgo(9), demandeur:'Jean-Claude Weber', lien:'', zone:'Logiciel', memo:'Export CSV défaillant depuis mise à jour v4.2.', codeDossier:'LOG-2026-018', categorie:'Logiciel', sousCategorie:'Export/Import', conclusion:'', departement:'SI', associationId:'ASS2', associationName:'Agro-Parts SARL' },
  { id:'TK3', ticketId:'TK-003', sujet:'Erreur facturation adhérent GAEC Schmitt', codeAssoc:'BAR', statut:'Résolu', priorite:'Normale', niveau:'Mineur', dateModif:isoAgo(19), demandeur:'Mathieu Rapp', lien:'', zone:'Administratif', memo:'Double facturation corrigée, avoir émis.', codeDossier:'ADM-2026-012', categorie:'Facturation', sousCategorie:'Correction', conclusion:'Avoir de 320 € émis le 22/05', departement:'Comptabilité', associationId:'ASS3', associationName:'Banque Agricole du Rhin' },
  { id:'TK4', ticketId:'TK-004', sujet:'Conflit réservation tracteur semaine 24', codeAssoc:'CGE', statut:'Ouvert', priorite:'Haute', niveau:'Majeur', dateModif:isoAgo(3), demandeur:'René Ott', lien:'', zone:'Planning', memo:'2 adhérents ont réservé le même matériel sur les mêmes créneaux.', codeDossier:'PLA-2026-045', categorie:'Planning', sousCategorie:'Conflit réservation', conclusion:'', departement:'Coordination', associationId:'ASS1', associationName:'Coopérative du Grand-Est' },
  { id:'TK5', ticketId:'TK-005', sujet:'Demande attestation cotisation sociale annuelle', codeAssoc:'CA68', statut:'Qualifié', priorite:'Basse', niveau:'Mineur', dateModif:isoAgo(14), demandeur:'Nathalie Braun', lien:'', zone:'Administratif', memo:'Attestation à générer depuis l\'outil Carsat.', codeDossier:'ADM-2026-009', categorie:'Attestation', sousCategorie:'Social', conclusion:'', departement:'RH', associationId:'ASS4', associationName:"Chambre d'Agriculture 68" },
  { id:'TK6', ticketId:'TK-006', sujet:'Double saisie coordonnées GPS parcelles', codeAssoc:'AGP', statut:'Suspendu', priorite:'Basse', niveau:'Mineur', dateModif:isoAgo(21), demandeur:'Christian Fuchs', lien:'', zone:'Logiciel', memo:'Problème de synchronisation avec application SigPAC.', codeDossier:'LOG-2026-014', categorie:'Données', sousCategorie:'GPS/SIG', conclusion:'En attente mise à jour SigPAC (éditeur)', departement:'SI', associationId:'ASS2', associationName:'Agro-Parts SARL' },
  { id:'TK7', ticketId:'TK-007', sujet:'Déclaration subvention LEADER incorrecte', codeAssoc:'BAR', statut:'En cours', priorite:'Haute', niveau:'Majeur', dateModif:isoAgo(4), demandeur:'Isabelle Gasser', lien:'', zone:'Financier', memo:'Erreur de code NAF sur le formulaire. Recalcul en cours.', codeDossier:'FIN-2026-028', categorie:'Subvention', sousCategorie:'LEADER', conclusion:'', departement:'Finance', associationId:'ASS3', associationName:'Banque Agricole du Rhin' },
  { id:'TK8', ticketId:'TK-008', sujet:'Organisation session sécurité tracteur CACES R 482', codeAssoc:'CA68', statut:'Planifié', priorite:'Normale', niveau:'Normal', dateModif:isoAgo(7), demandeur:'Didier Metz', lien:'', zone:'Formation', memo:'Session prévue en octobre 2026. 8 participants identifiés.', codeDossier:'FOR-2026-007', categorie:'Formation', sousCategorie:'Sécurité CACES', conclusion:'', departement:'RH', associationId:'ASS4', associationName:"Chambre d'Agriculture 68" },
];

// ── CAP Consulting : Clients ──────────────────────────────────────────────────

const capClients = [
  { id:'CL1', titre:'Métal-Alsace SA',  codeTiers:'MA-001', lieu:'Mulhouse, 68100' },
  { id:'CL2', titre:'BioGranges Sàrl', codeTiers:'BG-002', lieu:'Colmar, 68000' },
  { id:'CL3', titre:'Holding LVT',     codeTiers:'LV-003', lieu:'Strasbourg, 67000' },
];

// ── CAP Consulting : Projets ──────────────────────────────────────────────────

const capProjets = [
  { id:'CP1', nom:'Audit organisationnel 2026', tiers:'Métal-Alsace SA', tiersId:'CL1', typeProjet:'Audit',    dateDebut:'2026-02-01', statut:'En cours', statutColor:'blue',   codeProjet:'PJ-1' },
  { id:'CP2', nom:'Stratégie RSE 2026-2028',    tiers:'BioGranges Sàrl', tiersId:'CL2', typeProjet:'Stratégie', dateDebut:'2026-03-15', statut:'En cours', statutColor:'green',  codeProjet:'PJ-2' },
  { id:'CP3', nom:'Plan de fusion LVT',         tiers:'Holding LVT',     tiersId:'CL3', typeProjet:'M&A',       dateDebut:'2026-05-01', statut:'En cours', statutColor:'orange', codeProjet:'PJ-3' },
];

// ── CAP : Tâches (projetId col pour groupage dans loadData) ───────────────────

const capTaches = [
  // CP1 – Audit Métal-Alsace
  { id:'TAC1', nom:'Entretiens dirigeants et COMEX',  canal:'Présentiel', canalColor:'blue',   statut:'Terminé',  statutColor:'gray',   priorite:'Haute',   prioriteColor:'red',    dateEcheance:'2026-03-15', planifieLe:'2026-02-15', suivis:'', projetId:'CP1' },
  { id:'TAC2', nom:'Analyse processus RH',            canal:'Hybride',    canalColor:'purple', statut:'Terminé',  statutColor:'gray',   priorite:'Haute',   prioriteColor:'red',    dateEcheance:'2026-04-01', planifieLe:'2026-03-01', suivis:'', projetId:'CP1' },
  { id:'TAC3', nom:'Benchmark sectoriel',             canal:'Remote',     canalColor:'green',  statut:'Terminé',  statutColor:'gray',   priorite:'Normale', prioriteColor:'orange', dateEcheance:'2026-04-15', planifieLe:'2026-03-15', suivis:'', projetId:'CP1' },
  { id:'TAC4', nom:'Rapport diagnostic final',        canal:'Présentiel', canalColor:'blue',   statut:'En cours', statutColor:'blue',   priorite:'Haute',   prioriteColor:'red',    dateEcheance:'2026-06-25', planifieLe:'2026-06-01', suivis:'', projetId:'CP1' },
  // CP2 – RSE BioGranges
  { id:'TAC5', nom:'Diagnostic RSE initial',          canal:'Présentiel', canalColor:'blue',   statut:'Terminé',  statutColor:'gray',   priorite:'Haute',   prioriteColor:'red',    dateEcheance:'2026-04-30', planifieLe:'2026-03-20', suivis:'', projetId:'CP2' },
  { id:'TAC6', nom:'Ateliers parties prenantes',      canal:'Présentiel', canalColor:'blue',   statut:'En cours', statutColor:'blue',   priorite:'Haute',   prioriteColor:'red',    dateEcheance:'2026-06-30', planifieLe:'2026-05-01', suivis:'', projetId:'CP2' },
  { id:'TAC7', nom:'Feuille de route RSE',            canal:'Hybride',    canalColor:'purple', statut:'À faire',  statutColor:'orange', priorite:'Normale', prioriteColor:'orange', dateEcheance:'2026-07-31', planifieLe:'', suivis:'', projetId:'CP2' },
  // CP3 – Fusion LVT
  { id:'TAC8', nom:'Due diligence financière',        canal:'Présentiel', canalColor:'blue',   statut:'En cours', statutColor:'blue',   priorite:'Urgente', prioriteColor:'red',    dateEcheance:'2026-06-30', planifieLe:'2026-05-15', suivis:'', projetId:'CP3' },
  { id:'TAC9', nom:'Analyse synergies',               canal:'Remote',     canalColor:'green',  statut:'À faire',  statutColor:'orange', priorite:'Haute',   prioriteColor:'red',    dateEcheance:'2026-07-15', planifieLe:'', suivis:'', projetId:'CP3' },
  { id:'TAC10', nom:'Plan d\'intégration',            canal:'Présentiel', canalColor:'blue',   statut:'À faire',  statutColor:'orange', priorite:'Normale', prioriteColor:'orange', dateEcheance:'2026-09-30', planifieLe:'', suivis:'', projetId:'CP3' },
];

// ── CAP : Sous-tâches ─────────────────────────────────────────────────────────

const capSousTaches = [
  { id:'ST1', nom:'Préparation grille entretiens',     statut:'Terminé',  statutColor:'gray',   priorite:'Normale', prioriteColor:'orange', canal:'Remote',     canalColor:'green', date:'2026-02-10', tacheNoms:'Entretiens dirigeants et COMEX', projetId:'CP1' },
  { id:'ST2', nom:'Transcription et analyse entretiens', statut:'Terminé', statutColor:'gray',  priorite:'Normale', prioriteColor:'orange', canal:'Remote',     canalColor:'green', date:'2026-03-20', tacheNoms:'Entretiens dirigeants et COMEX', projetId:'CP1' },
  { id:'ST3', nom:'Questionnaire RSE parties prenantes', statut:'Terminé', statutColor:'gray',  priorite:'Haute',   prioriteColor:'red',    canal:'Remote',     canalColor:'green', date:'2026-05-05', tacheNoms:'Ateliers parties prenantes',     projetId:'CP2' },
  { id:'ST4', nom:'Animation atelier fournisseurs',    statut:'En cours', statutColor:'blue',   priorite:'Haute',   prioriteColor:'red',    canal:'Présentiel', canalColor:'blue',  date:'2026-06-12', tacheNoms:'Ateliers parties prenantes',     projetId:'CP2' },
  { id:'ST5', nom:'Analyse comptable filiales',        statut:'En cours', statutColor:'blue',   priorite:'Urgente', prioriteColor:'red',    canal:'Remote',     canalColor:'green', date:'2026-06-15', tacheNoms:'Due diligence financière',       projetId:'CP3' },
  { id:'ST6', nom:'Revue contrats fournisseurs',       statut:'À faire',  statutColor:'orange', priorite:'Haute',   prioriteColor:'red',    canal:'Remote',     canalColor:'green', date:'2026-06-22', tacheNoms:'Due diligence financière',       projetId:'CP3' },
];

// ── CAP : Suivi Projet ────────────────────────────────────────────────────────

const capSuiviProjet = [
  { id:'SPJ1', nom:'Kick-off mission Métal-Alsace',     date:'2026-02-05', statut:'Terminé',  statutColor:'gray', tacheNoms:'',                                             projetId:'CP1' },
  { id:'SPJ2', nom:'Point intermédiaire diagnostic',    date:'2026-04-20', statut:'Terminé',  statutColor:'gray', tacheNoms:'Analyse processus RH|Benchmark sectoriel',     projetId:'CP1' },
  { id:'SPJ3', nom:'Lancement mission RSE BioGranges',  date:'2026-03-18', statut:'Terminé',  statutColor:'gray', tacheNoms:'',                                             projetId:'CP2' },
  { id:'SPJ4', nom:'Réunion lancement due diligence',   date:'2026-05-03', statut:'Terminé',  statutColor:'gray', tacheNoms:'',                                             projetId:'CP3' },
  { id:'SPJ5', nom:'Revue avancement due diligence',    date:'2026-06-07', statut:'En cours', statutColor:'blue', tacheNoms:'Due diligence financière|Analyse synergies',   projetId:'CP3' },
];

// ── CAP : Échanges ────────────────────────────────────────────────────────────

const capEchanges = [
  { id:'EX1', nom:'Réunion cadrage mission',           date:'2026-02-03', canal:'Présentiel',    canalColor:'blue',   contact:'Directeur RH|DG', suivi:'Kick-off mission Métal-Alsace', tacheNoms:'',                                  projetId:'CP1' },
  { id:'EX2', nom:'Email compte-rendu entretiens',     date:'2026-03-22', canal:'Email',         canalColor:'gray',   contact:'DRH',             suivi:'',                               tacheNoms:'Entretiens dirigeants et COMEX',   projetId:'CP1' },
  { id:'EX3', nom:'Réunion comité RSE BioGranges',     date:'2026-04-05', canal:'Présentiel',    canalColor:'blue',   contact:'CEO BioGranges|RSE Manager', suivi:'',                   tacheNoms:'Diagnostic RSE initial',          projetId:'CP2' },
  { id:'EX4', nom:'Appel suivi ateliers RSE',          date:'2026-05-28', canal:'Téléphone',     canalColor:'green',  contact:'RSE Manager',     suivi:'',                               tacheNoms:'Ateliers parties prenantes',      projetId:'CP2' },
  { id:'EX5', nom:'Réunion kick-off plan fusion',      date:'2026-05-06', canal:'Présentiel',    canalColor:'blue',   contact:'CFO LVT|DAF LVT', suivi:'Réunion lancement due diligence', tacheNoms:'',                              projetId:'CP3' },
  { id:'EX6', nom:'Revue due diligence en visio',      date:'2026-06-06', canal:'Visioconférence', canalColor:'purple', contact:'CFO LVT',       suivi:'Revue avancement due diligence', tacheNoms:'Due diligence financière',       projetId:'CP3' },
];

// ── CAP : Documents (avec blocks_json) ───────────────────────────────────────

const capDocuments = [
  {
    id:'DOC1', nom:'Rapport diagnostic préliminaire', statut:'Brouillon', statutColor:'orange', date:'2026-06-01', projet:'Audit organisationnel 2026', projetId:'CP1',
    blocks_json: mblocks(
      h2('Synthèse exécutive'),
      p('Audit de 6 semaines réalisé de février à mars 2026. 14 entretiens conduits auprès des membres du COMEX et des managers clés.'),
      h2('Constats principaux'),
      ni('Structure organisationnelle morcelée : 7 niveaux hiérarchiques vs 4 dans le secteur'),
      ni('Processus RH non standardisés entre les 3 sites de production'),
      ni('Potentiel d\'économies estimé à 8-12 % de la masse salariale sur 3 ans'),
      ni('Turn-over élevé dans les équipes opérationnelles : 18 % vs 11 % secteur'),
      h2('Recommandations prioritaires'),
      ni('Aplatir la structure : passer de 7 à 4 niveaux hiérarchiques'),
      ni('Déployer un SIRH unifié pour les 3 sites'),
      ni('Mettre en place un programme de fidélisation des talents'),
      h2('Prochaines étapes'),
      p('Présentation au COMEX prévue le 25 juin 2026. Validation plan d\'action attendue avant fin juillet.'),
    ),
  },
  {
    id:'DOC2', nom:'Note de cadrage mission', statut:'Validé', statutColor:'green', date:'2026-01-28', projet:'Audit organisationnel 2026', projetId:'CP1',
    blocks_json: mblocks(
      h2('Périmètre de la mission'),
      p('Mission d\'audit organisationnel portant sur les fonctions RH, Finance et Opérations de Métal-Alsace SA (3 sites, 320 collaborateurs).'),
      h2('Équipe projet'),
      li('CAP Consulting : 2 consultants senior + 1 analyste'),
      li('Métal-Alsace : DRH, DAF, COO'),
      h2('Planning'),
      li('Phase 1 – Diagnostic (6 semaines) : fév.-mars 2026'),
      li('Phase 2 – Recommandations (3 semaines) : avr. 2026'),
      li('Phase 3 – Plan d\'action (2 semaines) : mai 2026'),
      h2('Budget'),
      p('Honoraires fixés à 45 000 € HT selon proposition commerciale PC-2025-047.'),
    ),
  },
  {
    id:'DOC3', nom:'Présentation CODIR RSE', statut:'En révision', statutColor:'orange', date:'2026-05-20', projet:'Stratégie RSE 2026-2028', projetId:'CP2',
    blocks_json: mblocks(
      h2('Objet de la présentation'),
      p('Présentation du projet de Stratégie RSE 2026-2028 au Comité de Direction de BioGranges Sàrl.'),
      h2('Messages clés'),
      li('BioGranges peut viser une certification Ecocert niveau 3 d\'ici 2027'),
      li('3 axes prioritaires : énergie renouvelable, traçabilité amont, emploi local'),
      li('ROI estimé sur 3 ans : économies 120 000 € + attractivité marque +15 %'),
      h2('Questions ouvertes'),
      p('Validation du budget RSE (85 000 € prévu vs 60 000 € demandé). Arbitrage attendu au prochain CA.'),
      h2('Décisions attendues'),
      ni('Validation du périmètre des 3 axes'),
      ni('Nomination du responsable RSE interne'),
      ni('Calendrier de communication externe'),
    ),
  },
  {
    id:'DOC4', nom:'Rapport due diligence', statut:'Brouillon', statutColor:'orange', date:'2026-06-07', projet:'Plan de fusion LVT', projetId:'CP3',
    blocks_json: mblocks(
      h2('Périmètre'),
      p('Due diligence financière et juridique portant sur les 4 filiales du périmètre de fusion : LVT Industrie, LVT Services, LVT Immobilier, LVT Digital.'),
      h2('Principaux enseignements'),
      ni('Bilan consolidé sain : ratio d\'endettement 1,4× EBITDA'),
      ni('Risque contentieux identifié : litige fournisseur (200 000 € provisionnés)'),
      ni('LVT Digital : valorisation à revoir (goodwill surestimé de 15 %)'),
      h2('Axes de vigilance'),
      li('Transferts intra-groupe à documenter pour la holding réorganisée'),
      li('Pacte d\'actionnaires à harmoniser entre les filiales'),
      h2('Suite recommandée'),
      p('Engagement d\'un cabinet juridique spécialisé M&A pour sécuriser le montage. Budget estimé : 25 000 €.'),
    ),
  },
  {
    id:'DOC5', nom:'Plan d\'intégration LVT Group', statut:'À rédiger', statutColor:'gray', date:'', projet:'Plan de fusion LVT', projetId:'CP3',
    blocks_json: mblocks(
      h2('Objectifs du plan'),
      p('Feuille de route pour l\'intégration opérationnelle des 4 filiales sous la nouvelle holding LVT Group, d\'ici T1 2027.'),
      h2('Chantiers prioritaires'),
      ni('Chantier 1 – Gouvernance : recomposition du CA consolidé (sept. 2026)'),
      ni('Chantier 2 – Finance : unification du reporting (oct. 2026)'),
      ni('Chantier 3 – RH : harmonisation statuts et avantages (déc. 2026)'),
      ni('Chantier 4 – SI : cartographie des systèmes et plan de convergence (T1 2027)'),
      h2('Indicateurs de succès'),
      li('Synergies réalisées : objectif 1,2 M€ sur 3 ans'),
      li('Rétention talents clés : > 90 % à 12 mois'),
      li('Délai intégration : 18 mois maximum'),
    ),
  },
];

// ── CAP : Temps Projet ────────────────────────────────────────────────────────

const capTempsProjet = [
  { id:'TP1', description:'Entretiens dirigeants (J1)',           debut:'2026-02-20 09:00', fin:'2026-02-20 17:00', dureeH:'8',  dureeMin:'0',  tacheNoms:'Entretiens dirigeants et COMEX', facturable:1, facturableH:'8',   projetId:'CP1' },
  { id:'TP2', description:'Analyse processus RH (J1)',            debut:'2026-03-05 09:00', fin:'2026-03-05 17:30', dureeH:'8',  dureeMin:'30', tacheNoms:'Analyse processus RH',            facturable:1, facturableH:'8.5', projetId:'CP1' },
  { id:'TP3', description:'Diagnostic RSE terrain (J1)',          debut:'2026-04-08 09:00', fin:'2026-04-08 18:00', dureeH:'9',  dureeMin:'0',  tacheNoms:'Diagnostic RSE initial',          facturable:1, facturableH:'9',   projetId:'CP2' },
  { id:'TP4', description:'Atelier parties prenantes',            debut:'2026-06-12 09:00', fin:'2026-06-12 17:00', dureeH:'8',  dureeMin:'0',  tacheNoms:'Ateliers parties prenantes',       facturable:1, facturableH:'8',   projetId:'CP2' },
  { id:'TP5', description:'Préparation feuille de route RSE',     debut:'2026-06-15 14:00', fin:'2026-06-15 18:00', dureeH:'4',  dureeMin:'0',  tacheNoms:'Feuille de route RSE',             facturable:0, facturableH:'0',   projetId:'CP2' },
  { id:'TP6', description:'Réunion kick-off fusion LVT',          debut:'2026-05-06 09:00', fin:'2026-05-06 12:00', dureeH:'3',  dureeMin:'0',  tacheNoms:'',                                facturable:1, facturableH:'3',   projetId:'CP3' },
  { id:'TP7', description:'Revue due diligence financière',       debut:'2026-06-06 09:00', fin:'2026-06-06 17:00', dureeH:'8',  dureeMin:'0',  tacheNoms:'Due diligence financière',         facturable:1, facturableH:'8',   projetId:'CP3' },
  { id:'TP8', description:'Analyse synergies (amorçage)',         debut:'2026-06-08 14:00', fin:'2026-06-08 17:00', dureeH:'3',  dureeMin:'0',  tacheNoms:'Analyse synergies',               facturable:1, facturableH:'3',   projetId:'CP3' },
];

// ── Build workbook ─────────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projects),     'Projects');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people),       'People');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subprojects),  'SubProjects');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allTasks),     'Tasks');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(googleEvents), 'GoogleEvents');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(briefings),    'Briefing');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(postits),      'PostIts');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partenaires),  'Partenaires');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(suivis),       'Suivis');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(temps),        'Temps');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(associations), 'Associations');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tickets),      'Tickets');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capClients),   'CAP_Clients');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capProjets),   'CAP_Projets');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capTaches),    'CAP_Taches');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capSousTaches),'CAP_SousTaches');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capSuiviProjet),'CAP_SuiviProjet');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capEchanges),  'CAP_Echanges');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capDocuments), 'CAP_Documents');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capTempsProjet),'CAP_TempsProjet');

const out = path.join(__dirname, '..', 'public', 'demo-data.xlsx');
XLSX.writeFile(wb, out);

console.log(`✅ Wrote ${out}`);
console.log(`   Planning : ${projects.length} projets, ${people.length} personnes, ${allTasks.length} tâches (${unplannedTasks.length} non planifiées), ${googleEvents.length} événements`);
console.log(`   CUMA     : ${briefings.length} briefings, ${postits.length} post-its, ${partenaires.length} partenaires, ${suivis.length} suivis, ${temps.length} saisies temps, ${tickets.length} tickets`);
console.log(`   CAP      : ${capClients.length} clients, ${capProjets.length} projets, ${capTaches.length} tâches, ${capSousTaches.length} sous-tâches, ${capSuiviProjet.length} suivis, ${capEchanges.length} échanges, ${capDocuments.length} documents, ${capTempsProjet.length} saisies temps`);
console.log(`   Total feuilles : ${wb.SheetNames.length}`);
