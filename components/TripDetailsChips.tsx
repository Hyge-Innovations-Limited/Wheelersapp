import { StyleSheet, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import { TripIcon } from '@/components/trip-details-icons';
import { peopleLabel, type TripDetails } from '@/lib/trip-details';
import { theme } from '@/theme';

/**
 * What the rider said about the trip, for the driver: how many people
 * always, Luggage and Pet only when the rider said yes (in orange, so they
 * are not missed), and the rider's note. Nothing for a ride booked without
 * them (older apps, chat).
 */
export function TripDetailsChips({ details, compact = false, noteOnOwnLine = false }: { details?: TripDetails; compact?: boolean; noteOnOwnLine?: boolean }) {
  if (!details) return null;
  // The in-trip panel is small: one line, and nothing when the rider said nothing out of the ordinary.
  if (compact) {
    const parts = [
      details.passengers > 1 ? { text: peopleLabel(details.passengers), orange: false } : null,
      details.luggage ? { text: 'Luggage', orange: true } : null,
      details.pet ? { text: 'Pet', orange: true } : null,
      details.note && !noteOnOwnLine ? { text: `“${details.note}”`, orange: false } : null,
    ].filter((part): part is { text: string; orange: boolean } => part !== null);
    const noteLine = noteOnOwnLine && details.note ? details.note : null;
    if (parts.length === 0 && !noteLine) return null;
    return (
      <OnLight>
        {parts.length > 0 ? (
          <AppText variant="bodySmall" numberOfLines={1} style={styles.compact}>
            {parts.map((part, i) => (
              <AppText key={part.text} variant="bodySmall" color={part.orange ? theme.colors.orange : undefined}>
                {i > 0 ? ' · ' : ''}{part.text}
              </AppText>
            ))}
          </AppText>
        ) : null}
        {noteLine ? (
          <AppText variant="bodySmall" numberOfLines={2} style={styles.compact}>
            {`“${noteLine}”`}
          </AppText>
        ) : null}
      </OnLight>
    );
  }
  const said = [
    peopleLabel(details.passengers),
    details.luggage ? 'luggage' : null,
    details.pet ? 'a pet' : null,
  ].filter(Boolean).join(', ');
  return (
    <View
      accessible
      accessibilityLabel={`Rider: ${said}${details.note ? `. Note: ${details.note}` : ''}`}
      style={styles.wrap}>
      <OnLight>
        <View style={styles.row}>
          <View style={styles.chip}>
            <TripIcon color={theme.colors.black} name="people" size={18} />
            <AppText variant="label">{peopleLabel(details.passengers)}</AppText>
          </View>
          {details.luggage ? (
            <View style={[styles.chip, styles.chipYes]}>
              <TripIcon color={theme.colors.black} name="luggage" size={18} />
              <AppText variant="label">Luggage</AppText>
            </View>
          ) : null}
          {details.pet ? (
            <View style={[styles.chip, styles.chipYes]}>
              <TripIcon color={theme.colors.black} name="pet" size={18} />
              <AppText variant="label">Pet</AppText>
            </View>
          ) : null}
        </View>
        {details.note ? (
          <AppText variant="bodyMedium" numberOfLines={2} style={styles.note}>
            “{details.note}”
          </AppText>
        ) : null}
      </OnLight>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipYes: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orangeLight },
  // Its own white card: the request and bid screens can be dark, and the note must read on any of them.
  note: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
  },
  compact: { paddingHorizontal: 2 },
});
