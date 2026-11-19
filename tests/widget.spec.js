// The views of the widget, with the mock events of example/google-calendar/ (moved to the test day),
// the made-up forecast of tests/helpers.js, and Eva's answers where a test fakes them.
import { expect, test } from "@playwright/test";
import { fakeEvaCalendar, fakeWeather, open, testToday } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await fakeWeather(page);
});

const event = (page, title) => page.locator(".event", { hasText: title }).first();

test.describe("the week view", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows 7 days from today, each with its weather, and the events at their real time", async ({ page }) => {
    await open(page, "xlarge");
    await expect(page.locator('[data-role="range"]')).toHaveText("Wed 11 – Tue 17 Mar");
    await expect(page.locator(".day-head-name")).toHaveText([
      "Wed 11",
      "Thu 12",
      "Fri 13",
      "Sat 14",
      "Sun 15",
      "Mon 16",
      "Tue 17",
    ]);
    await expect(page.locator(".day-head.is-today .day-head-name")).toHaveText("Wed 11");
    await expect(page.locator(".day-head .day-weather").first()).toHaveText("16°/7°");
    await expect(page.locator(".day-head .chart")).toHaveCount(7);
    await expect(page.locator(".scale-label")).toHaveText(["10°", "20°"]);
    const standup = await event(page, "Team standup").boundingBox();
    const deepWork = await event(page, "Deep work").boundingBox();
    // 09:00 to 15:00 is six hours; 15:00 to 17:00 is two.
    expect((deepWork.height + 2) / 2).toBeCloseTo((deepWork.y - standup.y) / 6, 0);
  });

  test("the hours fit the frame, with no scroll bar", async ({ page }) => {
    await open(page, "xlarge");
    const scroll = page.locator(".grid-scroll");
    expect(await scroll.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
    await expect(page.locator(".axis-label").first()).toHaveText("07:00");
  });

  test("dims the past events, and draws the line of now in today's column", async ({ page }) => {
    await open(page, "xlarge");
    await expect(event(page, "Team standup")).toHaveClass(/is-past/);
    await expect(event(page, "Deep work")).not.toHaveClass(/is-past/);
    await expect(page.locator(".day-column.is-today .now-line")).toHaveCount(1);
    await expect(page.locator(".now-tag")).toHaveText("14:20");
    await expect(page.locator(".chart-now")).toHaveCount(1);
  });

  test("puts overlapping events side by side", async ({ page }) => {
    await open(page, "xlarge");
    const review = await event(page, "Code review").boundingBox();
    const sync = await event(page, "Design sync").boundingBox();
    expect(sync.x).toBeGreaterThan(review.x + review.width - 1);
    expect(Math.abs(sync.width - review.width)).toBeLessThan(2);
  });

  test("shows all-day events in their own row, on each of their days", async ({ page }) => {
    await open(page, "xlarge");
    const cells = page.locator(".all-day-cell");
    await expect(cells.nth(3)).toContainText("Anniversary");
    await expect(cells.nth(3)).toContainText("Trip to the coast");
    await expect(cells.nth(4)).toContainText("Trip to the coast");
    await expect(cells.nth(0)).toBeEmpty();
  });

  test("gives each calendar its colour and its own pattern, also in the legend", async ({ page }) => {
    await open(page, "xlarge");
    const keys = page.locator(".legend-key");
    await expect(keys).toHaveText(["Work", "Personal", "Family", "Holidays"]);
    const classes = await keys.evaluateAll((nodes) => nodes.map((node) => node.className));
    expect(new Set(classes).size).toBe(4);
    const colour = await event(page, "Dentist").evaluate((node) =>
      getComputedStyle(node).getPropertyValue("--calendar-colour"),
    );
    expect(colour).toBe("#8e24aa");
    await expect(event(page, "Dentist")).toHaveClass(/pattern-stripes/);
  });

  test("the legend shows the sunrise, the sunset, the UV index, the air quality and the credit", async ({ page }) => {
    await open(page, "xlarge");
    await expect(page.locator(".legend-fact")).toHaveText(["07:12", "18:51", "UV 3", "AQI 28"]);
    await expect(page.getByRole("link", { name: "Open-Meteo" })).toHaveAttribute("href", "https://open-meteo.com/");
  });

  test("a tap on an event opens its link in a new tab", async ({ page }) => {
    await open(page, "xlarge");
    const link = page.getByRole("link", { name: /Deep work/ });
    await expect(link).toHaveAttribute("href", "https://calendar.google.com/calendar/");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
  });

  test("hover shows the forecast of that moment in the corner, and a marker on every chart", async ({ page }) => {
    await open(page, "xlarge");
    const column = await page.locator(".day-column").nth(1).boundingBox();
    const hourPx = parseFloat(await page.locator(".grid").evaluate((node) => node.style.getPropertyValue("--hour")));
    // Thursday at about 15:00: the made-up forecast has rain from 13:00 to 20:00 that day.
    const startY = (await event(page, "Sprint planning").boundingBox()).y;
    await page.mouse.move(column.x + column.width / 2, startY + hourPx + 1);
    await expect(page.locator(".grid")).toHaveClass(/is-hovering/);
    await expect(page.locator(".readout-day")).toHaveText("Thu 12");
    await expect(page.locator(".readout-hour")).toHaveText(/^15:0\d$/);
    await expect(page.locator(".readout-temperature")).toHaveText(/^\d+°$/);
    await expect(page.locator(".readout-rain")).toHaveText("60%");
    // A vertical line has no width, so Playwright calls it hidden: read its display instead.
    const shown = await page
      .locator(".chart-marker")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).display));
    expect(shown).toEqual(Array(7).fill("block"));
    await expect(page.locator(".hover-line")).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(page.locator(".grid")).not.toHaveClass(/is-hovering/);
  });
});

