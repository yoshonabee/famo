import { Plus, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function SidebarCollection<Item extends { id: string; name: string }>({
  name,
  items,
  icon: Icon,
  renderItemIcon,
  current,
  collapsed,
  error,
  onSelect,
  onExpand,
  onCreate,
  onRetry,
}: {
  name: 'Board' | 'Project'
  items: Item[]
  icon: LucideIcon
  renderItemIcon?: (item: Item) => ReactNode
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
          current
            ? 'nav-item collection-expand active'
            : 'nav-item collection-expand'
        }
        onClick={onExpand}
        aria-label={`展開 ${name} 導覽`}
        title={`展開 ${name} 導覽`}
      >
        <Icon size={17} />
      </button>
    )

  return (
    <section className="sidebar-collection" aria-label={`${name} 導覽`}>
      <div className="sidebar-collection-heading">
        <h2>{name}s</h2>
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-collection-add"
          aria-label={`新增 ${name}`}
          title={`新增 ${name}`}
          onClick={onCreate}
        >
          <Plus />
        </Button>
      </div>
      {error && (
        <div className="sidebar-collection-error" role="alert">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            重新讀取 {name}s
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <ul className="sidebar-collection-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={current === item.id ? 'nav-item active' : 'nav-item'}
                aria-current={current === item.id ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
                title={item.name}
              >
                {renderItemIcon ? (
                  renderItemIcon(item)
                ) : (
                  <Icon size={15} aria-hidden="true" />
                )}
                <span className="nav-label">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
