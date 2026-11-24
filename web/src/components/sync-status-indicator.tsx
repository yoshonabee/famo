import { useId, useState } from 'react'
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

function LastSynced({
  timestamp,
  openedAt,
}: {
  timestamp: string
  openedAt: number
}) {
  const { locale, t } = useLanguage()
  const seconds = Math.floor((openedAt - Date.parse(timestamp)) / 1000)
  const format = new Intl.RelativeTimeFormat(locale)
  let ago = t('syncJustNow')
  if (seconds >= 86_400)
    ago = format.format(-Math.floor(seconds / 86_400), 'day')
  else if (seconds >= 3600)
    ago = format.format(-Math.floor(seconds / 3600), 'hour')
  else if (seconds >= 60)
    ago = format.format(-Math.floor(seconds / 60), 'minute')
  else if (seconds >= 5)
    ago =
      locale === 'zh-TW' ? `${seconds} 秒前` : format.format(-seconds, 'second')

  return <time dateTime={timestamp}>{t('syncLastSuccessfulAt', ago)}</time>
}

export function SyncStatusIndicator() {
  const { t } = useLanguage()
  const client = useQueryClient()
  const descriptionId = useId()
  const detailsId = useId()
  const [preview, setPreview] = useState<{
    openedAt: number
    timestamp: string | null
  } | null>(null)
  const { status, last_successful_at, unsynced_count } = useSyncStatus()
  if (status === 'disabled') return null

  const label = t(labels[status])
  function showDetails() {
    const openedAt = Date.now()
    setPreview(
      (current) => current ?? { openedAt, timestamp: last_successful_at },
    )
  }

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
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setPreview(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && preview) {
          event.stopPropagation()
          setPreview(null)
        }
      }}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={t('syncNow')}
        aria-describedby={preview ? detailsId : descriptionId}
        data-sync-status={status}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') showDetails()
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== 'touch') return
          if (preview) setPreview(null)
          else showDetails()
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) showDetails()
        }}
        onBlur={() => setPreview(null)}
        onClick={refresh}
      >
        <span
          className={`size-2 rounded-full ${colors[status]}`}
          aria-hidden="true"
        />
      </Button>
      {preview && (
        <div className="sync-status-details" id={detailsId} role="tooltip">
          <div>{label}</div>
          <div>
            {preview.timestamp ? (
              <LastSynced
                timestamp={preview.timestamp}
                openedAt={preview.openedAt}
              />
            ) : (
              t('syncNotYetSuccessful')
            )}
          </div>
          <div>{t('syncUnsyncedCount', unsynced_count)}</div>
        </div>
      )}
      <span id={descriptionId} role="status" className="sr-only">
        {label}
      </span>
    </div>
  )
}
