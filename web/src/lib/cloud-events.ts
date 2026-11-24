import { useSyncExternalStore } from 'react'
import { useCloudVersion, webProtocol } from './cloud-version'
import { appRefetchInterval } from './environment'

let connected = false
let initialReadStarted = false
let initialSubscription: Promise<void> | undefined
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

export async function waitForInitialSubscription() {
  if (
    !initialReadStarted &&
    !connected &&
    !document.hidden &&
    navigator.onLine
  ) {
    // Subscribe before reading when possible, without blocking HTTP fallback.
    initialSubscription ??= new Promise((resolve) => {
      const unsubscribe = subscribe(() => {
        if (connected) finish()
      })
      const timer = window.setTimeout(finish, 500)
      function finish() {
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
    })
    await initialSubscription
  }
  initialReadStarted = true
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
  let pongTimeout: number | undefined
  let awaitingResume = false
  let failures = 0

  function stopHeartbeat() {
    clearInterval(heartbeat)
    clearTimeout(pongTimeout)
    pongTimeout = undefined
  }

  function close() {
    clearTimeout(retry)
    stopHeartbeat()
    const previous = socket
    socket = undefined
    previous?.close()
    setConnected(false)
  }

  function disconnected(current: WebSocket) {
    if (socket !== current) return
    close()
    if (document.hidden || !navigator.onLine) return
    const delay = 1000 * 2 ** Math.min(failures++, 6)
    retry = window.setTimeout(connect, delay * (0.75 + Math.random() / 2))
  }

  function ping(current: WebSocket, timeout: number) {
    if (
      document.hidden ||
      current.readyState !== WebSocket.OPEN ||
      pongTimeout !== undefined
    )
      return
    current.send('ping')
    pongTimeout = window.setTimeout(() => disconnected(current), timeout)
  }

  function startHeartbeat(current: WebSocket) {
    heartbeat = window.setInterval(() => ping(current, 40_000), 30_000)
  }

  function connect() {
    if (socket || document.hidden || !navigator.onLine) return
    clearTimeout(retry)
    const url = new URL('/api/sync/events', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('protocol', String(webProtocol))
    const current = new WebSocket(url)
    socket = current

    current.addEventListener('open', () => {
      if (socket !== current) return
      failures = 0
      setConnected(true)
      if (document.hidden) return
      awaitingResume = false
      if (initialReadStarted) refresh()
      startHeartbeat(current)
    })

    current.addEventListener('message', ({ data }) => {
      if (socket !== current || document.hidden) return
      if (data === 'pong') {
        clearTimeout(pongTimeout)
        pongTimeout = undefined
        if (awaitingResume) {
          awaitingResume = false
          refresh()
        }
      } else if (
        initialReadStarted &&
        !awaitingResume &&
        typeof data === 'string'
      ) {
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

    current.addEventListener('close', () => disconnected(current))
  }

  function visibilityChanged() {
    if (document.hidden) {
      stopHeartbeat()
    } else if (socket?.readyState === WebSocket.OPEN) {
      stopHeartbeat()
      awaitingResume = true
      ping(socket, 5000)
      startHeartbeat(socket)
    } else {
      connect()
    }
  }

  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('online', connect)
  window.addEventListener('offline', close)
  retry = window.setTimeout(connect, 0)
  return () => {
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('online', connect)
    window.removeEventListener('offline', close)
    close()
  }
}
