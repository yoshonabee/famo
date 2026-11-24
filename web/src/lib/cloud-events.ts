import { useSyncExternalStore } from 'react'
import { useCloudVersion, webProtocol } from './cloud-version'
import { appRefetchInterval } from './environment'

let connected = false
const listeners = new Set<() => void>()

function setConnected(value: boolean) {
  if (connected === value) return
  connected = value
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncRefetchInterval() {
  const mode = useCloudVersion()
  const available = useSyncExternalStore(subscribe, () => connected)
  if (mode === 'required') return false
  return available ? 15 * 60_000 : appRefetchInterval
}

export function startCloudEvents(refresh: (taskSequence?: number) => void) {
  let socket: WebSocket | undefined
  let retry: number | undefined
  let heartbeat: number | undefined
  let failures = 0

  function close() {
    clearTimeout(retry)
    clearInterval(heartbeat)
    const previous = socket
    socket = undefined
    previous?.close()
    setConnected(false)
  }

  function connect() {
    if (socket || document.hidden || !navigator.onLine) return
    clearTimeout(retry)
    const url = new URL('/api/sync/events', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('protocol', String(webProtocol))
    const current = new WebSocket(url)
    socket = current
    let lastPong = performance.now()

    current.addEventListener('open', () => {
      if (socket !== current) return
      failures = 0
      lastPong = performance.now()
      setConnected(true)
      refresh()
      heartbeat = window.setInterval(() => {
        if (current.readyState !== WebSocket.OPEN) return
        if (performance.now() - lastPong > 70_000) current.close()
        else current.send('ping')
      }, 30_000)
    })

    current.addEventListener('message', ({ data }) => {
      if (socket !== current) return
      if (data === 'pong') lastPong = performance.now()
      else if (typeof data === 'string') {
        try {
          const event = JSON.parse(data)
          if (event?.type === 'tasks')
            refresh(
              Number.isSafeInteger(event.sequence) ? event.sequence : undefined,
            )
          else if (event?.type === 'collections') refresh()
        } catch {
          // HTTP catch-up still runs if a notification is unreadable.
        }
      }
    })

    current.addEventListener('close', () => {
      if (socket !== current) return
      close()
      const delay = 1000 * 2 ** Math.min(failures++, 6)
      retry = window.setTimeout(connect, delay * (0.75 + Math.random() / 2))
    })
  }

  function visibilityChanged() {
    if (document.hidden || !navigator.onLine) close()
    else connect()
  }

  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('online', visibilityChanged)
  window.addEventListener('offline', visibilityChanged)
  retry = window.setTimeout(connect, 0)
  return () => {
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('online', visibilityChanged)
    window.removeEventListener('offline', visibilityChanged)
    close()
  }
}
