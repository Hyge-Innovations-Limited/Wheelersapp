import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import * as NativeSplash from "expo-splash-screen";
import { Animated, Image, Pressable, StyleSheet, View, useColorScheme } from "react-native";

import { BrandLogo } from "@/components/brand-logo";

import { publicEntryRoute, type VariantPublicRoute } from "@/lib/app-variant";
import { useAuth } from "@/lib/auth";
import {
  clearLogoutPending,
  getAuthenticatedRoute,
  readLogoutPending,
  readStoredAuthState,
  type AuthenticatedRoute,
} from "@/lib/auth-state";
import { prefetchRiderHistory } from "@/lib/rider-history";
import { prefetchWalletOverview } from "@/lib/wallet-overview";

type SplashRoute = VariantPublicRoute | AuthenticatedRoute;

/**
 * Keep the brand splash on screen for at least this long. Auth state usually
 * resolves in a few hundred ms, which would flash the artwork and leave — the
 * splash is meant to be seen, so navigation waits out the remainder.
 */
const MIN_SPLASH_MS = 900;

/**
 * ONE splash, always. The JS screen continues the native frame it was handed
 * and nothing is drawn over it.
 *
 * There used to be a second act: 350ms after the native splash had already
 * been seen, a randomly chosen colour treatment faded in on top. Two of the
 * three variants differ from the native frame, so most launches showed a
 * splash, then a visibly different splash — the "double splash" riders and
 * drivers reported, intermittent because the pick was random.
 *
 * Metro launches already show the native splash for seconds while the bundle
 * builds, so dev leaves the moment auth resolves; release holds the frame
 * briefly, where the native phase is only a blink.
 */
const EFFECTIVE_MIN_SPLASH_MS = __DEV__ ? 0 : MIN_SPLASH_MS;

function prefetchHomeData(getAccessToken: () => Promise<string | null | undefined>) {
  void prefetchRiderHistory(getAccessToken);
  void prefetchWalletOverview(getAccessToken);
}

export default function SplashScreen() {
  const router = useRouter();
  const { getAccessToken, isReady } = useAuth();
  const hasNavigated = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function go(href: SplashRoute) {
    router.replace(href);
    // The native splash comes down only now, with the destination already
    // mounted underneath it. Hiding it any earlier uncovers this JS screen,
    // whose frame is NOT pixel-identical to the baked one — that handoff is
    // what read as a second splash.
    requestAnimationFrame(() => {
      void NativeSplash.hideAsync().catch(() => undefined);
    });
  }

  function navigate(href: SplashRoute) {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    const remaining = EFFECTIVE_MIN_SPLASH_MS - (Date.now() - mountedAtRef.current);
    if (remaining <= 0) {
      go(href);
      return;
    }

    navTimerRef.current = setTimeout(() => go(href), remaining);
  }

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isReady || hasNavigated.current) return;

    let cancelled = false;

    void (async () => {
      if (await readLogoutPending()) {
        await clearLogoutPending();
        if (!cancelled && !hasNavigated.current) {
          navigate(publicEntryRoute);
        }
        return;
      }

      const storedAuthState = await readStoredAuthState();
      if (cancelled || hasNavigated.current) return;

      if (storedAuthState) {
        const route = getAuthenticatedRoute(storedAuthState);
        if (route === "/rider") {
          prefetchHomeData(getAccessToken);
        }
        navigate(route);
        return;
      }

      // No stored state — check if we have a valid token
      const token = await getAccessToken();
      if (cancelled || hasNavigated.current) return;

      if (!token) {
        navigate(publicEntryRoute);
        return;
      }

      // Have a token but no state — go to role selection to restore
      navigate(publicEntryRoute);
    })();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isReady, router]);

  // Fallback timer in case auth check takes too long
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        navigate(publicEntryRoute);
      }
    }, EFFECTIVE_MIN_SPLASH_MS + 1200);

    return () => clearTimeout(timer);
  }, []);

  return <SplashShell onContinue={() => navigate(publicEntryRoute)} />;
}

/**
 * One splash, three moods. The native splash is a constant frame — the tile
 * mark on brand orange — and this screen OPENS on that exact frame, so the
 * native→JS handoff is invisible (this is what killed the "splash shows
 * twice" effect: the old native wordmark was theme-fixed while JS
 * randomized, so half the launches visibly flipped). Only after the handoff
 * does the randomly chosen variant fade in — and one launch in three the
 * variant IS the orange frame, so nothing moves at all.
 */
