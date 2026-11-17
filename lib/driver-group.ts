/**
 * A group trip on the driver's side (Timi, 17 Nov 2026; Wheelers-Backend rides/group-trip.ts): the driver drives one
 * trip through every rider's stops in order; each rider's seat is arrived, started (their own code) and dropped on its
 * own. The server sends the trip's `group` in the ride snapshot; this reads it and says what is next.
 * No React Native here (tested in __tests__/driver-group.test.mjs).
 */
import { parseWaiting, waitingStage, type WaitingInfo } from '@/lib/waiting';

export type GroupSeatStatus = 'DRIVER_ASSIGNED' | 'DRIVER_EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | string;

export type DriverGroupSeat = {
  rideId: string;
  riderId: string;
  riderName: string;
  riderPhone: string | null;
  status: GroupSeatStatus;
  seatPriceNgn: number;
  pickup: string;
  dropoff: string;
  tripCodeRequired: boolean;
  waiting?: WaitingInfo;
  /** What the driver got for this seat (its drop-off: fare less fees, plus waiting paid). */
  earnedNgn?: number;
};

export type DriverGroupStop = { rideId: string; kind: 'pickup' | 'dropoff'; address: string; lat: number; lng: number; done: boolean };

export type DriverGroupTrip = { seats: DriverGroupSeat[]; stops: DriverGroupStop[] };

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const placeText = (v: unknown): string => {
  const p = v as { address?: unknown } | null;
  return typeof p?.address === 'string' ? p.address : '';
};

/** The snapshot's `group`; undefined for any other ride. */
export function parseDriverGroup(value: unknown, receivedAt: number = Date.now()): DriverGroupTrip | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const seats = (Array.isArray(v.seats) ? v.seats : [])
    .map((raw) => {
      const s = raw as Record<string, unknown>;
      const rideId = str(s.rideId);
      const riderId = str(s.riderId);
      if (!rideId || !riderId) return null;
      const waiting = parseWaiting(s.waiting, receivedAt);
      return {
        rideId,
        riderId,
        riderName: str(s.riderName) ?? 'Rider',
        riderPhone: str(s.riderPhone),
        status: str(s.status) ?? 'DRIVER_ASSIGNED',
        seatPriceNgn: num(s.seatPriceNgn) ?? 0,
        pickup: placeText(s.pickup),
        dropoff: placeText(s.dropoff),
        tripCodeRequired: s.tripCodeRequired === true,
        ...(waiting ? { waiting } : {}),
      } satisfies DriverGroupSeat;
    })
    .filter((s): s is DriverGroupSeat => s !== null);
  const stops = (Array.isArray(v.stops) ? v.stops : [])
    .map((raw) => {
      const s = raw as Record<string, unknown>;
      const rideId = str(s.rideId);
      const kind = s.kind === 'pickup' || s.kind === 'dropoff' ? s.kind : null;
      const lat = num(s.lat);
      const lng = num(s.lng);
      if (!rideId || !kind || lat === null || lng === null) return null;
      return { rideId, kind, address: str(s.address) ?? '', lat, lng, done: s.done === true } satisfies DriverGroupStop;
    })
    .filter((s): s is DriverGroupStop => s !== null);
  if (seats.length === 0 || stops.length === 0) return undefined;
  return { seats, stops };
}

export function seatOf(group: DriverGroupTrip, rideId: string): DriverGroupSeat | undefined {
  return group.seats.find((s) => s.rideId === rideId);
}

const SEAT_RANK: Record<string, number> = { DRIVER_ASSIGNED: 0, DRIVER_EN_ROUTE: 1, ARRIVED: 2, IN_PROGRESS: 3, COMPLETED: 4, CANCELLED: 4 };
const rankOf = (status: string) => SEAT_RANK[status] ?? 0;
// A status this app does not know (a seat that left the trip some other way) is treated as gone, never as a stop
// with no button on it.
const seatGone = (seat: DriverGroupSeat) => seat.status === 'COMPLETED' || seat.status === 'CANCELLED' || !(seat.status in SEAT_RANK);

/** A stop behind the driver: the server says so, or its seat has moved past it (picked up, dropped, gone). */
export function stopDone(stop: DriverGroupStop, seat: DriverGroupSeat | undefined): boolean {
  if (stop.done || !seat || seatGone(seat)) return true;
  return stop.kind === 'pickup' && seat.status === 'IN_PROGRESS';
}

