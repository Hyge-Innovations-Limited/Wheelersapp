import { Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RButton, RLink, RText, naira, rider } from "@/components/rider/kit";
import { routeQuoteLine, type RouteQuote } from "@/lib/route-quote";

const { colors } = rider;

/** A route change that moves money: the new fare, what moves, and the rider's yes. */
export function RouteChangeSheet({
  quote,
  busy,
  onUpdate,
  onKeep,
  onDismiss,
}: {
  /** Null hides the sheet. */
  quote: RouteQuote | null;
  busy?: boolean;
  onUpdate: () => void;
  onKeep: () => void;
  /** The sheet has finished leaving (iOS only). */
  onDismiss?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const line = quote ? routeQuoteLine(quote) : null;
  return (
    <Modal animationType="slide" onDismiss={onDismiss} onRequestClose={onKeep} transparent visible={quote !== null}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {quote ? (
            <>
              <View style={styles.copy}>
                <RText accessibilityRole="header" variant="heading">
                  {`New fare ${naira(quote.fareNgn)}`}
                </RText>
                {line ? (
                  <RText color={colors.muted} variant="small">
                    {line}
                  </RText>
                ) : null}
              </View>
              <RButton loading={busy} onPress={onUpdate} title="Update route" />
              <RLink onPress={onKeep} title="Keep my trip" />
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(13,13,13,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: rider.radius.sheet,
    borderTopRightRadius: rider.radius.sheet,
    paddingHorizontal: rider.gutter,
    paddingTop: 20,
    gap: 12,
  },
  copy: { gap: 4 },
});
