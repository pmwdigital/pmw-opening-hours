# @pmwdigital/opening-hours

Weekly opening hours for anything that keeps a schedule: restaurants, shops, event venues. It validates `HH:MM` times, accepts a closing time after midnight, reads the current date and time in an IANA time zone, and lists 30-minute reservation slots, none starting later than 60 minutes before closing.

It has no dependencies. It is written in TypeScript and shipped as ESM. Time zones come from the platform's `Intl`.

## Why

- A venue that opens at 22:00 and closes at 02:00 is a normal schedule. A closing time earlier than the opening time means the next day.
- "Today" and "now" depend on where the venue is, not where the server runs. Dates and times are read in the venue's IANA time zone.
- Hours that were never filled in do not turn into a made-up default. You get `not_configured` and can tell the user.
- A malformed time such as `9:00` or `24:00` makes that day not configured instead of producing wrong slots.

## Install

```bash
npm install github:pmwdigital/pmw-opening-hours
```

## Settings

The functions that take `settings` read this shape. Weekdays are keyed by English name, Sunday first (the order of `Date#getDay`). `timezone` is optional.

```ts
const settings = {
    timezone: "Europe/Istanbul",
    hours: {
        Monday: { open: "12:00", close: "15:00", closed: false },
        Tuesday: { open: "09:00", close: "22:00", closed: true },
        Friday: { open: "22:00", close: "02:00", closed: false },
    },
};
```

A closed day needs no times, and `closed` can be left out for an open day. A weekday with no entry, or with a time that is not valid `HH:MM`, counts as not configured. Other keys are ignored.

## Reservation slots

```ts
import { reservationSlots } from "@pmwdigital/opening-hours";

const now = new Date("2030-01-06T09:00:00Z");

reservationSlots({ settings, date: "2030-01-07", now });
// { status: "open", slots: ["12:00", "12:30", "13:00", "13:30", "14:00"] }

reservationSlots({ settings, date: "2030-01-08", now });
// { status: "closed" }

reservationSlots({ settings, date: "2030-01-09", now });
// { status: "not_configured" }
```

`date` is `YYYY-MM-DD`. `now` defaults to the current time; pass it to get repeatable results.

| status | meaning |
| --- | --- |
| `open` | The day has hours. `slots` holds the start times and can be empty. |
| `closed` | The day has `closed: true`. |
| `not_configured` | No valid hours at all, none for that weekday, or `date` is not `YYYY-MM-DD`. |

Slots start at the opening time and repeat every 30 minutes (`RESERVATION_SLOT_MINUTES`). No slot starts later than 60 minutes before closing (`LAST_SEATING_BEFORE_CLOSE_MINUTES`). A slot is only a start time inside the opening window, so the same call serves table bookings, appointment slots or entry times. Both numbers are fixed, not options.

### Closing after midnight

In the settings above, Friday runs from 22:00 to 02:00.

```ts
reservationSlots({ settings, date: "2030-01-11", now });
// { status: "open", slots: ["22:00", "22:30", "23:00", "23:30"] }
```

The last seating would be 01:00 on Saturday, but a list only holds times of its own date, so it stops at 23:30. Saturday's list comes from Saturday's hours.

Write midnight as `00:00` (`24:00` is not valid): a venue open from 21:00 to 00:00 gets slots until 23:00. A closing time equal to the opening time also means the next day, so use `closed: true` to close a day.

### Today and past dates

For today, slots that have already started in the venue's time zone are dropped. A slot is gone from its start minute. A past date has no slots.

```ts
reservationSlots({ settings, date: "2030-01-07", now: new Date("2030-01-07T10:10:00Z") });
// { status: "open", slots: ["13:30", "14:00"] }

reservationSlots({ settings, date: "2030-01-07", now: new Date("2030-01-08T09:00:00Z") });
// { status: "open", slots: [] }
```

10:10 UTC is 13:10 in Istanbul, so the 12:00 to 13:00 slots are gone.

## Time zones

```ts
import { todayInTimezone, zonedNow } from "@pmwdigital/opening-hours";

zonedNow("America/New_York", new Date("2030-01-07T15:30:00Z"));
// { date: "2030-01-07", minutes: 630 }

todayInTimezone(settings, new Date("2030-01-06T22:30:00Z"));
// "2030-01-07"
```

`minutes` counts from midnight in that zone. `todayInTimezone` suits the lower bound of a date picker. Without `timezone` in the settings the default is `Europe/Istanbul` (`DEFAULT_TIMEZONE`). A zone name that `Intl` rejects does not throw: `zonedNow` and everything built on it quietly use the default.

## Reading the settings yourself

```ts
import { dayKeyForDate, readWeeklyHours } from "@pmwdigital/opening-hours";

dayKeyForDate("2030-01-07");
// "Monday"

readWeeklyHours({
    hours: {
        Monday: { open: "12:00", close: "15:00" },
        Tuesday: { open: "9:00", close: "17:00" },
    },
});
// { Monday: { open: "12:00", close: "15:00", closed: false } }

readWeeklyHours({});
// null
```

`readWeeklyHours` returns only the valid days, or `null` when none is valid. `dayKeyForDate` reads the weekday straight from the text, so the time zone cannot shift it.

## Exports

- `reservationSlots({ settings, date, now? })`
- `readWeeklyHours(settings)`
- `readTimezone(settings)`
- `dayKeyForDate(date)`
- `zonedNow(timezone, now?)`
- `todayInTimezone(settings, now?)`
- Constants: `OPENING_DAY_KEYS`, `RESERVATION_SLOT_MINUTES`, `LAST_SEATING_BEFORE_CLOSE_MINUTES`, `DEFAULT_TIMEZONE`
- Types: `OpeningDayKey`, `DayHours`, `WeeklyHours`, `ReservationSlots`, `ReservationSlotOptions`, `ZonedNow`

## Limits

- No holidays, one-off closures or date-specific overrides. Only the seven weekdays.
- One open and close pair per day, so no split shifts or breaks.
- The library lists slots. It does not stop anyone from booking outside them, so apply the same rule where bookings are accepted.
- Slot length and the last-seating margin cannot be changed per call.
- Slots are anchored to the opening time: opening at 12:15 gives 12:15, 12:45 and so on.
- `date` is only checked for the `YYYY-MM-DD` shape. An impossible date such as `2030-02-31` rolls over and is read as March 3, so validate dates before you pass them in.
- A misspelled time zone name falls back to the default instead of failing.
- There is no open-now helper. Build one from `zonedNow` and `readWeeklyHours`, and remember that just after midnight the hours that apply may be the previous day's.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

The tests pass fixed `Date` values and never read the clock, so they give the same result in any machine time zone.

## License

MIT
