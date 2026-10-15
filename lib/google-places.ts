import Constants from "expo-constants";

export const googleMapsApiKeyEnvVar = "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY";

export type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  icon: "location-on" | "storefront" | "flight" | "history";
  address: string;
};

export type ResolvedPlace = {
  lat: number;
  lng: number;
  address: string;
};

const RESOLVED_PLACE_CACHE_TTL_MS = 10 * 60 * 1000;
const resolvedPlaceCache = new Map<
  string,
  { value: ResolvedPlace; cachedAt: number }
>();
const resolvedPlaceInflight = new Map<string, Promise<ResolvedPlace>>();

/**
 * Places known to the metre, by the words shown for them: the rider's own GPS
 * spot under the address it was given. A pickup set from "where I am" goes to
 * drivers as that exact point, never as wherever a search for its address
 * text lands (the middle of the street, or the area).
 */
const exactPlaces = new Map<string, ResolvedPlace>();
const EXACT_PLACES_KEPT = 30;

export function rememberExactPlace(label: string, point: { lat: number; lng: number }): void {
  const address = label.trim();
  if (!address || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
  const key = address.toLowerCase();
  exactPlaces.delete(key);
  exactPlaces.set(key, { lat: point.lat, lng: point.lng, address });
  if (exactPlaces.size > EXACT_PLACES_KEPT) {
    const oldest = exactPlaces.keys().next().value;
    if (oldest !== undefined) exactPlaces.delete(oldest);
  }
}

type GoogleAutocompletePrediction = {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  types?: string[];
};

type GoogleAutocompleteResponse = {
  status?: string;
  predictions?: GoogleAutocompletePrediction[];
  error_message?: string;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  address_components?: GoogleAddressComponent[];
};

type GoogleGeocodeResponse = {
  status?: string;
  results?: GoogleGeocodeResult[];
  error_message?: string;
};

/* ── diagnostics ───────────────────────────────────────────────────────────
 *
 * Place search fails in ways that all look identical from the outside: no key,
 * a key with the wrong APIs enabled, a key restricted to the wrong bundle id,
 * or a query that genuinely matches nothing. Every one of them ends as an empty
 * list on screen.
 *
 * These logs exist to tell those apart in seconds. Filter the Metro console for
 * `[places]`. They only run in development, and the key is always masked —
 * a full Maps key in a shared log is a key someone else can bill you for.
 */

const PLACES_LOG = "[places]";

function maskKey(key: string | undefined): string {
  if (!key) return "(none)";
  if (key.length <= 10) return `${key.slice(0, 2)}…(${key.length} chars)`;
  return `${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)`;
}

function placesLog(message: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (detail) console.log(`${PLACES_LOG} ${message}`, detail);
  else console.log(`${PLACES_LOG} ${message}`);
}

const keyFromExpoPublic = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const keyFromPlain = process.env.GOOGLE_MAPS_API_KEY?.trim();
const keyFromExtra =
  typeof Constants.expoConfig?.extra?.googleMapsApiKey === "string"
    ? Constants.expoConfig.extra.googleMapsApiKey.trim()
    : undefined;

const googleMapsApiKey = keyFromExpoPublic || keyFromPlain || keyFromExtra;

/** Which of the three sources actually supplied the key. */
const keySource = keyFromExpoPublic
  ? "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"
  : keyFromPlain
    ? "GOOGLE_MAPS_API_KEY"
    : keyFromExtra
      ? "app.config.js → extra.googleMapsApiKey"
      : "(nowhere — no key found)";

if (__DEV__) {
  if (googleMapsApiKey) {
    console.log(`${PLACES_LOG} key loaded from ${keySource}: ${maskKey(googleMapsApiKey)}`);
  } else {
    console.warn(
      `${PLACES_LOG} NO API KEY. Place search and geocoding will fail on every request.\n` +
        `${PLACES_LOG} Checked, in order:\n` +
        `${PLACES_LOG}   1. EXPO_PUBLIC_GOOGLE_MAPS_API_KEY  → ${keyFromExpoPublic ? "set" : "not set"}\n` +
        `${PLACES_LOG}   2. GOOGLE_MAPS_API_KEY              → ${keyFromPlain ? "set" : "not set"}\n` +
        `${PLACES_LOG}   3. app.config.js extra              → ${keyFromExtra ? "set" : "not set"}\n` +
        `${PLACES_LOG} Put it in .env at the project root, then RESTART Metro with -c ` +
        `(EXPO_PUBLIC_* vars are inlined at build time, so a hot reload will not pick it up).`,
    );
  }
}

/**
 * What a Google status code actually means for whoever is reading the log.
 * The codes are terse and two of them are routinely misread as "no results".
 */
function explainGoogleStatus(status: string | undefined): string {
  switch (status) {
    case "REQUEST_DENIED":
      return "the key was rejected — the API is probably not enabled on it, or an app/IP restriction excludes this build";
    case "OVER_QUERY_LIMIT":
      return "billing is not enabled on the Google Cloud project, or the daily quota is spent";
    case "INVALID_REQUEST":
      return "a required parameter was missing or malformed";
    case "ZERO_RESULTS":
      return "the request worked; Google simply has no match for that text";
    case "UNKNOWN_ERROR":
      return "a transient Google-side failure — retrying usually works";
    default:
      return "unrecognised status";
  }
}
/**
 * Where to bias search results towards — the device's own position.
 *
 * Set by the location provider as fixes arrive. Everything here used to be
 * anchored to Lagos: results were *restricted* to 45 km of Lagos island, and
 * every query had ", Lagos, Nigeria" appended to it. A rider in Abuja typing
 * "Wuse 2" was searching for "Wuse 2, Lagos, Nigeria", which does not exist, so
 * the box returned nothing and looked broken.
 *
 * Bias is not a filter: results outside it still come back, they just rank
 * lower. That is the correct tool here — someone in Ikeja searching for a place
 * in Ibadan should still find it.
 */
let searchBias: { lat: number; lng: number } | null = null;

export function setPlaceSearchBias(coords: { lat: number; lng: number } | null): void {
  searchBias = coords;
}

function getGoogleMapsApiKey(): string {
  if (!googleMapsApiKey) {
    // The console warning at module load carries the diagnosis; this is what
    // the rider sees, and it must not mention an environment variable.
    throw new Error("Place search is unavailable right now. Please type your address in full.");
  }

  return googleMapsApiKey;
}

function cleanPart(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function joinUnique(parts: (string | null)[]): string[] {
  const seen = new Set<string>();

  return parts.filter((part): part is string => {
    if (!part) {
      return false;
    }

    const normalized = part.toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function buildContextualQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  // Only ever add the country. Appending a city the rider did not type is how
  // "Wuse 2" became "Wuse 2, Lagos, Nigeria" and stopped resolving — the
  // country keeps results in Nigeria, and `searchBias` handles proximity.
  const normalized = trimmed.toLowerCase();
  if (normalized.includes("nigeria")) {
    return trimmed;
  }

  return `${trimmed}, Nigeria`;
}

function splitDescription(description: string | undefined): {
  title: string;
  subtitle: string;
} {
  const normalized = cleanPart(description) ?? "";
  if (!normalized) {
    return {
      title: "",
      subtitle: "",
    };
  }

  const [title, ...rest] = normalized.split(",").map((part) => part.trim());

  return {
    title: title ?? normalized,
    subtitle: rest.join(", "),
  };
}

function mapGoogleTypesToIcon(types: string[] | undefined): PlaceSuggestion["icon"] {
  const normalizedTypes = types ?? [];

  if (
    normalizedTypes.includes("airport") ||
    normalizedTypes.includes("transit_station")
  ) {
    return "flight";
  }

  if (
    normalizedTypes.includes("shopping_mall") ||
    normalizedTypes.includes("store") ||
    normalizedTypes.includes("supermarket") ||
    normalizedTypes.includes("restaurant") ||
    normalizedTypes.includes("cafe")
  ) {
    return "storefront";
  }

  return "location-on";
}

function mapPredictionToSuggestion(
  prediction: GoogleAutocompletePrediction,
): PlaceSuggestion | null {
  const placeId = cleanPart(prediction.place_id);
  const description = cleanPart(prediction.description);

  if (!placeId || !description) {
    return null;
  }

  const mainText = cleanPart(prediction.structured_formatting?.main_text);
  const secondaryText = cleanPart(prediction.structured_formatting?.secondary_text);
  const fallback = splitDescription(description);
  const title = mainText ?? fallback.title;
  const subtitle = secondaryText ?? fallback.subtitle;

  return {
    id: placeId,
    title,
    subtitle,
    icon: mapGoogleTypesToIcon(prediction.types),
    address: description,
  };
}

function hasAddressType(
  result: GoogleGeocodeResult,
  expectedType: string,
  matchValue?: string,
): boolean {
  return (result.address_components ?? []).some((component) => {
    if (!(component.types ?? []).includes(expectedType)) {
      return false;
    }

    if (!matchValue) {
      return true;
    }

    const normalizedMatch = matchValue.toLowerCase();
    return (
      component.long_name?.toLowerCase() === normalizedMatch ||
      component.short_name?.toLowerCase() === normalizedMatch
    );
  });
}

function isGoogleResultInNigeria(result: GoogleGeocodeResult): boolean {
  return hasAddressType(result, "country", "ng") || hasAddressType(result, "country", "nigeria");
}

function scoreGeocodeResult(result: GoogleGeocodeResult): number {
  let score = 0;

  if (hasAddressType(result, "street_address")) score += 8;
  if (hasAddressType(result, "premise")) score += 6;
  if (hasAddressType(result, "subpremise")) score += 4;
  if (hasAddressType(result, "route")) score += 3;
  if (hasAddressType(result, "neighborhood")) score += 2;
  if (hasAddressType(result, "locality", "lagos")) score += 5;
  if (hasAddressType(result, "administrative_area_level_1", "lagos")) score += 5;
  if (cleanPart(result.formatted_address)?.toLowerCase().includes("lagos")) score += 3;

  return score;
}

/** How long a place search may take before the rider is told it is not getting through. */
const GOOGLE_TIMEOUT_MS = 10_000;

/**
 * A request to Google that cannot hang. On a network that connects to Google
 * and then stalls, a plain fetch never comes back: the search just showed
 * nothing, with no error to say why.
 */
async function fetchGoogle(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    placesLog("no answer from Google", { afterMs: GOOGLE_TIMEOUT_MS });
    throw new Error("We could not reach the map search. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGoogleAutocompletePredictions(
  query: string,
): Promise<GoogleAutocompletePrediction[]> {
  const body: Record<string, unknown> = {
    input: query,
    languageCode: "en",
    includedRegionCodes: ["ng"],
  };

  if (searchBias) {
    body.locationBias = {
      circle: {
        center: { latitude: searchBias.lat, longitude: searchBias.lng },
        radius: 50000,
      },
    };
  }

  placesLog("autocomplete (new) →", {
    query,
    bias: searchBias ? `${searchBias.lat.toFixed(4)},${searchBias.lng.toFixed(4)}` : "none",
    key: maskKey(googleMapsApiKey),
  });

  const response = await fetchGoogle("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGoogleMapsApiKey(),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        types?: string[];
      };
    }[];
    error?: { code?: number; message?: string; status?: string };
  };

  if (!response.ok) {
    placesLog(`autocomplete (new) ← HTTP ${response.status}`, { body: data });
    throw new Error(data.error?.message ?? `google_places_failed:${response.status}`);
  }

  const predictions = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      place_id: p.placeId!,
      description: p.text?.text ?? "",
      structured_formatting: {
        main_text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary_text: p.structuredFormat?.secondaryText?.text ?? "",
      },
      types: p.types ?? [],
    })) as GoogleAutocompletePrediction[];

  placesLog("autocomplete (new) ←", { predictions: predictions.length });
  return predictions;
}

