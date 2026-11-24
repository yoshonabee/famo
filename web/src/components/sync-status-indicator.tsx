import { useId, useState } from 'react'
import { Info } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { isDesktop } from '@/lib/desktop'
import { useLanguage } from '@/lib/i18n'
import { requestDesktopSync, useSyncStatus } from '@/lib/sync-status'

const labels = {
  pending: 'syncStatusSyncing',
  syncing: 'syncStatusSyncing',
  offline: 'syncStatusOffline',
  synced: 'syncStatusSynced',
  error: 'syncStatusError',
  conflict: 'syncStatusConflict',
} as const

const colors = {
  pending: 'bg-amber-500',
  syncing: 'bg-amber-500',
  offline: 'bg-slate-500',
  synced: 'bg-emerald-500',
  error: 'bg-red-500',
  conflict: 'bg-red-500',
} as const

export function SyncStatusIndicator() {
  const { locale, t } = useLanguage()
  const client = useQueryClient()
  const descriptionId = useId()
  const detailsId = useId()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const { status, last_successful_at, unsynced_count } = useSyncStatus()
  if (status === 'disabled') return null

  const label = t(labels[status])
  const lastSuccessful = last_successful_at
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(last_successful_at))
    : undefined
  const showDetails = detailsOpen || preview
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
    <div
      className="sync-status-indicator"
      onPointerLeave={() => setPreview(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPreview(false)
          setDetailsOpen(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showDetails) {
          event.stopPropagation()
          setPreview(false)
          setDetailsOpen(false)
        }
      }}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="sync-status-action whitespace-nowrap text-xs text-muted-foreground"
        aria-label={t('syncNow')}
        aria-describedby={descriptionId}
        data-sync-status={status}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') setPreview(true)
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setPreview(true)
        }}
        onClick={refresh}
      >
        <span
          className={`size-2 rounded-full ${colors[status]}`}
          aria-hidden="true"
        />
        <span aria-hidden="true">{label}</span>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-muted-foreground"
        aria-label={t('syncDetails')}
        aria-controls={detailsId}
        aria-expanded={showDetails}
        onClick={() => {
          setDetailsOpen(!showDetails)
          setPreview(false)
        }}
      >
        <Info className="size-4" aria-hidden="true" />
      </Button>
      <div className="sync-status-details" id={detailsId} hidden={!showDetails}>
        <div>
          {lastSuccessful
            ? t('syncLastSuccessfulAt', lastSuccessful)
            : t('syncNotYetSuccessful')}
        </div>
        <div>{t('syncUnsyncedCount', unsynced_count)}</div>
      </div>
      <span id={descriptionId} role="status" className="sr-only">
        {label}
      </span>
    </div>
  )
}
