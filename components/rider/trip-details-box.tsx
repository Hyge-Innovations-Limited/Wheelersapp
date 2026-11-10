import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { TripIcon, type TripIconName } from "@/components/trip-details-icons";
import { RText, rider } from "@/components/rider/kit";
import { nextPassengers, TRIP_NOTE_MAX, type TripDetails } from "@/lib/trip-details";

const { colors, fonts, radius } = rider;

/**
 * People, luggage, pet and a note on "Set your price", as one row of chips:
 * drivers see them before they bid. Untouched it is 1 person, luggage and
 * pet on, no note. The WhatsApp ride page has the same row (widget/ride/ride.html).
 */
export function TripDetailsBox({ value, onChange }: { value: TripDetails; onChange: (next: TripDetails) => void }) {
  const set = (patch: Partial<TripDetails>) => onChange({ ...value, ...patch });
  const [noteOpen, setNoteOpen] = useState(false);
  const noteField = useRef<TextInput>(null);
  const note = value.note ?? "";
  const showNote = noteOpen || note.length > 0;

  return (
    <View accessibilityLabel="Trip details" style={styles.box}>
      <View style={styles.chips}>
        <Chip
          accessibilityLabel={`People: ${value.passengers}. Tap to change`}
          icon="people"
          label={String(value.passengers)}
          onPress={() => set({ passengers: nextPassengers(value.passengers) })}
        />
        <Chip icon="luggage" label="Luggage" on={value.luggage} onPress={() => set({ luggage: !value.luggage })} />
        <Chip icon="pet" label="Pet" on={value.pet} onPress={() => set({ pet: !value.pet })} />
        <Chip
          accessibilityLabel="Note for driver"
          icon="note"
          label="Note"
          on={note.length > 0}
          onPress={() => {
            setNoteOpen(true);
            noteField.current?.focus();   // already open: straight back to typing
          }}
        />
      </View>
      {showNote ? (
        <TextInput
          ref={noteField}
          accessibilityLabel="Note for driver"
          autoFocus={noteOpen && note.length === 0}
          maxFontSizeMultiplier={1.2}
          maxLength={TRIP_NOTE_MAX}
          onChangeText={(next) => set({ note: next })}
          placeholder="Note for driver (optional)"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={styles.note}
          value={note}
        />
      ) : null}
    </View>
  );
}

function Chip({
  icon,
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  icon: TripIconName;
  label: string;
  /** Orange when on: Luggage and Pet, and Note once one is written. People has no on/off. */
  on?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? `${label}: ${on ? "yes" : "no"}`}
      accessibilityRole="button"
      accessibilityState={on === undefined ? undefined : { selected: on }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, on ? styles.chipOn : null, pressed ? styles.pressed : null]}>
      <TripIcon color={colors.ink} name={icon} size={18} />
      <RText variant="smallBold" style={styles.chipText}>
        {label}
      </RText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.72 },
  note: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
});
