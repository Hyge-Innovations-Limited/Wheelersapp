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

# xcodebuild needs a full Xcode, not the Command Line Tools. If the Mac's
# default developer directory is the CLT, find Xcode ourselves (Applications,
# then Downloads) rather than fail at the archive step after a long prebuild.
if [ -z "${DEVELOPER_DIR:-}" ] && [[ "$(xcode-select -p 2>/dev/null)" == *CommandLineTools* ]]; then
  for candidate in /Applications/Xcode.app "$HOME/Downloads/Xcode.app"; do
    if [ -d "$candidate/Contents/Developer" ]; then
      export DEVELOPER_DIR="$candidate/Contents/Developer"
      echo "Using Xcode at $candidate (the default developer directory is the Command Line Tools)"
      break
    fi
  done
  if [ -z "${DEVELOPER_DIR:-}" ]; then
    echo "No Xcode found. Install it, or run: sudo xcode-select -s /Applications/Xcode.app" >&2
    exit 1
  fi
fi

TEAM=N3F7PRGY83
PROFILE='*[expo] com.timmy133.wheelers.driver AppStore 2026-08-18T19:18:32.891Z'
# The Live Activity (lock screen / Dynamic Island) is its own small app inside
# the app, with its own id and App Store profile: create the App ID
# com.timmy133.wheelers.driver.LiveActivity and an App Store profile for it
# with this name at developer.apple.com, download it and double-click it.
LIVE_PROFILE="${LIVE_PROFILE:-Wheelers LiveActivity AppStore}"
build="$(node -p 'require("./app.json").expo.ios.buildNumber')"
version="$(node -p 'require("./app.json").expo.version')"

# The driver variant's public env — the same values EAS would bake in.
eval "$(node -p '
  const e = require("./eas.json").build["production:driver"].env;
  Object.entries(e).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("\n")')"

npx expo prebuild --platform ios
python3 - <<PY
import re
p = "ios/WheelersDriver.xcodeproj/project.pbxproj"
s = open(p).read()
profiles = {
  "com.timmy133.wheelers.driver": "${PROFILE}",
  "com.timmy133.wheelers.driver.LiveActivity": "${LIVE_PROFILE}",
}
SIGNING = re.compile(r'\n\s*(DEVELOPMENT_TEAM|CODE_SIGN_STYLE|PROVISIONING_PROFILE_SPECIFIER|"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]"|CURRENT_PROJECT_VERSION|MARKETING_VERSION) = [^;]*;')
def sign(m):
  block = m.group(0)
  found = re.search(r'PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;', block)
  profile = profiles.get(found.group(1)) if found else None
  if not profile:
    return block
  # Each part with its own profile, and the same version and build number (App Store insists).
  block = SIGNING.sub("", block)
  return block.replace("buildSettings = {", f"""buildSettings = {{
\t\t\t\tCURRENT_PROJECT_VERSION = ${build};
\t\t\t\tMARKETING_VERSION = ${version};
\t\t\t\tDEVELOPMENT_TEAM = ${TEAM};
\t\t\t\tCODE_SIGN_STYLE = Manual;
\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Distribution";
\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profile}";""", 1)
s = re.sub(r"buildSettings = \{.*?\n\t\t\t\};", sign, s, flags=re.S)
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
