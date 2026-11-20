import React, { type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from './lib/i18n'
import { initializeDesktop } from './lib/desktop'
import { initializeTheme } from './lib/theme'
import './index.css'

export function renderApp(content: ReactNode, { panel = false } = {}) {
  initializeTheme()
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
  })
  void initializeDesktop(() => {
    void client.invalidateQueries({ queryKey: ['tasks'] })
  }).catch((error: unknown) => {
    console.error('無法載入桌面整合', error)
  })
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LanguageProvider panel={panel}>
        <QueryClientProvider client={client}>{content}</QueryClientProvider>
      </LanguageProvider>
    </React.StrictMode>,
  )
}
