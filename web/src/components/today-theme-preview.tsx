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

const ignoreChange = () => {}

export function TodayThemePreview({ theme }: { theme: ThemeDraft }) {
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
              <CalendarDays /> 今日
            </span>
            <span className="nav-item">
              <Inbox /> 任務<span className="nav-count">4</span>
            </span>
            <span className="nav-item">
              <CheckCheck /> 已完成<span className="nav-count">1</span>
            </span>
          </div>
          <div className="sidebar-footer">
            <span className="nav-item">
              <Settings /> 設定
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
          <p className="daily-progress">已完成 1 / 3</p>
          <ul className="task-list">
            <PreviewTask title="整理會議筆記" />
            <PreviewTask title="確認明天的行程" />
          </ul>
          <section className="daily-completed">
            <h5>已完成</h5>
            <ul className="task-list">
              <PreviewTask title="回覆專案進度" completed />
            </ul>
          </section>
          <details className="task-move-section">
            <summary>先前未完成（1）</summary>
          </details>
          <details className="task-move-section">
            <summary>未指定日期（1）</summary>
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
