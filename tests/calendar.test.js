// The calendar logic of calendar.js, in Node, with no page. The tests run in the UTC time zone that
// npm test gives them, so an hour of a date is its hour of day.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  allDayLanes,
  allDayOn,
  clock,
  dayName,
  dayWindow,
  durationText,
  gridDays,
  hourHeight,
  hourRange,
  isWholeDay,
  layoutParts,
  moveExample,
  nextEvent,
  partsOn,
  patterns,
  rangeLabel,
  readCalendars,
  readEvents,
  safeLink,
  tooltipPosition,
  untilText,
  whenText,
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

// The stack of a day: `together` is how long after a group's start an event still joins it side
// by side; `indent` is the step of each level on top; `minWidth` is the narrowest an event gets.
const stack = (parts) =>
  Object.fromEntries(
    layoutParts(parts, { together: 0.5, indent: 0.2, minWidth: 0.5 }).map((part) => [
      part.id,
      [Math.round(part.left * 100) / 100, Math.round(part.width * 100) / 100, part.depth],
    ]),
  );

test("an event alone keeps the whole width", () => {
  assert.deepEqual(stack([{ id: "a", from: 9, to: 10 }]), { a: [0, 1, 0] });
});

test("events that start together share the width, the longer one on the left", () => {
  assert.deepEqual(
    stack([
      { id: "short", from: 13, to: 13.5 },
      { id: "long", from: 13, to: 14 },
    ]),
    { long: [0, 0.5, 0], short: [0.5, 0.5, 0] },
  );
});

test("a later event sits on top of the earlier one, indented, and the earlier keeps its width", () => {
  assert.deepEqual(
    stack([
      { id: "planning", from: 14, to: 15.5 },
      { id: "sync", from: 14.5, to: 15 },
    ]),
    { planning: [0, 1, 0], sync: [0.2, 0.8, 1] },
  );
});

test("three overlaps stack three deep, each one more indented, never narrower than the smallest width", () => {
  assert.deepEqual(
    stack([
      { id: "a", from: 10, to: 13 },
      { id: "b", from: 10.75, to: 11.75 },
      { id: "c", from: 11.25, to: 12 },
      { id: "d", from: 11.8, to: 11.95 },
    ]),
    { a: [0, 1, 0], b: [0.2, 0.8, 1], c: [0.4, 0.6, 2], d: [0.5, 0.5, 3] },
  );
});

test("an event that starts soon after a nested one shares its place, and a later free event is whole", () => {
  assert.deepEqual(
    stack([
      { id: "long", from: 9, to: 17 },
      { id: "first", from: 9.25, to: 9.5 },
      { id: "second", from: 11, to: 12 },
      { id: "third", from: 11.25, to: 11.75 },
      { id: "late", from: 18, to: 19 },
    ]),
    {
      long: [0, 0.5, 0],
      first: [0.5, 0.5, 0],
      second: [0.2, 0.4, 1],
      third: [0.6, 0.4, 1],
      late: [0, 1, 0],
    },
  );
});

test("a nested event inside a slot on the right stays at least the smallest width", () => {
  assert.deepEqual(
    stack([
      { id: "a", from: 9, to: 12 },
      { id: "b", from: 9, to: 11 },
      { id: "c", from: 10, to: 10.5 },
    ]),
    { a: [0, 0.5, 0], b: [0.5, 0.5, 0], c: [0.5, 0.5, 1] },
  );
});

test("an event that covers whole days: midnight to midnight, or 24 hours and more", () => {
  const at = (text) => new Date(text);
  assert.equal(isWholeDay(at("2026-03-11T00:00:00Z"), at("2026-03-12T00:00:00Z")), true);
  assert.equal(isWholeDay(at("2026-03-11T00:00:00Z"), at("2026-03-14T00:00:00Z")), true);
  assert.equal(isWholeDay(at("2026-03-11T10:00:00Z"), at("2026-03-12T10:00:00Z")), true);
  assert.equal(isWholeDay(at("2026-03-11T22:00:00Z"), at("2026-03-12T02:00:00Z")), false);
  assert.equal(isWholeDay(at("2026-03-11T00:00:00Z"), at("2026-03-11T23:59:00Z")), false);
  assert.equal(isWholeDay(at("2026-03-11T00:00:00Z"), at("2026-03-11T12:00:00Z")), false);
});

test("a timed event that covers whole days becomes an all-day event on each of its days", () => {
  const events = readEvents([
    timed("day", "2026-03-11T00:00:00Z", "2026-03-12T00:00:00Z"),
    timed("three", "2026-03-12T00:00:00Z", "2026-03-15T00:00:00Z"),
    timed("long", "2026-03-11T10:00:00Z", "2026-03-13T09:00:00Z"),
    timed("night", "2026-03-11T22:00:00Z", "2026-03-12T02:00:00Z"),
  ]);
  const byId = Object.fromEntries(events.map((event) => [event.id, event]));
  assert.deepEqual(
    [byId.day.allDay, byId.day.date, byId.day.endDate, byId.day.start],
    [true, "2026-03-11", "2026-03-11", undefined],
  );
  assert.deepEqual([byId.three.date, byId.three.endDate], ["2026-03-12", "2026-03-14"]);
  // An event of 24 hours or more keeps its times, for its details.
  assert.deepEqual([byId.long.allDay, byId.long.date, byId.long.endDate], [true, "2026-03-11", "2026-03-13"]);
  assert.equal(byId.long.start.toISOString(), "2026-03-11T10:00:00.000Z");
  assert.equal(byId.night.allDay, false);
  assert.equal(partsOn(events, "2026-03-11").length, 1);
  assert.deepEqual(
    allDayOn(events, "2026-03-13").map((event) => event.id),
    ["long", "three"],
  );
});

