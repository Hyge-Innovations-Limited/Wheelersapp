import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { AppScreen } from "@/components/app-screen";
import { naira, rider } from "@/constants/rider-theme";

export { naira, rider };

const { colors, fonts, radius } = rider;

/* ── text ──────────────────────────────────────────────────────────────── */

const textStyles = StyleSheet.create({
  /** Screen headline. */
  display: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  /** Prices and other figures: digits keep their width as they change. */
  figure: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, fontVariant: ["tabular-nums"] },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17 },
  /** Small capitals above a group. */
  label: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, letterSpacing: 0.5 },
});

export type RTextVariant = keyof typeof textStyles;

export function RText({
  variant = "body",
  color,
  style,
  ...props
}: TextProps & { variant?: RTextVariant; color?: string; style?: StyleProp<TextStyle> }) {
  const fallback = variant === "label" || variant === "caption" ? colors.muted : colors.ink;
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      {...props}
      style={[styles.text, textStyles[variant], { color: color ?? fallback }, style]}
    />
  );
}

/* ── screen ────────────────────────────────────────────────────────────── */

export function RScreen(props: React.ComponentProps<typeof AppScreen>) {
  return <AppScreen backgroundColor={colors.cream} {...props} />;
}

/* ── buttons ───────────────────────────────────────────────────────────── */

export type RButtonVariant = "primary" | "dark" | "ghost" | "danger" | "onInk";

const buttonLook: Record<RButtonVariant, { box: ViewStyle; text: string }> = {
  primary: { box: { backgroundColor: colors.orange }, text: colors.ink },
  dark: { box: { backgroundColor: colors.ink }, text: colors.cream },
  ghost: { box: { borderWidth: 2, borderColor: colors.ink }, text: colors.ink },
  danger: { box: { borderWidth: 2, borderColor: colors.danger }, text: colors.danger },
  onInk: { box: { borderWidth: 2, borderColor: colors.inkLine }, text: colors.cream },
};

