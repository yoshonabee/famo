import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { initializeDesktop } from './lib/desktop'
import './index.css'
void initializeDesktop().catch((error: unknown) => {
  console.error('無法載入桌面整合', error)
})
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
})
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
