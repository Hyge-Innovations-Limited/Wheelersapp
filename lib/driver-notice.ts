import { useSyncExternalStore } from 'react';
import type { DriverSessionState } from '@/lib/driver-session-reducer';

/**
 * A short line at the top of the driver's screen that goes by itself, e.g.
 * "Rider cancelled · Akoka" when a request or bid leaves the screen because
 * the rider cancelled the search. The card goes; this says why.
 */
export type DriverNotice = { id: number; text: string };

let current: DriverNotice | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

export function showDriverNotice(text: string): void {
  current = { id: nextId++, text };
  changed();
}

/** Clears the notice, unless a newer one has replaced it. */
export function clearDriverNotice(id: number): void {
  if (current?.id !== id) return;
  current = null;
  changed();
}

function getNotice(): DriverNotice | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDriverNotice(): DriverNotice | null {
  return useSyncExternalStore(subscribe, getNotice, getNotice);
}

/**
 * "Rider cancelled · <pickup>" when this message ends, because the rider
 * cancelled, a request or bid the driver still had on screen; otherwise null.
 */
export function riderCancelledNotice(
  prev: DriverSessionState,
  type: string,
  payload: Record<string, unknown>,
): string | null {
  const rideId = typeof payload.rideId === 'string' ? payload.rideId : null;
  if (!rideId) return null;
  const riderCancelled =
    ((type === 'ride:bid_timeout' || type === 'ride:bid_lost') && payload.reason === 'rider_cancelled') ||
    (type === 'ride:rider_paying_ended' && payload.reason === 'cancelled');
  if (!riderCancelled) return null;
  const bid = prev.pendingBids[rideId];
  const offer =
    (bid && !bid.acceptedAt && !bid.outcome ? bid.offer : undefined) ??
    prev.offers.find((queued) => queued.rideId === rideId) ??
    (prev.currentOffer?.rideId === rideId ? prev.currentOffer : undefined);
  if (!offer) return null;
  return `Rider cancelled · ${offer.pickup.address}`;
}
