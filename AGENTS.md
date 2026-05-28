# AGENTS.md - Project Specification: GhostClip

## Project Overview
GhostClip is a blazing-fast, lightweight, open-source clipboard manager designed for Linux (Ubuntu/GNOME focus) with easy extensibility to macOS. It aims to completely replicate the core UX of Windows + V (`Win + V`) without the bloat, legacy UI patterns, or massive RAM footprints of tools like Electron or CopyQ.

## Technical Stack & Constraints
- **Core Framework:** Wails v2.12.0 (Stable Release)
- **Backend Language:** Go (Golang)
- **Frontend Stack:** Vanilla TypeScript + Vite + Tailwind CSS (No heavy UI frameworks)
- **Operating System Baseline:** Ubuntu (GNOME Desktop Environment utilizing Wayland by default)
- **Design Paradigm:** Invisible background service that invokes a borderless modal instantly upon hotkey command.

---

## Technical Specifications & Architecture

### 1. Window Configuration (`main.go`)
The main Wails application instance must be customized to act like a floating utility panel rather than a standard desktop app.
- **Frameless:** Set `Frame: false` to remove window title bars, resize handles, and native system borders.
- **Always On Top:** Set `AlwaysOnTop: true` so it overlays active focus applications.
- **Initial State:** Must boot completely silent with `Hidden: true`. The UI should not visually flash on system startup.
- **Sizing:** Fixed dimensions optimized for vertically scannable text snippets (Recommended: `Width: 360`, `Height: 580`).

### 2. Clipboard Polling Engine (`app.go`)
Because modern Linux display servers (Wayland) isolate clipboard boundaries, a highly optimized background execution routine is mandatory.
- Implement an unblocking `goroutine` during the `OnStartup` hook lifecycle.
- Poll the system clipboard using Wails native runtime utility `runtime.ClipboardGetText(ctx)` every 300–400ms.
- **De-duplication:** Prevent infinite cycles by storing the `lastCopied` string value. Do not push changes to the frontend if the clipboard item is identical to the current index 0 slot.
- **Memory Cap:** Limit total in-memory slice arrays to the last 50 entries to safeguard RAM.

### 3. Wayland-Compliant Global Hotkey Engine
Wayland strictly blocks standard global input sniffers out-of-the-box for security. To ensure 100% operation on Ubuntu, the agent must implement **two concurrent toggle paths**:

- **Path A (Internal Hook):** Bind an internal global key listener package (e.g., `github.com/robotn/hook`) to catch `Ctrl + Alt + V`.
- **Path B (CLI Argument Fallback):** Implement a single-instance CLI argument parser in `main.go`. If a user calls `ghostclip --toggle` while the app is already running, the secondary instance must safely signal the primary running instance to alternate visibility (`runtime.WindowShow` / `runtime.WindowHide`) and exit immediately. This allows users to map a native custom shortcut inside Ubuntu Settings straight to the binary.

### 4. Frontend Requirements (`frontend/src/`)
- **Visual Feel:** Use Tailwind CSS to craft a dark, sleek design matching modern GNOME Shell (Libadwaita scheme). Cards must have subtle hover states and focus rings.
- **Truncation:** Safely handle massive clip walls by truncating text previews inside cards after 120 characters with trailing ellipses (`...`).
- **Communication:** Leverage `runtime.EventsOn` to consume `"clipboard_updated"` payloads reactively.

---

## Core Feature Requirements (Backlog)

- [ ] **Background Initialization:** Boots straight into hidden tray status without user interaction.
- [ ] **Reactive Event Binding:** When text is caught in Go, it must instantly flow into JS/TS layout state without manual page refreshes.
- [ ] **Selection/Paste Insertion Execution:** Clicking a card triggers `runtime.ClipboardSetText()`, updates the local backend `lastCopied` memory reference to prevent infinite recording loops, and fires `runtime.WindowHide()`.
- [ ] **Sanitization:** Strips empty strings, massive structural duplicate items, or zero-byte payloads from filling up the cache array.

---

## Agent Step-by-Step Implementation Instructions

1. Run `wails init -n ghostclip -t vanilla-ts` to set up the clean base project structure.
2. Install Tailwind CSS inside the `frontend/` directory and tie it directly into the Vite compilation pipe.
3. Configure `main.go` using the explicit single-instance option parameters and disable title bars (`Frame: false`).
4. Build the `watchClipboard` loop engine using Go routines inside `app.go`. Ensure memory storage constraints are respected.
5. Create UI click bindings to pipe select texts back down to the target system clip registers.
6. Test using `wails dev` to confirm clipboard tracking and window toggle speeds.