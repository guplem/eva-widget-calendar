// The Calendar widget. It talks to its host through fetch to relative paths, to the hosts of its
// manifest, Open-Meteo, and through the asks of contract 3 (postMessage to its parent). Inside Eva,
// eva/google-calendar/ answers with the person's calendar, eva/location.json with the last location
// and eva/state.json with the widget's own state. On GitHub Pages, these paths do not exist, so the
// mock files under example/ answer, the state stays in memory and no ask gets an answer. See the
// contract: https://github.com/guplem/eva/blob/main/docs/widgets.md
//
// calendar.js and forecast.js hold the logic. This file loads the data and draws it.
import {
  addDays,
  allDayLanes,
  allDayOn,
  chatText,
  clock,
  clockOf,
  dayName,
  dayOf,
  dayWindow,
  gridDays,
  hourHeight,
  hourRange,
  hoursOf,
  layoutParts,
  menuEntries,
  menuPosition,
  moveExample,
  nextEvent,
  partsOn,
  rangeLabel,
  readCalendars,
  readEvents,
  readHiddenCalendars,
  titleFilter,
  toggleCalendar,
  tooltipPosition,
  untilText,
  visibleEvents,
  whenParts,
} from "./calendar.js";
import {
  airQualityOf,
  airQualityUrl,
  chartScale,
  degrees,
  forecastUrl,
  heightOf,
  pointOf,
  readForecast,
  sky,
  weatherAt,
  weatherBetween,
  weatherOfDays,
} from "./forecast.js";

const sizes = ["small", "medium", "large", "tall", "xlarge", "full", "header"];
/** The first day of the mock events: the demo moves it to today. */
const exampleAnchor = "2026-01-01";
const windowDays = 7;
const requestTimeoutMs = 15_000;
const locationTimeoutMs = 8000;
const calendarRefreshMs = 5 * 60_000;
const weatherRefreshMs = 30 * 60_000;
const tickMs = 60_000;
/** How long the widget waits for Eva's answer to hello: outside Eva no answer comes. */
const helloWaitMs = 400;
const askWaitMs = 5000;
const svgSpace = "http://www.w3.org/2000/svg";
const noCalendar = "Your calendar did not load. The widget tries again in a few minutes.";

const root = document.querySelector(".widget");
const part = (role) => root.querySelector(`[data-role="${role}"]`);

const state = {
  size: "full",
  unit: "celsius",
  /** loading, ready, off (Eva answers null) or error. */
  calendar: "loading",
  calendars: new Map(),
  events: [],
  /** The events that show: none of a hidden calendar, and none with a title that hideTitles hides. */
  shown: [],
  /** The ids of the hidden calendars. */
  hidden: [],
  /** The widget's state of eva/state.json, or null outside Eva, where it stays in memory. */
  saved: null,
  /** The test of the hideTitles input, or null. */
  hideTitle: null,
  /** The asks that Eva approved, from her answer to hello: empty outside Eva. */
  asks: new Set(),
  /** none (no location), ready or failed. */
  weather: "none",
  forecast: null,
  airQuality: null,
  today: dayOf(new Date()),
};
let calendarTimer = 0;
let drawFrame = 0;
let saving = 0;
/** Counts the taps on the legend, so a read that started before a tap does not undo it. */
let stateChanges = 0;

// --- Loading -------------------------------------------------------------------------------------

/**
 * The answer at an address: `{ status, body }`, with the JSON body when the answer is ok. Status 0
 * when no answer came, such as when the network is down or the request took too long.
 */
async function request(address) {
  try {
    const response = await fetch(address, { cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
    return { status: response.status, body: response.ok ? await response.json() : undefined };
  } catch {
    return { status: 0, body: undefined };
  }
}

/**
 * A calendar path of Eva, or its mock file when the path does not exist, as on GitHub Pages. Inside
 * Eva the path always answers, so a mock event never shows there.
 */
async function readCalendarPath(name, query = "") {
  const eva = await request(`eva/google-calendar/${name}${query}`);
  if (eva.status === 200) return { example: false, body: eva.body };
  if (eva.status !== 404) return { failed: true };
  const example = await request(`example/google-calendar/${name}`);
  return example.status === 200 ? { example: true, body: example.body } : { failed: true };
}

async function loadCalendar() {
  const today = dayOf(new Date());
  const query = `?from=${today}&to=${addDays(today, windowDays - 1)}`;
  const [calendars, events] = await Promise.all([
    readCalendarPath("calendars.json"),
    readCalendarPath("events.json", query),
    loadState(),
  ]);
  // A new day starts here, also when the load fails, so the minute tick does not ask again each minute.
  state.today = today;
  clearTimeout(calendarTimer);
  calendarTimer = setTimeout(() => void loadCalendar().then(scheduleDraw), calendarRefreshMs);
  if (calendars.failed === true || events.failed === true) {
    // A failure keeps the events that the widget shows, and the next load tries again. Only a
    // widget with no events yet says so.
    if (state.calendar !== "ready") state.calendar = "error";
    return;
  }
  const list = readCalendars(calendars.body);
  const found = readEvents(events.example ? moveExample(events.body, exampleAnchor, today) : events.body);
  if (list === null || found === null) {
    state.calendar = "off";
    return;
  }
  state.calendars = new Map(list.map((calendar) => [calendar.id, calendar]));
  state.events = found;
  state.calendar = "ready";
}

/**
 * The widget's own state in Eva, which every device shares: the hidden calendars. Outside Eva the
 * path answers 404, and the state stays in memory. A save on its way wins over a read.
 */
async function loadState() {
  const changes = stateChanges;
  const answer = await request("eva/state.json");
  const body = answer.body;
  if (answer.status !== 200 || typeof body !== "object" || body === null || Array.isArray(body)) return;
  if (saving > 0 || changes !== stateChanges) return;
  state.saved = body;
  state.hidden = readHiddenCalendars(body);
}

/** Saves the hidden calendars in Eva, with the other keys of the state as they were. */
async function saveState() {
  if (state.saved === null) return;
  state.saved = { ...state.saved, hiddenCalendars: state.hidden };
  saving += 1;
  try {
    await fetch("eva/state.json", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.saved),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    // The choice stays in memory, and the next tap saves it again.
  } finally {
    saving -= 1;
  }
}

/** A tap on a calendar's name in the legend hides its events, or shows them again. */
function toggleHidden(calendarId) {
  state.hidden = toggleCalendar(state.hidden, calendarId);
  stateChanges += 1;
  draw();
  void saveState();
}

/** The number of the person's calendars that are hidden now. */
function hiddenCount() {
  return state.hidden.filter((id) => state.calendars.has(id)).length;
}

function hiddenText() {
  const count = hiddenCount();
  return count === 1 ? "1 calendar hidden" : `${String(count)} calendars hidden`;
}

// --- The asks to Eva (contract 3) ---------------------------------------------------------------

let askId = 0;
const pendingAsks = new Map();

/**
 * Sends an ask to Eva, the parent window, and resolves with her answer, or with null when no
 * answer comes within `wait` milliseconds, as outside Eva. The message leaves at once, so an ask
 * sent from a tap carries the tap.
 */
function ask(message, wait) {
  if (window.parent === window) return Promise.resolve(null);
  askId += 1;
  const id = askId;
  return new Promise((resolve) => {
    pendingAsks.set(id, resolve);
    window.parent.postMessage({ eva: "widget", id, ...message }, "*");
    setTimeout(() => {
      if (pendingAsks.delete(id)) resolve(null);
    }, wait);
  });
}

function watchAnswers() {
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (typeof data !== "object" || data === null || data.eva !== "widget" || typeof data.id !== "number") return;
    const resolve = pendingAsks.get(data.id);
    if (resolve === undefined) return;
    pendingAsks.delete(data.id);
    resolve(data);
  });
}

