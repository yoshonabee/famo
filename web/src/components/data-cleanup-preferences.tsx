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

export function DataCleanupPreferences() {
  const [open, setOpen] = useState(false)
  const cleanup = useMutation({
    mutationFn: () =>
      request<{ deleted_count: number }>('/tasks/recently-deleted/cleanup', {
        confirm: true,
      }),
    onSuccess: () => setOpen(false),
  })

  return (
    <section
      className="mt-8 grid gap-3 border-t border-input pt-6"
      aria-labelledby="local-data-heading"
    >
      <h2 id="local-data-heading" className="text-base font-semibold">
        本機資料
      </h2>
      <p
        id="data-cleanup-description"
        className="preferences-description mt-0!"
      >
        將刪除滿 7 天的任務及其排序資料從本機 SQLite 永久移除。
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
            清理資料
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogTitle className="dialog-title">清理資料</DialogTitle>
          <DialogDescription className="preferences-description">
            確認後會永久移除已刪除滿 7 天的任務及其排序資料，之後無法在 Famo
            還原這些任務。
          </DialogDescription>
          {cleanup.isError && (
            <p className="inline-edit-error mt-3" role="alert">
              {cleanup.error.message}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cleanup.isPending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={cleanup.isPending}
              onClick={() => cleanup.mutate()}
            >
              {cleanup.isPending ? '清理中…' : '永久清理'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {cleanup.data && (
        <p role="status" className="text-sm text-muted-foreground">
          {cleanup.data.deleted_count === 0
            ? '沒有到期的已刪除任務。'
            : `已永久清理 ${cleanup.data.deleted_count} 筆已刪除任務。`}
        </p>
      )}
    </section>
  )
}