const SPLASH_VARIANTS = [
  {
    key: "brand",
    background: "#FF7700",
    tile: false, // the screen is the tile — glyph only
    glyph: "#FFF8EC",
    name: "#FFF8EC",
    statusBar: "light" as const,
  },
  {
    key: "cream",
    background: "#FFF8EC",
    tile: true,
    glyph: "#FFF8EC",
    name: "#0D0D0D",
    statusBar: "dark" as const,
  },
  {
    key: "ink",
    background: "#0D0D0D",
    tile: true,
    glyph: "#FFF8EC",
    name: "#FFF8EC",
    statusBar: "light" as const,
  },
];

const IS_DRIVER = process.env.EXPO_PUBLIC_APP_VARIANT === "driver";

/**
 * What the NATIVE splash of the binary this code ships in looks like. The JS
 * splash must open on that exact frame or the handoff reads as two splash
 * screens. Flip to 'brand' in the same commit as the next native build
 * (whose baked splash is the logo on #FF7700) — JS travels with binaries,
 * so this stays truthful.
 */
const NATIVE_SPLASH_STYLE: "legacy-wordmark" | "brand" = "brand";

const LEGACY_WORDMARKS = {
  light: {
    source: require("../assets/images/splash-wordmark-light.png"),
    background: "#FEFAEF",
  },
  dark: {
    source: require("../assets/images/splash-wordmark-dark.png"),
    background: "#202020",
  },
};

function SplashMark({ variant }: { variant: (typeof SPLASH_VARIANTS)[number] }) {
  return (
    <View style={styles.markWrap}>
      <BrandLogo
        size={120}
        showTile={variant.tile}
        tileColor="#FF7700"
        glyphColor={variant.glyph}
      />
      <View style={styles.nameWrap}>
        <AppNameText color={variant.name} />
      </View>
    </View>
  );
}

function AppNameText({ color }: { color: string }) {
  return (
    <View style={styles.nameRow}>
      <Animated.Text style={[styles.nameText, { color }]}>Wheelers</Animated.Text>
      {IS_DRIVER ? (
        <Animated.Text style={[styles.driverTag, { color }]}>DRIVER</Animated.Text>
      ) : null}
    </View>
  );
}

function SplashBase() {
  const scheme = useColorScheme();
  if (NATIVE_SPLASH_STYLE === "brand") {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.center, { backgroundColor: "#FF7700" }]}>
        <SplashMark variant={SPLASH_VARIANTS[0]} />
      </View>
    );
  }
  const legacy = scheme === "dark" ? LEGACY_WORDMARKS.dark : LEGACY_WORDMARKS.light;
  return (
    <View style={[StyleSheet.absoluteFillObject, styles.center, { backgroundColor: legacy.background }]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={legacy.source}
        style={styles.legacyWordmark}
      />
    </View>
  );
}

function SplashShell({ onContinue }: { onContinue: () => void }) {
  const scheme = useColorScheme();
  const baseIsBrand = NATIVE_SPLASH_STYLE === "brand";

  // No hideAsync here on purpose. The native splash stays up until the
  // destination has mounted (see `go` above), so the launch shows exactly
  // one splash: the one baked into the binary. What follows is only ever
  // seen when this route is re-entered later — a logout, say — where no
  // native splash is on screen to match.

  return (
    <View style={styles.root}>
      {/* Matches whatever SplashBase paints, so the bar never fights it. */}
      <StatusBar
        style={baseIsBrand || scheme === "dark" ? "light" : "dark"}
        backgroundColor={baseIsBrand ? "#FF7700" : undefined}
      />

      {/* The native splash frame, continued — pixel-matched to what THIS
          binary bakes in, so the handoff is invisible. */}
      <SplashBase />

      <Pressable
        accessibilityLabel="Continue"
        accessibilityRole="button"
        onPress={onContinue}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FF7700",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  markWrap: {
    alignItems: "center",
    gap: 18,
  },
  nameWrap: {
    alignItems: "center",
  },
  nameRow: {
    alignItems: "center",
    gap: 2,
  },
  nameText: {
    fontFamily: "ClashDisplay_700Bold",
    fontSize: 30,
    letterSpacing: 0.5,
  },
  driverTag: {
    fontFamily: "ClashDisplay_500Medium",
    fontSize: 13,
    letterSpacing: 6,
  },
  legacyWordmark: {
    // Matches the baked native splash: 260pt wide, centred (artwork 787x165).
    width: 260,
    height: 260 * (165 / 787),
  },
});
