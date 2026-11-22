#!/bin/sh
set -eu

# Install this extension from the checkout.

UUID=gnome-feed2mpv@alphabeast97.github.io
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM

gnome-extensions pack "$ROOT" \
    --extra-source=src \
    --extra-source=LICENSE \
    --out-dir="$BUILD_DIR" \
    --force

gnome-extensions install --force "$BUILD_DIR/$UUID.shell-extension.zip"
gnome-extensions enable "$UUID" || true
echo "Installed $UUID. Log out and back in for the new code to load."
