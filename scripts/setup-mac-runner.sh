#!/usr/bin/env bash
# Register this Mac as a self-hosted GitHub Actions runner for the repo, as a
# background service (launchd). After this, every merge to main is tested on
# GitHub and then built + deployed here as a container (see docs/DEPLOY.md).
#
#   1. GitHub → repo → Settings → Actions → Runners → "New self-hosted runner" → macOS
#      copy the token from the `./config.sh --token XXXX` line (valid ~1 hour)
#   2. RUNNER_TOKEN=XXXX npm run runner:install
#
#   RUNNER_TOKEN=<remove token> npm run runner:uninstall     (token from the same page → "Remove")
set -euo pipefail

ACTION="${1:-install}"
DIR="${RUNNER_DIR:-$HOME/actions-runner-garaj}"
REPO_URL="${REPO_URL:-$(git -C "$(dirname "$0")/.." remote get-url origin | sed -E 's#^git@github.com:#https://github.com/#; s#\.git$##')}"

[ "$(uname -s)" = "Darwin" ] || { echo "This script is for macOS." >&2; exit 1; }
: "${RUNNER_TOKEN:?Set RUNNER_TOKEN (see the comments at the top of this script).}"

if [ "$ACTION" = "uninstall" ]; then
  cd "$DIR"
  ./svc.sh stop || true
  ./svc.sh uninstall || true
  ./config.sh remove --token "$RUNNER_TOKEN"
  echo "Runner removed. You can delete $DIR."
  exit 0
fi

# A container runtime is required: Docker Desktop, OrbStack or Colima all work.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.docker/bin:/Applications/OrbStack.app/Contents/MacOS/xbin"
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker is not installed or not running. Install and start one of:" >&2
  echo "  brew install --cask orbstack      (lightest)" >&2
  echo "  brew install --cask docker        (Docker Desktop)" >&2
  echo "then enable 'start at login' and re-run this script." >&2
  exit 1
fi

case "$(uname -m)" in arm64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
mkdir -p "$DIR" && cd "$DIR"

if [ ! -x ./config.sh ]; then
  VERSION="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n1)"
  [ -n "$VERSION" ] || { echo "Could not determine the latest runner version." >&2; exit 1; }
  echo "→ Downloading runner $VERSION ($ARCH)"
  curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-osx-${ARCH}-${VERSION}.tar.gz"
  tar xzf runner.tar.gz && rm runner.tar.gz
fi

# launchd services start with a bare PATH; tell the runner where docker/node live.
printf '%s\n' "/opt/homebrew/bin:/usr/local/bin:$HOME/.docker/bin:/Applications/OrbStack.app/Contents/MacOS/xbin:/usr/bin:/bin:/usr/sbin:/sbin" >.path

echo "→ Registering with $REPO_URL"
./config.sh --unattended --replace --url "$REPO_URL" --token "$RUNNER_TOKEN" \
  --name "$(scutil --get LocalHostName 2>/dev/null || hostname -s)-garaj" --labels garaj --work _work

./svc.sh install
./svc.sh start
./svc.sh status || true
echo "Done. The runner shows as 'Idle' under Settings → Actions → Runners."
