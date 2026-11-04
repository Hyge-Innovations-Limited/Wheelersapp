/**
 * The server pushes a driver every piece of ride news, open app or not. With
 * the app on screen the socket has already updated it, so these come in
 * without a banner or sound; in the background or locked, the phone shows them.
 * New requests are not in the list: they keep ringing as before.
 */
export const DRIVER_NEWS_PUSH_TYPES: readonly string[] = [
  'ride:offer_updated',
  'bid_declined',
  'ride:bid_lost',
  'ride:bid_timeout',
  'ride:rider_paying',
  'ride:rider_paying_ended',
  'ride:rider_paid',
  'ride:offer_accepted',
  'ride:matched',
  'ride:cancelled',
  'ride:route:updated',
  'ride:completed',
  'wallet:updated',
];

export function quietDriverNews(type: unknown, isDriver: boolean, appState: string): boolean {
  return isDriver && appState === 'active' && typeof type === 'string' && DRIVER_NEWS_PUSH_TYPES.includes(type);
}
