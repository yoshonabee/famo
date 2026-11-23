import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  loginItemRefreshEvent,
  openLoginItemSettings,
  readLoginItemStatus,
  setLoginItemEnabled,
} from '@/lib/desktop'
import { useLanguage } from '@/lib/i18n'

export function LoginItemPreferences() {
  const { t } = useLanguage()
  const status = useQuery({
    queryKey: ['login-item-status'],
    queryFn: readLoginItemStatus,
    staleTime: 0,
  })
  const { refetch } = status
  useEffect(() => {
    const refresh = () => void refetch()
    window.addEventListener(loginItemRefreshEvent, refresh)
    return () => window.removeEventListener(loginItemRefreshEvent, refresh)
  }, [refetch])

  const save = useMutation({
    mutationFn: setLoginItemEnabled,
    onSettled: async () => {
      await refetch()
    },
  })
  const open = useMutation({ mutationFn: openLoginItemSettings })
  const requiresApproval = status.data === 'requiresApproval'
  const unavailable = status.data === 'unavailable'

  return (
    <section aria-labelledby="preferences-startup-heading">
      <h3 id="preferences-startup-heading">{t('loginItemStartup')}</h3>
      <div className="preferences-card">
        <label className="preferences-checkbox">
          <Checkbox
            checked={status.data === 'on' || requiresApproval}
            disabled={
              !status.data || unavailable || status.isError || save.isPending
            }
            aria-describedby={
              requiresApproval ? 'login-item-approval' : undefined
            }
            onCheckedChange={(checked) => {
              open.reset()
              save.mutate(checked === true)
            }}
          />
          <span>{t('loginItemAtLogin')}</span>
        </label>
        {status.isPending && <p role="status">{t('loading')}</p>}
        {unavailable && (
          <p className="preferences-description">{t('loginItemUnavailable')}</p>
        )}
        {requiresApproval && (
          <>
            <p
              id="login-item-approval"
              className="preferences-description"
              role="status"
            >
              {t('loginItemApproval')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={open.isPending}
              onClick={() => open.mutate()}
            >
              {t('loginItemOpenSettings')}
            </Button>
          </>
        )}
        {status.isError && (
          <p className="inline-edit-error" role="alert">
            {t('loginItemLoadFailed')}
          </p>
        )}
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {t('loginItemSaveFailed')}
          </p>
        )}
        {open.isError && requiresApproval && (
          <p className="inline-edit-error" role="alert">
            {t('loginItemOpenFailed')}
          </p>
        )}
      </div>
    </section>
  )
}
