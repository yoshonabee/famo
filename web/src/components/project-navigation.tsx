import { Folder, Plus } from 'lucide-react'
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
  onRetry,
}: {
  projects: Project[]
  current?: string
  collapsed: boolean
  error?: string
  onSelect: (id: string) => void
  onExpand: () => void
  onCreate: () => void
  onRetry: () => void
}) {
  if (collapsed)
    return (
      <button
        type="button"
        className={
          current ? 'nav-item project-expand active' : 'nav-item project-expand'
        }
        onClick={onExpand}
        aria-label="展開 Project 導覽"
        title="展開 Project 導覽"
      >
        <Folder size={17} />
      </button>
    )

  return (
    <section className="project-navigation" aria-label="Project 導覽">
      <div className="project-navigation-heading">
        <h2>Projects</h2>
        <Button
          variant="ghost"
          size="icon"
          className="project-add-button"
          aria-label="新增 Project"
          title="新增 Project"
          onClick={onCreate}
        >
          <Plus />
        </Button>
      </div>
      {error && (
        <div className="project-load-error" role="alert">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            重新讀取 Projects
          </Button>
        </div>
      )}
      {projects.length > 0 && (
        <ul className="project-navigation-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={
                  current === project.id ? 'nav-item active' : 'nav-item'
                }
                aria-current={current === project.id ? 'page' : undefined}
                onClick={() => onSelect(project.id)}
                title={project.name}
              >
                <Folder size={16} />
                <span className="nav-label">{project.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
