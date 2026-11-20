import { useState } from 'react'
import { ChevronDown, ListFilter } from 'lucide-react'
import { ProjectColorDot } from '@/components/project-appearance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Project } from '@/lib/api'

const storageKey = 'famo.today-hidden-projects'

export function useTodayProjectFilter() {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? '[]',
      )
      return Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : []
    } catch {
      return []
    }
  })

  function change(next: string[]) {
    setHidden(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // The filter still works for this session when storage is unavailable.
    }
  }

  return { hidden, change }
}

export function TodayProjectFilter({
  projects,
  filter,
}: {
  projects: Project[]
  filter: ReturnType<typeof useTodayProjectFilter>
}) {
  const options = [...projects, { id: '', name: '未分類', color: '' }]
  const selected = options.filter(
    ({ id }) => !filter.hidden.includes(id),
  ).length

  return (
    <details className="today-project-filter">
      <summary className="today-project-filter-toggle">
        <ListFilter size={16} aria-hidden="true" />
        <span>篩選 Project</span>
        <span className="today-project-filter-count">
          {selected === options.length
            ? '全部'
            : `${selected} / ${options.length}`}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="today-project-filter-panel">
        <fieldset>
          <legend className="sr-only">今日顯示的 Project</legend>
          {options.map(({ id, name, color }) => (
            <label key={id} className="today-project-option">
              <Checkbox
                aria-label={name}
                checked={!filter.hidden.includes(id)}
                onCheckedChange={(checked) =>
                  filter.change(
                    checked
                      ? filter.hidden.filter((item) => item !== id)
                      : [...filter.hidden, id],
                  )
                }
              />
              {color && <ProjectColorDot color={color} />}
              <span>{name}</span>
            </label>
          ))}
        </fieldset>
        {filter.hidden.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => filter.change([])}>
            顯示全部
          </Button>
        )}
        {filter.hidden.includes('') && (
          <p className="muted">快速新增的任務會儲存為未分類，並依篩選隱藏。</p>
        )}
      </div>
    </details>
  )
}
