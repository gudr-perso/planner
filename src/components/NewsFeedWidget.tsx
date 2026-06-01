import { useEffect, useState } from 'react';

type RssItem = { title: string; link: string; pubDate: string | null };
type FeedCache = { items: RssItem[]; cachedAt: number };
type Tab = 'ai' | 'erp' | 'compta';

const FEED_CONFIGS: { id: string; label: string; url: string; category: Tab }[] = [
  { id: 'numerama',  label: 'Numerama',       url: 'https://www.numerama.com/feed/',                          category: 'ai'    },
  { id: 'siecle',    label: 'Siècle Digital', url: 'https://siecledigital.fr/feed/',                          category: 'ai'    },
  { id: 'jdn',       label: 'Journal du Net', url: 'https://www.journaldunet.com/rss/',                       category: 'erp'   },
  { id: 'jdnsi',     label: 'JDN Solutions',  url: 'https://www.journaldunet.com/solutions/dsi/rss/',         category: 'erp'   },
  { id: 'compta',    label: 'Compta Online',  url: 'https://www.compta-online.com/rss-actualites-pcg-78-1.html', category: 'compta' },
  { id: 'silicon',   label: 'Silicon.fr',     url: 'https://www.silicon.fr/feed',                             category: 'compta' },
];

const TAB_LABELS: Record<Tab, string> = {
  ai:     'IA / Tech',
  erp:    'Gestion',
  compta: 'Comptabilité',
};

function parseRss(xml: string): RssItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const isAtom = doc.querySelector('feed') !== null;
  const entries = isAtom
    ? Array.from(doc.querySelectorAll('entry'))
    : Array.from(doc.querySelectorAll('item'));

  return entries.slice(0, 8).map(el => {
    const title = el.querySelector('title')?.textContent?.trim() ?? '';
    const link = isAtom
      ? (el.querySelector('link')?.getAttribute('href') ?? el.querySelector('link')?.textContent ?? '')
      : (el.querySelector('link')?.textContent ?? '');
    const pubDate = el.querySelector('pubDate')?.textContent
      ?? el.querySelector('published')?.textContent
      ?? el.querySelector('updated')?.textContent
      ?? null;
    return { title, link: link.trim(), pubDate };
  });
}

function getCachedFeed(id: string): FeedCache | null {
  try {
    const raw = localStorage.getItem(`rssCache_${id}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as FeedCache;
    if (Date.now() - data.cachedAt > 30 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

function relativeDate(str: string): string {
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'hier';
    return `il y a ${days}j`;
  } catch { return ''; }
}

export function NewsFeedWidget() {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [items, setItems] = useState<Record<string, RssItem[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const feeds = FEED_CONFIGS.filter(f => f.category === activeTab);
    const toFetch = feeds.filter(f => !getCachedFeed(f.id));

    toFetch.forEach(feed => {
      setLoading(prev => ({ ...prev, [feed.id]: true }));
      const encoded = encodeURIComponent(feed.url);
      fetch(`/rss-proxy?url=${encoded}`)
        .then(r => r.text())
        .then(xml => {
          const parsed = parseRss(xml);
          localStorage.setItem(`rssCache_${feed.id}`, JSON.stringify({ items: parsed, cachedAt: Date.now() }));
          setItems(prev => ({ ...prev, [feed.id]: parsed }));
        })
        .catch(() => {})
        .finally(() => setLoading(prev => ({ ...prev, [feed.id]: false })));
    });

    feeds.forEach(feed => {
      const cached = getCachedFeed(feed.id);
      if (cached) setItems(prev => ({ ...prev, [feed.id]: cached.items }));
    });
  }, [activeTab]);

  const feeds = FEED_CONFIGS.filter(f => f.category === activeTab);
  const allItems = feeds.flatMap(f => (items[f.id] ?? []).map(item => ({ ...item, feedId: f.id })));
  const isLoading = feeds.some(f => loading[f.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Header + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase', margin: 0 }}>
          Actualités
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ai', 'erp', 'compta'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: 20,
                border: activeTab === tab ? '1px solid var(--accent)' : '1px solid rgba(100,160,255,0.15)',
                background: activeTab === tab ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-dim)',
                cursor: 'pointer',
                transition: 'all 150ms',
                whiteSpace: 'nowrap',
              }}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Articles — hauteur fixe pour éviter les sauts de position */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {isLoading && allItems.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0, padding: '8px 0' }}>Chargement…</p>
        )}
        {!isLoading && allItems.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0, padding: '8px 0' }}>Aucun article disponible</p>
        )}
        {allItems.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              padding: '7px 0',
              borderBottom: i < allItems.length - 1 ? '1px solid rgba(100,160,255,0.08)' : 'none',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <p style={{
              fontSize: 12,
              color: 'var(--text)',
              margin: 0,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
            >
              {item.title}
            </p>
            {item.pubDate && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, display: 'block' }}>
                {relativeDate(item.pubDate)}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
