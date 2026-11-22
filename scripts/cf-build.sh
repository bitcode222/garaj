#!/usr/bin/env bash
# Puts the shop's app and the storefront into one folder for the Cloudflare Worker.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf cloudflare/dist
cp -R out cloudflare/dist
mkdir -p cloudflare/dist/service
cp cloudflare/storefront/* cloudflare/dist/service/
