import { describe, expect, it } from "vitest";
import {
    DEFAULT_TIMEZONE,
    LAST_SEATING_BEFORE_CLOSE_MINUTES,
    OPENING_DAY_KEYS,
    RESERVATION_SLOT_MINUTES,
    dayKeyForDate,
    readTimezone,
    readWeeklyHours,
    reservationSlots,
    todayInTimezone,
    zonedNow,
} from "./index.js";

const lunch = { open: "12:00", close: "15:00", closed: false };

function settingsWith(hours: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return { hours, ...extra };
}

const MONDAY = "2030-01-07";
const SUNDAY_NOON_ISTANBUL = new Date("2030-01-06T09:00:00Z");
const MONDAY_0130_ISTANBUL = new Date("2030-01-06T22:30:00Z");
const MONDAY_1310_ISTANBUL = new Date("2030-01-07T10:10:00Z");

describe("constants", () => {
    it("exposes the fixed rules", () => {
        expect(RESERVATION_SLOT_MINUTES).toBe(30);
        expect(LAST_SEATING_BEFORE_CLOSE_MINUTES).toBe(60);
        expect(DEFAULT_TIMEZONE).toBe("Europe/Istanbul");
        expect(OPENING_DAY_KEYS).toEqual([
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ]);
    });
});

describe("dayKeyForDate", () => {
    it("maps a calendar date to its weekday name", () => {
        expect(dayKeyForDate("2030-01-06")).toBe("Sunday");
        expect(dayKeyForDate(MONDAY)).toBe("Monday");
        expect(dayKeyForDate("2030-01-08")).toBe("Tuesday");
        expect(dayKeyForDate("2030-01-09")).toBe("Wednesday");
        expect(dayKeyForDate("2030-01-10")).toBe("Thursday");
        expect(dayKeyForDate("2030-01-11")).toBe("Friday");
        expect(dayKeyForDate("2030-01-12")).toBe("Saturday");
    });

    it("returns null unless the text is YYYY-MM-DD", () => {
        expect(dayKeyForDate("broken")).toBeNull();
        expect(dayKeyForDate("2030-1-7")).toBeNull();
        expect(dayKeyForDate("")).toBeNull();
    });

    it("does not range-check the parts, so an impossible date rolls over", () => {
        expect(dayKeyForDate("2030-03-03")).toBe("Sunday");
        expect(dayKeyForDate("2030-02-31")).toBe("Sunday");
    });
});

describe("readWeeklyHours", () => {
    it("keeps valid days and drops the rest", () => {
        const weekly = readWeeklyHours({
            hours: {
                Monday: lunch,
                Tuesday: { open: "9:00", close: "17:00" },
                Friday: "closed",
                Holiday: lunch,
            },
        });
        expect(weekly).toEqual({ Monday: lunch });
    });

    it("accepts a closed day without times and an open day without a closed flag", () => {
        const weekly = readWeeklyHours({
            hours: {
                Monday: { open: "12:00", close: "15:00" },
                Tuesday: { closed: true },
            },
        });
        expect(weekly).toEqual({
            Monday: { open: "12:00", close: "15:00", closed: false },
            Tuesday: { open: "", close: "", closed: true },
        });
    });

    it("accepts only strict 24-hour HH:MM", () => {
        const accepted = (open: string, close: string) =>
            readWeeklyHours({ hours: { Monday: { open, close } } }) !== null;
        expect(accepted("00:00", "23:59")).toBe(true);
        expect(accepted("24:00", "23:59")).toBe(false);
        expect(accepted("12:60", "23:59")).toBe(false);
        expect(accepted("9:00", "23:59")).toBe(false);
        expect(accepted("12:00", "noon")).toBe(false);
    });

    it("returns null when no day is valid", () => {
        expect(readWeeklyHours({ hours: { Monday: { open: "x", close: "y" } } })).toBeNull();
        expect(readWeeklyHours({ hours: {} })).toBeNull();
        expect(readWeeklyHours({ hours: [lunch] })).toBeNull();
        expect(readWeeklyHours({})).toBeNull();
        expect(readWeeklyHours(null)).toBeNull();
        expect(readWeeklyHours("Monday 12:00-15:00")).toBeNull();
    });
});

describe("readTimezone", () => {
    it("returns the trimmed zone from the settings", () => {
        expect(readTimezone({ timezone: " America/New_York " })).toBe("America/New_York");
    });

    it("falls back to the default when the zone is missing, blank or not text", () => {
        expect(readTimezone({})).toBe(DEFAULT_TIMEZONE);
        expect(readTimezone({ timezone: "   " })).toBe(DEFAULT_TIMEZONE);
        expect(readTimezone({ timezone: 3 })).toBe(DEFAULT_TIMEZONE);
        expect(readTimezone(null)).toBe(DEFAULT_TIMEZONE);
    });
});

