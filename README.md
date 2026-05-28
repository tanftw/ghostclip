# GhostClip

[![Release](https://github.com/tanftw/ghostclip/actions/workflows/release.yml/badge.svg)](https://github.com/tanftw/ghostclip/actions/workflows/release.yml)

A blazing-fast, lightweight, open-source clipboard manager for Linux. Replicates the Windows `Win + V` experience on Ubuntu/GNOME — without the bloat.

Built with [Wails](https://wails.io) (Go + TypeScript), featuring a frameless always-on-top popup, real-time clipboard tracking, instant paste-on-select, and system tray integration. Designed for Wayland.

## Features

- **Instant popup** — bound to `Super + V` (or any hotkey via GNOME Settings)
- **Click-to-paste** — selecting a clip copies it and auto-pastes into the previously focused app
- **Live clipboard tracking** — captures every copy in real time via `xclip`
- **Search** — filter through your clipboard history instantly
- **Keyboard navigation** — arrow keys + Enter to select, Esc to dismiss
- **Click outside to dismiss** — window hides on focus loss
- **System tray** — tray icon with Show, Clear History, and Quit
- **50-item history** — in-memory with deduplication (zero disk footprint)
- **Single instance** — second launches signal the running instance via Unix socket
- **Autostart** — starts silently in the background on login
- **8 MB binary** — no Electron, no heavy runtime

## Installation

### One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/tanftw/ghostclip/master/scripts/install.sh | sudo bash
```

This will:
- Install dependencies (`xclip`, `wl-clipboard`, `ydotool`)
- Download the latest binary to `/usr/local/bin/ghostclip`
- Set up autostart, system tray, and user permissions
- Add your user to the `input` group (for auto-paste)

After installation, **log out and back in** for the group change to take effect.

### Set up the keyboard shortcut

1. Open **GNOME Settings** → **Keyboard** → **Custom Shortcuts**
2. Click **Add Shortcut**:
   - **Name:** `GhostClip`
   - **Command:** `ghostclip --toggle`
   - **Shortcut:** `Super + V`

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/tanftw/ghostclip/master/scripts/uninstall.sh | sudo bash
```

## Usage

1. GhostClip starts silently on login (via autostart)
2. Copy text anywhere — it's captured automatically
3. Press **Super + V** to open the popup
4. **Click** a clip to paste it directly into your active app
5. **Search** by typing in the filter bar
6. **Arrow keys** + **Enter** to navigate and select
7. **Esc** or click outside to dismiss

## Development

### Prerequisites

- [Go](https://go.dev/dl/) 1.24+
- [Node.js](https://nodejs.org/) 20+ with [pnpm](https://pnpm.io/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) v2.12.0
- System libraries: `pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev`

```bash
# Install system deps (Ubuntu/Debian)
sudo apt install pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev

# Install runtime deps
sudo apt install xclip wl-clipboard ydotool

# Add user to input group for ydotool
sudo usermod -aG input $USER

# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0

# Log out/in for group change
```

### Clone and Run

```bash
git clone https://github.com/tanftw/ghostclip.git
cd ghostclip

# Install frontend deps
cd frontend && pnpm install && cd ..

# Run in dev mode (hot reload)
wails dev -tags webkit2_41
```

### Build

```bash
wails build -tags webkit2_41
```

The binary is output to `build/bin/ghostclip`.

### Replace the binary

On development, you might want to replace running library when changed

```bash
pkill ghostclip; sleep 1; sudo cp build/bin/ghostclip /usr/local/bin/ghostclip; ghostclip &
```

## Architecture

```
main.go          Window config, single-instance lock, CLI arg handling
app.go           Clipboard engine, paste simulation, toggle logic
tray.go          System tray icon and menu
frontend/
  src/main.ts    UI: cards, search, keyboard nav, event bindings
  src/style.css  Dark theme (Libadwaita-inspired)
  vite.config.ts Tailwind CSS + Vite config
scripts/
  install.sh     One-line installer
  uninstall.sh   Clean uninstaller
```

### Key design decisions

| Concern | Solution |
|---|---|
| Clipboard reading | `xclip` via XWayland (no UI flicker on GNOME/Wayland) |
| Clipboard writing | `wl-copy` (native Wayland) |
| Auto-paste (Ctrl+V) | `ydotool` via `/dev/uinput` (Wayland-compatible) |
| Hotkey binding | GNOME Custom Shortcut → `ghostclip --toggle` |
| Single instance | Unix domain socket at `/tmp/ghostclip.sock` |
| Window style | Frameless, always-on-top, 360×580, starts hidden |

## Tech Stack

- **Backend:** Go (Wails v2.12.0)
- **Frontend:** TypeScript + Vite + Tailwind CSS
- **Target:** Ubuntu 26.04 LTS / GNOME 50 / Wayland

## License

[MIT](LICENSE)
