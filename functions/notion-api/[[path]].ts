const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Notion-Version',
};

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const notionPath = url.pathname.replace(/^\/notion-api/, '');
  const notionUrl = `https://api.notion.com/v1${notionPath}${url.search}`;

  const upstream = new Headers();
  for (const name of ['Authorization', 'Content-Type', 'Notion-Version']) {
    const val = request.headers.get(name);
    if (val) upstream.set(name, val);
  }

  const res = await fetch(notionUrl, {
    method: request.method,
    headers: upstream,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });

  const responseHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) responseHeaders.set(k, v);

  return new Response(res.body, { status: res.status, headers: responseHeaders });
};