async function fetchGoogleGeocodeResults(query: string): Promise<GoogleGeocodeResult[]> {
  const params = new URLSearchParams({
    address: query,
    key: getGoogleMapsApiKey(),
    language: "en",
    region: "ng",
    components: "country:NG",
  });

  if (searchBias) {
    // A ~0.45° box around the rider. Geocode treats `bounds` as a preference,
    // so a match outside it is still returned.
    params.set(
      "bounds",
      `${searchBias.lat - 0.45},${searchBias.lng - 0.45}|${searchBias.lat + 0.45},${searchBias.lng + 0.45}`,
    );
  }

  placesLog("geocode →", { query, key: maskKey(googleMapsApiKey) });

  const response = await fetchGoogle(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
  );
  const data = (await response.json()) as GoogleGeocodeResponse;

  if (!response.ok) {
    placesLog(`geocode ← HTTP ${response.status}`, { body: data });
    throw new Error(`google_geocode_failed:${response.status}`);
  }

  placesLog(`geocode ← ${data.status}`, {
    results: data.results?.length ?? 0,
    ...(data.error_message ? { error_message: data.error_message } : {}),
  });

  if (__DEV__ && data.status && !["OK", "ZERO_RESULTS"].includes(data.status)) {
    console.warn(
      `${PLACES_LOG} Geocoding returned ${data.status} — ${explainGoogleStatus(data.status)}.` +
        (data.error_message ? `\n${PLACES_LOG} Google said: ${data.error_message}` : "") +
        `\n${PLACES_LOG} Enable "Geocoding API" on this key — it is a SEPARATE API from Places.`,
    );
  }

  if (data.status === "OK") {
    return data.results ?? [];
  }

  if (data.status === "ZERO_RESULTS") {
    return [];
  }

  throw new Error(data.error_message ?? `google_geocode_failed:${data.status ?? "unknown"}`);
}

