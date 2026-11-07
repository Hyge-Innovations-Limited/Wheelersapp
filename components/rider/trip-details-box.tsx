import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { TripIcon } from "@/components/trip-details-icons";
import { RText, rider } from "@/components/rider/kit";
import { TRIP_NOTE_MAX, TRIP_PASSENGERS_MAX, type TripDetails } from "@/lib/trip-details";

const { colors, fonts, radius } = rider;

/**
 * People, luggage, pet and a note on "Set your price": drivers see them
 * before they bid. Untouched it is 1 person, no luggage, no pet, no note.
 * The WhatsApp ride page has the same box (widget/ride/ride.html).
 */
export function TripDetailsBox({ value, onChange }: { value: TripDetails; onChange: (next: TripDetails) => void }) {
  const set = (patch: Partial<TripDetails>) => onChange({ ...value, ...patch });
  const canLess = value.passengers > 1;
  const canMore = value.passengers < TRIP_PASSENGERS_MAX;

  return (
    <View accessibilityLabel="Trip details" style={styles.box}>
      <View style={styles.row}>
        <TripIcon color={colors.ink} name="people" />
        <RText variant="bodyBold" style={styles.label}>
          People
        </RText>
        <View style={styles.count}>
          <Pressable
            accessibilityLabel="One less person"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canLess }}
            disabled={!canLess}
            hitSlop={4}
            onPress={() => set({ passengers: value.passengers - 1 })}
            style={({ pressed }) => [styles.step, !canLess ? styles.off : null, pressed ? styles.pressed : null]}>
            <Ionicons color={colors.ink} name="remove" size={18} />
          </Pressable>
          <RText accessibilityLiveRegion="polite" variant="figure" style={styles.number}>
            {value.passengers}
          </RText>
          <Pressable
            accessibilityLabel="One more person"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMore }}
            disabled={!canMore}
            hitSlop={4}
            onPress={() => set({ passengers: value.passengers + 1 })}
            style={({ pressed }) => [styles.step, styles.stepPlus, !canMore ? styles.off : null, pressed ? styles.pressed : null]}>
            <Ionicons color={colors.cream} name="add" size={18} />
          </Pressable>
        </View>
      </View>

      <YesNoRow icon="luggage" label="Luggage" on={value.luggage} onChange={(luggage) => set({ luggage })} />
      <YesNoRow icon="pet" label="Pet" on={value.pet} onChange={(pet) => set({ pet })} />

      <View style={[styles.row, styles.last]}>
        <TripIcon color={colors.ink} name="note" />
        <TextInput
          accessibilityLabel="Note for driver"
          maxFontSizeMultiplier={1.2}
          maxLength={TRIP_NOTE_MAX}
          onChangeText={(note) => set({ note })}
          placeholder="Note for driver (optional)"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={styles.note}
          value={value.note ?? ""}
        />
      </View>
    </View>
  );
}

function YesNoRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: "luggage" | "pet";
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <TripIcon color={colors.ink} name={icon} />
      <RText variant="bodyBold" style={styles.label}>
        {label}
      </RText>
      <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.seg}>
        {[false, true].map((yes) => {
          const picked = on === yes;
          return (
            <Pressable
              accessibilityLabel={`${label}: ${yes ? "Yes" : "No"}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked }}
              key={yes ? "yes" : "no"}
              onPress={() => onChange(yes)}
              style={[styles.segButton, picked ? (yes ? styles.segYes : styles.segNo) : null]}>
              <RText
                variant="smallBold"
                color={picked && !yes ? colors.cream : colors.ink}
                style={picked && yes ? styles.segYesText : null}>
                {yes ? "Yes" : "No"}
              </RText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  last: { borderBottomWidth: 0 },
  label: { flex: 1 },
  count: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  stepPlus: { backgroundColor: colors.ink },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.72 },
  number: { width: 30, textAlign: "center", fontSize: 22, lineHeight: 26 },
  seg: { flexDirection: "row", gap: 2, padding: 3, borderRadius: radius.sm, backgroundColor: colors.tint },
  segButton: { width: 56, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segNo: { backgroundColor: colors.ink },
  segYes: { backgroundColor: colors.orange },
  segYesText: { fontFamily: fonts.heavy },
  note: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 0,
  },
});
