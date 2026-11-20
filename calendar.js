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

/** The title of an event with no title: Google Calendar shows such an event as busy time. */
export const noTitle = "Busy";

function isMidnight(date) {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

/**
 * Whether a timed event covers whole days, so it belongs in the all-day row as Google Calendar
 * shows it: it runs from a midnight to a later midnight (one day or more, also over a clock
 * change), or it lasts 24 hours or more. An event that only crosses midnight, such as 22:00 to
 * 02:00, stays in the time grid.
 */
export function isWholeDay(start, end) {
  if (end <= start) return false;
  return (isMidnight(start) && isMidnight(end)) || end.getTime() - start.getTime() >= 24 * hourMs;
}

/**
 * The events of `events.json`, or null for Eva's `null` answer. A timed event gets `start` and
 * `end` as dates; an all-day event gets `allDay: true` with `date` and `endDate`. A timed event
 * that covers whole days (see `isWholeDay`) becomes an all-day event too: from midnight to
 * midnight it is one like Google's, and one of 24 hours or more keeps its `start` and `end`. An
 * event that a person or a tool wrote with fewer fields is kept when it can be shown, and dropped
 * otherwise.
 */
export function readEvents(value) {
  if (!Array.isArray(value)) return null;
  const events = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const base = {
      id: typeof item.id === "string" ? item.id : "",
      calendarId: typeof item.calendarId === "string" ? item.calendarId : "",
      title: typeof item.title === "string" && item.title.trim() !== "" ? item.title : noTitle,
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
    if (isWholeDay(start, safeEnd)) {
      const days = { allDay: true, date: dayOf(start), endDate: dayOf(new Date(safeEnd.getTime() - 1)) };
      events.push(
        isMidnight(start) && isMidnight(safeEnd) ? { ...base, ...days } : { ...base, ...days, start, end: safeEnd },
      );
      continue;
    }
    events.push({ ...base, allDay: false, start, end: safeEnd });
  }
  return events.sort((a, b) => sortKey(a) - sortKey(b));
}

function sortKey(event) {
  return event.allDay ? startOfDay(event.date).getTime() : event.start.getTime();
}

/**
 * The bars of the all-day row over the shown `days`: one bar for each all-day event, from its
 * first shown day to its last, in the first lane that is free on those days. Returns
 * `{ bars, lanes }`; each bar is `{ event, first, last, lane, cutStart, cutEnd }`, where `first`
 * and `last` are indexes of `days`, and `cutStart` and `cutEnd` say that the event runs on before
 * or after the shown days.
 */
export function allDayLanes(events, days) {
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const bars = events
    .filter((event) => event.allDay && event.date <= lastDay && event.endDate >= firstDay)
    .map((event) => ({
      event,
      first: Math.max(0, daysBetween(firstDay, event.date)),
      last: Math.min(days.length - 1, daysBetween(firstDay, event.endDate)),
      cutStart: event.date < firstDay,
      cutEnd: event.endDate > lastDay,
    }))
    .sort((a, b) => a.first - b.first || b.last - a.last);
  const laneEnds = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end < bar.first);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = bar.last;
    bar.lane = lane;
  }
  return {
    bars: bars.map(({ event, first, last, lane, cutStart, cutEnd }) => ({
      event,
      first,
      last,
      lane,
      cutStart,
      cutEnd,
    })),
    lanes: laneEnds.length,
  };
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
 * Stacks the parts of one day where they overlap, in the spirit of Google Calendar. Each part gets
 * `left` and `width`, as shares of the day's width, and `depth`, its layer: a higher depth draws on
 * top.
 *
 * - The parts go in order of start, the longer first.
 * - A part that overlaps no earlier part keeps the whole width.
 * - A part that starts less than `together` hours after the start of the group that it overlaps
 *   (the top one, where several do) joins that group: the parts of a group share its width side by
 *   side, the earlier first.
 * - A later part sits on top of the part that it overlaps, on the next layer, indented by `indent`
 *   from that part's left and running to the right edge of that part's group. The earlier part
 *   keeps its width, so its title, at its top, stays in view.
 * - No part on top gets narrower than `minWidth`: its indent shrinks instead.
 */
