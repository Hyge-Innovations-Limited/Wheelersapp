import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RAvatar, RBack, RText, rider } from "@/components/rider/kit";
import { useLiveCall } from "@/lib/live-call/call-session";
import { useRideSession } from "@/lib/ride-session";

const { colors, fonts } = rider;
const GREEN = "#12925F";

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The rider's call with their driver, over everything: who it is, how it is
 * going, and the buttons. "Message" and the back control tuck the call into a
 * small bar so the rider can use the app while still talking.
 */
export function RiderCallScreen() {
  const { call, answer, decline, hangUp, toggleMute, toggleSpeaker } = useLiveCall();
  const { currentRide } = useRideSession();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const [tucked, setTucked] = useState(false);

  const phase = call?.phase;
  const callKey = call ? `${call.rideId}:${call.direction}` : null;

  useEffect(() => {
    if (phase !== "active") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Every new call starts full screen.
  useEffect(() => {
    setTucked(false);
  }, [callKey]);

  if (!call) return null;

  const driver = currentRide && currentRide.rideId === call.rideId ? currentRide.driver : undefined;
  const name = (call.otherRole === "DRIVER" ? driver?.driverName?.trim() : "") || call.otherName;
  const about = [
    call.otherRole === "DRIVER" ? "Your driver" : null,
    driver?.vehicleModel?.trim(),
    driver?.vehiclePlate?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  const incoming = call.direction === "incoming" && call.phase === "ringing";
  const ringing = call.phase === "ringing" || call.phase === "starting";
  const ended = call.phase === "ended";

  let status: string;
  switch (call.phase) {
    case "starting":
      status = "Calling";
      break;
    case "ringing":
      status = incoming ? "Incoming call" : call.onWhatsapp ? "Ringing on WhatsApp" : "Ringing";
      break;
    case "connecting":
      status = "Connecting";
      break;
    case "active":
      status = clock(Math.max(0, Math.floor((now - (call.answeredAt ?? now)) / 1000)));
      break;
    default:
      status = call.endedWords ?? "Call ended";
  }

  function openChat() {
    setTucked(true);
    if (pathname !== "/rider-chat") router.push("/rider-chat");
  }

  if (tucked && !incoming) {
    return (
      <View pointerEvents="box-none" style={[styles.barWrap, { top: insets.top + 70 }]}>
        <Pressable
          accessibilityLabel={`Call with ${name}, ${status}. Return to call`}
          accessibilityRole="button"
          onPress={() => setTucked(false)}
          style={({ pressed }) => [styles.bar, pressed ? styles.pressed : null]}>
          <Ionicons color={colors.orange} name="call" size={16} />
          <RText color={colors.cream} numberOfLines={1} variant="smallBold">
            {ended ? status : `${status} · Return to call`}
          </RText>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={incoming ? decline : () => setTucked(true)}
      statusBarTranslucent
      transparent={false}
      visible>
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.top}>
          {incoming || ended ? (
            <View style={styles.topSide} />
          ) : (
            <RBack label="Back to trip" onInk onPress={() => setTucked(true)} />
          )}
          <View style={styles.brand}>
            <Ionicons color={colors.onInkMuted} name="call" size={15} />
            <RText color={colors.onInkMuted} variant="smallBold">
              Wheelers call
            </RText>
          </View>
          <View style={styles.topSide} />
        </View>

        <View style={styles.who}>
          <View style={styles.rings}>
            {ringing ? <Rings /> : null}
            <RAvatar name={name} photoKey={call.otherRole === "DRIVER" ? driver?.driverPhotoKey : undefined} ring={colors.orange} size={132} uri={call.otherRole === "DRIVER" ? driver?.driverPhotoUrl : undefined} />
          </View>
          <RText color={colors.cream} numberOfLines={1} style={styles.name}>
            {name}
          </RText>
          {about ? (
            <RText color={colors.onInkMuted} numberOfLines={2} style={styles.center} variant="small">
              {about}
            </RText>
          ) : null}
          <RText accessibilityLiveRegion="polite" color={colors.orange} style={styles.status}>
            {status}
          </RText>
        </View>

        {ended ? (
          <View style={styles.controls} />
        ) : incoming ? (
          <View style={styles.controls}>
            <Round
              icon="close"
              label="Decline"
              look="red"
              onPress={decline}
            />
            <Round
              icon="call"
              label="Answer"
              look="green"
              onPress={() => void answer()}
            />
          </View>
        ) : (
          <>
            <View style={styles.controls}>
              <Round
                icon={call.muted ? "mic-off" : "mic"}
                label="Mute"
                look={call.muted ? "on" : "quiet"}
                onPress={toggleMute}
                pressed={call.muted}
              />
              <Round
                icon="volume-high"
                label="Speaker"
                look={call.speaker ? "on" : "quiet"}
                onPress={toggleSpeaker}
                pressed={call.speaker}
              />
              <Round icon="chatbubble-ellipses" label="Message" look="quiet" onPress={openChat} />
            </View>
            <Pressable
              accessibilityLabel="End call"
              accessibilityRole="button"
              onPress={hangUp}
              style={({ pressed }) => [styles.end, pressed ? styles.pressed : null]}>
              <Ionicons
                color="#FFFFFF"
                name="call"
                size={22}
                style={styles.endIcon}
              />
              <RText color="#FFFFFF" style={styles.endText}>
                End call
              </RText>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

/** Two rings spreading out from the photo while the phone rings. */
function Rings() {
  const first = useRef(new Animated.Value(0)).current;
  const second = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (live) setStill(reduced);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const spread = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );
    const one = spread(first);
    const two = spread(second);
    one.start();
    const wait = setTimeout(() => two.start(), 900);
    return () => {
      clearTimeout(wait);
      one.stop();
      two.stop();
    };
  }, [first, second, still]);

  if (still) return null;
  return (
    <>
      {[first, second].map((value, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.7] }) }],
            },
          ]}
        />
      ))}
    </>
  );
}

