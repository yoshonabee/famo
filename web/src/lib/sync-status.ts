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

let cloudStatus: SyncStatus = 'pending'
const cloudListeners = new Set<() => void>()

export function setCloudSyncStatus(status: SyncStatus) {
  if (cloudStatus === status) return
  cloudStatus = status
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
  const [desktopStatus, setDesktopStatus] = useState<SyncStatus>('disabled')
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
          void Call.ByName('famo/internal/desktop.SyncSettings.RuntimeStatus')
            .then((status) => {
              if (subscribed && generation === request)
                setDesktopStatus(status as SyncStatus)
            })
            .catch(() => {
              if (subscribed && generation === request)
                setDesktopStatus('error')
            })
        }
        unsubscribe = Events.On('famo:sync-status-changed', refresh)
        refresh()
      })
      .catch(() => {
        if (subscribed) setDesktopStatus('error')
      })
    return () => {
      subscribed = false
      unsubscribe?.()
    }
  }, [])
  return desktopStatus
}

export function useSyncStatus(): SyncStatus {
  const cloud = useSyncExternalStore(subscribeCloudStatus, () => cloudStatus)
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
  )
  const desktop = useDesktopSyncStatus()
  const status = isCloudWeb ? cloud : desktop
  if (!online && status !== 'disabled' && status !== 'conflict')
    return 'offline'
  return status
}

export async function requestDesktopSync() {
  const { Call } = await import('@wailsio/runtime')
  await Call.ByName('famo/internal/desktop.SyncSettings.RequestSync')
}
