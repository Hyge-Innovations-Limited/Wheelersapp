/**
 * The verification steps, in the order a driver fills them in. A new driver
 * walks all seven; a driver sent back to fix something walks only what was
 * rejected (fix mode), and the last of those sends it.
 *
 * "details" (the name as on the licence, its number and expiry) is typed
 * right after the licence is photographed, and "phone" (a code sent to the
 * driver's number, typed back) comes after the car's details. A reviewer
 * never sends either back as a step: they are put right from Your papers,
 * so they are not part of fix mode.
 */
export type KycStep = "nin" | "licence" | "details" | "selfie" | "vehicle" | "phone" | "vehiclePhotos";

export const KYC_STEPS: readonly KycStep[] = ["nin", "licence", "details", "selfie", "vehicle", "phone", "vehiclePhotos"];

/** What a reviewer can send back. */
export const FIXABLE_STEPS: readonly KycStep[] = ["nin", "licence", "selfie", "vehicle", "vehiclePhotos"];

export const KYC_STEP_ROUTES = {
  nin: "/driver/onboarding/nin-upload",
  licence: "/driver/onboarding/licence-upload",
  details: "/driver/onboarding/your-details",
  selfie: "/driver/onboarding/face-verification",
  vehicle: "/driver/onboarding/vehicle-info",
  phone: "/driver/onboarding/verify-phone",
  vehiclePhotos: "/driver/onboarding/vehicle-photos",
} as const satisfies Record<KycStep, string>;

export const KYC_STEP_LABELS: Record<KycStep, string> = {
  nin: "NIN card",
  licence: "Driver's licence",
  details: "Your name and licence details",
  selfie: "Face check",
  vehicle: "Vehicle details",
  phone: "Your phone number",
  vehiclePhotos: "Vehicle photos",
};

export function isKycStep(value: unknown): value is KycStep {
  return typeof value === "string" && (KYC_STEPS as readonly string[]).includes(value);
}

/** What the server sent back, in step order; nothing named means everything a reviewer can send back. */
export function fixStepsFrom(rejectedFields: readonly string[] | null | undefined): KycStep[] {
  const named = new Set((rejectedFields ?? []).filter(isKycStep));
  const fixable = FIXABLE_STEPS.filter((s) => named.has(s));
  return fixable.length === 0 ? [...FIXABLE_STEPS] : fixable;
}

/** The steps this driver walks: all of them, or only those to fix. */
export function stepsToWalk(fixSteps: readonly KycStep[] | null): KycStep[] {
  return fixSteps ? KYC_STEPS.filter((s) => fixSteps.includes(s)) : [...KYC_STEPS];
}

/** The step after this one, or null when this one is the last (it sends). */
export function nextKycStep(current: KycStep, fixSteps: readonly KycStep[] | null): KycStep | null {
  const steps = stepsToWalk(fixSteps);
  const at = steps.indexOf(current);
  if (at === -1) return steps[0] ?? null;
  return steps[at + 1] ?? null;
}

/** For the header: which of how many. The welcome screen counts as step 0 of a full application. */
export function kycProgress(current: KycStep, fixSteps: readonly KycStep[] | null): { count: number; active: number } {
  const steps = stepsToWalk(fixSteps);
  const at = Math.max(0, steps.indexOf(current));
  return fixSteps ? { count: steps.length, active: at } : { count: steps.length + 1, active: at + 1 };
}