/** The next stop not yet behind the driver, with its seat; null when every stop is done. */
export function nextGroupStop(group: DriverGroupTrip): { stop: DriverGroupStop; seat: DriverGroupSeat } | null {
  for (const stop of group.stops) {
    const seat = seatOf(group, stop.rideId);
    if (!seat || stopDone(stop, seat)) continue;
    return { stop, seat };
  }
  return null;
}

/** One seat changed (an ack, the server's word): never moved backwards. */
export function updateSeat(group: DriverGroupTrip, rideId: string, patch: Partial<DriverGroupSeat>): DriverGroupTrip {
  let changed = false;
  const seats = group.seats.map((seat) => {
    if (seat.rideId !== rideId) return seat;
    const status = patch.status && rankOf(patch.status) >= rankOf(seat.status) ? patch.status : seat.status;
    changed = true;
    return { ...seat, ...patch, status };
  });
  return changed ? { ...group, seats } : group;
}

/**
 * A fresh snapshot over what this phone knew: the server's seats and stops, but a seat this phone already saw move on
 * (an ack before ride-service wrote the row) stays where it got to, with what it earned.
 */
export function mergeGroup(prev: DriverGroupTrip | undefined, next: DriverGroupTrip | undefined): DriverGroupTrip | undefined {
  if (!next) return prev;
  if (!prev) return next;
  return {
    stops: next.stops,
    seats: next.seats.map((seat) => {
      const known = seatOf(prev, seat.rideId);
      if (!known) return seat;
      return {
        ...seat,
        status: rankOf(known.status) > rankOf(seat.status) ? known.status : seat.status,
        waiting: seat.waiting ?? known.waiting,
        ...(known.earnedNgn != null ? { earnedNgn: known.earnedNgn } : {}),
      };
    }),
  };
}

/** Riders dropped and what the driver got for them. */
export function groupEarnings(group: DriverGroupTrip): { dropped: number; earnedNgn: number } {
  const dropped = group.seats.filter((s) => s.status === 'COMPLETED');
  return { dropped: dropped.length, earnedNgn: dropped.reduce((sum, s) => sum + (s.earnedNgn ?? 0), 0) };
}

/** What the driver can do at a stop now. */
export type GroupStopAction = 'arrive' | 'code' | 'drop' | 'none';
export function actionAt(stop: DriverGroupStop, seat: DriverGroupSeat): GroupStopAction {
  if (stop.kind === 'pickup') {
    if (seat.status === 'ARRIVED') return 'code';
    if (seat.status === 'DRIVER_ASSIGNED' || seat.status === 'DRIVER_EN_ROUTE') return 'arrive';
    return 'none';
  }
  return seat.status === 'IN_PROGRESS' ? 'drop' : 'none';
}

/**
 * "Continue without them": at an arrived pickup, after the free minutes, and only when the rider has not agreed a
 * waiting price (then they are paying for the wait). The server checks it again.
 */
/** A rider who agreed a waiting price and still has not come: the driver may go on without them after this. */
export const SKIP_AFTER_AGREED_MS = 10 * 60 * 1000;

export function canContinueWithout(seat: DriverGroupSeat, phoneNow: number = Date.now()): boolean {
  if (seat.status !== 'ARRIVED' || !seat.waiting) return false;
  if (seat.waiting.deal?.rateNgn != null) {
    const agreedAt = seat.waiting.deal.agreedAtMs;
    return agreedAt != null && phoneNow + seat.waiting.skewMs - agreedAt >= SKIP_AFTER_AGREED_MS;
  }
  return waitingStage(seat.waiting, phoneNow) !== 'free';
}

/** What the driver earned for a finished group trip: the server's total, else every dropped seat's own; else unknown. */
export function groupEarnedNgn(group: DriverGroupTrip, serverTotal?: number): number | null {
  if (serverTotal !== undefined) return serverTotal;
  const dropped = group.seats.filter((s) => s.status === 'COMPLETED');
  if (dropped.length === 0 || dropped.some((s) => s.earnedNgn == null)) return null;
  return dropped.reduce((sum, s) => sum + (s.earnedNgn ?? 0), 0);
}

/** "Yaba" from "Yaba, Lagos". */
export const shortPlace = (address: string) => address.split(',')[0]?.trim() ?? address;
