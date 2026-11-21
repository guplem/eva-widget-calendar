// Which events show, and the menu of an event: the logic of calendar.js for contract 3, in Node.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chatLimit,
  chatText,
  hideTitlesLimits,
  isSlowPattern,
  menuEntries,
  menuPosition,
  readEvents,
  readHiddenCalendars,
  readProject,
  splitPatterns,
  titleFilter,
  toggleCalendar,
  visibleEvents,
} from "../calendar.js";

process.env.TZ = "UTC";

const project = {
  id: "2026-01-01-0900-garden-shed",
  title: "Garden shed",
  path: "Projects/2026-01-01-0900-garden-shed",
};
const read = (more = {}) =>
  readEvents([
    {
      id: "e1",
      calendarId: "work",
      title: "Design review",
      startAt: "2026-03-12T10:00:00Z",
      endAt: "2026-03-12T12:45:00Z",
      place: "Room B",
      link: "https://calendar.google.com/calendar/event?eid=e1",
      description: "Bring the drawings.",
      project,
      ...more,
    },
  ])[0];

test("an event keeps its description and its project, and drops a project path that leaves the vault", () => {
  const event = read();
  assert.equal(event.description, "Bring the drawings.");
  assert.deepEqual(event.project, project);
  assert.equal(read({ description: "  ", project: null }).description, null);
  assert.equal(read({ project: null }).project, null);
  assert.equal(readProject({ id: "x", title: "X", path: "/etc" }), null);
  assert.equal(readProject({ id: "x", title: "X", path: "Projects/../.eva" }), null);
  assert.equal(readProject({ id: "x", path: "Projects/x" }).title, "x");
  assert.equal(readProject("Projects/x"), null);
  assert.equal(read({ description: "a".repeat(2500) }).description.length, 2000);
});

test("a comma separates the patterns, except inside braces or brackets, or after a backslash", () => {
  assert.deepEqual(splitPatterns("^Work$, Focus time ,,"), ["^Work$", "Focus time"]);
  assert.deepEqual(splitPatterns("a{2,3}, [,;]x, b\\,c"), ["a{2,3}", "[,;]x", "b\\,c"]);
  assert.deepEqual(splitPatterns("   "), []);
});

test("the title filter is case-insensitive, matches anywhere, and treats an invalid expression as text", () => {
  const hide = titleFilter("^focus time$, lunch, (unclosed");
  assert.equal(hide("Focus Time"), true);
  assert.equal(hide("Focus time with Sam"), false);
  assert.equal(hide("Team LUNCH"), true);
  assert.equal(hide("Notes (unclosed bracket"), true);
  assert.equal(hide("Design review"), false);
  assert.equal(titleFilter(""), null);
  assert.equal(titleFilter(" , "), null);
  assert.equal(titleFilter(undefined), null);
  // A quantifier with a comma works.
  assert.equal(titleFilter("^x{2,3}$")("XXX"), true);
});

test("a slow expression is matched as plain text, so a long title does not freeze the widget", () => {
  assert.equal(isSlowPattern("(a+)+$"), true);
  assert.equal(isSlowPattern("(\\w*\\s?)*x"), true);
  assert.equal(isSlowPattern("((ab)*c)+"), true);
  assert.equal(isSlowPattern("(.*a){20}"), true);
  assert.equal(isSlowPattern("^(Work|SDG)$"), false);
  assert.equal(isSlowPattern("standup\\s+\\d+"), false);
  assert.equal(isSlowPattern("(ab)+c*"), false);
  assert.equal(isSlowPattern("[(+]+"), false);
  const hide = titleFilter("(a+)+$, (x|y)+z");
  const titles = ["a".repeat(40), `${"a".repeat(40)}!`, "(a+)+$ is a pattern", "xyxyz", "Design review"];
  const started = Date.now();
  assert.deepEqual(
    titles.map((title) => hide(title)),
    [false, false, true, true, false],
  );
  assert.ok(Date.now() - started < 200);
});

test("the input, the number of patterns and the tested title are capped", () => {
  const many = Array.from({ length: 30 }, (_, index) => `p${String(index)}x`).join(",");
  const hide = titleFilter(many);
  assert.equal(hide("p19x"), true);
  assert.equal(hide("p20x"), false);
  const late = titleFilter("needle");
  assert.equal(late(`${"a".repeat(hideTitlesLimits.title)}needle`), false);
  assert.equal(titleFilter(`${"b".repeat(hideTitlesLimits.length)}, needle`)("needle"), false);
});

