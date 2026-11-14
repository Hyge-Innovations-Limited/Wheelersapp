/**
 * The drivers' Feed and CNG Stations (Timi, 14 Nov 2026): the shapes the
 * server sends (Wheelers-Backend apps/api-gateway/src/http/feed.route.ts) and
 * the small rules the screens share. No React Native here, so it is tested
 * in plain Node (__tests__/feed.test.mjs).
 */

export type FeedFilter = 'all' | 'alerts' | 'wheelers';

export type FeedPhoto = { url: string; width: number; height: number };

export type FeedPost = {
  id: string;
  kind: 'driver' | 'road_alert' | 'wheelers';
  text: string;
  photos: FeedPhoto[];
  author: { name: string; initials: string; driverId: string | null };
  mine: boolean;
  liked: boolean;
  likeCount: number;
  /** waiting: only the author sees it, until an admin approves it. */
  status: 'waiting' | 'live' | 'rejected';
  rejectionReason: string | null;
  pinned: boolean;
  at: string;
};

export type FeedPage = { posts: FeedPost[]; nextCursor: string | null; canPost?: boolean };

export type CngStation = {
  id: string;
  name: string;
  brand: string;
  area: string;
  address: string | null;
  lat: number;
  lng: number;
  /** exact: the pin is on the station; area: the middle of its area. */
  pin: 'exact' | 'area';
  hours: string | null;
  /** false: listed somewhere, not sure it sells CNG to cars. */
  confirmed: boolean;
  km: number | null;
  minutes: number | null;
};

export type StationsResponse = { located: boolean; inLagos: boolean; stations: CngStation[] };

export const FEED_TEXT_MAX = 280;
export const FEED_PHOTOS_MAX = 4;

/** Characters as a person counts them (an emoji is one). */
export const charCount = (text: string) => [...text].length;

/** "now", "4 min", "3 h", "2 d", then the date ("12 Oct"). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d`;
  const d = new Date(at);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** A next page added under the posts already shown; a post already there is not shown twice. */
export function appendPage(shown: FeedPost[], next: FeedPost[]): FeedPost[] {
  const seen = new Set(shown.map((p) => p.id));
  return [...shown, ...next.filter((p) => !seen.has(p.id))];
}

/** A like or unlike shown at once (before the server answers). */
export function withLike(posts: FeedPost[], id: string, liked: boolean): FeedPost[] {
  return posts.map((p) => (p.id !== id || p.liked === liked ? p : { ...p, liked, likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)) }));
}

/** The server's count wins once it answers. */
export function withLikeCount(posts: FeedPost[], id: string, liked: boolean, likeCount: number): FeedPost[] {
  return posts.map((p) => (p.id === id ? { ...p, liked, likeCount } : p));
}

/** "1.2 km · 5 min", or the area when the phone's position is not known. */
export function stationDistance(s: Pick<CngStation, 'km' | 'minutes' | 'area'>): string {
  if (s.km === null || s.minutes === null) return s.area;
  return `${s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km · ${s.minutes} min`;
}

/** A Directions link: Google Maps on Android, Apple Maps on iPhone. */
export function directionsUrl(s: Pick<CngStation, 'lat' | 'lng' | 'name'>, platform: 'ios' | 'android' | string): string {
  const q = encodeURIComponent(s.name);
  return platform === 'ios'
    ? `http://maps.apple.com/?daddr=${s.lat},${s.lng}&q=${q}`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
}

/** The photo's height when shown `width` wide, kept between square-ish and not too tall. */
export function photoHeight(photo: Pick<FeedPhoto, 'width' | 'height'>, width: number): number {
  if (!(photo.width > 0) || !(photo.height > 0)) return Math.round(width * 0.6);
  const ratio = Math.min(1.25, Math.max(0.5, photo.height / photo.width));
  return Math.round(width * ratio);
}
