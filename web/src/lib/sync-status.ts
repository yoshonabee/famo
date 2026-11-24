import { useEffect, useState, useSyncExternalStore } from 'react'
import { isDesktop } from './desktop'
import { isCloudWeb } from './environment'

export type SyncStatus =
  | 'disabled'
  | 'pending'
  | 'syncing'
  | 'offline'
  | 'synced'
  | 'error'
  | 'conflict'

type SyncDetails = {
  status: SyncStatus
  last_successful_at: string | null
  unsynced_count: number
}

const disabled: SyncDetails = {
  status: 'disabled',
  last_successful_at: null,
  unsynced_count: 0,
}

let cloudDetails: SyncDetails = { ...disabled, status: 'pending' }
const cloudListeners = new Set<() => void>()

export function setCloudSyncStatus(status: SyncStatus, unsyncedCount: number) {
  if (
    cloudDetails.status === status &&
    cloudDetails.unsynced_count === unsyncedCount
  )
    return
  cloudDetails = {
    status,
    last_successful_at:
      status === 'synced' && cloudDetails.status !== 'synced'
        ? new Date().toISOString()
        : cloudDetails.last_successful_at,
    unsynced_count: unsyncedCount,
  }
  for (const listener of cloudListeners) listener()
}

function subscribeCloudStatus(listener: () => void) {
  cloudListeners.add(listener)
  return () => cloudListeners.delete(listener)
}

function subscribeConnection(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

function useDesktopSyncStatus() {
  const [desktop, setDesktop] = useState(disabled)
  useEffect(() => {
    if (!isDesktop()) return
    let subscribed = true
    let unsubscribe: (() => void) | undefined
    let request = 0
    void import('@wailsio/runtime')
      .then(({ Call, Events }) => {
        if (!subscribed) return
        const refresh = () => {
          const generation = ++request
          void Call.ByName('famo/internal/desktop.SyncSettings.RuntimeDetails')
            .then((status) => {
              if (subscribed && generation === request)
                setDesktop(status as SyncDetails)
            })
            .catch(() => {
              if (subscribed && generation === request)
                setDesktop((details) => ({ ...details, status: 'error' }))
            })
        }
        unsubscribe = Events.On('famo:sync-status-changed', refresh)
        refresh()
      })
      .catch(() => {
        if (subscribed)
          setDesktop((details) => ({ ...details, status: 'error' }))
      })
    return () => {
      subscribed = false
      unsubscribe?.()
    }
  }, [])
  return desktop
}

export function useSyncStatus(): SyncDetails {
  const cloud = useSyncExternalStore(subscribeCloudStatus, () => cloudDetails)
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
  )
  const desktop = useDesktopSyncStatus()
  const details = isCloudWeb ? cloud : desktop
  const status =
    !online && details.status !== 'disabled' && details.status !== 'conflict'
      ? 'offline'
      : details.status
  const busy = status === 'pending' || status === 'syncing'
  const grace = busy && Boolean(details.last_successful_at)
  const [graceElapsed, setGraceElapsed] = useState(false)

  useEffect(() => {
    if (!grace) return
    const timer = window.setTimeout(() => setGraceElapsed(true), 3000)
    return () => {
      clearTimeout(timer)
      setGraceElapsed(false)
    }
  }, [grace])

  return {
    ...details,
    status: busy ? (grace && !graceElapsed ? 'synced' : 'syncing') : status,
  }
}

export async function requestDesktopSync() {
  const { Call } = await import('@wailsio/runtime')
  await Call.ByName('famo/internal/desktop.SyncSettings.RequestSync')
}
