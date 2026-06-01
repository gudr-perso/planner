import { useEffect, useRef, useState } from 'react';
import { AlarmClock, CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, Home, Pin, Settings, TicketCheck, Users } from 'lucide-react';
import type { ViewKey } from './Toolbar';

const PLANNING_VIEWS: ViewKey[] = ['calendar', 'rolling', 'rolling2', 'gantt'];

type NavItemDef = { key: string; icon: React.ReactNode; label: string };

const MAIN_ITEMS: NavItemDef[] = [
  { key: 'home',        icon: <Home size={17} />,         label: 'Accueil' },
  { key: 'planning',    icon: <CalendarDays size={17} />,  label: 'Planning' },
  { key: 'briefing',    icon: <AlarmClock size={17} />,    label: 'Briefing' },
  { key: 'postits',     icon: <Pin size={17} />,           label: 'Post-its' },
  { key: 'partenaires', icon: <Users size={17} />,         label: 'Partenaires' },
  { key: 'suivis',      icon: <FileText size={17} />,      label: 'Suivis' },
  { key: 'temps',       icon: <Clock size={17} />,         label: 'Temps' },
  { key: 'tickets',     icon: <TicketCheck size={17} />,   label: 'Tickets' },
];

const BOTTOM_ITEMS: NavItemDef[] = [
  { key: 'settings', icon: <Settings size={17} />, label: 'Paramètres' },
];

function NavItem({
  item, isActive, collapsed, onClick,
}: {
  item: NavItemDef;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      role="menuitem"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        width: '100%',
        padding: collapsed ? '11px 0' : '9px 14px 9px 13px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: isActive
          ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
          : hovered
            ? 'color-mix(in srgb, var(--accent) 6%, transparent)'
            : 'transparent',
        borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        cursor: 'pointer',
        color: isActive ? 'var(--accent)' : hovered ? 'var(--text)' : 'var(--text-muted)',
        whiteSpace: 'nowrap',
        transition: 'background 120ms, color 120ms',
        textAlign: 'left',
        minWidth: 0,
      }}
    >
      <span style={{ flexShrink: 0, lineHeight: 1, display: 'flex' }}>{item.icon}</span>
      {!collapsed && (
        <span style={{
          fontSize: 13,
          fontWeight: isActive ? 700 : 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {item.label}
        </span>
      )}
    </button>
  );
}

export function SideNav({
  view, onView, collapsed, onToggle,
}: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const lastPlanningView = useRef<ViewKey>('calendar');

  useEffect(() => {
    if (PLANNING_VIEWS.includes(view)) {
      lastPlanningView.current = view;
    }
  }, [view]);

  const isPlanningActive = PLANNING_VIEWS.includes(view);

  return (
    <nav
      role="menu"
      aria-label="Navigation principale"
      style={{
        width: collapsed ? 56 : 200,
        transition: 'width 200ms ease',
        background: 'var(--bg-deep)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* Main sections */}
      <div style={{ flex: 1, paddingTop: 8, paddingBottom: 8 }}>
        {MAIN_ITEMS.map((item) => {
          const isActive = item.key === 'planning' ? isPlanningActive : view === item.key;
          const handleClick = item.key === 'planning'
            ? () => onView(lastPlanningView.current)
            : () => onView(item.key as ViewKey);
          return (
            <NavItem
              key={item.key}
              item={item}
              isActive={isActive}
              collapsed={collapsed}
              onClick={handleClick}
            />
          );
        })}
      </div>

      {/* Bottom: Settings + toggle */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, paddingBottom: 4 }}>
        {BOTTOM_ITEMS.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            isActive={view === item.key}
            collapsed={collapsed}
            onClick={() => onView(item.key as ViewKey)}
          />
        ))}

        <button
          onClick={onToggle}
          title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: 10,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            fontSize: 18,
            fontWeight: 700,
            transition: 'color 120ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </nav>
  );
}
