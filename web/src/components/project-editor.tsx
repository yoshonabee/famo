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
import { isCloudWeb } from '@/lib/environment'
import { useLanguage } from '@/lib/i18n'

type ProjectInput = Pick<Project, 'name'> &
  Partial<
    Pick<Project, 'color' | 'version' | 'workspace_dir' | 'workspace_prompt'>
  >

export function ProjectEditor({
  project,
  onSaved,
  onDeleted,
}: {
  project?: Project
  onSaved: (project: Project) => void
  onDeleted: (id: string) => void
}) {
  const { t, errorText } = useLanguage()
  const client = useQueryClient()
  const [name, setName] = useState(project?.name ?? '')
  const [baseVersion, setBaseVersion] = useState(project?.version)
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
  const refreshCollections = () =>
    client.invalidateQueries({
      predicate: ({ queryKey: [key] }) =>
        key === 'projects' || (isCloudWeb && key === 'boards'),
    })
  const save = useMutation({
    mutationFn: (input: ProjectInput) =>
      request<Project>(
        project ? `/projects/${project.id}` : '/projects',
        input,
      ),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: ['projects'] })
      client.setQueryData<Project[]>(['projects'], (old = []) =>
        old.some((item) => item.id === saved.id)
          ? old.map((item) => (item.id === saved.id ? saved : item))
          : [...old, saved],
      )
      const refresh = refreshCollections()
      if (isCloudWeb) await refresh
      onSaved(saved)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        return refreshCollections()
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
    if (!busy && name.trim() && validColor) {
      const version = isCloudWeb && !conflict ? baseVersion : project?.version
      setBaseVersion(version)
      save.mutate({
        name,
        color,
        version,
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
        {project ? t('editProject') : t('addProject')}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {t(
          isCloudWeb
            ? 'cloudProjectEditorDescription'
            : 'projectEditorDescription',
        )}
      </DialogDescription>
      <form className="project-form" onSubmit={submit}>
        <label className="field">
          <span>{t('projectName')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={busy}
            required
          />
        </label>
        <fieldset className="project-color-options" disabled={busy}>
          <legend>{t('projectColor')}</legend>
          <div className="project-color-choices">
            {!project && (
              <label className="project-color-option">
                <input
                  type="radio"
                  name={colorGroup}
                  checked={choice === 'random'}
                  onChange={() => setChoice('random')}
                />
                {t('randomColor')}
              </label>
            )}
            {projectColors.map(({ value, label }) => (
              <label
                className="project-color-option"
                key={value}
                title={t(label)}
              >
                <input
                  type="radio"
                  name={colorGroup}
                  aria-label={t(label)}
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
              {t('customColor')}
            </label>
          </div>
          {choice === 'custom' && (
            <div className="project-custom-color">
              <input
                type="color"
                aria-label={t('projectColorPicker')}
                value={validColor ? customColor : '#64748B'}
                onChange={(event) =>
                  setCustomColor(event.target.value.toUpperCase())
                }
              />
              <input
                type="text"
                aria-label={t('projectHexColor')}
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
        {!isCloudWeb && (
          <details className="project-workspace">
            <summary>{t('agentWorkspace')}</summary>
            <div className="project-workspace-fields">
              <div className="project-workspace-path">
                <label className="field">
                  <span>{t('workspacePath')}</span>
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
                    {t('chooseFolder')}
                  </Button>
                )}
              </div>
              <label className="field">
                <span>{t('workspaceInstructions')}</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={workspacePrompt ?? project?.workspace_prompt ?? ''}
                  disabled={busy}
                  onChange={(event) => setWorkspacePrompt(event.target.value)}
                />
              </label>
              <p className="project-workspace-description">
                {t('projectWorkspaceDescription')}
              </p>
            </div>
          </details>
        )}
        {picker.isError && (
          <p className="inline-edit-error" role="alert">
            {errorText(picker.error)}
          </p>
        )}
        {save.isError && (
          <p className="inline-edit-error" role="alert">
            {conflict
              ? isCloudWeb && !project
                ? t('projectCloudCreateConflict')
                : t('projectConflict', project?.name ?? '')
              : errorText(save.error)}
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
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
