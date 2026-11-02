import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import type { DriverPaper, DriverPaperNeed } from '@/lib/api';
import { PAPER_STATE, needsAction, paperLine } from '@/lib/driver-papers';
import { theme } from '@/theme';

/**
 * One need for the car (a paper, or "any one of these"), each paper a row
 * saying where it stands. Used by Your papers and by the sign-up papers step.
 */
export function NeedCard({ need, onOpen }: { need: DriverPaperNeed; onOpen: (paper: DriverPaper) => void }) {
  const [showOthers, setShowOthers] = useState(false);
  const several = need.papers.length > 1;
  // Once one of them is in, that is the row; the others stay a tap away.
  const sent = need.papers.filter((p) => p.document);
  const unsent = need.papers.filter((p) => !p.document);
  const shown = several && sent.length > 0 && !showOthers ? sent : need.papers;

  return (
    <View style={styles.card}>
      <OnLight>
      {several ? (
        <View style={styles.needHead}>
          <AppText variant="bodyMedium" style={styles.flex} numberOfLines={2}>{need.label}</AppText>
          <Tag need={need} />
        </View>
      ) : null}
      {several && sent.length === 0 ? (
        <AppText variant="caption" color={theme.colors.muted}>Any ONE of these will do.</AppText>
      ) : null}
      {shown.map((paper, index) => {
        const state = paper.document?.state ?? 'missing';
        const look = PAPER_STATE[state];
        return (
          <Pressable
            key={paper.type}
            onPress={() => onOpen(paper)}
            style={({ pressed }) => [styles.row, index > 0 || several ? styles.rowDivided : null, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${paper.label}. ${paperLine(paper)}`}>
            <Ionicons name={look.icon} size={24} color={look.color} />
            <View style={styles.flex}>
              <View style={styles.titleLine}>
                <AppText variant="bodyMedium" style={styles.flexShrink} numberOfLines={2}>{paper.label}</AppText>
                {!several ? <Tag need={need} /> : null}
              </View>
              <AppText variant="bodySmall" color={state === 'rejected' || state === 'expired' || paper.document?.expiringSoon ? theme.colors.danger : theme.colors.muted} numberOfLines={3}>
                {paperLine(paper)}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedLight} />
          </Pressable>
        );
      })}
      {several && sent.length > 0 && unsent.length > 0 ? (
        <Pressable onPress={() => setShowOthers((was) => !was)} hitSlop={8} style={styles.others}>
          <AppText variant="caption" color={theme.colors.muted}>
            {showOthers ? 'Hide the others' : `Send a different one instead (${unsent.map((p) => p.label).join(', ')})`}
          </AppText>
        </Pressable>
      ) : null}
      </OnLight>
    </View>
  );
}

/** "Required" until something good is in for it; optional papers say so. */
function Tag({ need }: { need: DriverPaperNeed }) {
  if (!need.required) return <View style={[styles.tag, styles.tagQuiet]}>
    <OnLight><AppText variant="caption" color={theme.colors.muted}>Optional</AppText>
    </OnLight>
  </View>;
  if (!needsAction(need)) return null;
  return <View style={styles.tag}>
    <OnLight><AppText variant="caption" color={theme.colors.orange}>Required</AppText>
    </OnLight>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  card: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  needHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 48 },
  rowDivided: { paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  pressed: { opacity: 0.6 },
  tag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orangeLight,
  },
  tagQuiet: { backgroundColor: theme.colors.offWhite },
  others: { paddingTop: theme.spacing.xs },
});
