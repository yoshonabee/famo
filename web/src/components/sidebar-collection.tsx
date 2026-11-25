import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { GripVertical, Plus } from 'lucide-react'
import { SidebarEditButton } from '@/components/primary-navigation'
import { ProjectColorDot } from '@/components/project-appearance'
import { Button } from '@/components/ui/button'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

export function ProjectNavigation({
  projects,
  current,
  reordering,
  error,
  onSelect,
  onCreate,
  onEdit,
  onReorder,
  onRetry,
}: {
  projects: Project[]
  current?: string
  reordering: boolean
  error?: string
  onSelect: (id: string) => void
  onCreate: () => void
  onEdit: (id: string) => void
  onReorder: (ids: string[]) => void
  onRetry: () => void
}) {
  const { t } = useLanguage()
  return (
    <section className="sidebar-collection" aria-label={t('projectNavigation')}>
      <div className="sidebar-collection-heading">
        <h2>Projects</h2>
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-collection-add"
          aria-label={t('addProject')}
          title={t('addProject')}
          onClick={onCreate}
        >
          <Plus />
        </Button>
      </div>
      {error && (
        <div className="sidebar-collection-error" role="alert">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('reloadProjects')}
          </Button>
        </div>
      )}
      {projects.length > 0 && (
        <DragDropProvider
          onDragEnd={(event) => {
            if (
              reordering ||
              event.canceled ||
              !isSortable(event.operation.source)
            )
              return
            const { id, index } = event.operation.source
            const ids = projects.map((project) => project.id)
            const from = ids.findIndex((projectId) => projectId === id)
            if (from < 0 || from === index || index < 0 || index >= ids.length)
              return
            const [moved] = ids.splice(from, 1)
            ids.splice(index, 0, moved)
            onReorder(ids)
          }}
        >
          <ul className="sidebar-collection-list">
            {projects.map((item, index) => (
              <ProjectNavigationRow
                key={item.id}
                project={item}
                index={index}
                current={current === item.id}
                reorderDisabled={reordering || projects.length < 2}
                onSelect={() => onSelect(item.id)}
                onEdit={() => onEdit(item.id)}
              />
            ))}
          </ul>
        </DragDropProvider>
      )}
    </section>
  )
}

function ProjectNavigationRow({
  project,
  index,
  current,
  reorderDisabled,
  onSelect,
  onEdit,
}: {
  project: Project
  index: number
  current: boolean
  reorderDisabled: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const { t } = useLanguage()
  const { ref, handleRef, isDragging } = useSortable({
    id: project.id,
    index,
    disabled: reorderDisabled,
  })
  return (
    <li
      ref={ref}
      className={`sidebar-nav-row ${current ? 'is-current' : ''} ${isDragging ? 'sidebar-nav-dragging' : ''}`}
    >
      <button
        ref={handleRef}
        type="button"
        className="sidebar-row-action sidebar-sort-handle"
        aria-label={t('reorderNavigation', project.name)}
        title={t('dragToReorder')}
        aria-disabled={reorderDisabled}
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={current ? 'nav-item active' : 'nav-item'}
        aria-current={current ? 'page' : undefined}
        onClick={onSelect}
        title={project.name}
      >
        <ProjectColorDot color={project.color} />
        <span className="nav-label">{project.name}</span>
      </button>
      <SidebarEditButton name={project.name} kind="Project" onEdit={onEdit} />
    </li>
  )
}
