# GhostClip Documentation

## Overview

GhostClip is a lightweight, open-source clipboard manager for Linux (Ubuntu/GNOME/Wayland). It replicates the Win+V experience — a borderless popup that appears instantly, lets you search and select a clip, then pastes it and disappears.

---

## Modes

The search bar doubles as a mode switcher. Type a prefix to change modes:

| Prefix | Mode | Description |
|---|---|---|
| *(none)* | Clipboard | Browse and search your clipboard history |
| `#` | Editor | Scratch pad for composing text before pasting |
| `!` | Emoji | Browse and search ~1500 emojis across 9 categories |
| `@` | Snippets | Browse text files from `~/Snippets` or `~/Documents/Snippets` |

---

## CLI & Mode-Specific Hotkeys

You can bind separate keyboard shortcuts to open GhostClip directly in a specific mode using the `--mode` flag:

```
ghostclip --toggle --mode=<mode>
```

| Mode Value | Opens In | Example Shortcut |
|---|---|---|
| `clipboard` | Clipboard (default) | Super+V |
| `editor` | Editor scratch pad | Super+/ |
| `emoji` | Emoji picker | Super+E |
| `snippets` | Snippets browser | Super+S |

### GNOME Shortcut Setup

1. Open **GNOME Settings → Keyboard → Custom Shortcuts**
2. Add multiple shortcuts:

| Name | Command | Shortcut |
|---|---|---|
| GhostClip | `ghostclip --toggle` | Super+V |
| GhostClip Editor | `ghostclip --toggle --mode=editor` | Super+/ |
| GhostClip Emoji | `ghostclip --toggle --mode=emoji` | Super+E |
| GhostClip Snippets | `ghostclip --toggle --mode=snippets` | Super+S |

Omitting `--mode` defaults to clipboard. The `--mode` flag only takes effect with `--toggle`.

---

## Clipboard Mode

The default mode. GhostClip polls your clipboard every 300ms and stores up to 50 unique text entries.

### Search
- Type to filter clips by content
- Type a number (e.g. `3`) to jump to clip `#3`

### Actions (hover a clip)
- **Click** — Paste the clip
- **Edit** (pencil icon) — Open the clip in the Editor tab for modification before pasting
- **Pin** (pin icon) — Pin the clip to the top of the list (persists across restarts)
- **Delete** (x icon) — Remove the clip from history

### Keyboard Navigation
- **Arrow Up/Down** — Navigate clips
- **Enter** — Paste selected clip
- **Escape** — Close the window
- **Ctrl+K** — Refocus the search bar

### Pinned Clips
Pinned clips appear at the top under a "Pinned" label with a gold left border. They are never evicted by the 50-item cap and survive app restarts. Pin or unpin using the pin icon on hover, or delete to unpin.

### Clear All
The trash button in the search bar clears all unpinned clips. Pinned clips are preserved.

---

## Editor Mode (`#`)

Type `#` in the search bar to open a multiline scratch pad.

### Keyboard Shortcuts
- **Enter** — New line (normal editing)
- **Ctrl+Enter** — Paste all content
- **Ctrl+Z** — Undo
- **Ctrl+Shift+Z** or **Ctrl+Y** — Redo
- **Ctrl+K** — Focus search bar (to switch modes)
- **Escape** — Close and return to clipboard mode

### Buttons
- **Clear** — Erase the editor content
- **Send** — Paste the content

### Persistence
Editor content is automatically saved to `~/.config/ghostclip/history.json` and restored on startup. You won't lose your work if the app closes unexpectedly.

### Undo/Redo
The editor maintains an undo/redo stack (up to 100 states). Use Ctrl+Z to undo and Ctrl+Shift+Z (or Ctrl+Y) to redo. The stack is session-based and resets when you send content.

### Edit Before Paste
From clipboard mode, click the pencil icon on any clip. This opens the editor with the clip's text pre-loaded, letting you modify it before pasting.

---

## Emoji Mode (`!`)

Type `!` to open the emoji picker with ~1500 emojis organized into 9 categories:

| Category | Icon |
|---|---|
| Smileys | 😀 |
| Gestures & People | 👋 |
| Hearts & Emotion | ❤️ |
| Animals | 🐶 |
| Food & Drink | 🍕 |
| Nature & Weather | 🌈 |
| Objects | 💡 |
| Symbols | ♻️ |
| Flags | 🏳️ |

### Search
Type after `!` to search by keyword (e.g., `!fire` finds fire-related emojis).

### Recent
Your last 24 selected emojis appear in a "Recent" section at the top.

---

## Snippets Mode (`@`)

Type `@` to browse files from your snippets directory. GhostClip looks for files in:
- `~/Snippets`
- `~/Documents/Snippets`

It scans recursively and supports **both text files and images**.

### Text Snippets
Text files are shown with a 120-character preview. Binary files and files over 512KB are skipped.

