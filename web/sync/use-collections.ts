import { useCallback, useRef, useState } from 'react'
import {
  type CollectionOperation,
  type Collections,
  pullCollections,
  pushCollections,
} from './collections-client'
import { SyncError } from './sync-client'

const storageKey = 'famo.sync.collections.pending.v1'

function readPending(): CollectionOperation | null {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
  } catch {
    return null
  }
}

export function useCollections() {
  const [snapshot, setSnapshot] = useState<Collections | null>(null)
  const [pending, setPending] = useState(readPending)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [writeError, setWriteError] = useState('')
  const activePush = useRef(false)

  const apply = useCallback((next: Collections) => {
    setSnapshot((current) =>
      !current || next.version > current.version ? next : current,
    )
  }, [])

  const refresh = useCallback(async () => {
    try {
      const next = await pullCollections()
      if (next) apply(next)
      setLoadError('')
    } catch {
      setLoadError('目前無法同步 Project 與 Board。')
    }
  }, [apply])

  function remember(operation: CollectionOperation | null) {
    setPending(operation)
    try {
      if (operation)
        sessionStorage.setItem(storageKey, JSON.stringify(operation))
      else sessionStorage.removeItem(storageKey)
    } catch {
      // The operation remains available in the current page.
    }
  }

  async function save(operation: CollectionOperation) {
    if (activePush.current) return
    activePush.current = true
    remember(operation)
    setSaving(true)
    setWriteError('')
    try {
      const result = await pushCollections(operation)
      apply(result.current)
      remember(null)
      if (result.kind === 'saved') return result
      setWriteError(
        'Project 或 Board 已在其他裝置更新，請確認最新內容後再儲存。',
      )
      return result
    } catch (error) {
      if (
        error instanceof SyncError &&
        [400, 413, 415, 422].includes(error.status)
      ) {
        remember(null)
        setWriteError('無法儲存 Project 或 Board，請確認名稱與設定。')
      } else {
        setWriteError('目前無法儲存 Project 或 Board，請重試。')
      }
    } finally {
      activePush.current = false
      setSaving(false)
    }
  }

  return { snapshot, pending, saving, loadError, writeError, refresh, save }
}
