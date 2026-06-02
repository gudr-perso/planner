import { useMemo, useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react';
import { useIsMobile } from '../hooks/useBreakpoint';
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
  createViewMonthAgenda,
} from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { useStore } from '../store';
import { useCallback } from 'react';
import { save, load } from '../persistence';

type CalEvent = { id: string; title: string; start: string; end: string; calendarId: string };
type CalendarsCfg = Record<string, { colorName: string; lightColors: { main: string; container: string; onContainer: string } }>;

const STATUS_CALENDARS: CalendarsCfg = {
  todo:        { colorName: 'todo',        lightColors: { main: '#64748b', container: '#64748bcc', onContainer: '#ffffff' } },
  in_progress: { colorName: 'in_progress', lightColors: { main: '#2563eb', container: '#2563ebcc', onContainer: '#ffffff' } },
  to_process:  { colorName: 'to_process',  lightColors: { main: '#ea580c', container: '#ea580ccc', onContainer: '#ffffff' } },
  blocked:     { colorName: 'blocked',     lightColors: { main: '#dc2626', container: '#dc2626cc', onContainer: '#ffffff' } },
  done:        { colorName: 'done',        lightColors: { main: '#059669', container: '#059669cc', onContainer: '#ffffff' } },
  gcal:        { colorName: 'gcal',        lightColors: { main: '#B1DCE2', container: '#0D1E2E', onContainer: '#B1DCE2' } },
};

const ZOOM_PRESETS = [
  { label: 'Compact',  gridHeight: 500  },
  { label: 'Normal',   gridHeight: 900  },
  { label: 'Détaillé', gridHeight: 1600 },
] as const;

type ZoomHeight = typeof ZOOM_PRESETS[number]['gridHeight'];

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

// Schedule-X uses colorName as a CSS variable suffix — must be a valid CSS identifier
function calId(id: string): string {
  return id
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-zA-Z0-9_-]/g, '_');                 // replace invalid chars
}

function CalendarInstance({
  events,
  gridHeight,
  dayStart,
  dayEnd,
  showWeekends,
  calendars,
  onEventClick,
}: {
  events: CalEvent[];
  gridHeight: number;
  dayStart: string;
  dayEnd: string;
  showWeekends: boolean;
  calendars: CalendarsCfg;
  onEventClick: (eventId: string) => void;
}) {
  const eventsService = useMemo(() => createEventsServicePlugin(), []);
  const onClickRef = useRef(onEventClick);
  useEffect(() => { onClickRef.current = onEventClick; }, [onEventClick]);

  const calendar = useNextCalendarApp({
    views: [createViewDay(), createViewWeek(), createViewMonthGrid(), createViewMonthAgenda()],
    defaultView: 'week',
    isResponsive: false,
    events,
    calendars,
    plugins: [eventsService],
    selectedDate: new Date().toISOString().slice(0, 10),
    dayBoundaries: { start: dayStart, end: dayEnd },
    weekOptions: { gridHeight, nDays: showWeekends ? 7 : 5 },
    callbacks: {
      onEventClick: (e) => onClickRef.current(e.id as string),
    },
  });

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    try { eventsService.set(events); } catch { /* not mounted yet */ }
  }, [events, eventsService]);

  return <ScheduleXCalendar calendarApp={calendar} />;
}

