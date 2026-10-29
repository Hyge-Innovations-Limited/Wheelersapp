import Constants from "expo-constants";
import { targetAuthRole } from "@/lib/app-variant";

function getExpoDevServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri === "string" && hostUri.trim().length > 0) {
    return hostUri.split(":")[0] ?? null;
  }

  const debuggerHost = Constants.expoGoConfig?.debuggerHost;
  if (typeof debuggerHost === "string" && debuggerHost.trim().length > 0) {
    return debuggerHost.split(":")[0] ?? null;
  }

  return null;
}

function resolveApiBaseUrl(rawValue: string | undefined): string | null {
  const normalized = rawValue?.trim().replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    const isLoopbackHost =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "::1";

    if (!isLoopbackHost) {
      return url.toString().replace(/\/+$/, "");
    }

    const expoHost = getExpoDevServerHost();
    if (!expoHost) {
      return url.toString().replace(/\/+$/, "");
    }

    url.hostname = expoHost;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

const apiBaseUrl = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

/**
 * What a rider sees when the app cannot reach the backend.
 *
 * This used to recite the configured base URL and advise using a LAN IP rather
 * than 127.0.0.1 — genuinely useful to whoever is running the dev server, and
 * meaningless to everyone else. The diagnostics now go to the console, where
 * the person who needs them is actually looking.
 */
function buildConnectivityErrorMessage(): string {
  if (__DEV__) {
    const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
    console.warn("[api] could not reach the backend", {
      configuredUrl: configuredUrl ?? "(unset)",
      resolvedUrl: apiBaseUrl ?? "(unresolved)",
      hint: "On a physical device use your LAN IP or Expo dev host, not 127.0.0.1/localhost.",
    });
  }

  return "You appear to be offline. Check your connection and try again.";
}

export type BackendRole = "RIDER" | "DRIVER" | "BOTH";

export interface BackendUser {
  id: string;
  username: string | null;
  email: string | null;
  role: BackendRole;
  name: string | null;
  phone: string | null;
}

interface UsernamePasswordAuthResponse {
  created?: boolean;
  accessToken: string;
  tokenType: "Bearer";
  user: BackendUser;
}

interface CurrentProfileResponse {
  user: BackendUser;
}

export interface ReferralSummaryResponse {
  /** The code this person created; null until they have. */
  code: string | null;
  availableCashbackNgn: number;
  frozenCashbackNgn: number;
  reservedCashbackNgn?: number;
  usedCashbackNgn: number;
  pendingReferrals: number;
  qualifiedReferrals: number;
  expiredNoRideReferrals: number;
  closedReferrals: number;
  /** Opens a chat with the Wheelers bot with the code already typed: what the QR code holds. Absent on older servers. */
  shareLink?: string | null;
  shareMessage?: string | null;
  /** Someone else's code is already on this account (one per person). Absent on older servers. */
  hasAppliedCode?: boolean;
}

export interface ApplyReferralCodeResponse {
  referral: {
    id: string;
    referrerId: string;
    status: string;
    appliedAt: string;
    expiresAt: string;
    closesAt: string;
  };
  unlockedCashback: {
    id: string;
    amountNgn: number;
  } | null;
}





export interface RideEstimateWaypoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RideMapCoordinate {
  lat: number;
  lng: number;
}

export interface RideRouteBounds {
  northEast: RideMapCoordinate;
  southWest: RideMapCoordinate;
}

export interface RideRouteGeometry {
  coordinates: RideMapCoordinate[];
  bounds: RideRouteBounds;
}

export interface RideRouteSnapshot {
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops: RideEstimateWaypoint[];
  route: RideRouteGeometry;
}

export interface RideEstimateResponse {
  plannedDistanceKm: number;
  plannedDurationSeconds: number;
  fareEstimateNgn: number;
  /** The lowest offer the server takes on this trip (the fare at 90% of the recommended rate). */
  minOfferNgn?: number | null;
  /** Why the price is up right now ("Busy in this area", +₦1,200). Older servers leave it out. */
  priceReason?: { label: string; extraNgn: number } | null;
  pickup?: RideEstimateWaypoint;
  destination?: RideEstimateWaypoint;
  stops?: RideEstimateWaypoint[];
  route?: RideRouteGeometry;
}

const RIDE_ESTIMATE_CACHE_TTL_MS = 20 * 1000;
const rideEstimateCache = new Map<
  string,
  { value: RideEstimateResponse; cachedAt: number }
>();
const rideEstimateInflight = new Map<string, Promise<RideEstimateResponse>>();

function buildRideEstimateCacheKey(input: {
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops?: RideEstimateWaypoint[];
}): string {
  const serializeWaypoint = (waypoint: RideEstimateWaypoint): string =>
    [
      waypoint.lat.toFixed(6),
      waypoint.lng.toFixed(6),
      waypoint.address.trim().toLowerCase(),
    ].join("|");

  return JSON.stringify({
    pickup: serializeWaypoint(input.pickup),
    destination: serializeWaypoint(input.destination),
    stops: (input.stops ?? []).map(serializeWaypoint),
  });
}

export interface RiderHistoryRide {
  id: string;
  tripId?: string | null;
  status: "COMPLETED" | "CANCELLED";
  pickupAddress: string;
  destAddress: string;
  fareEstimateNgn: number | null;
  fareFinalNgn: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  cancelReason: string | null;
  cancelStage: string | null;
  matchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

interface RiderHistoryResponse {
  items: RiderHistoryRide[];
  nextCursor: string | null;
}

export interface ScheduledRide {
  id: string;
  status: "SCHEDULED" | "DISPATCHING" | "DISPATCHED" | "CANCELLED" | "EXPIRED";
  scheduledFor: string;
  paymentMethod: "wallet_balance";
  pickupAddress: string;
  destAddress: string;
  plannedDistanceKm: number | null;
  plannedDurationSeconds: number | null;
  fareEstimateNgn: number | null;
  requestedRideId: string | null;
  createdAt: string;
}

interface ScheduledRideListResponse {
  items: ScheduledRide[];
  nextCursor: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  referenceId: string | null;
  referenceType: string | null;
  read: boolean;
  createdAt: string;
}

export interface GroupRideFaceVerificationSummary {
  id: string;
  uploadStatus: "UPLOADING" | "STORED" | "FAILED";
  mimeType: string;
  sizeBytes: number | null;
  capturedAt: string | null;
  storedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}

export type GroupRideGenderPreference = "any" | "women_only" | "men_only";

export interface GroupRideMatchRequest {
  id: string;
  userId: string;
  status:
    | "PENDING_FACE_UPLOAD"
    | "READY_FOR_MATCH"
    | "MATCHING"
    | "GROUPED"
    | "BOOKED"
    | "EXPIRED"
    | "CANCELLED";
  groupId: string | null;
  matchedRideIds: string[];
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops: RideEstimateWaypoint[];
  plannedDistanceKm: number | null;
  plannedDurationSeconds: number | null;
  fareEstimateNgn: number | null;
  genderPreference: GroupRideGenderPreference;
  paymentMethod: "wallet_balance";
  readyForMatchAt: string | null;
  matchingStartedAt: string | null;
  groupedAt: string | null;
  bookedAt: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  faceVerification: GroupRideFaceVerificationSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupRideMatchedRider {
  rideId: string;
  userId: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  pickupAddress: string;
  destinationAddress: string;
  status: GroupRideMatchRequest["status"];
}

export interface GroupRideFaceUploadDescriptor {
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  mimeType: string;
}

export interface WalletOverviewResponse {
  walletId: string;
  balanceNgn: number;
  lockedNgn: number;
  updatedAt: string;
  /** Wheelers' fee on every withdrawal, taken from the amount. Absent on servers older than the fee. */
  withdrawalFeeNgn?: number;
  /** The least that can be withdrawn, fee included. */
  minWithdrawalNgn?: number;
  /** Where the last withdrawal went: the account a new one goes to unless changed. Older servers leave it out. */
  payoutAccount?: SavedPayoutAccount | null;
}

export interface SavedPayoutAccount {
  networkId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  lastUsedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: string;
  direction: "CREDIT" | "DEBIT";
  amountNgn: number;
  balanceAfterNgn: number;
  referenceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WalletTransactionsResponse {
  items: WalletTransaction[];
  nextCursor: string | null;
}

export interface WalletWithdrawal {
  id: string;
  status: string;
  /** What left the wallet. */
  amountNgn: number;
  /** Wheelers' withdrawal fee, and what the bank receives. */
  feeNgn?: number;
  payoutNgn?: number;
  bankAccount: {
    accountNumber: string;
    accountName: string | null;
    networkId: string;
  };
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
  failedAt: string | null;
}

export interface CreateWalletWithdrawalResponse {
  withdrawal: WalletWithdrawal | null;
}

export interface WithdrawalBankNetwork {
  id: string;
  uuid?: string;
  name: string;
  code: string | null;
  country: string | null;
  accountNumberType: string | null;
  type: string | null;
}

export interface WithdrawalBankNetworksResponse {
  country: string;
  items: WithdrawalBankNetwork[];
}

export interface VerifyWithdrawalBankAccountResponse {
  bankAccount: {
    accountNumber: string;
    accountName: string | null;
    bankName: string | null;
    networkId: string;
  };
  verificationSessionId: string | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseRideEstimateWaypoint(value: unknown): RideEstimateWaypoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    !isFiniteNumber(record.lat) ||
    !isFiniteNumber(record.lng) ||
    typeof record.address !== "string" ||
    record.address.trim().length === 0
  ) {
    return null;
  }

  return {
    lat: record.lat,
    lng: record.lng,
    address: record.address,
  };
}

export function parseRideRouteGeometry(value: unknown): RideRouteGeometry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const coordinatesValue = record.coordinates;
  if (!Array.isArray(coordinatesValue) || coordinatesValue.length < 2) {
    return null;
  }

  const coordinates = coordinatesValue
    .map((coordinate) => {
      if (!coordinate || typeof coordinate !== "object") {
        return null;
      }

      const parsed = coordinate as Record<string, unknown>;
      if (!isFiniteNumber(parsed.lat) || !isFiniteNumber(parsed.lng)) {
        return null;
      }

      return {
        lat: parsed.lat,
        lng: parsed.lng,
      };
    })
    .filter((coordinate): coordinate is RideMapCoordinate => coordinate != null);

  if (coordinates.length < 2) {
    return null;
  }

  const boundsValue = record.bounds;
  if (!boundsValue || typeof boundsValue !== "object") {
    return null;
  }

  const bounds = boundsValue as Record<string, unknown>;
  const northEast = bounds.northEast as Record<string, unknown> | undefined;
  const southWest = bounds.southWest as Record<string, unknown> | undefined;

  if (
    !northEast ||
    !southWest ||
    !isFiniteNumber(northEast.lat) ||
    !isFiniteNumber(northEast.lng) ||
    !isFiniteNumber(southWest.lat) ||
    !isFiniteNumber(southWest.lng)
  ) {
    return null;
  }

  return {
    coordinates,
    bounds: {
      northEast: {
        lat: northEast.lat,
        lng: northEast.lng,
      },
      southWest: {
        lat: southWest.lat,
        lng: southWest.lng,
      },
    },
  };
}

export function parseRideRouteSnapshot(value: unknown): RideRouteSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const pickup = parseRideEstimateWaypoint(record.pickup);
  const destination = parseRideEstimateWaypoint(record.destination);
  const route = parseRideRouteGeometry(record.route);
  const stopsValue = record.stops;

  if (!pickup || !destination || !route || !Array.isArray(stopsValue)) {
    return null;
  }

  const stops = stopsValue
    .map((stop) => parseRideEstimateWaypoint(stop))
    .filter((stop): stop is RideEstimateWaypoint => stop != null);

  if (stops.length !== stopsValue.length) {
    return null;
  }

  return {
    pickup,
    destination,
    stops,
    route,
  };
}

export function isBackendConfigured(): boolean {
  return Boolean(apiBaseUrl);
}

export function getApiBaseUrl(): string | null {
  return apiBaseUrl ?? null;
}

export function getBackendWebSocketUrl(): string | null {
  if (!apiBaseUrl) {
    return null;
  }

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

/**
 * The generic request, for feature modules that live outside this file.
 *
 * `lib/api.ts` is already long enough; interstate travel and safety alerts keep
 * their own bindings and reach the network through here, so there is still one
 * place that knows about base URLs, auth headers, and error shapes.
 */
export async function apiRequest<TResponse>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: {
    accessToken?: string;
    body?: unknown;
    idempotencyKey?: string;
    fallbackError: string;
  },
): Promise<TResponse> {
  return requestJson<TResponse>(method, path, options);
}

async function requestJson<TResponse>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: {
    accessToken?: string;
    body?: unknown;
    idempotencyKey?: string;
    fallbackError: string;
  },
): Promise<TResponse> {
  if (!apiBaseUrl) {
    if (__DEV__) {
      console.warn("[api] EXPO_PUBLIC_API_BASE_URL is not set — every request will fail.");
    }
    throw new Error("Wheelers is not available right now. Please try again later.");
  }

  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }

  if (options.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).catch((error) => {
    throw new Error(
      error instanceof Error && error.message !== "Network request failed"
        ? error.message
        : buildConnectivityErrorMessage(),
    );
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
        ? payload.code
        : undefined;
    throw new ApiError(
      getErrorMessage(payload, options.fallbackError ?? "Request failed."),
      response.status,
      code,
    );
  }

  return (payload ?? {}) as TResponse;
}

