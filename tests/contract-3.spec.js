// Contract 3: calendars on and off, the event's hours in the chart, the hover marker, the hideTitles
// input, projects, and the menu of an event with the asks to Eva. The asks go to a fake parent page
// that answers as Eva does (openInEva of tests/helpers.js).
import { expect, test } from "@playwright/test";
import { asked, box, fakeEvaCalendar, fakeEvaState, fakeWeather, open, openInEva, testToday } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await fakeWeather(page);
});

const event = (scope, title) => scope.locator(".event", { hasText: title }).first();
const key = (scope, name) => scope.getByRole("button", { name, exact: true });

test.describe("calendars on and off", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a tap on a calendar's name in the legend hides its events, and a second tap shows them", async ({ page }) => {
    await open(page, "xlarge");
    const personal = key(page, "Personal");
    await expect(personal).toHaveAttribute("aria-pressed", "true");
    await expect(event(page, "Dentist")).toBeVisible();
    await personal.click();
    await expect(personal).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".event", { hasText: "Dentist" })).toHaveCount(0);
    await expect(page.locator(".event", { hasText: "Lunch with Sam" })).toHaveCount(0);
    // The hidden calendar keeps its swatch, and looks off by more than colour: its name is struck.
    await expect(personal.locator(".legend-swatch")).toBeVisible();
    const line = await personal.evaluate((node) => getComputedStyle(node).textDecorationLine);
    expect(line).toContain("line-through");
    await personal.click();
    await expect(event(page, "Dentist")).toBeVisible();
  });

  test("an all-day event of a hidden calendar leaves the all-day row", async ({ page }) => {
    await open(page, "xlarge");
    await expect(page.locator(".all-day-event", { hasText: "Trip to the coast" })).toHaveCount(1);
    await key(page, "Personal").click();
    await expect(page.locator(".all-day-event", { hasText: "Trip to the coast" })).toHaveCount(0);
  });

  test("inside Eva, the hidden calendars come from eva/state.json, and a tap saves them there", async ({ page }) => {
    const writes = await fakeEvaState(page, { hiddenCalendars: ["personal@example.com"], other: 1 });
    await open(page, "xlarge");
    await expect(key(page, "Personal")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".event", { hasText: "Dentist" })).toHaveCount(0);
    await key(page, "Family").click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({ hiddenCalendars: ["personal@example.com", "family@example.com"], other: 1 });
  });

  test("outside Eva the choice stays in memory, and the failed save changes nothing", async ({ page }) => {
    await open(page, "xlarge");
    await key(page, "Work").click();
    await expect(page.locator(".event", { hasText: "Deep work" })).toHaveCount(0);
    await expect(key(page, "Work")).toHaveAttribute("aria-pressed", "false");
  });

  test("the small card skips the events of a hidden calendar", async ({ page }) => {
    await fakeEvaState(page, { hiddenCalendars: ["work@example.com"] });
    await page.setViewportSize({ width: 200, height: 200 });
    await open(page, "small");
    await expect(page.locator(".small-title")).toHaveText("Gym");
  });

  test("the medium card skips them too, and says how many calendars are hidden", async ({ page }) => {
    await fakeEvaState(page, { hiddenCalendars: ["work@example.com"] });
    await page.setViewportSize({ width: 600, height: 300 });
    await open(page, "medium");
    await expect(page.locator(".day-group").first().locator(".agenda-title")).toHaveText(["Gym"]);
    await expect(page.locator(".hidden-note")).toHaveText("1 calendar hidden");
  });
});

test.describe("the hideTitles input", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("hides each event whose title matches one of its patterns, in any case", async ({ page }) => {
    await page.route("**/config.json", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ unit: "celsius", hideTitles: "STANDUP, ^gym$, (broken" }),
      }),
    );
    await open(page, "xlarge");
    await expect(page.locator(".event", { hasText: "Team standup" })).toHaveCount(0);
    await expect(page.locator(".event", { hasText: /^Gym/ })).toHaveCount(0);
    await expect(event(page, "Deep work")).toBeVisible();
    await expect(event(page, "Swim class")).toBeVisible();
  });
});

