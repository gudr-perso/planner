import { useState } from 'react';
import { useStore } from '../store';
import { STATUS_LABELS, STATUS_COLORS } from '../types';
import type { NotionConfig, NotionPropertySchema } from '../types';
import { load } from '../persistence';
import { patchNotionProperty } from '../notionService';

// schedule-x format: "YYYY-MM-DD HH:MM"  or  "YYYY-MM-DD" (date-only)
// datetime-local input: "YYYY-MM-DDTHH:MM"
function sxToInput(sx: string | null): string {
  if (!sx) return '';
  if (sx.includes(' ')) return sx.replace(' ', 'T'); // "2026-05-29 09:00" → "2026-05-29T09:00"
  return sx + 'T00:00'; // date-only → add midnight for the input
}

function inputToSx(val: string): string {
  if (!val) return '';
  // "2026-05-29T09:00" → "2026-05-29 09:00"
  // If time is midnight we could keep date-only, but always store with time for precision
  return val.replace('T', ' ');
}

// Pretty display
function fmtDisplay(sx: string | null): string {
  if (!sx) return '—';
  const [datePart, timePart] = sx.includes(' ') ? sx.split(' ') : [sx, null];
  const d = new Date(datePart + 'T00:00:00');
  const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  return timePart ? `${dateStr} · ${timePart}` : dateStr;
}

