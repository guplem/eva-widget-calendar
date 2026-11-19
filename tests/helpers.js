// Helpers for the widget tests. The tests never call the real Open-Meteo: a helper answers it with a
// made-up forecast for the days after a given day. The tests also fix the clock, and the
// Playwright config fixes the time zone, so the mock events and the forecast fall on known hours.

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
 * some days, and the sun up from 07:12 to 18:51.
 */
export function forecastFor(first = testToday) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const time = [];
  const temperature = [];
  const rain = [];
  days.forEach((day, index) => {
    for (let hour = 0; hour < 24; hour += 1) {
      time.push(`${day}T${String(hour).padStart(2, "0")}:00`);
      const curve = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 16));
      temperature.push(Math.round((7 + index * 0.5 + 9 * curve) * 10) / 10);
      rain.push(index % 3 === 1 && hour >= 13 && hour < 20 ? 60 : index === 0 && hour >= 17 ? 35 : 0);
    }
  });
  return {
    latitude: 48.86,
    longitude: 2.29,
    timezone: "UTC",
    current: { time: `${first}T14:15`, temperature_2m: 14.2, weather_code: 2, is_day: 1 },
    hourly: { time, temperature_2m: temperature, precipitation_probability: rain },
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

/** Opens the widget at a size, at the time of the tests, and waits until it has drawn. */
export async function open(page, size, { now = testNow } = {}) {
  await page.clock.setFixedTime(now);
  await page.goto(size === undefined ? "/" : `/?size=${size}`);
  await page.locator('.widget[data-ready="true"]').waitFor();
}