function Round({
  icon,
  label,
  look,
  onPress,
  pressed,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  look: "quiet" | "on" | "red" | "green";
  onPress: () => void;
  /** For the two switches: whether it is on. */
  pressed?: boolean;
}) {
  return (
    <View style={styles.round}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={pressed === undefined ? undefined : { selected: pressed }}
        onPress={onPress}
        style={({ pressed: down }) => [styles.circle, styles[look], down ? styles.pressed : null]}>
        <Ionicons color={look === "on" ? colors.ink : look === "quiet" ? colors.cream : "#FFFFFF"} name={icon} size={26} />
      </Pressable>
      <RText color={colors.onInkMuted} style={styles.roundLabel}>
        {label}
      </RText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 24, alignItems: "center", gap: 14 },
  pressed: { opacity: 0.72 },
  center: { textAlign: "center" },

  top: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topSide: { width: 44, height: 44 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },

  who: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 12 },
  rings: { width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.orange,
  },
  name: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6, textAlign: "center" },
  status: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },

  controls: { flexDirection: "row", justifyContent: "center", gap: 22, minHeight: 100 },
  round: { width: 84, alignItems: "center", gap: 8 },
  roundLabel: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17 },
  circle: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  quiet: { borderWidth: 2, borderColor: colors.inkLine },
  on: { backgroundColor: colors.cream },
  red: { backgroundColor: colors.callRed },
  green: { backgroundColor: GREEN },

  end: {
    alignSelf: "stretch",
    height: 64,
    marginTop: 12,
    borderRadius: 32,
    backgroundColor: colors.callRed,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  endIcon: { transform: [{ rotate: "135deg" }] },
  endText: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 24 },

  barWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: {
    minHeight: 44,
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.orange,
  },
});
