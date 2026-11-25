import { useState } from 'react'
import type { Project, Task } from '@/lib/api'
import { adjacentDate, localDate } from '@/lib/calendar'
import { useLanguage } from '@/lib/i18n'
import './task-statistics.css'

const allProjects = '*'

export function TaskStatistics({
  tasks,
  projects,
  today,
}: {
  tasks: Task[]
  projects: Project[]
  today: string
}) {
  const { locale, t } = useLanguage()
  const [selectedProject, setSelectedProject] = useState(allProjects)
  const projectIds = new Set(projects.map(({ id }) => id))
  const projectFilter =
    selectedProject && !projectIds.has(selectedProject)
      ? allProjects
      : selectedProject
  const days = new Map(
    Array.from({ length: 7 }, (_, index) => [
      adjacentDate(today, index - 6),
      0,
    ]),
  )
  let open = 0
  let completed = 0
  let overdue = 0
  for (const task of tasks) {
    if (task.deleted_at) continue
    const projectId =
      task.project_id && projectIds.has(task.project_id) ? task.project_id : ''
    if (projectFilter !== allProjects && projectId !== projectFilter) continue

    if (task.completed_at) {
      completed += 1
      const completionDay = localDate(new Date(task.completed_at))
      const count = days.get(completionDay)
      if (count !== undefined) days.set(completionDay, count + 1)
    } else {
      open += 1
      if (task.scheduled_date && task.scheduled_date < today) overdue += 1
    }
  }

  const largestCount = Math.max(1, ...days.values())
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  })
  const number = new Intl.NumberFormat(locale)
  const totals = [
    { label: t('statisticsOpen'), value: open },
    { label: t('completed'), value: completed },
    { label: t('statisticsOverdue'), value: overdue },
  ]

  return (
    <div className="task-statistics">
      <label className="task-statistics-filter">
        <span>Project</span>
        <select
          value={projectFilter}
          onChange={(event) => setSelectedProject(event.currentTarget.value)}
        >
          <option value={allProjects}>{t('statisticsAllProjects')}</option>
          <option value="">{t('unassigned')}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <section aria-labelledby="statistics-overview">
        <h2 id="statistics-overview">{t('statisticsOverview')}</h2>
        <dl className="task-statistics-totals">
          {totals.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{number.format(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="statistics-recent">
        <h2 id="statistics-recent">{t('statisticsRecentCompletions')}</h2>
        <ul className="task-statistics-days">
          {Array.from(days, ([date, count]) => (
            <li key={date}>
              <time dateTime={date}>
                {dayLabel.format(new Date(`${date}T12:00:00`))}
              </time>
              <span className="task-statistics-track" aria-hidden="true">
                <span style={{ width: `${(count / largestCount) * 100}%` }} />
              </span>
              <span className="task-statistics-day-count">
                {number.format(count)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
