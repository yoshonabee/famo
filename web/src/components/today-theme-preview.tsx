import {
  CalendarDays,
  CheckCheck,
  GripVertical,
  Inbox,
  PanelLeftClose,
  PanelRightOpen,
  Settings,
} from 'lucide-react'
import { CalendarDate, DateNavigation } from '@/components/date-navigation'
import { CaptureEntry } from '@/components/quick-capture'
import { TaskSearch } from '@/components/task-palette'
import { previewStyle } from '@/components/theme-preview'
import { Checkbox } from '@/components/ui/checkbox'
import { localDate } from '@/lib/calendar'
import { type ThemeDraft } from '@/lib/theme'
import { useLanguage } from '@/lib/i18n'

const ignoreChange = () => {}

export function TodayThemePreview({ theme }: { theme: ThemeDraft }) {
  const { t } = useLanguage()
  const today = localDate()

  return (
    <div className="palette-preview" style={previewStyle(theme)} inert>
      <div className="palette-preview-shell">
        <div className="palette-preview-sidebar">
          <div className="sidebar-heading">
            <span className="brand">
              <span className="brand-mark" />
              famo
            </span>
            <PanelLeftClose className="palette-preview-sidebar-toggle" />
          </div>
          <div className="palette-preview-nav">
            <span className="nav-item active">
              <CalendarDays /> {t('today')}
            </span>
            <span className="nav-item">
              <Inbox /> {t('tasks')}
              <span className="nav-count">4</span>
            </span>
            <span className="nav-item">
              <CheckCheck /> {t('completed')}
              <span className="nav-count">1</span>
            </span>
          </div>
          <div className="sidebar-footer">
            <span className="nav-item">
              <Settings /> {t('settings')}
            </span>
          </div>
        </div>
        <div className="palette-preview-main">
          <header className="calendar-heading">
            <h4>
              <CalendarDate date={today} />
            </h4>
            <DateNavigation date={today} onChange={ignoreChange} />
            <TaskSearch value="" onChange={ignoreChange} />
          </header>
          <CaptureEntry onSubmit={ignoreChange} />
          <p className="daily-progress">{t('dailyProgress', 1, 3)}</p>
          <ul className="task-list">
            <PreviewTask title={t('sampleMeetingTask')} />
            <PreviewTask title={t('sampleScheduleTask')} />
          </ul>
          <section className="daily-completed">
            <h5>{t('completed')}</h5>
            <ul className="task-list">
              <PreviewTask title={t('sampleProjectTask')} completed />
            </ul>
          </section>
          <details className="task-move-section">
            <summary>{t('earlierTasksCount', 1)}</summary>
          </details>
          <details className="task-move-section">
            <summary>{t('undatedTasksCount', 1)}</summary>
          </details>
        </div>
      </div>
    </div>
  )
}

function PreviewTask({
  title,
  completed = false,
}: {
  title: string
  completed?: boolean
}) {
  return (
    <li className={completed ? 'task-row is-completed' : 'task-row'}>
      <div className="todo-line">
        <button className="drag-handle" type="button" disabled={completed}>
          <GripVertical size={12} />
        </button>
        <Checkbox checked={completed} />
        <span className="todo-title-editor">
          <span className="todo-title">{title}</span>
        </span>
        <span className="date-picker row-action-button">
          <CalendarDays size={12} />
        </span>
        <span className="row-action-button row-detail-button">
          <PanelRightOpen size={12} />
        </span>
      </div>
    </li>
  )
}
