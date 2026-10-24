import { isBackendConfigured, listReferralFriends, type ReferralFriend, type ReferralSummaryResponse } from "@/lib/api";
import { useCachedQuery } from "@/lib/cached-query";

/** Everyone who has joined with this person's code, whatever happened since. */
export function joinedCount(summary: ReferralSummaryResponse | null | undefined): number {
  if (!summary) return 0;
  return summary.pendingReferrals + summary.qualifiedReferrals + summary.expiredNoRideReferrals + summary.closedReferrals;
}

/** What a friend in the list has done: ridden with Wheelers, or not yet. */
export const friendHasRidden = (friend: ReferralFriend) => friend.status === "QUALIFIED_RIDE" || Boolean(friend.firstRideId);

/** "12 Oct": when they joined. */
export const joinedOn = (friend: ReferralFriend) =>
  new Date(friend.appliedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

/** The people who joined with your code, kept a minute like the summary. */
export function useReferralFriends() {
  return useCachedQuery<{ items: ReferralFriend[] }>({
    key: "referral.friends",
    fetcher: (accessToken) => listReferralFriends({ accessToken }),
    staleMs: 60_000,
    enabled: isBackendConfigured(),
  });
}