/**
 * Error thrown for non-2xx API responses. Carries the HTTP status and the
 * backend's machine-readable `code` so callers can branch on the failure
 * (e.g. 404 VIRTUAL_ACCOUNT_NOT_FOUND → offer to provision) instead of
 * string-matching the message.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
  options?: { accessToken?: string; idempotencyKey?: string; fallbackError: string },
): Promise<TResponse> {
  return requestJson<TResponse>("POST", path, {
    accessToken: options?.accessToken,
    idempotencyKey: options?.idempotencyKey,
    body,
    fallbackError: options?.fallbackError ?? "Request failed.",
  });
}

async function getJson<TResponse>(
  path: string,
  options?: { accessToken?: string; fallbackError: string },
): Promise<TResponse> {
  return requestJson<TResponse>("GET", path, {
    accessToken: options?.accessToken,
    fallbackError: options?.fallbackError ?? "Request failed.",
  });
}

export async function signupWithUsernamePassword(input: {
  username: string;
  password: string;
  /**
   * Sent separately when the identifier is an email address.
   *
   * The backend stores `username` and `email` in different columns and only
   * fills the second one if it is given it. Signing up with an email address
   * used to leave `email` null, so the account had no email anywhere in the
   * app — the address the rider typed lived only as their username.
   */
  email?: string;
  role?: BackendRole;
}): Promise<UsernamePasswordAuthResponse> {
  return postJson<UsernamePasswordAuthResponse>(
    "/auth/signup",
    {
      username: input.username,
      password: input.password,
      ...(input.email ? { email: input.email } : {}),
      role: input.role ?? "RIDER",
    },
    {
      fallbackError: "Could not create your account.",
    },
  );
}

