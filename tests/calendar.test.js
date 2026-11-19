// The calendar logic of calendar.js, in Node, with no page. The tests run in the UTC time zone that
// npm test gives them, so an hour of a date is its hour of day.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  allDayOn,
  clock,
  dayName,
  dayWindow,
  gridDays,
  hourHeight,
  hourRange,
  layoutParts,
  moveExample,
  nextEvent,
  partsOn,
  patterns,
  rangeLabel,
  readCalendars,
  readEvents,
  safeLink,
  untilText,
} from "../calendar.js";

process.env.TZ = "UTC";

const timed = (id, startAt, endAt, more = {}) => ({ id, calendarId: "work", title: id, startAt, endAt, ...more });

test("a window of days runs on over the end of a month and a year", () => {
  assert.deepEqual(dayWindow("2026-12-30", 4), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("the week view shows 7 days on a wide frame and fewer on a narrow one", () => {
  assert.deepEqual(
    [1280, 900, 899, 620, 619, 340, 339].map((width) => gridDays("week", width)),
    [7, 7, 5, 5, 3, 3, 1],
  );
  assert.deepEqual(
    [800, 520, 519, 340, 200].map((width) => gridDays("days", width)),
    [3, 3, 2, 2, 1],
  );
});

test("each calendar gets the next pattern, and Eva's null answer stays null", () => {
  const list = readCalendars([
    { id: "a", name: "Work", color: "#3f51b5", primary: true },
    { id: "b", name: "", color: "red" },
    { name: "No id" },
    ...patterns.map((_, index) => ({ id: `extra-${String(index)}` })),
  ]);
  assert.deepEqual(list[0], { id: "a", name: "Work", color: "#3f51b5", primary: true, pattern: "solid" });
  assert.deepEqual(list[1], { id: "b", name: "Calendar", color: null, primary: false, pattern: "stripes" });
  assert.equal(list[patterns.length].pattern, "solid");
  assert.equal(readCalendars(null), null);
});

test("events come sorted, with all-day events, a short event for a broken end, and no unsafe link", () => {
  const events = readEvents([
    timed("late", "2026-03-11T18:00:00Z", "2026-03-11T19:00:00Z", { link: "javascript:alert(1)" }),
    { id: "trip", calendarId: "home", title: "Trip", date: "2026-03-11", endDate: "2026-03-12", place: null },
    timed("no-end", "2026-03-11T09:00:00Z", "not a date", { link: "https://calendar.google.com/x" }),
    { id: "broken", title: "No start" },
    "not an event",
  ]);
  assert.deepEqual(
    events.map((event) => event.id),
    ["trip", "no-end", "late"],
  );
  assert.equal(events[0].allDay, true);
  assert.equal(events[1].end.toISOString(), "2026-03-11T09:30:00.000Z");
  assert.equal(events[1].link, "https://calendar.google.com/x");
  assert.equal(events[2].link, null);
  assert.equal(readEvents(null), null);
});

test("an event with an offset shows at its time in the browser's time zone", () => {
  const [event] = readEvents([timed("standup", "2026-03-11T09:00:00+01:00", "2026-03-11T09:30:00+01:00")]);
  assert.equal(event.start.getUTCHours(), 8);
});

test("a link must be https", () => {
  assert.equal(safeLink("https://calendar.google.com/event?eid=1"), "https://calendar.google.com/event?eid=1");
  assert.equal(safeLink("http://example.com"), null);
  assert.equal(safeLink("not a link"), null);
  assert.equal(safeLink(null), null);
});

test("the mock events move by whole days, so their first day falls on today", () => {
  const moved = moveExample(
    [
      { id: "a", startAt: "2026-01-01T09:00:00", endAt: "2026-01-01T09:30:00" },
      { id: "b", date: "2026-01-04", endDate: "2026-01-05" },
    ],
    "2026-01-01",
    "2026-03-11",
  );
  assert.deepEqual(moved, [
    { id: "a", startAt: "2026-03-11T09:00:00", endAt: "2026-03-11T09:30:00" },
    { id: "b", date: "2026-03-14", endDate: "2026-03-15" },
  ]);
});

test("an all-day event shows on each of its days", () => {
  const events = readEvents([{ id: "trip", title: "Trip", date: "2026-03-11", endDate: "2026-03-12" }]);
  assert.equal(allDayOn(events, "2026-03-12").length, 1);
  assert.equal(allDayOn(events, "2026-03-13").length, 0);
});

test("an event over midnight shows on both days, cut at midnight", () => {
  const events = readEvents([timed("party", "2026-03-11T22:00:00Z", "2026-03-12T01:30:00Z")]);
  assert.deepEqual(
    partsOn(events, "2026-03-11").map(({ from, to }) => [from, to]),
    [[22, 24]],
  );
  assert.deepEqual(
    partsOn(events, "2026-03-12").map(({ from, to }) => [from, to]),
    [[0, 1.5]],
  );
});

test("overlapping events share the width side by side, and the others keep it whole", () => {
  const parts = [
    { id: "a", from: 9, to: 10 },
    { id: "b", from: 9.5, to: 11 },
    { id: "c", from: 10, to: 10.5 },
    { id: "d", from: 13, to: 14 },
  ];
  const placed = Object.fromEntries(layoutParts(parts).map((part) => [part.id, [part.column, part.columns]]));
  assert.deepEqual(placed, { a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
});

test("the hours widen to an early or a late event, and a day needs no scroll bar when the hours fit", () => {
  assert.deepEqual(hourRange([]), { from: 7, to: 21 });
  assert.deepEqual(
    hourRange([
      { from: 6.5, to: 8 },
      { from: 21, to: 22.25 },
    ]),
    { from: 6, to: 23 },
  );
  assert.equal(hourHeight(560, 14), 40);
  assert.equal(hourHeight(100, 14), 16);
  assert.equal(hourHeight(5000, 14), 64);
});

test("the small card shows the event that runs now, else the next one", () => {
  const events = readEvents([
    timed("done", "2026-03-11T09:00:00Z", "2026-03-11T10:00:00Z"),
    timed("now", "2026-03-11T14:00:00Z", "2026-03-11T15:00:00Z"),
    timed("next", "2026-03-11T16:00:00Z", "2026-03-11T17:00:00Z"),
  ]);
  assert.deepEqual(nextEvent(events, new Date("2026-03-11T14:20:00Z")), { event: events[1], now: true });
  assert.equal(nextEvent(events, new Date("2026-03-11T15:30:00Z")).event.id, "next");
  assert.equal(nextEvent(events, new Date("2026-03-11T18:00:00Z")), null);
});

test("the time until an event reads in minutes, hours or days", () => {
  const minute = 60_000;
  assert.equal(untilText(0), "now");
  assert.equal(untilText(40 * minute), "in 40 min");
  assert.equal(untilText(125 * minute), "in 2 h 5 min");
  assert.equal(untilText(180 * minute), "in 3 h");
  assert.equal(untilText(26 * 60 * minute), "in 1 day");
  assert.equal(untilText(3 * 24 * 60 * minute), "in 3 days");
});

test("the date labels", () => {
  assert.deepEqual(dayName("2026-03-11", "2026-03-11"), { weekday: "Wed", date: 11, month: "Mar", relative: "Today" });
  assert.equal(dayName("2026-03-12", "2026-03-11").relative, "Tomorrow");
  assert.equal(dayName("2026-03-13", "2026-03-11").relative, null);
  assert.equal(rangeLabel("2026-11-18", "2026-11-24"), "Wed 18 – Tue 24 Nov");
  assert.equal(rangeLabel("2026-11-30", "2026-12-06"), "Mon 30 Nov – Sun 6 Dec");
  assert.equal(rangeLabel("2026-11-30", "2026-11-30"), "Mon 30 Nov");
  assert.equal(clock(14 + 20 / 60), "14:20");
  assert.equal(clock(9), "09:00");
});
