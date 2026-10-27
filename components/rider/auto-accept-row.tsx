import { ActivityIndicator, StyleSheet, Switch, View } from "react-native";

import { RLink, RText, naira, rider } from "@/components/rider/kit";

const { colors } = rider;

/**
 * Auto-accept on a search: one small row with a switch. When the wallet
 * cannot cover the price it cannot be switched on ("Add ₦X to use"); once
 * on, it can always be switched off.
 */
export function AutoAcceptRow({
  on,
  busy,
  shortNgn,
  onChange,
  onAddMoney,
}: {
  on: boolean;
  busy: boolean;
  /** How much more the wallet needs for the rider's price; 0 when it covers it. */
  shortNgn: number;
  onChange: (on: boolean) => void;
  onAddMoney: (shortNgn: number) => void;
}) {
  const blocked = busy || (!on && shortNgn > 0);
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <RText variant="bodyBold">Auto-accept</RText>
        {!on && shortNgn > 0 ? (
          <RLink
            color={colors.orangeText}
            onPress={() => onAddMoney(shortNgn)}
            style={styles.link}
            title={`Add ${naira(shortNgn)} to use`}
          />
        ) : (
          <RText variant="caption" color={colors.muted}>
            Books the first driver at your price
          </RText>
        )}
      </View>
      {busy ? <ActivityIndicator color={colors.orange} size="small" /> : null}
      <Switch
        accessibilityLabel="Auto-accept"
        accessibilityState={{ disabled: blocked, checked: on }}
        disabled={blocked}
        onValueChange={onChange}
        thumbColor={colors.card}
        trackColor={{ false: colors.line, true: colors.orange }}
        value={on}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: rider.radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  link: { alignSelf: "flex-start", paddingHorizontal: 0, minHeight: 24 },
});
