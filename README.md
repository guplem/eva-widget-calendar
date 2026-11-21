# Calendar

A widget for [Eva](https://github.com/guplem/eva)'s home page. It shows your Google Calendar for the next days, with the forecast of each day next to your events.

**Demo:** https://guplem.github.io/eva-widget-calendar/

The demo shows made-up events that always start today. Its forecast is for your real location when your browser allows it, and for an example location otherwise.

Weather data by [Open-Meteo](https://open-meteo.com/), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## What it does

- **The small card** shows the next event, the time until it, and the temperature now.
- **The medium card** shows the events that are left today, with a line at the time now. Tomorrow fills the room that today leaves.
- **The large and the tall cards** show the next days: as a time grid when the card is wide enough, and as a list when it is narrow.
- **The extra-large card and full screen** show the week as a time grid: 7 days from today on a wide card, 5 or 3 on a narrow one, such as a phone.
  - Each day has a head with the sky, the high and the low, and a chart of the day: the chance of rain as bars, the temperature as a line, and the night in shade. All days share one temperature scale. The dotted lines mark round temperatures, such as 10° and 20°.
  - The events stand at their real time, each filled with a tint of its calendar's colour. Overlapping events stack as in Google Calendar: events that start at about the same time share the width side by side; an event that starts later sits on top of the one that it overlaps, indented from its left, with a thin outline, so the earlier event keeps its width and its title stays in view. Past events are dim, and a line marks the time now, above every event.
  - The all-day row at the top shows each event that covers whole days, as one bar over its days: an all-day event, a timed event from midnight to a later midnight, and a timed event of 24 hours or more, as Google Calendar does. An event that only crosses midnight, such as 22:00 to 02:00, stays in the grid, cut at midnight on each of its days.
  - The hours fit the card, so the grid needs no scroll bar.
  - Move the pointer over the grid, or touch it, to read the forecast of that moment in the top-left corner: the day, the hour, the temperature and the chance of rain. A line marks that hour on every day's chart: strong on the day under the pointer, lighter on the others.
  - The legend at the bottom names your calendars, and gives the sunrise, the sunset, the UV index and the air quality of today.
  - **Turn a calendar off or on** with a tap on its name in the legend. Its events leave every view; its name stays in the legend, struck through, with its swatch crossed out. Inside Eva the choice is saved in your vault, so every device shows the same. On the demo it lasts until the page reloads. Cards with no legend say how many calendars are hidden: change it in full screen.
- Each event keeps the colour of its calendar in Google. Each calendar also gets a pattern on the side of its events, such as stripes or dots, so calendars differ by more than colour.
- An event with no title reads "Busy", as Google Calendar shows it.
- Move the pointer over an event, or move the keyboard focus to it, to see its details in a tooltip: the full title, the day and the time with the duration, the calendar, the project, the place, the forecast during the event (the lowest and highest temperature, the highest chance of rain and the sky; for an all-day event, those of its days), and the start of its description. Escape closes it. At the same time, a box in the event's colour marks its hours on the chart of its day: on each day's chart for an event over midnight, and over the whole chart for an all-day event.
- **Projects.** When the description of an event in Google Calendar holds a line such as `[eva-project:2026-11-02-1030-example-app]`, Eva links the event to that project. The event shows a small folder before its title, when its block has room, and its details and menu name the project.
- **The menu of an event.** A click or a tap on an event opens a small menu:
  - **Start a chat about this event:** Eva puts a short text in her message box (the title, the day and the time, the calendar, the place, and the project with its folder). You read it, add to it, and send it yourself.
  - **Open the project:** Eva opens the project's page. Only for an event with a project.
  - **See in Google Calendar:** opens the event in a new tab.

  The first two need Eva and your approval of the widget's asks, so they do not show on the demo. On a touch screen, the menu also shows the event's details. From the keyboard, Enter opens the menu, the arrow keys move in it, and Escape closes it and gives the focus back to the event. A refusal of Eva shows in the menu.

- The widget reads your calendar again every 5 minutes, and the forecast every 30 minutes.

## What it needs

- **Your Google Calendar,** through Eva's own Google login. The widget only reads it, and it never sees your login. With no Google login, or with Calendar off, the widget says how to turn it on: in Eva, open **Settings > Connections > Google**, log in to Google, and tick Calendar.
- **Your location,** optional, for the forecast. The widget sends it to `https://api.open-meteo.com` and `https://air-quality-api.open-meteo.com`, rounded to two decimals, about one kilometre. It sends nothing else. With no location, the widget shows the calendar with no weather.
- The `unit` input picks Celsius or Fahrenheit.
- The `hideTitles` input hides the events whose title matches it, such as a repeated block that tells you nothing. See [Hide events by title](#hide-events-by-title).
- **Two asks,** each approved by you: `chat`, to put a text about an event in Eva's message box, and `open`, to open an event's project in Eva. The widget sends an ask only after your tap, and Eva never sends a chat by herself.

Eva asks you for each permission when you turn the widget on.

### Hide events by title

Fill **Hide events by title** with one pattern or more, separated by commas. Each pattern is a case-insensitive [regular expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions), tested against the title that shows (an event with no title reads "Busy"). An event that matches any pattern does not show anywhere.

| Pattern           | Hides the events that...                               |
| ----------------- | ------------------------------------------------------ |
| `lunch`           | have "lunch" anywhere in the title (also "Team Lunch") |
| `^Focus time$`    | are titled exactly "Focus time"                        |
| `^(Gym\|Swim)\b`  | start with the word "Gym" or "Swim"                    |
| `^Focus, standup` | start with "Focus", or have "standup" anywhere         |

- A comma separates two patterns. A comma inside `{}` or `[]` stays in its pattern, so `x{2,3}` and `[,;]` work. Write `\,` for a comma anywhere else.
- An invalid expression, such as `(draft`, matches as plain text.
- A pattern that could take very long on some titles, a repeated group that holds a repeat itself such as `(a+)+`, matches as plain text too. The widget reads the first 500 characters of the input, 20 patterns at most, and the first 300 characters of each title.

## Add it to Eva

Add the widget by its address: `https://github.com/guplem/eva-widget-calendar`. It needs an Eva that knows widget contract 3.

## Run it on your computer

A browser does not run the widget from a double-click on `index.html`. Run a small web server instead:

```sh
npm install
npm start
```

Then open http://localhost:3000/. Add `?size=small`, `medium`, `large`, `tall`, `xlarge`, `header` or `full` to the address to see each size. The `header` size, for the slot beside Eva's greeting, shows the next event and the temperature on one line.

## Change it

The widget follows the [widget contract](https://github.com/guplem/eva/blob/main/docs/widgets.md) of Eva. `AGENTS.md` says how to work on it, for people and for coding agents. `npm run check` runs every check. The tests answer Open-Meteo with a made-up forecast, and use the mock events of `example/google-calendar/`. A fake parent page answers the asks of the widget as Eva does (`openInEva` in `tests/helpers.js`).

## License

MIT. See [`LICENSE`](LICENSE). The forecast data belongs to Open-Meteo and its sources.
