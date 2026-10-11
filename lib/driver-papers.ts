import type { DriverPaper, DriverPaperNeed, DriverPaperState } from "@/lib/api";
import { isoToWords } from "@/lib/day-input";
import { theme } from "@/theme";

/** A state as a word and a colour, the same on every papers screen. */
export const PAPER_STATE: Record<DriverPaperState, { word: string; color: string; icon: "add-circle-outline" | "time-outline" | "checkmark-circle" | "alert-circle" | "calendar-outline" }> = {
  missing: { word: "Not sent", color: theme.colors.muted, icon: "add-circle-outline" },
  waiting: { word: "Sent, being checked", color: theme.colors.orange, icon: "time-outline" },
  approved: { word: "Approved", color: theme.colors.green, icon: "checkmark-circle" },
  rejected: { word: "Sent back", color: theme.colors.danger, icon: "alert-circle" },
  expired: { word: "Expired", color: theme.colors.danger, icon: "calendar-outline" },
};

/** The line under a paper's name: where it stands, in the driver's words. */
export function paperLine(paper: DriverPaper): string {
  const doc = paper.document;
  if (!doc) return paper.hint;
  if (doc.state === "rejected") return doc.rejectionReason ? `Sent back: ${doc.rejectionReason}` : "Sent back. Send a new one.";
  if (doc.state === "expired") return `Expired ${isoToWords(doc.expiresOn)}. Send the new one.`;
  const until = doc.expiresOn ? ` · valid to ${isoToWords(doc.expiresOn)}` : "";
  if (doc.expiringSoon) {
    const left = doc.daysLeft === 0 ? "today" : doc.daysLeft === 1 ? "tomorrow" : `in ${doc.daysLeft} days`;
    return `${PAPER_STATE[doc.state].word} · expires ${left}: renew it`;
  }
  return `${PAPER_STATE[doc.state].word}${until}`;
}

/** The paper of a need that is carrying it, if any: the one a driver would look at first. */
export function leadPaper(need: DriverPaperNeed): DriverPaper | null {
  const order: DriverPaperState[] = ["approved", "waiting", "rejected", "expired"];
  for (const state of order) {
    const hit = need.papers.find((p) => p.document?.state === state);
    if (hit) return hit;
  }
  return null;
}

/** Still to do for this need: nothing good has been sent for it. */
export function needsAction(need: DriverPaperNeed): boolean {
  return need.state === "missing" || need.state === "rejected" || need.state === "expired";
}
