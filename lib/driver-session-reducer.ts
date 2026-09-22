/**
 * The driver session's state machine, as pure functions.
 *
 * Everything the gateway can tell a driver — a new request, a bid answered, a
 * trip starting, ending or being cancelled — is a transition on
 * `DriverSessionState`. Keeping those transitions out of the React hook means
 * the whole bid → paid → matched flow can be exercised in a plain node test,
 * which is how the "bid card never updates after the rider pays" bug should
 * have been caught.
 */
import type { DriverActiveRide, RideEstimateWaypoint, RideRouteGeometry } from '@/lib/api';

export type DriverStatus =
  | 'offline'
  | 'online'
  | 'offered'
  | 'navigating'
  | 'arrived'
  | 'active'
  | 'completed';

export type RideOffer = {
  rideId: string;
  riderId: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops: RideEstimateWaypoint[];
  fareEstimateNgn: number;
  /**
   * What the rider is actually offering right now. A rider counter-offer only
   * moves this field — fareEstimateNgn stays at the original estimate — so a
   * screen that reads fareEstimateNgn shows a stale price forever.
   */
  riderOfferNgn?: number;
  /**
   * The lowest bid the server will accept on this trip. Without it the app
   * could only guess, and a bid under the floor was typed, sent and bounced —
   * by which time the search had often closed.
   */
  minOfferNgn?: number;
  /**
   * This driver is still carrying a passenger: they were matched because the
   * pickup is near their drop-off. The card says so, and the distances above
   * are measured from that drop-off, not from where the car is now.
   */
  afterCurrentTrip?: boolean;
  plannedDistanceKm?: number;
  plannedDurationSeconds?: number;
  /**
   * Driver→pickup at match time, from the backend. A seed for the live
   * "to pickup" card — screens recompute from the phone's own GPS when a fix
   * is available.
   */
  pickupDistanceKm?: number;
  pickupEtaSeconds?: number;
  expiresAt: string;
  /** When THIS device first saw the request — the ring window counts from here. */
  receivedAtMs?: number;
  /** The one auction clock — same instant as expiresAt, named for intent. */
  bidsCloseAt?: string;
  /** How this rider pays — a driver decides differently for cash. */
  paymentMethod?: string;
  /** The person asking: name + track record, not just coordinates. */
  riderName?: string;
  riderRating?: number;
  riderTripCount?: number;
  route?: RideRouteGeometry;
  /** Shared ride: several riders picked up and dropped along one route. */
  isGroupRide?: boolean;
  riderCount?: number;
  /** Parallel to `stops` — which waypoints are pickups vs drop-offs. */
  stopKinds?: ('pickup' | 'dropoff')[];
  /**
   * Group rides: each rider's own leg and seat offer. The driver negotiates
   * per seat — accept one rider's price, bid another — not on a lump sum.
   */
  groupMembers?: GroupSeat[];
};

export type GroupSeat = {
  rideId: string;
  riderId: string;
  pickup: RideEstimateWaypoint;
  dropoff: RideEstimateWaypoint;
  offerNgn: number;
};

export type DriverRide = {
  rideId: string;
  riderId: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops: RideEstimateWaypoint[];
  fareNgn: number;
  plannedDistanceKm?: number;
  plannedDurationSeconds?: number;
  route?: RideRouteGeometry;
  startedAt?: string;
  completedAt?: string;
  completedFareNgn?: number;
  distanceKm?: number;
  durationSeconds?: number;
  riderPaid?: boolean;
  /** WALLET or CASH — a cash fare is collected in the car, not credited. */
  paymentMethod?: string;
  riderPhone?: string;
  liveDistanceKm?: number;
};

/**
 * A bid the driver has sent, waiting on the rider. Snapshotted from the offer
 * at bid time because the offer card expires after 30s while the rider has
 * minutes to decide — by the time ride:matched arrives, the offer is usually
 * gone from the queue, and the match used to be silently dropped.
 */
export type PendingBid = {
  offer: RideOffer;
  amountNgn: number;
  sentAt: string;
  /**
   * The rider picked this bid and (on wallet rides) paid for it. Set from
   * `ride:offer_accepted`, which the gateway sends the moment the rider pays —
   * a beat before ride-service turns it into the `ride:matched` that starts
   * the trip. Without it the card kept saying "waiting for rider" over money
   * that had already moved.
   */
  acceptedAt?: string;
  agreedFareNgn?: number;
  riderPaid?: boolean;
  /** The rider came back with a different price after this bid was sent. */
  counteredAt?: string;
  /**
   * How the bid ended without winning. Terminal cards stay on screen —
   * greyed, dismissible — instead of vanishing: work should end with an
   * outcome, never with disappearance.
   */
  outcome?: 'expired' | 'lost' | 'withdrawn';
  resolvedAt?: string;
};

