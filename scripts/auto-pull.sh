#!/usr/bin/env bash
# Keep this checkout on the latest origin/main, hands-free.
#   scripts/auto-pull.sh            one pass (what the scheduler runs)
#
# Safe by design — it only ever fast-forwards, and does nothing when:
#   · you are on another branch (so feature work is never disturbed)
#   · there are uncommitted changes, or local commits not on origin/main
#   · another pass is still running
# When package.json / package-lock.json changed it also runs `npm ci`.
# Log: ~/.garaj-auto-pull.log   (AUTO_PULL_BRANCH, AUTO_PULL_INSTALL=0 to tweak)
set -uo pipefail

# launchd/cron start with a bare PATH.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${AUTO_PULL_BRANCH:-main}"
LOG="${AUTO_PULL_LOG:-$HOME/.garaj-auto-pull.log}"
LOCK="${TMPDIR:-/tmp}/garaj-auto-pull.lock"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }
notify() {
  command -v osascript >/dev/null 2>&1 && osascript -e "display notification \"$1\" with title \"Garaj\"" >/dev/null 2>&1 || true
}

# Keep the log small.
if [ -f "$LOG" ] && [ "$(wc -l <"$LOG")" -gt 1000 ]; then tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi

# One pass at a time (a stale lock older than 30 min is ignored).
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || exit 0; else exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

cd "$REPO" || { log "ERROR: cannot cd to $REPO"; exit 1; }

if ! git fetch --quiet origin "$BRANCH" 2>>"$LOG"; then
  log "fetch failed (offline? credentials?) — will retry"
  exit 0
fi

current="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current" != "$BRANCH" ]; then
  log "skip: on '$current', not '$BRANCH'"
  exit 0
fi
if [ -n "$(git status --porcelain)" ]; then
  log "skip: uncommitted changes"
  exit 0
fi
if [ "$(git rev-list --count "origin/$BRANCH..HEAD")" != "0" ]; then
  log "skip: local commits not on origin/$BRANCH"
  exit 0
fi
if [ "$(git rev-list --count "HEAD..origin/$BRANCH")" = "0" ]; then
  exit 0 # up to date, stay quiet
fi

before="$(git rev-parse HEAD)"
if ! git merge --ff-only --quiet "origin/$BRANCH" 2>>"$LOG"; then
  log "ERROR: fast-forward failed"
  notify "Auto-pull failed — see ~/.garaj-auto-pull.log"
  exit 1
fi
after="$(git rev-parse HEAD)"
count="$(git rev-list --count "$before..$after")"
log "updated $(git rev-parse --short "$before")..$(git rev-parse --short "$after") ($count commit(s)): $(git log -1 --format=%s)"

if [ "${AUTO_PULL_INSTALL:-1}" = "1" ] && git diff --name-only "$before" "$after" | grep -qE '^package(-lock)?\.json$'; then
  if command -v npm >/dev/null 2>&1; then
    log "package files changed → npm ci"
    npm ci --no-audit --no-fund >>"$LOG" 2>&1 || { log "ERROR: npm ci failed"; notify "Pulled, but npm ci failed"; exit 1; }
  else
    log "package files changed but npm not found on PATH"
  fi
fi

notify "Pulled $count new commit(s) from $BRANCH"
