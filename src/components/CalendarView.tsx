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
import { ProjectDropdown, SubprojectDropdown } from './Toolbar';

type CalEvent = { id: string; title: string; start: string; end: string; calendarId: string };
type CalendarsCfg = Record<string, { colorName: string; lightColors: { main: string; container: string; onContainer: string } }>;

const STATUS_CALENDARS: CalendarsCfg = {
  todo:        { colorName: 'todo',        lightColors: { main: '#64748b', container: '#f1f5f9', onContainer: '#1e293b' } },
  in_progress: { colorName: 'in_progress', lightColors: { main: '#2563eb', container: '#dbeafe', onContainer: '#1e3a8a' } },
  to_process:  { colorName: 'to_process',  lightColors: { main: '#ea580c', container: '#ffedd5', onContainer: '#7c2d12' } },
  blocked:     { colorName: 'blocked',     lightColors: { main: '#dc2626', container: '#fee2e2', onContainer: '#7f1d1d' } },
  done:        { colorName: 'done',        lightColors: { main: '#059669', container: '#d1fae5', onContainer: '#064e3b' } },
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
    defaultView: 'month-grid',
    isResponsive: false,
    events,
    calendars,
    plugins: [eventsService],
    selectedDate: '2026-05-28',
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

  const calendars = useMemo((): CalendarsCfg => {
    if (colorBy === 'project') {
      const cfg: CalendarsCfg = {};
      for (const [id, proj] of store.projectById) {
        const key = calId(id);
        cfg[key] = { colorName: key, lightColors: { main: proj.color, container: proj.color + '20', onContainer: '#1e293b' } };
      }
      cfg.gcal = STATUS_CALENDARS.gcal;
      return cfg;
    }
    if (colorBy === 'assignee') {
      const cfg: CalendarsCfg = {};
      for (const [id, person] of store.personById) {
        const key = calId(id);
        cfg[key] = { colorName: key, lightColors: { main: person.color, container: person.color + '20', onContainer: '#1e293b' } };
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

  const selectStyle = {
    background: 'var(--bg-deep)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    outline: 'none',
  };

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

        {/* Project filter */}
        <ProjectDropdown
          projects={store.data.projects}
          selected={store.filters.projectIds}
          onChange={(next) => store.setFilters({ projectIds: next })}
        />

        {/* Subproject filter */}
        {(store.data.subprojects?.length ?? 0) > 0 && (
          <SubprojectDropdown
            subprojects={store.data.subprojects!}
            projectById={store.projectById}
            selected={store.filters.subprojectIds}
            onChange={(next) => store.setFilters({ subprojectIds: next })}
          />
        )}

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
          Déposer pour planifier demain (1 jour)
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
