import { useStore } from '../store';

export function GcalModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const store = useStore();
  const event = store.data.googleEvents.find(e => e.id === eventId);

  if (!event) return null;

  // Parse datetime strings like "2026-05-28 09:00" or "2026-05-28"
  const parseDate = (s: string): Date | null => {
    if (!s) return null;
    const d = new Date(s.includes(' ') ? s.replace(' ', 'T') : s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  };

  const fmtTime = (s: string) => {
    const d = parseDate(s);
    if (!d) return s;
    const isAllDay = !s.includes(':');
    if (isAllDay) return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return d.toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const fmtEnd = (s: string) => {
    const d = parseDate(s);
    if (!d) return s;
    const isAllDay = !s.includes(':');
    if (isAllDay) return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const isAllDay = !event.start.includes(':');
  const sameDay = event.start.slice(0, 10) === event.end.slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(13,14,30,0.75)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid var(--border)', borderLeft: '4px solid var(--accent)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                📅 Google Calendar
              </span>
            </div>
            <h2 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>{event.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-lg leading-none transition hover:opacity-60 mt-0.5"
            style={{ color: 'var(--text-muted)' }}
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">

          {/* Date / Heure */}
          <Row label="Quand">
            <span style={{ color: 'var(--text)' }}>
              {fmtTime(event.start)}
              {!isAllDay && !sameDay && ` → ${fmtEnd(event.end)}`}
              {!isAllDay && sameDay && ` – ${fmtEnd(event.end)}`}
            </span>
          </Row>

          {/* Lieu */}
          {event.location && (
            <Row label="Lieu">
              <span style={{ color: 'var(--text)' }}>{event.location}</span>
            </Row>
          )}

          {/* Description */}
          {event.description && (
            <Row label="Description">
              <span
                className="whitespace-pre-wrap leading-relaxed"
                style={{ color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: event.description.replace(/<[^>]+>/g, '') }}
              />
            </Row>
          )}

          {/* Participants */}
          {event.attendees.length > 0 && (
            <Row label={`Participants (${event.attendees.length})`}>
              <div className="flex flex-col gap-0.5">
                {event.attendees.slice(0, 8).map((a, i) => (
                  <span key={i} style={{ color: 'var(--text)' }}>{a}</span>
                ))}
                {event.attendees.length > 8 && (
                  <span style={{ color: 'var(--text-muted)' }}>+{event.attendees.length - 8} autres</span>
                )}
              </div>
            </Row>
          )}

          {/* Lien visio */}
          {event.hangoutLink && (
            <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <a
                href={event.hangoutLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-medium transition hover:opacity-80"
                style={{ background: 'var(--color-info-bg)', color: 'var(--color-sky)', border: '1px solid var(--color-info-deep)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3l4 4V7l-4 4V7c0-2.21-1.79-4-4-4z"/>
                </svg>
                Rejoindre la visioconférence
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
      <span className="text-xs w-28 shrink-0 text-right pt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs flex-1">{children}</span>
    </div>
  );
}
