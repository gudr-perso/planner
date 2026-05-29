import { useEffect, useState } from 'react';
import { AlarmClock, ArrowUpRight, CalendarDays, FileText, Users } from 'lucide-react';
import type { ViewKey } from './Toolbar';

// ── Weather ────────────────────────────────────────────────────────────────────

const WMO_MAP: Record<number, { label: string; icon: string }> = {
  0:  { label: 'Ciel dégagé',    icon: '☀️' },
  1:  { label: 'Peu nuageux',    icon: '🌤️' },
  2:  { label: 'Partiellement nuageux', icon: '⛅' },
  3:  { label: 'Couvert',        icon: '☁️' },
  45: { label: 'Brouillard',     icon: '🌫️' },
  48: { label: 'Givre',          icon: '🌫️' },
  51: { label: 'Bruine légère',  icon: '🌦️' },
  53: { label: 'Bruine',         icon: '🌦️' },
  55: { label: 'Bruine forte',   icon: '🌧️' },
  61: { label: 'Pluie légère',   icon: '🌧️' },
  63: { label: 'Pluie',          icon: '🌧️' },
  65: { label: 'Pluie forte',    icon: '🌧️' },
  71: { label: 'Neige légère',   icon: '❄️' },
  73: { label: 'Neige',          icon: '❄️' },
  75: { label: 'Neige forte',    icon: '❄️' },
  80: { label: 'Averses',        icon: '🌦️' },
  81: { label: 'Averses',        icon: '🌦️' },
  82: { label: 'Averses fortes', icon: '⛈️' },
  95: { label: 'Orage',          icon: '⛈️' },
  96: { label: 'Orage avec grêle', icon: '⛈️' },
  99: { label: 'Orage violent',  icon: '⛈️' },
};

type WeatherData = { temp: number; code: number; cachedAt: number };

function getWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem('weatherCache');
    if (!raw) return null;
    const data = JSON.parse(raw) as WeatherData;
    if (Date.now() - data.cachedAt > 2 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(() => getWeather());
  const [loading, setLoading] = useState(!getWeather());
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (weather) return;
    fetch('https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true')
      .then(r => r.json())
      .then((d: { current_weather: { temperature: number; weathercode: number } }) => {
        const w: WeatherData = {
          temp: Math.round(d.current_weather.temperature),
          code: d.current_weather.weathercode,
          cachedAt: Date.now(),
        };
        localStorage.setItem('weatherCache', JSON.stringify(w));
        setWeather(w);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weather]);

  const info = weather ? (WMO_MAP[weather.code] ?? { label: 'Variable', icon: '🌤️' }) : null;
  const hhmm = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 16px',
      borderRadius: 12,
      background: 'linear-gradient(135deg, #0d1f45 0%, #0a2a5e 100%)',
      border: '1px solid rgba(100, 160, 255, 0.18)',
      minWidth: 180,
    }}>
      {loading ? (
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>— — —</span>
      ) : weather && info ? (
        <>
          <span style={{ fontSize: 28, lineHeight: 1 }}>{info.icon}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
              {weather.temp}°
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{info.label}</span>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Paris</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{hhmm}</span>
          </div>
        </>
      ) : (
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Météo indisponible</span>
      )}
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────────

type CardDef = {
  viewKey: ViewKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
};

const CARDS: CardDef[] = [
  {
    viewKey: 'calendar',
    title: 'Planning',
    description: 'Calendrier, semaine & Gantt',
    icon: <CalendarDays size={20} />,
    color: 'var(--accent)',
  },
  {
    viewKey: 'briefing',
    title: 'Briefing',
    description: 'Centre des briefings du matin',
    icon: <AlarmClock size={20} />,
    color: '#F97316',
  },
  {
    viewKey: 'partenaires',
    title: 'Partenaires',
    description: 'Réseau & contacts clés',
    icon: <Users size={20} />,
    color: '#8B5CF6',
  },
  {
    viewKey: 'suivis',
    title: 'Suivis',
    description: 'Dossiers & relances en cours',
    icon: <FileText size={20} />,
    color: '#10B981',
  },
];

function HomeCard({ card, onClick }: { card: CardDef; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '16px 16px 20px',
        borderRadius: 12,
        background: hovered
          ? `linear-gradient(135deg, #112050 0%, #0e2d6a 100%)`
          : 'linear-gradient(135deg, #0b1a3e 0%, #0c2358 100%)',
        border: `1px solid ${hovered ? `color-mix(in srgb, ${card.color} 40%, rgba(100,160,255,0.15))` : 'rgba(100, 160, 255, 0.12)'}`,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 150ms, border-color 150ms',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Arrow top-right */}
      <span style={{
        position: 'absolute',
        top: 10,
        right: 12,
        color: hovered ? card.color : 'var(--text-dim)',
        transition: 'color 150ms, opacity 150ms',
        opacity: hovered ? 1 : 0.4,
      }}>
        <ArrowUpRight size={14} />
      </span>

      {/* Icon */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 8,
        background: `color-mix(in srgb, ${card.color} 15%, transparent)`,
        color: card.color,
        marginBottom: 10,
      }}>
        {card.icon}
      </span>

      {/* Text */}
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
        {card.title}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
        {card.description}
      </span>

      {/* Bottom color stripe */}
      <span style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: card.color,
        opacity: hovered ? 1 : 0.6,
        transition: 'opacity 150ms',
        borderRadius: '0 0 12px 12px',
      }} />
    </button>
  );
}

// ── HomeView ───────────────────────────────────────────────────────────────────

export function HomeView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '36px 40px',
      background: 'var(--bg-deep, #050c3f)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36, gap: 24 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 6 }}>
            {dateLabel}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, margin: 0 }}>
            Bonjour, Guillaume
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            Votre poste de commande. 4 espaces, tout à portée de main.
          </p>
        </div>
        <WeatherWidget />
      </div>

      {/* Section label */}
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 14, marginTop: 48, textTransform: 'uppercase' }}>
        Accès rapide
      </p>

      {/* Cards grid — 4 colonnes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        maxWidth: 900,
        gap: 16,
      }}>
        {CARDS.map(card => (
          <HomeCard key={card.viewKey} card={card} onClick={() => onNavigate(card.viewKey)} />
        ))}
      </div>
    </div>
  );
}
