import { toUserMessage } from "@/lib/error-messages";

/**
 * What to say when a papers request fails: the app's standard wording
 * (offline, signed out, the server having a moment, or the server's own
 * sentence when it wrote one for a driver), with one case of its own. A
 * server that has no papers yet answers "not found", which would otherwise
 * read as if the driver's paper had gone missing.
 */
export function papersError(error: unknown, fallback: string): string {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
  if (status === 404) return "Your papers are not available yet. Please try again later.";
  return toUserMessage(error, fallback);
}

/** The biggest file the server takes for a paper. Checked on the phone first, so a big one is not uploaded just to be refused. */
export const MAX_PAPER_BYTES = 10 * 1024 * 1024;
