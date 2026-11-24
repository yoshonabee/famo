import { useSyncExternalStore } from 'react'

export const webProtocol = 1

type ReloadMode = 'available' | 'required' | undefined

const loadedBuild = document.querySelector<HTMLMetaElement>(
  'meta[name="famo-web-build"]',
)?.content
let reloadMode: ReloadMode
const listeners = new Set<() => void>()

export function observeCloudVersion(headers: Headers) {
  const minimum = Number(headers.get('X-Famo-Web-Min-Protocol'))
  const latest = headers.get('X-Famo-Web-Build')
  const next =
    minimum > webProtocol
      ? 'required'
      : latest && loadedBuild && latest !== loadedBuild
        ? 'available'
        : undefined

  if (!next || reloadMode === 'required' || reloadMode === next) return
  reloadMode = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCloudVersion() {
  return useSyncExternalStore(subscribe, () => reloadMode)
}
