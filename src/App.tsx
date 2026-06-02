import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent, type DragMoveEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { StoreContext, type StoreCtx } from './store';
import { AuthContext, type AuthUser, _registerLogout } from './store/useAuthStore';
import { LoginPage } from './components/LoginPage';
import { SetupPage } from './components/SetupPage';
import { UsersView } from './components/UsersView';
import { loadDemoData } from './loadData';
import { fetchGoogleCalendarEvents } from './googleCalendar';
import { syncFromNotion, patchNotionDates } from './notionService';
import { save, load } from './persistence';
import type { DataBundle, GoogleEvent, NotionConfig } from './types';
import { UnplannedPanel } from './components/UnplannedPanel';
import { CalendarView } from './components/CalendarView';
import { GanttView } from './components/GanttView';
import { RollingWeeksView } from './components/RollingWeeksView';
import { RollingWeeksView2 } from './components/RollingWeeksView2';
import { Toolbar, type ViewKey } from './components/Toolbar';
import { SideNav } from './components/SideNav';
import { useIsTablet } from './hooks/useBreakpoint';
import { SettingsView } from './components/SettingsView';
import { TaskModal } from './components/TaskModal';
import { GcalModal } from './components/GcalModal';
import { BriefingView } from './components/BriefingView';
import { PartenairesView } from './components/PartenairesView';
import { SuivisView } from './components/SuivisView';
import { HomeView } from './components/HomeView';
import { TempsView } from './components/TempsView';
import { TicketsView } from './components/TicketsView';
import { TodoView } from './components/TodoView';
import { PostItsView } from './components/PostItsView';
import type { PartenaireEntry } from './types';

// Google Client ID stored in localStorage (configured via Settings), never baked into the bundle.

type StoredToken = { token: string; expiresAt: number };

function loadToken(): string | null {
  const stored = load<StoredToken | null>('gcalToken', null);
  if (!stored) return null;
  // Garde une marge de 2 min avant l'expiration réelle
  if (Date.now() > stored.expiresAt - 120_000) {
    save('gcalToken', null);
    return null;
  }
  return stored.token;
}

function saveToken(token: string, expiresIn: number) {
  save('gcalToken', { token, expiresAt: Date.now() + expiresIn * 1000 } satisfies StoredToken);
}

// ── Resize hook ────────────────────────────────────────────────────────────────
function useResizablePanel(storageKey: string, initialWidth: number, min = 180, max = 520) {
  const [width, setWidth] = useState(() => load<number>(storageKey, initialWidth));
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.max(min, Math.min(max, ev.clientX));
      setWidth(next);
    };
    const onUp = (ev: MouseEvent) => {
      dragging.current = false;
      const next = Math.max(min, Math.min(max, ev.clientX));
      setWidth(next);
      save(storageKey, next);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [storageKey, min, max]);

  return { width, onMouseDown };
}

