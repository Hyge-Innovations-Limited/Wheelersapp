import type { KycStep } from "@/lib/kyc-steps";

/**
 * A driver's verification, kept on the phone while they are still filling it
 * in. Seven steps with photos take a while, and they leave the app to read a
 * text message on the way: without this, closing the app (or the phone
 * clearing it) sent them back to step one with nothing.
 *
 * Kept for the person who started it only, for three days, and dropped the
 * moment the application is sent. A photo the phone has since thrown away is
 * simply asked for again; everything else is still there.
 */
export const DRAFT_KEY = "wheelers.driver.onboarding-draft";
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export type DraftFields = {
  legalDetails: { legalName: string; licenceNumber: string; licenceExpiresOn: string } | null;
  phoneVerified: boolean;
  ninUri: string | null;
  licenceUri: string | null;
  licenceType: "image" | "pdf";
  selfieUri: string | null;
  selfieCheck?: "passed" | "skipped" | "unavailable" | null;
  vehiclePhotos: string[];
  vehicleInfo: { make: string; model: string; plate: string; year: number; phone: string } | null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/** What is written down: the fields, whose they are, and when. */
export function draftFrom(data: DraftFields, owner: string, now: number): string {
  return JSON.stringify({
    owner,
    savedAt: now,
    legalDetails: data.legalDetails,
    phoneVerified: data.phoneVerified,
    ninUri: data.ninUri,
    licenceUri: data.licenceUri,
    licenceType: data.licenceType,
    selfieUri: data.selfieUri,
    selfieCheck: data.selfieCheck ?? null,
    vehiclePhotos: data.vehiclePhotos,
    vehicleInfo: data.vehicleInfo,
  });
}

/** Whether there is anything in it worth keeping. */
export function draftHasProgress(data: DraftFields): boolean {
  return Boolean(
    data.ninUri || data.licenceUri || data.selfieUri || data.legalDetails || data.vehicleInfo || data.phoneVerified || data.vehiclePhotos.length,
  );
}

/**
 * What was written down, read back: null when it is someone else's, too old
 * or unreadable. `exists` says whether a photo is still on the phone.
 */
export function restoreDraft(
  raw: string | null,
  owner: string,
  now: number,
  exists: (uri: string) => boolean,
): DraftFields | null {
  if (!raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || parsed.owner !== owner) return null;
  if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > KEEP_MS || parsed.savedAt > now + 60_000) return null;

  const photo = (value: unknown): string | null => {
    const uri = text(value);
    return uri && exists(uri) ? uri : null;
  };
  const details = parsed.legalDetails as Record<string, unknown> | null | undefined;
  const car = parsed.vehicleInfo as Record<string, unknown> | null | undefined;
  const legalName = text(details?.legalName);
  const licenceNumber = text(details?.licenceNumber);
  const licenceExpiresOn = text(details?.licenceExpiresOn);
  const make = text(car?.make);
  const model = text(car?.model);
  const plate = text(car?.plate);

  return {
    legalDetails: legalName && licenceNumber && licenceExpiresOn ? { legalName, licenceNumber, licenceExpiresOn } : null,
    phoneVerified: parsed.phoneVerified === true,
    ninUri: photo(parsed.ninUri),
    licenceUri: photo(parsed.licenceUri),
    licenceType: parsed.licenceType === "pdf" ? "pdf" : "image",
    selfieUri: photo(parsed.selfieUri),
    // Only with the photo it was taken with.
    selfieCheck: photo(parsed.selfieUri) && (parsed.selfieCheck === "passed" || parsed.selfieCheck === "skipped" || parsed.selfieCheck === "unavailable") ? parsed.selfieCheck : null,
    vehiclePhotos: Array.isArray(parsed.vehiclePhotos)
      ? parsed.vehiclePhotos.map(photo).filter((uri): uri is string => uri !== null).slice(0, 10)
      : [],
    vehicleInfo:
      make && model && plate && typeof car?.year === "number"
        ? { make, model, plate, year: car.year, phone: typeof car.phone === "string" ? car.phone : "" }
        : null,
  };
}

/** The first step a draft has not finished: where "Continue" takes them. */
export function firstUnfinishedStep(data: DraftFields, steps: readonly KycStep[]): KycStep | null {
  for (const step of steps) {
    if (step === "nin" && !data.ninUri) return step;
    if (step === "licence" && !data.licenceUri) return step;
    if (step === "details" && !data.legalDetails) return step;
    if (step === "selfie" && !data.selfieUri) return step;
    if (step === "vehicle" && !data.vehicleInfo) return step;
    if (step === "phone" && !data.phoneVerified) return step;
    if (step === "vehiclePhotos" && data.vehiclePhotos.length < 7) return step;
  }
  return null;
}
