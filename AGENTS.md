# Calendar

This repository is a widget for Eva's home page: a small web page that Eva shows in a grid. Read the widget contract first: https://github.com/guplem/eva/blob/main/docs/widgets.md. It says which files a widget has, how it talks to Eva, its sizes, its theme and the naming rules of its data. Never copy the contract into this repository: link it.

## What must not change

- **This repository is public, and holds no data of a person.** It holds only mock data for the tests and the demo. Never write a name of a private person, a real data value, a token or a home path.
- **Plain, standard web code.** HTML, JavaScript and CSS, with no framework and no build step. A browser loads the files as they are.
- **The widget talks to its host only through `fetch` to relative paths** of the contract: `config.json`, `eva/google-calendar/`, `eva/location.json`, `eva/state.json` and `eva/theme.css`, **and through the asks of its manifest** (`hello`, `chat` and `open`, by `postMessage` to its parent, each `chat` or `open` right after a tap). Its other addresses are the hosts of its manifest: `https://api.open-meteo.com` and `https://air-quality-api.open-meteo.com`.
- **The widget's own state is `{ "hiddenCalendars": [...] }` in `eva/state.json`.** A save keeps the keys that the widget does not know. Outside Eva the state stays in memory.
- **The widget works outside Eva,** on GitHub Pages and with `npm start`. A calendar path that answers 404 falls back to its mock file in `example/google-calendar/`. Inside Eva the path always answers, so a mock event never shows there.
- **The calendar is read only.** A write to Google Calendar is a new permission: add it only with the owner.
- **The calendar never waits for the weather.** With no location, or with no forecast, the widget shows the calendar alone.
- **The location leaves the device with two decimals only,** about one kilometre.
- **The credit to Open-Meteo shows in the legend of the week view, with its link, and in the README.** Open-Meteo gives its data under CC BY 4.0, which asks for it.

## Rules

- Never use an inline script or an inline style. Eva's Content Security Policy blocks them.
- Never rely on `localStorage`.
- Never rely on a form submit, also `<form method="dialog">`: Eva's sandbox blocks it. Handle each button with a `click` listener.
- Set a colour or a position with `element.style.setProperty`: the CSS object model is not an inline style, so Eva's policy allows it. Never write a `style` attribute.
- Keep each calendar's Google colour, and give it a pattern of `patterns` in `calendar.js` too, so calendars differ by more than colour.
- A tap on an event opens its menu. The menu's Google Calendar entry opens the event's `link` in a new tab, with `rel="noopener"`. Open only an `https` link. An entry that needs Eva shows only when her answer to `hello` approved its ask.
- A pull request that adds or widens a permission of `eva-widget.json` says so in its body: a new input, a write access, the location, a host, or an ask.
- Keep the mock files in line with the code: `config.json`, `eva/theme.css`, `example/location.json` and `example/google-calendar/`. The mock events start on 2026-01-01, with no time zone offset: the widget moves them so that this day is today. Keep `exampleAnchor` in `main.js` in line with them.
- Keep the logic in `calendar.js` and `forecast.js`, with no page code, so the unit tests in `tests/*.test.js` run it in Node.
- Never call the real Open-Meteo in a test. Use `fakeWeather` of `tests/helpers.js`. Fake Eva's calendar with `fakeEvaCalendar`, her state with `fakeEvaState`, and her answers to the asks with `openInEva`.
- Keep `tests/fills-screen.spec.js`: the widget fills the space that it gets, at every size.

## Checks

- `npm run check` runs every check: the format, the lint, the contract check (`npm run check:widget`) and the tests. CI runs the same checks as the "lint" and "test" jobs.
- `npm start` runs the widget at http://localhost:3000/. Add `?size=small`, `medium`, `large`, `tall`, `xlarge`, `header` or `full` to the address.
- The tests serve the widget on port 3100, and never reuse a server that already listens. Set `WIDGET_TEST_PORT` to test while another widget repository tests on the same computer.

## Skills

- To make any change, follow `.agents/skills/widget-change/SKILL.md`. It gives the steps of the change one at a time, with the pskill runner. When the runner cannot run, follow `.agents/skills/make-change/SKILL.md` instead, with the rules of this file.
- Before each commit, follow `.agents/skills/write-commit/SKILL.md`.
- To create an issue, follow `.agents/skills/create-issue/SKILL.md`.
- Before each rename, follow `.agents/skills/rename-symbol/SKILL.md`.
- To resume or stop a pskill run, follow `.agents/skills/pskill/SKILL.md`.

## Git and GitHub

- Branch from `origin/main` for each change.
- Open a pull request for each change, and turn on auto-merge for it with `gh pr merge --auto --merge`, with the person's GitHub login. A pull request merges only when CI is green.
- The commit prefixes pick the release version: `feat` raises the middle number, and `fix`, `perf`, `refactor` and `build` the last one. Mark a breaking change with `!`.
- After a merge to `main`, GitHub Pages shows the new version.
