import { useState } from 'react'
import { ChevronDown, ListFilter } from 'lucide-react'
import { ProjectColorDot } from '@/components/project-appearance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

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
  const { t } = useLanguage()
  const options = [...projects, { id: '', name: t('unassigned'), color: '' }]
  const selected = options.filter(
    ({ id }) => !filter.hidden.includes(id),
  ).length

  return (
    <details className="today-project-filter">
      <summary className="today-project-filter-toggle">
        <ListFilter size={16} aria-hidden="true" />
        <span>{t('filterProjects')}</span>
        <span className="today-project-filter-count">
          {selected === options.length
            ? t('all')
            : `${selected} / ${options.length}`}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="today-project-filter-panel">
        <fieldset>
          <legend className="sr-only">{t('projectsShownToday')}</legend>
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
            {t('showAll')}
          </Button>
        )}
        {filter.hidden.includes('') && (
          <p className="muted">{t('projectFilterCaptureHint')}</p>
        )}
      </div>
    </details>
  )
}
