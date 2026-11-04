export const OPENING_DAY_KEYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

export type OpeningDayKey = (typeof OPENING_DAY_KEYS)[number];

export const RESERVATION_SLOT_MINUTES = 30;

export const LAST_SEATING_BEFORE_CLOSE_MINUTES = 60;

export const DEFAULT_TIMEZONE = "Europe/Istanbul";

const MINUTES_PER_DAY = 24 * 60;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DayHours {
    open: string;
    close: string;
    closed: boolean;
}

export type WeeklyHours = Partial<Record<OpeningDayKey, DayHours>>;

export type ReservationSlots =
    | { status: "not_configured" }
    | { status: "closed" }
    | { status: "open"; slots: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDayHours(value: unknown): DayHours | null {
    if (!isRecord(value)) return null;
    const closed = value.closed === true;
    const open = typeof value.open === "string" ? value.open : "";
    const close = typeof value.close === "string" ? value.close : "";
    if (closed) return { open, close, closed };
    if (!HH_MM.test(open) || !HH_MM.test(close)) return null;
    return { open, close, closed };
}

export function readWeeklyHours(settings: unknown): WeeklyHours | null {
    if (!isRecord(settings) || !isRecord(settings.hours)) return null;
    const raw = settings.hours;
    const result: WeeklyHours = {};
    let found = false;
    for (const key of OPENING_DAY_KEYS) {
        const parsed = parseDayHours(raw[key]);
        if (parsed) {
            result[key] = parsed;
            found = true;
        }
    }
    return found ? result : null;
}

export function readTimezone(settings: unknown): string {
    if (isRecord(settings) && typeof settings.timezone === "string" && settings.timezone.trim()) {
        return settings.timezone.trim();
    }
    return DEFAULT_TIMEZONE;
}

export function dayKeyForDate(isoDate: string): OpeningDayKey | null {
    const match = ISO_DAY.exec(isoDate);
    if (!match) return null;
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (Number.isNaN(date.getTime())) return null;
    return OPENING_DAY_KEYS[date.getUTCDay()];
}

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

function formatMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface ZonedNow {
    date: string;
    minutes: number;
}

export function zonedNow(timezone: string, now: Date = new Date()): ZonedNow {
    const format = (zone: string) =>
        new Intl.DateTimeFormat("en-CA", {
            timeZone: zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(now);

    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = format(timezone);
    } catch {
        parts = format(DEFAULT_TIMEZONE);
    }
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "00";

    return {
        date: `${get("year")}-${get("month")}-${get("day")}`,
        minutes: Number(get("hour")) * 60 + Number(get("minute")),
    };
}

export interface ReservationSlotOptions {
    settings: unknown;
    date: string;
    now?: Date;
}

export function reservationSlots({ settings, date, now = new Date() }: ReservationSlotOptions): ReservationSlots {
    const weekly = readWeeklyHours(settings);
    const dayKey = dayKeyForDate(date);
    if (!weekly || !dayKey) return { status: "not_configured" };

    const day = weekly[dayKey];
    if (!day) return { status: "not_configured" };
    if (day.closed) return { status: "closed" };

    const open = toMinutes(day.open);
    let close = toMinutes(day.close);
    if (close <= open) close += MINUTES_PER_DAY;

    const lastSeating = Math.min(close - LAST_SEATING_BEFORE_CLOSE_MINUTES, MINUTES_PER_DAY - 1);

    const today = zonedNow(readTimezone(settings), now);
    if (date < today.date) return { status: "open", slots: [] };
    const earliest = date === today.date ? today.minutes + 1 : 0;

    const slots: string[] = [];
    for (let t = open; t <= lastSeating; t += RESERVATION_SLOT_MINUTES) {
        if (t >= earliest) slots.push(formatMinutes(t));
    }
    return { status: "open", slots };
}

export function todayInTimezone(settings: unknown, now: Date = new Date()): string {
    return zonedNow(readTimezone(settings), now).date;
}
