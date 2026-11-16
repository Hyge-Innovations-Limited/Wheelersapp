import { apiRequest } from '@/lib/api';
import { parseWaiting, type WaitingInfo } from '@/lib/waiting';

/**
 * The waiting price (Timi, 16 Nov 2026): POST /rides/:rideId/waiting, for the
 * rider and the driver alike. `offer` puts a price a minute on the table (the
 * driver only to answer the rider's); `accept` takes the other side's, exactly
 * that price. Answers the ride's waiting block after it. A refusal throws with
 * the server's own words ("That price has changed.").
 */
export async function sendWaitingDeal(
  accessToken: string | null,
  rideId: string,
  action: 'offer' | 'accept',
  ngn: number,
): Promise<WaitingInfo | undefined> {
  const answer = await apiRequest<{ waiting?: unknown }>('POST', `/rides/${encodeURIComponent(rideId)}/waiting`, {
    accessToken: accessToken ?? undefined,
    body: { action, ngn },
    fallbackError: 'Could not send that. Try again.',
  });
  return parseWaiting(answer.waiting);
}
