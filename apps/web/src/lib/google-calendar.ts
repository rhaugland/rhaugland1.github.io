import { google } from "googleapis";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { addDays, addHours } from "date-fns";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getCalendarClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is not set");
  }

  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return google.calendar({ version: "v3", auth });
}

function getCalendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error("GOOGLE_CALENDAR_ID env var is not set");
  return id;
}

function getTimezone(): string {
  return process.env.BOOKING_TIMEZONE ?? "America/New_York";
}

function getBusinessHours(): { start: number; end: number } {
  return {
    start: parseInt(process.env.BOOKING_START_HOUR ?? "9"),
    end: parseInt(process.env.BOOKING_END_HOUR ?? "17"),
  };
}

/** Returns available 60-minute slots for the next 7 business days. */
export async function getAvailableSlots(): Promise<
  Array<{
    date: string;
    label: string;
    times: Array<{ start: string; label: string }>;
  }>
> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const tz = getTimezone();
  const { start: startHour, end: endHour } = getBusinessHours();

  // collect next 7 business days (weekdays) in the configured timezone
  const businessDays: Date[] = [];
  const now = new Date();
  let cursor = addDays(now, 1); // start from tomorrow

  while (businessDays.length < 7) {
    // get day-of-week in the business timezone
    const dayOfWeek = parseInt(formatInTimeZone(cursor, tz, "i")); // 1=Mon, 7=Sun
    if (dayOfWeek <= 5) {
      businessDays.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  // build time range for free/busy query
  const dateStrFirst = formatInTimeZone(businessDays[0], tz, "yyyy-MM-dd");
  const dateStrLast = formatInTimeZone(businessDays[businessDays.length - 1], tz, "yyyy-MM-dd");
  const timeMin = toDate(`${dateStrFirst}T00:00:00`, { timeZone: tz });
  const timeMax = toDate(`${dateStrLast}T23:59:59`, { timeZone: tz });

  // fetch free/busy from Google Calendar
  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: tz,
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods =
    freeBusy.data.calendars?.[calendarId]?.busy ?? [];

  // generate slots in the business timezone and subtract busy periods
  const slots = businessDays.map((day) => {
    const dateStr = formatInTimeZone(day, tz, "yyyy-MM-dd");
    const dayLabel = formatInTimeZone(day, tz, "EEE M/d").toLowerCase();

    const times: Array<{ start: string; label: string }> = [];

    for (let hour = startHour; hour < endHour; hour++) {
      // create slot times in the business timezone
      const slotStart = toDate(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`, { timeZone: tz });
      const slotEnd = addHours(slotStart, 1);

      // check if slot overlaps any busy period
      const isBusy = busyPeriods.some((busy) => {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isBusy) {
        const ampm = hour >= 12 ? "pm" : "am";
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        // format with timezone offset (e.g., "2026-03-17T10:00:00-05:00")
        const isoWithOffset = formatInTimeZone(slotStart, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
        times.push({
          start: isoWithOffset,
          label: `${displayHour}:00${ampm}`,
        });
      }
    }

    return { date: dateStr, label: dayLabel, times };
  });

  return slots.filter((s) => s.times.length > 0);
}

/** Create a Google Calendar event and return the event ID. Sends invite to attendee. */
export async function createCalendarEvent(params: {
  summary: string;
  description: string;
  startTime: string;
  attendeeEmail: string;
}): Promise<string> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();
  const tz = getTimezone();

  const startDate = new Date(params.startTime);
  const endDate = addHours(startDate, 1);

  const event = await calendar.events.insert({
    calendarId,
    sendUpdates: "all", // sends calendar invite to attendee
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