export async function signinWithUsernamePassword(input: {
  username: string;
  password: string;
}): Promise<UsernamePasswordAuthResponse> {
  return postJson<UsernamePasswordAuthResponse>(
    "/auth/signin",
    {
      username: input.username,
      password: input.password,
    },
    {
      fallbackError: "Could not sign in.",
    },
  );
}

// ── Social Auth ─────────────────────────────────────────────────────────

interface SocialAuthResponse {
  accessToken: string;
  tokenType: "Bearer";
  user: BackendUser;
}

export async function signInWithApple(input: {
  idToken: string;
  name?: string;
  role?: BackendRole;
}): Promise<SocialAuthResponse> {
  return postJson<SocialAuthResponse>(
    "/auth/apple",
    { idToken: input.idToken, name: input.name, role: input.role ?? targetAuthRole },
    { fallbackError: "Apple sign-in failed." },
  );
}

/**
 * `role` is not optional in practice: the backend defaults social sign-in to
 * RIDER, so the driver app must say so explicitly or a driver signing in with
 * Google would be created as a rider.
 */
export async function signInWithGoogle(input: {
  idToken: string;
  role?: BackendRole;
}): Promise<SocialAuthResponse> {
  return postJson<SocialAuthResponse>(
    "/auth/google",
    { idToken: input.idToken, role: input.role ?? targetAuthRole },
    { fallbackError: "Google sign-in failed." },
  );
}





export interface PhoneLoginCodeResponse {
  sent: boolean;
  /** How the code went out. */
  channel: "whatsapp" | "sms";
  phone: string;
  expiresInSeconds: number;
}

export interface PhoneLoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  /** True when this number had no Wheelers account until now. */
  isNewUser: boolean;
  /** Whether this account has agreed to the terms and privacy policy, here or on WhatsApp. Absent on older servers. */
  privacyConsent?: "PENDING" | "AGREED" | "DECLINED";
  user: BackendUser;
}

/** Riders sign in with their phone number. `phone` is +234… */
export async function sendPhoneLoginCode(input: {
  phone: string;
}): Promise<PhoneLoginCodeResponse> {
  return postJson<PhoneLoginCodeResponse>(
    "/auth/phone/login/send-otp",
    { phone: input.phone },
    { fallbackError: "We could not send your code. Please try again." },
  );
}

export async function verifyPhoneLoginCode(input: {
  phone: string;
  code: string;
}): Promise<PhoneLoginResponse> {
  return postJson<PhoneLoginResponse>(
    "/auth/phone/login/verify-otp",
    { phone: input.phone, code: input.code },
    { fallbackError: "We could not check that code. Please try again." },
  );
}

/** Passkeys: the server's side of making one and signing in with one (lib/passkeys.ts is the phone's). */
export async function passkeyRegistrationOptions(input: { accessToken: string }): Promise<Record<string, unknown>> {
  return postJson("/auth/passkey/register/options", {}, { accessToken: input.accessToken, fallbackError: "Passkeys are not working right now." });
}

export async function savePasskey(input: { accessToken: string; response: Record<string, unknown>; deviceName: string }): Promise<{ id: string }> {
  return postJson("/auth/passkey/register/verify", { response: input.response, deviceName: input.deviceName }, {
    accessToken: input.accessToken,
    fallbackError: "The passkey could not be set up. Please try again.",
  });
}

export async function passkeySignInOptions(): Promise<{ challengeId: string; options: Record<string, unknown> }> {
  return postJson("/auth/passkey/login/options", {}, { fallbackError: "Passkeys are not working right now. Sign in with your phone number." });
}

export async function signInWithPasskey(input: { challengeId: string; response: Record<string, unknown> }): Promise<PhoneLoginResponse> {
  return postJson("/auth/passkey/login/verify", input, { fallbackError: "We could not sign you in with that passkey. Sign in with your phone number." });
}

export interface PasskeySummary {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(input: { accessToken: string }): Promise<{ passkeys: PasskeySummary[] }> {
  return getJson("/auth/passkeys", { accessToken: input.accessToken, fallbackError: "Could not load your passkeys." });
}

export async function removePasskey(input: { accessToken: string; id: string }): Promise<{ removed: true }> {
  return requestJson("DELETE", `/auth/passkeys/${encodeURIComponent(input.id)}`, {
    accessToken: input.accessToken,
    fallbackError: "Could not remove that passkey.",
  });
}

export async function getCurrentProfile(input: {
  accessToken: string;
}): Promise<CurrentProfileResponse> {
  return getJson<CurrentProfileResponse>("/auth/me", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your profile.",
  });
}

export async function getReferralSummary(input: {
  accessToken: string;
}): Promise<ReferralSummaryResponse> {
  return getJson<ReferralSummaryResponse>("/referrals/me", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your referral code.",
  });
}

/** Someone who joined with your code: their first name, when, and whether they have ridden. */
export interface ReferralFriend {
  id: string;
  referredUser: string;
  status: "PENDING" | "QUALIFIED_RIDE" | "EXPIRED_NO_RIDE" | "CLOSED" | string;
  appliedAt: string;
  firstRideId: string | null;
}

/** The people who joined with your code, newest first (the last 30). */
export async function listReferralFriends(input: { accessToken: string }): Promise<{ items: ReferralFriend[] }> {
  return getJson<{ items: ReferralFriend[] }>("/referrals/me/referrals", {
    accessToken: input.accessToken,
    fallbackError: "Could not load the people you invited.",
  });
}

/** Choose your own referral code in place of the one you were given. */
export async function setReferralCode(input: {
  accessToken: string;
  code: string;
}): Promise<{ code: string; shareLink: string | null; shareMessage: string | null }> {
  return requestJson("PUT", "/referrals/me/code", {
    accessToken: input.accessToken,
    body: { code: input.code },
    fallbackError: "Could not change your referral code.",
  });
}

export async function applyReferralCode(input: {
  accessToken: string;
  code: string;
}): Promise<ApplyReferralCodeResponse> {
  return postJson<ApplyReferralCodeResponse>(
    "/referrals/apply",
    { code: input.code },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not apply this referral code.",
    },
  );
}

