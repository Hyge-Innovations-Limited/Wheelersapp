import { Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RButton, RLink, RText, naira, rider } from "@/components/rider/kit";

const { colors } = rider;

/**
 * Before a search goes out, when the wallet covers the price: may the first
 * driver at this price be booked (and the money held) without asking again?
 */
export function AutoBookSheet({
  priceNgn,
  onAnswer,
}: {
  /** Null hides the sheet. */
  priceNgn: number | null;
  onAnswer: (autoBook: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => onAnswer(false)}
      transparent
      visible={priceNgn !== null}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {priceNgn !== null ? (
            <>
              <View style={styles.copy}>
                <RText accessibilityRole="header" variant="heading">
                  {`Auto-book a driver at ${naira(priceNgn)}?`}
                </RText>
                <RText color={colors.muted} variant="small">
                  {`${naira(priceNgn)} will be held from your wallet.`}
                </RText>
              </View>
              <RButton onPress={() => onAnswer(true)} title="Yes, auto-book" />
              <RLink onPress={() => onAnswer(false)} title="No, I'll choose" />
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
