import { Trigger as DialogTrigger } from '@radix-ui/react-dialog'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { readSyncSettings, saveSyncSettings } from '@/lib/desktop'
import { useLanguage } from '@/lib/i18n'

function SyncSetupGuide() {
  const { t } = useLanguage()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {t('syncSetupGuide')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle className="dialog-title">
          {t('syncSetupTitle')}
        </DialogTitle>
        <DialogDescription className="preferences-description">
          {t('syncSetupIntro')}
        </DialogDescription>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            {t('syncSetupWorker')}{' '}
            <a
              href="https://github.com/yoshonabee/famo/blob/main/docs/sync.md#cloudflare-設定與部署"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              {t('syncSetupDeploymentLink')}
            </a>
          </li>
          <li>{t('syncSetupEnter')}</li>
          <li>
            {t('syncSetupKeychain')}
            <ul className="mt-2 space-y-2">
              {['Client ID', 'Client Secret'].map((credential) => (
                <li key={credential}>
                  <code className="block break-all text-xs">
                    Famo Sync https://sync.example.com {credential}
                  </code>
                  {t('syncSetupKeychainItem', credential)}
                </li>
              ))}
            </ul>
          </li>
          <li>{t('syncSetupRestart')}</li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}

export function SyncPreferences() {
  const { t, errorText } = useLanguage()
  const settings = useQuery({
    queryKey: ['sync-settings'],
    queryFn: readSyncSettings,
  })
  const [draft, setDraft] = useState<{
    url: string
    account: string
    interval: string
  } | null>(null)
  const save = useMutation({
    mutationFn: saveSyncSettings,
    onSuccess: async () => {
      await settings.refetch()
      setDraft(null)
    },
  })
  const config = settings.data?.config
  const values = draft ?? {
    url: config?.url ?? '',
    account: config?.account ?? 'personal',
    interval: String(
      config?.interval_seconds || settings.data?.default_interval_seconds || '',
    ),
  }

  function edit(field: keyof typeof values, value: string) {
    setDraft({ ...values, [field]: value })
    if (save.isError || save.isSuccess) save.reset()
  }

  return (
    <section aria-labelledby="preferences-sync-heading">
      <h3 id="preferences-sync-heading">{t('syncSettings')}</h3>
      <div className="preferences-card">
        <p className="preferences-description">
          {t('syncSettingsDescription')}
        </p>
        {settings.data?.path && (
          <code className="max-w-full break-all text-xs text-muted-foreground">
            {settings.data.path}
          </code>
        )}
        {settings.isPending && <p role="status">{t('loading')}</p>}
        {settings.isError && (
          <p className="inline-edit-error" role="alert">
            {t('syncSettingsLoadFailed')} {errorText(settings.error)}
          </p>
        )}
        {settings.data && (
          <form
            className="grid w-full gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              save.mutate({
                url: values.url.trim(),
                account: values.account.trim(),
                interval_seconds: Number(values.interval),
              })
            }}
          >
            <fieldset className="grid gap-3" disabled={save.isPending}>
              <label className="field">
                <span>{t('syncURL')}</span>
                <input
                  type="url"
                  spellCheck={false}
                  placeholder="https://sync.example.com"
                  value={values.url}
                  onChange={(event) => edit('url', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>{t('syncAccount')}</span>
                <input
                  value={values.account}
                  spellCheck={false}
                  maxLength={128}
                  onChange={(event) => edit('account', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>{t('syncInterval')}</span>
                <input
                  type="number"
                  min={1}
                  max={3600}
                  step={1}
                  value={values.interval}
                  onChange={(event) => edit('interval', event.target.value)}
                  required
                />
              </label>
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={save.isPending || !draft}
              >
                {t('save')}
              </Button>
              <SyncSetupGuide />
            </div>
          </form>
        )}
        {!settings.data && <SyncSetupGuide />}
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {t('syncSettingsSaveFailed')} {errorText(save.error)}
          </p>
        )}
        {save.isSuccess && <p role="status">{t('syncSettingsSaved')}</p>}
      </div>
    </section>
  )
}
