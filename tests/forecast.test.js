// The forecast logic of forecast.js, in Node, with no page and no network.
import assert from "node:assert/strict";
import { test } from "node:test";
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
} from "../forecast.js";
import { forecastFor } from "./helpers.js";

const point = { latitude: 48.85837, longitude: 2.294481 };

test("the location leaves the device with two decimals only", () => {
  const forecast = new URL(forecastUrl(point));
  assert.equal(forecast.origin, "https://api.open-meteo.com");
  assert.equal(forecast.searchParams.get("latitude"), "48.86");
  assert.equal(forecast.searchParams.get("longitude"), "2.29");
  assert.equal(forecast.searchParams.get("forecast_days"), "7");
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
