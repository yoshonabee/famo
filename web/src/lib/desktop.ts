// Load Wails only inside the macOS app; the browser build keeps using HTTP.
export async function initializeDesktop() {
  if (window.location.protocol !== 'wails:') return
  const { Browser } = await import('@wailsio/runtime')
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