test("an event with no title reads Busy", () => {
  const [event] = readEvents([timed("x", "2026-03-11T09:00:00Z", "2026-03-11T10:00:00Z", { title: "" })]);
  assert.equal(event.title, "Busy");
});

test("the all-day row gives each event one bar over its shown days, in the first free lane", () => {
  const events = readEvents([
    { id: "trip", title: "Trip", date: "2026-03-09", endDate: "2026-03-12" },
    { id: "one", title: "One", date: "2026-03-12", endDate: "2026-03-12" },
    { id: "two", title: "Two", date: "2026-03-13", endDate: "2026-03-20" },
    { id: "gone", title: "Gone", date: "2026-03-01", endDate: "2026-03-02" },
  ]);
  const { bars, lanes } = allDayLanes(events, dayWindow("2026-03-11", 5));
  assert.equal(lanes, 2);
  assert.deepEqual(
    bars.map((bar) => [bar.event.id, bar.first, bar.last, bar.lane, bar.cutStart, bar.cutEnd]),
    [
      ["trip", 0, 1, 0, true, false],
      ["one", 1, 1, 1, false, false],
      ["two", 2, 4, 0, false, true],
    ],
  );
});

test("a duration reads in minutes, hours and days", () => {
  const minute = 60_000;
  assert.equal(durationText(45 * minute), "45 min");
  assert.equal(durationText(60 * minute), "1 h");
  assert.equal(durationText(90 * minute), "1 h 30 min");
  assert.equal(durationText(24 * 60 * minute), "1 day");
  assert.equal(durationText(2 * 24 * 60 * minute), "2 days");
  assert.equal(durationText(28 * 60 * minute), "1 day 4 h");
});

test("the day and the time span of an event, with its duration", () => {
  const events = Object.fromEntries(
    readEvents([
      timed("work", "2026-03-11T15:00:00Z", "2026-03-11T17:00:00Z"),
      timed("night", "2026-03-11T22:00:00Z", "2026-03-12T02:00:00Z"),
      timed("whole", "2026-03-14T00:00:00Z", "2026-03-15T00:00:00Z"),
      { id: "trip", title: "Trip", date: "2026-03-14", endDate: "2026-03-15" },
      timed("long", "2026-03-13T10:00:00Z", "2026-03-15T10:00:00Z"),
    ]).map((event) => [event.id, event]),
  );
  assert.equal(whenText(events.work), "Wed 11 Mar · 15:00–17:00 · 2 h");
  assert.equal(whenText(events.night), "Wed 11 Mar 22:00 – Thu 12 Mar 02:00 · 4 h");
  assert.equal(whenText(events.whole), "Sat 14 Mar · All day");
  assert.equal(whenText(events.trip), "Sat 14 – Sun 15 Mar · 2 days");
  assert.equal(whenText(events.long), "Fri 13 Mar 10:00 – Sun 15 Mar 10:00 · 2 days");
});

test("the tooltip shows above its event, else below, else beside it, and always inside the frame", () => {
  const frame = { width: 400, height: 300 };
  const size = { width: 120, height: 60 };
  const place = (anchor) => tooltipPosition(anchor, size, frame);
  assert.deepEqual(place({ left: 100, top: 150, right: 160, bottom: 200 }), { left: 70, top: 84, side: "above" });
  assert.deepEqual(place({ left: 100, top: 40, right: 160, bottom: 100 }), { left: 70, top: 106, side: "below" });
  assert.deepEqual(place({ left: 100, top: 20, right: 160, bottom: 280 }), { left: 166, top: 20, side: "right" });
  assert.deepEqual(place({ left: 300, top: 20, right: 390, bottom: 280 }), { left: 174, top: 20, side: "left" });
  // At the edge, it moves inside the frame.
  assert.deepEqual(place({ left: 0, top: 150, right: 30, bottom: 200 }), { left: 4, top: 84, side: "above" });
  // It keeps the top right corner free for Eva's full-screen button.
  assert.deepEqual(place({ left: 340, top: 120, right: 400, bottom: 180 }), { left: 224, top: 54, side: "above" });
  // In a frame smaller than the tooltip, it starts at the margin.
  assert.deepEqual(tooltipPosition({ left: 0, top: 0, right: 50, bottom: 50 }, size, { width: 100, height: 50 }), {
    left: 4,
    top: 4,
    side: "inside",
  });
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
