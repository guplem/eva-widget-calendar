// The location of the forecast comes from Eva first, then from the browser, then from the mock file,
// as the widget contract says.
import { expect, test } from "@playwright/test";
import { fakeEvaLocation, fakeWeather, open } from "./helpers.js";

const forecastLatitudes = (requests) =>
  requests.filter((url) => url.hostname === "api.open-meteo.com").map((url) => url.searchParams.get("latitude"));

test.describe("outside Eva, when the visitor allows the location", () => {
  test.use({ geolocation: { latitude: 51.5007, longitude: -0.1246 }, permissions: ["geolocation"] });

  test("asks the forecast of the visitor's real location", async ({ page }) => {
    const requests = await fakeWeather(page);
    await open(page, "xlarge");
    expect(forecastLatitudes(requests)).toEqual(["51.50"]);
  });
});

test("outside Eva, when the visitor does not allow the location, asks the forecast of the mock location", async ({
  page,
}) => {
  const requests = await fakeWeather(page);
  await open(page, "xlarge");
  expect(forecastLatitudes(requests)).toEqual(["48.86"]);
});

test.describe("inside Eva", () => {
  test.use({ geolocation: { latitude: 51.5007, longitude: -0.1246 }, permissions: ["geolocation"] });

  test("asks the forecast of Eva's location, never the browser's or the mock one", async ({ page }) => {
    const requests = await fakeWeather(page);
    await fakeEvaLocation(page, { latitude: 40.4168, longitude: -3.7038, accuracy: 20, at: "2026-03-11T09:30:00Z" });
    await open(page, "xlarge");
    expect(forecastLatitudes(requests)).toEqual(["40.42"]);
  });

  test("with no location yet, hides the weather, keeps the calendar and asks Open-Meteo nothing", async ({ page }) => {
    const requests = await fakeWeather(page);
    await fakeEvaLocation(page, null);
    await open(page, "xlarge");
    await expect(page.locator(".event").first()).toBeVisible();
    await expect(page.locator(".chart")).toHaveCount(0);
    await expect(page.locator(".day-weather")).toHaveCount(0);
    await expect(page.locator(".legend-note")).toHaveText("Share your location with Eva to see the forecast.");
    expect(requests).toEqual([]);
  });
});