export async function updateCurrentProfile(input: {
  accessToken: string;
  username?: string;
  fullName?: string;
  email?: string;
  phone?: string;
}): Promise<CurrentProfileResponse> {
  return requestJson<CurrentProfileResponse>(
    "PUT",
    "/auth/profile",
    {
      body: {
        username: input.username,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
      },
      accessToken: input.accessToken,
      fallbackError: "Could not update your profile.",
    },
  );
}

export async function getWalletOverview(input: {
  accessToken: string;
}): Promise<WalletOverviewResponse> {
  return getJson<WalletOverviewResponse>("/wallet/overview", {
    accessToken: input.accessToken,
    fallbackError: "Could not load wallet overview.",
  });
}

export async function getWalletTransactions(input: {
  accessToken: string;
  limit?: number;
  cursor?: string;
}): Promise<WalletTransactionsResponse> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  const path =
    params.size > 0 ? `/wallet/transactions?${params.toString()}` : "/wallet/transactions";

  return getJson<WalletTransactionsResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load wallet transactions.",
  });
}

export interface WalletDepositInfoResponse {
  accountNumber: string;
  accountName: string;
  bankName: string;
  currency: string;
}

export interface ProvisionVirtualAccountResponse {
  accountNumber: string;
  accountName: string;
  bankName: string;
  currency: string;
  alreadyProvisioned: boolean;
}

export async function getWalletDepositInfo(input: {
  accessToken: string;
}): Promise<WalletDepositInfoResponse> {
  return getJson<WalletDepositInfoResponse>("/wallet/deposit-info", {
    accessToken: input.accessToken,
    fallbackError: "Could not load deposit information.",
  });
}

export async function provisionVirtualAccount(input: {
  accessToken: string;
}): Promise<ProvisionVirtualAccountResponse> {
  return postJson<ProvisionVirtualAccountResponse>(
    "/wallet/provision-virtual-account",
    {},
    {
      accessToken: input.accessToken,
      fallbackError: "Could not provision virtual account.",
    },
  );
}

export async function createWalletWithdrawal(input: {
  accessToken: string;
  amountNgn: number;
  idempotencyKey?: string;
  /** The 4-digit wallet PIN. The server refuses a withdrawal without it. */
  pin?: string;
  bankAccount: {
    accountNumber: string;
    accountName: string;
    networkId: string;
  };
}): Promise<CreateWalletWithdrawalResponse> {
  return postJson<CreateWalletWithdrawalResponse>(
    "/wallet/withdrawals",
    {
      amountNgn: input.amountNgn,
      bankAccount: input.bankAccount,
      pin: input.pin,
    },
    {
      accessToken: input.accessToken,
      idempotencyKey: input.idempotencyKey,
      fallbackError: "Could not create wallet withdrawal.",
    },
  );
}

// ── Wallet PIN ────────────────────────────────────────────────────────────
// The server owns every rule (length, lockout, reset pause); the app only
// asks and shows what it is told.

export type WalletSecurity = {
  hasPin: boolean;
  /** Masked. Where a "Forgot PIN" code goes; null means a reset pauses withdrawals for 24h instead. */
  resetEmail: string | null;
  recoveryEmail: string | null;
  pinLockedUntil: string | null;
  frozenUntil: string | null;
  frozenReason: string | null;
  restrictedUntil: string | null;
};

export type WalletPinResetStart =
  | { method: "email"; sentTo: string }
  | { method: "pause"; pauseHours: number };

export async function getWalletSecurity(input: { accessToken: string }): Promise<WalletSecurity> {
  return getJson<WalletSecurity>("/wallet/security", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your wallet security settings.",
  });
}

export async function setWalletPin(input: { accessToken: string; pin: string }): Promise<{ ok: true }> {
  return postJson<{ ok: true }>("/wallet/pin", { pin: input.pin }, {
    accessToken: input.accessToken,
    fallbackError: "Could not set your wallet PIN.",
  });
}

export async function startWalletPinReset(input: { accessToken: string }): Promise<WalletPinResetStart> {
  return postJson<WalletPinResetStart>("/wallet/pin/reset/start", {}, {
    accessToken: input.accessToken,
    fallbackError: "Could not start the PIN reset.",
  });
}

export async function completeWalletPinReset(input: {
  accessToken: string;
  newPin: string;
  code?: string;
}): Promise<{ ok: true; frozenUntil: string | null; restrictedUntil: string | null }> {
  return postJson("/wallet/pin/reset/complete", { newPin: input.newPin, code: input.code }, {
    accessToken: input.accessToken,
    fallbackError: "Could not reset your wallet PIN.",
  });
}

export async function getWalletWithdrawal(input: {
  accessToken: string;
  id: string;
}): Promise<{ withdrawal: WalletWithdrawal | null }> {
  return getJson<{ withdrawal: WalletWithdrawal | null }>(
    `/wallet/withdrawals/${encodeURIComponent(input.id)}`,
    {
      accessToken: input.accessToken,
      fallbackError: "Could not load withdrawal status.",
    },
  );
}

export const FAILED_WITHDRAWAL_STATUSES = ["FAILED", "EXPIRED", "CANCELLED"];

/**
 * Poll a withdrawal until the provider reports a terminal state, so screens
 * show the real outcome — not a success message fired on the create request
 * alone. Resolves null while still in flight after ~30s.
 */
export async function waitForWithdrawalOutcome(input: {
  accessToken: string;
  withdrawalId: string;
  attempts?: number;
  intervalMs?: number;
}): Promise<WalletWithdrawal | null> {
  const attempts = input.attempts ?? 6;
  const intervalMs = input.intervalMs ?? 5000;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const res = await getWalletWithdrawal({
        accessToken: input.accessToken,
        id: input.withdrawalId,
      });
      const withdrawal = res.withdrawal;
      if (!withdrawal) return null;
      if (
        withdrawal.status === "SETTLED" ||
        FAILED_WITHDRAWAL_STATUSES.includes(withdrawal.status)
      ) {
        return withdrawal;
      }
    } catch {
      // transient — keep polling
    }
  }
  return null;
}

export async function getWithdrawalBankNetworks(input: {
  accessToken: string;
  country?: string;
  query?: string;
  limit?: number;
}): Promise<WithdrawalBankNetworksResponse> {
  const params = new URLSearchParams();
  if (input.country) {
    params.set("country", input.country);
  }
  if (input.query) {
    params.set("query", input.query);
  }
  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const path =
    params.size > 0
      ? `/wallet/withdrawals/bank-networks?${params.toString()}`
      : "/wallet/withdrawals/bank-networks";

  return getJson<WithdrawalBankNetworksResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load withdrawal bank networks.",
  });
}

export async function verifyWithdrawalBankAccount(input: {
  accessToken: string;
  accountNumber: string;
  networkId: string;
  countryCode?: string;
  currency?: string;
}): Promise<VerifyWithdrawalBankAccountResponse> {
  return postJson<VerifyWithdrawalBankAccountResponse>(
    "/wallet/withdrawals/verify-bank-account",
    {
      accountNumber: input.accountNumber,
      networkId: input.networkId,
      countryCode: input.countryCode ?? "NG",
      currency: input.currency ?? "NGN",
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not verify the bank account.",
    },
  );
}

