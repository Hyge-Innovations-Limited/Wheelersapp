/**
 * The driver's face in the avatar circle. The server picks the photo (profile
 * photo, else the KYC selfie, else none) and sends a signed https URL with a
 * stable cache key. Old servers, or the flag off, send neither: initials.
 */

export type DriverPhoto = { driverPhotoUrl?: string; driverPhotoKey?: string };
/** What a rider reads about a driver besides the face: photo fields plus the rides done. */
export type DriverProfile = DriverPhoto & { driverRidesCompleted?: number };

function httpsUrl(value: unknown): string | undefined {
  return typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim()) ? value.trim() : undefined;
}

function key(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** The photo fields of a payload, offer or driver object (null, junk or a non-https URL is no photo). */
export function photoFrom(source: unknown): DriverPhoto {
  const s = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
  const driverPhotoUrl = httpsUrl(s.driverPhotoUrl);
  if (!driverPhotoUrl) return {};
  const driverPhotoKey = key(s.driverPhotoKey);
  return driverPhotoKey ? { driverPhotoUrl, driverPhotoKey } : { driverPhotoUrl };
}

/**
 * The photo after a new message about the same driver: a new photo (URL and
 * key together) replaces the old one; a message without one keeps what the
 * screen had.
 */
export function carryPhoto(next: unknown, known: unknown): DriverPhoto {
  const fresh = photoFrom(next);
  return fresh.driverPhotoUrl ? fresh : photoFrom(known);
}

/** What the avatar draws: the photo, or initials (no photo, or it failed to load). */
export function avatarLook(uri: string | null | undefined, failedUri: string | null | undefined): 'photo' | 'initials' {
  return uri && uri !== failedUri ? 'photo' : 'initials';
}

function rides(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Photo and rides done, from a payload, offer or driver object. */
export function profileFrom(source: unknown): DriverProfile {
  const s = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
  const driverRidesCompleted = rides(s.driverRidesCompleted);
  return { ...photoFrom(source), ...(driverRidesCompleted !== undefined ? { driverRidesCompleted } : {}) };
}

/** The same driver after a new message: a message without a field keeps what the screen had. */
export function carryProfile(next: unknown, known: unknown): DriverProfile {
  const fresh = profileFrom(next);
  const old = profileFrom(known);
  return {
    ...carryPhoto(next, known),
    ...(fresh.driverRidesCompleted !== undefined
      ? { driverRidesCompleted: fresh.driverRidesCompleted }
      : old.driverRidesCompleted !== undefined
        ? { driverRidesCompleted: old.driverRidesCompleted }
        : {}),
  };
}

/** "4.8 ★ · 120 rides". No rating: "120 rides", or "New driver" at none. No count: the rating alone. Neither: nothing. */
export function reputationLine(rating: number | null | undefined, ridesCompleted: number | null | undefined): string | null {
  const stars = typeof rating === 'number' && Number.isFinite(rating) && rating > 0 ? `${rating.toFixed(1)} \u2605` : null;
  const count = typeof ridesCompleted === 'number' && Number.isInteger(ridesCompleted) && ridesCompleted >= 0 ? ridesCompleted : null;
  const done = count !== null && count > 0 ? `${count} ${count === 1 ? 'ride' : 'rides'}` : null;
  if (stars && done) return `${stars} \u00b7 ${done}`;
  if (stars) return stars;
  if (done) return done;
  return count === 0 ? 'New driver' : null;
}

/** Offer avatars stay in memory only; the booked driver's face is kept on disk. */
export function avatarCachePolicy(forOffer: boolean): 'memory' | 'disk' {
  return forOffer ? 'memory' : 'disk';
}
