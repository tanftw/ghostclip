#!/usr/bin/env bash
set -euo pipefail

BINARY="ghostclip"
INSTALL_DIR="/usr/local/bin"
DESKTOP_FILE="/usr/share/applications/${BINARY}.desktop"
USER="${SUDO_USER:-$USER}"

echo "==> Uninstalling GhostClip..."

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run with sudo"
    exit 1
fi

pkill -f "${INSTALL_DIR}/${BINARY}" 2>/dev/null || true

rm -f "${INSTALL_DIR}/${BINARY}"
rm -f "$DESKTOP_FILE"
rm -f "/home/${USER}/.config/autostart/${BINARY}.desktop"
rm -f "/tmp/${BINARY}.sock"

echo "==> GhostClip uninstalled."
