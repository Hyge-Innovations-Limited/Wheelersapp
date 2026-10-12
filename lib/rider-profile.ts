import { getCurrentProfile, isBackendConfigured, type BackendUser } from "@/lib/api";
import { invalidateCached, useCachedQuery } from "@/lib/cached-query";

/**
 * Who is signed in: name, phone, email. It changes only when the rider edits
 * it, so the copy on the phone is shown at once (also after the app was
 * closed) and fetched again quietly when it is ten minutes old, when the
 * rider pulls to refresh, or right after they change it.
 */
const KEY = "rider.profile";

export function useRiderProfile(): {
  user: BackendUser | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const query = useCachedQuery<{ user: BackendUser }>({
    key: KEY,
    fetcher: (accessToken) => getCurrentProfile({ accessToken }),
    staleMs: 10 * 60_000,
    enabled: isBackendConfigured(),
  });
  return { user: query.data?.user ?? null, refreshing: query.refreshing, refresh: query.refresh };
}

/** The rider's details were just changed: every screen showing them fetches again. */
export function riderProfileChanged(): void {
  invalidateCached(KEY);
}
