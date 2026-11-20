const tasksChangedEvent = 'famo:tasks-changed'
let taskChannel: BroadcastChannel | undefined

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
  Events.On(openSettingsEvent, () => {
    window.dispatchEvent(new Event(openSettingsEvent))
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

export async function openFamo() {
  if (window.location.protocol === 'wails:') {
    const { Call } = await import('@wailsio/runtime')
    await Call.ByName('famo/internal/desktop.MenuBar.OpenFamo')
    return
  }
  window.location.assign('/')
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
