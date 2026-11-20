import { Folder, Plus } from 'lucide-react'
import { SidebarEditButton } from '@/components/primary-navigation'
import { ProjectColorDot } from '@/components/project-appearance'
import { Button } from '@/components/ui/button'
import type { Project } from '@/lib/api'

export function ProjectNavigation({
  projects,
  current,
  collapsed,
  error,
  onSelect,
  onExpand,
  onCreate,
  onEdit,
  onRetry,
}: {
  projects: Project[]
  current?: string
  collapsed: boolean
  error?: string
  onSelect: (id: string) => void
  onExpand: () => void
  onCreate: () => void
  onEdit: (id: string) => void
  onRetry: () => void
}) {
  if (collapsed)
    return (
      <button
        type="button"
        className={
          current
            ? 'nav-item collection-expand active'
            : 'nav-item collection-expand'
        }
        onClick={onExpand}
        aria-label="展開 Project 導覽"
        title="展開 Project 導覽"
      >
        <Folder size={17} />
      </button>
    )

  return (
    <section className="sidebar-collection" aria-label="Project 導覽">
      <div className="sidebar-collection-heading">
        <h2>Projects</h2>
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-collection-add"
          aria-label="新增 Project"
          title="新增 Project"
          onClick={onCreate}
        >
          <Plus />
        </Button>
      </div>
      {error && (
        <div className="sidebar-collection-error" role="alert">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            重新讀取 Projects
          </Button>
        </div>
      )}
      {projects.length > 0 && (
        <ul className="sidebar-collection-list">
          {projects.map((item) => (
            <li
              key={item.id}
              className={
                current === item.id
                  ? 'sidebar-nav-row is-current'
                  : 'sidebar-nav-row'
              }
            >
              <button
                type="button"
                className={current === item.id ? 'nav-item active' : 'nav-item'}
                aria-current={current === item.id ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
                title={item.name}
              >
                <ProjectColorDot color={item.color} />
                <span className="nav-label">{item.name}</span>
              </button>
              <SidebarEditButton
                name={item.name}
                kind="Project"
                onEdit={() => onEdit(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
