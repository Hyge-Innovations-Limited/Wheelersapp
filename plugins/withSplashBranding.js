const fs = require("fs");
const path = require("path");
const { withAndroidStyles, withDangerousMod } = require("expo/config-plugins");

/**
 * The loading line under the Android splash ("Your price. Your ride. Your
 * safety.", Timi, 14 Nov 2026). Android 12+ shows only the icon in the middle
 * of its splash, never a picture with words, but it has one place for a small
 * image at the bottom: windowSplashScreenBrandingImage (200 x 80 dp). This
 * puts the line there. Older Androids ignore it. iOS gets the line in its
 * splash image instead (app.json, expo-splash-screen ios.image).
 */
const STYLE = "Theme.App.SplashScreen";
const ATTR = "android:windowSplashScreenBrandingImage";

module.exports = function withSplashBranding(config, { image } = {}) {
  if (!image) return config;

  config = withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/drawable-xxxhdpi");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.resolve(c.modRequest.projectRoot, image), path.join(dir, "splashscreen_branding.png"));
      return c;
    },
  ]);

  return withAndroidStyles(config, (c) => {
    const resources = c.modResults.resources;
    resources.$ = { ...(resources.$ || {}), "xmlns:tools": "http://schemas.android.com/tools" };
    resources.style = resources.style || [];
    let style = resources.style.find((s) => s.$ && s.$.name === STYLE);
    if (!style) {
      style = { $: { name: STYLE, parent: "Theme.SplashScreen" }, item: [] };
      resources.style.push(style);
    }
    style.item = (style.item || []).filter((i) => i.$.name !== ATTR);
    style.item.push({ $: { name: ATTR, "tools:targetApi": "31" }, _: "@drawable/splashscreen_branding" });
    return c;
  });
};
