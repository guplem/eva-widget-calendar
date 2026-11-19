// The forecast of Open-Meteo, as the widget shows it. This file reads no page and no network, so
// the unit tests of tests/forecast.test.js run it in Node.
//
// Open-Meteo gives each time in the time zone of the place, as `2026-03-10T13:00`, with no offset.
// The widget reads the day and the hour from that text.

export const forecastHost = "https://api.open-meteo.com";
export const airQualityHost = "https://air-quality-api.open-meteo.com";

/** The sky of each WMO weather code, which Open-Meteo gives as `weather_code`, with its icon. */
const skies = new Map([
  [0, ["Clear", "clear"]],
  [1, ["Mostly clear", "clear"]],
  [2, ["Partly cloudy", "partly"]],
  [3, ["Cloudy", "cloud"]],
  [45, ["Fog", "fog"]],
  [48, ["Icy fog", "fog"]],
  [51, ["Light drizzle", "rain"]],
  [53, ["Drizzle", "rain"]],
  [55, ["Heavy drizzle", "rain"]],
  [56, ["Freezing drizzle", "rain"]],
  [57, ["Freezing drizzle", "rain"]],
  [61, ["Light rain", "rain"]],
  [63, ["Rain", "rain"]],
  [65, ["Heavy rain", "rain"]],
  [66, ["Freezing rain", "rain"]],
  [67, ["Freezing rain", "rain"]],
  [71, ["Light snow", "snow"]],
  [73, ["Snow", "snow"]],
  [75, ["Heavy snow", "snow"]],
  [77, ["Snow grains", "snow"]],
  [80, ["Light showers", "rain"]],
  [81, ["Showers", "rain"]],
  [82, ["Heavy showers", "rain"]],
  [85, ["Snow showers", "snow"]],
  [86, ["Heavy snow showers", "snow"]],
  [95, ["Thunderstorm", "storm"]],
  [96, ["Thunderstorm with hail", "storm"]],
  [99, ["Thunderstorm with hail", "storm"]],
]);

/** The words and the icon of a weather code: `{ text, icon }`. An unknown code reads "Unknown". */
export function sky(code) {
  const [text, icon] = skies.get(code) ?? ["Unknown", "cloud"];
  return { text, icon };
}

/** A point of eva/location.json, or null when the value is not one. */
export function pointOf(value) {
  if (typeof value !== "object" || value === null) return null;
  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return value;
}

/** The location as it leaves the device: two decimals, about one kilometre. */
function place(point) {
  return { latitude: point.latitude.toFixed(2), longitude: point.longitude.toFixed(2) };
}

/** The address of the forecast of the next 7 days, today first. */
export function forecastUrl(point, unit = "celsius") {
  const query = new URLSearchParams({
    ...place(point),
    current: "temperature_2m,weather_code,is_day",
    hourly: "temperature_2m,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: unit === "fahrenheit" ? "fahrenheit" : "celsius",
  });
  return `${forecastHost}/v1/forecast?${query.toString()}`;
}

/** The address of the air quality now, as the European index. */
export function airQualityUrl(point) {
  const query = new URLSearchParams({ ...place(point), current: "european_aqi", timezone: "auto" });
  return `${airQualityHost}/v1/air-quality?${query.toString()}`;
}

/** The European air quality index of an answer, or null. */
export function airQualityOf(body) {
  const value = body?.current?.european_aqi;
  return typeof value === "number" ? Math.round(value) : null;
}

function list(block, key) {
  return Array.isArray(block?.[key]) ? block[key] : [];
}

/** The hour of a `YYYY-MM-DDTHH:MM` time, as a number: 7.5 for 07:30. Null for no time. */
export function hourOf(time) {
  if (typeof time !== "string" || time.length < 16) return null;
  return Number(time.slice(11, 13)) + Number(time.slice(14, 16)) / 60;
}