export function TaskModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const store = useStore();
  const task = store.data.tasks.find(t => t.id === taskId);

  const [startVal, setStartVal] = useState(() => sxToInput(task?.start_date ?? null));
  const [endVal, setEndVal] = useState(() => sxToInput(task?.end_date ?? null));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Extra fields editing state: label → current displayed value
  const [extraEdits, setExtraEdits] = useState<Record<string, string>>(() => task?.extraFields ?? {});
  const [extraSaving, setExtraSaving] = useState<Record<string, boolean>>({});
  const [extraSaved, setExtraSaved] = useState<Record<string, boolean>>({});

  const notionConfig = load<NotionConfig | null>('notionConfig', null);
  const notionSchema = load<NotionPropertySchema[]>('notionSchema', []);

  if (!task) return null;

  const project = store.projectById.get(task.project_id);
  const subproject = task.subproject_id
    ? store.data.subprojects?.find(sp => sp.id === task.subproject_id)
    : null;
  const person = store.personById.get(task.assignee_id);
  const statusColor = STATUS_COLORS[task.status];

  const originalStart = sxToInput(task.start_date);
  const originalEnd = sxToInput(task.end_date);
  const dirty = startVal !== originalStart || endVal !== originalEnd;

  const handleSave = async () => {
    const newStart = inputToSx(startVal);
    const newEnd = inputToSx(endVal);
    if (!newStart || !newEnd) return;
    setSaving(true);
    store.updateTaskDates(task.id, newStart, newEnd);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-deep)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 11,
    outline: 'none',
    colorScheme: 'dark',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(13,14,30,0.75)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid var(--border)', borderLeft: `4px solid ${statusColor}` }}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{task.title}</h2>
            <span
              className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: statusColor + '25', color: statusColor }}
            >
              {STATUS_LABELS[task.status]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-lg leading-none transition hover:opacity-60 mt-0.5"
            style={{ color: 'var(--text-muted)' }}
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">

          {/* Assignee */}
          <Row label="Affecté à">
            {person ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: person.color }} />
                <span style={{ color: person.color }}>{person.name}</span>
              </div>
            ) : <Dash />}
          </Row>

          {/* Project */}
          <Row label="Projet">
            {project ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: project.color }} />
                <span style={{ color: project.color }}>{project.name}</span>
              </div>
            ) : <Dash />}
          </Row>

          {/* Subproject */}
          {subproject && (
            <Row label="Sous-projet">
              <span style={{ color: 'var(--accent)' }}>{subproject.name}</span>
            </Row>
          )}

          {/* ── Dates éditables ── */}
          <div className="pt-1 pb-1 space-y-2" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', paddingTop: 10, paddingBottom: 10 }}>
            <Row label="Début">
              <div className="flex flex-col gap-0.5">
                <input
                  type="datetime-local"
                  value={startVal}
                  onChange={e => {
                    setStartVal(e.target.value);
                    setSaved(false);
                    // Auto-adjust end if it's before new start
                    if (endVal && e.target.value > endVal) {
                      // push end by 1h
                      const d = new Date(e.target.value);
                      d.setHours(d.getHours() + 1);
                      const pad = (n: number) => String(n).padStart(2, '0');
                      setEndVal(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                    }
                  }}
                  style={inputStyle}
                />
                {task.start_date && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fmtDisplay(task.start_date)}</span>}
              </div>
            </Row>

            <Row label="Fin">
              <div className="flex flex-col gap-0.5">
                <input
                  type="datetime-local"
                  value={endVal}
                  min={startVal}
                  onChange={e => { setEndVal(e.target.value); setSaved(false); }}
                  style={inputStyle}
                />
                {task.end_date && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fmtDisplay(task.end_date)}</span>}
              </div>
            </Row>

            {/* Save button */}
            {(dirty || saved) && (
              <div className="flex items-center gap-2 pt-1">
                {dirty && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                )}
                {saved && !dirty && (
                  <span className="text-xs" style={{ color: 'var(--color-success)' }}>✓ Mis à jour dans Notion</span>
                )}
              </div>
            )}
          </div>

          {/* Planned */}
          <Row label="Planifiée">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={task.planned
                ? { background: 'var(--color-success-bg)', color: 'var(--color-success)' }
                : { background: 'var(--color-warn-orange-bg)', color: 'var(--color-warn-orange)' }}
            >
              {task.planned ? 'Oui' : 'Non'}
            </span>
          </Row>

          {/* Extra fields */}
          {task.extraFields && Object.keys(task.extraFields).length > 0 && (
            <div className="pt-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
              {Object.entries(task.extraFields).map(([label, value]) => {
                const efConfig = notionConfig?.extraFields?.find(ef => ef.label === label);
                const isEditable = efConfig?.editable && notionConfig?.integrationToken && efConfig.notionField;
                if (!isEditable) {
                  return (
                    <Row key={label} label={label}>
                      {value ? <Val>{value}</Val> : <Dash />}
                    </Row>
                  );
                }

                // Find schema to get field type & options
                const schemaProp = notionSchema.find(p => p.name === efConfig.notionField);
                const options = schemaProp?.options ?? [];
                const currentVal = extraEdits[label] ?? value;
                const isSaving = extraSaving[label] ?? false;
                const isSaved = extraSaved[label] ?? false;

                // "Terminé" target: exact name match first, then statusMappings fallback
                const exactTermine = options.find(o => /^termin[ée]e?$/i.test(o.name))?.name;
                const doneMapping = notionConfig?.statusMappings?.find(
                  m => m.internalStatus === 'done' && /^termin/i.test(m.notionValue)
                ) ?? notionConfig?.statusMappings?.find(m => m.internalStatus === 'done');
                const doneValue =
                  exactTermine
                  || (efConfig.notionField === notionConfig?.fieldMap?.status && doneMapping?.notionValue)
                  || null;

                const handleSaveExtra = async (val: string) => {
                  if (!notionConfig?.integrationToken) return;
                  setExtraSaving(prev => ({ ...prev, [label]: true }));
                  try {
                    await patchNotionProperty(
                      notionConfig.integrationToken,
                      task.id,
                      efConfig.notionField,
                      schemaProp?.type ?? 'select',
                      val,
                    );
                    setExtraEdits(prev => ({ ...prev, [label]: val }));
                    setExtraSaved(prev => ({ ...prev, [label]: true }));
                    setTimeout(() => setExtraSaved(prev => ({ ...prev, [label]: false })), 2000);
                  } finally {
                    setExtraSaving(prev => ({ ...prev, [label]: false }));
                  }
                };

                return (
                  <Row key={label} label={label}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {options.length > 0 ? (
                        <select
                          value={currentVal}
                          onChange={e => handleSaveExtra(e.target.value)}
                          disabled={isSaving}
                          style={{
                            background: 'var(--bg-deep)',
                            color: 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '2px 6px',
                            fontSize: 11,
                            outline: 'none',
                          }}
                        >
                          {currentVal && !options.find(o => o.name === currentVal) && (
                            <option value={currentVal}>{currentVal}</option>
                          )}
                          {options.map(o => (
                            <option key={o.id ?? o.name} value={o.name}>{o.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text)' }}>{currentVal || '—'}</span>
                      )}
                      {doneValue && currentVal !== doneValue && (
                        <button
                          onClick={() => handleSaveExtra(doneValue)}
                          disabled={isSaving}
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium transition hover:opacity-80 disabled:opacity-50"
                          style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)' }}
                        >
                          ✓ Terminé
                        </button>
                      )}
                      {isSaved && (
                        <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓ Mis à jour</span>
                      )}
                    </div>
                  </Row>
                );
              })}
            </div>
          )}

          {/* Notion link */}
          {task.notion_url && (
            <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <a
                href={task.notion_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition hover:opacity-80"
                style={{ background: 'var(--bg-deep)', color: 'var(--accent)', border: '1px solid var(--border)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
                </svg>
                Ouvrir dans Notion
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs w-24 shrink-0 text-right pt-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs flex-1" style={{ color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

function Val({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text)' }}>{children}</span>;
}

function Dash() {
  return <span style={{ color: 'var(--border)' }}>—</span>;
}
