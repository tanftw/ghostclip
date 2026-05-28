package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var listener net.Listener

type App struct {
	ctx        context.Context
	clips      []string
	pinned     []string
	lastCopied string
	mu         sync.Mutex
	visible    bool
	editorText string
}

type Snippet struct {
	Name     string `json:"name"`
	SubPath  string `json:"subPath"`
	Preview  string `json:"preview"`
	IsImage  bool   `json:"isImage"`
	FileSize int64  `json:"fileSize"`
}

type historyFile struct {
	Clips      []string `json:"clips"`
	Pinned     []string `json:"pinned"`
	LastCopied string   `json:"lastCopied"`
	EditorText string   `json:"editorText"`
}

func configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "ghostclip")
}

func historyPath() string {
	return filepath.Join(configDir(), "history.json")
}

func NewApp() *App {
	return &App{
		clips:      make([]string, 0),
		pinned:     make([]string, 0),
		visible:    false,
		editorText: "",
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.loadHistory()
	go a.watchClipboard()
	go a.listenForToggle()
	go a.startTray()
}

func (a *App) shutdown(ctx context.Context) {
	a.saveHistory()
	if listener != nil {
		listener.Close()
	}
	os.RemoveAll(socketPath)
}

func (a *App) loadHistory() {
	a.mu.Lock()
	defer a.mu.Unlock()

	data, err := os.ReadFile(historyPath())
	if err != nil {
		return
	}
	var h historyFile
	if json.Unmarshal(data, &h) != nil {
		return
	}
	if h.Clips != nil {
		a.clips = h.Clips
	}
	if h.Pinned != nil {
		a.pinned = h.Pinned
	}
	a.lastCopied = h.LastCopied
	a.editorText = h.EditorText
}

func (a *App) saveHistory() {
	a.mu.Lock()
	h := historyFile{
		Clips:      a.clips,
		Pinned:     a.pinned,
		LastCopied: a.lastCopied,
		EditorText: a.editorText,
	}
	a.mu.Unlock()

	os.MkdirAll(configDir(), 0755)
	data, err := json.Marshal(h)
	if err != nil {
		return
	}
	os.WriteFile(historyPath(), data, 0644)
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
		pinnedCopy := make([]string, len(a.pinned))
		copy(pinnedCopy, a.pinned)
		a.mu.Unlock()

		runtime.EventsEmit(a.ctx, "clipboard_updated", map[string]interface{}{
			"clips":  clipsCopy,
			"pinned": pinnedCopy,
		})
	}
}

func (a *App) listenForToggle() {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		buf := make([]byte, 128)
		n, _ := conn.Read(buf)
		msg := string(buf[:n])
		conn.Close()

		mode := ""
		if strings.HasPrefix(msg, "toggle:") {
			mode = strings.TrimPrefix(msg, "toggle:")
		}
		a.toggleWindowWithMode(mode)
	}
}

func (a *App) getMousePosition() (int, int) {
	out, err := exec.Command("xdotool", "getmouselocation", "--shell").Output()
	if err != nil {
		return -1, -1
	}
	var x, y int
	for _, line := range strings.Split(string(out), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(parts) != 2 {
			continue
		}
		switch parts[0] {
		case "X":
			x, _ = strconv.Atoi(parts[1])
		case "Y":
			y, _ = strconv.Atoi(parts[1])
		}
	}
	return x, y
}

func (a *App) toggleWindow() {
	a.toggleWindowWithMode("")
}

func (a *App) toggleWindowWithMode(mode string) {
	a.mu.Lock()
	a.visible = !a.visible
	show := a.visible
	a.mu.Unlock()

	if show {
		mx, my := a.getMousePosition()
		if mx >= 0 && my >= 0 {
			winW, winH := 540, 580
			x := mx + 15
			y := my - winH/2
			if x+winW > 1920 {
				x = mx - winW - 15
			}
			if y < 0 {
				y = 10
			}
			if y+winH > 1080 {
				y = 1080 - winH - 10
			}
			runtime.WindowSetPosition(a.ctx, x, y)
		}
		runtime.WindowShow(a.ctx)
		if mode != "" {
			time.Sleep(50 * time.Millisecond)
			runtime.EventsEmit(a.ctx, "set_mode", mode)
		}
	} else {
		runtime.WindowHide(a.ctx)
	}
}

func (a *App) pasteText(text string) {
	a.mu.Lock()
	a.lastCopied = text
	a.visible = false
	a.mu.Unlock()

	exec.Command("wl-copy", text).Run()
	runtime.WindowHide(a.ctx)

	go func() {
		time.Sleep(150 * time.Millisecond)
		socket := fmt.Sprintf("/run/user/%d/.ydotool_socket", os.Getuid())
		cmd := exec.Command("ydotool", "key", "42:1", "110:1", "110:0", "42:0")
		cmd.Env = append(os.Environ(), "YDOTOOL_SOCKET="+socket)
		cmd.Run()
	}()
}