/** Asks Eva which asks the person approved. With no answer, the entries that need Eva hide. */
async function hello() {
  const answer = await ask({ ask: "hello" }, helloWaitMs);
  const approved = answer?.ok === true && Array.isArray(answer.asks) ? answer.asks : [];
  state.asks = new Set(approved.filter((type) => type === "chat" || type === "open"));
}

/**
 * The browser's location, or null when the visitor does not allow it. The widget also stops
 * waiting by itself, because the browser's timeout does not run while it asks the visitor.
 */
function browserLocation() {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), locationTimeoutMs);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { timeout: locationTimeoutMs, maximumAge: 600000 },
    );
  });
}

/** Eva's location first, then the browser's, then the mock one, as the contract says. */
async function findLocation() {
  const eva = await request("eva/location.json");
  if (eva.status === 200) return pointOf(eva.body);
  if (eva.status !== 404) return null;
  return (await browserLocation()) ?? pointOf((await request("example/location.json")).body);
}

/** The forecast never blocks the calendar: with no location or no answer, the calendar shows alone. */
async function loadWeather() {
  const point = await findLocation();
  if (point === null) {
    state.weather = "none";
    return;
  }
  const [forecast, air] = await Promise.all([request(forecastUrl(point, state.unit)), request(airQualityUrl(point))]);
  const read = readForecast(forecast.body);
  if (read === null) {
    // Keep the forecast that the widget shows, if any.
    if (state.forecast === null) state.weather = "failed";
    return;
  }
  state.forecast = read;
  state.airQuality = airQualityOf(air.body);
  state.weather = "ready";
}

