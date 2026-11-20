import { Trigger as DialogTrigger } from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError, request } from '@/lib/api'

type Item = { id: string; name: string; version: number }

function isStale(error: Error | null) {
  return error instanceof ApiError && [404, 409].includes(error.status)
}

export function DeleteCollectionButton({
  collection,
  item,
  disabled,
  onDeleted,
}: {
  collection: 'boards' | 'projects'
  item: Item
  disabled: boolean
  onDeleted: (id: string) => void
}) {
  const client = useQueryClient()
  const [target, setTarget] = useState<Item | null>(null)
  const kind = collection === 'boards' ? 'Board' : 'Project'
  const remove = useMutation({
    mutationFn: ({ id, version }: Item) =>
      request(`/${collection}/${id}/delete`, { version }),
    onSuccess: async (_data, { id }) => {
      await client.cancelQueries({ queryKey: [collection] })
      onDeleted(id)
      client.setQueryData<Item[]>([collection], (previous) =>
        previous?.filter((entry) => entry.id !== id),
      )
      void client.invalidateQueries({ queryKey: [collection] })
      if (collection === 'projects') {
        void client.invalidateQueries({ queryKey: ['boards'] })
        void client.invalidateQueries({ queryKey: ['tasks'] })
      }
    },
    onError: (error) => {
      if (isStale(error))
        void client.invalidateQueries({ queryKey: [collection] })
    },
  })
  const stale = isStale(remove.error)

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (remove.isPending) return
        if (open) remove.reset()
        setTarget(open ? item : null)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          刪除
        </Button>
      </DialogTrigger>
      <DialogContent
        role="alertdialog"
        className="z-[70] max-w-md"
        overlayClassName="z-[60]"
        showCloseButton={false}
      >
        <DialogTitle className="dialog-title">刪除 {kind}</DialogTitle>
        <DialogDescription className="preferences-description">
          確定要刪除「{target?.name}」嗎？這項操作無法復原。
          {collection === 'projects'
            ? '所有任務都會保留，此 Project 的任務會改為未分類。'
            : '此 Board 顯示的任務和所屬的 Projects 都會保留。'}
        </DialogDescription>
        {remove.isError && (
          <p className="inline-edit-error mt-3" role="alert">
            {stale
              ? `${remove.error.message}。請關閉並重新開啟編輯視窗確認。`
              : remove.error.message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={remove.isPending}
            onClick={() => setTarget(null)}
          >
            取消
          </Button>
          <Button
            type="button"
            className="bg-red-700 text-white hover:bg-red-800"
            disabled={!target || remove.isPending || stale}
            onClick={() => target && remove.mutate(target)}
          >
            {remove.isPending ? '刪除中…' : '永久刪除'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
