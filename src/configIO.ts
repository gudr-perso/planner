const PREFIX = 'planner:';
const EXCLUDED_KEYS = ['gcalToken', 'gcalClientId', '_justImported'];

export function exportConfig(): string {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i)!;
    if (!fullKey.startsWith(PREFIX)) continue;
    const key = fullKey.slice(PREFIX.length);
    if (EXCLUDED_KEYS.includes(key)) continue;
    try {
      result[key] = JSON.parse(localStorage.getItem(fullKey)!);
    } catch {
      // skip unparseable values
    }
  }
  return JSON.stringify(result, null, 2);
}

export function downloadConfig(): void {
  const json = exportConfig();
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planner-config-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importConfig(json: string): void {
  const data = JSON.parse(json) as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (EXCLUDED_KEYS.includes(key)) continue;
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }
  localStorage.setItem(PREFIX + '_justImported', 'true');
  window.location.reload();
}

export async function uploadConfigToCloud(): Promise<{ saved_at: string }> {
  const json = exportConfig();
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ saved_at: string }>;
}

export async function fetchCloudConfigMeta(): Promise<{ saved_at: string } | null> {
  const res = await fetch('/api/config');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json() as { config: unknown; saved_at: string };
  return { saved_at: data.saved_at };
}

export async function downloadConfigFromCloud(options?: { reload?: boolean }): Promise<void> {
  const res = await fetch('/api/config');
  if (res.status === 404) throw new Error('Aucune config sauvegardée dans le cloud');
  if (!res.ok) throw new Error(await res.text());
  const { config } = await res.json() as { config: Record<string, unknown>; saved_at: string };
  if (options?.reload === false) {
    // Silent write — no page reload (used for auto-sync at login)
    for (const [key, value] of Object.entries(config)) {
      if (EXCLUDED_KEYS.includes(key)) continue;
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  } else {
    importConfig(JSON.stringify(config));
  }
}