// ─── Fallback mobile : liste semaine ─────────────────────────────────────────
function getWeekDays(refDate: Date, showWeekends: boolean): Date[] {
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - ((refDate.getDay() + 6) % 7));
  const days: Date[] = [];
  for (let i = 0; i < (showWeekends ? 7 : 5); i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function isoDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function MobileCalendarList({ events, onEventClick }: {
  events: CalEvent[];
  onEventClick: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekends, setShowWeekends] = useState(false);

  const refDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const days = useMemo(() => getWeekDays(refDate, showWeekends), [refDate, showWeekends]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const day of days) map.set(isoDateStr(day), []);
    for (const ev of events) {
      const evStart = ev.start.slice(0, 10);
      if (map.has(evStart)) map.get(evStart)!.push(ev);
    }
    return map;
  }, [days, events]);

  const weekLabel = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    return `${first.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }, [days]);

  const todayStr = isoDateStr(new Date());

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--surface)' }}>
      {/* Header navigation */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="text-sm px-2 py-1 rounded border"
          style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >‹</button>
        <span className="flex-1 text-center text-xs font-medium" style={{ color: 'var(--text)' }}>{weekLabel}</span>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="text-sm px-2 py-1 rounded border"
          style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >›</button>
        <button
          onClick={() => setWeekOffset(0)}
          className="text-xs px-2 py-1 rounded border"
          style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >Auj.</button>
        <button
          onClick={() => setShowWeekends(s => !s)}
          className="text-xs px-2 py-1 rounded border"
          style={showWeekends
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'var(--accent)' }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        >W-E</button>
      </div>

      {/* Liste des jours */}
      <div className="flex-1 overflow-y-auto">
        {days.map(day => {
          const key = isoDateStr(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = key === todayStr;
          return (
            <div key={key}>
              {/* Entête jour */}
              <div
                className="px-3 py-1.5 sticky top-0 z-10"
                style={{
                  background: isToday ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))' : 'var(--bg)',
                  borderBottom: '1px solid var(--border)',
                  color: isToday ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 500,
                }}
              >
                {day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
                {isToday && ' · Aujourd\'hui'}
              </div>

              {dayEvents.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>Aucun événement</div>
              ) : (
                dayEvents.map(ev => {
                  const timeStr = ev.start.length > 10 ? ev.start.slice(11, 16) : '';
                  const isGcal = ev.calendarId === 'gcal';
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onEventClick(ev.id)}
                      className="w-full text-left px-3 py-2 border-b transition"
                      style={{
                        background: 'var(--surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="w-1 rounded-full shrink-0 mt-0.5"
                          style={{
                            height: 36,
                            background: isGcal
                              ? STATUS_CALENDARS.gcal.lightColors.main
                              : (STATUS_CALENDARS[ev.calendarId as keyof typeof STATUS_CALENDARS]?.lightColors.main ?? 'var(--accent)'),
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{ev.title.replace(/\s*\{[^}]+\}$/, '')}</div>
                          {timeStr && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{timeStr}</div>}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2 text-center text-[10px]" style={{ color: 'var(--text-dim)', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        Vue calendrier complète disponible sur desktop
      </div>
    </div>
  );
}

export function CalendarView() {
  const store = useStore();
  const isMobile = useIsMobile();
  const { tasks, googleEvents } = store.data;
  const { showGcal, colorBy } = store.filters;

  const [gridHeight, setGridHeight] = useState<ZoomHeight>(() => load<ZoomHeight>('calZoom', 900));
  const [dayStart, setDayStart] = useState(() => load<string>('calDayStart', '08:00'));
  const [dayEnd, setDayEnd] = useState(() => load<string>('calDayEnd', '20:00'));
  const [showWeekends, setShowWeekends] = useState(() => load<boolean>('calWeekends', false));

  const calendars = useMemo((): CalendarsCfg => {
    if (colorBy === 'project') {
      const cfg: CalendarsCfg = {};
      for (const [id, proj] of store.projectById) {
        const key = calId(id);
        cfg[key] = { colorName: key, lightColors: { main: proj.color, container: proj.color + 'cc', onContainer: '#ffffff' } };
      }
      cfg.gcal = STATUS_CALENDARS.gcal;
      return cfg;
    }
    if (colorBy === 'assignee') {
      const cfg: CalendarsCfg = {};
      for (const [id, person] of store.personById) {
        const key = calId(id);
        cfg[key] = { colorName: key, lightColors: { main: person.color, container: person.color + 'cc', onContainer: '#ffffff' } };
      }
      cfg.gcal = STATUS_CALENDARS.gcal;
      return cfg;
    }
    return STATUS_CALENDARS;
  }, [colorBy, store.projectById, store.personById]);

  const events = useMemo(() => {
    const taskEvents: CalEvent[] = tasks
      .filter((t) => t.planned && t.start_date && t.end_date)
      .filter((t) => {
        const projOk = store.filters.projectIds.size === 0 || store.filters.projectIds.has(t.project_id);
        const persOk = store.filters.assigneeIds.size === 0 || store.filters.assigneeIds.has(t.assignee_id);
        const spOk = store.filters.subprojectIds.size === 0 || (t.subproject_id ? store.filters.subprojectIds.has(t.subproject_id) : true);
        return projOk && persOk && spOk;
      })
      .map((t): CalEvent => {
        const person = store.personById.get(t.assignee_id);
        const initials = person ? person.name.slice(0, 3) : '';
        const calendarId = colorBy === 'project' ? calId(t.project_id)
                         : colorBy === 'assignee' ? calId(t.assignee_id)
                         : t.status;
        return {
          id: `task_${t.id}`,
          title: initials ? `${t.title} {${initials}}` : t.title,
          start: t.start_date!,
          end: t.end_date!,
          calendarId,
        };
      });

    const gcalEvents: CalEvent[] = showGcal
      ? googleEvents.map((ev) => ({
          id: `gcal_${ev.id}`,
          title: `📅 ${ev.title}`,
          start: ev.start,
          end: ev.end,
          calendarId: 'gcal',
        }))
      : [];

    return [...taskEvents, ...gcalEvents];
  }, [tasks, googleEvents, showGcal, store.filters.projectIds, store.filters.assigneeIds, colorBy, store.personById, store.projectById]);

  const handleEventClick = useCallback((eventId: string) => {
    if (eventId.startsWith('task_')) store.openTaskModal(eventId.slice(5));
    else if (eventId.startsWith('gcal_')) store.openGcalModal(eventId.slice(5));
  }, [store]);

  const handleZoom = (h: ZoomHeight) => { setGridHeight(h); save('calZoom', h); };
  const handleDayStart = (h: string) => { setDayStart(h); save('calDayStart', h); };
  const handleDayEnd = (h: string) => { setDayEnd(h); save('calDayEnd', h); };
  const handleWeekends = () => { setShowWeekends(prev => { save('calWeekends', !prev); return !prev; }); };

  const { setNodeRef, isOver } = useDroppable({ id: 'drop-calendar' });

  // ── Fallback mobile ──────────────────────────────────────────────────────
  if (isMobile) {
    return <MobileCalendarList events={events} onEventClick={handleEventClick} />;
  }

  const selectStyle = {
    background: 'var(--bg-deep)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    outline: 'none',
  };

  if (store.dataLoading) return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement des tâches…</div>
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full overflow-hidden flex flex-col transition ${isOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b shrink-0 flex-wrap" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        {/* Zoom */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Zoom :</span>
          {ZOOM_PRESETS.map((p) => (
            <button
              key={p.gridHeight}
              onClick={() => handleZoom(p.gridHeight)}
              className="text-xs px-2 py-1 rounded transition"
              style={gridHeight === p.gridHeight
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
                : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Day boundaries */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Horaires :</span>
          <select value={dayStart} onChange={e => handleDayStart(e.target.value)} style={selectStyle}>
            {HOURS.slice(0, 22).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
          <select value={dayEnd} onChange={e => handleDayEnd(e.target.value)} style={selectStyle}>
            {HOURS.slice(1).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* Weekends toggle */}
        <button
          onClick={handleWeekends}
          className="text-xs px-2 py-1 rounded transition ml-auto"
          style={showWeekends
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}
        >
          Week-ends
        </button>
      </div>

      {isOver && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white text-xs px-4 py-1.5 rounded-full shadow-lg pointer-events-none">
          Déposer sur un créneau horaire pour planifier
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CalendarInstance
          key={`${gridHeight}-${dayStart}-${dayEnd}-${showWeekends}-${colorBy}`}
          events={events}
          gridHeight={gridHeight}
          dayStart={dayStart}
          dayEnd={dayEnd}
          showWeekends={showWeekends}
          calendars={calendars}
          onEventClick={handleEventClick}
        />
      </div>
    </div>
  );
}
