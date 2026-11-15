#!/usr/bin/env bash
# Swift tests of the native iPhone app on a simulator (Money/Store ports against the JS fixtures).
#   npm run ios:test
set -euo pipefail
cd "$(dirname "$0")/.."
(cd ios-native && xcodegen --quiet)
SIM="${SIM_NAME:-$(xcrun simctl list devices available -j | node -e '
  const d = Object.values(JSON.parse(require("fs").readFileSync(0, "utf8")).devices).flat();
  process.stdout.write((d.find((x) => x.name.startsWith("iPhone")) ?? {}).name ?? "");')}"
[ -n "$SIM" ] || { echo "No iPhone simulator installed." >&2; exit 1; }
xcodebuild test -project ios-native/Garaj.xcodeproj -scheme Garaj -destination "platform=iOS Simulator,name=$SIM" \
  -derivedDataPath ios-native/build -only-testing:GarajTests -quiet
