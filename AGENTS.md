# AGENTS.md - Project Specification: GhostClip

## Project Overview
GhostClip is a blazing-fast, lightweight, open-source clipboard manager designed for Linux (Ubuntu/GNOME focus) with easy extensibility to macOS. It replicates the Win+V experience — a borderless popup that appears instantly, lets you search and select a clip, then pastes it and disappears.

## Technical Stack & Constraints
- **Core Framework:** Wails v2.12.0 (Stable Release)
- **Backend Language:** Go (Golang)
- **Frontend Stack:** Vanilla TypeScript + Vite + Tailwind CSS 4 (No heavy UI frameworks)
- **Operating System Baseline:** Ubuntu 26.04 LTS, GNOME 50.1, Wayland
- **Build Tag:** `webkit2_41` (Ubuntu 26.04 only has webkit2gtk-4.1)
- **Package Manager:** `pnpm` (not npm)
- **Design Paradigm:** Invisible background service that invokes a borderless modal instantly upon hotkey command.

---

## Architecture

### File Structure
```
main.go              — Window config, single-instance lock, CLI arg parsing (--toggle, --mode)
app.go               — Clipboard engine, paste logic, snippets, pins, persistence, snippet variables, image thumbnails
tray.go              — System tray via fyne.io/systray (Show/Clear/Quit)
frontend/src/main.ts — All mode UIs, keyboard navigation, event handling
frontend/src/style.css — Dark theme, all component styles
frontend/src/emojis.ts — Emoji dataset (9 categories, ~1500 emojis)
frontend/index.html  — HTML shell with search bar, close button, clear all
scripts/install.sh   — One-line installer (deps + binary + autostart + tray icon)
scripts/uninstall.sh — Clean uninstaller
.github/workflows/release.yml — CI/CD for tag-based releases (ubuntu-24.04 runner, Go 1.24)
docs.md              — Full feature documentation
```

### Window Configuration (`main.go`)
- **Frameless:** `Frame: false` — no title bars, resize handles, or native borders
- **Always On Top:** `AlwaysOnTop: true` — overlays active applications
- **Hidden Start:** `StartHidden: true` — boots silently, no visual flash
- **Sizing:** 540×580, `BackgroundColour: {R:0, G:0, B:0, A:1}` with `#app` as lighter inner container
- **Single Instance:** Unix socket at `/tmp/ghostclip.sock` — second instance sends toggle signal and exits
- **CLI Args:** `ghostclip --toggle` (default mode), `ghostclip --toggle --mode=editor|emoji|snippets|clipboard`

### Clipboard Engine (`app.go`)
- Polls via `xclip -selection clipboard -o` every 300ms (not `wl-paste` — causes GNOME UI flickering)
- Writes via `wl-copy` for pasting
- Auto-paste via `ydotool key 42:1 110:1 110:0 42:0` (Shift+Insert — works in terminals and GUI apps)
- **De-duplication:** Stores `lastCopied` string, skips identical reads
- **Memory Cap:** 50 entries max for clips, 50 for pinned
- Emits `"clipboard_updated"` event with `{clips: [...], pinned: [...]}`

### Toggle & Mode System
- `listenForToggle()` reads `"toggle"` or `"toggle:<mode>"` from Unix socket
- `toggleWindowWithMode(mode)` positions window at cursor via `xdotool getmouselocation`, shows window, emits `"set_mode"` event
- Frontend listens for `"set_mode"` and sets search prefix (`#`, `!`, `@`, or empty)

### Persistence
- Saves to `~/.config/ghostclip/history.json` on shutdown, pin/unpin/delete, and editor changes (debounced 500ms)
- Restores clips, pinned clips, lastCopied, and editor text on startup
- Structure: `{"clips": [...], "pinned": [...], "lastCopied": "...", "editorText": "..."}`

---

## Modes (Search Prefix Switcher)

| Prefix | Mode | Description |
|---|---|---|
| *(none)* | Clipboard | Browse/search clipboard history with pinned section |
| `#` | Editor | Multiline scratch pad with undo/redo |
| `!` | Emoji | ~1500 emojis, 9 categories, keyword search, recent history |
| `@` | Snippets | Text files and images from `~/Snippets` or `~/Documents/Snippets` |

---

## Feature Details

### Clipboard Mode
- Search: filter by content or jump to `#N` by number
- Hover actions: Edit (pencil), Pin (pin icon), Delete (x)
- Pinned clips: gold left border, separate "Pinned" section, never evicted by 50-cap, survive restarts
- Clear All: clears unpinned only, pinned preserved
- Keyboard: Arrow Up/Down, Enter, Escape, Ctrl+K

