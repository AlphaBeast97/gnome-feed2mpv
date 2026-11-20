#!/bin/sh
set -eu

# Install this extension from the checkout. The pre-rename UUID is removed
# first, because an older install keeps running beside this one as a second
# panel icon.

UUID=gnome-feed2mpv@alphabeast97.github.io
LEGACY_UUID=youtube-to-mpv@alphabeast97.github.io
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM

gnome-extensions pack "$ROOT" \
    --extra-source=src \
    --extra-source=LICENSE \
    --out-dir="$BUILD_DIR" \
    --force

LEGACY_DIR=${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$LEGACY_UUID

if [ -d "$LEGACY_DIR" ] || gnome-extensions list --user 2>/dev/null | grep -qx "$LEGACY_UUID"; then
    echo "Removing the pre-rename extension ($LEGACY_UUID)"
    gnome-extensions disable "$LEGACY_UUID" 2>/dev/null || true
    gnome-extensions uninstall "$LEGACY_UUID" 2>/dev/null || true
    rm -rf "$LEGACY_DIR"
fi

gnome-extensions install --force "$BUILD_DIR/$UUID.shell-extension.zip"
gnome-extensions enable "$UUID" || true
echo "Installed $UUID. Log out and back in for the new code to load."