### Image Snippets
Image files are shown with a size indicator (e.g., `Image · 245.3KB`). Supported formats:

| Format | Extension |
|---|---|
| JPEG | `.jpg`, `.jpeg` |
| PNG | `.png` |
| GIF | `.gif` |
| BMP | `.bmp` |
| WebP | `.webp` |
| SVG | `.svg` |
| TIFF | `.tiff`, `.tif` |
| ICO | `.ico` |

Images up to 10MB are supported. When selected, the image is copied to the clipboard and pasted into the active application — just like copying an image from a file manager.

### Snippet Variables

Snippets support template variables that are expanded at paste time:

| Variable | Expands to |
|---|---|
| `{{date}}` | Current date (`2026-05-28`) |
| `{{time}}` | Current time (`14:30:05`) |
| `{{datetime}}` | Date and time (`2026-05-28 14:30:05`) |
| `{{timestamp}}` | Unix timestamp (`1748421005`) |
| `{{clipboard}}` | Current clipboard content |
| `{{user}}` | Current OS username |

Example snippet file (`~/Snippets/meeting-notes.txt`):
```
Meeting Notes - {{date}}
Attendee: {{user}}
Time: {{time}}
---
```

When pasted, this expands to:
```
Meeting Notes - 2026-05-28
Attendee: tan
Time: 14:30:05
---
```

---

## Clipboard Persistence

GhostClip saves your state to disk at `~/.config/ghostclip/history.json`. This includes:
- Up to 50 recent clips
- All pinned clips
- The last copied reference (prevents duplicate recording on restart)
- Editor content (restored on next launch)

History is saved on shutdown, after pin/unpin/delete actions, and auto-saved periodically while editing. It is restored on startup automatically.

---

## Window Behavior

- **Always on top** — overlays any active window
- **Cursor-aware positioning** — the popup appears near your mouse cursor (requires `xdotool`)
- **Blur to hide** — clicking outside the window closes it
- **Escape to hide** — press Escape to dismiss

---

## System Tray

GhostClip runs in the background as a tray icon (clipboard emoji). Right-click for:
- **Show Clipboard** — Toggle the popup window
- **Clear History** — Clear all unpinned clips
- **Quit** — Exit GhostClip

---

## Global Hotkey Setup

### Method 1: GNOME Custom Shortcut (Recommended)
See the [CLI & Mode-Specific Hotkeys](#cli--mode-specific-hotkeys) section above for setting up mode-specific shortcuts.

### Method 2: Internal Hook
GhostClip also listens for **Ctrl+Alt+V** internally via a global key hook. This may not work on all Wayland compositors, which is why Method 1 is recommended.

---

## Installation

### One-line install
```bash
curl -fsSL https://raw.githubusercontent.com/tanftw/ghostclip/master/scripts/install.sh | sudo bash
```

This installs:
- The GhostClip binary to `/usr/local/bin/ghostclip`
- System dependencies: `xclip`, `wl-clipboard`, `ydotool`, `xdotool`
- A desktop entry and autostart configuration

### Uninstall
```bash
curl -fsSL https://raw.githubusercontent.com/tanftw/ghostclip/master/scripts/uninstall.sh | sudo bash
```

---

## System Requirements

- **OS:** Ubuntu 22.04+ (GNOME/Wayland)
- **Runtime deps:** `xclip`, `wl-clipboard`, `ydotool`, `xdotool`
- **ydotoold** must be running: `systemctl --user enable --now ydotool`
- **User must be in `input` group** for ydotool access (log out/in after install)

---

## Build from Source

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0

# Clone and build
git clone https://github.com/tanftw/ghostclip.git
cd ghostclip
wails build -tags webkit2_41
```

The binary is output to `build/bin/ghostclip`.

---

## Keyboard Shortcuts Reference

| Shortcut | Context | Action |
|---|---|---|
| Super+V | Global | Toggle GhostClip (clipboard mode) |
| Super+/ | Global | Toggle GhostClip (editor mode) |
| Super+E | Global | Toggle GhostClip (emoji mode) |
| Super+S | Global | Toggle GhostClip (snippets mode) |
| Escape | Any mode | Close popup |
| Ctrl+K | Any mode | Focus search bar |
| Arrow Up/Down | Clipboard/Emoji/Snippets | Navigate items |
| Enter | Clipboard/Emoji/Snippets | Paste selected item |
| Ctrl+Enter | Editor | Paste editor content |
| Ctrl+Z | Editor | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Editor | Redo |

---

## Configuration Files

| Path | Purpose |
|---|---|
| `~/.config/ghostclip/history.json` | Saved clips, pinned items, and editor content |
| `~/Snippets/` or `~/Documents/Snippets/` | Text snippet files |
| `localStorage (ghostclip-emoji-recent)` | Recent emoji history |
