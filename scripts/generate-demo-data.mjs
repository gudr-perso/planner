// Generates public/demo-data.xlsx with fake projects/people/tasks/google events.
// Run with: node scripts/generate-demo-data.mjs
import * as XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TODAY = new Date('2026-05-28T09:00:00');

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const at = (d, h, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
};
const fmtDT = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const projects = [
  { id: 'P1', name: 'Refonte site web', color: '#3b82f6' },
  { id: 'P2', name: 'Lancement produit X', color: '#10b981' },
  { id: 'P3', name: 'Migration ERP', color: '#f59e0b' },
];

const people = [
  { id: 'U1', name: 'Guillaume', role: 'Moi', color: '#7c3aed' },
  { id: 'U2', name: 'Marie', role: 'Dev', color: '#ec4899' },
  { id: 'U3', name: 'Thomas', role: 'Externe', color: '#0ea5e9' },
];

const statuses = ['todo', 'in_progress', 'blocked', 'done'];

// Planned tasks — id, project_id, title, start_date, end_date, assignee_id, status, planned (1)
const plannedTasks = [
  // P1 Refonte site web
  ['T01', 'P1', 'Audit UX site actuel',                 0,   4, 'U1', 'done'],
  ['T02', 'P1', 'Wireframes nouvelle home',             5,  12, 'U1', 'in_progress'],
  ['T03', 'P1', 'Maquettes Figma pages clés',          10,  22, 'U2', 'in_progress'],
  ['T04', 'P1', 'Validation client maquettes',         23,  25, 'U1', 'todo'],
  ['T05', 'P1', 'Intégration HTML/CSS',                26,  55, 'U2', 'todo'],
  ['T06', 'P1', 'Migration contenu',                   45,  60, 'U3', 'todo'],
  ['T07', 'P1', 'Mise en ligne + redirections',        61,  68, 'U2', 'todo'],

  // P2 Lancement produit X
  ['T08', 'P2', 'Cadrage offre commerciale',            8,  20, 'U1', 'todo'],
  ['T09', 'P2', 'Dev backend API produit',             21,  70, 'U2', 'todo'],
  ['T10', 'P2', 'Création visuels marketing',          30,  50, 'U3', 'todo'],
  ['T11', 'P2', 'Beta test utilisateurs',              75,  95, 'U1', 'todo'],
  ['T12', 'P2', 'Lancement officiel',                 100, 102, 'U1', 'todo'],

  // P3 Migration ERP
  ['T13', 'P3', 'Cartographie données existantes',     15,  35, 'U3', 'in_progress'],
  ['T14', 'P3', 'Spec techniques migration',           36,  55, 'U2', 'todo'],
  ['T15', 'P3', 'Dev scripts ETL',                     56, 110, 'U2', 'blocked'],
  ['T16', 'P3', 'Recette comptable',                  111, 135, 'U1', 'todo'],
  ['T17', 'P3', 'Bascule production',                 140, 145, 'U3', 'todo'],
  ['T18', 'P3', 'Formation utilisateurs finaux',      150, 165, 'U1', 'todo'],
].map(([id, projectId, title, ds, de, assignee, status]) => ({
  id,
  project_id: projectId,
  title,
  start_date: iso(addDays(TODAY, ds)),
  end_date: iso(addDays(TODAY, de)),
  assignee_id: assignee,
  status,
  planned: 1,
}));

// Unplanned tasks — pas de dates
const unplannedTasks = [
  ['U01', 'P1', 'Optimisation SEO technique',        'U2', 'todo'],
  ['U02', 'P1', 'Refonte page tarifs',               'U1', 'todo'],
  ['U03', 'P2', 'Étude marché concurrent',           'U1', 'todo'],
  ['U04', 'P2', 'Plan de communication presse',      'U3', 'todo'],
  ['U05', 'P2', 'Préparation pitch investisseurs',   'U1', 'todo'],
  ['U06', 'P3', 'Documentation utilisateur',         'U2', 'todo'],
  ['U07', 'P3', 'Plan de reprise après incident',    'U3', 'todo'],
].map(([id, projectId, title, assignee, status]) => ({
  id,
  project_id: projectId,
  title,
  start_date: '',
  end_date: '',
  assignee_id: assignee,
  status,
  planned: 0,
}));

const allTasks = [...plannedTasks, ...unplannedTasks];

// Fake Google Calendar events (réunions, RDV) — id, title, start (datetime), end (datetime), attendees
const googleEvents = [
  ['G01', 'Daily équipe',                  at(addDays(TODAY,  1),  9, 30),  at(addDays(TODAY,  1), 10,  0), 'U1,U2'],
  ['G02', 'RDV client Refonte',            at(addDays(TODAY,  3), 14,  0),  at(addDays(TODAY,  3), 15, 30), 'U1,U3'],
  ['G03', 'Démo sprint',                   at(addDays(TODAY,  7), 16,  0),  at(addDays(TODAY,  7), 17,  0), 'U1,U2,U3'],
  ['G04', 'Comité de pilotage',            at(addDays(TODAY, 14), 10,  0),  at(addDays(TODAY, 14), 12,  0), 'U1'],
  ['G05', 'Atelier UX produit X',          at(addDays(TODAY, 18),  9,  0),  at(addDays(TODAY, 18), 12,  0), 'U1,U2'],
  ['G06', 'Déjeuner partenaire',           at(addDays(TODAY, 22), 12, 30),  at(addDays(TODAY, 22), 14,  0), 'U1'],
  ['G07', 'Rétro mensuelle',               at(addDays(TODAY, 30), 15,  0),  at(addDays(TODAY, 30), 17,  0), 'U1,U2,U3'],
  ['G08', 'Formation Notion équipe',       at(addDays(TODAY, 42), 14,  0),  at(addDays(TODAY, 42), 16,  0), 'U2,U3'],
  ['G09', 'Revue budget Q3',               at(addDays(TODAY, 55), 10,  0),  at(addDays(TODAY, 55), 11, 30), 'U1'],
  ['G10', 'Workshop migration ERP',        at(addDays(TODAY, 65),  9,  0),  at(addDays(TODAY, 65), 17,  0), 'U1,U2,U3'],
  ['G11', 'Conférence sectorielle',        at(addDays(TODAY, 88),  9,  0),  at(addDays(TODAY, 88), 18,  0), 'U1'],
  ['G12', 'Bilan annuel client',           at(addDays(TODAY, 120), 14, 0),  at(addDays(TODAY, 120), 16,  0), 'U1,U3'],
].map(([id, title, start, end, attendees]) => ({
  id,
  title,
  start: fmtDT(start),
  end: fmtDT(end),
  attendees,
}));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projects), 'Projects');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people), 'People');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allTasks), 'Tasks');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(googleEvents), 'GoogleEvents');

const out = path.join(__dirname, '..', 'public', 'demo-data.xlsx');
XLSX.writeFile(wb, out);
console.log(`✅ Wrote ${out}`);
console.log(`   ${projects.length} projects, ${people.length} people, ${allTasks.length} tasks (${unplannedTasks.length} unplanned), ${googleEvents.length} google events`);
console.log(`   Status legend: ${statuses.join(', ')}`);
