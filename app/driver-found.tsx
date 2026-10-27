import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  RAvatar,
  RButton,
  RCard,
  RLink,
  RPill,
  RScreen,
  RStepBar,
  RText,
  naira,
  rider,
} from "@/components/rider/kit";
import { parseRideItineraryParam, serializeRideItinerary } from "@/lib/ride-route";
import { useRideSession } from "@/lib/ride-session";
import { useGoHome } from "@/hooks/use-go-home";
import { useSearchAgainRedirect } from "@/hooks/use-search-again-redirect";

const { colors, fonts } = rider;

/**
 * Step 4 of getting a ride: the driver the rider chose has been confirmed.
 * Who they are, what was agreed, what to look for, and on to the live trip.
 */
export default function DriverFoundScreen() {
  const router = useRouter();
  const goHome = useGoHome();
  const params = useLocalSearchParams<{
    itinerary?: string | string[];
  }>();
  const fallbackItinerary = useMemo(
    () => parseRideItineraryParam(params.itinerary),
    [params.itinerary],
  );
  const { currentRide } = useRideSession();
  const itinerary = currentRide?.itinerary ?? fallbackItinerary;
  const liveDriver = currentRide?.driver;
  const status = currentRide?.status;
  const hasRide = Boolean(currentRide) && status !== "cancelled" && status !== "completed";

  // Opened with no ride, or the ride ended while this was on screen: nothing
  // here is true any more. Only while this screen is in front, so it does not
  // pull the rider off the cancel screen opened on top of it.
  useFocusEffect(
    useCallback(() => {
      if (!hasRide) goHome();
    }, [hasRide, goHome]),
  );

  // The driver pulled out and the search goes on (searchingAgain): back to Finding drivers.
  useSearchAgainRedirect("replace");

  if (!hasRide) {
    return <RScreen>{null}</RScreen>;
  }

  const etaMinutes = liveDriver?.etaSeconds
    ? Math.max(1, Math.ceil(liveDriver.etaSeconds / 60))
    : null;
  const agreedNgn = liveDriver?.lockedFareNgn ?? currentRide?.fareEstimateNgn;
  const hasFare = typeof agreedNgn === "number" && Number.isFinite(agreedNgn);
  const driverName = liveDriver?.driverName?.trim() || null;
  const firstName = driverName ? driverName.split(/\s+/)[0] : null;
  const rating =
    typeof liveDriver?.driverRating === "number" && liveDriver.driverRating > 0
      ? `${liveDriver.driverRating.toFixed(1)} rating`
      : null;

  const rows: { label: string; value: string; plate?: boolean }[] = [];
  if (liveDriver?.vehicleModel) rows.push({ label: "Car", value: liveDriver.vehicleModel });
  if (liveDriver?.vehiclePlate) {
    rows.push({ label: "Plate number", value: liveDriver.vehiclePlate, plate: true });
  }
  if (etaMinutes !== null) {
    rows.push({
      label: "Arrives in",
      value: etaMinutes === 1 ? "1 minute" : `${etaMinutes} minutes`,
    });
  }

  function handleTrack() {
    router.replace({
      pathname: "/rider/active-trip",
      params: { itinerary: serializeRideItinerary(itinerary) },
    });
  }

  return (
    <RScreen contentStyle={styles.screen}>
      <StatusBar style="dark" backgroundColor={colors.cream} />
      <RStepBar active={4} />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <View style={styles.hero}>
          <RPill icon="checkmark" label="Driver confirmed" />
          <RAvatar name={driverName} ring={colors.ink} size={112} />
          <RText variant="display" style={styles.title}>
            {firstName ? `${firstName} is your driver` : "Your driver is confirmed"}
          </RText>
          {rating ? <RText color={colors.muted}>{rating}</RText> : null}
        </View>

        {hasFare ? (
          <RCard tone="ink" style={styles.priceCard}>
            <View style={styles.priceText}>
              <RText variant="small" color={colors.onInkMuted}>
                Agreed price
              </RText>
              <RText variant="small" color={colors.onInkSoft}>
                Paid from your wallet
              </RText>
            </View>
            <RText
              adjustsFontSizeToFit
              color={colors.orange}
              numberOfLines={1}
              style={styles.priceFigure}
              variant="figure">
              {naira(agreedNgn)}
            </RText>
          </RCard>
        ) : null}

        {rows.length > 0 ? (
          <RCard style={styles.detailCard}>
            {rows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.detailRow, index < rows.length - 1 ? styles.detailDivider : null]}>
                <RText variant="small" color={colors.muted} style={styles.detailLabel}>
                  {row.label}
                </RText>
                {row.plate ? (
                  <View style={styles.plate}>
                    <RText style={styles.plateText}>{row.value}</RText>
                  </View>
                ) : (
                  <RText variant="smallBold" numberOfLines={2} style={styles.detailValue}>
                    {row.value}
                  </RText>
                )}
              </View>
            ))}
          </RCard>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <RButton onPress={handleTrack} title="Track your driver" />
        <RLink
          color={colors.danger}
          onPress={() => router.push("/rider-cancel")}
          title="Cancel ride"
        />
      </View>
    </RScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: rider.gutter, paddingTop: 16, paddingBottom: 12, gap: 12 },
  scroll: { flex: 1 },
  body: { gap: 16, paddingBottom: 16 },
  hero: { alignItems: "center", gap: 12, paddingTop: 10 },
  title: { fontSize: 32, lineHeight: 35, textAlign: "center" },

  priceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 18,
  },
  priceText: { gap: 2 },
  priceFigure: { flex: 1, textAlign: "right", fontSize: 40, lineHeight: 46 },

  detailCard: { paddingVertical: 4, borderRadius: 20 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 48,
    paddingVertical: 12,
  },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  detailLabel: { fontSize: 15 },
  detailValue: { fontSize: 15, textAlign: "right" },
  plate: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  plateText: { fontFamily: fonts.displayBold, fontSize: 15, lineHeight: 20, letterSpacing: 0.6 },

  footer: { gap: 6 },
});
