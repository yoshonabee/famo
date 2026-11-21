import { Trigger as DialogTrigger } from '@radix-ui/react-dialog'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { request } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

export function DataCleanupPreferences() {
  const { t, errorText } = useLanguage()
  const [open, setOpen] = useState(false)
  const cleanup = useMutation({
    mutationFn: () =>
      request<{ deleted_count: number }>('/tasks/recently-deleted/cleanup', {
        confirm: true,
      }),
    onSuccess: () => setOpen(false),
  })

  return (
    <div className="preferences-card">
      <h4>{t('purgeDeletedTasks')}</h4>
      <p id="data-cleanup-description" className="preferences-description">
        {t('purgeDescription')}
      </p>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (cleanup.isPending) return
          if (nextOpen) cleanup.reset()
          setOpen(nextOpen)
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            aria-describedby="data-cleanup-description"
          >
            {t('purgeData')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogTitle className="dialog-title">{t('purgeData')}</DialogTitle>
          <DialogDescription className="preferences-description">
            {t('confirmPurgeDescription')}
          </DialogDescription>
          {cleanup.isError && (
            <p className="inline-edit-error mt-3" role="alert">
              {errorText(cleanup.error)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cleanup.isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={cleanup.isPending}
              onClick={() => cleanup.mutate()}
            >
              {cleanup.isPending ? t('purging') : t('purgePermanently')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {cleanup.data && (
        <p role="status" className="text-sm text-muted-foreground">
          {cleanup.data.deleted_count === 0
            ? t('nothingToPurge')
            : t('purgedTasks', cleanup.data.deleted_count)}
        </p>
      )}
    </div>
  )
}
