import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, OnLight } from "@/components/app-text";
import { theme } from "@/theme";

type SettingsRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  destructive?: boolean;
  highlight?: boolean;
  showDivider?: boolean;
  toggleValue?: boolean;
  onPress?: () => void;
  onToggle?: () => void;
};

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  destructive,
  highlight,
  showDivider = true,
  toggleValue,
  onPress,
  onToggle,
}: SettingsRowProps) {
  const content = (
    <View style={[styles.row, !showDivider ? styles.rowNoDivider : null]}>
      <View
        style={[
          styles.iconBox,
          highlight ? styles.highlightIconBox : null,
          destructive ? styles.destructiveIconBox : null,
        ]}
      >
        <OnLight>
        <MaterialIcons
          color={destructive ? theme.colors.danger : theme.colors.black}
          name={icon}
          size={20}
        />
        </OnLight>
      </View>
      <View style={styles.copy}>
        <AppText
          variant={highlight ? "label" : "bodyMedium"}
          color={destructive ? theme.colors.danger : theme.colors.black}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" color={theme.colors.muted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {typeof toggleValue === "boolean" ? (
        <Pressable
          onPress={onToggle}
          style={[
            styles.switchTrack,
            toggleValue ? styles.switchTrackOn : null,
          ]}
        >
          <OnLight>
          <View
            style={[
              styles.switchThumb,
              toggleValue ? styles.switchThumbOn : null,
            ]}
          />
          </OnLight>
        </Pressable>
      ) : value ? (
        <AppText
          variant="monoSmall"
          color={highlight ? theme.colors.orange : theme.colors.muted}
        >
          {value} ›
        </AppText>
      ) : onPress ? (
        <AppText
          variant="h3"
          color={highlight ? theme.colors.orange : theme.colors.mutedLight}
        >
          ›
        </AppText>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm, // ← was lg, now sm — tighter rows
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDE8",
  },
  rowNoDivider: {
    borderBottomWidth: 0,
    paddingBottom: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  highlightIconBox: {
    backgroundColor: theme.colors.orangeLight,
    borderColor: theme.colors.orange,
  },
  destructiveIconBox: {
    backgroundColor: theme.colors.dangerLight,
    borderColor: theme.colors.danger,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  switchTrack: {
    width: 42,
    height: 22,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
    padding: 1,
    ...theme.shadows.subtle,
  },
  switchTrackOn: {
    backgroundColor: theme.colors.orange,
  },
  switchThumb: {
    width: 16,
    height: 16,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borders.regular,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.white,
  },
  switchThumbOn: {
    alignSelf: "flex-end",
  },
});
