import { apiRequest } from '@/lib/api';
import type { FeedFilter, FeedPage, FeedPost, StationsResponse } from '@/lib/feed';

/** The drivers' Feed and CNG Stations (Wheelers-Backend http/feed.route.ts). */

export function getFeed(accessToken: string | null, filter: FeedFilter, cursor: string | null): Promise<FeedPage> {
  const q = new URLSearchParams({ filter, ...(cursor ? { cursor } : {}) });
  return apiRequest<FeedPage>('GET', `/drivers/feed?${q.toString()}`, { accessToken: accessToken ?? undefined, fallbackError: "Couldn't load the Feed." });
}

export function getMyPosts(accessToken: string | null, cursor: string | null): Promise<FeedPage> {
  return apiRequest<FeedPage>('GET', `/drivers/feed/mine${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { accessToken: accessToken ?? undefined, fallbackError: "Couldn't load your posts." });
}

/** `photos`: base64 JPEG or PNG, up to 4. The post waits for an admin. */
export function createPost(accessToken: string | null, input: { text: string; roadAlert: boolean; photos: string[] }): Promise<{ post: FeedPost }> {
  return apiRequest<{ post: FeedPost }>('POST', '/drivers/feed', { accessToken: accessToken ?? undefined, body: input, fallbackError: "Your post didn't send. Try again." });
}

export function deletePost(accessToken: string | null, id: string): Promise<{ deleted: true }> {
  return apiRequest('DELETE', `/drivers/feed/${id}`, { accessToken: accessToken ?? undefined, fallbackError: "Couldn't delete it. Try again." });
}

export function setLike(accessToken: string | null, id: string, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  return apiRequest(liked ? 'POST' : 'DELETE', `/drivers/feed/${id}/like`, { accessToken: accessToken ?? undefined, fallbackError: "Couldn't like that. Try again." });
}

export function reportPost(accessToken: string | null, id: string, reason?: string): Promise<{ reported: true }> {
  return apiRequest('POST', `/drivers/feed/${id}/report`, { accessToken: accessToken ?? undefined, body: reason ? { reason } : {}, fallbackError: "Couldn't report it. Try again." });
}

export function hideDriver(accessToken: string | null, driverId: string): Promise<{ hidden: true }> {
  return apiRequest('POST', '/drivers/feed/hide', { accessToken: accessToken ?? undefined, body: { driverId }, fallbackError: "Couldn't hide those posts. Try again." });
}

export function getStations(accessToken: string | null, at: { lat: number; lng: number } | null): Promise<StationsResponse> {
  const q = at ? `?lat=${at.lat.toFixed(5)}&lng=${at.lng.toFixed(5)}` : '';
  return apiRequest<StationsResponse>('GET', `/drivers/stations${q}`, { accessToken: accessToken ?? undefined, fallbackError: "Couldn't load stations." });
}

/** Set after a post is sent or deleted elsewhere: the Feed reloads when it is next shown. */
let feedChanged = false;
export const markFeedChanged = () => { feedChanged = true; };
export const takeFeedChanged = () => { const was = feedChanged; feedChanged = false; return was; };
