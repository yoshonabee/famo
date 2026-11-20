import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { driveBackupCall } from '@/lib/desktop'

type BackupResult = { name: string; url: string }

export function DriveBackupPreferences({ active }: { active: boolean }) {
  const queryClient = useQueryClient()
  const pending = useRef<AbortController | null>(null)
  const connection = useQuery({
    queryKey: ['drive-backup-connected'],
    queryFn: () => driveBackupCall<boolean>('Connected'),
    enabled: active,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const operation = useMutation({
    mutationFn: async (method: 'Connect' | 'Disconnect' | 'Backup') => {
      const controller = new AbortController()
      pending.current = controller
      try {
        if (method === 'Backup')
          return await driveBackupCall<BackupResult>(method, controller.signal)
        await driveBackupCall<void>(method, controller.signal)
        return null
      } catch (error) {
        if (controller.signal.aborted) return null
        throw error
      } finally {
        pending.current = null
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['drive-backup-connected'] }),
  })
  const connected = connection.data === true
  const busy = operation.isPending
  return (
    <section
      className="backup-preferences"
      aria-labelledby="drive-backup-heading"
    >
      <h2 id="drive-backup-heading">Google Drive 備份</h2>
      <p className="preferences-description">
        將包含任務與本機資料庫設定的快照存到「我的雲端硬碟」。
      </p>
      {!connected && (
        <p className="preferences-description">
          首次使用請在 Google Cloud 啟用 Drive API，並下載「桌面應用程式」OAuth
          用戶端 JSON。{' '}
          <a href="https://developers.google.com/identity/protocols/oauth2/native-app#creatingcred">
            查看 Google 設定說明
          </a>
        </p>
      )}
      <div className="backup-actions">
        {connected && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => operation.mutate('Backup')}
          >
            立即備份
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy || connection.isPending}
          onClick={() => operation.mutate('Connect')}
        >
          {connected ? '重新授權' : '選擇 OAuth 用戶端 JSON'}
        </Button>
        {(connected || connection.isError) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => operation.mutate('Disconnect')}
          >
            移除本機授權
          </Button>
        )}
        {busy && operation.variables !== 'Disconnect' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => pending.current?.abort()}
          >
            取消
          </Button>
        )}
      </div>
      {busy && operation.variables === 'Connect' && (
        <p role="status">選擇檔案後，請在瀏覽器完成 Google 授權。</p>
      )}
      {busy && operation.variables === 'Backup' && (
        <p role="status">正在建立並上傳 SQLite 備份…</p>
      )}
      {operation.data && (
        <p role="status">
          已備份至 Google Drive。{' '}
          <a href={operation.data.url}>{operation.data.name}</a>
        </p>
      )}
      {(operation.isError || connection.isError) && (
        <p role="alert" className="inline-edit-error">
          {operation.error?.message ?? connection.error?.message}
        </p>
      )}
    </section>
  )
}
