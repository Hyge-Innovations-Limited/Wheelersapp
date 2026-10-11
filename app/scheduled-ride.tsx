import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { RBack, RButton, RCard, RLink, RPill, RScreen, RText, naira, rider } from "@/components/rider/kit";
import { useHasLoaded } from "@/lib/rider-trips";
import { useScheduledRides } from "@/lib/scheduled-rides";
import { parseDate, pickupWords, routeWords, timeWords } from "@/lib/trip-words";

const { colors, fonts } = rider;

const TRIPS_UPCOMING = { pathname: "/rider/history", params: { tab: "scheduled" } } as Href;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ScheduledRideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = first(params.id);
  const { rawItems, isLoading, error, cancelItem, refresh } = useScheduledRides(30);
  const loaded = useHasLoaded(isLoading);
  const [cancelling, setCancelling] = useState(false);
  const ride = rawItems.find((item) => item.id === id) ?? null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(TRIPS_UPCOMING);
  };

  if (!ride) {
    // The list holds only rides still waiting; one that has started its
    // search and matched, been cancelled, or run out is no longer in it.
    const waiting = !loaded || cancelling;
    return (
      <RScreen contentStyle={styles.screen}>
        <StatusBar style="dark" />
        <RBack onPress={goBack} />
        <View style={styles.center}>
          {waiting ? (
            <>
              <ActivityIndicator accessibilityLabel="Loading your ride" color={colors.ink} />
              <RText color={colors.muted} variant="small">
                Loading your ride
              </RText>
            </>
          ) : error ? (
            <>
              <RText style={styles.centerText} variant="heading">
                We could not load this ride
              </RText>
              <RText color={colors.muted} style={styles.centerText} variant="small">
                {error}
              </RText>
              <RButton
                accessibilityLabel="Try again"
                onPress={() => void refresh()}
                size="md"
                style={styles.stretch}
                title="Try again"
                variant="ghost"
              />
              <RLink accessibilityLabel="Go to Trips" onPress={() => router.replace(TRIPS_UPCOMING)} title="Go to Trips" />
            </>
          ) : (
            <>
              <RText style={styles.centerText} variant="heading">
                This ride is no longer scheduled
              </RText>
              <RText color={colors.muted} style={styles.centerText} variant="small">
                It may have started, been cancelled, or its pickup time has passed. Check Trips for your rides.
              </RText>
              <RButton
                accessibilityLabel="Go to Trips"
                onPress={() => router.replace(TRIPS_UPCOMING)}
                size="md"
                style={styles.stretch}
                title="Go to Trips"
              />
            </>
          )}
        </View>
      </RScreen>
    );
  }

  const when = parseDate(ride.scheduledFor);
  const hasPrice = typeof ride.fareEstimateNgn === "number" && Number.isFinite(ride.fareEstimateNgn);
  const searching = ride.status === "DISPATCHING";

  const steps = [
    { title: "We find your driver", body: "The search starts shortly before your pickup time." },
    { title: "You get the driver details", body: "Name, car and plate number." },
    {
      title: when ? `Your driver arrives at ${timeWords(when)}` : "Your driver arrives",
      body: "You are charged only after a driver accepts.",
    },
  ];

  const confirmCancel = () => {
    Alert.alert(
      "Cancel this ride?",
      `${routeWords(ride.pickupAddress, ride.destAddress)}${when ? `\n${pickupWords(when, new Date())}` : ""}`,
      [
        { text: "Keep ride", style: "cancel" },
        {
          text: "Cancel ride",
          style: "destructive",
          onPress: () => {
            setCancelling(true);
            cancelItem(ride.id, "rider_cancelled_schedule")
              .then(() => {
                router.replace({
                  pathname: "/rider/history",
                  params: { tab: "scheduled", toast: "Scheduled ride cancelled." },
                } as Href);
              })
              .catch((cancelError: unknown) => {
                setCancelling(false);
                Alert.alert(
                  "Could not cancel this ride",
                  cancelError instanceof Error ? cancelError.message : "Please try again.",
                );
              });
          },
        },
      ],
    );
  };

  return (
    <RScreen bounces contentStyle={styles.screen} scroll>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <RBack onPress={goBack} />
        <RPill label={searching ? "Finding your driver" : "Ride scheduled"} tone="green" />
      </View>

      <View style={styles.head}>
        <View style={styles.headWords}>
          <RText color={colors.muted} variant="small">
            Pickup time
          </RText>
          <RText accessibilityRole="header" style={styles.title} variant="title">
            {when ? pickupWords(when, new Date()) : "Scheduled ride"}
          </RText>
        </View>
        {hasPrice ? (
          <RText color={colors.orangeText} style={styles.price} variant="figure">
            {naira(ride.fareEstimateNgn)}
          </RText>
        ) : null}
      </View>

      <RCard style={styles.route} tone="card">
        <View style={styles.routeMarks}>
          <View style={styles.markFrom} />
          <View style={styles.markLine} />
          <View style={styles.markTo} />
        </View>
        <View style={styles.routeWords}>
          <RText accessibilityLabel={`Pickup: ${ride.pickupAddress}`} style={styles.address}>
            {ride.pickupAddress}
          </RText>
          <RText accessibilityLabel={`Destination: ${ride.destAddress}`} style={styles.address}>
            {ride.destAddress}
          </RText>
        </View>
      </RCard>

      <View>
        <RText style={styles.nextLabel} variant="label">
          WHAT HAPPENS NEXT
        </RText>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepRail}>
                <View style={styles.stepDot}>
                  <RText color={colors.orange} maxFontSizeMultiplier={1} style={styles.stepNum}>
                    {index + 1}
                  </RText>
                </View>
                {last ? null : <View style={styles.stepLine} />}
              </View>
              <View style={[styles.stepWords, last ? null : styles.stepWordsGap]}>
                <RText style={styles.stepTitle}>{step.title}</RText>
                <RText color={colors.muted} variant="small">
                  {step.body}
                </RText>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.spacer} />
      <RButton
        accessibilityLabel="Done"
        disabled={cancelling}
        onPress={() => router.replace("/rider" as Href)}
        title="Done"
      />
      <RLink
        accessibilityLabel="Cancel scheduled ride"
        accessibilityState={{ disabled: cancelling, busy: cancelling }}
        color={colors.danger}
        disabled={cancelling}
        onPress={confirmCancel}
        title={cancelling ? "Cancelling" : "Cancel scheduled ride"}
      />
    </RScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  spacer: { flexGrow: 1 },
  stretch: { alignSelf: "stretch", marginTop: 8 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 32 },
  centerText: { textAlign: "center" },

  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  headWords: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 30, lineHeight: 33 },
  price: { fontSize: 26, lineHeight: 33, flexShrink: 0 },

  route: { flexDirection: "row", gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: rider.radius.lg },
  routeMarks: { alignItems: "center", paddingTop: 5, paddingBottom: 5 },
  markFrom: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
  markLine: { width: 2, flexGrow: 1, marginVertical: 4, backgroundColor: colors.line },
  markTo: { width: 12, height: 12, borderRadius: 3, backgroundColor: colors.orange },
  routeWords: { flex: 1, minWidth: 0, gap: 8 },
  address: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },

  nextLabel: { paddingBottom: 8 },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { alignItems: "center" },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18 },
  stepLine: { width: 2, flexGrow: 1, backgroundColor: colors.line },
  stepWords: { flex: 1, minWidth: 0, gap: 2 },
  stepWordsGap: { paddingBottom: 12 },
  stepTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
});
