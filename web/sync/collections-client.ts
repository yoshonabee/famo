import { request, SyncError } from './sync-client'

export type Project = {
  id: string
  name: string
  color: string
  position: number | null
}

export const boardIcons = {
  'layout-grid': '格狀',
  briefcase: '公事包',
  house: '住家',
  code: '程式碼',
  'shopping-cart': '購物車',
  music: '音樂',
  'book-open': '書本',
  heart: '愛心',
  dumbbell: '啞鈴',
  target: '目標',
  'calendar-days': '行事曆',
  star: '星星',
}

export type Board = {
  id: string
  name: string
  icon: keyof typeof boardIcons
  project_ids: string[]
}

export type Collections = {
  version: number
  projects: Project[]
  boards: Board[]
}

export type CollectionOperation = Omit<Collections, 'version'> & {
  base_version: number
  operation_id: string
}

export async function pullCollections(): Promise<Collections | null> {
  const response = await request('collections')
  if (response.status === 404) return null
  if (!response.ok) throw new SyncError(response.status)
  return response.json()
}

export async function pushCollections(operation: CollectionOperation) {
  const response = await request('collections', operation)
  if (response.status === 409) {
    const { current }: { current: Collections } = await response.json()
    return { kind: 'conflict', current } as const
  }
  if (!response.ok) throw new SyncError(response.status)
  return {
    kind: 'saved',
    current: (await response.json()) as Collections,
  } as const
}
