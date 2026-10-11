/**
 * Days, times and trips said in words on the rider's Trips, receipt and
 * schedule screens: "Tomorrow, 7:30 am", "8 Oct, 9:05 pm", "15.5 km · 26 min",
 * and which pickup times a rider may choose.
 *
 * Everything works in the phone's own time zone and takes "now" as an
 * argument, so it can be tested.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** A scheduled pickup must be at least this far away. */
export const MIN_LEAD_MINUTES = 15;
/** Today and the next six days. */
export const SCHEDULE_DAY_COUNT = 7;
/** How many half-hour choices are offered before "Choose another time". */
export const SLOT_COUNT = 8;
/** On a later day the choices start in the morning. */
const FIRST_SLOT_LATER_DAY = 6 * 60;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from now's day to the date's day: 0 today, 1 tomorrow, -1 yesterday. */
export function dayOffset(date: Date, now: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** "7:30 am", "12:05 pm". */
export function timeWords(date: Date): string {
  return minutesWords(date.getHours() * 60 + date.getMinutes());
}

/** Minutes after midnight as a time: 450 is "7:30 am". */
export function minutesWords(minutesOfDay: number): string {
  const hour24 = Math.floor(minutesOfDay / 60) % 24;
  const minute = minutesOfDay % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "am" : "pm"}`;
}

/** "Today", "Tomorrow", "Yesterday", or "Tuesday 13 Oct". */
export function dayWords(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]!.slice(0, 3)}`;
}

/** A pickup still to come: "Tomorrow, 7:30 am", "Tuesday 13 Oct, 6:00 pm". */
export function pickupWords(date: Date, now: Date): string {
  return `${dayWords(date, now)}, ${timeWords(date)}`;
}

/** A ride already taken: "Today, 6:40 pm", "Yesterday, 6:40 pm", "8 Oct, 9:05 pm", "8 Oct 2025, 9:05 pm". */
export function pastWords(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return `Today, ${timeWords(date)}`;
  if (offset === -1) return `Yesterday, ${timeWords(date)}`;
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]!.slice(0, 3)}${year}, ${timeWords(date)}`;
}

/** The top of a receipt: "Saturday 10 October 2026 · 6:40 pm". */
export function receiptDateWords(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} · ${timeWords(date)}`;
}

/** A date from the server, or null when it is missing or unreadable. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ── choosing a pickup time ────────────────────────────────────────────── */

export type ScheduleDay = {
  /** 0 is today. */
  index: number;
  /** "Today", then "Mon", "Tue". */
  top: string;
  /** Day of the month. */
  num: number;
  /** Midnight at the start of that day. */
  start: Date;
};

export function scheduleDays(now: Date): ScheduleDay[] {
  return Array.from({ length: SCHEDULE_DAY_COUNT }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    return {
      index,
      top: index === 0 ? "Today" : WEEKDAYS[start.getDay()]!.slice(0, 3),
      num: start.getDate(),
      start,
    };
  });
}

/** The day's date at so many minutes after midnight. */
export function pickupAt(dayStart: Date, minutesOfDay: number): Date {
  return new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60,
  );
}

/** Is this pickup far enough away to be scheduled? */
export function isPickupAllowed(pickup: Date, now: Date): boolean {
  return pickup.getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60_000;
}

/**
 * The half-hour choices for a day, as minutes after midnight. Today they
 * start at the next half hour that is at least 15 minutes away; on a later
 * day they start at 6:00 am. Empty when the day has no time left.
 */
export function halfHourSlots(dayStart: Date, now: Date, count = SLOT_COUNT): number[] {
  const isToday = dayOffset(dayStart, now) === 0;
  let first = FIRST_SLOT_LATER_DAY;
  if (isToday) {
    const earliest = now.getHours() * 60 + now.getMinutes() + MIN_LEAD_MINUTES + (now.getSeconds() > 0 || now.getMilliseconds() > 0 ? 1 : 0);
    first = Math.ceil(earliest / 30) * 30;
  }
  const slots: number[] = [];
  for (let minutes = first; minutes < 24 * 60 && slots.length < count; minutes += 30) {
    if (isPickupAllowed(pickupAt(dayStart, minutes), now)) slots.push(minutes);
  }
  return slots;
}

/** Can anything still be scheduled on this day? (Its last minute is far enough away.) */
export function dayHasTime(dayStart: Date, now: Date): boolean {
  return isPickupAllowed(pickupAt(dayStart, 23 * 60 + 59), now);
}

/* ── a trip in words ───────────────────────────────────────────────────── */

/** "Yaba" for "Yaba, Lagos, Nigeria": the part of an address a rider says. */
export function shortPlace(address: string | null | undefined): string {
  const whole = (address ?? "").trim();
  const first = whole.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : whole;
}

/** "Yaba to Victoria Island". */
export function routeWords(pickupAddress: string | null | undefined, destAddress: string | null | undefined): string {
  return `${shortPlace(pickupAddress)} to ${shortPlace(destAddress)}`;
}

/** "15.5 km", or null when the distance is not known. */
export function distanceWords(distanceKm: number | null | undefined): string | null {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : (Math.round(distanceKm * 10) / 10).toString()} km`;
}

/** "26 min", "1 hr 5 min", or null when the time is not known. */
export function durationWords(durationSeconds: number | null | undefined): string | null {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} hr` : `${Math.floor(minutes / 60)} hr ${rest} min`;
}

/** "15.5 km · 26 min", either half alone, or null when neither is known. */
export function tripLengthWords(
  distanceKm: number | null | undefined,
  durationSeconds: number | null | undefined,
): string | null {
  const parts = [distanceWords(distanceKm), durationWords(durationSeconds)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Reasons the server keeps as codes, in a rider's words. */
const CANCEL_WORDS: Record<string, string> = {
  rider_cancelled: "You cancelled",
  rider_cancelled_schedule: "You cancelled",
  driver_cancelled: "Driver cancelled",
  driver_no_show: "Driver did not reach the pickup",
  driver_unavailable: "Driver became unavailable",
  driver_offline: "Driver became unavailable",
  rider_no_show: "Cancelled at the pickup",
  insufficient_funds: "Not enough money in your wallet",
  payment_failed: "Payment did not go through",
  timeout: "No driver in time",
};

function looksLikeCode(reason: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(reason) || /^[A-Z0-9_]+$/.test(reason);
}

/**
 * Why a ride was cancelled, for a rider to read. A known code becomes words;
 * an unknown code is never shown raw; anything else is already words.
 */
export function cancelWords(reason: string | null | undefined): string {
  const said = reason?.trim() ?? "";
  if (said.length === 0) return "Cancelled";
  const known = CANCEL_WORDS[said.toLowerCase()];
  if (known) return known;
  return looksLikeCode(said) ? "Cancelled" : said;
}
