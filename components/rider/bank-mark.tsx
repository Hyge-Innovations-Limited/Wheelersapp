import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { rider } from "@/constants/rider-theme";
import { BANK_LOGOS } from "@/lib/bank-logos";
import { bankInitials } from "@/lib/bank-list";

const { colors, fonts } = rider;

/** The bank's logo on a white disc, or its initials when there is no logo (or it fails to load). */
export function BankMark({ code, name, size = 40 }: { code: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logo = code ? BANK_LOGOS[code] : undefined;
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (logo && !failed) {
    return (
      <View accessible={false} importantForAccessibility="no" style={[styles.disc, round]}>
        <Image onError={() => setFailed(true)} resizeMode="contain" source={logo} style={styles.logo} />
      </View>
    );
  }
  return (
    <View accessible={false} importantForAccessibility="no" style={[styles.disc, styles.initialsDisc, round]}>
      <Text maxFontSizeMultiplier={1} style={[styles.initials, { fontSize: Math.round(size * 0.35) }]}>
        {bankInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  initialsDisc: { backgroundColor: colors.orangeSoft, borderColor: "transparent" },
  logo: { width: "100%", height: "100%" },
  initials: { fontFamily: fonts.heavy, color: colors.orangeText },
});
