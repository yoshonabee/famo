import { useIsMutating } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCloudVersion } from '@/lib/cloud-version'
import { useLanguage } from '@/lib/i18n'

export function CloudReloadNotice() {
  const mode = useCloudVersion()
  const { t } = useLanguage()
  const saving = useIsMutating() > 0
  if (!mode) return null

  const reload = (
    <Button
      disabled={saving && mode === 'available'}
      onClick={() => location.reload()}
    >
      {t('reloadWeb')}
    </Button>
  )
  if (mode === 'required')
    return (
      <Dialog open>
        <DialogContent
          className="max-w-md space-y-3"
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle className="font-semibold">
            {t('reloadWebRequired')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('reloadWebRequiredDescription')}
          </DialogDescription>
          <div className="flex justify-end">{reload}</div>
        </DialogContent>
      </Dialog>
    )

  return (
    <div className="fixed inset-x-3 top-3 z-30 mx-auto flex w-fit items-center gap-3 rounded-xl border border-input bg-background p-2 pl-3 text-sm shadow-lg">
      <span role="status">{t('reloadWebAvailable')}</span>
      {reload}
    </div>
  )
}