### Editor Mode (`#`)
- Multiline textarea with monospace font
- **Ctrl+Enter** = paste content (uses `e.stopPropagation()` to prevent document handler interference)
- **Ctrl+Z** = undo, **Ctrl+Shift+Z / Ctrl+Y** = redo (100-state stack)
- **Ctrl+K** = focus search bar (handled before editor early-return guard)
- Content persisted to `history.json`, restored on startup
- Edit-before-paste: pencil icon on clip card loads text into editor
- Footer: character count, line count, undo depth

### Emoji Mode (`!`)
- 9 category tabs with icon buttons
- Keyword search across all categories
- Recent history (last 24) stored in `localStorage` key `ghostclip-emoji-recent`

### Snippets Mode (`@`)
- Scans `~/Snippets` and `~/Documents/Snippets` recursively
- **Text files:** up to 512KB, 120-char preview, binary files skipped
- **Image files:** up to 10MB, supports jpg/jpeg/png/gif/bmp/webp/svg/ico/tiff
- Image snippets: 48×48 thumbnail via base64 data URI (`GetSnippetThumbnail`), `wl-copy --type <mime>` for pasting
- Snippet variables expanded at paste time: `{{date}}`, `{{time}}`, `{{datetime}}`, `{{timestamp}}`, `{{clipboard}}`, `{{user}}`
- Rescan on window open (focus event) and `set_mode` event — NOT on every render/navigation
- `selectCurrent()` checks `snippet.isImage` to call `PasteSnippetImage` vs `GetSnippetContent`+`SelectSnippet`

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
|---|---|---|
| Super+V | Global | `ghostclip --toggle` (clipboard) |
| Super+/ | Global | `ghostclip --toggle --mode=editor` |
| Super+E | Global | `ghostclip --toggle --mode=emoji` |
| Super+S | Global | `ghostclip --toggle --mode=snippets` |
| Escape | Any mode | Close popup |
| Ctrl+K | Any mode (including editor) | Focus search bar |
| Arrow Up/Down | Clipboard/Emoji/Snippets | Navigate items |
| Enter | Clipboard/Emoji/Snippets | Paste selected item |
| Ctrl+Enter | Editor | Paste editor content |
| Ctrl+Z | Editor | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Editor | Redo |

---

## System Requirements & Dependencies
- **OS:** Ubuntu 22.04+ (GNOME/Wayland)
- **Runtime deps:** `xclip`, `wl-clipboard`, `ydotool`, `xdotool`
- **ydotoold** runs as user-level systemd service, socket at `/run/user/$UID/.ydotool_socket`
- **User must be in `input` group** for ydotool access (log out/in after install)
- Install: `curl -fsSL https://raw.githubusercontent.com/tanftw/ghostclip/master/scripts/install.sh | sudo bash`

---

## Build & Release
- Build: `wails build -tags webkit2_41` (binary at `build/bin/ghostclip`)
- Dev: `wails dev -tags webkit2_41`
- Release: tag-based GitHub Actions workflow on `ubuntu-24.04` runner, Go 1.24
- GitHub repo: https://github.com/tanftw/ghostclip (default branch: `master`)
- Binary released as `ghostclip-amd64`

---

## Key Technical Decisions
- `xclip` over `wl-paste` for reading — wl-paste caused GNOME UI flickering, xclip via XWayland does not
- `wl-paste -w` (watch mode) doesn't work on GNOME (requires wlroots data-control protocol)
- `wtype` doesn't work on GNOME (no zwp_virtual_keyboard support)
- Shift+Insert over Ctrl+V — works consistently in both terminals and GUI apps
- `ydotool` key codes: Shift=42, Insert=110
- Position numbers preserved during search filtering (original index maintained)
- Emoji recent history in `localStorage` (not filesystem)
- `StartHidden` (not `Hidden` field) — Wails v2 API
- No `WindowToggle` in Wails v2 — must use `WindowShow/WindowHide` manually
- Editor textarea uses `e.stopPropagation()` on Ctrl+Enter to prevent document handler from firing after mode changes
- Ctrl+K handler placed BEFORE editor early-return guard in document keydown handler

---

## Known Limitations
- True rounded window corners impossible on GNOME Wayland (no window transparency support in WebKitGTK)
- Window position clamps to 1920×1080 bounds — should ideally detect actual screen size