function mapGeocodeResultToResolvedPlace(result: GoogleGeocodeResult): ResolvedPlace | null {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  const address = cleanPart(result.formatted_address);

  if (typeof lat !== "number" || typeof lng !== "number" || !address) {
    return null;
  }

  return {
    lat,
    lng,
    address,
  };
}

/**
 * "GFVQ+VQ4": a Plus Code, what Google gives a spot with no street address.
 * Exact, but nobody reads it as a place, so it is never shown as one.
 */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}(\b|$)/i;

export function isPlusCode(text: string | null | undefined): boolean {
  return typeof text === "string" && PLUS_CODE.test(text.trim());
}

/** Spot-level answers only: a reverse lookup asked for these never comes back as a Plus Code. */
const SPOT_TYPES = "street_address|premise|subpremise|route|point_of_interest|establishment|neighborhood|sublocality";

/**
 * A name a person reads for the spot the phone is on: the street if Google
 * has one, else the neighbourhood and town ("Ilemere Rd, Ikorodu, Lagos").
 * Null when Google has nothing better or is not set up.
 */
export async function readableNameForSpot(lat: number, lng: number): Promise<string | null> {
  if (!googleMapsApiKey) return null;
  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: googleMapsApiKey, language: "en", result_type: SPOT_TYPES });
  const response = await fetchGoogle(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (!response.ok) return null;
  const data = (await response.json()) as GoogleGeocodeResponse;
  for (const result of data.results ?? []) {
    const name = nameFromComponents(result.address_components ?? []);
    if (name) return name;
  }
  return null;
}