test.describe("the event's hours in the chart", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const chartBox = (page, day) => page.locator(".day-head").nth(day).locator(".chart-event");

  test("hover on an event draws a box in its colour over its hours in the chart of its day", async ({ page }) => {
    await open(page, "xlarge");
    await event(page, "Sprint planning").hover();
    await expect(chartBox(page, 1)).toHaveCount(1);
    await expect(chartBox(page, 1)).toHaveAttribute("x", "14");
    await expect(chartBox(page, 1)).toHaveAttribute("width", "1.5");
    const colour = await chartBox(page, 1).evaluate((node) =>
      getComputedStyle(node).getPropertyValue("--calendar-colour"),
    );
    expect(colour).toBe("#3f51b5");
    await expect(page.locator(".chart-event")).toHaveCount(1);
    await page.mouse.move(2, 400);
    await expect(page.locator(".chart-event")).toHaveCount(0);
  });

  test("keyboard focus on an event draws the box too", async ({ page }) => {
    await open(page, "xlarge");
    await event(page, "Deep work").focus();
    await expect(chartBox(page, 0)).toHaveAttribute("x", "15");
  });

  test("an all-day event gives a band over the whole chart of each of its days", async ({ page }) => {
    await open(page, "xlarge");
    await page.locator(".all-day-event", { hasText: "Trip to the coast" }).hover();
    for (const day of [3, 4]) {
      await expect(chartBox(page, day)).toHaveAttribute("x", "0");
      await expect(chartBox(page, day)).toHaveAttribute("width", "24");
    }
    await expect(page.locator(".chart-event")).toHaveCount(2);
  });

  test("an event over midnight draws a box on the chart of each day", async ({ page }) => {
    await fakeEvaCalendar(page, {
      calendars: [{ id: "home", name: "Home", color: "#0b8043", primary: true }],
      events: [
        {
          id: "night",
          calendarId: "home",
          title: "Late show",
          startAt: `${testToday}T22:00:00+00:00`,
          endAt: "2026-03-12T02:00:00+00:00",
          place: null,
          link: null,
          description: null,
          project: null,
        },
      ],
    });
    await open(page, "xlarge");
    await event(page, "Late show").hover();
    await expect(chartBox(page, 0)).toHaveAttribute("x", "22");
    await expect(chartBox(page, 0)).toHaveAttribute("width", "2");
    await expect(chartBox(page, 1)).toHaveAttribute("x", "0");
    await expect(chartBox(page, 1)).toHaveAttribute("width", "2");
  });
});

test("the hover marker is strong on the day under the pointer and lighter on the other days", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "xlarge");
  const column = await box(page.locator(".day-column").nth(2));
  await page.mouse.move(column.x + column.width / 2, column.y + 20);
  const markers = page.locator(".chart-marker");
  await expect(markers.nth(2)).toHaveClass(/is-current/);
  await expect(page.locator(".chart-marker.is-current")).toHaveCount(1);
  const opacity = (index) => markers.nth(index).evaluate((node) => Number(getComputedStyle(node).opacity));
  expect(await opacity(2)).toBeGreaterThan(await opacity(0));
  const width = (index) => markers.nth(index).evaluate((node) => parseFloat(getComputedStyle(node).strokeWidth));
  expect(await width(2)).toBeGreaterThan(await width(0));
});

test.describe("projects", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("an event with a project shows a mark, and its tooltip names the project and gives the description", async ({
    page,
  }) => {
    await open(page, "xlarge");
    await expect(event(page, "Sprint planning").locator(".project-mark")).toHaveCount(1);
    await expect(event(page, "Dentist").locator(".project-mark")).toHaveCount(0);
    await event(page, "Sprint planning").hover();
    await expect(page.locator(".tooltip .tooltip-project")).toHaveText("Recipe app");
    await expect(page.locator(".tooltip .tooltip-description")).toContainText("Plan the next two weeks.");
  });
});

