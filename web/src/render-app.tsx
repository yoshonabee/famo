import React, { useEffect, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query'
import { CloudReloadNotice } from './components/cloud-reload-notice'
import { startCloudEvents } from './lib/cloud-events'
import { useCloudVersion } from './lib/cloud-version'
import { LanguageProvider } from './lib/i18n'
import { initializeDesktop } from './lib/desktop'
import { isCloudWeb, mobileCloudQuery } from './lib/environment'
import { initializeTheme } from './lib/theme'
import './index.css'
import './mobile.css'

function CloudSync() {
  const client = useQueryClient()
  const blocked = useCloudVersion() === 'required'
  useEffect(() => {
    if (blocked) return
    let active = true
    let refreshing = false
    let requested = false
    async function refresh() {
      requested = true
      if (refreshing) return
      refreshing = true
      while (active && requested) {
        requested = false
        // Wait for an in-flight read before pulling again so it cannot absorb
        // a notification for a commit that happened after that read began.
        const { waitForCloudReads } = await import('./lib/cloud-api')
        await waitForCloudReads()
        if (active && !document.hidden) {
          await client.invalidateQueries({
            predicate: ({ queryKey: [key] }) =>
              key === 'tasks' || key === 'projects' || key === 'boards',
          })
        }
      }
      refreshing = false
    }
    async function handleEvent(taskSequence?: number) {
      if (taskSequence !== undefined) {
        const { isAcknowledgedTaskWrite } = await import('./lib/cloud-api')
        if (await isAcknowledgedTaskWrite(taskSequence)) return
      }
      if (active) await refresh()
    }
    const stop = startCloudEvents((sequence) => void handleEvent(sequence))
    return () => {
      active = false
      stop()
    }
  }, [blocked, client])
  return <CloudReloadNotice />
}

export function renderApp(content: ReactNode, { panel = false } = {}) {
  initializeTheme(isCloudWeb && matchMedia(mobileCloudQuery).matches)
  const client = new QueryClient({
    defaultOptions: {
      mutations: { networkMode: isCloudWeb ? 'always' : 'online' },
      queries: {
        staleTime: 10_000,
        retry: 1,
        // Cloud sync coordinates catch-up with the WebSocket connection.
        refetchOnWindowFocus: !isCloudWeb,
        refetchOnReconnect: !isCloudWeb,
      },
    },
  })
  void initializeDesktop(() => {
    void client.invalidateQueries({
      predicate: ({ queryKey: [key] }) =>
        key === 'tasks' || key === 'projects' || key === 'boards',
    })
  }).catch((error: unknown) => {
    console.error('無法載入桌面整合', error)
  })
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LanguageProvider panel={panel}>
        <QueryClientProvider client={client}>
          {content}
          {isCloudWeb && <CloudSync />}
        </QueryClientProvider>
      </LanguageProvider>
    </React.StrictMode>,
  )
}
