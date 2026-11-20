import { useId, useRef, useState, type FormEvent } from 'react'
import { ProjectColorDot, projectColors } from '@/components/project-appearance'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DeleteCollectionButton } from '@/components/delete-collection-button'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError, request, type Project } from '@/lib/api'

export function ProjectEditor({
  project,
  onSaved,
  onDeleted,
}: {
  project?: Project
  onSaved: (project: Project) => void
  onDeleted: (id: string) => void
}) {
  const client = useQueryClient()
  const [name, setName] = useState(project?.name ?? '')
  const colorGroup = useId()
  const [choice, setChoice] = useState(() => {
    if (!project) return 'random'
    return projectColors.some(({ value }) => value === project.color)
      ? project.color
      : 'custom'
  })
  const [customColor, setCustomColor] = useState(project?.color ?? '#64748B')
  const color =
    choice === 'random' ? undefined : choice === 'custom' ? customColor : choice
  const validColor = color === undefined || /^#[0-9a-fA-F]{6}$/.test(color)
  const returnFocus = useRef<HTMLElement | null>(null)
  const save = useMutation({
    mutationFn: (input: { name: string; color?: string }) =>
      project
        ? request<Project>(`/projects/${project.id}`, {
            ...input,
            version: project.version,
          })
        : request<Project>('/projects', input),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: ['projects'] })
      client.setQueryData<Project[]>(['projects'], (old = []) => [
        ...old.filter((item) => item.id !== saved.id),
        saved,
      ])
      void client.invalidateQueries({ queryKey: ['projects'] })
      onSaved(saved)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const conflict = save.error instanceof ApiError && save.error.status === 409
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!save.isPending && name.trim() && validColor)
      save.mutate({ name, color })
  }

  return (
    <DialogContent
      className="project-editor max-w-md"
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
      <DialogTitle className="dialog-title">
        {project ? '編輯 Project' : '新增 Project'}
      </DialogTitle>
      <DialogDescription className="sr-only">
        設定 Project 名稱和顏色後儲存。
      </DialogDescription>
      <form className="project-form" onSubmit={submit}>
        <label className="field">
          <span>Project 名稱</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={save.isPending}
            required
          />
        </label>
        <fieldset className="project-color-options" disabled={save.isPending}>
          <legend>Project 顏色</legend>
          <div className="project-color-choices">
            {!project && (
              <label className="project-color-option">
                <input
                  type="radio"
                  name={colorGroup}
                  checked={choice === 'random'}
                  onChange={() => setChoice('random')}
                />
                隨機
              </label>
            )}
            {projectColors.map(({ value, label }) => (
              <label className="project-color-option" key={value} title={label}>
                <input
                  type="radio"
                  name={colorGroup}
                  aria-label={label}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                <ProjectColorDot color={value} />
              </label>
            ))}
            <label className="project-color-option">
              <input
                type="radio"
                name={colorGroup}
                checked={choice === 'custom'}
                onChange={() => setChoice('custom')}
              />
              自訂
            </label>
          </div>
          {choice === 'custom' && (
            <div className="project-custom-color">
              <input
                type="color"
                aria-label="Project 調色盤"
                value={validColor ? customColor : '#64748B'}
                onChange={(event) =>
                  setCustomColor(event.target.value.toUpperCase())
                }
              />
              <input
                type="text"
                aria-label="Project 色碼"
                placeholder="#RRGGBB"
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                spellCheck={false}
                required
                value={customColor}
                onChange={(event) => setCustomColor(event.target.value)}
              />
            </div>
          )}
        </fieldset>
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {conflict
              ? `Project 已更新，目前名稱為「${project?.name}」。請確認後再儲存。`
              : save.error.message}
          </p>
        )}
        <div className="collection-editor-actions">
          {project && (
            <DeleteCollectionButton
              collection="projects"
              item={project}
              disabled={save.isPending}
              onDeleted={onDeleted}
            />
          )}
          <Button disabled={save.isPending || !name.trim() || !validColor}>
            {save.isPending ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
