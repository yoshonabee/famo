import { useId } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { isDesktop } from '@/lib/desktop'
import { useLanguage } from '@/lib/i18n'
import { requestDesktopSync, useSyncStatus } from '@/lib/sync-status'

const labels = {
  pending: 'syncStatusPending',
  syncing: 'syncStatusSyncing',
  offline: 'syncStatusOffline',
  synced: 'syncStatusSynced',
  error: 'syncStatusError',
  conflict: 'syncStatusConflict',
} as const

const colors = {
  pending: 'bg-amber-500',
  syncing: 'bg-amber-500',
  offline: 'bg-amber-500',
  synced: 'bg-emerald-500',
  error: 'bg-red-500',
  conflict: 'bg-red-500',
} as const

export function SyncStatusIndicator() {
  const { t } = useLanguage()
  const client = useQueryClient()
  const descriptionId = useId()
  const status = useSyncStatus()
  if (status === 'disabled') return null

  const label = t(labels[status])
  function refresh() {
    if (isDesktop()) {
      void requestDesktopSync().catch((error: unknown) => {
        console.error('Could not request desktop sync', error)
      })
      return
    }
    void client.invalidateQueries({
      predicate: ({ queryKey: [key] }) =>
        key === 'tasks' || key === 'projects' || key === 'boards',
    })
  }

  return (
    <span className="sync-status-indicator">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="whitespace-nowrap text-xs text-muted-foreground"
        aria-label={t('syncNow')}
        aria-describedby={descriptionId}
        title={label}
        data-sync-status={status}
        onClick={refresh}
      >
        <span
          className={`size-2 rounded-full ${colors[status]}`}
          aria-hidden="true"
        />
        <span aria-hidden="true">{label}</span>
      </Button>
      <span id={descriptionId} role="status" className="sr-only">
        {label}
      </span>
    </span>
  )
}
