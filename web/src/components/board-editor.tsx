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
import { useLanguage } from '@/lib/i18n'

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
  const { t, errorText } = useLanguage()
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
        {board ? t('editBoard') : t('addBoard')}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {t('boardEditorDescription')}
      </DialogDescription>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="field">
          <span>{t('boardName')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={save.isPending}
            required
          />
        </label>
        <fieldset className="min-w-0" disabled={save.isPending}>
          <legend className="mb-2 text-sm">{t('displayedProjects')}</legend>
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
                  {t('retry')}
                </Button>
              </div>
            ) : (
              <p className="muted" role="status">
                {t('loadingProjects')}
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
            <p className="muted">{t('addProjectToBoard')}</p>
          )}
        </fieldset>
        {!!projects?.length && selected.length === 0 && (
          <p className="muted">{t('emptyBoardFilter')}</p>
        )}
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {conflict ? t('boardConflict') : errorText(save.error)}
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
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
