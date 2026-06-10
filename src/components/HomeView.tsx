import { useEffect, useState } from 'react';
import { AlarmClock, ArrowUpRight, Building2, CalendarDays, Clock, FileText, FolderOpen, ListTodo, StickyNote, Ticket, Users } from 'lucide-react';
import type { ViewKey } from './Toolbar';
import { PostItsWidget } from './PostItsWidget';
import { NewsFeedWidget } from './NewsFeedWidget';
import { useIsMobile } from '../hooks/useBreakpoint';
import { useAuth } from '../store/useAuthStore';

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

// ── Quote ──────────────────────────────────────────────────────────────────────

const FRENCH_QUOTES = [
  { q: "La qualité n'est jamais un accident ; c'est toujours le résultat d'un effort intelligent.", a: "John Ruskin" },
  { q: "Le succès, c'est d'aller d'échec en échec sans perdre son enthousiasme.", a: "Winston Churchill" },
  { q: "Ce n'est pas parce que les choses sont difficiles que nous n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles.", a: "Sénèque" },
  { q: "La vie, c'est ce qui arrive quand vous êtes occupé à faire d'autres plans.", a: "John Lennon" },
  { q: "Il ne faut pas attendre d'être parfait pour commencer quelque chose de bien.", a: "Saint François de Sales" },
  { q: "Le temps est la chose la plus précieuse qu'un homme puisse dépenser.", a: "Théophraste" },
  { q: "Agis bien maintenant, car tu auras le reste de ta vie pour t'en féliciter.", a: "Proverbe" },
  { q: "La discipline est le pont entre les objectifs et les accomplissements.", a: "Jim Rohn" },
  { q: "Chaque journée est une nouvelle chance de changer ta vie.", a: "Proverbe" },
  { q: "Les grands esprits ont toujours rencontré une opposition farouche des esprits médiocres.", a: "Albert Einstein" },
  { q: "Commencez par faire ce qui est nécessaire, puis ce qui est possible, et soudainement vous ferez l'impossible.", a: "Saint François d'Assise" },
  { q: "L'imagination est plus importante que le savoir.", a: "Albert Einstein" },
  { q: "Il faut toujours viser la lune, car même en cas d'échec, on atterrit dans les étoiles.", a: "Oscar Wilde" },
  { q: "Le seul endroit où le succès précède le travail, c'est dans le dictionnaire.", a: "Vidal Sassoon" },
  { q: "Votre temps est limité, ne le gâchez pas à vivre la vie de quelqu'un d'autre.", a: "Steve Jobs" },
  { q: "Nous devenons ce que nous faisons de manière répétée.", a: "Aristote" },
  { q: "La meilleure façon de prédire l'avenir, c'est de le créer.", a: "Peter Drucker" },
  { q: "Celui qui déplace des montagnes commence par enlever de petites pierres.", a: "Confucius" },
  { q: "Une idée sans action n'est qu'un rêve.", a: "Proverbe" },
  { q: "Ne remets pas à demain ce que tu peux faire aujourd'hui.", a: "Benjamin Franklin" },
];

type QuoteData = { q: string; a: string; day: string };

function getQuoteCache(): QuoteData | null {
  try {
    const raw = localStorage.getItem('quoteDayCache');
    if (!raw) return null;
    const data = JSON.parse(raw) as QuoteData;
    if (data.day !== new Date().toDateString()) return null;
    return data;
  } catch { return null; }
}

