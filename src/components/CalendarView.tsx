import { useMemo, useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react';
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

const FR_MONTHS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];

// Schedule-X uses colorName as a CSS variable suffix — must be a valid CSS identifier
function calId(id: string): string {
  return id
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getMondayISO(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

function shiftDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekRangeLabel(baseISO: string, numWeeks: number, showWeekends: boolean): string {
  const start = new Date(baseISO + 'T00:00:00');
  const end = new Date(baseISO + 'T00:00:00');
  end.setDate(end.getDate() + (numWeeks - 1) * 7 + (showWeekends ? 6 : 4));
  const fmt = (d: Date) => `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
}

function CalendarInstance({
  events,
  gridHeight,
  dayStart,
  dayEnd,
  showWeekends,
  selectedDate,
  calendars,
  onEventClick,
}: {
  events: CalEvent[];
  gridHeight: number;
  dayStart: string;
  dayEnd: string;
  showWeekends: boolean;
  selectedDate: string;
  calendars: CalendarsCfg;
  onEventClick: (eventId: string) => void;
}) {
  const eventsService = useMemo(() => createEventsServicePlugin(), []);
  const onClickRef = useRef(onEventClick);
  useEffect(() => { onClickRef.current = onEventClick; }, [onEventClick]);

  const calendar = useNextCalendarApp({
    locale: 'fr-FR',
    views: [createViewDay(), createViewWeek(), createViewMonthGrid(), createViewMonthAgenda()],
    defaultView: 'week',
    isResponsive: false,
    events,
    calendars,
    plugins: [eventsService],
    selectedDate,
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

export function CalendarView() {
  const store = useStore();
  const { tasks, googleEvents } = store.data;
  const { showGcal, colorBy } = store.filters;

  const [gridHeight, setGridHeight] = useState<ZoomHeight>(() => load<ZoomHeight>('calZoom', 900));
  const [dayStart, setDayStart] = useState(() => load<string>('calDayStart', '08:00'));
  const [dayEnd, setDayEnd] = useState(() => load<string>('calDayEnd', '20:00'));
  const [showWeekends, setShowWeekends] = useState(() => load<boolean>('calWeekends', false));
  const [numWeeks, setNumWeeks] = useState<1 | 2 | 3>(() => load<1 | 2 | 3>('calWeeks', 1));
  const [baseDate, setBaseDate] = useState(() => getMondayISO(new Date()));

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
  const handleNumWeeks = (n: 1 | 2 | 3) => { setNumWeeks(n); save('calWeeks', n); };
  const handleToday = () => setBaseDate(getMondayISO(new Date()));
  const handlePrev = () => setBaseDate(d => shiftDays(d, -7));
  const handleNext = () => setBaseDate(d => shiftDays(d, 7));

  const { setNodeRef, isOver } = useDroppable({ id: 'drop-calendar' });

  const selectStyle = {
    background: 'var(--bg-deep)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    outline: 'none',
  };

  const btnBase: React.CSSProperties = { background: 'var(--bg-deep)', color: 'var(--text-muted)' };
  const baseKey = `${gridHeight}-${dayStart}-${dayEnd}-${showWeekends}-${colorBy}`;

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
                : btnBase}
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

        {/* Nombre de semaines */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sem. :</span>
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => handleNumWeeks(n)}
              className="text-xs px-2 py-1 rounded transition"
              style={numWeeks === n
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
                : btnBase}
            >
              {n}S
            </button>
          ))}
        </div>

        {/* Navigation multi-semaines (visible uniquement en mode 2S/3S) */}
        {numWeeks > 1 && (
          <div className="flex items-center gap-1.5">
            <button onClick={handleToday} className="text-xs px-2 py-1 rounded transition" style={btnBase}>Auj.</button>
            <button onClick={handlePrev} className="text-xs px-2 py-1 rounded transition" style={btnBase}>◀</button>
            <span className="text-xs" style={{ color: 'var(--text)', minWidth: 130, textAlign: 'center' }}>
              {weekRangeLabel(baseDate, numWeeks, showWeekends)}
            </span>
            <button onClick={handleNext} className="text-xs px-2 py-1 rounded transition" style={btnBase}>▶</button>
          </div>
        )}

        {/* Weekends toggle */}
        <button
          onClick={handleWeekends}
          className="text-xs px-2 py-1 rounded transition ml-auto"
          style={showWeekends
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
            : btnBase}
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
        {numWeeks === 1 ? (
          <CalendarInstance
            key={`${baseKey}-1`}
            events={events}
            gridHeight={gridHeight}
            dayStart={dayStart}
            dayEnd={dayEnd}
            showWeekends={showWeekends}
            selectedDate={new Date().toISOString().slice(0, 10)}
            calendars={calendars}
            onEventClick={handleEventClick}
          />
        ) : (
          <>
            {/* schedule-x plafonne nDays à 7 : impossible de faire une « semaine de 10 jours ».
               On place donc les N grilles-semaines CÔTE À CÔTE (flex-row) pour obtenir une bande
               continue de 10/14/15 colonnes, au lieu de les empiler verticalement.
               - un seul scroll vertical (overflow:visible sur les view-container internes) pour
                 garder les blocs alignés ;
               - semaines 2..N : gouttière d'heures (75px) supprimée + libellés d'heures masqués
                 pour la continuité visuelle (un seul axe horaire à gauche). */}
            <style>{`
              .sx-multi-week-h .sx__calendar-header { display: none !important; }
              .sx-multi-week-h .sx__view-container { overflow: visible !important; }
              .sx-week-continued .sx__week-grid__hour-text { display: none !important; }
            `}</style>
            <div className="sx-multi-week-h flex-1 min-h-0 overflow-auto flex flex-row">
              {Array.from({ length: numWeeks }, (_, i) => {
                // i=0 garde la gouttière (axe horaire) → flex-basis 75px pour que ses colonnes
                // de jours aient la même largeur que celles des semaines suivantes (basis 0).
                const wrapStyle = {
                  flex: i === 0 ? '1 1 75px' : '1 1 0',
                  minWidth: 0,
                  borderLeft: i > 0 ? '2px solid var(--border)' : undefined,
                  ...(i > 0 ? { '--sx-calendar-week-grid-padding-left': '0px' } : {}),
                } as React.CSSProperties;
                return (
                  <div
                    key={`${baseKey}-${numWeeks}-${baseDate}-${i}`}
                    className={i > 0 ? 'sx-week-continued' : undefined}
                    style={wrapStyle}
                  >
                    <CalendarInstance
                      events={events}
                      gridHeight={gridHeight}
                      dayStart={dayStart}
                      dayEnd={dayEnd}
                      showWeekends={showWeekends}
                      selectedDate={shiftDays(baseDate, i * 7)}
                      calendars={calendars}
                      onEventClick={handleEventClick}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
