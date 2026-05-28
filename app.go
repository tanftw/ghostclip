package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var listener net.Listener

type App struct {
	ctx        context.Context
	clips      []string
	lastCopied string
	mu         sync.Mutex
	visible    bool
}

func NewApp() *App {
	return &App{
		clips:   make([]string, 0),
		visible: false,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.watchClipboard()
	go a.listenForToggle()
	go a.startTray()
}

func (a *App) shutdown(ctx context.Context) {
	if listener != nil {
		listener.Close()
	}
	os.RemoveAll(socketPath)
}

func (a *App) watchClipboard() {
	time.Sleep(1 * time.Second)
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		out, err := exec.Command("xclip", "-selection", "clipboard", "-o").Output()
		if err != nil {
			continue
		}
		trimmed := strings.TrimSpace(string(out))
		if trimmed == "" {
			continue
		}

		a.mu.Lock()
		if a.lastCopied == trimmed {
			a.mu.Unlock()
			continue
		}

		a.lastCopied = trimmed
		a.clips = dedupPrepend(a.clips, trimmed, 50)
		clipsCopy := make([]string, len(a.clips))
		copy(clipsCopy, a.clips)
		a.mu.Unlock()

		runtime.EventsEmit(a.ctx, "clipboard_updated", clipsCopy)
	}
}

func (a *App) listenForToggle() {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		buf := make([]byte, 64)
		n, _ := conn.Read(buf)
		msg := string(buf[:n])
		conn.Close()

		if msg == "toggle" {
			a.toggleWindow()
		}
	}
}

func (a *App) toggleWindow() {
	a.mu.Lock()
	a.visible = !a.visible
	a.mu.Unlock()

	if a.visible {
		runtime.WindowShow(a.ctx)
	} else {
		runtime.WindowHide(a.ctx)
	}
}

func (a *App) SelectClip(text string) {
	a.mu.Lock()
	a.lastCopied = text
	a.visible = false
	a.mu.Unlock()

	exec.Command("wl-copy", text).Run()
	runtime.WindowHide(a.ctx)

	go func() {
		time.Sleep(150 * time.Millisecond)
		socket := fmt.Sprintf("/run/user/%d/.ydotool_socket", os.Getuid())
		cmd := exec.Command("ydotool", "key", "29:1", "47:1", "47:0", "29:0")
		cmd.Env = append(os.Environ(), "YDOTOOL_SOCKET="+socket)
		cmd.Run()
	}()
}

func (a *App) GetClips() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	result := make([]string, len(a.clips))
	copy(result, a.clips)
	return result
}

func (a *App) ClearHistory() {
	a.mu.Lock()
	a.clips = make([]string, 0)
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "clipboard_updated", []string{})
}

func (a *App) HideWindow() {
	a.mu.Lock()
	a.visible = false
	a.mu.Unlock()
	runtime.WindowHide(a.ctx)
}

func dedupPrepend(slice []string, val string, max int) []string {
	result := []string{val}
	for _, s := range slice {
		if s != val && len(result) < max {
			result = append(result, s)
		}
	}
	return result
}
