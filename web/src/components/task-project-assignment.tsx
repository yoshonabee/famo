import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

const unassigned = 'unassigned'

export function TaskProjectAssignment({
  projects,
  selectedCount,
  taskCount,
  busy,
  onSelectAll,
  onAssign,
}: {
  projects: Project[]
  selectedCount: number
  taskCount: number
  busy: boolean
  onSelectAll: (checked: boolean) => void
  onAssign: (projectId: string) => void
}) {
  const { t } = useLanguage()
  const [targetId, setTargetId] = useState('')
  const targetAvailable =
    targetId === unassigned ||
    projects.some((project) => project.id === targetId)

  return (
    <div id="task-project-assignment" className="task-project-assignment">
      <label>
        <Checkbox
          aria-label={t('selectAllVisible')}
          checked={
            selectedCount === 0
              ? false
              : selectedCount === taskCount
                ? true
                : 'indeterminate'
          }
          disabled={busy || taskCount === 0}
          onCheckedChange={(checked) => onSelectAll(checked === true)}
        />
        {t('selectAll')}
      </label>
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
        disabled={busy || !targetAvailable || selectedCount === 0}
        onClick={() => onAssign(targetId === unassigned ? '' : targetId)}
      >
        {t('assignTasks', selectedCount)}
      </Button>
    </div>
  )
}