function nameFromComponents(components: GoogleAddressComponent[]): string | null {
  const part = (...types: string[]) =>
    cleanPart(components.find((component) => types.some((type) => (component.types ?? []).includes(type)))?.long_name);
  const number = part("street_number");
  const route = part("route");
  const street = route && !/^unnamed road$/i.test(route) ? (number ? `${number} ${route}` : route) : null;
  const parts = [part("premise", "point_of_interest", "establishment"), street, part("neighborhood", "sublocality_level_1", "sublocality"), part("locality", "administrative_area_level_2"), part("administrative_area_level_1")]
    .filter((value): value is string => value !== null && !isPlusCode(value))
    .filter((value, index, list) => list.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);
  // A town alone ("Lagos") says too little to be worth showing over the phone's own answer.
  return parts.length >= 2 ? parts.join(", ") : null;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(googleMapsApiKey);
}

export async function fetchGooglePlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    return [];
  }

  const contextualQuery = buildContextualQuery(normalizedInput);
  const predictions = await fetchGoogleAutocompletePredictions(contextualQuery);

  return predictions
    .map(mapPredictionToSuggestion)
    .filter((item): item is PlaceSuggestion => item != null)
    .filter((item, index, items) => {
      const key = `${item.title.toLowerCase()}|${item.address.toLowerCase()}`;
      return (
        items.findIndex((candidate) => {
          const candidateKey = `${candidate.title.toLowerCase()}|${candidate.address.toLowerCase()}`;
          return candidateKey === key;
        }) === index
      );
    })
    .slice(0, 8);
}

export async function resolvePlaceQuery(input: string): Promise<ResolvedPlace> {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    throw new Error("A destination is required before requesting a ride.");
  }

  const cacheKey = normalizedInput.toLowerCase();
  const exact = exactPlaces.get(cacheKey);
  if (exact) return exact;

  const cached = resolvedPlaceCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < RESOLVED_PLACE_CACHE_TTL_MS) {
    return cached.value;
  }

  const inflight = resolvedPlaceInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const queries = joinUnique([buildContextualQuery(normalizedInput), normalizedInput]);

    for (const query of queries) {
      const results = await fetchGoogleGeocodeResults(query);
      const resolved = results
        .filter(isGoogleResultInNigeria)
        .sort((left, right) => scoreGeocodeResult(right) - scoreGeocodeResult(left))
        .map(mapGeocodeResultToResolvedPlace)
        .find((item): item is ResolvedPlace => item != null);

      if (resolved) {
        resolvedPlaceCache.set(cacheKey, {
          value: resolved,
          cachedAt: Date.now(),
        });
        return resolved;
      }
    }

    placesLog("resolve failed — no usable result in Nigeria", { input, tried: queries });
    throw new Error(
      `We could not find "${input}". Try adding the city, or pick a suggestion from the list.`,
    );
  })();

  resolvedPlaceInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    resolvedPlaceInflight.delete(cacheKey);
  }
}
