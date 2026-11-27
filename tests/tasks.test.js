// The tasks of Google Tasks with a due day: the logic of calendar.js for contract 4, in Node.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chatText,
  menuEntries,
  moveExample,
  readTasks,
  tasksCalendar,
  tasksCalendarId,
  whenParts,
} from "../calendar.js";

process.env.TZ = "UTC";

const lists = [
  { id: "home", name: "Home" },
  { id: "work", name: "" },
];
const task = (more = {}) => ({
  id: "t1",
  listId: "home",
  title: "Water the plants",
  dueDate: "2026-03-12",
  completed: false,
  completedAt: null,
  notes: "The ones on the balcony.",
  link: "https://tasks.google.com/task/t1",
  ...more,
});

test("a task with a due day reads as a one-day item of the tasks calendar, with its list", () => {
  const [read] = readTasks([task()], lists);
  assert.deepEqual(read, {
    id: "task-t1",
    calendarId: tasksCalendarId,
    title: "Water the plants",
    place: null,
    link: "https://tasks.google.com/task/t1",
    description: "The ones on the balcony.",
    project: null,
    allDay: true,
    date: "2026-03-12",
    endDate: "2026-03-12",
    task: { completed: false, listName: "Home" },
  });
});

test("Eva's null answer stays null, and a task with no due day, a bad link or no title is fixed or dropped", () => {
  assert.equal(readTasks(null, lists), null);
  const read = readTasks(
    [
      task({ id: "a", title: "", link: "javascript:alert(1)", notes: "  ", listId: "work", completed: true }),
      task({ id: "b", dueDate: null }),
      task({ id: "c", dueDate: "12/03/2026" }),
      "not a task",
      task({ id: "d", listId: "gone" }),
    ],
    lists,
  );
  assert.deepEqual(
    read.map((item) => [item.id, item.title, item.link, item.description, item.task]),
    [
      ["task-a", "Untitled task", null, null, { completed: true, listName: null }],
      [
        "task-d",
        "Water the plants",
        "https://tasks.google.com/task/t1",
        "The ones on the balcony.",
        { completed: false, listName: null },
      ],
    ],
  );
});

test("the tasks calendar shows in the legend as Tasks", () => {
  assert.deepEqual(tasksCalendar(), {
    id: tasksCalendarId,
    name: "Tasks",
    color: null,
    primary: false,
    pattern: "solid",
  });
});

test("the demo moves the due day of a mock task as it moves the days of the mock events", () => {
  assert.deepEqual(moveExample([{ id: "t", dueDate: "2026-01-02" }], "2026-01-01", "2026-03-11"), [
    { id: "t", dueDate: "2026-03-12" },
  ]);
});

test("the details of a task say whether it is done, and its due day", () => {
  const [open, done] = readTasks([task(), task({ id: "t2", completed: true })], lists);
  assert.deepEqual(whenParts(open), { time: "To do", day: "Due Thu 12 Mar" });
  assert.deepEqual(whenParts(done), { time: "Done", day: "Due Thu 12 Mar" });
});

test("the menu of a task offers a chat and the task in Google Tasks, and the chat names it as a task", () => {
  const [read] = readTasks([task()], lists);
  assert.deepEqual(
    menuEntries(read, new Set(["chat", "open"])).map((entry) => [entry.kind, entry.label]),
    [
      ["chat", "Start a chat about this task"],
      ["google", "See in Google Tasks"],
    ],
  );
  assert.equal(chatText(read), 'Let us talk about my task "Water the plants", due Thu 12 Mar, in my Home list.');
  const [done] = readTasks([task({ completed: true, listId: "nope" })], lists);
  assert.equal(chatText(done), 'Let us talk about my task "Water the plants", due Thu 12 Mar. It is done.');
});
