package main

import (
	_ "embed"
	"os"

	"fyne.io/systray"
)

//go:embed build/appicon.png
var iconData []byte

func (a *App) startTray() {
	systray.Run(func() {
		systray.SetTitle("\U0001F4CB")
		systray.SetTooltip("GhostClip - Clipboard Manager")

		mShow := systray.AddMenuItem("Show Clipboard", "Toggle clipboard window")
		systray.AddSeparator()
		mClear := systray.AddMenuItem("Clear History", "Clear all clipboard entries")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Quit", "Exit GhostClip")

		go func() {
			for {
				select {
				case <-mShow.ClickedCh:
					a.toggleWindow()
				case <-mClear.ClickedCh:
					a.ClearHistory()
				case <-mQuit.ClickedCh:
					systray.Quit()
				}
			}
		}()
	}, func() {
		if listener != nil {
			listener.Close()
		}
		os.RemoveAll(socketPath)
		os.Exit(0)
	})
}