export function layoutParts(parts, { together = 0.5, indent = 0.2, minWidth = 0.5 } = {}) {
  const sorted = [...parts].sort((a, b) => a.from - b.from || b.to - a.to);
  const groups = [];
  const placed = [];
  for (const part of sorted) {
    let top = null;
    for (const item of placed) {
      if (item.part.from >= part.to || part.from >= item.part.to) continue;
      if (
        top === null ||
        item.group.depth > top.group.depth ||
        (item.group.depth === top.group.depth && item.part.from >= top.part.from)
      )
        top = item;
    }
    let group;
    if (top === null) {
      group = { start: part.from, depth: 0, parent: null, members: [] };
      groups.push(group);
    } else if (part.from - top.group.start < together) {
      group = top.group;
    } else {
      group = { start: part.from, depth: top.group.depth + 1, parent: top, members: [] };
      groups.push(group);
    }
    const item = { part, group };
    group.members.push(item);
    placed.push(item);
  }
  // A group's parent comes before it, so its place is known in time.
  for (const group of groups) {
    if (group.parent === null) {
      group.left = 0;
      group.right = 1;
    } else {
      const { parent } = group;
      group.right = parent.group.right;
      group.left = Math.max(parent.left, Math.min(parent.left + indent, group.right - minWidth));
    }
    const width = (group.right - group.left) / group.members.length;
    group.members.forEach((item, index) => {
      item.left = group.left + index * width;
      item.width = width;
    });
  }
  return placed.map((item) => ({ ...item.part, left: item.left, width: item.width, depth: item.group.depth }));
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

/** A duration as the details of an event say it: "45 min", "1 h 30 min", "2 days", "1 day 4 h". */
export function durationText(milliseconds) {
  const minutes = Math.round(milliseconds / minuteMs);
  if (minutes < 60) return `${String(minutes)} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.round((minutes % (24 * 60)) / 60);
  const dayText = days === 1 ? "1 day" : `${String(days)} days`;
  return hours === 0 ? dayText : `${dayText} ${String(hours)} h`;
}

function fullDay(day) {
  const name = dayName(day, day);
  return `${name.weekday} ${String(name.date)} ${name.month}`;
}

/**
 * The day and the time span of an event, with its duration, as its details show them:
 * "Wed 11 Mar · 15:00–17:00 · 2 h", "Wed 11 Mar 22:00 – Thu 12 Mar 02:00 · 4 h",
 * "Sat 14 Mar · All day" or "Sat 14 – Sun 15 Mar · 2 days".
 */
export function whenText(event) {
  if (event.start !== undefined) {
    const first = dayOf(event.start);
    const last = dayOf(event.end);
    const duration = durationText(event.end.getTime() - event.start.getTime());
    if (first === last) return `${fullDay(first)} · ${clockOf(event.start)}–${clockOf(event.end)} · ${duration}`;
    return `${fullDay(first)} ${clockOf(event.start)} – ${fullDay(last)} ${clockOf(event.end)} · ${duration}`;
  }
  if (event.date === event.endDate) return `${fullDay(event.date)} · All day`;
  const days = daysBetween(event.date, event.endDate) + 1;
  return `${rangeLabel(event.date, event.endDate)} · ${String(days)} days`;
}

/**
 * Where the details of an event show, inside the frame: above the event, else below it, else
 * beside it (right, then left), else over it, as `{ left, top, side }` in pixels from the top left
 * of the frame. `anchor` is the event's box `{ left, top, right, bottom }`, `size` the tooltip's
 * `{ width, height }` and `frame` the widget's `{ width, height }`. The top right `corner` stays
 * free for Eva's full-screen button: a tooltip there moves left, or else down.
 */
export function tooltipPosition(anchor, size, frame, { gap = 6, margin = 4, corner = 56 } = {}) {
  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
  const maxLeft = frame.width - size.width - margin;
  const maxTop = frame.height - size.height - margin;
  let left = clamp((anchor.left + anchor.right) / 2 - size.width / 2, margin, maxLeft);
  let top;
  let side;
  if (anchor.top - gap - size.height >= margin) {
    top = anchor.top - gap - size.height;
    side = "above";
  } else if (anchor.bottom + gap + size.height <= frame.height - margin) {
    top = anchor.bottom + gap;
    side = "below";
  } else {
    top = clamp(anchor.top, margin, maxTop);
    if (anchor.right + gap + size.width <= frame.width - margin) {
      left = anchor.right + gap;
      side = "right";
    } else if (anchor.left - gap - size.width >= margin) {
      left = anchor.left - gap - size.width;
      side = "left";
    } else {
      top = clamp(anchor.top + gap, margin, maxTop);
      side = "inside";
    }
  }
  if (top < corner && left + size.width > frame.width - corner) {
    if (frame.width - corner - size.width >= margin) left = frame.width - corner - size.width;
    else if (corner + size.height <= frame.height - margin) top = corner;
  }
  return { left: Math.max(margin, left), top: Math.max(margin, top), side };
}
