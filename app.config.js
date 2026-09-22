const appJson = require("./app.json");

const rawVariant =
  process.env.APP_VARIANT?.trim() ||
  process.env.EXPO_PUBLIC_APP_VARIANT?.trim() ||
  "rider";
const appVariant = rawVariant === "driver" ? "driver" : "rider";
const isDriverApp = appVariant === "driver";

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  process.env.GOOGLE_MAPS_API_KEY?.trim() ||
  undefined;

/**
 * The URL scheme Google redirects back to after sign-in.
 *
 * It is the iOS client id reversed, and it is per-bundle. app.json hard-codes
 * the *driver's* scheme, so the rider app shipped a scheme Google would not
 * redirect to — the sign-in sheet completed and then returned nothing, which
 * surfaces as "no OAuth code". Derived from the iOS client id for whichever
 * variant is building, so the two can never drift apart again.
 */
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace(
      /\.apps\.googleusercontent\.com$/,
      "",
    )}`
  : undefined;

/** Replace the hard-coded google-signin plugin config with the variant's own. */
function withVariantGoogleScheme(plugins) {
  if (!googleIosUrlScheme) return plugins;

  return plugins.map((entry) => {
    if (
      Array.isArray(entry) &&
      entry[0] === "@react-native-google-signin/google-signin"
    ) {
      return [entry[0], { ...(entry[1] ?? {}), iosUrlScheme: googleIosUrlScheme }];
    }
    return entry;
  });
}

module.exports = () => ({
  ...appJson,
  expo: {
    ...appJson.expo,
    name: isDriverApp ? "Wheelers Driver" : "Wheelers",
    slug: "wheelers",
    scheme: isDriverApp ? "wheelersdriver" : "wheelersapp",
    extra: {
      ...appJson.expo.extra,
      appVariant,
      googleMapsApiKey,
    },
    // Over-the-air updates. JS-only fixes ship with `eas update --channel …`
    // and land on every phone at its next launch; native changes still need
    // a store build. The runtime version is pinned by hand, NOT tied to the
    // store version: Apple forces a new version for every resubmission, and
    // tying the two would strand every phone still on the old version (all of
    // Android, today) without updates. Bump the runtime only when a build
    // changes something native.
    updates: {
      url: `https://u.expo.dev/${appJson.expo.extra.eas.projectId}`,
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: "1.0.0",
    plugins: withVariantGoogleScheme(appJson.expo.plugins ?? []),
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: isDriverApp
        ? "com.timmy133.wheelers.driver"
        : "com.timmy133.wheelers",
      // Adds the com.apple.developer.applesignin entitlement. Without it the
      // native call has no capability behind it and the app crashes the moment
      // "Continue with Apple" is tapped — which is why EAS kept reporting
      // "Synced capabilities: No updates": there was nothing to sync.
      usesAppleSignIn: true,
      config: {
        ...appJson.expo.ios?.config,
        googleMapsApiKey,
      },
    },
    android: {
      ...appJson.expo.android,
      package: isDriverApp
        ? "com.timmy133.wheelers.driver"
        : "com.timmy133.wheelers",
      config: {
        ...appJson.expo.android?.config,
        googleMaps: googleMapsApiKey
          ? {
              apiKey: googleMapsApiKey,
            }
          : undefined,
      },
    },
  },
});
