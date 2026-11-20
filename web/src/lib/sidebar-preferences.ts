import { useEffect, useState } from 'react'

type Preferences = { showToday: boolean; order: string[] }
const storageKey = 'famo.sidebar'
const defaults: Preferences = { showToday: true, order: [] }

function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<Preferences> | null
    return {
      showToday: value?.showToday !== false,
      order: Array.isArray(value?.order)
        ? value.order.filter((id) => typeof id === 'string')
        : [],
    }
  } catch {
    return defaults
  }
}

export function useSidebarPreferences() {
  const [preferences, setPreferences] = useState(() => {
    try {
      return parsePreferences(localStorage.getItem(storageKey))
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey)
        setPreferences(parsePreferences(event.newValue))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function save(next: Preferences) {
    setPreferences(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Apply the preference for this session if persistent storage is unavailable.
    }
  }

  return { preferences, save }
}

export function orderSidebarItems(ids: string[], saved: string[]) {
  const remaining = new Set(ids)
  return [...saved.filter((id) => remaining.delete(id)), ...remaining]
}
