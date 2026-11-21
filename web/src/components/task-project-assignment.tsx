import { useState } from 'react'
import { X } from 'lucide-react'
import { ProjectPicker } from '@/components/project-picker'
import { Button } from '@/components/ui/button'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

export function TaskProjectAssignment({
  projects,
  selectedCount,
  allSelected,
  busy,
  onSelectAll,
  onClear,
  onAssign,
}: {
  projects: Project[]
  selectedCount: number
  allSelected: boolean
  busy: boolean
  onSelectAll: () => void
  onClear: () => void
  onAssign: (projectId: string) => void
}) {
  const { t } = useLanguage()
  const [targetId, setTargetId] = useState<string>()
  const open = selectedCount > 0
  if (!open && targetId !== undefined) setTargetId(undefined)
  const targetAvailable =
    targetId === '' || projects.some((project) => project.id === targetId)

  return (
    <section
      className="task-project-assignment"
      data-open={open}
      inert={!open}
      aria-label={t('batchTaskActions')}
    >
      <div className="task-selection-summary">
        <span role="status">{t('selectedTaskCount', selectedCount)}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('selectAllVisible')}
          disabled={busy || allSelected}
          onClick={onSelectAll}
        >
          {t('selectAll')}
        </Button>
      </div>
      <div className="task-assignment-actions">
        <ProjectPicker
          key={String(open)}
          projects={projects}
          value={targetAvailable ? targetId : undefined}
          label={t('assignmentProject')}
          disabled={!open || busy}
          onChange={setTargetId}
        />
        <Button
          size="sm"
          disabled={busy || !targetAvailable}
          onClick={() => targetId !== undefined && onAssign(targetId)}
        >
          {t('assignProject')}
        </Button>
      </div>
      <Button
        className="task-selection-close"
        variant="ghost"
        size="icon"
        aria-label={t('clearSelection')}
        title={t('clearSelection')}
        disabled={busy}
        onClick={onClear}
      >
        <X />
      </Button>
    </section>
  )
}
