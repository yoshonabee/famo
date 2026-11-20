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
import { agentTool, isDesktop } from '@/lib/desktop'

type ProjectInput = Pick<Project, 'name'> &
  Partial<Pick<Project, 'color' | 'workspace_dir' | 'workspace_prompt'>>

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
  const [workspaceDir, setWorkspaceDir] = useState<string>()
  const [workspacePrompt, setWorkspacePrompt] = useState<string>()
  const color =
    choice === 'random' ? undefined : choice === 'custom' ? customColor : choice
  const validColor = color === undefined || /^#[0-9a-fA-F]{6}$/.test(color)
  const returnFocus = useRef<HTMLElement | null>(null)
  const save = useMutation({
    mutationFn: (input: ProjectInput) =>
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
  const picker = useMutation({
    mutationFn: () => agentTool<string>('ChooseWorkspace'),
    onSuccess: (dir) => {
      if (dir) setWorkspaceDir(dir)
    },
  })
  const conflict = save.error instanceof ApiError && save.error.status === 409
  const busy = save.isPending || picker.isPending
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy && name.trim() && validColor)
      save.mutate({
        name,
        color,
        workspace_dir:
          workspaceDir === (project?.workspace_dir ?? '')
            ? undefined
            : workspaceDir,
        workspace_prompt:
          workspacePrompt === (project?.workspace_prompt ?? '')
            ? undefined
            : workspacePrompt,
      })
  }

  return (
    <DialogContent
      className="project-editor max-w-md"
      showCloseButton={!busy}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault()
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault()
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
        編輯 Project 名稱、顏色和 Agent 工作區。
      </DialogDescription>
      <form className="project-form" onSubmit={submit}>
        <label className="field">
          <span>Project 名稱</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={busy}
            required
          />
        </label>
        <fieldset className="project-color-options" disabled={busy}>
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
        <details className="project-workspace">
          <summary>Agent 工作區</summary>
          <div className="project-workspace-fields">
            <div className="project-workspace-path">
              <label className="field">
                <span>工作區路徑</span>
                <input
                  value={workspaceDir ?? project?.workspace_dir ?? ''}
                  placeholder="/path/to/project"
                  disabled={busy}
                  onChange={(event) => setWorkspaceDir(event.target.value)}
                />
              </label>
              {isDesktop() && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => picker.mutate()}
                >
                  選擇資料夾
                </Button>
              )}
            </div>
            <label className="field">
              <span>工作區指引（選填）</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={workspacePrompt ?? project?.workspace_prompt ?? ''}
                disabled={busy}
                onChange={(event) => setWorkspacePrompt(event.target.value)}
              />
            </label>
            <p className="project-workspace-description">
              Agent 處理此 Project 的任務時，會取得這裡的路徑和指引。
            </p>
          </div>
        </details>
        {picker.isError && (
          <p className="inline-edit-error" role="alert">
            {picker.error.message}
          </p>
        )}
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
              disabled={busy}
              onDeleted={onDeleted}
            />
          )}
          <Button disabled={busy || !name.trim() || !validColor}>
            {save.isPending ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
