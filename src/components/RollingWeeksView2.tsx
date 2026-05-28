import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useStore, colorForTask } from '../store';
import { load, save } from '../persistence';
import type { GoogleEvent, Task } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay();
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

// Local date → "YYYY-MM-DD" (avoids UTC offset shift for non-UTC timezones)
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse "YYYY-MM-DD" as local midnight (not UTC midnight)
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const WEEK_OPTIONS = [8, 13, 20, 26] as const;

// ── Lane layout types ──────────────────────────────────────────────────────────

type EvBar = {
  id: string;
  startCol: number;   // 0-indexed column in this week
  endCol: number;     // 0-indexed, inclusive
  startsHere: boolean; // task actually starts (not a continuation from a previous week)
  endsHere: boolean;   // task actually ends (not continuing into next week)
  color: string;
  label: string;
  personName?: string;
  personColor?: string;
  taskId?: string;
  gcalEventId?: string;
};

// ── Lane packing (greedy interval scheduling) ──────────────────────────────────
// Sorts events by start column, then places each into the first lane where it fits.

function packIntoLanes(events: EvBar[]): EvBar[][] {
  const sorted = [...events].sort((a, b) =>
    a.startCol !== b.startCol
      ? a.startCol - b.startCol
      : (b.endCol - b.startCol) - (a.endCol - a.startCol) // longer spans first
  );
  const lanes: EvBar[][] = [];
  for (const ev of sorted) {
    let placed = false;
    for (const lane of lanes) {
      if (lane[lane.length - 1].endCol < ev.startCol) {
        lane.push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([ev]);
  }
  return lanes;
}

// ── Spanning event bar ─────────────────────────────────────────────────────────

function EvBarChip({ ev, onClick }: { ev: EvBar; onClick: () => void }) {
  const rl = ev.startsHere ? 3 : 0;
  const rr = ev.endsHere ? 3 : 0;
  return (
    <button
      onClick={onClick}
      title={ev.label}
      className="flex items-center overflow-hidden transition hover:brightness-95 focus:outline-none"
      style={{
        gridColumn: `${ev.startCol + 1} / ${ev.endCol + 2}`,
        height: 20,
        fontSize: 10,
        lineHeight: 1,
        cursor: 'pointer',
        color: 'var(--surface-text)',
        background: ev.color + '28',
        borderLeft:   ev.startsHere ? `3px solid ${ev.color}` : `1px solid ${ev.color}60`,
        borderTop:    `1px solid ${ev.color}40`,
        borderBottom: `1px solid ${ev.color}40`,
        borderRight:  ev.endsHere  ? `1px solid ${ev.color}40` : 'none',
        borderRadius: `${rl}px ${rr}px ${rr}px ${rl}px`,
        paddingLeft:  ev.startsHere ? 4 : 2,
        paddingRight: ev.endsHere   ? 4 : 2,
        marginLeft:   ev.startsHere ? 1 : 0,
        marginRight:  ev.endsHere   ? 1 : 0,
      }}
    >
      {!ev.startsHere && (
        <span style={{ fontSize: 8, opacity: 0.45, marginRight: 2, flexShrink: 0 }}>◀</span>
      )}
      {ev.personName && (
        <span style={{ color: ev.personColor, fontWeight: 700, fontSize: 9, marginRight: 3, flexShrink: 0 }}>
          {ev.personName.slice(0, 3)}
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {ev.label}
      </span>
      {!ev.endsHere && (
        <span style={{ fontSize: 8, opacity: 0.45, marginLeft: 2, flexShrink: 0 }}>▶</span>
      )}
    </button>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function RollingWeeksView2() {
  const store = useStore();
  const { tasks, googleEvents } = store.data;
  const { showGcal } = store.filters;

  const [weeksForward, setWeeksForward] = useState(() => load<number>('rollingWeeks2', 13));
  const [showWeekends, setShowWeekends] = useState(() => load<boolean>('rollingWeekends2', false));

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = toISO(today);

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentWeekRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = currentWeekRef.current;
    const container = scrollRef.current;
    if (!el || !container) return;
    requestAnimationFrame(() => {
      const elTop = el.getBoundingClientRect().top;
      const cTop  = container.getBoundingClientRect().top;
      container.scrollTop += elTop - cTop - 44;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const daysPerWeek = showWeekends ? 7 : 5;

  // Generate the week/day grid
  const weeks = useMemo(() => {
    const startMon = getMonday(today);
    startMon.setDate(startMon.getDate() - 7); // 1 week back
    const base  = startMon.getDate();
    const total = 1 + weeksForward;
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
      const spOk   = subprojectIds.size === 0 || (t.subproject_id ? subprojectIds.has(t.subproject_id) : true);
      return projOk && persOk && spOk;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, store.filters.projectIds, store.filters.assigneeIds, store.filters.subprojectIds]);

  // Per-week lane layout (the expensive part — memoized)
  const weekLanes = useMemo((): EvBar[][][] => {
    return weeks.map(week => {
      const weekStart    = week[0];
      const weekEnd      = week[week.length - 1];
      const weekStartStr = toISO(weekStart);
      const weekEndStr   = toISO(weekEnd);
      const events: EvBar[] = [];

      // ── Planned tasks ──
      for (const task of filteredTasks) {
        const ts = parseLocalDate(task.start_date!);
        const te = parseLocalDate(task.end_date!);

        // Skip if no overlap with this week
        if (ts > weekEnd || te < weekStart) continue;

        // Clip to week boundaries
        const effStart = ts < weekStart ? weekStart : ts;
        const effEnd   = te > weekEnd   ? weekEnd   : te;

        const startCol = week.findIndex(d => toISO(d) === toISO(effStart));
        const endCol   = week.findIndex(d => toISO(d) === toISO(effEnd));
        if (startCol === -1 || endCol === -1) continue; // shouldn't happen

        const person = store.personById.get(task.assignee_id);

        events.push({
          id: `t-${task.id}`,
          startCol,
          endCol,
          startsHere: toISO(ts) >= weekStartStr,
          endsHere:   toISO(te) <= weekEndStr,
          color:      colorForTask(task, store),
          label:      task.title,
          personName:  person?.name,
          personColor: person?.color,
          taskId: task.id,
        });
      }

      // ── Google Calendar events (shown on their start day only) ──
      if (showGcal) {
        for (const ev of googleEvents) {
          const evDate = ev.start.slice(0, 10);
          if (evDate < weekStartStr || evDate > weekEndStr) continue;
          const col = week.findIndex(d => toISO(d) === evDate);
          if (col === -1) continue;
          const isAllDay = !ev.start.includes(':');
          const time = isAllDay ? '' : ev.start.slice(11, 16);
          events.push({
            id: `g-${ev.id}`,
            startCol: col,
            endCol:   col,
            startsHere: true,
            endsHere:   true,
            color: '#B1DCE2',
            label: time ? `${time} ${ev.title}` : `📅 ${ev.title}`,
            gcalEventId: ev.id,
          });
        }
      }

      return packIntoLanes(events);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, filteredTasks, googleEvents, showGcal,
      store.filters.colorBy, store.personById, store.projectById]);

  const handleWeeksForward = (n: number) => { setWeeksForward(n); save('rollingWeeks2', n); };
  const handleWeekends     = () => { setShowWeekends(p => { save('rollingWeekends2', !p); return !p; }); };

  const { setNodeRef, isOver } = useDroppable({ id: 'drop-rolling2' });

  const colTemplate = `repeat(${daysPerWeek}, 1fr)`;

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full flex flex-col overflow-hidden transition ${isOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      style={{ background: 'var(--surface)' }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Horizon :</span>
        {WEEK_OPTIONS.map(n => (
          <button key={n} onClick={() => handleWeeksForward(n)}
            className="text-xs px-2 py-1 rounded transition"
            style={weeksForward === n
              ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
              : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>
            {n} sem.
          </button>
        ))}
        <button onClick={handleWeekends} className="text-xs px-2 py-1 rounded transition ml-auto"
          style={showWeekends
            ? { background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 600 }
            : { background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>
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
        <div className="sticky top-0 z-10 flex border-b"
          style={{ background: 'var(--surface-header)', borderColor: 'var(--surface-border)' }}>
          <div style={{ width: 60, flexShrink: 0 }} />
          {DAY_NAMES.slice(0, daysPerWeek).map(d => (
            <div key={d} className="flex-1 min-w-0 py-1.5 text-center text-[11px] font-semibold border-l"
              style={{ color: 'var(--surface-text-muted)', borderColor: 'var(--surface-border)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => {
          const weekStart      = week[0];
          const weekEnd        = week[week.length - 1];
          const isCurrentWeek  = week.some(d => toISO(d) === todayStr);
          const isPast         = weekEnd < today;
          const wn             = getWeekNumber(weekStart);
          const lanes          = weekLanes[wi] ?? [];

          return (
            <div
              key={toISO(weekStart)}
              ref={isCurrentWeek ? currentWeekRef : undefined}
              className="flex border-b"
              style={{
                borderColor: 'var(--surface-divider)',
                background: isCurrentWeek ? 'var(--surface-current-week)' : isPast ? 'var(--surface-3)' : 'var(--surface)',
              }}
            >
              {/* Week label */}
              <div className="flex flex-col items-center justify-start pt-1.5 gap-0.5 border-r shrink-0"
                style={{ width: 60, borderColor: 'var(--surface-divider)', background: isCurrentWeek ? 'var(--surface-header-cur)' : 'var(--surface-row)' }}>
                <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--surface-text-dim)' }}>
                  {weekStart.toLocaleDateString('fr-FR', { month: 'short' })}
                </span>
                <span className="text-[13px] font-bold leading-none"
                  style={{ color: isCurrentWeek ? 'var(--color-today)' : 'var(--surface-text-muted)' }}>
                  S{wn}
                </span>
                <span className="text-[8px] mt-0.5" style={{ color: 'var(--surface-text-dim)' }}>
                  {String(weekStart.getDate()).padStart(2, '0')}→{String(weekEnd.getDate()).padStart(2, '0')}
                </span>
              </div>

              {/* Day grid */}
              <div className="flex-1 min-w-0">

                {/* Date header row (with background per day) */}
                <div style={{ display: 'grid', gridTemplateColumns: colTemplate }}>
                  {week.map(day => {
                    const dayStr    = toISO(day);
                    const isToday   = dayStr === todayStr;
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div key={dayStr} style={{
                        borderLeft: '1px solid var(--surface-divider)',
                        padding: '3px 4px 2px',
                        background: isToday
                          ? 'color-mix(in srgb, var(--color-today) 22%, transparent)'
                          : isWeekend ? 'var(--surface-weekend)' : undefined,
                      }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width:  isToday ? 18 : undefined,
                          height: isToday ? 18 : undefined,
                          borderRadius: isToday ? '50%' : undefined,
                          background: isToday ? 'var(--color-today)' : undefined,
                          color: isToday ? '#fff' : isPast ? 'var(--surface-text-dim)' : 'var(--surface-text-muted)',
                          fontWeight: isToday ? 700 : 400,
                          fontSize: 10,
                        }}>
                          {day.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Event lanes */}
                <div style={{ paddingTop: 3, paddingBottom: lanes.length > 0 ? 3 : 8 }}>
                  {lanes.map((lane, li) => (
                    <div key={li} style={{
                      display: 'grid',
                      gridTemplateColumns: colTemplate,
                      height: 22,
                      marginBottom: 2,
                    }}>
                      {lane.map(ev => (
                        <EvBarChip
                          key={ev.id}
                          ev={ev}
                          onClick={() => {
                            if (ev.taskId)      store.openTaskModal(ev.taskId);
                            else if (ev.gcalEventId) store.openGcalModal(ev.gcalEventId);
                          }}
                        />
                      ))}
                    </div>
                  ))}
                  {lanes.length === 0 && <div style={{ height: 10 }} />}
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