function QuoteWidget() {
  const [quote, setQuote] = useState<{ q: string; a: string } | null>(() => getQuoteCache());

  useEffect(() => {
    if (quote) return;

    const dayIndex = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    const fallback = FRENCH_QUOTES[dayIndex % FRENCH_QUOTES.length];

    fetch('https://zenquotes.io/api/today')
      .then(r => r.json())
      .then((data: { q: string; a: string }[]) => {
        const item = data[0];
        if (item?.q) {
          const cached: QuoteData = { q: item.q, a: item.a, day: new Date().toDateString() };
          localStorage.setItem('quoteDayCache', JSON.stringify(cached));
          setQuote({ q: item.q, a: item.a });
        } else {
          setQuote(fallback);
        }
      })
      .catch(() => setQuote(fallback));
  }, [quote]);

  if (!quote) return null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 16px' }}>
      <p style={{
        fontSize: 13,
        fontStyle: 'italic',
        color: 'var(--text-muted)',
        margin: 0,
        lineHeight: 1.5,
      }}>
        "{quote.q}"
      </p>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>— {quote.a}</span>
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

const CAP_CARDS: CardDef[] = [
  {
    viewKey: 'clients',
    title: 'Clients',
    description: 'Fiches clients & contacts',
    icon: <Building2 size={20} />,
    color: '#8B5CF6',
  },
  {
    viewKey: 'projets',
    title: 'Projets',
    description: 'Projets CAP en cours',
    icon: <FolderOpen size={20} />,
    color: '#F97316',
  },
];

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
    viewKey: 'todo',
    title: 'ToDo',
    description: 'Liste de tâches à faire',
    icon: <ListTodo size={20} />,
    color: '#84CC16',
  },
  {
    viewKey: 'postits',
    title: 'Post-its',
    description: 'Notes rapides & mémos',
    icon: <StickyNote size={20} />,
    color: '#FBBF24',
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
  {
    viewKey: 'temps',
    title: 'Temps',
    description: 'Suivi du temps par projet',
    icon: <Clock size={20} />,
    color: '#06B6D4',
  },
  {
    viewKey: 'tickets',
    title: 'Tickets',
    description: 'PRB, SF, CHN & demandes',
    icon: <Ticket size={20} />,
    color: '#EC4899',
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

export function HomeView({ onNavigate, postitsRefreshKey }: { onNavigate: (v: ViewKey) => void; postitsRefreshKey?: number }) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const isClientUser = Boolean(user?.client_code);
  const today = new Date();
  const dateLabel = today.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();

  const visibleCapCards = isClientUser
    ? CAP_CARDS.filter(c => c.viewKey === 'projets')
    : CAP_CARDS;

  // ── Vue mobile : empilement vertical ────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', background: 'var(--bg-deep, #050c3f)' }}>
        {/* Header compact */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 4 }}>
            {dateLabel}
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, margin: '0 0 4px' }}>
            Bonjour, Guillaume
          </h1>
          <WeatherWidget />
        </div>

        {/* Accès rapide CUMA : grille 2 colonnes — masqué pour les clients */}
        {!isClientUser && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase' }}>
              Accès rapide
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {CARDS.map(card => (
                <HomeCard key={card.viewKey} card={card} onClick={() => onNavigate(card.viewKey)} />
              ))}
            </div>
          </>
        )}

        {/* Accès rapide CAP */}
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase' }}>
          Accès rapide CAP
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {visibleCapCards.map(card => (
            <HomeCard key={card.viewKey} card={card} onClick={() => onNavigate(card.viewKey)} />
          ))}
        </div>

        {/* Post-its — masqués pour les clients */}
        {!isClientUser && (
          <div style={{ marginBottom: 24 }}>
            <PostItsWidget refreshKey={postitsRefreshKey} />
          </div>
        )}

        {/* News */}
        <NewsFeedWidget />
      </div>
    );
  }

  // ── Vue desktop ──────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '36px 40px',
      background: 'var(--bg-deep, #050c3f)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flexShrink: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 6 }}>
              {dateLabel}
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, margin: 0 }}>
              Bonjour, Guillaume
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              Votre poste de commande. 7 espaces, tout à portée de main.
            </p>
          </div>
          <QuoteWidget />
          <div style={{ flexShrink: 0 }}>
            <WeatherWidget />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 40, alignItems: 'stretch' }}>
        <div style={{ flex: '0 0 auto' }}>
          {/* Accès rapide CUMA — masqué pour les clients */}
          {!isClientUser && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 14, textTransform: 'uppercase' }}>
                Accès rapide
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 180px)', gap: 14 }}>
                {CARDS.map(card => (
                  <HomeCard key={card.viewKey} card={card} onClick={() => onNavigate(card.viewKey)} />
                ))}
              </div>
              <div style={{ height: 1, background: 'rgba(100,160,255,0.1)', margin: '24px 0' }} />
            </>
          )}

          {/* Accès rapide CAP */}
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 14, textTransform: 'uppercase' }}>
            Accès rapide CAP
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleCapCards.length}, 180px)`, gap: 14 }}>
            {visibleCapCards.map(card => (
              <HomeCard key={card.viewKey} card={card} onClick={() => onNavigate(card.viewKey)} />
            ))}
          </div>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(100,160,255,0.1)', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Post-its — masqués pour les clients */}
          {!isClientUser && (
            <>
              <div style={{ flexShrink: 0 }}>
                <PostItsWidget refreshKey={postitsRefreshKey} />
              </div>
              <div style={{ height: 1, background: 'rgba(100,160,255,0.1)', margin: '20px 0', flexShrink: 0 }} />
            </>
          )}
          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
            <NewsFeedWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
