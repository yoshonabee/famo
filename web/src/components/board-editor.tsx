import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DeleteCollectionButton } from '@/components/delete-collection-button'
import { ProjectColorDot } from '@/components/project-appearance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ApiError,
  request,
  type Board,
  type BoardInput,
  type Project,
} from '@/lib/api'

export function BoardEditor({
  board,
  projects,
  projectsError,
  onRetryProjects,
  onSaved,
  onDeleted,
}: {
  board?: Board
  projects?: Project[]
  projectsError?: string
  onRetryProjects: () => void
  onSaved: (board: Board) => void
  onDeleted: (id: string) => void
}) {
  const client = useQueryClient()
  const [name, setName] = useState(board?.name ?? '')
  const [version] = useState(board?.version)
  const [selected, setSelected] = useState(board?.project_ids ?? [])
  const returnFocus = useRef<HTMLElement | null>(null)
  const save = useMutation({
    mutationFn: (input: BoardInput) =>
      board
        ? request<Board>(`/boards/${board.id}`, {
            ...input,
            version,
          })
        : request<Board>('/boards', input),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: ['boards'] })
      client.setQueryData<Board[]>(['boards'], (previous = []) =>
        previous.some(({ id }) => id === saved.id)
          ? previous.map((item) => (item.id === saved.id ? saved : item))
          : [...previous, saved],
      )
      void client.invalidateQueries({ queryKey: ['boards'] })
      onSaved(saved)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        return client.invalidateQueries({ queryKey: ['boards'] })
    },
  })
  const conflict = save.error instanceof ApiError && save.error.status === 409

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!save.isPending && !conflict && name.trim() && projects)
      save.mutate({ name, project_ids: selected })
  }

  return (
    <DialogContent
      className="max-w-md"
      showCloseButton={!save.isPending}
      onEscapeKeyDown={(event) => {
        if (save.isPending) event.preventDefault()
      }}
      onInteractOutside={(event) => {
        if (save.isPending) event.preventDefault()
      }}
      onOpenAutoFocus={() => {
        if (document.activeElement instanceof HTMLElement)
          returnFocus.current = document.activeElement
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        returnFocus.current?.focus({ preventScroll: true })
      }}
    >
      <DialogTitle className="dialog-title mb-3 pr-7">
        {board ? '編輯 Board' : '新增 Board'}
      </DialogTitle>
      <DialogDescription className="sr-only">
        設定 Board 名稱和顯示的 Project 後儲存。
      </DialogDescription>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="field">
          <span>Board 名稱</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={save.isPending}
            required
          />
        </label>
        <fieldset className="min-w-0" disabled={save.isPending}>
          <legend className="mb-2 text-sm">顯示的 Project</legend>
          {projects === undefined ? (
            projectsError ? (
              <div className="grid justify-items-start gap-2">
                <p className="inline-edit-error" role="alert">
                  {projectsError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetryProjects}
                >
                  重試
                </Button>
              </div>
            ) : (
              <p className="muted" role="status">
                載入 Project 中…
              </p>
            )
          ) : projects.length ? (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto p-0.5">
              {projects.map(({ id, name, color }) => (
                <label key={id} className="today-project-option">
                  <Checkbox
                    aria-label={name}
                    checked={selected.includes(id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked === true
                          ? [...current, id]
                          : current.filter((item) => item !== id),
                      )
                    }
                  />
                  <ProjectColorDot color={color} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">新增 Project 後，即可加入 Board。</p>
          )}
        </fieldset>
        {!!projects?.length && selected.length === 0 && (
          <p className="muted">未選擇 Project 時，Board 會是空的。</p>
        )}
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {conflict
              ? 'Board 已更新。請重新開啟編輯視窗以取得最新設定。'
              : save.error.message}
          </p>
        )}
        <div className="collection-editor-actions">
          {board && (
            <DeleteCollectionButton
              collection="boards"
              item={board}
              disabled={save.isPending || conflict}
              onDeleted={onDeleted}
            />
          )}
          <Button
            disabled={save.isPending || conflict || !name.trim() || !projects}
          >
            {save.isPending ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
