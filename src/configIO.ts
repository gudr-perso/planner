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
      const parsed = JSON.parse(localStorage.getItem(fullKey)!);
      if (key === 'notionConfig' && parsed && typeof parsed === 'object') {
        result[key] = { ...parsed, integrationToken: '' };
      } else {
        result[key] = parsed;
      }
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
