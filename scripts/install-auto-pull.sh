#!/usr/bin/env bash
# Install (or remove) the scheduler that runs scripts/auto-pull.sh every 2 minutes.
#   npm run autopull:install      macOS: launchd agent · Linux: crontab entry
#   npm run autopull:uninstall    remove it
#   INTERVAL=300 npm run autopull:install   change the interval (seconds)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/scripts/auto-pull.sh"
INTERVAL="${INTERVAL:-120}"
LABEL="com.garaj.autopull"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
chmod +x "$SCRIPT"

case "$(uname -s)" in
  Darwin)
    if [ "${1:-}" = "uninstall" ]; then
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
      rm -f "$PLIST"
      echo "Removed $LABEL."
      exit 0
    fi
    mkdir -p "$(dirname "$PLIST")"
    cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SCRIPT</string></array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>StandardErrorPath</key><string>$HOME/.garaj-auto-pull.err</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Installed: pulls origin/main every ${INTERVAL}s (and at login). Log: ~/.garaj-auto-pull.log"
    ;;
  Linux)
    tmp="$(mktemp)"
    crontab -l 2>/dev/null | grep -v "garaj-auto-pull" >"$tmp" || true
    if [ "${1:-}" != "uninstall" ]; then
      echo "*/$((INTERVAL / 60 > 0 ? INTERVAL / 60 : 1)) * * * * /bin/bash $SCRIPT # garaj-auto-pull" >>"$tmp"
    fi
    crontab "$tmp"
    rm -f "$tmp"
    [ "${1:-}" = "uninstall" ] && echo "Removed." || echo "Installed via crontab. Log: ~/.garaj-auto-pull.log"
    ;;
  *)
    echo "Unsupported OS. On Windows, run scripts/auto-pull.sh from Git Bash/WSL with Task Scheduler." >&2
    exit 1
    ;;
esac
