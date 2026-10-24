import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RBack, RButton, RCard, RLink, RScreen, RText, naira, rider } from "@/components/rider/kit";
import { useResponsive } from "@/lib/responsive";
import { parseRideEstimateParam } from "@/lib/ride-estimate";
import { parseRideItineraryParam } from "@/lib/ride-route";
import {
  MIN_LEAD_MINUTES,
  dayHasTime,
  dayWords,
  halfHourSlots,
  isPickupAllowed,
  minutesWords,
  pickupAt,
  routeWords,
  scheduleDays,
  type ScheduleDay,
} from "@/lib/trip-words";

const { colors, fonts, radius } = rider;

const TOO_SOON = `Choose a time at least ${MIN_LEAD_MINUTES} minutes from now.`;
const TIME_COLUMNS = 4;
const TIME_GAP = 8;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ScheduleRideScreen() {
  const router = useRouter();
  // The row of days runs to the screen's edges; its chips start at the gutter.
  const { gutter } = useResponsive();
  const params = useLocalSearchParams<{ itinerary?: string | string[]; estimate?: string | string[] }>();
  const itineraryParam = first(params.itinerary);
  const estimateParam = first(params.estimate);

  // The clock the choices are measured against; it moves on so a time that
  // was 16 minutes away does not stay on offer after it has become 14.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const [pickedMinutes, setPickedMinutes] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const days = useMemo(() => scheduleDays(now), [now]);
  // Late at night today may have nothing left: the first day that does is chosen.
  const day: ScheduleDay =
    (pickedDay !== null && dayHasTime(days[pickedDay]!.start, now) ? days[pickedDay] : null) ??
    days.find((candidate) => dayHasTime(candidate.start, now)) ??
    days[1]!;
  const dayStartMs = day.start.getTime();
  const slots = useMemo(() => halfHourSlots(new Date(dayStartMs), now), [dayStartMs, now]);
  const minutes =
    pickedMinutes !== null && isPickupAllowed(pickupAt(day.start, pickedMinutes), now)
      ? pickedMinutes
      : (slots[0] ?? null);
  // A time from "Choose another time" sits among the half hours, in order.
  const choices = useMemo(
    () => (minutes === null || slots.includes(minutes) ? slots : [...slots, minutes].sort((a, b) => a - b)),
    [minutes, slots],
  );
  const pickup = minutes === null ? null : pickupAt(day.start, minutes);
  const when = pickup && minutes !== null ? `${dayWords(pickup, now)}, ${minutesWords(minutes)}` : "Choose a time";

  const route = useMemo(() => {
    if (!itineraryParam) return null;
    const itinerary = parseRideItineraryParam(itineraryParam);
    return routeWords(itinerary.pickup, itinerary.stops[itinerary.stops.length - 1]);
  }, [itineraryParam]);
  // Only a price the server worked out for this route is shown.
  const priceNgn = useMemo(() => {
    const estimate = parseRideEstimateParam(estimateParam);
    return estimate?.pickup && estimate.destination ? estimate.fareEstimateNgn : null;
  }, [estimateParam]);

  const chooseDay = (index: number) => {
    setPickedDay(index);
    setProblem(null);
  };
  const chooseMinutes = (value: number) => {
    setPickedMinutes(value);
    setProblem(null);
  };

  const onContinue = () => {
    const current = new Date();
    if (!pickup || !isPickupAllowed(pickup, current)) {
      setNow(current);
      setProblem(pickup ? `That time is too close. ${TOO_SOON}` : "Choose a pickup time.");
      return;
    }
    const scheduledAt = pickup.toISOString();
    if (itineraryParam) {
      // Back to the price screen this came from, with the time: not a second price screen on top of it.
      router.dismissTo({
        pathname: "/ride-selection",
        params: {
          itinerary: itineraryParam,
          ...(estimateParam ? { estimate: estimateParam } : null),
          scheduledAt,
        },
      } as Href);
      return;
    }
    router.push({ pathname: "/destination-search", params: { scheduledAt } } as Href);
  };

  const chipWidth =
    gridWidth > 0 ? Math.floor((gridWidth - TIME_GAP * (TIME_COLUMNS - 1)) / TIME_COLUMNS) : 0;

  return (
    <RScreen bounces contentStyle={styles.screen} scroll>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <RBack
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/rider" as Href);
          }}
        />
        <RText accessibilityRole="header" style={styles.title} variant="title">
          Schedule a ride
        </RText>
      </View>
      <RText color={colors.muted}>Choose your pickup day and time.</RText>

      <View style={styles.group}>
        <RText variant="label">DAY</RText>
        <ScrollView
          contentContainerStyle={[styles.days, { paddingHorizontal: gutter }]}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -gutter }}>
          {days.map((candidate) => {
            const on = candidate.index === day.index;
            const open = dayHasTime(candidate.start, now);
            return (
              <Pressable
                accessibilityLabel={dayWords(candidate.start, now)}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !open }}
                disabled={!open}
                key={candidate.index}
                onPress={() => chooseDay(candidate.index)}
                style={({ pressed }) => [
                  styles.day,
                  on ? styles.dayOn : null,
                  open ? null : styles.dimmed,
                  pressed ? styles.pressed : null,
                ]}>
                <RText color={on ? colors.onInkMuted : colors.muted} style={styles.dayTop}>
                  {candidate.top}
                </RText>
                <RText color={on ? colors.orange : colors.ink} style={styles.dayNum}>
                  {candidate.num}
                </RText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.group}>
        <RText variant="label">PICKUP TIME</RText>
        <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={styles.times}>
          {chipWidth > 0
            ? choices.map((value) => {
                const on = value === minutes;
                return (
                  <Pressable
                    accessibilityLabel={minutesWords(value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    key={value}
                    onPress={() => chooseMinutes(value)}
                    style={({ pressed }) => [
                      styles.time,
                      { width: chipWidth },
                      on ? styles.timeOn : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <RText
                      adjustsFontSizeToFit
                      maxFontSizeMultiplier={1.1}
                      numberOfLines={1}
                      style={[styles.timeText, on ? styles.timeTextOn : null]}>
                      {minutesWords(value)}
                    </RText>
                  </Pressable>
                );
              })
            : null}
        </View>
        {choices.length === 0 ? (
          <RText color={colors.muted} variant="small">
            No half-hour times are left today. Choose another time or another day.
          </RText>
        ) : null}
        <Pressable
          accessibilityLabel="Choose another time"
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.another, pressed ? styles.pressed : null]}>
          <RText color={colors.orangeText} style={styles.anotherText}>
            Choose another time
          </RText>
        </Pressable>
      </View>

      <RCard style={styles.summary} tone="ink">
        <RText color={colors.onInkMuted} variant="small">
          Pickup
        </RText>
        <RText accessibilityLiveRegion="polite" color={colors.orange} style={styles.summaryWhen} variant="figure">
          {when}
        </RText>
        {route || priceNgn !== null ? (
          <View style={styles.summaryRoute}>
            <RText color={colors.onInkSoft} numberOfLines={2} style={styles.summaryRouteText}>
              {route ?? ""}
            </RText>
            {priceNgn !== null ? (
              <RText color={colors.cream} style={styles.summaryPrice} variant="figure">
                {naira(priceNgn)}
              </RText>
            ) : null}
          </View>
        ) : null}
      </RCard>

      <View style={styles.notes}>
        <RText color={colors.muted} variant="small">
          You are charged only after a driver accepts.
        </RText>
        <RText color={colors.muted} variant="small">
          You can cancel this ride in Trips.
        </RText>
      </View>

      <View style={styles.spacer} />
      {problem ? (
        <RText accessibilityLiveRegion="polite" color={colors.danger} variant="smallBold">
          {problem}
        </RText>
      ) : null}
      <RButton
        accessibilityLabel={pickup ? `Continue with pickup ${when}` : "Continue"}
        disabled={!pickup}
        onPress={onContinue}
        title="Continue"
      />

      {pickerOpen ? (
        <TimePicker
          day={day}
          initialMinutes={minutes}
          onClose={() => setPickerOpen(false)}
          onSet={(value) => {
            chooseMinutes(value);
            setPickedDay(day.index);
            setNow(new Date());
            setPickerOpen(false);
          }}
        />
      ) : null}
    </RScreen>
  );
}

/* ── choose another time ───────────────────────────────────────────────── */

const MINUTE_STEP = 5;

/** The first five-minute mark on this day that can be scheduled. */
function earliestMinutes(day: ScheduleDay, now: Date): number {
  for (let value = 0; value < 24 * 60; value += MINUTE_STEP) {
    if (isPickupAllowed(pickupAt(day.start, value), now)) return value;
  }
  return 0;
}

function TimePicker({
  day,
  initialMinutes,
  onSet,
  onClose,
}: {
  day: ScheduleDay;
  initialMinutes: number | null;
  onSet: (minutesOfDay: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [start] = useState(() => {
    const from = initialMinutes ?? earliestMinutes(day, new Date());
    return from - (from % MINUTE_STEP);
  });
  const [hour12, setHour12] = useState(() => {
    const hour = Math.floor(start / 60) % 12;
    return hour === 0 ? 12 : hour;
  });
  const [minute, setMinute] = useState(() => start % 60);
  const [pm, setPm] = useState(() => start >= 12 * 60);
  const [tooSoon, setTooSoon] = useState(false);

  const value = ((hour12 % 12) + (pm ? 12 : 0)) * 60 + minute;
  const change = (apply: () => void) => {
    apply();
    setTooSoon(false);
  };

  const confirm = () => {
    if (!isPickupAllowed(pickupAt(day.start, value), new Date())) {
      setTooSoon(true);
      return;
    }
    onSet(value);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.sheetWrap}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.sheetHead}>
            <View style={styles.sheetHeadWords}>
              <RText accessibilityRole="header" variant="heading">
                Choose a time
              </RText>
              <RText color={colors.muted} variant="small">
                {dayWords(day.start, new Date())}
              </RText>
            </View>
            <RBack icon="close" label="Close" onPress={onClose} />
          </View>

          <View style={styles.dials}>
            <Dial
              label="Hour"
              onDown={() => change(() => setHour12((hour) => (hour === 1 ? 12 : hour - 1)))}
              onUp={() => change(() => setHour12((hour) => (hour === 12 ? 1 : hour + 1)))}
              value={String(hour12)}
            />
            <RText style={styles.dialColon}>:</RText>
            <Dial
              label="Minute"
              onDown={() => change(() => setMinute((current) => (current - MINUTE_STEP + 60) % 60))}
              onUp={() => change(() => setMinute((current) => (current + MINUTE_STEP) % 60))}
              value={String(minute).padStart(2, "0")}
            />
            <View style={styles.halves}>
              {[
                { label: "am", spoken: "a.m.", on: !pm, set: false },
                { label: "pm", spoken: "p.m.", on: pm, set: true },
              ].map((half) => (
                <Pressable
                  accessibilityLabel={half.spoken}
                  accessibilityRole="button"
                  accessibilityState={{ selected: half.on }}
                  key={half.label}
                  onPress={() => change(() => setPm(half.set))}
                  style={({ pressed }) => [
                    styles.half,
                    half.on ? styles.halfOn : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <RText color={half.on ? colors.cream : colors.ink} style={styles.halfText}>
                    {half.label}
                  </RText>
                </Pressable>
              ))}
            </View>
          </View>

          <RText
            accessibilityLiveRegion="polite"
            color={tooSoon ? colors.danger : colors.muted}
            style={styles.sheetNote}
            variant={tooSoon ? "smallBold" : "small"}>
            {tooSoon ? `${minutesWords(value)} is too close. ${TOO_SOON}` : TOO_SOON}
          </RText>

          <RButton
            accessibilityLabel={`Set pickup time to ${minutesWords(value)}`}
            onPress={confirm}
            title={`Set ${minutesWords(value)}`}
          />
          <RLink accessibilityLabel="Cancel" onPress={onClose} title="Cancel" />
        </View>
      </View>
    </Modal>
  );
}

function Dial({
  label,
  value,
  onUp,
  onDown,
}: {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <View style={styles.dial}>
      <Pressable
        accessibilityLabel={`${label} up, now ${value}`}
        accessibilityRole="button"
        onPress={onUp}
        style={({ pressed }) => [styles.dialButton, pressed ? styles.pressed : null]}>
        <Ionicons color={colors.ink} name="chevron-up" size={24} />
      </Pressable>
      <RText accessibilityLabel={`${label} ${value}`} maxFontSizeMultiplier={1.1} style={styles.dialValue}>
        {value}
      </RText>
      <Pressable
        accessibilityLabel={`${label} down, now ${value}`}
        accessibilityRole="button"
        onPress={onDown}
        style={({ pressed }) => [styles.dialButton, pressed ? styles.pressed : null]}>
        <Ionicons color={colors.ink} name="chevron-down" size={24} />
      </Pressable>
      <RText variant="caption">{label}</RText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 26, lineHeight: 30 },
  group: { gap: 8 },
  spacer: { flexGrow: 1 },
  pressed: { opacity: 0.72 },
  dimmed: { opacity: 0.4 },

  days: { gap: 8 },
  day: {
    width: 63,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dayOn: { backgroundColor: colors.ink },
  dayTop: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  dayNum: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"] },

  times: { flexDirection: "row", flexWrap: "wrap", gap: TIME_GAP, minHeight: 48 },
  time: {
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  timeOn: { borderColor: colors.orange, backgroundColor: colors.orange },
  timeText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  timeTextOn: { fontFamily: fonts.heavy },
  another: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  anotherText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, textDecorationLine: "underline" },

  summary: { padding: 18, gap: 10 },
  summaryWhen: { fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  summaryRoute: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  summaryRouteText: { flex: 1, fontSize: 15, lineHeight: 20 },
  summaryPrice: { fontSize: 20, lineHeight: 24, flexShrink: 0 },
  notes: { gap: 6 },

  sheetWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(13,13,13,0.5)" },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: rider.gutter,
    paddingTop: 20,
    gap: 12,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sheetHeadWords: { flex: 1, minWidth: 0, gap: 2 },
  sheetNote: { textAlign: "center" },
  dials: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 4 },
  dial: { alignItems: "center", gap: 2 },
  dialButton: {
    width: 76,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dialValue: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 56,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    minWidth: 76,
  },
  dialColon: { fontFamily: fonts.display, fontSize: 40, lineHeight: 56, marginBottom: 20 },
  halves: { gap: 8, marginLeft: 6, marginBottom: 20 },
  half: {
    width: 64,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  halfOn: { backgroundColor: colors.ink },
  halfText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20 },
});
