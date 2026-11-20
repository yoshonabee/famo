import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

const unassigned = 'unassigned'

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
  const [targetId, setTargetId] = useState('')
  const targetAvailable =
    targetId === unassigned ||
    projects.some((project) => project.id === targetId)

  return (
    <section
      className="task-project-assignment"
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
        <select
          aria-label={t('assignmentProject')}
          value={targetAvailable ? targetId : ''}
          disabled={busy}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="" disabled>
            {t('chooseProject')}
          </option>
          <option value={unassigned}>{t('unassigned')}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={busy || !targetAvailable}
          onClick={() => onAssign(targetId === unassigned ? '' : targetId)}
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
