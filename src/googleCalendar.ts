import type { GoogleEvent } from './types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function toISO(dt: string) {
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Google all-day event end dates are exclusive (event "today" → end = tomorrow).
// Schedule-X uses inclusive end dates → subtract 1 day.
function allDayEndInclusive(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Google API error ${res.status}`);
  }

  const data = await res.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => {
    const start = item.start as { dateTime?: string; date?: string };
    const end = item.end as { dateTime?: string; date?: string };
    const isAllDay = !start?.dateTime;
    const startStr = start?.dateTime ?? start?.date ?? '';
    const endStr = end?.dateTime ?? end?.date ?? '';

    const attendees = Array.isArray(item.attendees)
      ? (item.attendees as Array<{ email?: string; displayName?: string }>)
          .map((a) => a.displayName ?? a.email ?? '').filter(Boolean)
      : [];

    // Video call link: hangoutLink (Meet) or first video entryPoint in conferenceData
    let hangoutLink: string | undefined = item.hangoutLink as string | undefined;
    if (!hangoutLink) {
      const conf = item.conferenceData as Record<string, unknown> | undefined;
      const entries = conf?.entryPoints as Array<Record<string, string>> | undefined;
      const videoEntry = entries?.find(e => e.entryPointType === 'video');
      hangoutLink = videoEntry?.uri;
    }

    return {
      id: String(item.id),
      title: String(item.summary ?? '(sans titre)'),
      start: isAllDay ? startStr : toISO(startStr),
      end: isAllDay ? allDayEndInclusive(endStr) : toISO(endStr),
      attendees,
      description: item.description ? String(item.description) : undefined,
      location: item.location ? String(item.location) : undefined,
      hangoutLink,
    } satisfies GoogleEvent;
  });
}
