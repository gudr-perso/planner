import * as XLSX from 'xlsx';
import type { DataBundle, GoogleEvent, Person, Project, Task } from './types';

export async function loadDemoData(url = '/demo-data.xlsx'): Promise<DataBundle> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cannot fetch demo data: ${res.status}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const sheet = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Sheet "${name}" missing`);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  };

  const projects = sheet('Projects') as unknown as Project[];
  const people = sheet('People') as unknown as Person[];

  const tasks: Task[] = sheet('Tasks').map((row) => ({
    id: String(row.id),
    project_id: String(row.project_id),
    title: String(row.title),
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    assignee_id: String(row.assignee_id),
    status: String(row.status) as Task['status'],
    planned: Number(row.planned) === 1,
  }));

  const googleEvents: GoogleEvent[] = sheet('GoogleEvents').map((row) => ({
    id: String(row.id),
    title: String(row.title),
    start: String(row.start),
    end: String(row.end),
    attendees: String(row.attendees).split(',').map((s) => s.trim()).filter(Boolean),
  }));

  return { projects, people, tasks, googleEvents };
}
