/**
 * What the rider tells drivers about the trip before they bid: how many
 * people, luggage, a pet, and a short note. Set on "Set your price"; drivers
 * see it on the request card and through the trip.
 *
 * Absent (older servers, chat bookings): nothing was asked, and the driver's
 * screens show nothing new. The server cleans the note again (links and
 * phone numbers come out).
 */
export type TripDetails = {
  passengers: number;
  luggage: boolean;
  pet: boolean;
  note?: string;
};

export const TRIP_PASSENGERS_MAX = 4;
export const TRIP_NOTE_MAX = 60;

/** Luggage and pet start on Yes (Timi, 8 Nov): the rider taps No when they have none. */
export const DEFAULT_TRIP_DETAILS: TripDetails = { passengers: 1, luggage: true, pet: true };

/** At most 60 UTF-16 units, never half an emoji. */
function cutNote(text: string): string {
  let out = "";
  for (const char of text) {
    if (out.length + char.length > TRIP_NOTE_MAX) break;
    out += char;
  }
  return out;
}

/** The details as sent: whole people 1-4, a one-line note at most 60 characters, none when empty. */
export function tripDetailsOut(details: TripDetails): TripDetails {
  const note = cutNote((details.note ?? "").replace(/\s+/g, " ").trim());
  return {
    passengers: Math.min(TRIP_PASSENGERS_MAX, Math.max(1, Math.round(details.passengers) || 1)),
    luggage: details.luggage === true,
    pet: details.pet === true,
    ...(note ? { note } : {}),
  };
}

/** The details from a server payload or a route param; undefined when there are none. */
export function parseTripDetails(value: unknown): TripDetails | undefined {
  let raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.passengers !== "number" || !Number.isFinite(record.passengers)) return undefined;
  return tripDetailsOut({
    passengers: record.passengers,
    luggage: record.luggage === true,
    pet: record.pet === true,
    note: typeof record.note === "string" ? record.note : undefined,
  });
}

/** "1 person", "3 people". */
export function peopleLabel(passengers: number): string {
  return passengers === 1 ? "1 person" : `${passengers} people`;
}
