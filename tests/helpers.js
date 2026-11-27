// Helpers for the widget tests. The tests never call the real Open-Meteo: a helper answers it with a
// made-up forecast for the days after a given day. The tests also fix the clock, and the
// Playwright config fixes the time zone, so the mock events and the forecast fall on known hours.

import { expect } from "@playwright/test";

/** The time of the tests: Wednesday 2026-03-11 at 14:20, in the UTC time zone of the browser. */
export const testNow = new Date("2026-03-11T14:20:00Z");
export const testToday = "2026-03-11";

/** The day `count` days after `day`. */
function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

const codes = [2, 61, 3, 0, 0, 2, 63];

/**
 * A made-up Open-Meteo answer for 7 days from `first`: a mild day curve, rain in the afternoon of
 * some days, with light rain as the sky of those hours, and the sun up from 07:12 to 18:51.
 */
export function forecastFor(first = testToday) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const time = [];
  const temperature = [];
  const rain = [];
  const sky = [];
  days.forEach((day, index) => {
    for (let hour = 0; hour < 24; hour += 1) {
      time.push(`${day}T${String(hour).padStart(2, "0")}:00`);
      const curve = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 16));
      temperature.push(Math.round((7 + index * 0.5 + 9 * curve) * 10) / 10);
      const chance = index % 3 === 1 && hour >= 13 && hour < 20 ? 60 : index === 0 && hour >= 17 ? 35 : 0;
      rain.push(chance);
      // A rainy hour has light rain; the others have the sky of their day.
      sky.push(chance > 0 ? 61 : codes[index]);
    }
  });
  return {
    latitude: 48.86,
    longitude: 2.29,
    timezone: "UTC",
    current: { time: `${first}T14:15`, temperature_2m: 14.2, weather_code: 2, is_day: 1 },
    hourly: { time, temperature_2m: temperature, precipitation_probability: rain, weather_code: sky },
    daily: {
      time: days,
      weather_code: codes,
      temperature_2m_max: days.map((_, index) => 16 + index * 0.5),
      temperature_2m_min: days.map((_, index) => 7 + index * 0.5),
      sunrise: days.map((day) => `${day}T07:12`),
      sunset: days.map((day) => `${day}T18:51`),
      uv_index_max: days.map(() => 3.2),
    },
  };
}

/**
 * Answers Open-Meteo with the made-up forecast and an air quality of 28, or with `status`. Returns
 * the list of the addresses that the widget asked for, as URL objects.
 */
export async function fakeWeather(page, { status = 200, first = testToday } = {}) {
  const requests = [];
  const answer = (body) => ({
    status: 200,
    contentType: "application/json",
    // Eva's Content Security Policy allows the hosts; a browser also needs the CORS header.
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
  await page.route("https://api.open-meteo.com/**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill(status === 200 ? answer(forecastFor(first)) : { status });
  });
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill(status === 200 ? answer({ current: { european_aqi: 28 } }) : { status });
  });
  return requests;
}

/** Answers eva/location.json as Eva does, with this point, or with null for "no location yet". */
export async function fakeEvaLocation(page, point) {
  await page.route("**/eva/location.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(point) }),
  );
}

/**
 * Answers eva/google-calendar/ as Eva does: `calendars` and `events` as the bodies of
 * calendars.json and events.json (null for "no Google login or Calendar off"), or `status` for a
 * failure. Returns the list of the addresses that the widget asked for.
 */
export async function fakeEvaCalendar(page, { calendars = null, events = null, status = 200 } = {}) {
  const requests = [];
  await page.route("**/eva/google-calendar/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (status !== 200) return route.fulfill({ status });
    const body = url.pathname.endsWith("/calendars.json") ? calendars : events;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return requests;
}

/**
 * Answers eva/google-tasks/ as Eva does: `lists` and `tasks` as the bodies of lists.json and
 * tasks.json (null for "no Google login or Tasks off"), or `status` for a failure. Returns the list
 * of the addresses that the widget asked for.
 */
export async function fakeEvaTasks(page, { lists = null, tasks = null, status = 200 } = {}) {
  const requests = [];
  await page.route("**/eva/google-tasks/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (status !== 200) return route.fulfill({ status });
    const body = url.pathname.endsWith("/lists.json") ? lists : tasks;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return requests;
}

/** Opens the widget at a size, at the time of the tests, and waits until it has drawn. */
export async function open(page, size, { now = testNow } = {}) {
  await page.clock.setFixedTime(now);
  await page.goto(size === undefined ? "/" : `/?size=${size}`);
  await page.locator('.widget[data-ready="true"]').waitFor();
}

/**
 * Answers `eva/state.json` as Eva does: GET gives the saved state (`{}` when nothing is saved), and
 * PUT replaces it. Returns the list of the bodies that the widget wrote.
 */
export async function fakeEvaState(page, initial = {}) {
  const writes = [];
  let saved = initial;
  await page.route("**/eva/state.json", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      saved = JSON.parse(request.postData() ?? "null");
      writes.push(saved);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved) });
  });
  return writes;
}

/**
 * Opens the widget in an iframe of a fake parent page that answers the asks of contract 3 as Eva
 * does: `hello` with the approved `asks`, and each other ask with ok, or with `{ ok: false, reason }`
 * for an ask named in `refuse`. With `answer: false`, the parent never answers, as outside Eva.
 * Returns the frame of the widget; `asked(page)` lists the messages that the parent got.
 */
export async function openInEva(
  page,
  size,
  { asks = ["chat", "open"], answer = true, refuse = {}, now = testNow } = {},
) {
  const config = JSON.stringify({ asks, answer, refuse });
  await page.route("**/eva-parent.html", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><style>html,body{margin:0;height:100%}iframe{display:block;width:100vw;height:100vh;border:0}</style></head>
<body><iframe src="/?size=${size}" title="Calendar"></iframe><script>
const config = ${config};
window.asked = [];
addEventListener("message", (event) => {
  const data = event.data;
  if (data === null || typeof data !== "object" || data.eva !== "widget" || typeof data.ask !== "string") return;
  window.asked.push(data);
  if (!config.answer) return;
  let reply = { eva: "widget", id: data.id, ok: true };
  if (data.ask === "hello") reply.asks = config.asks;
  else if (config.refuse[data.ask] !== undefined) reply = { eva: "widget", id: data.id, ok: false, reason: config.refuse[data.ask] };
  event.source.postMessage(reply, "*");
});
</script></body></html>`,
    }),
  );
  await page.clock.setFixedTime(now);
  await page.goto("/eva-parent.html");
  const frame = page.frameLocator("iframe");
  await frame.locator('.widget[data-ready="true"]').waitFor();
  return frame;
}

/** The messages that the fake parent page of `openInEva` got from the widget. */
export async function asked(page) {
  return page.evaluate(() => window.asked);
}

/**
 * The box of a node, once it has one. A redraw, such as when the forecast arrives, swaps the nodes
 * for a moment, and `boundingBox` then answers null.
 */
export async function box(locator) {
  let found = null;
  await expect
    .poll(async () => {
      found = await locator.boundingBox();
      return found;
    })
    .not.toBeNull();
  return found;
}