export async function getRideEstimate(input: {
  accessToken: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops?: RideEstimateWaypoint[];
}): Promise<RideEstimateResponse> {
  const cacheKey = buildRideEstimateCacheKey(input);
  const cached = rideEstimateCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < RIDE_ESTIMATE_CACHE_TTL_MS) {
    return cached.value;
  }

  const inflight = rideEstimateInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = postJson<RideEstimateResponse>(
    "/rides/estimate",
    {
      pickup: input.pickup,
      destination: input.destination,
      stops: input.stops ?? [],
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not calculate the ride estimate.",
    },
  ).then((response) => {
    rideEstimateCache.set(cacheKey, {
      value: response,
      cachedAt: Date.now(),
    });
    return response;
  });

  rideEstimateInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    rideEstimateInflight.delete(cacheKey);
  }
}

export async function getRiderRideHistory(input: {
  accessToken: string;
  limit?: number;
  cursor?: string;
}): Promise<RiderHistoryResponse> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  const path = params.size > 0 ? `/rides/history?${params.toString()}` : "/rides/history";
  return getJson<RiderHistoryResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load ride history.",
  });
}

export async function createScheduledRide(input: {
  accessToken: string;
  scheduledFor: string;
  idempotencyKey?: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops?: RideEstimateWaypoint[];
  paymentMethod?: "wallet_balance";
}): Promise<{ item: ScheduledRide }> {
  return postJson<{ item: ScheduledRide }>(
    "/scheduled-rides",
    {
      scheduledFor: input.scheduledFor,
      pickup: input.pickup,
      destination: input.destination,
      stops: input.stops ?? [],
      paymentMethod: input.paymentMethod ?? "wallet_balance",
    },
    {
      accessToken: input.accessToken,
      idempotencyKey: input.idempotencyKey,
      fallbackError: "Could not schedule this ride.",
    },
  );
}

export async function getScheduledRides(input: {
  accessToken: string;
  limit?: number;
  cursor?: string;
}): Promise<ScheduledRideListResponse> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  const path =
    params.size > 0 ? `/scheduled-rides?${params.toString()}` : "/scheduled-rides";
  return getJson<ScheduledRideListResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load scheduled rides.",
  });
}

export async function cancelScheduledRide(input: {
  accessToken: string;
  scheduledRideId: string;
  reason?: string;
}): Promise<{ cancelled: boolean; scheduledRideId: string }> {
  return postJson<{ cancelled: boolean; scheduledRideId: string }>(
    `/scheduled-rides/${encodeURIComponent(input.scheduledRideId)}/cancel`,
    input.reason ? { reason: input.reason } : {},
    {
      accessToken: input.accessToken,
      fallbackError: "Could not cancel scheduled ride.",
    },
  );
}

export async function listNotifications(input: {
  accessToken: string;
  limit?: number;
}): Promise<{ items: AppNotification[] }> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const path = params.size > 0 ? `/notifications?${params.toString()}` : "/notifications";
  return getJson<{ items: AppNotification[] }>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load notifications.",
  });
}

export async function markNotificationsRead(input: {
  accessToken: string;
  notificationIds?: string[];
}): Promise<{ updatedCount: number }> {
  return postJson<{ updatedCount: number }>(
    "/notifications/read",
    {
      notificationIds: input.notificationIds ?? [],
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not update notifications.",
    },
  );
}

export async function registerPushToken(input: {
  accessToken: string;
  expoPushToken: string;
  enabled?: boolean;
  platform?: string;
  deviceName?: string;
  appOwnership?: string;
}): Promise<{
  device: {
    id: string;
    expoPushToken: string;
    enabled: boolean;
    platform: string | null;
    deviceName: string | null;
    appOwnership: string | null;
    lastRegisteredAt: string;
  };
}> {
  return postJson("/notifications/device", input, {
    accessToken: input.accessToken,
    fallbackError: "Could not register push notifications.",
  });
}

export async function createGroupRideMatchRequest(input: {
  accessToken: string;
  idempotencyKey?: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops?: RideEstimateWaypoint[];
  genderPreference?: GroupRideGenderPreference;
  paymentMethod?: "wallet_balance";
}): Promise<{
  item: GroupRideMatchRequest;
  uploadRequired: boolean;
}> {
  return postJson("/group-rides/requests", input, {
    accessToken: input.accessToken,
    idempotencyKey: input.idempotencyKey,
    fallbackError: "Could not create the group ride request.",
  });
}

export async function getGroupRideMatchRequest(input: {
  accessToken: string;
  requestId: string;
}): Promise<{ item: GroupRideMatchRequest; matchedRiders: GroupRideMatchedRider[] }> {
  return getJson(`/group-rides/requests/${encodeURIComponent(input.requestId)}`, {
    accessToken: input.accessToken,
    fallbackError: "Could not load the group ride request.",
  });
}

/**
 * Ask the vision service whether a photo is a usable verification selfie,
 * before it is stored against anything.
 *
 * This exists so the rider hears "that's not a face" while the camera is still
 * open. It is advisory — `completeGroupRideFaceUpload` runs the same check on
 * the stored object, and that one is the gate.
 */
export async function checkGroupRideFace(input: {
  accessToken: string;
  imageBase64: string;
  mimeType: string;
}): Promise<{ accepted: boolean; reason: string }> {
  return postJson(
    "/group-rides/face-check",
    {
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not check that photo.",
    },
  );
}

/**
 * PUT the selfie straight to object storage using the presigned URL. The
 * Content-Type has to match the one the URL was signed with or the store
 * rejects the signature.
 */
