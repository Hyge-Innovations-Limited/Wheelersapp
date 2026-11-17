/**
 * A group ride on the rider's trip (Timi, 17 Nov 2026; Wheelers-Backend rides/group-trip.ts riderGroupView): who else
 * is in the car and every stop in order, the rider's own marked; the others by first name and area only.
 * No React Native here (tested in __tests__/rider-group-trip.test.mjs).
 */
export type RiderGroupStop = { kind: 'pickup' | 'dropoff'; name: string; area: string; yours: boolean; done: boolean };
export type RiderGroupTrip = { others: string[]; stops: RiderGroupStop[] };

export function parseRiderGroupTrip(value: unknown): RiderGroupTrip | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { others?: unknown; stops?: unknown };
  const stops = (Array.isArray(v.stops) ? v.stops : [])
    .map((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      if (s.kind !== 'pickup' && s.kind !== 'dropoff') return null;
      return {
        kind: s.kind,
        name: typeof s.name === 'string' ? s.name : 'Rider',
        area: typeof s.area === 'string' ? s.area : '',
        yours: s.yours === true,
        done: s.done === true,
      } satisfies RiderGroupStop;
    })
    .filter((s): s is RiderGroupStop => s !== null);
  if (stops.length === 0) return undefined;
  const others = (Array.isArray(v.others) ? v.others : []).filter((n): n is string => typeof n === 'string');
  return { others, stops };
}

/** "Group ride · with Ada and Chika". */
export function groupTripTitle(group: RiderGroupTrip): string {
  return group.others.length ? `Group ride · with ${group.others.join(' and ')}` : 'Group ride';
}

/** "You get in · Ketu", "Ada gets out · Ikorodu Garage". */
export function groupStopLine(stop: RiderGroupStop): string {
  const verb = stop.kind === 'pickup' ? (stop.yours ? 'get in' : 'gets in') : stop.yours ? 'get out' : 'gets out';
  return `${stop.yours ? 'You' : stop.name} ${verb} · ${stop.area}`;
}