test.describe("the menu of an event", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const menu = (scope) => scope.locator(".menu");
  const items = (scope) => menu(scope).getByRole("menuitem");

  test("outside Eva, a click opens a menu with only Google Calendar, never the event at once", async ({
    page,
    context,
  }) => {
    await open(page, "xlarge");
    const opened = [];
    context.on("page", (other) => opened.push(other));
    await event(page, "Deep work").click();
    await expect(menu(page)).toBeVisible();
    await expect(items(page)).toHaveText(["See in Google Calendar"]);
    const google = items(page).first();
    await expect(google).toHaveAttribute("href", "https://calendar.google.com/calendar/");
    await expect(google).toHaveAttribute("target", "_blank");
    await expect(google).toHaveAttribute("rel", "noopener");
    expect(opened).toHaveLength(0);
    await expect(event(page, "Deep work")).toHaveAttribute("aria-expanded", "true");
    await page.mouse.click(2, 400);
    await expect(menu(page)).toBeHidden();
  });

  test("inside Eva, the chat entry asks Eva for a chat with a short text about the event", async ({ page }) => {
    const frame = await openInEva(page, "xlarge");
    await expect.poll(async () => (await asked(page)).map((message) => message.ask)).toContain("hello");
    await event(frame, "Sprint planning").click();
    await expect(items(frame)).toHaveText([
      "Directions in Google Maps",
      "Start a chat about this event",
      "Open the project",
      "See in Google Calendar",
    ]);
    await expect(menu(frame).locator(".menu-project")).toHaveText("Recipe app");
    await items(frame).nth(1).click();
    await expect(menu(frame)).toBeHidden();
    const chat = (await asked(page)).find((message) => message.ask === "chat");
    expect(chat.eva).toBe("widget");
    expect(typeof chat.id).toBe("number");
    expect(chat.text).toBe(
      'Let us talk about my event "Sprint planning", Thu 12 Mar · 14:00–15:30 · 1 h 30 min, in my Work calendar, at Room B. ' +
        'It belongs to my project "Recipe app" (Projects/2025-12-15-1400-recipe-app).',
    );
  });

  test("the project entry asks Eva to open the project's path", async ({ page }) => {
    const frame = await openInEva(page, "xlarge");
    await event(frame, "Sprint planning").click();
    await menu(frame).getByRole("menuitem", { name: "Open the project" }).click();
    // The ask reaches the fake parent a moment after the tap.
    await expect
      .poll(async () => (await asked(page)).find((message) => message.ask === "open")?.path)
      .toBe("Projects/2025-12-15-1400-recipe-app");
  });

  test("an event with no project has no project entry", async ({ page }) => {
    const frame = await openInEva(page, "xlarge");
    await event(frame, "Dentist").click();
    await expect(items(frame)).toHaveText(["Start a chat about this event", "See in Google Calendar"]);
  });

  test("an ask that Eva did not approve has no entry", async ({ page }) => {
    const frame = await openInEva(page, "xlarge", { asks: ["chat"] });
    await expect.poll(async () => (await asked(page)).length).toBeGreaterThan(0);
    await event(frame, "Sprint planning").click();
    await expect(items(frame)).toHaveText([
      "Directions in Google Maps",
      "Start a chat about this event",
      "See in Google Calendar",
    ]);
  });

  test("with no answer to hello, the entries that need Eva hide", async ({ page }) => {
    const frame = await openInEva(page, "xlarge", { answer: false });
    await page.waitForTimeout(500);
    await event(frame, "Sprint planning").click();
    await expect(items(frame)).toHaveText(["Directions in Google Maps", "See in Google Calendar"]);
  });

  test("a refused ask says so, and an ask that is not allowed leaves the menu", async ({ page }) => {
    const frame = await openInEva(page, "xlarge", { refuse: { chat: "not-allowed", open: "no-tap" } });
    await event(frame, "Sprint planning").click();
    await menu(frame).getByRole("menuitem", { name: "Open the project" }).click();
    await expect(menu(frame).locator(".menu-status")).toHaveText("Eva could not open it. Try again.");
    await menu(frame).getByRole("menuitem", { name: "Start a chat about this event" }).click();
    await expect(menu(frame).locator(".menu-status")).toHaveText("Eva does not allow this widget to do that.");
    await expect(menu(frame).getByRole("menuitem", { name: "Start a chat about this event" })).toHaveCount(0);
  });

  test("each entry has its icon, a place opens its way there in Google Maps, and a call its link", async ({ page }) => {
    await open(page, "xlarge");
    await event(page, "Sprint planning").click();
    await expect(items(page)).toHaveText(["Directions in Google Maps", "See in Google Calendar"]);
    const maps = items(page).first();
    await expect(maps).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=Room%20B");
    await expect(maps).toHaveAttribute("target", "_blank");
    await expect(maps).toHaveAttribute("rel", "noopener");
    for (const item of await items(page).all()) await expect(item.locator(".line-icon")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await event(page, "One to one").click();
    await expect(items(page)).toHaveText(["Join the video call", "See in Google Calendar"]);
    await expect(items(page).first()).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  });

  test("the keyboard opens the menu with Enter, moves with the arrows, and Escape gives the focus back", async ({
    page,
  }) => {
    const frame = await openInEva(page, "xlarge");
    await expect.poll(async () => (await asked(page)).length).toBeGreaterThan(0);
    await event(frame, "Sprint planning").focus();
    await page.keyboard.press("Enter");
    await expect(items(frame).nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items(frame).nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(items(frame).nth(3)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items(frame).nth(0)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu(frame)).toBeHidden();
    await expect(event(frame, "Sprint planning")).toBeFocused();
  });

  test("the menu stays open on the same event when the widget draws again", async ({ page }) => {
    await open(page, "xlarge");
    await event(page, "Deep work").click();
    await page.setViewportSize({ width: 1200, height: 780 });
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).locator(".menu-title")).toHaveText("Deep work");
  });

  for (const [size, viewport] of [
    ["xlarge", { width: 1280, height: 800 }],
    ["xlarge", { width: 700, height: 500 }],
    ["xlarge", { width: 390, height: 420 }],
    ["large", { width: 800, height: 400 }],
    ["tall", { width: 300, height: 420 }],
    ["medium", { width: 600, height: 300 }],
    ["small", { width: 160, height: 160 }],
  ]) {
    test(`stays inside the frame and off the top right corner: ${size} at ${String(viewport.width)} x ${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page, size);
      const targets = page.locator("[data-key]");
      const count = await targets.count();
      let checked = 0;
      for (let index = 0; index < count; index += 1) {
        const target = targets.nth(index);
        if (!(await target.isVisible())) continue;
        await target.focus();
        await page.keyboard.press("Enter");
        const shown = await box(menu(page));
        expect(shown.x).toBeGreaterThanOrEqual(0);
        expect(shown.y).toBeGreaterThanOrEqual(0);
        expect(shown.x + shown.width).toBeLessThanOrEqual(viewport.width);
        expect(shown.y + shown.height).toBeLessThanOrEqual(viewport.height);
        expect(shown.y >= 56 || shown.x + shown.width <= viewport.width - 56).toBe(true);
        await page.keyboard.press("Escape");
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test("one tap opens the menu with the event's details in it, and a tap elsewhere closes it", async ({ page }) => {
    const frame = await openInEva(page, "xlarge");
    await event(frame, "Deep work").tap();
    const shown = frame.locator(".menu");
    await expect(shown).toBeVisible();
    await expect(shown.locator(".menu-title")).toHaveText("Deep work");
    await expect(shown.locator(".when-time")).toHaveText("15:00–17:00");
    await expect(shown.locator(".when-day")).toHaveText("Wed 11 Mar · 2 h");
    await expect(shown.locator(".tooltip-project")).toHaveText("Recipe app");
    await expect(frame.locator(".tooltip")).toBeHidden();
    await frame.locator(".day-head").first().tap();
    await expect(shown).toBeHidden();
  });
});
