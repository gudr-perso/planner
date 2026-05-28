import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useStore, colorForTask } from '../store';
import { load, save } from '../persistence';
import type { GoogleEvent, Task } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Use local date components to avoid UTC offset shift (e.g. France UTC+2:
// local midnight = UTC 22:00 previous day, toISOString() would give wrong date)
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const WEEK_OPTIONS = [8, 13, 20, 26] as const;

// ── Task chip (light theme) ────────────────────────────────────────────────────

function TaskChip({ task, onClick }: { task: Task; onClick: () => void }) {
  const store = useStore();
  const color = colorForTask(task, store);
  const person = store.personById.get(task.assignee_id);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded px-1.5 py-0.5 mb-0.5 truncate transition hover:brightness-95 block"
      style={{
        background: color + '28',
        borderLeft: `2px solid ${color}`,
        color: 'var(--surface-text)',
        fontSize: 10,
        lineHeight: '1.35',
      }}
      title={`${task.title}${person ? ` — ${person.name}` : ''}`}
    >
      {person && (
        <span style={{ color, fontSize: 9, fontWeight: 700, marginRight: 2 }}>
          {person.name.slice(0, 3)}
        </span>
      )}
      {task.title}
    </button>
  );
}

// ── GCal chip ─────────────────────────────────────────────────────────────────

