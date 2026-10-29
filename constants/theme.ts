import { Platform, TextStyle, ViewStyle } from 'react-native';

// Palette sampled from the Wheelers splash artwork, so every screen reads as a
// continuation of what the app opened on. The accent is the brand tile's
// #FF7700 — the same orange as the app icon and splash.
const colors = {
  orange: '#FF7700',
  orangeLight: '#FFE9D5',
  black: '#0D0D0D',
  offWhite: '#FEFAEF',
  green: '#00C48C',
  red: '#FF3333',
  white: '#FFFFFF',
  // The rider side's muted brown: easier to read on cream than the old grey.
  muted: '#5C534B',
  mutedLight: '#B5ACA4',
  borderLight: '#E6DFD2',
  danger: '#CC3333',
  dangerLight: '#FFF0F0',
  warning: '#F59E0B',
  // Driver card while the rider is paying: "Rider accepted · paying now".
  blue: '#1A5FC4',
  blueLight: '#E8F1FE',
  successLight: '#E8FFF7',
  darkSurface: '#202020',
  darkSurfaceSoft: '#2A2A2A',
  darkBorder: '#333333',
  darkMuted: '#8E8882',
  mapBase: '#D4E6D4',
  mapBlock: 'rgba(185,208,185,0.85)',
  mapRoad: 'rgba(255,255,255,0.62)',
} as const;

const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
  gutter: 20,
} as const;

const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

// The rider look: outlines are a thin warm line, not a heavy black stroke.
const borderWidths = {
  thick: 1.5,
  regular: 1,
} as const;

// Soft lift, as on the rider side: no hard offset "stamp" under cards.
const cardShadow: ViewStyle = {
  shadowColor: colors.black,
  shadowOffset: {
    width: 0,
    height: 4,
  },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 2,
};

const subtleShadow: ViewStyle = {
  shadowColor: colors.black,
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 1,
};

const shadowPresets = {
  card: cardShadow,
  subtle: subtleShadow,
} as const;

const status = {
  live: colors.green,
  urgent: colors.red,
  pending: colors.warning,
  inactive: colors.mutedLight,
} as const;

const cardVariants = {
  default: {
    backgroundColor: colors.white,
    borderColor: colors.borderLight,
  },
  accent: {
    backgroundColor: colors.orangeLight,
    borderColor: colors.orange,
  },
  muted: {
    backgroundColor: '#F5F2ED',
    borderColor: colors.borderLight,
  },
  dark: {
    backgroundColor: colors.darkSurface,
    borderColor: colors.darkBorder,
  },
  danger: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
  },
} as const;

// Bricolage Grotesque for headings and money, Hanken Grotesk for everything
// read: the same type as the rider side, so both halves of the app are one app.
const typography = {
  display: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -1,
  } satisfies TextStyle,
  h1: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.7,
  } satisfies TextStyle,
  h2: {
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.3,
  } satisfies TextStyle,
  h3: {
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 16,
    lineHeight: 19,
  } satisfies TextStyle,
  body: {
    fontFamily: 'HankenGrotesk_500Medium',
    fontSize: 15,
    lineHeight: 20,
  } satisfies TextStyle,
  bodyMedium: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
  } satisfies TextStyle,
  bodySmall: {
    fontFamily: 'HankenGrotesk_500Medium',
    fontSize: 12,
    lineHeight: 16,
  } satisfies TextStyle,
  label: {
    fontFamily: 'HankenGrotesk_700Bold',
    fontSize: 14,
    lineHeight: 18,
  } satisfies TextStyle,
  mono: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    lineHeight: 17,
  } satisfies TextStyle,
  monoSmall: {
    fontFamily: 'HankenGrotesk_700Bold',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.45,
  } satisfies TextStyle,
  monoLarge: {
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 18,
    lineHeight: 21,
  } satisfies TextStyle,
  screenTitle: {
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 21,
    lineHeight: 24,
    letterSpacing: -0.4,
  } satisfies TextStyle,
  metric: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 26,
    lineHeight: 30,
  } satisfies TextStyle,
  caption: {
    fontFamily: 'HankenGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 14,
  } satisfies TextStyle,
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  radius: radii,
  borderWidths,
  borders: borderWidths,
  status,
  cardVariants,
  shadowPresets,
  shadows: shadowPresets,
  typography,
  layout: {
    screenPadding: spacing.gutter,
    maxWidth: 560,
    mapHeight: 280,
  },
  fonts: {
    heading: typography.h1.fontFamily,
    headingAlt: typography.h2.fontFamily,
    body: typography.body.fontFamily,
    bodyMedium: typography.bodyMedium.fontFamily,
    mono: typography.mono.fontFamily,
    monoBold: typography.monoSmall.fontFamily,
  },
  platform: {
    topPadding: Platform.select({
      android: 4,
      default: 0,
    }),
  },
} as const;

export type AppTheme = typeof theme;

export const Colors = {
  light: {
    text: theme.colors.black,
    background: theme.colors.offWhite,
    tint: theme.colors.orange,
    icon: theme.colors.muted,
    tabIconDefault: theme.colors.mutedLight,
    tabIconSelected: theme.colors.orange,
  },
  dark: {
    text: theme.colors.offWhite,
    background: theme.colors.black,
    tint: theme.colors.offWhite,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: theme.colors.offWhite,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: theme.fonts.body,
    serif: theme.fonts.heading,
    rounded: theme.fonts.headingAlt,
    mono: theme.fonts.mono,
  },
  default: {
    sans: theme.fonts.body,
    serif: theme.fonts.heading,
    rounded: theme.fonts.headingAlt,
    mono: theme.fonts.mono,
  },
  web: {
    sans: theme.fonts.body,
    serif: theme.fonts.heading,
    rounded: theme.fonts.headingAlt,
    mono: theme.fonts.mono,
  },
});