func (a *App) SelectClip(text string) {
	a.pasteText(text)
}

func (a *App) SelectSnippet(content string) {
	a.pasteText(a.expandVariables(content))
}

func (a *App) PasteSnippetImage(name string) {
	home, _ := os.UserHomeDir()
	var filePath string
	for _, base := range []string{
		filepath.Join(home, "Snippets"),
		filepath.Join(home, "Documents", "Snippets"),
	} {
		candidate := filepath.Join(base, name)
		if _, err := os.Stat(candidate); err == nil {
			filePath = candidate
			break
		}
		found := findFile(base, name)
		if found != "" {
			filePath = found
			break
		}
	}
	if filePath == "" {
		return
	}

	mime := imageMime(strings.ToLower(filepath.Ext(filePath)))
	if mime == "" {
		return
	}

	a.mu.Lock()
	a.lastCopied = "[image:" + name + "]"
	a.visible = false
	a.mu.Unlock()

	f, err := os.Open(filePath)
	if err != nil {
		return
	}
	defer f.Close()

	cmd := exec.Command("wl-copy", "--type", mime)
	cmd.Stdin = f
	cmd.Run()

	runtime.WindowHide(a.ctx)

	go func() {
		time.Sleep(150 * time.Millisecond)
		socket := fmt.Sprintf("/run/user/%d/.ydotool_socket", os.Getuid())
		pasteCmd := exec.Command("ydotool", "key", "42:1", "110:1", "110:0", "42:0")
		pasteCmd.Env = append(os.Environ(), "YDOTOOL_SOCKET="+socket)
		pasteCmd.Run()
	}()
}

func (a *App) GetClips() map[string]interface{} {
	a.mu.Lock()
	defer a.mu.Unlock()
	clipsCopy := make([]string, len(a.clips))
	copy(clipsCopy, a.clips)
	pinnedCopy := make([]string, len(a.pinned))
	copy(pinnedCopy, a.pinned)
	return map[string]interface{}{
		"clips":  clipsCopy,
		"pinned": pinnedCopy,
	}
}

func (a *App) PinClip(text string) {
	a.mu.Lock()
	a.pinned = dedupPrepend(a.pinned, text, 50)
	filtered := make([]string, 0, len(a.clips))
	for _, s := range a.clips {
		if s != text {
			filtered = append(filtered, s)
		}
	}
	a.clips = filtered
	clipsCopy := make([]string, len(a.clips))
	copy(clipsCopy, a.clips)
	pinnedCopy := make([]string, len(a.pinned))
	copy(pinnedCopy, a.pinned)
	a.mu.Unlock()

	runtime.EventsEmit(a.ctx, "clipboard_updated", map[string]interface{}{
		"clips":  clipsCopy,
		"pinned": pinnedCopy,
	})
	go a.saveHistory()
}

func (a *App) UnpinClip(text string) {
	a.mu.Lock()
	filtered := make([]string, 0, len(a.pinned))
	for _, s := range a.pinned {
		if s != text {
			filtered = append(filtered, s)
		}
	}
	a.pinned = filtered
	a.clips = dedupPrepend(a.clips, text, 50)
	clipsCopy := make([]string, len(a.clips))
	copy(clipsCopy, a.clips)
	pinnedCopy := make([]string, len(a.pinned))
	copy(pinnedCopy, a.pinned)
	a.mu.Unlock()

	runtime.EventsEmit(a.ctx, "clipboard_updated", map[string]interface{}{
		"clips":  clipsCopy,
		"pinned": pinnedCopy,
	})
	go a.saveHistory()
}

func (a *App) ClearHistory() {
	a.mu.Lock()
	a.clips = make([]string, 0)
	clipsCopy := make([]string, 0)
	pinnedCopy := make([]string, len(a.pinned))
	copy(pinnedCopy, a.pinned)
	a.mu.Unlock()

	runtime.EventsEmit(a.ctx, "clipboard_updated", map[string]interface{}{
		"clips":  clipsCopy,
		"pinned": pinnedCopy,
	})
	go a.saveHistory()
}

func (a *App) DeleteClip(text string) {
	a.mu.Lock()
	filtered := make([]string, 0, len(a.clips))
	for _, s := range a.clips {
		if s != text {
			filtered = append(filtered, s)
		}
	}
	a.clips = filtered
	clipsCopy := make([]string, len(a.clips))
	copy(clipsCopy, a.clips)
	pinnedCopy := make([]string, len(a.pinned))
	copy(pinnedCopy, a.pinned)
	a.mu.Unlock()

	runtime.EventsEmit(a.ctx, "clipboard_updated", map[string]interface{}{
		"clips":  clipsCopy,
		"pinned": pinnedCopy,
	})
	go a.saveHistory()
}

