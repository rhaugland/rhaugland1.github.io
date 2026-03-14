import { formatInTimeZone, toDate } from "date-fns-tz";
import { addDays, addHours } from "date-fns";
import { nanoid } from "nanoid";

const DEMO_MODE = !process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function getTimezone(): string {
  return process.env.BOOKING_TIMEZONE ?? "America/New_York";
}

function getBusinessHours(): { start: number; end: number } {
  return {
    start: parseInt(process.env.BOOKING_START_HOUR ?? "9"),
    end: parseInt(process.env.BOOKING_END_HOUR ?? "17"),
  };
}

/** Generate business-day slots in the configured timezone. */
function generateSlots(busyPeriods: Array<{ start: Date; end: Date }> = []) {
  const tz = getTimezone();
  const { start: startHour, end: endHour } = getBusinessHours();

  const businessDays: Date[] = [];
  const now = new Date();
  let cursor = addDays(now, 1);

  while (businessDays.length < 7) {
    const dayOfWeek = parseInt(formatInTimeZone(cursor, tz, "i"));
    if (dayOfWeek <= 5) {
      businessDays.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  return businessDays.map((day) => {
    const dateStr = formatInTimeZone(day, tz, "yyyy-MM-dd");
    const dayLabel = formatInTimeZone(day, tz, "EEE M/d").toLowerCase();

    const times: Array<{ start: string; label: string }> = [];

    for (let hour = startHour; hour < endHour; hour++) {
      const slotStart = toDate(
        `${dateStr}T${String(hour).padStart(2, "0")}:00:00`,
        { timeZone: tz }
      );
      const slotEnd = addHours(slotStart, 1);

      const isBusy = busyPeriods.some(
        (busy) => slotStart < busy.end && slotEnd > busy.start
      );

      if (!isBusy) {
        const ampm = hour >= 12 ? "pm" : "am";
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const isoWithOffset = formatInTimeZone(
          slotStart,
          tz,
          "yyyy-MM-dd'T'HH:mm:ssXXX"
        );
        times.push({ start: isoWithOffset, label: `${displayHour}:00${ampm}` });
      }
    }

    return { date: dateStr, label: dayLabel, times };
  }).filter((s) => s.times.length > 0);
}

// ---------------------------------------------------------------------------
// Public API — auto-switches between demo and live Google Calendar
// ---------------------------------------------------------------------------

/** Returns available 60-minute slots for the next 7 business days. */
export async function getAvailableSlots(): Promise<
  Array<{
    date: string;
    label: string;
    times: Array<{ start: string; label: string }>;
  }>
> {
  if (DEMO_MODE) {
    // demo: all business-hour slots are available (no busy periods)
    return generateSlots();
  }

  // live: fetch busy periods from Google Calendar
  const { google } = await import("googleapis");
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const tz = getTimezone();

  const businessDays: Date[] = [];
  let cursor = addDays(new Date(), 1);
  while (businessDays.length < 7) {
    const dayOfWeek = parseInt(formatInTimeZone(cursor, tz, "i"));
    if (dayOfWeek <= 5) businessDays.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }

  const dateStrFirst = formatInTimeZone(businessDays[0], tz, "yyyy-MM-dd");
  const dateStrLast = formatInTimeZone(businessDays[businessDays.length - 1], tz, "yyyy-MM-dd");
  const timeMin = toDate(`${dateStrFirst}T00:00:00`, { timeZone: tz });
  const timeMax = toDate(`${dateStrLast}T23:59:59`, { timeZone: tz });

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: tz,
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods = (freeBusy.data.calendars?.[calendarId]?.busy ?? []).map(
    (b) => ({ start: new Date(b.start!), end: new Date(b.end!) })
  );

  return generateSlots(busyPeriods);
}

/** Create a Google Calendar event and return the event ID. */
export async function createCalendarEvent(params: {
  summary: string;
  description: string;
  startTime: string;
  attendeeEmail: string;
}): Promise<string> {
  if (DEMO_MODE) {
    // demo: return a fake event ID
    console.log("[demo] calendar event:", params.summary, "for", params.attendeeEmail);
    return `demo-event-${nanoid(10)}`;
  }

  const { google } = await import("googleapis");
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const tz = getTimezone();

  const startDate = new Date(params.startTime);
  const endDate = addHours(startDate, 1);

  const event = await calendar.events.insert({
    calendarId,
    sendUpdates: "all",
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: startDate.toISOString(), timeZone: tz },
      end: { dateTime: endDate.toISOString(), timeZone: tz },
      attendees: [{ email: params.attendeeEmail }],
    },
  });

  return event.data.id!;
}
