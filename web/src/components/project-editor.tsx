import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
}: {
  project?: Project
  onSaved: (project: Project) => void
}) {
  const client = useQueryClient()
  const [name, setName] = useState(project?.name ?? '')
  const returnFocus = useRef<HTMLElement | null>(null)
  const save = useMutation({
    mutationFn: (name: string) =>
      project
        ? request<Project>(`/projects/${project.id}`, {
            name,
            version: project.version,
          })
        : request<Project>('/projects', { name }),
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
    if (!save.isPending && name.trim()) save.mutate(name)
  }

  return (
    <DialogContent
      className="project-editor max-w-sm"
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
        {project ? '重新命名 Project' : '新增 Project'}
      </DialogTitle>
      <DialogDescription className="sr-only">
        輸入 Project 名稱後儲存。
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
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {conflict
              ? `Project 已更新，目前名稱為「${project?.name}」。請確認後再儲存。`
              : save.error.message}
          </p>
        )}
        <Button disabled={save.isPending || !name.trim()}>
          {save.isPending ? '儲存中…' : '儲存'}
        </Button>
      </form>
    </DialogContent>
  )
}
