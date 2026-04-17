#!/usr/bin/env bash
# BiotechOS Quote Assistant — production build script (Mac/Linux)
# Usage: bash build.sh
# Output: biotechos-quote-assistant-v0.1.0.zip (in the gmail-extension-cro folder)

set -e

VERSION="0.1.0"
OUT="biotechos-quote-assistant-v${VERSION}.zip"
STAGING="_build_staging"

echo "[1/4] Cleaning previous build..."
rm -rf "$STAGING" "$OUT"

echo "[2/4] Copying extension files..."
mkdir -p "$STAGING"
cp manifest.production.json "$STAGING/manifest.json"
cp -r icons "$STAGING/"
cp -r src "$STAGING/"

echo "[3/4] Creating ZIP..."
cd "$STAGING"
zip -r -q "../$OUT" .
cd ..

echo "[4/4] Cleaning up staging..."
rm -rf "$STAGING"

echo ""
echo "Done: $OUT"
echo "Upload this file at https://chrome.google.com/webstore/devconsole"
