package main

import (
	"embed"
	"fmt"
	"net"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

const socketPath = "/tmp/ghostclip.sock"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--toggle" {
		sendToggle()
		return
	}

	if !acquireLock() {
		fmt.Println("GhostClip is already running. Use --toggle to show/hide.")
		os.Exit(1)
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "GhostClip",
		Width:  360,
		Height: 580,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 30, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Frameless:        true,
		AlwaysOnTop:      true,
		StartHidden:      true,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func acquireLock() bool {
	os.RemoveAll(socketPath)
	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		return false
	}
	listener = ln
	return true
}

func sendToggle() {
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		fmt.Println("GhostClip is not running.")
		os.Exit(1)
	}
	defer conn.Close()
	conn.Write([]byte("toggle"))
	fmt.Println("Toggle signal sent.")
}
