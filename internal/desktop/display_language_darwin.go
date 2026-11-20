//go:build darwin && !ios

package desktop

import (
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// DisplayLanguage applies the interface preference from Famo's main WebView
// to the native menus, tray, and dialogs.
type DisplayLanguage struct {
	english atomic.Bool
	labels  []func()
}

func (l *DisplayLanguage) Set(locale string) {
	if locale != "zh-TW" && locale != "en" {
		return
	}
	application.InvokeSync(func() {
		if english := locale == "en"; l.english.Swap(english) != english {
			for _, update := range l.labels {
				update()
			}
		}
	})
}

func (l *DisplayLanguage) text(chinese, english string) string {
	if l != nil && l.english.Load() {
		return english
	}
	return chinese
}

func (l *DisplayLanguage) trackLabel(update func(string), chinese, english string) {
	l.labels = append(l.labels, func() { update(l.text(chinese, english)) })
}

func (l *DisplayLanguage) addItem(menu *application.Menu, chinese, english string) *application.MenuItem {
	item := menu.Add(l.text(chinese, english))
	l.trackLabel(func(label string) { item.SetLabel(label) }, chinese, english)
	return item
}

func (l *DisplayLanguage) addSubmenu(menu *application.Menu, chinese, english string) *application.Menu {
	label := l.text(chinese, english)
	submenu := menu.AddSubmenu(label)
	item := menu.FindByLabel(label)
	l.trackLabel(func(label string) { item.SetLabel(label) }, chinese, english)
	return submenu
}
