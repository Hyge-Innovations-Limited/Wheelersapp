#!/usr/bin/env bash
# Build a signed App Store IPA of the DRIVER app, locally, in one go.
#
#   scripts/ios-release.sh            → ipa-out/WheelersDriver-<buildNumber>.ipa
#
# Before running: bump "version" (Apple wants a new one after every approval)
# and "buildNumber" in app.json. Signing lives on THIS Mac: the distribution
# certificate in the keychain and the App Store profile named below.
# `expo prebuild` regenerates the Xcode project without any signing, so the
# team, style and profile are written back onto the app target every time.
set -euo pipefail
cd "$(dirname "$0")/.."

TEAM=N3F7PRGY83
PROFILE='*[expo] com.timmy133.wheelers.driver AppStore 2026-08-18T19:18:32.891Z'
build="$(node -p 'require("./app.json").expo.ios.buildNumber')"

# The driver variant's public env — the same values EAS would bake in.
eval "$(node -p '
  const e = require("./eas.json").build["production:driver"].env;
  Object.entries(e).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("\n")')"

npx expo prebuild --platform ios
python3 - <<PY
import re
p = "ios/WheelersDriver.xcodeproj/project.pbxproj"
s = open(p).read()
s = re.sub(r"CURRENT_PROJECT_VERSION = \d+;", f'''CURRENT_PROJECT_VERSION = ${build};
\t\t\t\tDEVELOPMENT_TEAM = ${TEAM};
\t\t\t\tCODE_SIGN_STYLE = Manual;
\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Distribution";
\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${PROFILE}";''', s)
open(p, "w").write(s)
PY
(cd ios && pod install)

rm -rf ios/build/WheelersDriver.xcarchive "ipa-out/build-$build"
xcodebuild -workspace ios/WheelersDriver.xcworkspace -scheme WheelersDriver -configuration Release -sdk iphoneos \
  -archivePath ios/build/WheelersDriver.xcarchive archive | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)"
xcodebuild -exportArchive -archivePath ios/build/WheelersDriver.xcarchive \
  -exportOptionsPlist ipa-out/ExportOptions.plist -exportPath "ipa-out/build-$build" | grep -E "error:|EXPORT (SUCCEEDED|FAILED)"
mv "ipa-out/build-$build/WheelersDriver.ipa" "ipa-out/WheelersDriver-$build.ipa"
rm -rf "ipa-out/build-$build"
echo "→ ipa-out/WheelersDriver-$build.ipa"
