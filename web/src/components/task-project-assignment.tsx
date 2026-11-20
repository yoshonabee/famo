import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Project } from '@/lib/api'

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
  const [targetId, setTargetId] = useState('')
  const targetAvailable =
    targetId === unassigned ||
    projects.some((project) => project.id === targetId)

  return (
    <div id="task-project-assignment" className="task-project-assignment">
      <label>
        <Checkbox
          aria-label="全選可見任務"
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
        全選
      </label>
      <select
        aria-label="指派目標 Project"
        value={targetAvailable ? targetId : ''}
        disabled={busy}
        onChange={(event) => setTargetId(event.target.value)}
      >
        <option value="" disabled>
          選擇 Project
        </option>
        <option value={unassigned}>未分類</option>
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
        指派（{selectedCount}）
      </Button>
    </div>
  )
}