// --- Drawing helpers -----------------------------------------------------------------------------

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className !== undefined && className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attributes = {}) {
  const node = document.createElementNS(svgSpace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

const cloudPath = "M7 19h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.7A3.2 3.2 0 0 0 7 19z";
const sunRays = [0, 45, 90, 135, 180, 225, 270, 315];

/** A weather icon: clear, partly, cloud, fog, rain, snow or storm, as the weather widget draws it. */
function icon(kind, isDay = true) {
  const picture = svg("svg", { viewBox: "0 0 24 24", class: `icon icon-${kind}`, "aria-hidden": "true" });
  const sun = (x, y, radius) => {
    const group = svg("g", { class: "icon-sun" });
    group.append(svg("circle", { cx: x, cy: y, r: radius }));
    for (const angle of sunRays) {
      const rad = (angle * Math.PI) / 180;
      const near = radius + 1.6;
      const far = radius + 3.4;
      group.append(
        svg("line", {
          x1: x + near * Math.cos(rad),
          y1: y + near * Math.sin(rad),
          x2: x + far * Math.cos(rad),
          y2: y + far * Math.sin(rad),
        }),
      );
    }
    return group;
  };
  const moon = (x, y) =>
    svg("path", {
      class: "icon-moon",
      d: `M${String(x + 3)} ${String(y - 5.5)}a6 6 0 1 0 3.2 9.6A5 5 0 0 1 ${String(x + 3)} ${String(y - 5.5)}z`,
    });
  const cloud = (shift = 0) =>
    svg("path", { class: "icon-cloud", d: cloudPath, transform: `translate(0 ${String(shift)})` });
  if (kind === "clear") picture.append(isDay ? sun(12, 12, 4.5) : moon(10, 12));
  else if (kind === "partly") picture.append(isDay ? sun(8.5, 8, 3) : moon(7, 8), cloud(1.5));
  else if (kind === "cloud") picture.append(cloud());
  else if (kind === "fog") {
    for (const y of [8, 12, 16]) picture.append(svg("line", { class: "icon-fog", x1: 4, y1: y, x2: 20, y2: y }));
  } else {
    picture.append(cloud(-3));
    for (const x of [8.5, 12.5, 16.5]) {
      if (kind === "snow") picture.append(svg("circle", { class: "icon-snow", cx: x - 0.5, cy: 19.5, r: 1.1 }));
      else if (kind === "rain")
        picture.append(svg("line", { class: "icon-rain", x1: x, y1: 18, x2: x - 1.5, y2: 21.5 }));
    }
    if (kind === "storm") picture.append(svg("path", { class: "icon-bolt", d: "M13 15l-3 4h3l-2 4 5-5.5h-3l2-2.5z" }));
  }
  return picture;
}

const unknownCalendar = { name: "Calendar", color: null, pattern: "solid" };

/** Gives a node the colour of a calendar and the pattern of its side bar. */
function paint(node, calendarId) {
  const calendar = state.calendars.get(calendarId) ?? unknownCalendar;
  node.classList.add(`pattern-${calendar.pattern}`);
  // The CSS object model is not an inline style: Eva's Content Security Policy allows it.
  if (calendar.color !== null) node.style.setProperty("--calendar-colour", calendar.color);
  return node;
}

function timeText(event) {
  return event.allDay ? "All day" : `${clockOf(event.start)}–${clockOf(event.end)}`;
}

/** The event of each drawn event node, for its details. */
const eventOf = new WeakMap();

/**
 * An event as a button that opens its menu. `place` names where it is drawn, such as a day, so a
 * redraw finds the same node again for its details and its menu. Each one takes the keyboard
 * focus, which shows its details.
 */
function eventNode(event, className, place) {
  const node = element("button", className);
  node.type = "button";
  node.setAttribute("aria-haspopup", "menu");
  node.setAttribute("aria-expanded", "false");
  node.dataset.key = `${event.id}|${place}`;
  eventOf.set(node, event);
  node.append(element("span", "event-bar"));
  return paint(node, event.calendarId);
}

/** A small folder: the mark of a project. */
function folderIcon() {
  const picture = svg("svg", { viewBox: "0 0 16 16", class: "folder-icon", "aria-hidden": "true" });
  picture.append(
    svg("path", { d: "M1.75 4a1 1 0 0 1 1-1h3.4l1.5 1.6h5.6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" }),
  );
  return picture;
}

/** The strokes of each line icon of the details and the menu, on a 16 x 16 box. */
const lineIcons = {
  clock: [
    ["circle", { cx: 8, cy: 8, r: 6 }],
    ["path", { d: "M8 4.8V8l2.2 1.4" }],
  ],
  place: [
    ["path", { d: "M8 14.5s4.5-4.3 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.4 4.5 7.7 4.5 7.7z" }],
    ["circle", { cx: 8, cy: 6.8, r: 1.6 }],
  ],
  notes: [["path", { d: "M3 4h10M3 8h10M3 12h6" }]],
  rain: [["path", { d: "M8 2.2s4 4.4 4 7.3a4 4 0 0 1-8 0c0-2.9 4-7.3 4-7.3z" }]],
  chat: [["path", { d: "M2.5 3h11v7.5h-6.2L4.5 13v-2.5h-2z" }]],
  project: [
    ["path", { d: "M1.75 4a1 1 0 0 1 1-1h3.4l1.5 1.6h5.6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" }],
  ],
  maps: [
    ["path", { d: "M8 1.6 14.4 8 8 14.4 1.6 8z" }],
    ["path", { d: "M6.1 9.6V7.5h3.6M8.4 5.9l1.6 1.6-1.6 1.6" }],
  ],
  call: [
    ["rect", { x: 1.8, y: 4.3, width: 8.4, height: 7.4, rx: 1.5 }],
    ["path", { d: "M10.2 7.1l4-2.3v6.4l-4-2.3" }],
  ],
  google: [
    ["rect", { x: 2.3, y: 3.2, width: 11.4, height: 10.5, rx: 1.5 }],
    ["path", { d: "M2.3 6.6h11.4M5.3 1.8v2.8M10.7 1.8v2.8" }],
  ],
};

/** A small line icon, in the colour of the text, for a line of the details or an entry of the menu. */
function lineIcon(kind) {
  const picture = svg("svg", { viewBox: "0 0 16 16", class: `line-icon line-icon-${kind}`, "aria-hidden": "true" });
  for (const [tag, attributes] of lineIcons[kind]) picture.append(svg(tag, attributes));
  return picture;
}

/** The mark of an event with a project, for the event's block. A screen reader reads "Project". */
function projectMark() {
  const mark = element("span", "project-mark");
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", "Project");
  mark.append(folderIcon());
  return mark;
}

/** The title of an event, with the mark of its project before it when there is one and it fits. */
function titleNode(tag, className, event, fits = true) {
  const title = element(tag, className);
  if (event.project !== null && fits) title.append(projectMark());
  title.append(event.title);
  return title;
}

function weatherDay(day) {
  return state.weather === "ready" ? (state.forecast.days.get(day) ?? null) : null;
}

function dayLabel(day) {
  const name = dayName(day, state.today);
  return `${name.weekday} ${String(name.date)}`;
}

// --- Small: the next event, and the temperature now -----------------------------------------------

function drawSmall(view) {
  const now = new Date();
  const next = nextEvent(state.shown, now);
  const box = element("div", "small");
  if (next === null) {
    const hidden = hiddenCount() > 0 ? ` ${hiddenText()}.` : "";
    box.append(element("p", "small-empty", `No events in the next ${String(windowDays)} days.${hidden}`));
  } else {
    const { event } = next;
    const card = eventNode(event, "small-next", "small");
    const when = next.now
      ? `Now · until ${clockOf(event.end)}`
      : `Next · ${untilText(event.start.getTime() - now.getTime())}`;
    const day = dayOf(event.start) === state.today ? "" : `${dayLabel(dayOf(event.start))}, `;
    card.append(
      element("span", "small-when", when),
      titleNode("b", "small-title", event),
      element("span", "small-time", `${day}${timeText(event)}${event.place === null ? "" : ` · ${event.place}`}`),
    );
    box.append(card);
  }
  const current = state.weather === "ready" ? state.forecast.now : null;
  if (current !== null) {
    const weather = element("p", "small-weather");
    const { text, icon: kind } = sky(current.code);
    weather.title = text;
    weather.append(icon(kind, current.isDay), element("span", "small-temperature", degrees(current.temperature)));
    box.append(weather);
  }
  view.replaceChildren(box);
}

// --- Medium and the list: events as rows ----------------------------------------------------------

/** The rows of one day: its all-day events, its events that did not end, and the line of now today. */
function agendaRows(day, now) {
  const rows = [];
  for (const event of allDayOn(state.shown, day)) {
    const row = element("li", "agenda-row");
    const box = eventNode(event, "agenda-event", `list-${day}`);
    box.append(titleNode("span", "agenda-title", event));
    row.append(element("span", "agenda-time", "All day"), box);
    rows.push(row);
  }
  const parts = partsOn(state.shown, day).filter((item) => item.event.end > now);
  let nowShown = day !== state.today;
  for (const { event, from } of parts) {
    if (!nowShown && event.start > now) {
      rows.push(nowRow(now));
      nowShown = true;
    }
    const row = element("li", "agenda-row");
    if (event.start <= now) row.classList.add("is-now");
    const box = eventNode(event, "agenda-event", `list-${day}`);
    box.append(titleNode("span", "agenda-title", event));
    if (event.place !== null) box.append(element("span", "agenda-place", event.place));
    row.append(element("span", "agenda-time", clock(from)), box);
    rows.push(row);
  }
  if (!nowShown && parts.length > 0) rows.push(nowRow(now));
  return rows;
}

function nowRow(now) {
  const row = element("li", "agenda-row now-row");
  row.setAttribute("aria-label", `Now, ${clockOf(now)}`);
  row.append(element("span", "agenda-time", clockOf(now)), element("span", "now-rule"));
  return row;
}

function weatherLine(day) {
  const forecast = weatherDay(day);
  if (forecast === null) return null;
  const line = element("span", "day-weather");
  const { text, icon: kind } = sky(forecast.code);
  line.title = text;
  const high = element("em", "", degrees(forecast.high));
  line.append(icon(kind), high, `/${degrees(forecast.low)}`);
  return line;
}

function drawMedium(view) {
  const now = new Date();
  const box = element("div", "medium");
  const current = state.weather === "ready" ? state.forecast.now : null;
  if (current !== null) {
    const { text, icon: kind } = sky(current.code);
    const line = element("p", "medium-weather");
    line.append(icon(kind, current.isDay), element("b", "", degrees(current.temperature)), text);
    box.append(line);
  }
  const today = element("section", "day-group");
  today.append(agendaList(agendaRows(state.today, now), "No more events today."));
  // Tomorrow fills the room that today leaves, such as in the evening.
  box.append(today, dayGroup(addDays(state.today, 1), now));
  view.replaceChildren(box);
  trimToFit(box);
}

function agendaList(rows, empty) {
  const list = element("ul", "agenda");
  if (rows.length === 0) list.append(element("li", "agenda-empty", empty));
  else list.append(...rows);
  return list;
}

/** A day of the list: its name and weather, then its rows. */
function dayGroup(day, now) {
  const group = element("section", "day-group");
  const head = element("h2", "day-group-head");
  const name = dayName(day, state.today);
  head.append(element("span", "day-group-name", name.relative ?? `${name.weekday} ${String(name.date)}`));
  const weather = weatherLine(day);
  if (weather !== null) head.append(weather);
  group.append(head, agendaList(agendaRows(day, now), "Nothing planned."));
  return group;
}

function drawList(view) {
  const now = new Date();
  const box = element("div", "day-list");
  box.append(...dayWindow(state.today, windowDays).map((day) => dayGroup(day, now)));
  view.replaceChildren(box);
  trimToFit(box);
}

/**
 * Keeps only the rows that fit the frame whole, in order, and the days that keep a row. A row cut in
 * half, or a day with only its name, says nothing.
 */
function trimToFit(box) {
  const bottom = box.getBoundingClientRect().bottom + 1;
  const rows = [...box.querySelectorAll(".agenda > li")];
  const first = rows.findIndex((row) => row.getBoundingClientRect().bottom > bottom);
  if (first < 0) return;
  for (const row of rows.slice(first)) row.remove();
  for (const group of [...box.querySelectorAll(".day-group")].slice(1)) {
    if (group.querySelector(".agenda > li") === null) group.remove();
  }
}

// --- The time grid --------------------------------------------------------------------------------

/** One day's chart: night, rain bars, the temperature line on the shared scale, and now. */
function dayChart(day, next, scale, now) {
  const chart = svg("svg", {
    class: "chart",
    viewBox: "0 0 24 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  if (day.sunrise !== null)
    chart.append(svg("rect", { class: "chart-night", x: 0, y: 0, width: day.sunrise, height: 100 }));
  if (day.sunset !== null)
    chart.append(svg("rect", { class: "chart-night", x: day.sunset, y: 0, width: 24 - day.sunset, height: 100 }));
  for (const line of scale.lines) {
    const y = heightOf(scale, line);
    chart.append(svg("line", { class: "chart-line", x1: 0, x2: 24, y1: y, y2: y }));
  }
  day.hours.forEach((hour, index) => {
    if (typeof hour.rain !== "number" || hour.rain <= 0) return;
    const height = hour.rain * 0.6;
    chart.append(svg("rect", { class: "chart-rain", x: index + 0.1, y: 100 - height, width: 0.8, height }));
  });
  const points = [];
  day.hours.forEach((hour, index) => {
    if (typeof hour.temperature === "number")
      points.push(`${String(index)},${String(heightOf(scale, hour.temperature))}`);
  });
  // The line runs on to the first hour of the next day, so it does not break between columns.
  const first = next?.hours[0]?.temperature;
  if (typeof first === "number" && points.length > 0) points.push(`24,${String(heightOf(scale, first))}`);
  if (points.length > 1) chart.append(svg("polyline", { class: "chart-temperature", points: points.join(" ") }));
  if (now !== null) chart.append(svg("line", { class: "chart-now", x1: now, x2: now, y1: 0, y2: 100 }));
  chart.append(svg("line", { class: "chart-marker", x1: 0, x2: 0, y1: 0, y2: 100 }));
  return chart;
}

/**
 * The legend: each calendar's name is a toggle button that hides its events or shows them again,
 * then the facts of today's weather and the credit to Open-Meteo.
 */
function legend(withWeather) {
  const foot = element("footer", "legend");
  const keys = element("span", "legend-calendars");
  keys.setAttribute("role", "group");
  keys.setAttribute("aria-label", "Show or hide a calendar");
  for (const calendar of state.calendars.values()) {
    const shown = !state.hidden.includes(calendar.id);
    const key = element("button", shown ? "legend-key" : "legend-key is-off");
    key.type = "button";
    key.dataset.calendar = calendar.id;
    key.setAttribute("aria-pressed", String(shown));
    const swatch = element("span", "legend-swatch event-bar");
    key.append(swatch, element("span", "legend-name", calendar.name));
    paint(key, calendar.id);
    key.addEventListener("click", () => toggleHidden(calendar.id));
    keys.append(key);
  }
  foot.append(keys);
  const facts = element("span", "legend-facts");
  if (state.weather === "ready") {
    const today = state.forecast.days.get(state.today);
    if (typeof today?.sunrise === "number") facts.append(fact("clear", "Sunrise", clock(today.sunrise)));
    if (typeof today?.sunset === "number") facts.append(fact("moon", "Sunset", clock(today.sunset)));
    if (typeof today?.uv === "number") facts.append(fact(null, "UV index", `UV ${String(Math.round(today.uv))}`));
    if (state.airQuality !== null)
      facts.append(fact(null, "European air quality index", `AQI ${String(state.airQuality)}`));
    const credit = element("a", "credit", "Open-Meteo");
    credit.href = "https://open-meteo.com/";
    credit.target = "_blank";
    credit.rel = "noopener";
    credit.title = "Weather data by Open-Meteo";
    facts.append(credit);
  } else if (withWeather) {
    facts.append(
      element(
        "span",
        "legend-note",
        state.weather === "failed" ? "The forecast did not load." : "Share your location with Eva to see the forecast.",
      ),
    );
  }
  foot.append(facts);
  return foot;
}

function fact(kind, name, text) {
  const node = element("span", "legend-fact");
  node.title = name;
  node.setAttribute("aria-label", `${name}: ${text}`);
  if (kind === "clear") node.append(icon("clear"));
  else if (kind === "moon") node.append(icon("clear", false));
  node.append(text);
  return node;
}

/**
 * The time grid: a column for each day, the events at their real time, the hourly forecast in each
 * day's head, and in the week view the legend. `viewKind` is "week" or "days".
 */
function drawGrid(view, viewKind) {
  const now = new Date();
  const nowHours = hoursOf(now);
  const width = root.clientWidth;
  const days = dayWindow(state.today, gridDays(viewKind, width));
  part("range").textContent = rangeLabel(days[0], days[days.length - 1]);
  const forecasts = days.map(weatherDay);
  const withWeather = forecasts.some((day) => day !== null);
  const scale = withWeather
    ? chartScale(
        forecasts.flatMap((day) => (day === null ? [] : day.hours.map((hour) => hour.temperature))),
        state.unit,
      )
    : null;
  const dayParts = days.map((day) => partsOn(state.shown, day));
  const range = hourRange(dayParts.flat(), viewKind === "week" ? { from: 7, to: 21 } : { from: 8, to: 20 });
  const hours = range.to - range.from;

  const grid = element("div", `grid grid-${viewKind}`);
  grid.style.setProperty("--days", String(days.length));
  if (scale !== null) grid.classList.add("has-weather");

  const head = element("div", "grid-head");
  const corner = element("div", "corner");
  const readout = element("div", "readout");
  if (scale !== null) {
    const labels = element("div", "scale");
    for (const line of scale.lines) {
      const label = element("span", "scale-label", degrees(line));
      label.style.setProperty("top", `${String(heightOf(scale, line))}%`);
      labels.append(label);
    }
    corner.append(labels, readout);
  }
  head.append(corner);
  const charts = days.map(() => null);
  const heads = days.map((day, index) => {
    const cell = element("div", "day-head");
    if (day === state.today) cell.classList.add("is-today");
    const name = element("span", "day-head-name", dayLabel(day));
    cell.append(name);
    const forecast = forecasts[index];
    if (forecast !== null && scale !== null) {
      charts[index] = dayChart(
        forecast,
        forecasts[index + 1] ?? weatherDay(addDays(day, 1)),
        scale,
        day === state.today ? nowHours : null,
      );
      cell.append(weatherLine(day), charts[index]);
    }
    head.append(cell);
    return cell;
  });
  grid.append(head);
  shownCharts = { days, charts };

  // The all-day row: one bar for each event over its days, in lanes. The cells of the days draw
  // the lines between the days behind the bars.
  const allDay = allDayLanes(state.shown, days);
  if (allDay.bars.length > 0) {
    const row = element("div", "grid-all-day");
    row.style.setProperty("--lanes", String(allDay.lanes));
    row.append(element("span", "all-day-label", "All day"));
    days.forEach((day, index) => {
      const cell = element("div", "all-day-cell");
      if (day === state.today) cell.classList.add("is-today");
      cell.style.setProperty("grid-column", String(index + 2));
      row.append(cell);
    });
    for (const bar of allDay.bars) {
      const node = eventNode(bar.event, "all-day-event", "all-day");
      node.style.setProperty("grid-column", `${String(bar.first + 2)} / ${String(bar.last + 3)}`);
      node.style.setProperty("grid-row", String(bar.lane + 1));
      if (bar.cutStart) node.classList.add("is-cut-start");
      if (bar.cutEnd) node.classList.add("is-cut-end");
      if (bar.event.endDate < state.today) node.classList.add("is-past");
      node.append(titleNode("b", "event-title", bar.event));
      row.append(node);
    }
    grid.append(row);
  }

  const scroll = element("div", "grid-scroll");
  const body = element("div", "grid-body");
  const axis = element("div", "axis");
  const columns = days.map((day) => {
    const column = element("div", "day-column");
    if (day === state.today) column.classList.add("is-today");
    return column;
  });
  const hoverLine = element("div", "hover-line");
  body.append(axis, ...columns, hoverLine);
  scroll.append(body);
  grid.append(scroll);
  if (viewKind === "week") grid.append(legend(true));
  view.replaceChildren(grid);

  // The hours fit the free height, so the grid needs no scroll bar where it can.
  // The padding at the top, and room for the half of the last hour label that hangs below the grid.
  const free = scroll.clientHeight - 16;
  const hourPx = hourHeight(free, hours, viewKind === "week" ? 16 : 14);
  grid.style.setProperty("--hour", `${String(hourPx)}px`);
  body.style.setProperty("height", `${String(hours * hourPx)}px`);
  const at = (value) => `${String((value - range.from) * hourPx)}px`;

  const every = hourPx < 22 ? 2 : 1;
  for (let hour = range.from; hour <= range.to; hour += 1) {
    if ((hour - range.from) % every !== 0) continue;
    const label = element("span", "axis-label", clock(hour));
    label.style.setProperty("top", at(hour));
    axis.append(label);
  }
  const nowInside = days[0] === state.today && nowHours >= range.from && nowHours <= range.to;
  if (nowInside) {
    const tag = element("span", "axis-label now-tag", clockOf(now));
    tag.style.setProperty("top", at(nowHours));
    axis.append(tag);
  }

  // The stack of overlapping events: a later event joins the group of the one that it overlaps
  // while that one's title still has no room above it, and sits on top of it, indented, after.
  const columnWidth = columns[0].clientWidth || 100;
  const stacking = {
    together: Math.min(1, Math.max(0.34, 18 / hourPx)),
    indent: Math.min(0.25, Math.max(0.12, 20 / columnWidth)),
    minWidth: 0.5,
  };
  dayParts.forEach((list, index) => {
    const column = columns[index];
    for (const item of layoutParts(list, stacking)) {
      const { event } = item;
      const from = Math.max(item.from, range.from);
      const to = Math.min(item.to, range.to);
      const height = (to - from) * hourPx - 2;
      const box = eventNode(event, "event", days[index]);
      if (event.end <= now) box.classList.add("is-past");
      if (item.depth > 0) box.classList.add("is-stacked");
      box.style.setProperty("z-index", String(1 + item.depth));
      if (height < 30) box.classList.add("is-short");
      if (height > 44) box.classList.add("is-tall");
      box.style.setProperty("top", at(from));
      box.style.setProperty("height", `${String(Math.max(12, height))}px`);
      box.style.setProperty("left", `calc(${String(item.left * 100)}% + 2px)`);
      box.style.setProperty("width", `calc(${String(item.width * 100)}% - 4px)`);
      // The mark of a project shows when the block has room for it beside some of the title.
      const fits = columnWidth * item.width - 4 >= 56;
      box.append(titleNode("b", "event-title", event, fits), element("small", "event-time", timeText(event)));
      if (event.place !== null && height > 58) box.append(element("small", "event-place", event.place));
      column.append(box);
    }
    if (index === 0 && nowInside) {
      const line = element("div", "now-line");
      line.style.setProperty("top", at(nowHours));
      column.append(line);
    }
  });
  if (nowInside && scroll.scrollHeight > scroll.clientHeight) {
    scroll.scrollTop = Math.max(0, (nowHours - range.from) * hourPx - scroll.clientHeight / 3);
  }

  if (scale !== null)
    watchHover({ grid, heads, charts, body, columns, hoverLine, readout, days, forecasts, range, hourPx });
}

/**
 * Hover, or a touch, shows the forecast of that moment: a marker on every day's chart, strong on
 * the day under the pointer, and the day, the hour, the temperature and the chance of rain in the
 * corner.
 */
function watchHover(grid) {
  const markers = grid.charts.map((chart) => chart?.querySelector(".chart-marker") ?? null);
  const clear = () => grid.grid.classList.remove("is-hovering");
  const show = (event) => {
    const index = grid.heads.findIndex((cell) => {
      const box = cell.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX < box.right;
    });
    const forecast = grid.forecasts[index];
    if (index < 0 || forecast === null || forecast === undefined) return clear();
    const cell = grid.heads[index].getBoundingClientRect();
    let hours;
    if (event.target.closest(".grid-head") !== null) {
      hours = ((event.clientX - cell.left) / cell.width) * 24;
      grid.hoverLine.classList.remove("is-on");
    } else if (event.target.closest(".grid-body") !== null) {
      // The columns start below the padding of the body: measure from a column.
      const top = grid.columns[0].getBoundingClientRect().top;
      const y = event.clientY - top;
      hours = grid.range.from + y / grid.hourPx;
      grid.hoverLine.style.setProperty("top", `${String(event.clientY - grid.body.getBoundingClientRect().top)}px`);
      grid.hoverLine.classList.add("is-on");
    } else return clear();
    hours = Math.max(0, Math.min(23.99, hours));
    const weather = weatherAt(forecast, hours);
    // The marker of the day under the pointer is the strong one.
    markers.forEach((marker, other) => {
      if (marker === null) return;
      marker.setAttribute("x1", String(hours));
      marker.setAttribute("x2", String(hours));
      marker.classList.toggle("is-current", other === index);
    });
    grid.readout.replaceChildren(
      element("span", "readout-day", dayLabel(grid.days[index])),
      element("span", "readout-hour", clock(hours)),
      element("span", "readout-temperature", degrees(weather.temperature)),
      element("span", "readout-rain", typeof weather.rain === "number" ? `${String(weather.rain)}%` : "–"),
    );
    grid.grid.classList.add("is-hovering");
  };
  grid.grid.addEventListener("pointermove", show);
  grid.grid.addEventListener("pointerdown", show);
  grid.grid.addEventListener("pointerleave", clear);
}

// --- The event's hours in the charts ------------------------------------------------------------

/** The charts of the days that the time grid shows, by day, or null with no grid. */
let shownCharts = null;

const roundHours = (value) => Math.round(value * 1000) / 1000;

/**
 * Draws a box in the event's colour over its hours in the chart of each of its shown days: for an
 * event over midnight, on each day's chart, and for an all-day event, a band over the whole chart.
 * With null, removes the boxes.
 */
function markCharts(event) {
  for (const old of root.querySelectorAll(".chart-event")) old.remove();
  if (event === null || shownCharts === null) return;
  const calendar = state.calendars.get(event.calendarId) ?? unknownCalendar;
  shownCharts.days.forEach((day, index) => {
    const chart = shownCharts.charts[index];
    if (chart === null) return;
    const spans = event.allDay
      ? event.date <= day && event.endDate >= day
        ? [{ from: 0, to: 24 }]
        : []
      : partsOn([event], day).map(({ from, to }) => ({ from, to: Math.min(24, to) }));
    for (const { from, to } of spans) {
      const rect = svg("rect", {
        class: "chart-event",
        x: roundHours(from),
        y: 0,
        width: roundHours(to - from),
        height: 100,
      });
      if (calendar.color !== null) rect.style.setProperty("--calendar-colour", calendar.color);
      // Under the temperature line, so the line stays in view.
      chart.insertBefore(rect, chart.querySelector(".chart-temperature, .chart-now, .chart-marker"));
    }
  });
}

/** The boxes follow the event of the open menu, else the event of the details. */
function refreshMarks() {
  const key = menu.key ?? tooltip.key;
  const node = key === null ? null : findKey(key);
  markCharts(node === null ? null : (eventOf.get(node) ?? null));
}

// --- The details of an event ---------------------------------------------------------------------

/**
 * One tooltip shows the details of an event, inverted as Eva's own tooltip: on hover with a mouse
 * and on keyboard focus. A click or a tap opens the event's menu instead (see below); on a touch
 * screen the menu holds the details. The tooltip takes no pointer, so the readout of the chart
 * goes on under it.
 */
const tooltip = { node: null, key: null, pointer: "mouse", dismissed: null, restoring: false };

function tooltipNode() {
  if (tooltip.node === null) {
    tooltip.node = element("div", "tooltip");
    tooltip.node.id = "event-tooltip";
    tooltip.node.setAttribute("role", "tooltip");
    tooltip.node.hidden = true;
    root.append(tooltip.node);
  }
  return tooltip.node;
}

const findKey = (key) => root.querySelector(`[data-key="${CSS.escape(key)}"]`);

/** A line of an event's details: an icon in its own column, then the text. */
function detailRow(className, mark, ...content) {
  const row = element("span", `detail-row ${className}`);
  const text = element("span", "detail-text");
  text.append(...content);
  row.append(mark, text);
  return row;
}

/**
 * The forecast during an event, as one line of its details: the sky, the low and the high, and the
 * chance of rain, or null with no forecast.
 */
function eventWeather(event) {
  if (state.weather !== "ready") return null;
  const during =
    event.start === undefined
      ? weatherOfDays(state.forecast, event.date, event.endDate)
      : weatherBetween(state.forecast, event.start, event.end);
  if (during === null) return null;
  const parts = [];
  let mark = icon("cloud");
  if (during.code !== null) {
    const { text, icon: kind } = sky(during.code);
    mark = icon(kind);
    parts.push(element("span", "weather-sky", text));
  }
  const low = degrees(during.low);
  const high = degrees(during.high);
  parts.push(element("b", "weather-degrees", low === high ? low : `${low}–${high}`));
  if (during.rain !== null) {
    const rain = element("span", "weather-rain");
    rain.setAttribute("aria-label", `Rain ${String(during.rain)}%`);
    rain.append(lineIcon("rain"), `${String(during.rain)}%`);
    parts.push(rain);
  }
  return detailRow("tooltip-weather", mark, ...parts);
}

/** The line of an event's project: a folder and the project's title. */
function projectLine(className, project) {
  return detailRow(className, lineIcon("project"), project.title);
}

/** The line of an event's calendar, under its title: the calendar's colour and pattern, and its name. */
function calendarLine(event) {
  const calendar = state.calendars.get(event.calendarId) ?? unknownCalendar;
  const name = element("span", "tooltip-calendar");
  name.append(paint(element("span", "legend-swatch event-bar"), event.calendarId), calendar.name);
  return name;
}

/**
 * The details of an event under its title, one line each with its icon: the time, apart from the
 * day and the length, the place, the forecast during it, the project and the start of its
 * description.
 */
function detailLines(event) {
  const when = whenParts(event);
  const lines = [
    calendarLine(event),
    detailRow(
      "tooltip-when",
      lineIcon("clock"),
      element("b", "when-time", when.time),
      element("span", "when-day", when.day),
    ),
  ];
  if (event.place !== null) lines.push(detailRow("tooltip-place", lineIcon("place"), event.place));
  const weather = eventWeather(event);
  if (weather !== null) lines.push(weather);
  if (event.project !== null) lines.push(projectLine("tooltip-project", event.project));
  if (event.description !== null)
    lines.push(
      detailRow("tooltip-description", lineIcon("notes"), element("span", "description-text", event.description)),
    );
  return lines;
}

/** The box of an event, cut to the part that shows in its scroll area. */
function anchorOf(target) {
  const box = target.getBoundingClientRect();
  const area = target.closest(".grid-scroll")?.getBoundingClientRect() ?? root.getBoundingClientRect();
  const top = Math.max(box.top, area.top);
  return { left: box.left, right: box.right, top, bottom: Math.max(top, Math.min(box.bottom, area.bottom)) };
}

function showTooltip(target) {
  const event = eventOf.get(target);
  if (event === undefined || menu.key !== null) return;
  const node = tooltipNode();
  node.replaceChildren(element("b", "tooltip-title", event.title), ...detailLines(event));
  node.hidden = false;
  for (const other of root.querySelectorAll("[aria-describedby='event-tooltip']"))
    other.removeAttribute("aria-describedby");
  target.setAttribute("aria-describedby", "event-tooltip");
  tooltip.key = target.dataset.key;
  const frame = root.getBoundingClientRect();
  const size = node.getBoundingClientRect();
  const place = tooltipPosition(anchorOf(target), { width: size.width, height: size.height }, frame);
  node.style.setProperty("left", `${String(place.left)}px`);
  node.style.setProperty("top", `${String(place.top)}px`);
  node.dataset.side = place.side;
  refreshMarks();
}

function hideTooltip() {
  if (tooltip.node !== null) tooltip.node.hidden = true;
  tooltip.key = null;
  for (const other of root.querySelectorAll("[aria-describedby='event-tooltip']"))
    other.removeAttribute("aria-describedby");
  refreshMarks();
}

const eventTarget = (event) => (event.target instanceof Element ? event.target.closest("[data-key]") : null);
const inMenu = (event) => event.target instanceof Element && event.target.closest(".menu") !== null;

/** Gives the focus back to an event, with its details closed, as after Escape. */
function focusQuietly(target) {
  tooltip.dismissed = target.dataset.key;
  tooltip.restoring = true;
  target.focus({ preventScroll: true });
  tooltip.restoring = false;
}

function watchEvents() {
  root.addEventListener("pointerover", (event) => {
    const target = eventTarget(event);
    if (event.pointerType === "mouse" && target !== null) showTooltip(target);
  });
  root.addEventListener("pointerout", (event) => {
    const target = eventTarget(event);
    if (event.pointerType !== "mouse" || target === null) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    if (document.activeElement === target) return;
    hideTooltip();
  });
  root.addEventListener("pointerdown", (event) => {
    tooltip.pointer = event.pointerType;
    const target = eventTarget(event);
    // A tap or a click anywhere else closes the menu; one on its own event toggles it on click.
    if (menu.key !== null && !inMenu(event) && target?.dataset.key !== menu.key) closeMenu(false);
    if (event.pointerType !== "mouse" && target === null && !inMenu(event)) hideTooltip();
  });
  root.addEventListener("click", (event) => {
    const target = eventTarget(event);
    if (target === null) return;
    if (menu.key === target.dataset.key) {
      closeMenu(false);
      return;
    }
    // A click from the keyboard has no pointer type; a touch or a pen shows the details in the menu.
    const kind = event.pointerType === "" || event.detail === 0 ? "keyboard" : (event.pointerType ?? tooltip.pointer);
    openMenu(target, kind === "touch" || kind === "pen");
  });
  root.addEventListener("focusin", (event) => {
    const target = eventTarget(event);
    if (target === null) return;
    // A redraw gives the focus back; details closed with Escape stay closed.
    if (tooltip.restoring && tooltip.dismissed === target.dataset.key) return;
    tooltip.dismissed = null;
    showTooltip(target);
  });
  root.addEventListener("focusout", (event) => {
    const target = eventTarget(event);
    if (target !== null && tooltip.pointer === "mouse" && !target.matches(":hover")) hideTooltip();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (menu.key !== null) {
      closeMenu(true);
      return;
    }
    tooltip.dismissed = tooltip.key;
    hideTooltip();
  });
}

// --- The menu of an event -----------------------------------------------------------------------

/**
 * A click or a tap on an event opens its menu: a chat about the event and the event's project,
 * which Eva opens when the person approved these asks, and the event in Google Calendar. On a
 * touch screen the menu also holds the event's details. Enter opens it from the keyboard, the
 * arrows move in it, and Escape closes it and gives the focus back to the event.
 */
const menu = { node: null, key: null, details: false, status: "" };

function menuNode() {
  if (menu.node === null) {
    menu.node = element("div", "menu");
    menu.node.id = "event-menu";
    menu.node.hidden = true;
    menu.node.addEventListener("keydown", menuKeys);
    root.append(menu.node);
  }
  return menu.node;
}

const menuItems = () => [...menuNode().querySelectorAll('[role="menuitem"]')];

function openMenu(target, details) {
  hideTooltip();
  closeMenu(false);
  menu.key = target.dataset.key;
  menu.details = details;
  menu.status = "";
  renderMenu();
}

/** Draws the menu of the event of `menu.key`, places it, and moves the focus to its first entry. */
function renderMenu() {
  const target = findKey(menu.key);
  const event = target === null ? undefined : eventOf.get(target);
  if (event === undefined) {
    closeMenu(false);
    return;
  }
  const node = menuNode();
  const entries = menuEntries(event, state.asks);
  const head = element("div", "menu-head");
  head.append(element("b", "menu-title", event.title));
  // With no entry, the menu still says what the event is.
  if (menu.details || entries.length === 0) head.append(...detailLines(event));
  else if (event.project !== null) head.append(projectLine("menu-project", event.project));
  const list = element("div", "menu-list");
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", event.title);
  for (const entry of entries) list.append(menuItem(entry, event));
  const status = element("p", "menu-status", menu.status);
  status.setAttribute("role", "status");
  node.replaceChildren(head, ...(entries.length > 0 ? [list] : []), status);
  node.hidden = false;
  target.setAttribute("aria-expanded", "true");
  target.setAttribute("aria-controls", "event-menu");
  placeMenu(target);
  refreshMarks();
  (menuItems()[0] ?? null)?.focus({ preventScroll: true });
}

function menuItem(entry, event) {
  if (entry.href !== undefined) {
    const link = element("a", "menu-item");
    link.append(lineIcon(entry.kind), element("span", "", entry.label));
    link.href = entry.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("role", "menuitem");
    link.tabIndex = -1;
    // Close after the browser follows the link.
    link.addEventListener("click", () => setTimeout(() => closeMenu(false), 0));
    return link;
  }
  const button = element("button", "menu-item");
  button.append(lineIcon(entry.kind), element("span", "", entry.label));
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.tabIndex = -1;
  button.addEventListener("click", () => void runAsk(entry.kind, event));
  return button;
}

const askFailures = {
  "not-allowed": "Eva does not allow this widget to do that.",
  "not-found": "Eva did not find it.",
  "too-long": "The text is too long for Eva.",
};

/**
 * Asks Eva for a chat about the event, or to open its project. The ask leaves at once, with the
 * tap. On success Eva takes over and the menu closes; a refusal shows in the menu, and an ask
 * that is not allowed leaves it.
 */
async function runAsk(kind, event) {
  const calendar = state.calendars.get(event.calendarId) ?? null;
  const message =
    kind === "chat"
      ? { ask: "chat", text: chatText(event, calendar?.name ?? null) }
      : { ask: "open", path: event.project.path };
  const key = menu.key;
  const answer = await ask(message, askWaitMs);
  if (menu.key !== key) return;
  if (answer?.ok === true) {
    closeMenu(false);
    return;
  }
  if (answer?.reason === "not-allowed") state.asks.delete(message.ask);
  menu.status =
    answer === null
      ? "Eva did not answer. Try again."
      : (askFailures[answer.reason] ?? `Eva could not ${kind === "chat" ? "open the chat" : "open it"}. Try again.`);
  renderMenu();
}

/** Places the menu at its event, inside the frame and off the top right corner. */
function placeMenu(target) {
  const node = menuNode();
  node.style.removeProperty("max-height");
  node.style.removeProperty("width");
  node.style.removeProperty("height");
  const frame = root.getBoundingClientRect();
  // A frame too short for a menu under its event, such as the header slot: the menu fills the
  // frame as one row, left of the corner.
  const inline = frame.height < 130;
  node.classList.toggle("is-inline", inline);
  if (inline) {
    node.style.setProperty("left", "4px");
    node.style.setProperty("top", "4px");
    node.style.setProperty("width", `${String(Math.max(120, frame.width - 64))}px`);
    node.style.setProperty("height", `${String(frame.height - 8)}px`);
    node.style.setProperty("max-height", `${String(frame.height - 8)}px`);
    node.dataset.side = "inside";
    return;
  }
  const size = node.getBoundingClientRect();
  const place = menuPosition(anchorOf(target), { width: size.width, height: size.height }, frame);
  node.style.setProperty("left", `${String(place.left)}px`);
  node.style.setProperty("top", `${String(place.top)}px`);
  node.style.setProperty("max-height", `${String(place.maxHeight)}px`);
  node.dataset.side = place.side;
}

function closeMenu(returnFocus) {
  if (menu.key === null) return;
  const target = findKey(menu.key);
  menu.key = null;
  menuNode().hidden = true;
  if (target !== null) {
    target.setAttribute("aria-expanded", "false");
    target.removeAttribute("aria-controls");
    if (returnFocus) focusQuietly(target);
  }
  refreshMarks();
}

function menuKeys(event) {
  const items = menuItems();
  const index = items.indexOf(document.activeElement);
  const move = (to) => {
    event.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  };
  if (event.key === "ArrowDown") move(index + 1);
  else if (event.key === "ArrowUp") move(index < 0 ? -1 : index - 1);
  else if (event.key === "Home") move(0);
  else if (event.key === "End") move(-1);
  else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
  } else if (event.key === "Tab") {
    // The focus goes back to the event, and Tab moves on from there.
    closeMenu(true);
  }
}

/** After a redraw, the details and the menu stay on the same event, on its new node, or close. */
function keepOpen(focused) {
  if (menu.key !== null) {
    const target = findKey(menu.key);
    if (target === null) closeMenu(false);
    else {
      target.setAttribute("aria-expanded", "true");
      target.setAttribute("aria-controls", "event-menu");
      placeMenu(target);
    }
  }
  const node =
    focused.key !== null
      ? findKey(focused.key)
      : focused.calendar !== null
        ? root.querySelector(`[data-calendar="${CSS.escape(focused.calendar)}"]`)
        : null;
  if (node !== null) {
    tooltip.restoring = true;
    node.focus({ preventScroll: true });
    tooltip.restoring = false;
    if (focused.key !== null) return;
  }
  const shown = tooltip.key === null ? null : findKey(tooltip.key);
  if (shown === null) hideTooltip();
  else showTooltip(shown);
  refreshMarks();
}

// --- Start ----------------------------------------------------------------------------------------

function draw() {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focused = { key: active?.dataset.key ?? null, calendar: active?.dataset.calendar ?? null };
  shownCharts = null;
  drawView();
  keepOpen(focused);
}

function drawView() {
  const view = part("view");
  root.dataset.state = state.calendar;
  part("message").textContent = state.calendar === "error" ? noCalendar : "";
  part("range").textContent = "";
  part("hidden").textContent = "";
  if (state.calendar !== "ready") {
    view.replaceChildren();
    return;
  }
  state.shown = visibleEvents(state.events, state.hidden, state.hideTitle);
  let legendShown = false;
  if (state.size === "small" || state.size === "header") drawSmall(view);
  else if (state.size === "medium") {
    part("range").textContent = `Today, ${dayLabel(state.today)}`;
    drawMedium(view);
  } else if (state.size === "large" || state.size === "tall") {
    // Large and tall show the next days as a time grid when it fits, else as a list.
    if (root.clientWidth >= 420 && root.clientHeight >= 300) drawGrid(view, "days");
    else {
      part("range").textContent = rangeLabel(state.today, addDays(state.today, windowDays - 1));
      drawList(view);
    }
  } else {
    drawGrid(view, "week");
    legendShown = true;
  }
  // With no legend, the head says that some calendars are hidden: full screen turns them on.
  if (!legendShown && hiddenCount() > 0) part("hidden").textContent = hiddenText();
}

/** Draws on the next frame, once, however many changes ask for it. */
function scheduleDraw() {
  cancelAnimationFrame(drawFrame);
  drawFrame = requestAnimationFrame(draw);
}

async function start() {
  const size = new URLSearchParams(window.location.search).get("size");
  // Opened alone in a browser, the widget shows its full-screen view.
  state.size = sizes.includes(size) ? size : "full";
  root.dataset.size = state.size;
  watchAnswers();
  const config = (await request("config.json")).body ?? {};
  if (config.unit === "fahrenheit") state.unit = "fahrenheit";
  state.hideTitle = titleFilter(config.hideTitles);
  await Promise.all([loadCalendar(), loadWeather(), hello()]);
  watchEvents();
  draw();
  new ResizeObserver(scheduleDraw).observe(root);
  // The now line moves, and at midnight a new day starts.
  setInterval(() => {
    if (dayOf(new Date()) !== state.today) void loadCalendar().then(scheduleDraw);
    else scheduleDraw();
  }, tickMs);
  setInterval(() => void loadWeather().then(scheduleDraw), weatherRefreshMs);
  // Tests wait for this flag: every part of the widget has its content now.
  root.dataset.ready = "true";
}

void start();
