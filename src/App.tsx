import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { StoreContext, type StoreCtx } from './store';
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
import { SettingsView } from './components/SettingsView';
import { TaskModal } from './components/TaskModal';
import { GcalModal } from './components/GcalModal';
import { BriefingView } from './components/BriefingView';
import { PartenairesView } from './components/PartenairesView';
import { SuivisView } from './components/SuivisView';
import { HomeView } from './components/HomeView';
import type { PartenaireEntry } from './types';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

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
function PlannerApp() {
  const [data, setData] = useState<DataBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>(() => load<ViewKey>('view', 'home'));
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

  const [refreshing, setRefreshing] = useState(false);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      if (dataSource === 'notion') {
        const cfg = load<NotionConfig | null>('notionConfig', null);
        if (cfg?.integrationToken && cfg?.databaseId) {
          const d = await syncFromNotion(cfg);
          setData((prev) => ({ ...d, googleEvents: prev?.googleEvents ?? [] }));
          return;
        }
      }
      const d = await loadDemoData();
      setData((prev) => prev ? { ...d, googleEvents: prev.googleEvents } : d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [dataSource]);

  useEffect(() => {
    if (dataSource === 'notion') {
      const cfg = load<NotionConfig | null>('notionConfig', null);
      if (cfg?.integrationToken && cfg?.databaseId) {
        syncFromNotion(cfg)
          .then((d) => setData((prev) => ({ ...d, googleEvents: prev?.googleEvents ?? [] })))
          .catch(() => loadDemoData().then(setData));
        return;
      }
    }
    loadDemoData().then(setData).catch((e: Error) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDataSource = useCallback(async () => {
    if (dataSource === 'demo') {
      const cfg = load<NotionConfig | null>('notionConfig', null);
      if (!cfg?.integrationToken || !cfg?.databaseId) { setView('settings'); return; }
      try {
        const d = await syncFromNotion(cfg);
        setData((prev) => ({ ...d, googleEvents: prev?.googleEvents ?? [] }));
        setDataSource('notion');
        save('dataSource', 'notion');
      } catch (e) { setGcalError((e as Error).message); }
    } else {
      const d = await loadDemoData();
      setData(d);
      setDataSource('demo');
      save('dataSource', 'demo');
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

  // Fetch Google Calendar events when token is available
  useEffect(() => {
    if (!gcalToken || !data) return;
    const now = new Date();
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    setGcalLoading(true);
    setGcalError(null);
    fetchGoogleCalendarEvents(gcalToken, now.toISOString(), sixMonths.toISOString())
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
  }, [gcalToken]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const projectById = useMemo(() => new Map(data?.projects.map((p) => [p.id, p]) ?? []), [data]);
  const personById = useMemo(() => new Map(data?.people.map((p) => [p.id, p]) ?? []), [data]);

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

  const store: StoreCtx | null = data ? {
    data, projectById, personById, filters, setFilters,
    gcal: {
      accessToken: gcalToken,
      loading: gcalLoading,
      error: gcalError,
      connect: () => !GOOGLE_CLIENT_ID ? setGcalError('Google Client ID non configuré (VITE_GOOGLE_CLIENT_ID)') : login(),
      disconnect: () => { setGcalToken(null); save('gcalToken', null); setGcalError(null); },
    },
    planTask, unplanTask, updateTaskDates,
    openTaskModal: (taskId: string) => setModalTaskId(taskId),
    openGcalModal: (eventId: string) => setGcalModalEventId(eventId),
  } : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || !store) return;
    const taskId = (e.active.data.current as { taskId?: string })?.taskId;
    if (!taskId) return;
    const tomorrow = new Date('2026-05-29');
    const days = e.over.id === 'drop-gantt' ? 5 : 1;
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + days - 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    store.planTask(taskId, iso(tomorrow), iso(endDate));
  };

  if (error) return <div className="p-6 text-red-400 h-screen" style={{ background: 'var(--bg-deep)' }}>Erreur : {error}</div>;
  if (!store) return (
    <div className="h-screen w-screen flex items-center justify-center" style={{ background: 'var(--bg-deep)' }}>
      <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</div>
    </div>
  );

  const handleNotionSync = (notionData: DataBundle) => {
    setData((prev) => ({ ...notionData, googleEvents: prev?.googleEvents ?? [] }));
    setDataSource('notion');
    save('dataSource', 'notion');
  };

  return (
    <StoreContext.Provider value={store}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
            />
            <div className="flex-1 flex min-h-0 relative">
              {view !== 'home' && view !== 'settings' && view !== 'briefing' && view !== 'partenaires' && view !== 'suivis' && <UnplannedPanel width={panelWidth} />}
              {view !== 'home' && view !== 'settings' && view !== 'briefing' && view !== 'partenaires' && view !== 'suivis' && (
                <div
                  className="w-1 shrink-0 cursor-col-resize transition-colors"
                  style={{ background: 'var(--border)' }}
                  onMouseDown={onPanelResize}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
                  title="Redimensionner"
                />
              )}
              <main className="flex-1 min-w-0 overflow-hidden" style={{ background: view === 'home' ? 'var(--bg-deep, #02071f)' : 'var(--surface)' }}>
                {view === 'home' ? <HomeView onNavigate={setView} />
                  : view === 'calendar' ? <CalendarView />
                  : view === 'rolling'  ? <RollingWeeksView />
                  : view === 'rolling2' ? <RollingWeeksView2 />
                  : view === 'settings' ? <SettingsView onSync={handleNotionSync} />
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
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'placeholder'}>
      <PlannerApp />
    </GoogleOAuthProvider>
  );
}