test("the hidden calendars come from the widget's state, unique, and a tap turns one on or off", () => {
  assert.deepEqual(readHiddenCalendars({ hiddenCalendars: ["a", "b", "a", 3, ""] }), ["a", "b"]);
  assert.deepEqual(readHiddenCalendars({}), []);
  assert.deepEqual(readHiddenCalendars(null), []);
  assert.deepEqual(readHiddenCalendars({ hiddenCalendars: "a" }), []);
  assert.deepEqual(toggleCalendar(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleCalendar(["a", "b"], "a"), ["b"]);
});

test("the events of a hidden calendar and the events with a hidden title do not show", () => {
  const events = readEvents([
    { id: "1", calendarId: "work", title: "Standup", startAt: "2026-03-12T09:00:00Z", endAt: "2026-03-12T09:30:00Z" },
    { id: "2", calendarId: "home", title: "Dentist", startAt: "2026-03-12T12:00:00Z", endAt: "2026-03-12T13:00:00Z" },
    { id: "3", calendarId: "home", title: "Trip", date: "2026-03-14", endDate: "2026-03-15" },
    { id: "4", calendarId: "work", title: "", startAt: "2026-03-12T15:00:00Z", endAt: "2026-03-12T16:00:00Z" },
  ]);
  const ids = (list) => list.map((event) => event.id);
  assert.deepEqual(ids(visibleEvents(events, [])), ["1", "2", "4", "3"]);
  assert.deepEqual(ids(visibleEvents(events, ["home"])), ["1", "4"]);
  assert.deepEqual(ids(visibleEvents(events, [], titleFilter("standup"))), ["2", "4", "3"]);
  // The tested title is the one that shows: an event with no title reads Busy.
  assert.deepEqual(ids(visibleEvents(events, ["home"], titleFilter("^busy$"))), ["1"]);
});

test("the menu of an event offers what Eva approved, the project when there is one, and Google's link", () => {
  const kinds = (event, asks) => menuEntries(event, new Set(asks)).map((entry) => entry.kind);
  const full = read();
  const plain = read({ project: null });
  const bare = read({ project: null, link: null });
  assert.deepEqual(kinds(full, ["chat", "open"]), ["chat", "project", "google"]);
  assert.deepEqual(kinds(plain, ["chat", "open"]), ["chat", "google"]);
  assert.deepEqual(kinds(full, ["open"]), ["project", "google"]);
  assert.deepEqual(kinds(full, ["chat"]), ["chat", "google"]);
  // Outside Eva, or with no answer to hello.
  assert.deepEqual(kinds(full, []), ["google"]);
  assert.deepEqual(kinds(bare, []), []);
  assert.deepEqual(
    menuEntries(full, new Set(["chat", "open"])).map((entry) => entry.label),
    ["Start a chat about this event", "Open the project", "See in Google Calendar"],
  );
});

test("the chat text names the event, its day and time, its calendar, its place and its project", () => {
  assert.equal(
    chatText(read(), "Work"),
    'Let us talk about my event "Design review", Thu 12 Mar · 10:00–12:45 · 2 h 45 min, in my Work calendar, at Room B. ' +
      'It belongs to my project "Garden shed" (Projects/2026-01-01-0900-garden-shed).',
  );
  assert.equal(
    chatText(read({ place: null, project: null })),
    'Let us talk about my event "Design review", Thu 12 Mar · 10:00–12:45 · 2 h 45 min.',
  );
  const allDay = readEvents([
    { id: "t", calendarId: "home", title: "Trip", date: "2026-03-14", endDate: "2026-03-15" },
  ])[0];
  assert.equal(chatText(allDay), 'Let us talk about my event "Trip", Sat 14 – Sun 15 Mar · 2 days.');
  assert.ok(chatText(read({ title: "x".repeat(5000), place: "y".repeat(5000) }), "z".repeat(5000)).length <= chatLimit);
});

test("the menu stays inside the frame and off the top right corner, and scrolls when it must", () => {
  const frame = { width: 400, height: 300 };
  // Room above the event.
  const above = menuPosition({ left: 20, right: 120, top: 200, bottom: 240 }, { width: 200, height: 120 }, frame);
  assert.deepEqual([above.left, above.top, above.side], [4, 74, "above"]);
  // An event at the top right: the menu moves left of the corner.
  const right = menuPosition({ left: 300, right: 396, top: 10, bottom: 30 }, { width: 200, height: 120 }, frame);
  assert.ok(right.left + 200 <= frame.width - 56 || right.top >= 56);
  // A frame too narrow to move left: the menu starts below the corner and scrolls.
  const narrow = { width: 160, height: 160 };
  const small = menuPosition({ left: 8, right: 152, top: 8, bottom: 120 }, { width: 152, height: 200 }, narrow);
  assert.equal(small.top, 56);
  assert.equal(small.maxHeight, 160 - 56 - 4);
  assert.ok(small.left >= 4 && small.left + 152 <= 160);
});
