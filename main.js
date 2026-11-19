// The Calendar widget. It talks to its host only through fetch to relative paths, and to the hosts of
// its manifest, Open-Meteo. Inside Eva, eva/google-calendar/ answers with the person's calendar and
// eva/location.json with the last location. On GitHub Pages, these paths do not exist, so the mock
// files under example/ answer. See the contract: https://github.com/guplem/eva/blob/main/docs/widgets.md
//
// calendar.js and forecast.js hold the logic. This file loads the data and draws it.
import {
  addDays,
  allDayOn,
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
  moveExample,
  nextEvent,
  partsOn,
  rangeLabel,
  readCalendars,
  readEvents,
  untilText,
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
} from "./forecast.js";

const sizes = ["small", "medium", "large", "tall", "xlarge", "full"];
/** The first day of the mock events: the demo moves it to today. */
const exampleAnchor = "2026-01-01";
const windowDays = 7;
const requestTimeoutMs = 15_000;
const locationTimeoutMs = 8000;
const calendarRefreshMs = 5 * 60_000;
const weatherRefreshMs = 30 * 60_000;
const tickMs = 60_000;
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
  /** none (no location), ready or failed. */
  weather: "none",
  forecast: null,
  airQuality: null,
  today: dayOf(new Date()),
};
let calendarTimer = 0;
let drawFrame = 0;

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

/** An event as a link that opens Google Calendar in a new tab, or as a box with no link. */
function eventNode(event, className) {
  const node = element(event.link === null ? "div" : "a", className);
  if (event.link !== null) {
    node.href = event.link;
    node.target = "_blank";
    node.rel = "noopener";
  }
  node.title = [event.title, timeText(event), event.place].filter(Boolean).join(" · ");
  node.append(element("span", "event-bar"));
  return paint(node, event.calendarId);
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
  const next = nextEvent(state.events, now);
  const box = element("div", "small");
  if (next === null) {
    box.append(element("p", "small-empty", `No events in the next ${String(windowDays)} days.`));
  } else {
    const { event } = next;
    const card = eventNode(event, "small-next");
    const when = next.now
      ? `Now · until ${clockOf(event.end)}`
      : `Next · ${untilText(event.start.getTime() - now.getTime())}`;
    const day = dayOf(event.start) === state.today ? "" : `${dayLabel(dayOf(event.start))}, `;
    card.append(
      element("span", "small-when", when),
      element("b", "small-title", event.title),
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
  for (const event of allDayOn(state.events, day)) {
    const row = element("li", "agenda-row");
    const box = eventNode(event, "agenda-event");
    box.append(element("span", "agenda-title", event.title));
    row.append(element("span", "agenda-time", "All day"), box);
    rows.push(row);
  }
  const parts = partsOn(state.events, day).filter((item) => item.event.end > now);
  let nowShown = day !== state.today;
  for (const { event, from } of parts) {
    if (!nowShown && event.start > now) {
      rows.push(nowRow(now));
      nowShown = true;
    }
    const row = element("li", "agenda-row");
    if (event.start <= now) row.classList.add("is-now");
    const box = eventNode(event, "agenda-event");
    box.append(element("span", "agenda-title", event.title));
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

function legend(withWeather) {
  const foot = element("footer", "legend");
  for (const calendar of state.calendars.values()) {
    const key = element("span", "legend-key");
    const swatch = element("span", "legend-swatch event-bar");
    key.append(swatch, calendar.name);
    paint(key, calendar.id);
    foot.append(key);
  }
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
  const parts = days.map((day) => layoutParts(partsOn(state.events, day)));
  const range = hourRange(parts.flat(), viewKind === "week" ? { from: 7, to: 21 } : { from: 8, to: 20 });
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
  const heads = days.map((day, index) => {
    const cell = element("div", "day-head");
    if (day === state.today) cell.classList.add("is-today");
    const name = element("span", "day-head-name", dayLabel(day));
    cell.append(name);
    const forecast = forecasts[index];
    if (forecast !== null && scale !== null) {
      cell.append(
        weatherLine(day),
        dayChart(
          forecast,
          forecasts[index + 1] ?? weatherDay(addDays(day, 1)),
          scale,
          day === state.today ? nowHours : null,
        ),
      );
    }
    head.append(cell);
    return cell;
  });
  grid.append(head);

  const allDay = days.map((day) => allDayOn(state.events, day));
  if (allDay.some((list) => list.length > 0)) {
    const row = element("div", "grid-all-day");
    row.append(element("span", "all-day-label", "All day"));
    for (const list of allDay) {
      const cell = element("div", "all-day-cell");
      for (const event of list) {
        const box = eventNode(event, "event all-day-event");
        box.append(element("b", "event-title", event.title));
        cell.append(box);
      }
      row.append(cell);
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
  const free = scroll.clientHeight - 10;
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

  parts.forEach((list, index) => {
    const column = columns[index];
    for (const item of list) {
      const { event } = item;
      const from = Math.max(item.from, range.from);
      const to = Math.min(item.to, range.to);
      const height = (to - from) * hourPx - 2;
      const box = eventNode(event, "event");
      if (event.end <= now) box.classList.add("is-past");
      if (height < 30) box.classList.add("is-short");
      if (height > 44) box.classList.add("is-tall");
      box.style.setProperty("top", at(from));
      box.style.setProperty("height", `${String(Math.max(12, height))}px`);
      box.style.setProperty("left", `calc(${String((item.column * 100) / item.columns)}% + 2px)`);
      box.style.setProperty("width", `calc(${String(100 / item.columns)}% - 4px)`);
      box.append(element("b", "event-title", event.title), element("small", "event-time", timeText(event)));
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

  if (scale !== null) watchHover({ grid, heads, body, columns, hoverLine, readout, days, forecasts, range, hourPx });
}

/**
 * Hover, or a touch, shows the forecast of that moment: a marker on every day's chart, and the
 * day, the hour, the temperature and the chance of rain in the corner.
 */
function watchHover(grid) {
  const markers = [...grid.grid.querySelectorAll(".chart-marker")];
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
    for (const marker of markers) {
      marker.setAttribute("x1", String(hours));
      marker.setAttribute("x2", String(hours));
    }
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

// --- Start ----------------------------------------------------------------------------------------

function draw() {
  const view = part("view");
  root.dataset.state = state.calendar;
  part("message").textContent = state.calendar === "error" ? noCalendar : "";
  part("range").textContent = "";
  if (state.calendar !== "ready") {
    view.replaceChildren();
    return;
  }
  if (state.size === "small") drawSmall(view);
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
  } else drawGrid(view, "week");
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
  const config = (await request("config.json")).body ?? {};
  if (config.unit === "fahrenheit") state.unit = "fahrenheit";
  await Promise.all([loadCalendar(), loadWeather()]);
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
