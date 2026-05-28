#!/usr/bin/env bash
set -euo pipefail

REPO="tanftw/ghostclip"
BINARY="ghostclip"
INSTALL_DIR="/usr/local/bin"
DESKTOP_FILE="/usr/share/applications/${BINARY}.desktop"

echo "==> Installing GhostClip..."

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run with sudo: curl -fsSL <url>/install.sh | sudo bash"
    exit 1
fi

echo "==> Installing dependencies..."
apt-get update -qq 2>/dev/null || true
apt-get install -y -qq xclip wl-clipboard ydotool xdotool 2>/dev/null

echo "==> Downloading GhostClip..."
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    *)       echo "ERROR: Unsupported architecture: $ARCH"; exit 1 ;;
esac

LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed -E 's/.*"v?([^"]+)".*/\1/')
URL="https://github.com/${REPO}/releases/download/v${LATEST}/${BINARY}-${ARCH}"

TMPFILE=$(mktemp)
curl -fsSL "$URL" -o "$TMPFILE"
chmod +x "$TMPFILE"
mv "$TMPFILE" "${INSTALL_DIR}/${BINARY}"

echo "==> Setting up user permissions for ydotool..."
usermod -aG input "${SUDO_USER:-$USER}" 2>/dev/null || true

echo "==> Enabling ydotool service..."
SUDO_UID=$(id -u "${SUDO_USER:-$USER}")
sudo -u "${SUDO_USER:-$USER}" XDG_RUNTIME_DIR="/run/user/${SUDO_UID}" \
    systemctl --user enable ydotool 2>/dev/null || true
sudo -u "${SUDO_USER:-$USER}" XDG_RUNTIME_DIR="/run/user/${SUDO_UID}" \
    systemctl --user start ydotool 2>/dev/null || true

echo "==> Creating desktop entry..."
ICON_DIR="/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$ICON_DIR"
TMPFILE_ICON=$(mktemp /tmp/ghostclip-icon.XXXXXX.png)
curl -fsSL "https://raw.githubusercontent.com/${REPO}/master/build/appicon.png" -o "$TMPFILE_ICON"
if [ -s "$TMPFILE_ICON" ]; then
    mv "$TMPFILE_ICON" "${ICON_DIR}/${BINARY}.png"
else
    rm -f "$TMPFILE_ICON"
fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=GhostClip
Comment=Lightweight clipboard manager for Linux
Exec=${INSTALL_DIR}/${BINARY}
Icon=${BINARY}
Terminal=false
Type=Application
Categories=Utility;
StartupNotify=false
X-GNOME-Autostart-enabled=true
Hidden=false
EOF

echo "==> Setting up autostart..."
AUTOSTART_DIR="/home/${SUDO_USER:-$USER}/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cp "$DESKTOP_FILE" "${AUTOSTART_DIR}/${BINARY}.desktop"
chown -R "${SUDO_USER:-$USER}" "$AUTOSTART_DIR"

echo ""
echo "==> Starting GhostClip..."
sudo -u "${SUDO_USER:-$USER}" XDG_RUNTIME_DIR="/run/user/${SUDO_UID}" \
    nohup "${INSTALL_DIR}/${BINARY}" > /dev/null 2>&1 &
sleep 1

echo ""
echo "==> GhostClip v${LATEST} installed and running!"
echo ""
echo "To set up the keyboard shortcut:"
echo "  1. Open GNOME Settings → Keyboard → Custom Shortcuts"
echo "  2. Add a new shortcut:"
echo "     Name: GhostClip"
echo "     Command: ${INSTALL_DIR}/${BINARY} --toggle"
echo "     Shortcut: Super+V (or your preferred hotkey)"
echo ""
echo "NOTE: Log out/in for the 'input' group change to take effect."