for (const [width, days] of [
  [1000, 7],
  [700, 5],
  [390, 3],
]) {
  test(`the week view shows ${String(days)} days on a frame ${String(width)} pixels wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 500 });
    await open(page, "xlarge");
    await expect(page.locator(".day-head")).toHaveCount(days);
  });
}

test("full screen shows the week view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await expect(page.locator(".widget")).toHaveAttribute("data-size", "full");
  await expect(page.locator(".day-head")).toHaveCount(7);
});

test("the small card shows the next event, the time until it and the temperature now", async ({ page }) => {
  await page.setViewportSize({ width: 200, height: 200 });
  await open(page, "small");
  await expect(page.locator(".small-when")).toHaveText("Next · in 40 min");
  await expect(page.locator(".small-title")).toHaveText("Deep work");
  await expect(page.locator(".small-time")).toHaveText("15:00–17:00");
  await expect(page.locator(".small-temperature")).toHaveText("14°");
});

test("the small card says when an event runs now", async ({ page }) => {
  await page.setViewportSize({ width: 200, height: 200 });
  await open(page, "small", { now: new Date(`${testToday}T15:30:00Z`) });
  await expect(page.locator(".small-when")).toHaveText("Now · until 17:00");
});

test("the medium card shows today's remaining events, after the line of now", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 300 });
  await open(page, "medium");
  await expect(page.locator('[data-role="range"]')).toHaveText("Today, Wed 11");
  const today = page.locator(".day-group").first();
  await expect(today.locator(".agenda-title")).toHaveText(["Deep work", "Gym"]);
  await expect(today.locator(".now-row .agenda-time")).toHaveText("14:20");
  await expect(page.locator(".medium-weather")).toContainText("14°");
});

test("the medium card says when no event is left today", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 300 });
  await open(page, "medium", { now: new Date(`${testToday}T21:00:00Z`) });
  await expect(page.locator(".agenda-empty").first()).toHaveText("No more events today.");
});

test("the large card shows the next days as a time grid, with no legend", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 400 });
  await open(page, "large");
  await expect(page.locator(".day-head")).toHaveCount(3);
  await expect(page.locator(".legend")).toHaveCount(0);
  await expect(page.locator(".chart")).toHaveCount(3);
});

test("the tall card shows the next days as a list, with the rows that fit whole", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 420 });
  await open(page, "tall");
  await expect(page.locator(".day-group-name").first()).toHaveText("Today");
  await expect(page.locator(".day-group-name").nth(1)).toHaveText("Tomorrow");
  const bottom = await page.locator(".day-list").evaluate((node) => node.getBoundingClientRect().bottom);
  const rows = await page
    .locator(".agenda > li")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().bottom));
  for (const row of rows) expect(row).toBeLessThanOrEqual(bottom + 1);
});

test.describe("inside Eva", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const calendars = [{ id: "work", name: "Work", color: "#3f51b5", primary: true }];
  const events = [
    {
      id: "e1",
      calendarId: "work",
      title: "Board meeting",
      startAt: `${testToday}T16:00:00+00:00`,
      endAt: `${testToday}T17:00:00+00:00`,
      place: "Room 4",
      link: "https://calendar.google.com/calendar/event?eid=e1",
    },
  ];

  test("asks Eva for the events of 7 days from today, and shows hers, never the mock ones", async ({ page }) => {
    const requests = await fakeEvaCalendar(page, { calendars, events });
    await open(page, "xlarge");
    const asked = requests.find((url) => url.pathname.endsWith("/events.json"));
    expect(asked.searchParams.get("from")).toBe(testToday);
    expect(asked.searchParams.get("to")).toBe("2026-03-17");
    await expect(page.locator(".event")).toHaveCount(1);
    await expect(event(page, "Board meeting")).toHaveAttribute(
      "href",
      "https://calendar.google.com/calendar/event?eid=e1",
    );
    await expect(page.locator(".legend-key")).toHaveText(["Work"]);
  });

  for (const size of ["small", "medium", "xlarge"]) {
    test(`with no Google login or Calendar off, the ${size} card says how to turn it on`, async ({ page }) => {
      await fakeEvaCalendar(page, { calendars: null, events: null });
      await open(page, size);
      const message = page.locator('[data-role="off"]');
      await expect(message).toBeVisible();
      await expect(message).toContainText("Settings > Connections > Google");
      await expect(message).toContainText("tick Calendar");
      await expect(page.locator(".event")).toHaveCount(0);
    });
  }

  test("when Eva cannot answer, says that the calendar did not load", async ({ page }) => {
    await fakeEvaCalendar(page, { status: 500 });
    await open(page, "xlarge");
    await expect(page.locator('[data-role="message"]')).toHaveText(
      "Your calendar did not load. The widget tries again in a few minutes.",
    );
  });
});

test("when the forecast does not load, the calendar stays and the legend says so", async ({ page }) => {
  await page.unrouteAll();
  await fakeWeather(page, { status: 503 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "xlarge");
  await expect(page.locator(".event").first()).toBeVisible();
  await expect(page.locator(".chart")).toHaveCount(0);
  await expect(page.locator(".legend-note")).toHaveText("The forecast did not load.");
});

test("the unit of config.json asks Open-Meteo for Fahrenheit", async ({ page }) => {
  await page.unrouteAll();
  const requests = await fakeWeather(page);
  await page.route("**/config.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unit: "fahrenheit" }) }),
  );
  await open(page, "xlarge");
  const forecast = requests.find((url) => url.hostname === "api.open-meteo.com");
  expect(forecast.searchParams.get("temperature_unit")).toBe("fahrenheit");
});

test("runs under Eva's Content Security Policy, with no inline script or style", async ({ page }) => {
  const violations = [];
  await page.exposeFunction("reportViolation", (text) => violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) =>
      window.reportViolation(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "content-security-policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; " +
            "connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com; img-src 'self' data: blob:",
        },
      });
    },
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "xlarge");
  await expect(page.locator(".event").first()).toBeVisible();
  const top = await event(page, "Deep work").evaluate((node) => node.style.top);
  expect(top).not.toBe("");
  expect(violations).toEqual([]);
});