/**
 * The forecast of an Open-Meteo answer: `{ now, days }`, or null when it holds no forecast.
 * `now` is `{ temperature, code, isDay }` or null. `days` maps each day to
 * `{ date, code, high, low, sunrise, sunset, uv, hours }`: sunrise and sunset in hours, and
 * `hours` with 24 `{ temperature, rain }`, where a missing value is null.
 */
export function readForecast(body) {
  const daily = body?.daily;
  const dates = list(daily, "time");
  if (dates.length === 0) return null;
  const days = new Map();
  dates.forEach((date, index) => {
    days.set(date, {
      date,
      code: list(daily, "weather_code")[index],
      high: number(list(daily, "temperature_2m_max")[index]),
      low: number(list(daily, "temperature_2m_min")[index]),
      sunrise: hourOf(list(daily, "sunrise")[index]),
      sunset: hourOf(list(daily, "sunset")[index]),
      uv: number(list(daily, "uv_index_max")[index]),
      hours: Array.from({ length: 24 }, () => ({ temperature: null, rain: null })),
    });
  });
  const hourly = body?.hourly;
  const temperatures = list(hourly, "temperature_2m");
  const rain = list(hourly, "precipitation_probability");
  list(hourly, "time").forEach((time, index) => {
    const day = days.get(typeof time === "string" ? time.slice(0, 10) : "");
    const hour = hourOf(time);
    if (day === undefined || hour === null) return;
    day.hours[Math.floor(hour)] = { temperature: number(temperatures[index]), rain: number(rain[index]) };
  });
  const current = body?.current;
  const now =
    typeof current?.temperature_2m === "number"
      ? { temperature: current.temperature_2m, code: current.weather_code, isDay: current.is_day !== 0 }
      : null;
  return { now, days };
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The weather at a time of day, for the readout: `{ temperature, rain }`. Open-Meteo gives one
 * value at the start of each hour; the temperature runs in a line between them.
 */
export function weatherAt(day, hours) {
  const index = Math.max(0, Math.min(23, Math.floor(hours)));
  const here = day.hours[index];
  const next = day.hours[Math.min(23, index + 1)];
  const share = hours - index;
  const temperature =
    typeof here.temperature === "number" && typeof next.temperature === "number"
      ? here.temperature + (next.temperature - here.temperature) * share
      : here.temperature;
  return { temperature, rain: here.rain };
}

/**
 * One temperature scale for every shown day, so a height means the same temperature in each chart.
 * The reference lines are the round temperatures inside it: each 10° in Celsius, each 20° in
 * Fahrenheit. Returns `{ low, high, lines }`, or null with no temperature.
 */
export function chartScale(temperatures, unit = "celsius") {
  const values = temperatures.filter((value) => typeof value === "number");
  if (values.length === 0) return null;
  const fahrenheit = unit === "fahrenheit";
  const step = fahrenheit ? 20 : 10;
  const smallestSpan = fahrenheit ? 22 : 12;
  // A margin above and below, so a reference line near the warmest hour keeps room for its label.
  const margin = fahrenheit ? 4 : 2;
  let low = Math.min(...values) - margin;
  let high = Math.max(...values) + margin;
  // A flat week would fill the chart with a tiny change: give it a span to stand in.
  if (high - low < smallestSpan) {
    const middle = (high + low) / 2;
    low = middle - smallestSpan / 2;
    high = middle + smallestSpan / 2;
  }
  const lines = [];
  for (let line = Math.ceil(low / step) * step; line < high; line += step) {
    if (line > low) lines.push(line);
  }
  return { low, high, lines };
}

/** The height of a temperature in a chart of 100 units, the top at 0. */
export function heightOf(scale, temperature) {
  const share = (temperature - scale.low) / (scale.high - scale.low);
  return 100 - Math.max(0, Math.min(1, share)) * 100;
}

/** A temperature as the widget shows it, such as "12°". */
export function degrees(value) {
  return typeof value === "number" ? `${String(Math.round(value))}°` : "–";
}
