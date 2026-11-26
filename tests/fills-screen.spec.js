// The widget fills the space that it gets, at every size, with no empty border (the widget
// contract). Eva's setup report checks that this test exists. Keep it.
import { expect, test } from "@playwright/test";
import { box, fakeWeather, testNow } from "./helpers.js";

// The tests never call the real Open-Meteo, and run at a known time.
test.beforeEach(async ({ page }) => {
  await fakeWeather(page);
  await page.clock.setFixedTime(testNow);
});

const viewports = [
  { width: 160, height: 160 },
  { width: 320, height: 200 },
  { width: 375, height: 667 },
  { width: 800, height: 400 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

for (const size of ["small", "medium", "large", "tall", "xlarge", "full", "header"]) {
  for (const viewport of viewports) {
    test(`size ${size} fills ${String(viewport.width)} x ${String(viewport.height)}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?size=${size}`);
      await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
      const box = await page.evaluate(() => {
        const widget = document.querySelector(".widget").getBoundingClientRect();
        // The content: every visible child of the widget, from the first top to the last bottom.
        const parts = [...document.querySelector(".widget").children]
          .map((child) => child.getBoundingClientRect())
          .filter((rect) => rect.height > 0);
        const padding = parseFloat(getComputedStyle(document.querySelector(".widget")).paddingBottom);
        return {
          widget: { left: widget.left, top: widget.top, width: widget.width, height: widget.height },
          contentBottom: Math.max(...parts.map((rect) => rect.bottom)),
          padding,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      expect(box.widget).toEqual({ left: 0, top: 0, width: viewport.width, height: viewport.height });
      expect(box.scrollWidth).toBe(viewport.width);
      expect(box.scrollHeight).toBe(viewport.height);
      // No empty band at the bottom: the content reaches the padding of the widget.
      expect(box.contentBottom).toBeGreaterThanOrEqual(viewport.height - box.padding - 1);
    });
  }
}

// The real cards of Eva's home page: the header slot beside the greeting, and a small grid card.
for (const viewport of [
  { width: 330, height: 72 },
  { width: 536, height: 72 },
  { width: 640, height: 72 },
]) {
  test(`header at ${String(viewport.width)} x ${String(viewport.height)} shows each line of the next event whole`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?size=header");
    await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
    await expect(page.locator(".small-next").first()).toBeVisible();
    for (const part of [".small-when", ".small-title", ".small-time"]) {
      const cut = await page
        .locator(part)
        .first()
        .evaluate((node) => node.scrollHeight - node.clientHeight);
      expect(cut, part).toBeLessThanOrEqual(1);
    }
    // The text box of the event ends inside the frame, under no line of another part.
    const next = await box(page.locator(".small-next").first());
    const lines = await page
      .locator(".small-next > *")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().bottom));
    for (const bottom of lines) expect(bottom).toBeLessThanOrEqual(next.y + next.height + 0.5);
  });
}

test("small at 203 x 150 keeps the top right corner free for Eva's full-screen button", async ({ page }) => {
  await page.setViewportSize({ width: 203, height: 150 });
  await page.goto("/?size=small");
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".small-next").first()).toBeVisible();
  const next = await box(page.locator(".small-next").first());
  expect(next.y >= 56 || next.x + next.width <= 203 - 56).toBe(true);
});
