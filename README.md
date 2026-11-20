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
  - Move the pointer over the grid, or touch it, to read the forecast of that moment in the top-left corner: the day, the hour, the temperature and the chance of rain.
  - The legend at the bottom names your calendars, and gives the sunrise, the sunset, the UV index and the air quality of today.
- Each event keeps the colour of its calendar in Google. Each calendar also gets a pattern on the side of its events, such as stripes or dots, so calendars differ by more than colour.
- An event with no title reads "Busy", as Google Calendar shows it.
- Move the pointer over an event, or move the keyboard focus to it, to see its details in a tooltip: the full title, the day and the time with the duration, the calendar, the place, and the forecast during the event (the lowest and highest temperature, the highest chance of rain and the sky; for an all-day event, those of its days). Escape closes it.
- A click on an event opens it in Google Calendar, in a new tab. On a touch screen, the first tap on an event shows its details, and a second tap on the same event opens it; a tap anywhere else closes the details.
- The widget reads your calendar again every 5 minutes, and the forecast every 30 minutes.

## What it needs

- **Your Google Calendar,** through Eva's own Google login. The widget only reads it, and it never sees your login. With no Google login, or with Calendar off, the widget says how to turn it on: in Eva, open **Settings > Connections > Google**, log in to Google, and tick Calendar.
- **Your location,** optional, for the forecast. The widget sends it to `https://api.open-meteo.com` and `https://air-quality-api.open-meteo.com`, rounded to two decimals, about one kilometre. It sends nothing else. With no location, the widget shows the calendar with no weather.
- The `unit` input picks Celsius or Fahrenheit.

Eva asks you for each permission when you turn the widget on.

## Add it to Eva

Add the widget by its address: `https://github.com/guplem/eva-widget-calendar`. It needs an Eva that knows widget contract 2.

## Run it on your computer

A browser does not run the widget from a double-click on `index.html`. Run a small web server instead:

```sh
npm install
npm start
```

Then open http://localhost:3000/. Add `?size=small`, `medium`, `large`, `tall`, `xlarge` or `full` to the address to see each size.

## Change it

The widget follows the [widget contract](https://github.com/guplem/eva/blob/main/docs/widgets.md) of Eva. `AGENTS.md` says how to work on it, for people and for coding agents. `npm run check` runs every check. The tests answer Open-Meteo with a made-up forecast, and use the mock events of `example/google-calendar/`.

## License

MIT. See [`LICENSE`](LICENSE). The forecast data belongs to Open-Meteo and its sources.
