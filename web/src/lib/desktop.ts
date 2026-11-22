const tasksChangedEvent = 'famo:tasks-changed'
let taskChannel: BroadcastChannel | undefined
let menuBarBoardUpdate = Promise.resolve()
let desktopLanguageUpdate = Promise.resolve()

// Load Wails only inside the macOS app; the browser build keeps using HTTP.
export async function initializeDesktop(onTasksChanged: () => void) {
  if (window.location.protocol !== 'wails:') {
    if ('BroadcastChannel' in window) {
      taskChannel = new BroadcastChannel(tasksChangedEvent)
      taskChannel.onmessage = onTasksChanged
    }
    return
  }
  const { Browser, Events } = await import('@wailsio/runtime')
  Events.On(tasksChangedEvent, onTasksChanged)
  let lastActivity = -Infinity
  const trackActivity = (event: Event) => {
    const now = performance.now()
    if (!event.isTrusted || now - lastActivity < 1000) return
    lastActivity = now
    void Events.Emit('famo:sync-activity').catch((error: unknown) =>
      console.error('無法通知桌面同步活動', error),
    )
  }
  for (const event of ['pointerdown', 'keydown', 'wheel']) {
    document.addEventListener(event, trackActivity, {
      capture: true,
      passive: true,
    })
  }
  Events.On(openSettingsEvent, () => {
    window.dispatchEvent(new Event(openSettingsEvent))
  })
  Events.On(openBoardEvent, ({ data }) => {
    window.dispatchEvent(new CustomEvent(openBoardEvent, { detail: data }))
  })
  Events.On(shortcutEvent, ({ data }) => {
    window.dispatchEvent(new CustomEvent(shortcutEvent, { detail: data }))
  })
  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor) return
      const url = new URL(anchor.href, window.location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      event.preventDefault()
      void Browser.OpenURL(url.href).catch((error: unknown) => {
        console.error('無法開啟連結', error)
      })
    },
    true,
  )
}
export const openSettingsEvent = 'famo:open-settings'
export const openBoardEvent = 'famo:open-board'
export const shortcutEvent = 'famo:shortcut'

// Publish only after a successful write. Each WebView owns a separate query
// cache, so invalidating the sender alone leaves other open windows stale.
export async function notifyTasksChanged() {
  try {
    if (window.location.protocol === 'wails:') {
      const { Events } = await import('@wailsio/runtime')
      await Events.Emit(tasksChangedEvent)
    } else {
      taskChannel?.postMessage(null)
    }
  } catch (error) {
    console.error('無法通知其他視窗更新任務', error)
  }
}

export function selectMenuBarBoard(id: string) {
  if (!isDesktop()) return
  // Keep native updates in the order the panel committed them.
  menuBarBoardUpdate = menuBarBoardUpdate
    .then(async () => {
      const { Call } = await import('@wailsio/runtime')
      await Call.ByName('famo/internal/desktop.MenuBar.SelectBoard', id)
    })
    .catch((error: unknown) => console.error('無法更新選單列的 Board', error))
}

export async function openFamo(boardId: string) {
  if (isDesktop()) {
    const { Call } = await import('@wailsio/runtime')
    await Call.ByName('famo/internal/desktop.MenuBar.OpenFamo', boardId)
    return
  }
  window.location.assign(`/?${new URLSearchParams({ board: boardId })}`)
}

export async function hideMenuBar() {
  if (window.location.protocol === 'wails:') {
    const { Window } = await import('@wailsio/runtime')
    await Window.Hide()
  }
}

export async function exportThemeFile(contents: string, filename: string) {
  if (window.location.protocol === 'wails:') {
    const { Call } = await import('@wailsio/runtime')
    return (await Call.ByName(
      'famo/internal/desktop.ThemeFiles.Export',
      contents,
      filename,
    )) as boolean
  }
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export type AgentToolsState = {
  api_url: string
  cli_installed: boolean
  cli_available: boolean
  cli_path: string
  cli_error?: string
  skill_command?: string
}

export const isDesktop = () => window.location.protocol === 'wails:'

export type SyncConfiguration = {
  url: string
  account: string
  interval_seconds?: number
}

export type SyncSettingsState = {
  path: string
  config: SyncConfiguration | null
  default_interval_seconds: number
}

export async function readSyncSettings() {
  const { Call } = await import('@wailsio/runtime')
  return (await Call.ByName(
    'famo/internal/desktop.SyncSettings.Status',
  )) as SyncSettingsState
}

export async function saveSyncSettings(config: SyncConfiguration) {
  const { Call } = await import('@wailsio/runtime')
  await Call.ByName('famo/internal/desktop.SyncSettings.Save', config)
}

export function setDesktopLanguage(locale: 'zh-TW' | 'en') {
  if (!isDesktop()) return
  desktopLanguageUpdate = desktopLanguageUpdate
    .then(async () => {
      const { Call } = await import('@wailsio/runtime')
      await Call.ByName('famo/internal/desktop.DisplayLanguage.Set', locale)
    })
    .catch((error: unknown) => {
      console.error('Could not set desktop language', error)
    })
}

export async function agentTool<T>(
  method:
    'Status' | 'SetAPIEnabled' | 'InstallCLI' | 'RemoveCLI' | 'ChooseWorkspace',
  ...args: unknown[]
): Promise<T> {
  const { Call } = await import('@wailsio/runtime')
  return (await Call.ByName(
    `famo/internal/desktop.AgentTools.${method}`,
    ...args,
  )) as T
}

export async function copyText(text: string) {
  if (isDesktop()) {
    const { Clipboard } = await import('@wailsio/runtime')
    await Clipboard.SetText(text)
  } else {
    await navigator.clipboard.writeText(text)
  }
}