describe("zonedNow", () => {
    it("reads the date and the minutes since midnight in the given zone", () => {
        expect(zonedNow("Europe/Istanbul", MONDAY_0130_ISTANBUL)).toEqual({ date: MONDAY, minutes: 90 });
        expect(zonedNow("UTC", MONDAY_0130_ISTANBUL)).toEqual({ date: "2030-01-06", minutes: 1350 });
        expect(zonedNow("America/New_York", new Date("2030-01-07T15:30:00Z"))).toEqual({
            date: MONDAY,
            minutes: 630,
        });
    });

    it("reports midnight as minute 0 of the new day", () => {
        expect(zonedNow("Europe/Istanbul", new Date("2030-01-06T21:00:00Z"))).toEqual({
            date: MONDAY,
            minutes: 0,
        });
    });

    it("falls back to the default zone when the name is unknown", () => {
        expect(zonedNow("Not/AZone", MONDAY_0130_ISTANBUL)).toEqual({ date: MONDAY, minutes: 90 });
    });
});

describe("todayInTimezone", () => {
    it("computes today in the zone named by the settings", () => {
        expect(todayInTimezone({ timezone: "Europe/Istanbul" }, MONDAY_0130_ISTANBUL)).toBe(MONDAY);
        expect(todayInTimezone({ timezone: "UTC" }, MONDAY_0130_ISTANBUL)).toBe("2030-01-06");
    });

    it("uses the default zone when the settings name none or an unknown one", () => {
        expect(todayInTimezone({}, MONDAY_0130_ISTANBUL)).toBe(MONDAY);
        expect(todayInTimezone({ timezone: "Not/AZone" }, MONDAY_0130_ISTANBUL)).toBe(MONDAY);
    });
});

describe("reservationSlots", () => {
    it("lists 30-minute slots from opening until the last seating", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: lunch }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: ["12:00", "12:30", "13:00", "13:30", "14:00"] });
    });

    it("anchors the slots to the opening time", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: { open: "12:15", close: "15:00", closed: false } }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: ["12:15", "12:45", "13:15", "13:45"] });
    });

    it("returns an empty list when the opening window is shorter than the last-seating margin", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: { open: "12:00", close: "12:30", closed: false } }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: [] });
    });

    it("does not invent hours when none are configured", () => {
        expect(reservationSlots({ settings: {}, date: MONDAY, now: SUNDAY_NOON_ISTANBUL })).toEqual({
            status: "not_configured",
        });
        expect(reservationSlots({ settings: null, date: MONDAY, now: SUNDAY_NOON_ISTANBUL })).toEqual({
            status: "not_configured",
        });
    });

    it("treats a weekday without hours as not configured", () => {
        const result = reservationSlots({
            settings: settingsWith({ Friday: lunch }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "not_configured" });
    });

    it("treats a malformed time or a malformed date as not configured", () => {
        const settings = settingsWith({
            Monday: lunch,
            Tuesday: { open: "24:00", close: "23:00", closed: false },
        });
        expect(reservationSlots({ settings, date: "2030-01-08", now: SUNDAY_NOON_ISTANBUL })).toEqual({
            status: "not_configured",
        });
        expect(reservationSlots({ settings, date: "broken", now: SUNDAY_NOON_ISTANBUL })).toEqual({
            status: "not_configured",
        });
    });

    it("reports a closed day as closed", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: { open: "09:00", close: "22:00", closed: true } }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "closed" });
    });

    it("drops slots that have already started, in the zone from the settings", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: lunch }, { timezone: "Europe/Istanbul" }),
            date: MONDAY,
            now: MONDAY_1310_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: ["13:30", "14:00"] });
    });

    it("drops a slot from the minute it starts", () => {
        const settings = settingsWith({ Monday: lunch });
        const oneMinuteBefore = reservationSlots({
            settings,
            date: MONDAY,
            now: new Date("2030-01-07T09:59:00Z"),
        });
        const atStart = reservationSlots({
            settings,
            date: MONDAY,
            now: new Date("2030-01-07T10:00:00Z"),
        });
        expect(oneMinuteBefore).toEqual({ status: "open", slots: ["13:00", "13:30", "14:00"] });
        expect(atStart).toEqual({ status: "open", slots: ["13:30", "14:00"] });
    });

    it("reads the same instant differently in another zone", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: lunch }, { timezone: "UTC" }),
            date: MONDAY,
            now: MONDAY_1310_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: ["12:00", "12:30", "13:00", "13:30", "14:00"] });
    });

    it("returns no slots for a past date", () => {
        const result = reservationSlots({
            settings: settingsWith({ Sunday: lunch }),
            date: "2030-01-06",
            now: new Date("2030-01-07T09:00:00Z"),
        });
        expect(result).toEqual({ status: "open", slots: [] });
    });

    it("cuts the slots at 23:30 when the venue closes after midnight", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: { open: "22:00", close: "02:00", closed: false } }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: ["22:00", "22:30", "23:00", "23:30"] });
    });

    it("reads a close at 00:00 as midnight at the end of the day", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: { open: "21:00", close: "00:00", closed: false } }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({
            status: "open",
            slots: ["21:00", "21:30", "22:00", "22:30", "23:00"],
        });
    });

    it("reads a close equal to the open time as the next day", () => {
        const result = reservationSlots({
            settings: settingsWith({ Monday: { open: "23:00", close: "23:00", closed: false } }),
            date: MONDAY,
            now: SUNDAY_NOON_ISTANBUL,
        });
        expect(result).toEqual({ status: "open", slots: ["23:00", "23:30"] });
    });
});