export async function uploadGroupRideFaceImage(input: {
  uploadUrl: string;
  uri: string;
  mimeType: string;
}): Promise<void> {
  const fileResponse = await fetch(input.uri);
  if (!fileResponse.ok) {
    throw new Error("Could not read the captured photo.");
  }

  const blob = await fileResponse.blob();
  const uploadResponse = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.mimeType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Could not upload your verification photo (${uploadResponse.status}).`,
    );
  }
}

export async function createGroupRideFaceUploadUrl(input: {
  accessToken: string;
  requestId: string;
  mimeType: string;
  capturedAt?: string;
}): Promise<{
  upload: GroupRideFaceUploadDescriptor;
}> {
  return postJson(
    `/group-rides/requests/${encodeURIComponent(input.requestId)}/face-upload-url`,
    {
      mimeType: input.mimeType,
      capturedAt: input.capturedAt,
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not prepare the face verification upload.",
    },
  );
}

export async function completeGroupRideFaceUpload(input: {
  accessToken: string;
  requestId: string;
  capturedAt?: string;
}): Promise<{
  item: GroupRideMatchRequest;
  publishedReadyEvent: boolean;
}> {
  return postJson(
    `/group-rides/requests/${encodeURIComponent(input.requestId)}/face-upload-complete`,
    {
      capturedAt: input.capturedAt,
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not complete face verification.",
    },
  );
}

export async function cancelGroupRideMatchRequest(input: {
  accessToken: string;
  requestId: string;
  reason?: string;
}): Promise<{
  item: GroupRideMatchRequest | null;
  cancelled: boolean;
}> {
  return postJson(
    `/group-rides/requests/${encodeURIComponent(input.requestId)}/cancel`,
    {
      reason: input.reason,
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not cancel the group ride request.",
    },
  );
}

// ─── Driver API ──────────────────────────────────────────────────

export interface DriverStatsResponse {
  driverId: string;
  userId: string;
  status: string;
  kycStatus: string;
  rating: number;
  totalRides: number;
  totalEarningsNgn: number;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  vehicleYear: number | null;
  balanceNgn: number;
  lockedNgn: number;
  ratingCount?: number;
  completedRides?: number;
  cancelledRides?: number;
  /** Share of decided trips (completed + cancelled) that ended cancelled. */
  cancellationRate?: number;
}

export interface DriverEarningItem {
  id: string;
  amountNgn: number;
  referenceId: string;
  createdAt: string;
}

export interface DriverEarningsResponse {
  period: string;
  totalEarningsNgn: number;
  rideCount: number;
  items: DriverEarningItem[];
}

export interface DriverHistoryRide {
  id: string;
  tripId?: string | null;
  status: string;
  pickupAddress: string;
  destAddress: string;
  fareEstimateNgn: number;
  fareFinalNgn: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  matchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface DriverRideHistoryResponse {
  items: DriverHistoryRide[];
  nextCursor: string | null;
}

export async function getDriverStats(input: {
  accessToken: string;
}): Promise<DriverStatsResponse> {
  return getJson<DriverStatsResponse>("/drivers/me/stats", {
    accessToken: input.accessToken,
    fallbackError: "Could not load driver stats.",
  });
}

export async function getDriverEarnings(input: {
  accessToken: string;
  period?: "today" | "week" | "month";
}): Promise<DriverEarningsResponse> {
  const params = new URLSearchParams();
  if (input.period) {
    params.set("period", input.period);
  }

  const path =
    params.size > 0
      ? `/drivers/me/earnings?${params.toString()}`
      : "/drivers/me/earnings";

  return getJson<DriverEarningsResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load driver earnings.",
  });
}

export async function getDriverRideHistory(input: {
  accessToken: string;
  limit?: number;
  cursor?: string;
}): Promise<DriverRideHistoryResponse> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  const path =
    params.size > 0
      ? `/drivers/me/rides/history?${params.toString()}`
      : "/drivers/me/rides/history";

  return getJson<DriverRideHistoryResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load driver ride history.",
  });
}

// ─── Driver KYC ─────────────────────────────────────────────────

/** Swaps a signed-in phone's login for a fresh 30-day one (rolling logins). */
export async function refreshAccessToken(accessToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  return postJson<{ accessToken: string; expiresAt: string }>("/auth/refresh", {}, {
    accessToken,
    fallbackError: "Could not renew your login.",
  });
}

/** Has this account agreed to the terms and privacy policy, in the app or on WhatsApp? */
export async function getPrivacyConsent(accessToken: string): Promise<{ privacyConsent: "PENDING" | "AGREED" | "DECLINED" }> {
  return requestJson("GET", "/auth/privacy-consent", { accessToken, fallbackError: "Could not check the terms." });
}

/** Records the person's answer on their account, so WhatsApp and every phone know it. */
export async function recordPrivacyConsent(
  accessToken: string,
  consent: "AGREED" | "DECLINED",
): Promise<{ privacyConsent: "PENDING" | "AGREED" | "DECLINED" }> {
  return postJson("/auth/privacy-consent", { consent }, { accessToken, fallbackError: "Could not save your answer." });
}

/** Is this login still good? Rejects with status 401 when it was signed out (by the person, or an admin). */
export async function checkSession(accessToken: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>("GET", "/auth/session", {
    accessToken,
    fallbackError: "Could not check your login.",
  });
}

export async function submitDriverKyc(input: {
  accessToken: string;
  licenceImage: string;
  selfieImage: string;
  /** How the selfie was taken: with the face check passed, without it, or on a phone without it. */
  selfieCheck?: "passed" | "skipped" | "unavailable";
  vehicleImages: string[];
  vehicleMake: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleYear: number;
  phone?: string;
  /** As on the licence. */
  legalName: string;
}): Promise<{ status: string }> {
  return postJson<{ status: string }>(
    "/drivers/kyc/submit",
    {
      legalName: input.legalName,
      licenceImage: input.licenceImage,
      selfieImage: input.selfieImage,
      ...(input.selfieCheck ? { selfieCheck: input.selfieCheck } : {}),
      vehicleImages: input.vehicleImages,
      vehicleMake: input.vehicleMake,
      vehicleModel: input.vehicleModel,
      vehiclePlate: input.vehiclePlate,
      vehicleYear: input.vehicleYear,
      phone: input.phone,
    },
    {
      accessToken: input.accessToken,
      fallbackError: "Could not submit your documents.",
    },
  );
}

/**
 * After a rejection: only the items sent back (the server refuses anything
 * but a rejected driver, and keeps everything already approved).
 */
export async function resubmitDriverKyc(input: {
  accessToken: string;
  ninImage?: string;
  licenceImage?: string;
  selfieImage?: string;
  selfieCheck?: "passed" | "skipped" | "unavailable";
  vehicleImages?: string[];
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  vehicleYear?: number;
  phone?: string;
}): Promise<{ status: string; resubmitted: string[] }> {
  const { accessToken, ...body } = input;
  return postJson<{ status: string; resubmitted: string[] }>("/drivers/kyc/resubmit", body, {
    accessToken,
    fallbackError: "Could not send your documents.",
  });
}

export interface DriverKycStatusResponse {
  kycStatus: string;
  submission: {
    status: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    rejectedFields: string[];
    /** The reviewer's words for each rejected item, e.g. { licence: "photo is blurry" }. */
    fieldReasons?: Record<string, string>;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehiclePlate: string | null;
    vehicleYear: number | null;
  } | null;
}

export async function getDriverKycStatus(input: {
  accessToken: string;
}): Promise<DriverKycStatusResponse> {
  return getJson<DriverKycStatusResponse>("/drivers/kyc/status", {
    accessToken: input.accessToken,
    fallbackError: "Could not check KYC status.",
  });
}

// ─── Driver papers ──────────────────────────────────────────────

/** How a paper stands. "waiting": sent, not yet looked at. */
export type DriverPaperState = "missing" | "waiting" | "approved" | "rejected" | "expired";

export interface DriverPaper {
  type: string;
  label: string;
  hint: string;
  /** It runs out: its expiry date is asked for. */
  expires: boolean;
  /** It has a number worth keeping (a policy or permit number). */
  numbered: boolean;
  document: {
    state: DriverPaperState;
    number: string | null;
    /** YYYY-MM-DD */
    expiresOn: string | null;
    uploadedAt: string;
    rejectionReason: string | null;
    expiringSoon: boolean;
    daysLeft: number | null;
  } | null;
}

/** One thing a driver must show. Any ONE of its papers does. */
export interface DriverPaperNeed {
  key: string;
  label: string;
  required: boolean;
  state: DriverPaperState;
  papers: DriverPaper[];
}

export interface DriverPapersResponse {
  /** The day from which papers are needed to go online (YYYY-MM-DD). Null: no such day is set. */
  requiredFrom?: string | null;
  /** That day has come and something is still to do: the driver cannot go online. */
  blocked?: boolean;
  details: {
    legalName: string | null;
    licenceNumber: string | null;
    /** YYYY-MM-DD */
    licenceExpiresOn: string | null;
    licenceExpired: boolean;
    complete: boolean;
  };
  needs: DriverPaperNeed[];
  /** How many things are still to do: required papers not yet good, and the details. */
  toDo: number;
  expiringSoon: string[];
}

export async function getDriverPapers(input: { accessToken: string }): Promise<DriverPapersResponse> {
  return getJson<DriverPapersResponse>("/drivers/papers", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your papers.",
  });
}

/** One paper, as a photo or PDF in base64. Sending a paper again replaces the one before. */
export async function sendDriverPaper(input: {
  accessToken: string;
  type: string;
  file: string;
  /** YYYY-MM-DD, for a paper that runs out. */
  expiresOn?: string;
  number?: string;
}): Promise<DriverPapersResponse> {
  const { accessToken, ...body } = input;
  return postJson<DriverPapersResponse>("/drivers/papers", body, {
    accessToken,
    fallbackError: "Could not send that paper.",
  });
}

export async function saveDriverDetails(input: {
  accessToken: string;
  legalName: string;
  licenceNumber: string;
  /** YYYY-MM-DD */
  licenceExpiresOn: string;
}): Promise<DriverPapersResponse> {
  const { accessToken, ...body } = input;
  return requestJson<DriverPapersResponse>("PUT", "/drivers/papers/details", {
    accessToken,
    body,
    fallbackError: "Could not save your details.",
  });
}

// ─── Driver phone verification ──────────────────────────────────

export interface DriverPhoneStatus {
  phone: string | null;
  verified: boolean;
  verifiedAt: string | null;
  /** A code is out and still good: the masked number it went to. */
  codeSentTo: string | null;
  /** Seconds until another code may be asked for. 0: now. */
  resendInSeconds: number;
  /** Seconds left of a stop for asking for too many codes. 0: not stopped. */
  lockedForSeconds: number;
}

export interface DriverPhoneCodeSent {
  /** Masked, e.g. "0803 ••• 4567". */
  sentTo: string;
  by: "sms" | "whatsapp";
  expiresInMinutes: number;
  resendInSeconds: number;
  /** How many more codes may be asked for in this half hour. */
  codesLeft: number;
}

/**
 * A refusal from the phone endpoints that carries a wait: the app counts it
 * down instead of only saying "try later".
 */
export class WaitError extends ApiError {
  retryAfterSeconds: number;
  constructor(message: string, status: number, code: string | undefined, retryAfterSeconds: number) {
    super(message, status, code);
    this.name = "WaitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function phoneRequest<T>(method: "GET" | "POST", path: string, accessToken: string, body: unknown, fallbackError: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(buildConnectivityErrorMessage());
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string; retryAfterSeconds?: number } | null;
  if (!response.ok) {
    const message = getErrorMessage(payload, fallbackError);
    if (typeof payload?.retryAfterSeconds === "number") throw new WaitError(message, response.status, payload.code, payload.retryAfterSeconds);
    throw new ApiError(message, response.status, payload?.code);
  }
  return (payload ?? {}) as T;
}

export function getDriverPhone(input: { accessToken: string }): Promise<DriverPhoneStatus> {
  return phoneRequest<DriverPhoneStatus>("GET", "/drivers/phone", input.accessToken, undefined, "Could not check your number.");
}

export function sendDriverPhoneCode(input: { accessToken: string; phone: string }): Promise<DriverPhoneCodeSent> {
  return phoneRequest<DriverPhoneCodeSent>("POST", "/drivers/phone/send-code", input.accessToken, { phone: input.phone }, "The code was not sent. Please try again.");
}

export function verifyDriverPhoneCode(input: { accessToken: string; code: string }): Promise<{ verified: boolean; phone: string }> {
  return phoneRequest<{ verified: boolean; phone: string }>("POST", "/drivers/phone/verify-code", input.accessToken, { code: input.code }, "The code was not checked. Please try again.");
}

// ── Chat ──────────────────────────────────────────────────────────

export interface ChatMessageResponse {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: "RIDER" | "DRIVER";
  content: string;
  /** "call": a line the server writes when a call ends ("Missed call"). Older servers leave it out. */
  kind?: "text" | "call";
  createdAt: string;
}

export interface ChatMessagesResponse {
  items: ChatMessageResponse[];
  nextCursor: string | null;
  /** Whether the chat still takes messages: until 30 minutes after the trip. Older servers leave it out. */
  open?: boolean;
  closesAt?: string | null;
  /** Live call is on. Older servers leave it out: no Call button. */
  callsEnabled?: boolean;
}

export async function getRideChatMessages(input: {
  accessToken: string;
  rideId: string;
  limit?: number;
  cursor?: string;
}): Promise<ChatMessagesResponse> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  const path =
    params.size > 0
      ? `/rides/${input.rideId}/messages?${params.toString()}`
      : `/rides/${input.rideId}/messages`;

  return getJson<ChatMessagesResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load chat messages.",
  });
}

// ── Account management ──────────────────────────────────────────────────────

export async function logoutAccount(input: {
  accessToken: string;
}): Promise<{ success: boolean }> {
  return postJson<{ success: boolean }>("/auth/logout", {}, {
    accessToken: input.accessToken,
    fallbackError: "Could not log out.",
  });
}

export async function deleteAccount(input: {
  accessToken: string;
}): Promise<{ deleted: boolean }> {
  return postJson<{ deleted: boolean }>("/auth/delete-account", {}, {
    accessToken: input.accessToken,
    fallbackError: "Could not delete account.",
  });
}

// ─── Driver active ride ─────────────────────────────────────────

/**
 * The ride the signed-in driver is assigned to right now. The socket's
 * `ride:matched` is fire-and-forget, so this is how the app catches up after
 * a reconnect, a restart, or a spell in the background while the rider paid.
 */
export interface DriverActiveRide {
  rideId: string;
  /** The short trip ID, e.g. WH-01234. Absent on servers older than it. */
  tripId?: string | null;
  riderId: string;
  driverId: string | null;
  rideStatus:
    | "REQUESTED"
    | "MATCHING"
    | "DRIVER_ASSIGNED"
    | "DRIVER_EN_ROUTE"
    | "ARRIVED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "DISPUTED"
    | (string & {});
  paymentMethod: string;
  pickup: RideEstimateWaypoint;
  destination: RideEstimateWaypoint;
  stops: RideEstimateWaypoint[];
  agreedFareNgn: number;
  /** Which rules the fare was agreed under (2 since 10 Oct 2026). Absent from an older server. */
  pricingVersion?: number;
  riderOfferNgn: number | null;
  riderPaid: boolean;
  riderPhone: string | null;
  /** The rider's first name. Older servers leave it out. */
  riderName?: string | null;
  /** Start trip asks for the rider's trip code. Older servers leave it out. */
  tripCodeRequired?: boolean;
  matchedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
}

export interface DriverActiveRideResponse {
  ride: DriverActiveRide | null;
}

export async function getDriverActiveRide(input: {
  accessToken: string;
}): Promise<DriverActiveRideResponse> {
  return getJson<DriverActiveRideResponse>("/drivers/me/rides/active", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your current ride.",
  });
}

// ─── Driver bids ────────────────────────────────────────────────

export type DriverBidStatus =
  | "PENDING"
  | "ACCEPTED"
  | "LOST"
  | "WITHDRAWN"
  | "EXPIRED"
  | "CANCELLED"
  | "DECLINED";

export interface DriverBidRecord {
  id: string;
  rideId: string;
  /** Who asked — a re-bid from this record must address the rider. */
  riderId?: string;
  amountNgn: number;
  etaSeconds: number;
  distanceKm: number | null;
  status: DriverBidStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** Newer servers: the rider is paying for this bid right now (PENDING only). */
  payingSince?: string;
  payingUntil?: string;
  payingRemainingMs?: number;
  ride: {
    status: string;
    pickupAddress: string;
    destAddress: string;
    riderOfferNgn: number | null;
    agreedFareNgn: number | null;
    fareEstimateNgn: number | null;
    distanceKm: number | null;
    pricingVersion?: number;
    matchedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  };
}

export interface DriverBidsResponse {
  items: DriverBidRecord[];
  nextCursor: string | null;
}

/** Every bid this driver has sent, newest first, with how each one ended. */
export async function getDriverBids(input: {
  accessToken: string;
  limit?: number;
  cursor?: string;
}): Promise<DriverBidsResponse> {
  const params = new URLSearchParams();
  if (input.limit) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const path = params.size > 0 ? `/drivers/me/bids?${params.toString()}` : "/drivers/me/bids";
  return getJson<DriverBidsResponse>(path, {
    accessToken: input.accessToken,
    fallbackError: "Could not load your bids.",
  });
}

/** Background liveness heartbeat — keeps a pocketed driver alive in matching. */
/** "Nearby ride alerts": may Wheelers see a rough position while the driver is off shift? */
export type DriverStandby = {
  enabled: boolean;
  consentAt: string | null;
  lastSentAt: string | null;
};

export async function getDriverStandby(input: { accessToken: string }): Promise<DriverStandby> {
  return getJson<DriverStandby>("/drivers/me/standby", {
    accessToken: input.accessToken,
    fallbackError: "Could not load nearby ride alerts.",
  });
}

/** Switching it off also erases the off-shift position the server holds. */
export async function setDriverStandby(input: {
  accessToken: string;
  enabled: boolean;
}): Promise<DriverStandby> {
  return requestJson<DriverStandby>("PUT", "/drivers/me/standby", {
    accessToken: input.accessToken,
    body: { enabled: input.enabled },
    fallbackError: "Could not update nearby ride alerts.",
  });
}

/** Throws ApiError with code STANDBY_OFF when the driver has not opted in. */
export async function postDriverStandbyLocation(input: {
  accessToken: string;
  lat: number;
  lng: number;
}): Promise<void> {
  await postJson("/drivers/me/standby-location", { lat: input.lat, lng: input.lng }, {
    accessToken: input.accessToken,
    fallbackError: "Could not update location.",
  });
}

export async function postDriverLocation(input: {
  accessToken: string;
  lat: number;
  lng: number;
}): Promise<void> {
  await postJson("/drivers/me/location", { lat: input.lat, lng: input.lng }, {
    accessToken: input.accessToken,
    fallbackError: "Could not update location.",
  });
}

// ── Stellar Testnet (grant demo) ────────────────────────────────────────

export interface StellarTransferView {
  id?: string;
  kind: "ACCOUNT_OPEN" | "TOPUP" | "FARE" | "COMMISSION" | "WITHDRAWAL" | string;
  status: "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "SKIPPED" | string;
  amountXlm: string;
  /** Its naira equivalent at the rate it used. Only an equivalent: Stellar is its own ledger. */
  amountNgn: number | null;
  rateNgnPerXlm?: number | null;
  memo: string | null;
  direction?: "in" | "out";
  txHash: string | null;
  explorerUrl: string | null;
  rideId?: string | null;
  /** Public addresses only. */
  from?: string;
  to?: string;
  createdAt: string;
  confirmedAt?: string | null;
  note: string | null;
}

export interface StellarMeResponse {
  enabled: boolean;
  network?: "testnet";
  /** The live naira value of 1 XLM; null when no price could be had. */
  rate?: { ngnPerXlm: number; source: string; at: string } | null;
  reserveXlm?: number;
  account?: {
    publicKey: string;
    opened: boolean;
    balanceXlm: string | null;
    balanceNgnEquivalent: number | null;
    explorerUrl: string;
  } | null;
  transfers?: StellarTransferView[];
}

/** The driver's Stellar Testnet account. `enabled: false` when the server has Stellar off (or is older). */
export async function getStellarMe(input: { accessToken: string }): Promise<StellarMeResponse> {
  return getJson<StellarMeResponse>("/stellar/me", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your Stellar account.",
  }).catch(() => ({ enabled: false }));
}

export async function requestStellarWithdrawal(input: {
  accessToken: string;
  destination: string;
  amountXlm: number;
}): Promise<{ transfer: StellarTransferView }> {
  return postJson<{ transfer: StellarTransferView }>(
    "/stellar/withdraw",
    { destination: input.destination, amountXlm: input.amountXlm },
    { accessToken: input.accessToken, fallbackError: "Could not send the withdrawal." },
  );
}

// ── The rider's active ride (restore after a restart) ─────────────────────

export interface RiderActiveRideDetail {
  id: string;
  tripId: string | null;
  status: string;
  pickup: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  stops: Array<{ type: string; address: string }>;
  fareEstimateNgn: number | null;
  agreedFareNgn: number | null;
  startedAt: string | null;
  driver: {
    id: string;
    userId: string;
    name: string | null;
    phone: string | null;
    rating: number | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehiclePlate: string | null;
  } | null;
  /** The rider's own trip code, until the driver has used it. */
  tripCode?: string | null;
  /** What the rider is offering. */
  riderOfferNgn?: number | null;
  /** The rider said yes to auto-booking this search (newer servers). */
  autoAccept?: boolean;
  /** Present while the ride is still a search: when it closes, and the offers still open. Older servers leave it out. */
  search?: {
    bidsCloseAt: string;
    offers: Array<{
      driverId: string;
      driverUserId: string;
      counterOfferNgn: number;
      driverName: string;
      driverRating: number | null;
      vehiclePlate: string;
      vehicleModel: string;
      etaSeconds: number;
      distanceKm: number | null;
      receivedAt: string;
    }>;
  } | null;
}

export async function getRiderActiveRide(input: { accessToken: string }): Promise<{ ride: RiderActiveRideDetail | null }> {
  return getJson<{ ride: RiderActiveRideDetail | null }>("/rides/active", {
    accessToken: input.accessToken,
    fallbackError: "Could not load your current trip.",
  });
}
