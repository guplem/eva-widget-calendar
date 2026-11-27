// The tasks of Google Tasks with a due day (contract 4), with the mock tasks of
// example/google-tasks/ (moved to the test day) and Eva's answers where a test fakes them.
import { expect, test } from "@playwright/test";
import { fakeEvaCalendar, fakeEvaTasks, fakeWeather, open, testToday } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await fakeWeather(page);
});

const taskNode = (scope, title) => scope.locator(".is-task", { hasText: title }).first();

test.describe("in the week view", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a task shows in the all-day row on its due day, with a box to tick, and a done one is struck through", async ({
    page,
  }) => {
    await open(page, "xlarge");
    const bill = taskNode(page, "Pay the electricity bill");
    await expect(bill).toHaveClass(/all-day-event/);
    await expect(bill.locator(".task-mark")).toHaveCount(1);
    await expect(bill).not.toHaveClass(/is-done/);
    await expect(taskNode(page, "Send the sprint notes")).toHaveClass(/is-done/);
    // A task is never a block in the grid of hours.
    await expect(page.locator(".event.is-task")).toHaveCount(0);
  });

  test("the legend turns the tasks off and on, as a calendar", async ({ page }) => {
    await open(page, "xlarge");
    const key = page.getByRole("button", { name: "Tasks", exact: true });
    await expect(key).toHaveAttribute("aria-pressed", "true");
    await key.click();
    await expect(page.locator(".is-task")).toHaveCount(0);
    await key.click();
    await expect(page.locator(".is-task")).toHaveCount(3);
  });

  test("the details of a task say whether it is done, its due day, its list and its notes", async ({ page }) => {
    await open(page, "xlarge");
    await taskNode(page, "Pay the electricity bill").hover();
    const tooltip = page.locator(".tooltip");
    await expect(tooltip.locator(".when-time")).toHaveText("To do");
    await expect(tooltip.locator(".when-day")).toHaveText("Due Wed 11 Mar");
    await expect(tooltip.locator(".tooltip-calendar")).toHaveText("Tasks · Home");
    await expect(tooltip.locator(".tooltip-description")).toHaveText("The bill is in the shared folder.");
    await taskNode(page, "Send the sprint notes").hover();
    await expect(tooltip.locator(".when-time")).toHaveText("Done");
  });

  test("the menu of a task opens it in Google Tasks", async ({ page }) => {
    await open(page, "xlarge");
    await taskNode(page, "Pay the electricity bill").click();
    const items = page.locator(".menu").getByRole("menuitem");
    await expect(items).toHaveText(["See in Google Tasks"]);
    await expect(items.first()).toHaveAttribute("href", "https://tasks.google.com/");
  });
});

test("the medium card lists today's tasks as tasks", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 400 });
  await open(page, "medium");
  const row = page.locator(".agenda-row", { has: taskNode(page, "Pay the electricity bill") });
  await expect(row.locator(".agenda-time")).toHaveText("Task");
});

test.describe("inside Eva", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const calendars = [{ id: "work", name: "Work", color: "#3f51b5", primary: true }];

  test("asks Eva for the tasks of 7 days from today, and shows hers with their list", async ({ page }) => {
    await fakeEvaCalendar(page, { calendars, events: [] });
    const requests = await fakeEvaTasks(page, {
      lists: [{ id: "l1", name: "Errands" }],
      tasks: [
        {
          id: "x",
          listId: "l1",
          title: "Buy stamps",
          dueDate: "2026-03-13",
          completed: false,
          completedAt: null,
          notes: null,
          link: null,
        },
      ],
    });
    await open(page, "xlarge");
    const asked = requests.find((url) => url.pathname.endsWith("/tasks.json"));
    expect(asked.searchParams.get("from")).toBe(testToday);
    expect(asked.searchParams.get("to")).toBe("2026-03-17");
    await expect(page.locator(".is-task")).toHaveText(["Buy stamps"]);
    await expect(page.locator(".legend-key")).toHaveText(["Work", "Tasks"]);
  });

  test("with Tasks off, or when the tasks fail, the calendar shows alone and never the mock tasks", async ({
    page,
  }) => {
    await fakeEvaCalendar(page, { calendars, events: [] });
    await fakeEvaTasks(page, { status: 502 });
    await open(page, "xlarge");
    await expect(page.locator(".is-task")).toHaveCount(0);
    await expect(page.locator(".legend-key")).toHaveText(["Work"]);
    await expect(page.locator('[data-role="message"]')).toHaveText("");
  });
});
