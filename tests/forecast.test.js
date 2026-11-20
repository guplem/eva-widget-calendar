// The forecast logic of forecast.js, in Node, with no page and no network.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.TZ = "UTC";
import {
  airQualityOf,
  airQualityUrl,
  chartScale,
  degrees,
  forecastUrl,
  heightOf,
  hourOf,
  pointOf,
  readForecast,
  sky,
  weatherAt,
  weatherBetween,
  weatherOfDays,
} from "../forecast.js";
import { forecastFor } from "./helpers.js";

const point = { latitude: 48.85837, longitude: 2.294481 };

test("the location leaves the device with two decimals only", () => {
  const forecast = new URL(forecastUrl(point));
  assert.equal(forecast.origin, "https://api.open-meteo.com");
  assert.equal(forecast.searchParams.get("latitude"), "48.86");
  assert.equal(forecast.searchParams.get("longitude"), "2.29");
  assert.equal(forecast.searchParams.get("forecast_days"), "7");
  assert.equal(forecast.searchParams.get("hourly"), "temperature_2m,precipitation_probability,weather_code");
  assert.equal(forecast.searchParams.get("temperature_unit"), "celsius");
  assert.equal(new URL(forecastUrl(point, "fahrenheit")).searchParams.get("temperature_unit"), "fahrenheit");
  const air = new URL(airQualityUrl(point));
  assert.equal(air.origin, "https://air-quality-api.open-meteo.com");
  assert.equal(air.searchParams.get("latitude"), "48.86");
});

test("a location must hold numbers in range", () => {
  assert.equal(pointOf(point), point);
  assert.equal(pointOf(null), null);
  assert.equal(pointOf({ latitude: 95, longitude: 0 }), null);
  assert.equal(pointOf({ latitude: "1", longitude: 0 }), null);
});

test("each day gets its 24 hours, its sun times in hours and its UV", () => {
  const forecast = readForecast(forecastFor("2026-03-11"));
  assert.equal(forecast.days.size, 7);
  const today = forecast.days.get("2026-03-11");
  assert.equal(today.hours.length, 24);
  assert.equal(today.hours[17].rain, 35);
  // The sky of each hour too, for the details of an event.
  assert.equal(today.hours[17].code, 61);
  assert.equal(today.sunrise, 7.2);
  assert.equal(today.uv, 3.2);
  assert.deepEqual(forecast.now, { temperature: 14.2, code: 2, isDay: true });
  assert.equal(readForecast({}), null);
  assert.equal(hourOf("2026-03-11T18:51"), 18 + 51 / 60);
});

test("the readout runs the temperature in a line between two hours", () => {
  const day = {
    hours: Array.from({ length: 24 }, (_, hour) => ({ temperature: hour, rain: hour === 10 ? 40 : 0 })),
  };
  assert.deepEqual(weatherAt(day, 10.5), { temperature: 10.5, rain: 40 });
  assert.deepEqual(weatherAt(day, 23.9), { temperature: 23, rain: 0 });
});

test("one scale for every day, with the round temperatures as its reference lines", () => {
  assert.deepEqual(chartScale([7, 12, 19]), { low: 5, high: 21, lines: [10, 20] });
  assert.deepEqual(chartScale([45, 60], "fahrenheit"), { low: 41, high: 64, lines: [60] });
  // A flat week still gets a span, so a change of one degree does not fill the chart.
  assert.deepEqual(chartScale([15, 15]), { low: 9, high: 21, lines: [10, 20] });
  assert.equal(chartScale([null]), null);
});

test("a height in the chart: the top is the warmest, and a value outside the scale stays inside", () => {
  const scale = { low: 0, high: 20, lines: [10] };
  assert.equal(heightOf(scale, 10), 50);
  assert.equal(heightOf(scale, 20), 0);
  assert.equal(heightOf(scale, -5), 100);
});

test("the words of the sky, the air quality and the degrees", () => {
  assert.deepEqual(sky(61), { text: "Light rain", icon: "rain" });
  assert.deepEqual(sky(1234), { text: "Unknown", icon: "cloud" });
  assert.equal(airQualityOf({ current: { european_aqi: 27.6 } }), 28);
  assert.equal(airQualityOf({}), null);
  assert.equal(degrees(12.6), "13°");
  assert.equal(degrees(null), "–");
});

/** A made-up forecast of two days: the temperature is the hour, plus 30 on the second day. */
function twoDays() {
  const day = (date, plus) => ({
    date,
    code: plus === 0 ? 3 : 0,
    high: 23 + plus,
    low: plus,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      temperature: hour + plus,
      rain: hour === 15 ? 70 : hour === 2 ? 20 : 0,
      code: hour === 15 ? 63 : 2,
    })),
  });
  return {
    now: null,
    days: new Map([
      ["2026-03-11", day("2026-03-11", 0)],
      ["2026-03-12", day("2026-03-12", 30)],
    ]),
  };
}

test("the weather during an event: the lowest and highest temperature, the most rain and the worst sky", () => {
  const forecast = twoDays();
  const at = (text) => new Date(text);
  assert.deepEqual(weatherBetween(forecast, at("2026-03-11T13:30:00Z"), at("2026-03-11T16:15:00Z")), {
    low: 13.5,
    high: 16.25,
    rain: 70,
    code: 63,
  });
  assert.deepEqual(weatherBetween(forecast, at("2026-03-11T09:10:00Z"), at("2026-03-11T09:40:00Z")), {
    low: 9 + 10 / 60,
    high: 9 + 40 / 60,
    rain: 0,
    code: 2,
  });
  // Over midnight, the hours of both days count.
  assert.deepEqual(weatherBetween(forecast, at("2026-03-11T22:00:00Z"), at("2026-03-12T03:00:00Z")), {
    low: 22,
    high: 33,
    rain: 20,
    code: 2,
  });
  // Outside the forecast, nothing.
  assert.equal(weatherBetween(forecast, at("2026-03-20T09:00:00Z"), at("2026-03-20T10:00:00Z")), null);
  assert.equal(weatherBetween(null, at("2026-03-11T09:00:00Z"), at("2026-03-11T10:00:00Z")), null);
});

test("with no sky for each hour, the sky of the day stands in", () => {
  const forecast = twoDays();
  for (const hour of forecast.days.get("2026-03-11").hours) hour.code = null;
  const during = weatherBetween(forecast, new Date("2026-03-11T09:00:00Z"), new Date("2026-03-11T10:00:00Z"));
  assert.equal(during.code, 3);
});

test("the weather of all-day events: the low, the high and the most rain of their days", () => {
  const forecast = twoDays();
  assert.deepEqual(weatherOfDays(forecast, "2026-03-11", "2026-03-11"), { low: 0, high: 23, rain: 70, code: 3 });
  assert.deepEqual(weatherOfDays(forecast, "2026-03-11", "2026-03-14"), { low: 0, high: 53, rain: 70, code: 3 });
  assert.equal(weatherOfDays(forecast, "2026-03-20", "2026-03-21"), null);
});