export type DriverSessionState = {
  status: DriverStatus;
  /**
   * Every live request, newest first. Offers used to be a single slot, so a
   * second request silently overwrote the first and the driver never knew it
   * existed — they only ever saw whichever one arrived last.
   */
  offers: RideOffer[];
  /** The offer currently open on screen. */
  currentOffer: RideOffer | null;
  currentRide: DriverRide | null;
  /** Bids sent and not yet answered, keyed by rideId. */
  pendingBids: Record<string, PendingBid>;
  /**
   * Requests that closed without the driver ever answering — expired, or
   * taken by another driver. They linger as grey cards instead of vanishing:
   * a timer running out is a UI event, not the silent death of the request.
   */
  missedOffers: MissedOffer[];
};

export type MissedOfferReason = 'expired' | 'taken';
export type MissedOffer = { offer: RideOffer; missedAt: number; reason: MissedOfferReason };
/** Missed cards are a rear-view mirror, not a backlog — keep the last few. */
export const MISSED_OFFER_CAP = 5;

export const defaultDriverSession: DriverSessionState = {
  status: 'offline',
  offers: [],
  currentOffer: null,
  currentRide: null,
  pendingBids: {},
  missedOffers: [],
};

// ── Payload parsing ────────────────────────────────────────────────────────

export function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseWaypoint(value: unknown): RideEstimateWaypoint | null {
  const record = getRecord(value);
  if (!record) return null;
  const lat = getNumber(record.lat);
  const lng = getNumber(record.lng);
  const address = getString(record.address);
  if (lat === undefined || lng === undefined || !address) return null;
  return { lat, lng, address };
}

export function parseWaypointList(value: unknown): RideEstimateWaypoint[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseWaypoint).filter((w): w is RideEstimateWaypoint => w !== null);
}

/** Drops requests whose bid window has already closed. */
export function pruneExpiredOffers(offers: RideOffer[], now: number = Date.now()): RideOffer[] {
  return offers.filter((offer) => {
    const expiresMs = new Date(offer.expiresAt).getTime();
    return !Number.isFinite(expiresMs) || expiresMs > now;
  });
}

/**
 * The siren is a doorbell, not a fire alarm: a request rings for this long,
 * then goes quiet — while the request itself stays biddable for its full
 * backend TTL (90s). Two different clocks on purpose.
 */
export const RING_WINDOW_MS = 30_000;

/**
 * How long a run-out request stays BIDDABLE after its clock ends. The
 * countdown ending is a UI event, not the death of the request: until the
 * backend says taken/closed (bid_lost / bid_timeout / cancelled), the card
 * stays in Active — greyed, but with working buttons. Only after this grace
 * does it become a tombstone.
 */
export const STALE_OFFER_LINGER_MS = 10 * 60_000;