function GcalChip({ event, onClick }: { event: GoogleEvent; onClick: () => void }) {
  const isAllDay = !event.start.includes(':');
  const time = isAllDay ? '' : event.start.slice(11, 16);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded px-1.5 py-0.5 mb-0.5 truncate transition hover:brightness-95 block"
      style={{
        background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
        borderLeft: '2px solid var(--accent)',
        color: 'var(--surface-text)',
        fontSize: 10,
        lineHeight: '1.35',
      }}
      title={event.title}
    >
      {time && <span style={{ fontSize: 9, opacity: 0.6, marginRight: 2 }}>{time}</span>}
      📅 {event.title}
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function RollingWeeksView() {
  const store = useStore();
  const { tasks, googleEvents } = store.data;
  const { showGcal } = store.filters;

  const [weeksForward, setWeeksForward] = useState(() => load<number>('rollingWeeks', 13));
  const [showWeekends, setShowWeekends] = useState(() => load<boolean>('rollingWeekends', false));

  // Stable "today" (computed once at mount)
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = toISO(today);

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentWeekRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current week on mount
  useEffect(() => {
    const el = currentWeekRef.current;
    const container = scrollRef.current;
    if (!el || !container) return;
    // getBoundingClientRect gives position relative to viewport —
    // much more reliable than offsetTop (which is relative to offsetParent, not the scroll container)
    requestAnimationFrame(() => {
      const elTop = el.getBoundingClientRect().top;
      const containerTop = container.getBoundingClientRect().top;
      container.scrollTop += elTop - containerTop - 44; // 44 = sticky header height
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const daysPerWeek = showWeekends ? 7 : 5;

  // Generate week/day grid
  const weeks = useMemo(() => {
    const startMon = getMonday(today);
    startMon.setDate(startMon.getDate() - 7); // 1 week back
    const total = 1 + weeksForward;
    const base = startMon.getDate();
    return Array.from({ length: total }, (_, wi) =>
      Array.from({ length: daysPerWeek }, (_, di) => {
        const d = new Date(startMon);
        d.setDate(base + wi * 7 + di);
        return d;
      })
    );
  }, [today, weeksForward, daysPerWeek]);

  // Filtered planned tasks
  const filteredTasks = useMemo(() => {
    const { projectIds, assigneeIds, subprojectIds } = store.filters;
    return tasks.filter(t => {
      if (!t.planned || !t.start_date || !t.end_date) return false;
      const projOk = projectIds.size === 0 || projectIds.has(t.project_id);
      const persOk = assigneeIds.size === 0 || assigneeIds.has(t.assignee_id);
      const spOk = subprojectIds.size === 0 || (t.subproject_id ? subprojectIds.has(t.subproject_id) : true);
      return projOk && persOk && spOk;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, store.filters.projectIds, store.filters.assigneeIds, store.filters.subprojectIds]);

  // Map: dateString → Task[] (task appears on every day it spans)
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      const start = new Date(task.start_date!);
      const end = new Date(task.end_date!);
      const cur = new Date(start);
      while (cur <= end) {
        const key = toISO(cur);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [filteredTasks]);

  // Map: dateString → GoogleEvent[] (by start day)
  const gcalByDay = useMemo(() => {
    if (!showGcal) return new Map<string, GoogleEvent[]>();
    const map = new Map<string, GoogleEvent[]>();
    for (const ev of googleEvents) {
      const key = ev.start.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [googleEvents, showGcal]);

  const handleWeeksForward = (n: number) => { setWeeksForward(n); save('rollingWeeks', n); };
  const handleWeekends = () => { setShowWeekends(p => { save('rollingWeekends', !p); return !p; }); };

  const { setNodeRef, isOver } = useDroppable({ id: 'drop-rolling' });

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full flex flex-col overflow-hidden transition ${isOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      style={{ background: 'var(--surface)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b shrink-0"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Horizon :</span>
        {WEEK_OPTIONS.map(n => (
          <button
            key={n}
            onClick={() => handleWeeksForward(n)}
            className="text-xs px-2 py-1 rounded transition"
            style={weeksForward === n
              ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
              : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}
          >
            {n} sem.
          </button>
        ))}
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
          Déposer pour planifier
        </div>
      )}

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Sticky day-name header */}
        <div
          className="sticky top-0 z-10 flex border-b"
          style={{ background: 'var(--surface-header)', borderColor: 'var(--surface-border)' }}
        >
          <div style={{ width: 60, flexShrink: 0 }} /> {/* week label spacer */}
          {DAY_NAMES.slice(0, daysPerWeek).map(d => (
            <div
              key={d}
              className="flex-1 min-w-0 py-1.5 text-center text-[11px] font-semibold border-l"
              style={{ color: 'var(--surface-text-muted)', borderColor: 'var(--surface-border)' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week) => {
          const weekStart = week[0];
          const weekEnd = week[week.length - 1];
          const isCurrentWeek = week.some(d => toISO(d) === todayStr);
          const isPast = weekEnd < today;
          const wn = getWeekNumber(weekStart);

          return (
            <div
              key={toISO(weekStart)}
              ref={isCurrentWeek ? currentWeekRef : undefined}
              className="flex border-b"
              style={{
                borderColor: 'var(--surface-divider)',
                minHeight: 68,
                background: isCurrentWeek ? 'var(--surface-current-week)' : isPast ? 'var(--surface-3)' : 'var(--surface)',
              }}
            >
              {/* Week label */}
              <div
                className="flex flex-col items-center justify-start pt-1.5 gap-0.5 border-r shrink-0"
                style={{
                  width: 60,
                  borderColor: 'var(--surface-divider)',
                  background: isCurrentWeek ? 'var(--surface-header-cur)' : 'var(--surface-row)',
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase"
                  style={{ color: 'var(--surface-text-dim)' }}
                >
                  {weekStart.toLocaleDateString('fr-FR', { month: 'short' })}
                </span>
                <span
                  className="text-[13px] font-bold leading-none"
                  style={{ color: isCurrentWeek ? 'var(--color-today)' : 'var(--surface-text-muted)' }}
                >
                  S{wn}
                </span>
                <span className="text-[8px] mt-0.5" style={{ color: 'var(--surface-text-dim)' }}>
                  {String(weekStart.getDate()).padStart(2, '0')}→{String(weekEnd.getDate()).padStart(2, '0')}
                </span>
              </div>

              {/* Day cells */}
              {week.map(day => {
                const dayStr = toISO(day);
                const isToday = dayStr === todayStr;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const dayTasks = tasksByDay.get(dayStr) ?? [];
                const dayGcal = gcalByDay.get(dayStr) ?? [];

                return (
                  <div
                    key={dayStr}
                    className="flex-1 min-w-0 border-l p-1"
                    style={{
                      borderColor: 'var(--surface-divider)',
                      background: isToday
                        ? 'color-mix(in srgb, var(--color-today) 18%, transparent)'
                        : isWeekend
                          ? isPast ? 'var(--surface-row-past)' : 'var(--surface-weekend)'
                          : undefined,
                    }}
                  >
                    {/* Date badge */}
                    <div className="mb-1 flex items-center" style={{ height: 18 }}>
                      <span
                        className="text-[10px] font-medium rounded-full flex items-center justify-center"
                        style={{
                          width: isToday ? 18 : undefined,
                          height: isToday ? 18 : undefined,
                          minWidth: isToday ? 18 : undefined,
                          background: isToday ? 'var(--color-today)' : undefined,
                          color: isToday
                            ? '#fff'
                            : isPast
                              ? 'var(--surface-text-dim)'
                              : 'var(--surface-text-muted)',
                          fontWeight: isToday ? 700 : 400,
                        }}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    {/* GCal events */}
                    {dayGcal.map(ev => (
                      <GcalChip
                        key={ev.id}
                        event={ev}
                        onClick={() => store.openGcalModal(ev.id)}
                      />
                    ))}

                    {/* Task chips */}
                    {dayTasks.map(t => (
                      <TaskChip
                        key={t.id}
                        task={t}
                        onClick={() => store.openTaskModal(t.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