// ── Inner app ─────────────────────────────────────────────────────────────────
function PlannerApp({ onGcalClientIdChange, onLogout }: { onGcalClientIdChange: (id: string) => void; onLogout: () => void }) {
  const emptyBundle: DataBundle = { tasks: [], projects: [], people: [], googleEvents: [] };
  const [data, setData] = useState<DataBundle>(emptyBundle);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>(() => {
    if (localStorage.getItem('planner:_justImported')) return 'settings';
    return load<ViewKey>('view', 'home');
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => load<boolean>('sidebarCollapsed', false));
  const [gcalToken, setGcalToken] = useState<string | null>(loadToken);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [gcalModalEventId, setGcalModalEventId] = useState<string | null>(null);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalError, setGcalError] = useState<string | null>(null);
  const [notionWriteStatus, setNotionWriteStatus] = useState<'saving' | 'ok' | 'error' | null>(null);
  const [notionWriteMsg, setNotionWriteMsg] = useState<string | null>(null);
  const [partenaireFilter, setPartenaireFilter] = useState<PartenaireEntry | null>(null);
  const [suivisSearch, setSuivisSearch] = useState('');
  const googleClientId = load<string>('gcalClientId', '');
  const [dataSource, setDataSource] = useState<'demo' | 'notion'>(() => load<'demo' | 'notion'>('dataSource', 'demo'));
  const [theme, setTheme] = useState<'default' | 'forge'>(() => load<'default' | 'forge'>('theme', 'default'));
  const [filters, setFiltersState] = useState<StoreCtx['filters']>(() => ({
    projectIds: new Set<string>(),
    assigneeIds: new Set<string>(),
    subprojectIds: new Set<string>(),
    colorBy: load<StoreCtx['filters']['colorBy']>('colorBy', 'status'),
    showGcal: load<boolean>('showGcal', true),
  }));

  const { width: panelWidth, onMouseDown: onPanelResize } = useResizablePanel('panelWidth', 280);
  const isTablet = useIsTablet();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [postitsRefreshKey, setPostitsRefreshKey] = useState(0);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setPostitsRefreshKey(k => k + 1);
    setDataLoaded(false);
    try {
      if (dataSource === 'notion') {
        const cfg = load<NotionConfig | null>('notionConfig', null);
        if (cfg?.integrationToken && cfg?.databaseId) {
          const d = await syncFromNotion(cfg);
          setData((prev) => ({ ...d, googleEvents: prev.googleEvents }));
          setDataLoaded(true);
          return;
        }
      }
      const d = await loadDemoData();
      setData((prev) => ({ ...d, googleEvents: prev.googleEvents }));
      setDataLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [dataSource]);

  const PLANNING_VIEWS: ViewKey[] = ['calendar', 'gantt', 'rolling', 'rolling2', 'todo'];

  const loadPlanningData = useCallback(async () => {
    if (dataLoaded || dataLoading) return;
    setDataLoading(true);
    try {
      if (dataSource === 'notion') {
        const cfg = load<NotionConfig | null>('notionConfig', null);
        if (cfg?.integrationToken && cfg?.databaseId) {
          const d = await syncFromNotion(cfg);
          setData((prev) => ({ ...d, googleEvents: prev.googleEvents }));
          setDataLoaded(true);
          return;
        }
      }
      const d = await loadDemoData();
      setData((prev) => ({ ...d, googleEvents: prev.googleEvents }));
      setDataLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDataLoading(false);
    }
  }, [dataSource, dataLoaded, dataLoading]);

  useEffect(() => {
    if (PLANNING_VIEWS.includes(view)) {
      loadPlanningData();
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDataSource = useCallback(async () => {
    if (dataSource === 'demo') {
      const cfg = load<NotionConfig | null>('notionConfig', null);
      if (!cfg?.integrationToken || !cfg?.databaseId) { setView('settings'); return; }
      setDataSource('notion');
      save('dataSource', 'notion');
      setDataLoaded(false);
    } else {
      setDataSource('demo');
      save('dataSource', 'demo');
      setDataLoaded(false);
    }
  }, [dataSource]);
  useEffect(() => { save('view', view); }, [view]);
  useEffect(() => { save('sidebarCollapsed', sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => { save('colorBy', filters.colorBy); }, [filters.colorBy]);
  useEffect(() => { save('showGcal', filters.showGcal); }, [filters.showGcal]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'default' ? 'forge' : 'default'));

  // Fetch Google Calendar events when token is available and data is loaded.
  // lastGcalFetchToken tracks which token was last used so we don't re-fetch on
  // every task update (data changes), but DO fetch when data first becomes available
  // after a token was already stored (e.g. on app startup with a cached token).
  const lastGcalFetchToken = useRef<string | null>(null);
  useEffect(() => {
    if (!gcalToken || !data) return;
    if (lastGcalFetchToken.current === gcalToken) return;
    lastGcalFetchToken.current = gcalToken;
    const now = new Date();
    const startOfLastWeek = new Date(now);
    const dayOfWeek = now.getDay(); // 0=Sun
    startOfLastWeek.setDate(now.getDate() - dayOfWeek - 7); // go back to last Sunday
    startOfLastWeek.setHours(0, 0, 0, 0);
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    setGcalLoading(true);
    setGcalError(null);
    fetchGoogleCalendarEvents(gcalToken, startOfLastWeek.toISOString(), sixMonths.toISOString())
      .then((events: GoogleEvent[]) => {
        setData((prev) => prev ? { ...prev, googleEvents: events } : prev);
        setGcalLoading(false);
      })
      .catch((e: Error) => {
        setGcalError(e.message);
        setGcalLoading(false);
        if (e.message.includes('401') || e.message.includes('403')) {
          setGcalToken(null);
          save('gcalToken', null);
        }
      });
  }, [gcalToken, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: (res) => {
      const token = res.access_token;
      const expiresIn = (res as { expires_in?: number }).expires_in ?? 3600;
      setGcalToken(token);
      saveToken(token, expiresIn);
    },
    onError: (e) => setGcalError(String(e.error_description ?? e.error ?? 'OAuth error')),
  });

  const projectById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data]);
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data]);

  const setFilters: StoreCtx['setFilters'] = (f) => setFiltersState((prev) => ({ ...prev, ...f }));

  const writeNotion = useCallback((taskId: string, startISO: string, endISO: string) => {
    if (dataSource !== 'notion') return;
    const cfg = load<NotionConfig | null>('notionConfig', null);
    if (!cfg?.integrationToken || !cfg.fieldMap?.date) return;
    setNotionWriteStatus('saving');
    setNotionWriteMsg(null);
    patchNotionDates(cfg.integrationToken, taskId, cfg.fieldMap.date, startISO, endISO)
      .then(() => {
        setNotionWriteStatus('ok');
        setTimeout(() => setNotionWriteStatus(null), 2000);
      })
      .catch((e: Error) => {
        setNotionWriteStatus('error');
        setNotionWriteMsg(e.message);
      });
  }, [dataSource]);

  const planTask: StoreCtx['planTask'] = (taskId, startISO, endISO) => {
    setData((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === taskId ? { ...t, planned: true, start_date: startISO, end_date: endISO } : t) } : prev);
    writeNotion(taskId, startISO, endISO);
  };

  const unplanTask: StoreCtx['unplanTask'] = (taskId) =>
    setData((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === taskId ? { ...t, planned: false, start_date: null, end_date: null } : t) } : prev);

  const updateTaskDates: StoreCtx['updateTaskDates'] = (taskId, startISO, endISO) => {
    setData((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === taskId ? { ...t, start_date: startISO, end_date: endISO } : t) } : prev);
    writeNotion(taskId, startISO, endISO);
  };

  const store: StoreCtx = {
    data, projectById, personById, filters, setFilters,
    gcal: {
      accessToken: gcalToken,
      loading: gcalLoading,
      error: gcalError,
      connect: () => !googleClientId ? setGcalError('Google Client ID non configuré (voir Paramètres → Google Agenda)') : login(),
      disconnect: () => { setGcalToken(null); save('gcalToken', null); setGcalError(null); },
    },
    planTask, unplanTask, updateTaskDates,
    openTaskModal: (taskId: string) => setModalTaskId(taskId),
    openGcalModal: (eventId: string) => setGcalModalEventId(eventId),
    dataLoading,
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragPos = useRef<{ x: number; y: number } | null>(null);

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || !store) return;
    const taskId = (e.active.data.current as { taskId?: string })?.taskId;
    if (!taskId) return;

    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();

    if (e.over.id === 'drop-gantt') {
      const start = new Date(today);
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 4);
      store.planTask(taskId, isoDate(start), isoDate(end));
      return;
    }

    if (e.over.id === 'drop-calendar') {
      const { x, y } = dragPos.current ?? { x: 0, y: 0 };

      // --- Detect date from the day column under the cursor ---
      // schedule-x uses: data-time-grid-date (week/day view), data-date (month grid)
      let dateStr = isoDate(today);
      let node: Element | null = document.elementFromPoint(x, y);
      while (node) {
        const d = node.getAttribute('data-time-grid-date') ?? node.getAttribute('data-date');
        if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) { dateStr = d.slice(0, 10); break; }
        node = node.parentElement;
      }

      // --- Detect hour from Y position in the time grid ---
      // .sx__week-grid is the timed area (height = gridHeight prop)
      // .sx__view-container is the scrollable container
      const timeGrid = document.querySelector('.sx__week-grid') as HTMLElement | null;
      const scrollContainer = document.querySelector('.sx__view-container') as HTMLElement | null;
      let hour = 9; // fallback default
      if (timeGrid && scrollContainer) {
        const rect = timeGrid.getBoundingClientRect();
        const relY = (y - rect.top) + scrollContainer.scrollTop;
        const totalHeight = timeGrid.scrollHeight; // = gridHeight prop (900 default)
        const dayStartHour = parseInt(load<string>('calDayStart', '08:00'));
        const dayEndHour = parseInt(load<string>('calDayEnd', '20:00'));
        const totalHours = dayEndHour - dayStartHour;
        hour = Math.floor(dayStartHour + (relY / totalHeight) * totalHours);
        hour = Math.max(dayStartHour, Math.min(dayEndHour - 1, hour));
      }

      const hh = (h: number) => String(h).padStart(2, '0');
      const startStr = `${dateStr} ${hh(hour)}:00`;
      const endStr = `${dateStr} ${hh(hour + 1)}:00`;
      store.planTask(taskId, startStr, endStr);
      return;
    }

    // Fallback for other drop zones
    const start = new Date(today);
    start.setDate(start.getDate() + 1);
    store.planTask(taskId, isoDate(start), isoDate(start));
  };

  if (error) return <div className="p-6 text-red-400 h-screen" style={{ background: 'var(--bg-deep)' }}>Erreur : {error}</div>;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    onLogout();
  }

  const handleNotionSync = (notionData: DataBundle) => {
    setData((prev) => ({ ...notionData, googleEvents: prev?.googleEvents ?? [] }));
    setDataSource('notion');
    save('dataSource', 'notion');
  };

  return (
    <StoreContext.Provider value={store}>
      <DndContext
        sensors={sensors}
        onDragMove={(e: DragMoveEvent) => {
          const ae = e.activatorEvent as PointerEvent;
          dragPos.current = { x: ae.clientX + e.delta.x, y: ae.clientY + e.delta.y };
        }}
        onDragEnd={handleDragEnd}
      >
        {modalTaskId && (
          <TaskModal taskId={modalTaskId} onClose={() => setModalTaskId(null)} />
        )}
        {gcalModalEventId && (
          <GcalModal eventId={gcalModalEventId} onClose={() => setGcalModalEventId(null)} />
        )}
        <div className="h-screen w-screen flex overflow-hidden" style={{ background: 'var(--bg)' }}>
          <SideNav
            view={view}
            onView={setView}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
            onLogout={handleLogout}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
          <div className="flex-1 flex flex-col min-w-0">
            <Toolbar
              view={view}
              onView={setView}
              dataSource={dataSource}
              onToggleDataSource={toggleDataSource}
              theme={theme}
              onToggleTheme={toggleTheme}
              suivisSearch={suivisSearch}
              onSuivisSearch={setSuivisSearch}
              suivisPartenaireFilterLabel={partenaireFilter?.title}
              onClearSuivisFilter={() => setPartenaireFilter(null)}
              onRefresh={refreshData}
              refreshing={refreshing}
              onOpenMobileNav={() => setMobileNavOpen(true)}
            />
            <div className="flex-1 flex min-h-0 relative">
              {!isTablet && view !== 'home' && view !== 'settings' && view !== 'briefing' && view !== 'todo' && view !== 'partenaires' && view !== 'suivis' && view !== 'temps' && view !== 'tickets' && view !== 'postits' && view !== 'users' && <UnplannedPanel width={panelWidth} />}
              {!isTablet && view !== 'home' && view !== 'settings' && view !== 'briefing' && view !== 'todo' && view !== 'partenaires' && view !== 'suivis' && view !== 'temps' && view !== 'tickets' && view !== 'postits' && (
                <div
                  className="w-1 shrink-0 cursor-col-resize transition-colors"
                  style={{ background: 'var(--border)' }}
                  onMouseDown={onPanelResize}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
                  title="Redimensionner"
                />
              )}
              <main className="flex-1 min-w-0 overflow-hidden" style={{ background: view === 'home' ? 'var(--bg-deep, #02071f)' : view === 'users' ? 'var(--bg)' : 'var(--surface)' }}>
                {view === 'users' ? <UsersView />
                  : view === 'home' ? <HomeView onNavigate={setView} postitsRefreshKey={postitsRefreshKey} />
                  : view === 'calendar' ? <CalendarView />
                  : view === 'rolling'  ? <RollingWeeksView />
                  : view === 'rolling2' ? <RollingWeeksView2 />
                  : view === 'settings' ? <SettingsView onSync={handleNotionSync} onGcalClientIdSave={(id) => { save('gcalClientId', id); onGcalClientIdChange(id); }} />
                  : view === 'briefing' ? <BriefingView />
                  : view === 'partenaires' ? (
                    <PartenairesView
                      onOpenSuivis={(p) => { setPartenaireFilter(p); setView('suivis'); }}
                    />
                  )
                  : view === 'suivis' ? (
                    <SuivisView
                      partenaireFilter={partenaireFilter}
                      onClearFilter={() => setPartenaireFilter(null)}
                    />
                  )
                  : view === 'todo' ? <TodoView />
                  : view === 'temps' ? <TempsView />
                  : view === 'tickets' ? <TicketsView />
                  : view === 'postits' ? <PostItsView refreshKey={postitsRefreshKey} />
                  : <GanttView />}
              </main>
            </div>
          </div>
          {/* Notion write-back indicator */}
          {notionWriteStatus && (
            <div
              className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium"
              style={notionWriteStatus === 'error'
                ? { background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--color-error-deep)' }
                : notionWriteStatus === 'ok'
                  ? { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-deep)' }
                  : { background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {notionWriteStatus === 'saving' && <span className="animate-spin">⟳</span>}
              {notionWriteStatus === 'ok' && '✓'}
              {notionWriteStatus === 'error' && '⚠'}
              <span>
                {notionWriteStatus === 'saving' && 'Envoi vers Notion…'}
                {notionWriteStatus === 'ok' && 'Notion mis à jour'}
                {notionWriteStatus === 'error' && `Notion : ${notionWriteMsg}`}
              </span>
              {notionWriteStatus === 'error' && (
                <button onClick={() => setNotionWriteStatus(null)} className="ml-1 opacity-60 hover:opacity-100">✕</button>
              )}
            </div>
          )}
        </div>
      </DndContext>
    </StoreContext.Provider>
  );
}

export default function App() {
  const [clientId, setClientId] = useState<string>(() => load<string>('gcalClientId', ''));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Register global logout handler for apiFetch 401 interceptor
  _registerLogout(() => setAuthUser(null));

  useEffect(() => {
    async function checkAuth() {
      try {
        // Check if setup needed first (no users)
        const setupRes = await fetch('/api/setup');
        if (setupRes.ok) {
          const { hasUsers } = await setupRes.json();
          if (!hasUsers) { setNeedsSetup(true); setAuthLoading(false); return; }
        }
        // Try to restore session
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const { user } = await meRes.json();
          setAuthUser(user);
        }
      } catch { /* offline or no API */ }
      setAuthLoading(false);
    }
    checkAuth();
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: 'var(--bg-deep)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</div>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <AuthContext.Provider value={{ user: null, setUser: setAuthUser }}>
        <SetupPage onDone={(u) => { setAuthUser(u); setNeedsSetup(false); }} />
      </AuthContext.Provider>
    );
  }

  if (!authUser) {
    return (
      <AuthContext.Provider value={{ user: null, setUser: setAuthUser }}>
        <LoginPage onLogin={setAuthUser} />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ user: authUser, setUser: setAuthUser }}>
      {/* key forces GoogleOAuthProvider to remount when clientId changes (new login context) */}
      <GoogleOAuthProvider key={clientId || 'placeholder'} clientId={clientId || 'placeholder'}>
        <PlannerApp onGcalClientIdChange={setClientId} onLogout={() => setAuthUser(null)} />
      </GoogleOAuthProvider>
    </AuthContext.Provider>
  );
}
