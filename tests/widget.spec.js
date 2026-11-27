// The views of the widget, with the mock events of example/google-calendar/ (moved to the test day),
// the made-up forecast of tests/helpers.js, and Eva's answers where a test fakes them.
import { expect, test } from "@playwright/test";
import { box, fakeEvaCalendar, fakeEvaTasks, fakeWeather, open, testToday } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await fakeWeather(page);
});

const event = (page, title) => page.locator(".event", { hasText: title }).first();
const zIndex = (locator) => locator.evaluate((node) => Number(getComputedStyle(node).zIndex));

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
    const standup = await box(event(page, "Team standup"));
    const deepWork = await box(event(page, "Deep work"));
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

  test("gives each calendar its colour and its own pattern, also in the legend", async ({ page }) => {
    await open(page, "xlarge");
    const keys = page.locator(".legend-key");
    await expect(keys).toHaveText(["Work", "Personal", "Family", "Holidays", "Tasks"]);
    const classes = await keys.evaluateAll((nodes) => nodes.map((node) => node.className));
    expect(new Set(classes).size).toBe(5);
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

  test("each event is a button that opens its menu", async ({ page }) => {
    await open(page, "xlarge");
    const target = page.getByRole("button", { name: /Deep work/ });
    await expect(target).toHaveAttribute("aria-haspopup", "menu");
    await expect(target).toHaveAttribute("aria-expanded", "false");
  });

  test("hover shows the forecast of that moment in the corner, and a marker on every chart", async ({ page }) => {
    await open(page, "xlarge");
    const column = await box(page.locator(".day-column").nth(1));
    const hourPx = parseFloat(await page.locator(".grid").evaluate((node) => node.style.getPropertyValue("--hour")));
    // Thursday at about 15:00: the made-up forecast has rain from 13:00 to 20:00 that day.
    const startY = (await box(event(page, "Sprint planning"))).y;
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
  // The task of the day first, as an all-day row.
  await expect(today.locator(".agenda-title")).toHaveText(["Pay the electricity bill", "Deep work", "Gym"]);
  await expect(today.locator(".now-row .agenda-time")).toHaveText("14:20");
  await expect(page.locator(".medium-weather")).toContainText("14°");
});

test("the medium card says when no event is left today", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 300 });
  // A task due today still counts: here the day has none.
  await page.route("**/example/google-tasks/tasks.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
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
  // One read of the list and its rows, so a redraw cannot fall between them.
  const { bottom, rows } = await page.locator(".day-list").evaluate((node) => ({
    bottom: node.getBoundingClientRect().bottom,
    rows: [...node.querySelectorAll(".agenda > li")].map((row) => row.getBoundingClientRect().bottom),
  }));
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
    // Eva with Tasks off: no task, and never the mock ones.
    await fakeEvaTasks(page);
    await open(page, "xlarge");
    const asked = requests.find((url) => url.pathname.endsWith("/events.json"));
    expect(asked.searchParams.get("from")).toBe(testToday);
    expect(asked.searchParams.get("to")).toBe("2026-03-17");
    await expect(page.locator(".event")).toHaveCount(1);
    await event(page, "Board meeting").click();
    await expect(page.getByRole("menuitem", { name: "See in Google Calendar" })).toHaveAttribute(
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

test.describe("whole-day events", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("an event from midnight to midnight shows in the all-day row, never as a block in the grid", async ({
    page,
  }) => {
    await open(page, "xlarge");
    const row = page.locator(".grid-all-day");
    await expect(row.locator(".all-day-event", { hasText: "Offsite day" })).toHaveCount(1);
    await expect(page.locator(".day-column .event", { hasText: "Offsite day" })).toHaveCount(0);
    // It stands over Friday, the third column.
    const bar = await box(row.locator(".all-day-event", { hasText: "Offsite day" }));
    const friday = await box(page.locator(".day-head").nth(2));
    expect(bar.x).toBeGreaterThanOrEqual(friday.x - 1);
    expect(bar.x + bar.width).toBeLessThanOrEqual(friday.x + friday.width + 1);
  });

  test("an event of several days is one bar over each of its days", async ({ page }) => {
    await open(page, "xlarge");
    const bar = await box(page.locator(".all-day-event", { hasText: "Trip to the coast" }));
    const saturday = await box(page.locator(".day-head").nth(3));
    const sunday = await box(page.locator(".day-head").nth(4));
    expect(Math.abs(bar.x - saturday.x)).toBeLessThan(6);
    expect(Math.abs(bar.x + bar.width - (sunday.x + sunday.width))).toBeLessThan(6);
  });

  test("an event with no title reads Busy", async ({ page }) => {
    await open(page, "xlarge");
    await expect(page.locator(".day-column").nth(1).locator(".event", { hasText: "Busy" })).toHaveCount(1);
    await expect(page.getByText("(No title)")).toHaveCount(0);
  });

  test("inside Eva, a timed event over whole days goes to the row, and one over midnight stays in the grid, cut at the day edge", async ({
    page,
  }) => {
    await fakeEvaTasks(page);
    await fakeEvaCalendar(page, {
      calendars: [{ id: "home", name: "Home", color: "#0b8043", primary: true }],
      events: [
        {
          id: "whole",
          calendarId: "home",
          title: "",
          startAt: `${testToday}T00:00:00+00:00`,
          endAt: "2026-03-12T00:00:00+00:00",
          place: null,
          link: null,
        },
        {
          id: "night",
          calendarId: "home",
          title: "Late show",
          startAt: `${testToday}T22:00:00+00:00`,
          endAt: "2026-03-12T02:00:00+00:00",
          place: null,
          link: null,
        },
      ],
    });
    await open(page, "xlarge");
    await expect(page.locator(".all-day-event")).toHaveText(["Busy"]);
    const parts = page.locator(".day-column .event", { hasText: "Late show" });
    await expect(parts).toHaveCount(2);
    const first = await box(parts.nth(0));
    const second = await box(parts.nth(1));
    const column = await box(page.locator(".day-column").nth(0));
    // The first part ends at the bottom of Wednesday; the second starts at the top of Thursday.
    expect(Math.abs(first.y + first.height - (column.y + column.height))).toBeLessThan(4);
    expect(Math.abs(second.y - column.y)).toBeLessThan(4);
    expect(second.x).toBeGreaterThan(first.x + first.width);
  });
});

for (const [width, days] of [
  [1280, 7],
  [700, 5],
  [390, 3],
]) {
  test.describe(`the stack of overlapping events at ${String(days)} days`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("events that start together share the width", async ({ page }) => {
      test.skip(days < 3, "Friday is not shown");
      await open(page, "xlarge");
      const one = await box(event(page, "One to one"));
      const interview = await box(event(page, "Interview"));
      expect(Math.abs(one.width - interview.width)).toBeLessThan(2);
      expect(Math.abs(one.x - interview.x)).toBeGreaterThan(one.width - 2);
    });

    test("a short event inside a long one sits on top of it, indented, and the long one keeps its width", async ({
      page,
    }) => {
      await open(page, "xlarge");
      const column = await box(page.locator(".day-column").nth(1));
      const planning = event(page, "Sprint planning");
      const sync = event(page, "Quick sync");
      const long = await box(planning);
      const short = await box(sync);
      expect(long.width).toBeGreaterThan(column.width - 8);
      expect(short.x).toBeGreaterThan(long.x + 8);
      expect(short.x + short.width).toBeLessThanOrEqual(column.x + column.width);
      expect(await zIndex(sync)).toBeGreaterThan(await zIndex(planning));
      // The event on top has an outline in the colour of the ground, so the stack reads.
      const ring = await sync.evaluate((node) => getComputedStyle(node).boxShadow);
      expect(ring).not.toBe("none");
    });
  });
}

for (const [width, days] of [
  [1280, 7],
  [700, 5],
  [390, 3],
]) {
  test(`a stack three deep at ${String(days)} days: each event sits on the one before, more indented, and stays readable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, "xlarge");
    const column = await box(page.locator(".day-column").nth(0));
    const stack = ["Design review", "Budget check", "Call with the plumber"].map((title) => event(page, title));
    const boxes = await Promise.all(stack.map(box));
    const layers = await Promise.all(stack.map(zIndex));
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + 4);
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x + 4);
    expect(layers[1]).toBeGreaterThan(layers[0]);
    expect(layers[2]).toBeGreaterThan(layers[1]);
    for (const item of boxes) expect(item.width).toBeGreaterThanOrEqual(column.width * 0.45);
  });
}

test("the line of now stands above every event, and past events stay dim", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "xlarge");
  const layers = await page
    .locator(".event")
    .evaluateAll((nodes) => nodes.map((node) => Number(getComputedStyle(node).zIndex)));
  expect(await zIndex(page.locator(".now-line"))).toBeGreaterThan(Math.max(...layers));
  await expect(event(page, "Team standup")).toHaveClass(/is-past/);
});

test.describe("the details of an event", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const tooltip = (page) => page.locator(".tooltip");

  test("hover shows the title, the time span, the calendar, the place and the forecast during it", async ({ page }) => {
    await open(page, "xlarge");
    await expect(page.locator(".event[title], .all-day-event[title]")).toHaveCount(0);
    await event(page, "Sprint planning").hover();
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page).locator(".tooltip-title")).toHaveText("Sprint planning");
    // Each line starts with its icon, and the time reads first, apart from the day and the length.
    await expect(tooltip(page).locator(".when-time")).toHaveText("14:00–15:30");
    await expect(tooltip(page).locator(".when-day")).toHaveText("Thu 12 Mar · 1 h 30 min");
    await expect(tooltip(page).locator(".tooltip-calendar")).toHaveText("Work");
    await expect(tooltip(page).locator(".tooltip-calendar .event-bar")).toHaveCount(1);
    await expect(tooltip(page).locator(".tooltip-place")).toHaveText("Room B");
    await expect(tooltip(page).locator(".weather-sky")).toHaveText("Light rain");
    await expect(tooltip(page).locator(".weather-degrees")).toHaveText(/^\d+°–\d+°$/);
    await expect(tooltip(page).locator(".weather-rain")).toHaveText("60%");
    for (const line of ["when", "place", "weather"])
      await expect(tooltip(page).locator(`.tooltip-${line} > .line-icon, .tooltip-${line} > .icon`)).toHaveCount(1);
    // The readout of the chart shows too.
    await expect(page.locator(".grid")).toHaveClass(/is-hovering/);
    await expect(page.locator(".readout-day")).toHaveText("Thu 12");
    await page.mouse.move(2, 400);
    await expect(tooltip(page)).toBeHidden();
  });

  test("an all-day event shows the low, the high and the chance of rain of its days", async ({ page }) => {
    await open(page, "xlarge");
    await page.locator(".all-day-event", { hasText: "Trip to the coast" }).hover();
    await expect(tooltip(page).locator(".when-time")).toHaveText("All day");
    await expect(tooltip(page).locator(".when-day")).toHaveText("Sat 14 – Sun 15 Mar · 2 days");
    await expect(tooltip(page).locator(".weather-sky")).toHaveText("Clear");
    await expect(tooltip(page).locator(".weather-degrees")).toHaveText("9°–18°");
    await expect(tooltip(page).locator(".weather-rain")).toHaveText("60%");
  });

  test("sits left of the event, over the day before, and right of it only on the first day", async ({ page }) => {
    await open(page, "xlarge");
    const later = event(page, "Code review");
    await later.hover();
    const left = await box(tooltip(page));
    const laterBox = await box(later);
    expect(left.x + left.width).toBeLessThanOrEqual(laterBox.x);
    const first = event(page, "Deep work");
    await first.hover();
    const right = await box(tooltip(page));
    const firstBox = await box(first);
    expect(right.x).toBeGreaterThanOrEqual(firstBox.x + firstBox.width);
  });

  test("focus on an event shows its details, and Escape hides them", async ({ page }) => {
    await open(page, "xlarge");
    await event(page, "Deep work").focus();
    await expect(tooltip(page).locator(".tooltip-title")).toHaveText("Deep work");
    await expect(event(page, "Deep work")).toHaveAttribute("aria-describedby", "event-tooltip");
    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toBeHidden();
  });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 700, height: 500 },
    { width: 390, height: 420 },
  ]) {
    test(`stays inside the frame at ${String(viewport.width)} x ${String(viewport.height)}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, "xlarge");
      const count = await page.locator(".event, .all-day-event").count();
      for (let index = 0; index < count; index += 1) {
        const target = page.locator(".event, .all-day-event").nth(index);
        if (!(await target.isVisible())) continue;
        await target.focus();
        const tip = await box(tooltip(page));
        expect(tip.x).toBeGreaterThanOrEqual(0);
        expect(tip.y).toBeGreaterThanOrEqual(0);
        expect(tip.x + tip.width).toBeLessThanOrEqual(viewport.width);
        expect(tip.y + tip.height).toBeLessThanOrEqual(viewport.height);
        // The top right corner stays free for Eva's full-screen button.
        expect(tip.y >= 56 || tip.x + tip.width <= viewport.width - 56).toBe(true);
      }
    });
  }
});