/** Past its advertised window but not yet gone — greyed, still actionable. */
export function isOfferStale(offer: RideOffer, now: number = Date.now()): boolean {
  const expiresMs = new Date(offer.expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs <= now;
}

/** When the audible alert for this request must stop (never past its expiry). */
export function ringDeadlineMs(offer: RideOffer): number {
  const ringEnd = (offer.receivedAtMs ?? 0) + RING_WINDOW_MS;
  const expiresMs = new Date(offer.expiresAt).getTime();
  return Number.isFinite(expiresMs) ? Math.min(ringEnd, expiresMs) : ringEnd;
}

/**
 * Splits the queue into what's still live and what quietly ran out. An
 * expired request the driver never answered becomes a missed card — answered
 * ones already live on as bid cards, so they are simply dropped here.
 * Lingered-out missed cards leave at the same time. Identity-stable when
 * nothing changed.
 */
export function harvestOffers(
  prev: DriverSessionState,
  now: number,
): { offers: RideOffer[]; missedOffers: MissedOffer[] } {
  const live: RideOffer[] = [];
  const newlyMissed: MissedOffer[] = [];
  for (const offer of prev.offers) {
    const expiresMs = new Date(offer.expiresAt).getTime();
    // A stale offer stays in the queue (biddable from Active) for its whole
    // linger — only a request that outlived even that becomes a tombstone.
    if (!Number.isFinite(expiresMs) || expiresMs + STALE_OFFER_LINGER_MS > now) {
      live.push(offer);
    } else if (!prev.pendingBids[offer.rideId]) {
      newlyMissed.push({ offer, missedAt: now, reason: 'expired' });
    }
  }
  const kept = prev.missedOffers.filter((m) => now - m.missedAt < RESOLVED_BID_LINGER_MS);
  const missedOffers =
    newlyMissed.length === 0 && kept.length === prev.missedOffers.length
      ? prev.missedOffers
      : [...newlyMissed, ...kept].slice(0, MISSED_OFFER_CAP);
  return {
    offers: live.length === prev.offers.length ? prev.offers : live,
    missedOffers,
  };
}

/**
 * The driver tapped a request card — fresh, stale, or even a missed
 * tombstone. Tapping must never delete: a missed card revives into the
 * queue (still biddable) instead of being pruned out from under the tap.
 */
export function selectOfferState(prev: DriverSessionState, rideId: string): DriverSessionState {
  const queued = prev.offers.find((offer) => offer.rideId === rideId);
  const revived = queued ?? prev.missedOffers.find((m) => m.offer.rideId === rideId)?.offer;
  if (!revived) return prev;
  return {
    ...prev,
    offers: queued ? prev.offers : [...prev.offers, revived],
    missedOffers: queued
      ? prev.missedOffers
      : prev.missedOffers.filter((m) => m.offer.rideId !== rideId),
    status: prev.currentRide ? prev.status : 'offered',
    currentOffer: revived,
  };
}

/**
 * Bring a persisted market snapshot back after a reload. The session used to
 * live only in memory, so a JS reload emptied the Active tab mid-auction.
 * Live state (anything that arrived over the socket since) wins over the
 * snapshot; the normal sweep then applies every linger rule.
 */
export function rehydrateMarket(
  prev: DriverSessionState,
  snapshot: unknown,
  now: number = Date.now(),
): DriverSessionState {
  const record = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : null;
  if (!record) return prev;

  const knownRides = new Set([
    ...prev.offers.map((offer) => offer.rideId),
    ...Object.keys(prev.pendingBids),
    ...prev.missedOffers.map((m) => m.offer.rideId),
    ...(prev.currentRide ? [prev.currentRide.rideId] : []),
  ]);

  const offers = Array.isArray(record.offers)
    ? (record.offers as RideOffer[]).filter(
        (offer) => offer?.rideId && !knownRides.has(offer.rideId),
      )
    : [];
  const missedOffers = Array.isArray(record.missedOffers)
    ? (record.missedOffers as MissedOffer[]).filter(
        (m) => m?.offer?.rideId && !knownRides.has(m.offer.rideId),
      )
    : [];
  const pendingBids: Record<string, PendingBid> = {};
  if (record.pendingBids && typeof record.pendingBids === 'object') {
    for (const [rideId, bid] of Object.entries(record.pendingBids as Record<string, PendingBid>)) {
      if (!knownRides.has(rideId) && bid?.offer) pendingBids[rideId] = bid;
    }
  }
  if (offers.length === 0 && missedOffers.length === 0 && Object.keys(pendingBids).length === 0) {
    return prev;
  }

  const merged: DriverSessionState = {
    ...prev,
    offers: [...prev.offers, ...offers],
    missedOffers: [...prev.missedOffers, ...missedOffers].slice(0, MISSED_OFFER_CAP),
    pendingBids: { ...pendingBids, ...prev.pendingBids },
  };
  return pruneExpiredBids(merged, now);
}

/** Matches BID_LIFETIME_MS: a bid still open on the server comes back as an
 *  open card after a reload for as long as it would have lived locally. */
const BID_BACKFILL_WINDOW_MS = 30 * 60_000;

/**
 * Rebuild bid cards from GET /drivers/me/bids — the server's memory of what
 * this driver had on the table, for when the local one was wiped (reinstall,
 * reload, new phone). Socket truth wins; records only fill gaps.
 */
export function hydrateBidRecords(
  prev: DriverSessionState,
  records: Array<{
    rideId: string;
    riderId?: string;
    amountNgn: number;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    ride: {
      pickupAddress: string;
      destAddress: string;
      riderOfferNgn: number | null;
      agreedFareNgn: number | null;
      fareEstimateNgn: number | null;
    };
  }>,
  now: number = Date.now(),
): DriverSessionState {
  let pendingBids = prev.pendingBids;
  const TERMINAL = new Set(['EXPIRED', 'LOST', 'WITHDRAWN', 'CANCELLED']);
  for (const rec of records) {
    if (!rec?.rideId) continue;
    const local = pendingBids[rec.rideId];
    if (local) {
      // The server knows this bid ended; a local card still "waiting on
      // rider" is stale. Anything else about a known card stays as is.
      if (!local.outcome && TERMINAL.has(rec.status)) {
        if (pendingBids === prev.pendingBids) pendingBids = { ...pendingBids };
        pendingBids[rec.rideId] = {
          ...local,
          outcome: rec.status === 'LOST' ? 'lost' : rec.status === 'EXPIRED' ? 'expired' : 'withdrawn',
          resolvedAt: rec.resolvedAt ?? new Date(now).toISOString(),
        };
      }
      continue;
    }
    if (prev.currentRide?.rideId === rec.rideId) continue;
    const createdMs = Date.parse(rec.createdAt);
    if (!Number.isFinite(createdMs) || now - createdMs > BID_BACKFILL_WINDOW_MS) continue;

    const offer: RideOffer = {
      rideId: rec.rideId,
      riderId: rec.riderId ?? '',
      pickup: { lat: 0, lng: 0, address: rec.ride.pickupAddress },
      destination: { lat: 0, lng: 0, address: rec.ride.destAddress },
      stops: [],
      fareEstimateNgn: rec.ride.fareEstimateNgn ?? rec.amountNgn,
      riderOfferNgn: rec.ride.riderOfferNgn ?? undefined,
      expiresAt: new Date(createdMs + 90_000).toISOString(),
      receivedAtMs: createdMs,
    };
    let bid: PendingBid | null = null;
    if (rec.status === 'PENDING') {
      bid = { offer, amountNgn: rec.amountNgn, sentAt: rec.createdAt };
    } else if (rec.status === 'ACCEPTED') {
      bid = {
        offer,
        amountNgn: rec.amountNgn,
        sentAt: rec.createdAt,
        acceptedAt: rec.resolvedAt ?? rec.createdAt,
        agreedFareNgn: rec.ride.agreedFareNgn ?? rec.amountNgn,
      };
    } else if (TERMINAL.has(rec.status)) {
      const resolvedMs = rec.resolvedAt ? Date.parse(rec.resolvedAt) : createdMs;
      if (now - resolvedMs > RESOLVED_BID_LINGER_MS) continue;
      bid = {
        offer,
        amountNgn: rec.amountNgn,
        sentAt: rec.createdAt,
        outcome: rec.status === 'LOST' ? 'lost' : rec.status === 'EXPIRED' ? 'expired' : 'withdrawn',
        resolvedAt: rec.resolvedAt ?? rec.createdAt,
      };
    }
    if (!bid) continue;
    if (pendingBids === prev.pendingBids) pendingBids = { ...pendingBids };
    pendingBids[rec.rideId] = bid;
  }
  if (pendingBids === prev.pendingBids) return prev;
  return pruneExpiredBids({ ...prev, pendingBids }, now);
}

/** The driver read the missed card and swiped it away. */
export function dismissMissedOffer(prev: DriverSessionState, rideId: string): DriverSessionState {
  const missedOffers = prev.missedOffers.filter((m) => m.offer.rideId !== rideId);
  if (missedOffers.length === prev.missedOffers.length) return prev;
  return { ...prev, missedOffers };
}

/**
 * Where a backend ride status puts the driver in this session. Anything
 * before assignment isn't a trip yet; anything after completion is over.
 */
export function statusFromRideStatus(rideStatus: string | undefined): DriverStatus | null {
  switch (rideStatus) {
    case 'DRIVER_ASSIGNED':
    case 'DRIVER_EN_ROUTE':
      return 'navigating';
    case 'ARRIVED':
      return 'arrived';
    case 'IN_PROGRESS':
      return 'active';
    default:
      return null;
  }
}

/** Trip progress order — a sync must never move the driver backwards. */
const TRIP_STATUS_RANK: Record<DriverStatus, number> = {
  offline: 0,
  online: 1,
  offered: 2,
  navigating: 3,
  arrived: 4,
  active: 5,
  completed: 6,
};

function rideFromSnapshot(ride: DriverActiveRide): DriverRide {
  return {
    rideId: ride.rideId,
    riderId: ride.riderId,
    pickup: ride.pickup,
    destination: ride.destination,
    stops: ride.stops ?? [],
    fareNgn: ride.agreedFareNgn,
    startedAt: ride.startedAt ?? undefined,
    riderPaid: ride.riderPaid,
    riderPhone: ride.riderPhone ?? undefined,
  };
}

// ── Transitions ────────────────────────────────────────────────────────────

/**
 * A bid the driver just sent, remembered past the offer card's short life.
 * The ride also leaves the requests queue: one ride, one card — a request
 * you've answered lives on your bid card, never beside it as a duplicate.
 */
export function recordBid(
  prev: DriverSessionState,
  offer: RideOffer,
  amountNgn: number,
  sentAt: string = new Date().toISOString(),
): DriverSessionState {
  return {
    ...prev,
    offers: prev.offers.filter((queued) => queued.rideId !== offer.rideId),
    pendingBids: {
      ...prev.pendingBids,
      [offer.rideId]: { offer, amountNgn, sentAt },
    },
  };
}

/** Fallback bid lifetime when the offer carried no clock: 90s auction + grace. */
/**
 * How long an unresolved bid stays a live "waiting" card with no word from
 * the backend. A bid is money on the table until the RIDER acts — accepted,
 * chose someone else, cancelled — so this is deliberately long: it is a
 * backstop for dropped frames, not a clock the driver races.
 */
export const BID_LIFETIME_MS = 30 * 60_000;
/** An accepted-but-never-matched bid holds on longer — the resync will
 *  usually turn it into a trip; after this, it's genuinely dead. */
const ACCEPTED_BID_LIFETIME_MS = 10 * 60_000;
/** How long a resolved (expired/lost) card lingers, greyed, before leaving. */
export const RESOLVED_BID_LINGER_MS = 10 * 60_000;

/** When this bid's auction actually closes — the offer's own clock. */
export function bidDeadlineMs(bid: PendingBid): number {
  const base = new Date(bid.counteredAt ?? bid.sentAt).getTime();
  const ownLife = (Number.isFinite(base) ? base : 0) + BID_LIFETIME_MS;
  const clock = bid.offer.bidsCloseAt ?? bid.offer.expiresAt;
  const closes = new Date(clock).getTime();
  // Every bid gets AT LEAST its own lifetime from the moment it was sent.
  // A late bid on a stale request used to be born already past the offer's
  // clock — the next sweep flipped it straight to "Request ended" while the
  // rider had never even seen it. Backend truth (bid_lost / offer_accepted)
  // still resolves it earlier either way.
  if (Number.isFinite(closes)) return Math.max(closes + 15_000, ownLife);
  return ownLife;
}

/**
 * Client-side backstop for bids the backend never resolved — a dropped
 * ride:bid_timeout frame must not leave "waiting for rider" on screen
 * forever. An unresolved bid past its auction becomes a greyed 'expired'
 * card (never a silent disappearance); resolved cards leave after their
 * linger. Returns `prev` untouched when nothing changed.
 */
export function pruneExpiredBids(prev: DriverSessionState, now: number = Date.now()): DriverSessionState {
  const entries = Object.entries(prev.pendingBids);

  let changed = false;
  const next: Record<string, PendingBid> = {};
  for (const [rideId, bid] of entries) {
    if (bid.outcome) {
      const resolved = new Date(bid.resolvedAt ?? bid.sentAt).getTime();
      if (now - resolved >= RESOLVED_BID_LINGER_MS) { changed = true; continue; }
      next[rideId] = bid;
      continue;
    }
    if (bid.acceptedAt) {
      const base = new Date(bid.acceptedAt).getTime();
      if (now - base >= ACCEPTED_BID_LIFETIME_MS) { changed = true; continue; }
      next[rideId] = bid;
      continue;
    }
    if (now >= bidDeadlineMs(bid)) {
      changed = true;
      next[rideId] = { ...bid, outcome: 'expired', resolvedAt: new Date(now).toISOString() };
      continue;
    }
    next[rideId] = bid;
  }
  const base = changed ? { ...prev, pendingBids: next } : prev;

  // Same sweep also retires run-out requests into missed cards, and clears a
  // current offer that no longer exists (the request screen watches this).
  const harvested = harvestOffers(base, now);
  if (harvested.offers === base.offers && harvested.missedOffers === base.missedOffers) {
    return base;
  }
  return {
    ...base,
    offers: harvested.offers,
    missedOffers: harvested.missedOffers,
    currentOffer:
      base.currentOffer && !harvested.offers.some((o) => o.rideId === base.currentOffer?.rideId)
        ? null
        : base.currentOffer,
  };
}

/** The driver read the outcome and swiped it away. */
export function dismissBid(prev: DriverSessionState, rideId: string): DriverSessionState {
  if (!(rideId in prev.pendingBids)) return prev;
  const pendingBids = { ...prev.pendingBids };
  delete pendingBids[rideId];
  return { ...prev, pendingBids };
}

/**
 * Adopt the ride the backend says this driver is on (from
 * GET /drivers/me/rides/active). Returns `prev` untouched when the snapshot
 * describes nothing that is a live trip.
 */
export function applyActiveRideSnapshot(
  prev: DriverSessionState,
  ride: DriverActiveRide | null,
): DriverSessionState {
  if (!ride) return prev;
  const status = statusFromRideStatus(ride.rideStatus);
  if (!status) return prev;

  const sameRide = prev.currentRide?.rideId === ride.rideId;
  const nextStatus =
    sameRide && TRIP_STATUS_RANK[prev.status] > TRIP_STATUS_RANK[status] ? prev.status : status;
  const snapshot = rideFromSnapshot(ride);
  return {
    ...prev,
    status: nextStatus,
    offers: [],
    currentOffer: null,
    pendingBids: {},
    currentRide:
      sameRide && prev.currentRide
        ? {
            ...prev.currentRide,
            fareNgn: snapshot.fareNgn || prev.currentRide.fareNgn,
            riderPaid: prev.currentRide.riderPaid || snapshot.riderPaid,
            riderPhone: prev.currentRide.riderPhone ?? snapshot.riderPhone,
            startedAt: prev.currentRide.startedAt ?? snapshot.startedAt,
          }
        : snapshot,
  };
}

/**
 * Apply one gateway message. Returns the next state, or `null` when the
 * message is not a session transition (errors, chat, wallet pings) — the
 * caller handles those.
 */
export function reduceDriverSession(
  prev: DriverSessionState,
  type: string,
  payload: Record<string, unknown>,
  now: number = Date.now(),
): DriverSessionState | null {
  if (type === 'ride:offer') {
    const pickup = parseWaypoint(payload.pickup);
    const destination = parseWaypoint(payload.destination);
    if (!pickup || !destination) return prev;

    const incoming: RideOffer = {
      rideId: getString(payload.rideId) ?? '',
      riderId: getString(payload.riderId) ?? '',
      pickup,
      destination,
      stops: parseWaypointList(payload.stops),
      fareEstimateNgn: getNumber(payload.fareEstimateNgn) ?? 0,
      riderOfferNgn: getNumber(payload.riderOfferNgn),
      minOfferNgn: getNumber(payload.minOfferNgn),
      afterCurrentTrip: payload.afterCurrentTrip === true,
      plannedDistanceKm: getNumber(payload.plannedDistanceKm),
      plannedDurationSeconds: getNumber(payload.plannedDurationSeconds),
      pickupDistanceKm: getNumber(payload.pickupDistanceKm),
      pickupEtaSeconds: getNumber(payload.pickupEtaSeconds),
      expiresAt: getString(payload.expiresAt) ?? '',
      receivedAtMs: now,
      bidsCloseAt: getString(payload.bidsCloseAt),
      paymentMethod: getString(payload.paymentMethod),
      riderName: getString(payload.riderName),
      riderRating: getNumber(payload.riderRating),
      riderTripCount: getNumber(payload.riderTripCount),
      route: payload.route as RideRouteGeometry | undefined,
      isGroupRide: payload.isGroupRide === true,
      riderCount: getNumber(payload.riderCount),
      stopKinds: Array.isArray(payload.stopKinds)
        ? payload.stopKinds.filter(
            (k): k is 'pickup' | 'dropoff' => k === 'pickup' || k === 'dropoff',
          )
        : undefined,
      groupMembers:
        Array.isArray(payload.groupMembers) && payload.groupMembers.length > 0
          ? (payload.groupMembers as GroupSeat[])
          : undefined,
    };

    // A re-broadcast for a ride we've already BID on is the rider talking
    // back (usually a counter-offer). It updates the bid card — it must
    // never reappear in the requests queue as a seemingly new job.
    const existingBid = prev.pendingBids[incoming.rideId];
    if (existingBid && !existingBid.outcome) {
      const previousAsk = existingBid.offer.riderOfferNgn ?? existingBid.offer.fareEstimateNgn;
      const nextAsk = incoming.riderOfferNgn ?? incoming.fareEstimateNgn;
      const harvestedForBid = harvestOffers(prev, now);
      return {
        ...prev,
        offers: harvestedForBid.offers.filter((queued) => queued.rideId !== incoming.rideId),
        missedOffers: harvestedForBid.missedOffers,
        currentOffer:
          prev.currentOffer?.rideId === incoming.rideId ? incoming : prev.currentOffer,
        pendingBids: {
          ...prev.pendingBids,
          [incoming.rideId]: {
            ...existingBid,
            offer: incoming,
            counteredAt:
              nextAsk !== previousAsk ? new Date(now).toISOString() : existingBid.counteredAt,
          },
        },
      };
    }

    // Same rideId means a re-priced version of a request already in the
    // queue, so it replaces that entry rather than adding a duplicate.
    const harvested = harvestOffers(prev, now);
    const others = harvested.offers.filter((queued) => queued.rideId !== incoming.rideId);
    const offers = [incoming, ...others];
    // A re-broadcast revives a request that had gone missed — it's live again.
    const missedOffers = harvested.missedOffers.filter(
      (m) => m.offer.rideId !== incoming.rideId,
    );

    // Don't yank the driver off a request they're reading. Only take over
    // the screen when nothing is open, or when this update is for the very
    // request they're looking at.
    const keepsCurrent =
      prev.currentOffer !== null && prev.currentOffer.rideId !== incoming.rideId;

    return {
      ...prev,
      status: prev.currentRide ? prev.status : 'offered',
      offers,
      missedOffers,
      currentOffer: keepsCurrent ? prev.currentOffer : incoming,
    };
  }

  if (type === 'driver:accept:accepted') {
    // Bid sent — stay on the offer screen, wait for rider to accept
    return { ...prev, status: 'offered' };
  }

  if (type === 'ride:matched') {
    // Rider accepted (and paid) — now navigate to pickup. Also arrives as a
    // resync on every reconnect while a trip is assigned, in which case
    // rideStatus tells us how far along the trip already is.
    const matchedRideId = getString(payload.rideId);
    const offer =
      (matchedRideId
        ? (prev.currentOffer?.rideId === matchedRideId ? prev.currentOffer : undefined) ??
          prev.offers.find((queued) => queued.rideId === matchedRideId) ??
          prev.pendingBids[matchedRideId]?.offer
        : prev.currentOffer) ?? null;

    // The gateway ships the route with the match, so the trip can be rebuilt
    // even when the offer card is long gone (expired, app restarted mid-bid,
    // socket down when the rider paid).
    const payloadPickup = parseWaypoint(payload.pickup);
    const payloadDestination = parseWaypoint(payload.destination);

    const rideId = matchedRideId ?? offer?.rideId;
    const riderId = getString(payload.riderId) ?? offer?.riderId;
    const pickup = payloadPickup ?? offer?.pickup;
    const destination = payloadDestination ?? offer?.destination;

    if (!rideId || !riderId || !pickup || !destination) {
      console.warn('[driver-session] ride:matched for unknown ride', matchedRideId);
      return prev;
    }

    const incomingStatus = statusFromRideStatus(getString(payload.rideStatus)) ?? 'navigating';
    const sameRide = prev.currentRide?.rideId === rideId;
    // A resync never drags an in-progress trip backwards: the DB write for
    // "arrived"/"started" can trail the socket ack by a moment.
    const status =
      sameRide && TRIP_STATUS_RANK[prev.status] > TRIP_STATUS_RANK[incomingStatus]
        ? prev.status
        : incomingStatus;

    const riderPaid =
      payload.riderPaid === true ||
      prev.pendingBids[rideId]?.riderPaid === true ||
      (sameRide && prev.currentRide?.riderPaid === true);

    return {
      ...prev,
      status,
      // Taking this ride drops every other request — the driver is busy.
      offers: [],
      currentOffer: null,
      pendingBids: {},
      currentRide: {
        ...(sameRide ? prev.currentRide : null),
        rideId,
        riderId,
        pickup,
        destination,
        stops:
          Array.isArray(payload.stops) && payload.stops.length > 0
            ? parseWaypointList(payload.stops)
            : offer?.stops ?? (sameRide ? prev.currentRide?.stops : undefined) ?? [],
        fareNgn:
          getNumber(payload.agreedFareNgn) ??
          (sameRide ? prev.currentRide?.fareNgn : undefined) ??
          offer?.fareEstimateNgn ??
          0,
        plannedDistanceKm:
          offer?.plannedDistanceKm ?? (sameRide ? prev.currentRide?.plannedDistanceKm : undefined),
        plannedDurationSeconds:
          offer?.plannedDurationSeconds ??
          (sameRide ? prev.currentRide?.plannedDurationSeconds : undefined),
        route: offer?.route ?? (sameRide ? prev.currentRide?.route : undefined),
        startedAt: getString(payload.startedAt) ?? (sameRide ? prev.currentRide?.startedAt : undefined),
        riderPaid,
        paymentMethod:
          getString(payload.paymentMethod) ?? offer?.paymentMethod ?? (sameRide ? prev.currentRide?.paymentMethod : undefined),
        riderPhone: getString(payload.riderPhone) ?? (sameRide ? prev.currentRide?.riderPhone : undefined),
      },
    };
  }

  if (type === 'ride:bid_withdrawn') {
    // The server pulled this bid (driver went stale, is on another trip, or
    // the bid was rejected). The card used to say "waiting on rider" for
    // half an hour.
    const rideId = getString(payload.rideId);
    if (!rideId) return prev;
    const bid = prev.pendingBids[rideId];
    if (!bid || bid.outcome) return prev;
    return {
      ...prev,
      pendingBids: {
        ...prev.pendingBids,
        [rideId]: { ...bid, outcome: 'withdrawn', resolvedAt: new Date(now).toISOString() },
      },
    };
  }

  if (type === 'ride:offer_accepted') {
    // The rider chose this bid and paid. ride:matched follows within a beat
    // (ride-service turns the acceptance into an assignment) — but the driver
    // should see "paid" now, not "waiting", and if the match never lands the
    // card still tells the truth.
    const rideId = getString(payload.rideId);
    if (!rideId) return prev;
    const bid = prev.pendingBids[rideId];
    if (!bid) return prev;
    return {
      ...prev,
      pendingBids: {
        ...prev.pendingBids,
        [rideId]: {
          ...bid,
          acceptedAt: new Date(now).toISOString(),
          agreedFareNgn: getNumber(payload.agreedFareNgn) ?? bid.amountNgn,
          // Wallet rides are held at acceptance; anything else is paid later.
          riderPaid: getString(payload.paymentMethod) !== 'CASH',
        },
      },
    };
  }

  if (type === 'ride:bid_timeout' || type === 'ride:bid_lost') {
    // The auction ended without us — timed out, or the rider chose someone
    // else. The request leaves the queue; a bid we sent becomes a terminal
    // card that says WHY, instead of vanishing.
    const rideId = getString(payload.rideId);
    if (!rideId) return prev;
    const bid = prev.pendingBids[rideId];
    const hasOffer = prev.offers.some((queued) => queued.rideId === rideId);
    if (!bid && !hasOffer && prev.currentOffer?.rideId !== rideId) return prev;

    const pendingBids = { ...prev.pendingBids };
    if (bid && !bid.acceptedAt) {
      pendingBids[rideId] = {
        ...bid,
        outcome: type === 'ride:bid_lost' ? 'lost' : 'expired',
        resolvedAt: new Date(now).toISOString(),
      };
    }
    const offers = prev.offers.filter((queued) => queued.rideId !== rideId);
    // A request the driver never answered doesn't vanish when the auction
    // closes — it becomes a missed card saying what happened to it.
    const droppedOffer = prev.offers.find((queued) => queued.rideId === rideId);
    const missedOffers =
      droppedOffer && !bid
        ? (
            [
              {
                offer: droppedOffer,
                missedAt: now,
                reason: (type === 'ride:bid_lost' ? 'taken' : 'expired') as MissedOfferReason,
              },
              ...prev.missedOffers,
            ] satisfies MissedOffer[]
          ).slice(0, MISSED_OFFER_CAP)
        : prev.missedOffers;
    return {
      ...prev,
      offers,
      missedOffers,
      currentOffer: prev.currentOffer?.rideId === rideId ? offers[0] ?? null : prev.currentOffer,
      status: prev.currentRide
        ? prev.status
        : offers.length > 0 || prev.currentOffer?.rideId !== rideId
          ? prev.status
          : 'online',
      pendingBids,
    };
  }

  if (type === 'ride:rider_paid') {
    const rideId = getString(payload.rideId);
    if (!rideId) return prev;
    const bid = prev.pendingBids[rideId];
    const isCurrent = prev.currentRide?.rideId === rideId;
    if (!bid && !isCurrent) return prev;
    return {
      ...prev,
      pendingBids: bid ? { ...prev.pendingBids, [rideId]: { ...bid, riderPaid: true } } : prev.pendingBids,
      currentRide:
        isCurrent && prev.currentRide ? { ...prev.currentRide, riderPaid: true } : prev.currentRide,
    };
  }

  if (type === 'driver:reject:accepted') {
    const rejectedRideId = getString(payload.rideId) ?? prev.currentOffer?.rideId;
    const harvestedOnReject = harvestOffers(prev, now);
    const offers = harvestedOnReject.offers.filter(
      (queued) => queued.rideId !== rejectedRideId,
    );

    // Rejecting one request should surface the next one waiting, not dump
    // the driver back to an empty home screen.
    return {
      ...prev,
      status: prev.currentRide ? prev.status : offers.length > 0 ? 'offered' : 'online',
      offers,
      missedOffers: harvestedOnReject.missedOffers,
      currentOffer: offers[0] ?? null,
    };
  }

  if (type === 'ride:arrived:ack') {
    return { ...prev, status: 'arrived' };
  }

  if (type === 'ride:start:accepted' || type === 'ride:started') {
    return {
      ...prev,
      status: 'active',
      currentRide: prev.currentRide
        ? {
            ...prev.currentRide,
            startedAt: getString(payload.startedAt) ?? new Date(now).toISOString(),
          }
        : prev.currentRide,
    };
  }

  if (type === 'ride:end:accepted' || type === 'ride:completed') {
    return {
      ...prev,
      status: 'completed',
      currentRide: prev.currentRide
        ? {
            ...prev.currentRide,
            completedAt: getString(payload.completedAt) ?? new Date(now).toISOString(),
            completedFareNgn: getNumber(payload.fareNgn) ?? prev.currentRide.fareNgn,
            distanceKm: getNumber(payload.distanceKm),
            durationSeconds: getNumber(payload.durationSeconds),
          }
        : prev.currentRide,
    };
  }

  // ride:cancel:accepted is the gateway's ack of the driver's own cancel; the
  // broadcast ride:cancelled follows. Both mean the same thing here.
  if (type === 'ride:cancelled' || type === 'ride:cancel:accepted') {
    const cancelledRideId = getString(payload.rideId);
    // Only the cancelled ride leaves the queue; other live requests stay.
    const harvestedOnCancel = harvestOffers(prev, now);
    const offers = harvestedOnCancel.offers.filter(
      (queued) => queued.rideId !== cancelledRideId,
    );
    const missedAfterCancel = harvestedOnCancel.missedOffers.filter(
      (m) => m.offer.rideId !== cancelledRideId,
    );
    const cancelledCurrentRide = !cancelledRideId || prev.currentRide?.rideId === cancelledRideId;

    const pendingBids = { ...prev.pendingBids };
    if (cancelledRideId) delete pendingBids[cancelledRideId];

    return {
      ...prev,
      status: offers.length > 0 ? 'offered' : 'online',
      offers,
      missedOffers: missedAfterCancel,
      currentOffer:
        prev.currentOffer && prev.currentOffer.rideId !== cancelledRideId
          ? prev.currentOffer
          : offers[0] ?? null,
      currentRide: cancelledCurrentRide ? null : prev.currentRide,
      pendingBids,
    };
  }

  if (type === 'ride:gps_update') {
    if (!prev.currentRide) return prev;
    return {
      ...prev,
      currentRide: {
        ...prev.currentRide,
        liveDistanceKm: getNumber(payload.totalDistanceKm) ?? prev.currentRide.liveDistanceKm,
      },
    };
  }

  if (type === 'ride:route:updated') {
    if (!prev.currentRide) return prev;
    const destination = parseWaypoint(payload.destination);
    return {
      ...prev,
      currentRide: {
        ...prev.currentRide,
        destination: destination ?? prev.currentRide.destination,
        stops: parseWaypointList(payload.stops) ?? prev.currentRide.stops,
        plannedDistanceKm: getNumber(payload.plannedDistanceKm) ?? prev.currentRide.plannedDistanceKm,
        plannedDurationSeconds:
          getNumber(payload.plannedDurationSeconds) ?? prev.currentRide.plannedDurationSeconds,
        route: (payload.route as RideRouteGeometry | undefined) ?? prev.currentRide.route,
      },
    };
  }

  return null;
}
