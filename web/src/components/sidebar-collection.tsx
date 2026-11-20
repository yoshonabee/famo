import { Folder, Plus } from 'lucide-react'
import { SidebarEditButton } from '@/components/primary-navigation'
import { ProjectColorDot } from '@/components/project-appearance'
import { Button } from '@/components/ui/button'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

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
  const { t } = useLanguage()
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
        aria-label={t('expandProjectNavigation')}
        title={t('expandProjectNavigation')}
      >
        <Folder size={17} />
      </button>
    )

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
