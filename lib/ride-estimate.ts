import {
  parseRideEstimateWaypoint,
  parseRideRouteGeometry,
  type RideEstimateResponse,
} from "@/lib/api";
import { estimateRide, type RideItinerary } from "@/lib/ride-route";
import { parsePriceReason } from "@/lib/price-reason";

export function buildInstantRideEstimate(
  itinerary: RideItinerary,
): RideEstimateResponse {
  const preview = estimateRide(itinerary);

  return {
    plannedDistanceKm: preview.distanceKm,
    plannedDurationSeconds: preview.etaMinutes * 60,
    fareEstimateNgn: preview.priceNgn,
  };
}

export function serializeRideEstimate(estimate: RideEstimateResponse): string {
  return encodeURIComponent(JSON.stringify(estimate));
}

export function parseRideEstimateParam(
  value: string | string[] | undefined,
): RideEstimateResponse | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<RideEstimateResponse>;
    if (
      typeof parsed.plannedDistanceKm !== "number" ||
      !Number.isFinite(parsed.plannedDistanceKm) ||
      typeof parsed.plannedDurationSeconds !== "number" ||
      !Number.isFinite(parsed.plannedDurationSeconds) ||
      typeof parsed.fareEstimateNgn !== "number" ||
      !Number.isFinite(parsed.fareEstimateNgn)
    ) {
      return null;
    }

    return {
      plannedDistanceKm: parsed.plannedDistanceKm,
      plannedDurationSeconds: parsed.plannedDurationSeconds,
      fareEstimateNgn: parsed.fareEstimateNgn,
      priceReason: parsePriceReason(parsed.priceReason),
      pickup: parseRideEstimateWaypoint(parsed.pickup) ?? undefined,
      destination: parseRideEstimateWaypoint(parsed.destination) ?? undefined,
      stops: Array.isArray(parsed.stops)
        ? parsed.stops
            .map((stop) => parseRideEstimateWaypoint(stop))
            .filter((stop): stop is NonNullable<RideEstimateResponse["stops"]>[number] => stop != null)
        : undefined,
      route: parseRideRouteGeometry(parsed.route) ?? undefined,
    };
  } catch {
    return null;
  }
}
