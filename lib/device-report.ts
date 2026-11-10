/**
 * Which phone this person uses, for their admin profile (collected only: the app does nothing with it).
 * Sent once per app run after sign-in: Android or iOS and its version, the app's version and build, and on
 * Android the maker and model. Core React Native and an already-installed module only (OTA-safe): the
 * iPhone model needs expo-device, a store build. Never the phone's own name or any tracking id.
 * Asked first, never loaded blind (lib/biometrics.ts); a failure is silent.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import { reportDevice as postDevice } from "@/lib/api";

export type AppDeviceReport = {
  platform: string;
  osVersion: string | null;
  maker: string | null;
  model: string | null;
  appVersion: string | null;
  appBuild: string | null;
  language: string | null;
  timeZone: string | null;
};

type ApplicationModule = { nativeApplicationVersion?: string | null; nativeBuildVersion?: string | null };

export function appDeviceReport(): AppDeviceReport {
  const constants = ((Platform as unknown as { constants?: Record<string, unknown> }).constants ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  let app: ApplicationModule | null = null;
  try {
    app = requireOptionalNativeModule<ApplicationModule>("ExpoApplication");
  } catch {
    app = null;
  }
  let language: string | null = null;
  let timeZone: string | null = null;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    language = resolved.locale ?? null;
    timeZone = resolved.timeZone ?? null;
  } catch {
    /* not available on this engine */
  }
  const android = Platform.OS === "android";
  return {
    platform: Platform.OS,
    osVersion: Platform.Version === undefined || Platform.Version === null ? null : String(Platform.Version),
    maker: android ? str(constants.Manufacturer) ?? str(constants.Brand) : "Apple",
    model: android ? str(constants.Model) : null,
    appVersion: str(app?.nativeApplicationVersion),
    appBuild: str(app?.nativeBuildVersion),
    language,
    timeZone,
  };
}

let sentFor: string | null = null;

/** Who a sign-in token is for (its "sub"), only to send once per person per run: never trusted for anything. */
function tokenSubject(token: string): string {
  try {
    const part = token.split(".")[1] ?? "";
    const json = globalThis.atob ? globalThis.atob(part.replace(/-/g, "+").replace(/_/g, "/")) : "";
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : "signed-in";
  } catch {
    return "signed-in";
  }
}

/** Once per app run per signed-in person. */
export async function reportDevice(accessToken: string): Promise<void> {
  const userKey = tokenSubject(accessToken);
  if (sentFor === userKey) return;
  sentFor = userKey;
  try {
    await postDevice(accessToken, appDeviceReport());
  } catch {
    // Silent: a device report never gets in anyone's way. Try again next run.
  }
}
