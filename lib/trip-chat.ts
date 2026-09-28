import { useEffect, useRef, useState } from 'react';

/**
 * Trip chat state shared across screens: which chat is on screen (so a push
 * for it shows no banner), which one a tapped push asked to open, and what is
 * unread.
 */

type ChatLine = { id: string; rideId: string; senderRole: 'RIDER' | 'DRIVER'; createdAt: string };

let openChatRideId: string | null = null;
const seenListeners = new Set<() => void>();

/** The chat on screen right now, or null. */
export function setOpenTripChat(rideId: string | null): void {
  openChatRideId = rideId;
  seenListeners.forEach((listener) => listener());
}

export function isTripChatOpen(rideId: string | null | undefined): boolean {
  return Boolean(rideId) && openChatRideId === rideId;
}

/* ── "open this chat": from a tapped push, to whichever trip screen mounts ── */

let pendingOpen: string | null = null;
const openListeners = new Set<(rideId: string) => boolean>();

/** True when a screen showing this trip opened it; false when the caller should go to the trip first. */
export function requestOpenTripChat(rideId: string): boolean {
  pendingOpen = rideId;
  let opened = false;
  openListeners.forEach((listener) => { if (listener(rideId)) opened = true; });
  return opened;
}

/** Calls `onOpen` when a push asks for this ride's chat, now or already waiting. */
export function useTripChatOpenRequests(rideId: string | null | undefined, onOpen: () => void): void {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    if (!rideId) return;
    if (pendingOpen === rideId) {
      pendingOpen = null;
      onOpenRef.current();
    }
    const listener = (requested: string) => {
      if (requested !== rideId) return false;
      pendingOpen = null;
      onOpenRef.current();
      return true;
    };
    openListeners.add(listener);
    return () => { openListeners.delete(listener); };
  }, [rideId]);
}

/* ── unread ──────────────────────────────────────────────────────────────── */

// The newest line read, by the SERVER's clock: a phone's clock may be minutes out.
const seenAt = new Map<string, number>();

export function markTripChatSeen(rideId: string, upTo: string | undefined): void {
  const at = upTo ? new Date(upTo).getTime() : 0;
  if (!(at > (seenAt.get(rideId) ?? 0))) return;
  seenAt.set(rideId, at);
  seenListeners.forEach((listener) => listener());
}

/** Lines from the other person on this trip that arrived since the chat was last on screen. */
export function useTripChatUnread(messages: ChatLine[], rideId: string | null | undefined, myRole: 'RIDER' | 'DRIVER'): number {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    seenListeners.add(listener);
    return () => { seenListeners.delete(listener); };
  }, []);
  if (!rideId) return 0;
  if (isTripChatOpen(rideId)) return 0;
  const since = seenAt.get(rideId) ?? 0;
  return messages.filter((m) => m.rideId === rideId && m.senderRole !== myRole && new Date(m.createdAt).getTime() > since).length;
}
