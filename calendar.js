// The calendar logic of the widget: days, events, their layout and their labels. This file reads no
// page and no network, so the unit tests of tests/calendar.test.js run it in Node.
//
// A day is a `YYYY-MM-DD` text. A time of day is a number of hours, such as 14.5 for 14:30. Each
// time is in the time zone of the browser, as `new Date()` gives it.

const minuteMs = 60_000;
const hourMs = 3_600_000;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The patterns of the side bar of an event, one for each calendar in turn. So two calendars differ
 * by more than colour: style.css draws each one.
 */
export const patterns = ["solid", "stripes", "dots", "checks", "bands", "outline"];

/** The day of a date in the browser's time zone, as `YYYY-MM-DD`. */
export function dayOf(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

/** The day `count` days after `day` (before it for a negative count). */
export function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** The number of days from `from` to `to`: 1 from today to tomorrow. */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** `count` days from `first`, in order. */
export function dayWindow(first, count) {
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/** The midnight that starts a day, in the browser's time zone. */
export function startOfDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/**
 * How many days the time grid shows in a frame of this width. The week view shows 7 days on a
 * wide frame and fewer on a narrow one, so each column keeps room for a title.
 */
export function gridDays(view, width) {
  if (view === "week") return width >= 900 ? 7 : width >= 620 ? 5 : width >= 340 ? 3 : 1;
  return width >= 520 ? 3 : width >= 340 ? 2 : 1;
}

/** The calendars of `calendars.json`, each with its pattern, or null for Eva's `null` answer. */
export function readCalendars(value) {
  if (!Array.isArray(value)) return null;
  return value
    .filter((calendar) => typeof calendar?.id === "string")
    .map((calendar, index) => ({
      id: calendar.id,
      name: typeof calendar.name === "string" && calendar.name !== "" ? calendar.name : "Calendar",
      color: typeof calendar.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(calendar.color) ? calendar.color : null,
      primary: calendar.primary === true,
      pattern: patterns[index % patterns.length],
    }));
}

/** A link that a tap may open: an https address only, never a `javascript:` one. */
export function safeLink(value) {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The events of `events.json`, or null for Eva's `null` answer. A timed event gets `start` and
 * `end` as dates; an all-day event gets `allDay: true` with `date` and `endDate`. An event that a
 * person or a tool wrote with fewer fields is kept when it can be shown, and dropped otherwise.
 */
export function readEvents(value) {
  if (!Array.isArray(value)) return null;
  const events = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const base = {
      id: typeof item.id === "string" ? item.id : "",
      calendarId: typeof item.calendarId === "string" ? item.calendarId : "",
      title: typeof item.title === "string" && item.title.trim() !== "" ? item.title : "(No title)",
      place: typeof item.place === "string" && item.place !== "" ? item.place : null,
      link: safeLink(item.link),
    };
    if (typeof item.date === "string" && isoDay.test(item.date)) {
      const endDate = typeof item.endDate === "string" && item.endDate >= item.date ? item.endDate : item.date;
      events.push({ ...base, allDay: true, date: item.date, endDate });
      continue;
    }
    const start = new Date(typeof item.startAt === "string" ? item.startAt : Number.NaN);
    const end = new Date(typeof item.endAt === "string" ? item.endAt : Number.NaN);
    if (Number.isNaN(start.getTime())) continue;
    // An event with no end, or an end before its start, shows as a short event.
    const safeEnd = Number.isNaN(end.getTime()) || end <= start ? new Date(start.getTime() + 30 * minuteMs) : end;
    events.push({ ...base, allDay: false, start, end: safeEnd });
  }
  return events.sort((a, b) => sortKey(a) - sortKey(b));
}

function sortKey(event) {
  return event.allDay ? startOfDay(event.date).getTime() : event.start.getTime();
}

/**
 * The example events of the demo, moved by whole days so that their first day, `anchor`, falls on
 * `today`. The mock file holds made-up events on fixed days; this keeps the demo from looking
 * empty. A timed event of the mock has no offset, so it shows at the same clock time everywhere.
 */
export function moveExample(value, anchor, today) {
  if (!Array.isArray(value)) return value;
  const shift = daysBetween(anchor, today);
  const move = (text) =>
    typeof text === "string" && isoDay.test(text.slice(0, 10))
      ? `${addDays(text.slice(0, 10), shift)}${text.slice(10)}`
      : text;
  return value.map((event) => ({
    ...event,
    ...("date" in event ? { date: move(event.date), endDate: move(event.endDate) } : {}),
    ...("startAt" in event ? { startAt: move(event.startAt), endAt: move(event.endAt) } : {}),
  }));
}

/** The all-day events of a day. */
export function allDayOn(events, day) {
  return events.filter((event) => event.allDay && event.date <= day && event.endDate >= day);
}

/**
 * The part of each timed event that falls on a day: `{ event, from, to }`, in hours from its
 * midnight. An event that runs over midnight shows on each of its days.
 */
export function partsOn(events, day) {
  const midnight = startOfDay(day).getTime();
  const nextMidnight = startOfDay(addDays(day, 1)).getTime();
  // A day with a clock change has 23 or 25 hours: measure from its own midnight.
  const length = (nextMidnight - midnight) / hourMs;
  return events
    .filter((event) => !event.allDay && event.start.getTime() < nextMidnight && event.end.getTime() > midnight)
    .map((event) => ({
      event,
      from: Math.max(0, (event.start.getTime() - midnight) / hourMs),
      to: Math.min(length, (event.end.getTime() - midnight) / hourMs),
    }));
}

/**
 * Places the parts of one day side by side where they overlap, as a calendar does. Each part gets
 * `column` and `columns`: the parts of one group of overlaps share the width of the day.
 */
export function layoutParts(parts) {
  const sorted = [...parts].sort((a, b) => a.from - b.from || b.to - a.to);
  const placed = [];
  let group = [];
  let groupEnd = -1;
  const close = () => {
    const columnEnds = [];
    for (const part of group) {
      let column = columnEnds.findIndex((end) => end <= part.from);
      if (column < 0) {
        column = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[column] = part.to;
      placed.push({ ...part, column });
    }
    for (const part of placed.slice(placed.length - group.length)) part.columns = columnEnds.length;
    group = [];
    groupEnd = -1;
  };
  for (const part of sorted) {
    if (group.length > 0 && part.from >= groupEnd) close();
    group.push(part);
    groupEnd = Math.max(groupEnd, part.to);
  }
  if (group.length > 0) close();
  return placed;
}

/**
 * The hours that the grid shows: the usual hours, widened to each event of the shown days, so no
 * event falls outside. `parts` holds the parts of every shown day.
 */
export function hourRange(parts, usual = { from: 7, to: 21 }) {
  let from = usual.from;
  let to = usual.to;
  for (const part of parts) {
    from = Math.min(from, Math.floor(part.from));
    to = Math.max(to, Math.ceil(part.to));
  }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}

/**
 * The height of one hour, in pixels, so the hours fit the free height with no scroll bar. Below
 * `smallest`, the hours would be too thin to read: the grid then scrolls.
 */
export function hourHeight(free, hours, smallest = 16, largest = 64) {
  if (hours <= 0) return smallest;
  return Math.max(smallest, Math.min(largest, Math.floor(free / hours)));
}

/** The time of day of a date, in hours: 14.5 for 14:30. */
export function hoursOf(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** A time of day in hours as `HH:MM`. */
export function clock(hours) {
  const minutes = Math.round(hours * 60);
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The `HH:MM` of a date. */
export function clockOf(date) {
  return clock(hoursOf(date));
}

/**
 * The event that the small card shows: the one that runs now, else the next one, as
 * `{ event, now }`. Null when no timed event is left in the list.
 */
export function nextEvent(events, now) {
  const time = now.getTime();
  const event = events.find((item) => !item.allDay && item.end.getTime() > time);
  return event === undefined ? null : { event, now: event.start.getTime() <= time };
}

/** The time until a start, as the small card says it: "in 40 min", "in 2 h 5 min", "in 3 days". */
export function untilText(milliseconds) {
  const minutes = Math.ceil(milliseconds / minuteMs);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${String(minutes)} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `in ${String(hours)} h` : `in ${String(hours)} h ${String(rest)} min`;
  }
  const days = Math.round(minutes / (24 * 60));
  return days === 1 ? "in 1 day" : `in ${String(days)} days`;
}

/** The name of a day: `{ weekday: "Wed", date: 18, month: "Nov", relative: "Today" | "Tomorrow" | null }`. */
export function dayName(day, today) {
  const date = new Date(`${day}T00:00:00Z`);
  const away = daysBetween(today, day);
  return {
    weekday: weekdays[date.getUTCDay()],
    date: date.getUTCDate(),
    month: months[date.getUTCMonth()],
    relative: away === 0 ? "Today" : away === 1 ? "Tomorrow" : null,
  };
}

/** The days of a window as one label: "Wed 18 – Tue 24 Nov", or "Mon 30 Nov – Sun 6 Dec". */
export function rangeLabel(first, last) {
  const start = dayName(first, first);
  const end = dayName(last, first);
  if (first === last) return `${start.weekday} ${String(start.date)} ${start.month}`;
  const startText =
    start.month === end.month
      ? `${start.weekday} ${String(start.date)}`
      : `${start.weekday} ${String(start.date)} ${start.month}`;
  return `${startText} – ${end.weekday} ${String(end.date)} ${end.month}`;
}
