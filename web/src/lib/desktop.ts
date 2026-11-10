// Load Wails only inside the macOS app; the browser build keeps using HTTP.
export async function initializeDesktop() {
  if (window.location.protocol !== 'wails:') return
  const { Browser, Events } = await import('@wailsio/runtime')
  Events.On(openSettingsEvent, () => {
    window.dispatchEvent(new Event(openSettingsEvent))
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