func (a *App) HideWindow() {
	a.mu.Lock()
	a.visible = false
	a.mu.Unlock()
	runtime.WindowHide(a.ctx)
}

func (a *App) GetEditorText() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.editorText
}

func (a *App) SetEditorText(text string) {
	a.mu.Lock()
	a.editorText = text
	a.mu.Unlock()
	go a.saveHistory()
}

func (a *App) expandVariables(content string) string {
	now := time.Now()
	replacements := map[string]string{
		"{{date}}":      now.Format("2006-01-02"),
		"{{time}}":      now.Format("15:04:05"),
		"{{datetime}}":  now.Format("2006-01-02 15:04:05"),
		"{{timestamp}}": strconv.FormatInt(now.Unix(), 10),
		"{{user}}":      os.Getenv("USER"),
	}

	if strings.Contains(content, "{{clipboard}}") {
		out, err := exec.Command("xclip", "-selection", "clipboard", "-o").Output()
		if err == nil {
			replacements["{{clipboard}}"] = strings.TrimRight(string(out), "\n")
		}
	}

	for k, v := range replacements {
		content = strings.ReplaceAll(content, k, v)
	}
	return content
}

func imageMime(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".bmp":
		return "image/bmp"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".tiff", ".tif":
		return "image/tiff"
	default:
		return ""
	}
}

func isImageExt(ext string) bool {
	return imageMime(ext) != ""
}

func formatSize(size int64) string {
	if size < 1024 {
		return fmt.Sprintf("%dB", size)
	}
	if size < 1024*1024 {
		return fmt.Sprintf("%.1fKB", float64(size)/1024)
	}
	return fmt.Sprintf("%.1fMB", float64(size)/(1024*1024))
}

func (a *App) GetSnippets() []Snippet {
	home, _ := os.UserHomeDir()
	snippetDir := ""
	for _, p := range []string{
		filepath.Join(home, "Snippets"),
		filepath.Join(home, "Documents", "Snippets"),
	} {
		if info, err := os.Stat(p); err == nil && info.IsDir() {
			snippetDir = p
			break
		}
	}
	if snippetDir == "" {
		return []Snippet{}
	}

	var snippets []Snippet
	filepath.WalkDir(snippetDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		rel, _ := filepath.Rel(snippetDir, path)
		subDir := filepath.Dir(rel)
		subPath := ""
		if subDir != "." {
			subPath = subDir + string(filepath.Separator)
		}

		if isImageExt(ext) {
			if info.Size() > 10*1024*1024 {
				return nil
			}
			snippets = append(snippets, Snippet{
				Name:     filepath.Base(path),
				SubPath:  subPath,
				Preview:  fmt.Sprintf("Image · %s", formatSize(info.Size())),
				IsImage:  true,
				FileSize: info.Size(),
			})
			return nil
		}

		if info.Size() > 512*1024 {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		if bytes.IndexByte(data, 0) != -1 {
			return nil
		}

		content := string(data)
		preview := content
		if len(preview) > 120 {
			preview = preview[:120] + "..."
		}
		preview = strings.TrimSpace(preview)

		snippets = append(snippets, Snippet{
			Name:     filepath.Base(path),
			SubPath:  subPath,
			Preview:  preview,
			IsImage:  false,
			FileSize: info.Size(),
		})
		return nil
	})
	if snippets == nil {
		snippets = []Snippet{}
	}
	return snippets
}

func (a *App) GetSnippetContent(name string) string {
	p := findSnippetPath(name)
	if p == "" {
		return ""
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return string(data)
}

func findSnippetPath(name string) string {
	home, _ := os.UserHomeDir()
	for _, base := range []string{
		filepath.Join(home, "Snippets"),
		filepath.Join(home, "Documents", "Snippets"),
	} {
		candidate := filepath.Join(base, name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		found := findFile(base, name)
		if found != "" {
			return found
		}
	}
	return ""
}

func (a *App) GetSnippetThumbnail(name string) string {
	p := findSnippetPath(name)
	if p == "" {
		return ""
	}

	info, err := os.Stat(p)
	if err != nil || info.Size() > 10*1024*1024 {
		return ""
	}

	mime := imageMime(strings.ToLower(filepath.Ext(p)))
	if mime == "" {
		return ""
	}

	data, err := os.ReadFile(p)
	if err != nil {
		return ""
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return "data:" + mime + ";base64," + encoded
}

func findFile(root, name string) string {
	var result string
	filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if d.Name() == name {
			result = path
			return fmt.Errorf("found")
		}
		return nil
	})
	return result
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
