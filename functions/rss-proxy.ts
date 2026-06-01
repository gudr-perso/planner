const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ALLOWED_FEEDS = new Set([
  'https://www.technologyreview.com/feed/',
  'https://www.therundown.ai/rss',
  'https://www.journaldunet.com/rss/',
]);

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const feedUrl = url.searchParams.get('url');

  if (!feedUrl || !ALLOWED_FEEDS.has(feedUrl)) {
    return new Response('Forbidden', { status: 403, headers: CORS });
  }

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'CAP-Planner-RSS/1.0' },
    });
    const xml = await res.text();
    return new Response(xml, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch {
    return new Response('Feed unavailable', { status: 502, headers: CORS });
  }
};
