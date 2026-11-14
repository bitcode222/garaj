#!/usr/bin/env bash
# Build the native Garaj app (SwiftUI, ios-native/, docs/IOS-NATIVE.md) and install it on the connected iPhone.
#   npm run ios:device
#   bash scripts/ios-device.sh --check                   -> exit 0 if a paired iPhone is found, 3 if none (used by CI)
#   IOS_LAUNCH=0 …                                       -> install only, do not open the app (used by CI)
set -euo pipefail
cd "$(dirname "$0")/.."

TEAM_ID="${TEAM_ID:-7363RX85BF}"
BUNDLE_ID="com.albertoparos.garaj"
DERIVED="ios-native/build"

if [ -z "${DEVICE_ID:-}" ]; then
  tmp="$(mktemp)"
  xcrun devicectl list devices --json-output "$tmp" >/dev/null
  DEVICE_ID="$(node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result.devices;
    const d = r.find((x) => x.hardwareProperties?.reality === "physical"
      && x.hardwareProperties?.platform === "iOS"
      && x.connectionProperties?.pairingState === "paired");
    process.stdout.write(d ? d.hardwareProperties.udid : "");
  ' "$tmp")"
  rm -f "$tmp"
fi
if [ -z "$DEVICE_ID" ]; then
  echo "No paired iPhone found (check cable, unlock, trust this Mac)."
  [ "${1:-}" = "--check" ] && exit 3
  exit 1
fi
echo "→ Device $DEVICE_ID"
[ "${1:-}" = "--check" ] && exit 0

echo "→ Generating the Xcode project"
(cd ios-native && xcodegen --quiet)

echo "→ Building the app"
xcodebuild -project ios-native/Garaj.xcodeproj -scheme Garaj -configuration Debug \
  -destination "id=$DEVICE_ID" -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
  -quiet build

APP="$DERIVED/Build/Products/Debug-iphoneos/Garaj.app"
echo "→ Installing"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP" >/dev/null
if [ "${IOS_LAUNCH:-1}" = "0" ]; then
  echo "✓ Installed (not launched)."
  exit 0
fi
echo "→ Launching"
if xcrun devicectl device process launch --device "$DEVICE_ID" --terminate-existing "$BUNDLE_ID" >/dev/null 2>&1; then
  echo "✓ Garaj is running on the iPhone"
else
  echo "✓ Installed. Unlock the iPhone and open Garaj."
  echo "  First install with a free team: Settings → General → VPN & Device Management → trust the developer."
fi
