/**
 * The rider side's look: cream, ink and the logo's orange, set in Bricolage
 * Grotesque (headings, prices) and Hanken Grotesk (everything else).
 *
 * Driver screens keep the app theme in `constants/theme.ts`; nothing here
 * reaches them.
 */
export const rider = {
  colors: {
    cream: "#FEFAEF",
    card: "#FFFFFF",
    ink: "#0D0D0D",
    orange: "#FF7700",
    /** Orange dark enough to read as small text on cream. */
    orangeText: "#B04A00",
    orangeSoft: "#FFE9D5",
    muted: "#5C534B",
    line: "#E6DFD2",
    tint: "#F3ECDC",
    green: "#0B7A55",
    greenSoft: "#DDF3EA",
    danger: "#A32020",
    dangerSoft: "#FBE3E3",
    callRed: "#C62828",
    /** Secondary text on an ink surface. */
    onInkMuted: "#CFC6B8",
    onInkSoft: "#E9E1D4",
    /** Outline of a quiet control on an ink surface. */
    inkLine: "#786F68",
  },
  fonts: {
    display: "BricolageGrotesque_800ExtraBold",
    displayBold: "BricolageGrotesque_700Bold",
    regular: "HankenGrotesk_400Regular",
    medium: "HankenGrotesk_500Medium",
    semibold: "HankenGrotesk_600SemiBold",
    bold: "HankenGrotesk_700Bold",
    heavy: "HankenGrotesk_800ExtraBold",
  },
  gutter: 20,
  radius: { sm: 12, md: 16, lg: 18, xl: 22, sheet: 28, pill: 999 },
} as const;

/** ₦6,000 — whole naira, grouped, never a decimal. */
export function naira(amount: number | null | undefined): string {
  const whole = Math.round(Number.isFinite(amount as number) ? (amount as number) : 0);
  const sign = whole < 0 ? "-" : "";
  return `${sign}₦${Math.abs(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
