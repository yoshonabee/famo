import { useEffect, useRef, useState } from 'react'

export const footerNavigation = ['active', 'completed'] as const
export type FooterNavItem = (typeof footerNavigation)[number]

type Preferences = {
  showToday: boolean
  order: string[]
  footerItems: FooterNavItem[]
  width?: number
}
const storageKey = 'famo.sidebar'
const defaults: Preferences = { showToday: true, order: [], footerItems: [] }

export const sidebarMinWidth = 144
export const sidebarMaxWidth = 360

export function clampSidebarWidth(width: number) {
  return Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, Math.round(width)))
}

function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<Preferences> | null
    return {
      showToday: value?.showToday !== false,
      order: Array.isArray(value?.order)
        ? value.order.filter((id) => typeof id === 'string')
        : [],
      footerItems: Array.isArray(value?.footerItems)
        ? footerNavigation.filter((id) => value.footerItems?.includes(id))
        : [],
      width:
        typeof value?.width === 'number' && Number.isFinite(value.width)
          ? clampSidebarWidth(value.width)
          : undefined,
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
  const saved = useRef(preferences)

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorage ||
        (event.key !== storageKey && event.key !== null)
      )
        return
      const next = parsePreferences(event.newValue)
      saved.current = next
      setPreferences(next)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function save(changes: Partial<Preferences>) {
    const next = { ...saved.current, ...changes }
    saved.current = next
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