export function RButton({
  title,
  variant = "primary",
  size = "lg",
  loading,
  disabled,
  icon,
  style,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: RButtonVariant;
  /** lg is the one main action on a screen; md sits beside others. */
  size?: "lg" | "md";
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const look = buttonLook[variant];
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      disabled={blocked}
      {...props}
      style={({ pressed }) => [
        styles.button,
        size === "lg" ? styles.buttonLg : styles.buttonMd,
        look.box,
        blocked ? styles.dimmed : null,
        pressed ? styles.pressed : null,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={look.text} />
      ) : (
        <>
          {icon}
          <Text
            maxFontSizeMultiplier={1.15}
            numberOfLines={1}
            style={[size === "lg" ? styles.buttonLgText : styles.buttonMdText, { color: look.text }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** A quiet text action: "Skip for now", "Cancel search". */
export function RLink({
  title,
  color = colors.ink,
  style,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  title: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={6}
      {...props}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null, style]}>
      <Text maxFontSizeMultiplier={1.15} style={[styles.linkText, { color }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** The round back control at the top of a screen. */
export function RBack({
  href,
  onPress,
  icon = "chevron-back",
  label = "Back",
  onInk,
}: {
  href?: Href;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  onInk?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={() => {
        if (onPress) return onPress();
        if (href) return router.replace(href);
        if (router.canGoBack()) router.back();
      }}
      style={({ pressed }) => [
        styles.back,
        onInk ? styles.backOnInk : null,
        pressed ? styles.pressed : null,
      ]}>
      <Ionicons color={onInk ? colors.cream : colors.ink} name={icon} size={22} />
    </Pressable>
  );
}

/* ── surfaces ──────────────────────────────────────────────────────────── */

export function RCard({
  tone = "card",
  style,
  children,
}: {
  /** card: white with a hairline. ink: the dark feature card. soft: orange tint. */
  tone?: "card" | "ink" | "soft" | "outline";
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return <View style={[styles.card, cardTones[tone], style]}>{children}</View>;
}

const cardTones = StyleSheet.create({
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  ink: { backgroundColor: colors.ink },
  soft: { backgroundColor: colors.orangeSoft },
  outline: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink },
});

export function RPill({
  label,
  tone = "green",
  icon,
}: {
  label: string;
  tone?: "green" | "orange" | "ink" | "danger" | "soft";
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const look = {
    green: { bg: colors.greenSoft, fg: colors.green },
    orange: { bg: colors.orange, fg: colors.ink },
    ink: { bg: colors.ink, fg: colors.orange },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    soft: { bg: colors.orangeSoft, fg: colors.orangeText },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]}>
      {icon ? <Ionicons color={look.fg} name={icon} size={15} /> : null}
      <Text maxFontSizeMultiplier={1.15} style={[styles.pillText, { color: look.fg }]}>
        {label}
      </Text>
    </View>
  );
}

/* ── input ─────────────────────────────────────────────────────────────── */

export const RInput = forwardRef<
  TextInput,
  TextInputProps & {
    label?: string;
    /** Shown after the label in a lighter weight: "(optional)". */
    labelNote?: string;
    hint?: string;
    error?: string | null;
    /** What was typed is good: the box turns green and shows a tick. */
    valid?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
  }
>(function RInput({ label, labelNote, hint, error, valid, containerStyle, style, ...props }, ref) {
  const good = valid === true && !error;
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? (
        <Text maxFontSizeMultiplier={1.15} style={styles.fieldLabel}>
          {label}
          {labelNote ? <Text style={styles.fieldLabelNote}> {labelNote}</Text> : null}
        </Text>
      ) : null}
      <View>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#8C837A"
          ref={ref}
          {...props}
          style={[styles.input, error ? styles.inputError : null, good ? styles.inputValid : null, style]}
        />
        {good ? (
          <View accessibilityLabel="Looks good" accessibilityLiveRegion="polite" pointerEvents="none" style={styles.inputTick}>
            <Ionicons color={colors.green} name="checkmark-circle" size={24} />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
});

/* ── people ────────────────────────────────────────────────────────────── */

function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "W";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

/** A person's photo when we have one; their initials when we do not. */
export function RAvatar({
  name,
  uri,
  size = 56,
  ring,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
  ring?: string;
}) {
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: ring ? 3 : 0,
    borderColor: ring,
  };
  if (uri) {
    return (
      <Image
        accessibilityLabel={name ? `Photo of ${name}` : "Photo"}
        contentFit="cover"
        source={{ uri }}
        style={[styles.avatar, frame]}
      />
    );
  }
  return (
    <View accessibilityLabel={name ?? undefined} style={[styles.avatar, styles.avatarInitials, frame]}>
      <Text maxFontSizeMultiplier={1} style={[styles.avatarText, { fontSize: Math.round(size * 0.36) }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/* ── bidding steps ─────────────────────────────────────────────────────── */

const BID_STEPS = ["Your price", "Drivers reply", "You choose", "Ride"] as const;

/** Where the rider is in the four steps of getting a ride. */
export function RStepBar({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <View
      accessibilityLabel={`Step ${active} of 4: ${BID_STEPS[active - 1]}`}
      accessibilityRole="progressbar"
      style={styles.steps}>
      {BID_STEPS.map((label, index) => {
        const step = index + 1;
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.stepBar, step <= active ? styles.stepBarOn : null]} />
            <Text
              maxFontSizeMultiplier={1.1}
              numberOfLines={1}
              style={[styles.stepText, step === active ? styles.stepTextOn : null]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Two lines of a list row with something on the right. */
export function RRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <>
      {left}
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons color={colors.muted} name="chevron-forward" size={18} /> : null)}
    </>
  );
  const box = [styles.row, last ? null : styles.rowDivider];
  if (!onPress) return <View style={box}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [box, pressed ? styles.pressed : null]}>
      {body}
    </Pressable>
  );
}

/** The round orange-tinted holder for a row's icon. */
export function RIconDot({
  name,
  tone = "soft",
}: {
  name: keyof typeof Ionicons.glyphMap;
  tone?: "soft" | "ink" | "green" | "tint";
}) {
  const look = {
    soft: { bg: colors.orangeSoft, fg: colors.orangeText },
    ink: { bg: colors.ink, fg: colors.orange },
    green: { bg: colors.greenSoft, fg: colors.green },
    tint: { bg: colors.tint, fg: colors.ink },
  }[tone];
  return (
    <View style={[styles.iconDot, { backgroundColor: look.bg }]}>
      <Ionicons color={look.fg} name={name} size={19} />
    </View>
  );
}

const styles = StyleSheet.create({
  text: { flexShrink: 1, includeFontPadding: false },
  pressed: { opacity: 0.72 },
  dimmed: { opacity: 0.45 },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  buttonLg: { height: 60, borderRadius: radius.lg },
  buttonMd: { height: 52, borderRadius: radius.md },
  buttonLgText: { fontFamily: fonts.heavy, fontSize: 18 },
  buttonMdText: { fontFamily: fonts.bold, fontSize: 16 },

  link: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  linkText: { fontFamily: fonts.semibold, fontSize: 15 },

  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  backOnInk: { backgroundColor: "transparent", borderColor: colors.inkLine },

  card: { borderRadius: radius.xl, padding: 16 },

  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pillText: { fontFamily: fonts.bold, fontSize: 14 },

  field: { gap: 8 },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  fieldLabelNote: { fontFamily: fonts.medium, color: colors.muted },
  input: {
    height: 58,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  inputValid: { borderColor: colors.green, paddingRight: 48 },
  inputTick: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  fieldHint: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  fieldError: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.danger },

  avatar: { backgroundColor: colors.tint },
  avatarInitials: { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.displayBold, color: colors.orange },

  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, gap: 5 },
  stepBar: { height: 5, borderRadius: 3, backgroundColor: colors.line },
  stepBarOn: { backgroundColor: colors.orange },
  stepText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  stepTextOn: { fontFamily: fonts.heavy, color: colors.ink },

  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  rowSubtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  iconDot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
