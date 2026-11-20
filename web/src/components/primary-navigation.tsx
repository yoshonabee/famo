import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { GripVertical, Pencil, Plus, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PrimaryNavItem = {
  id: string
  label: string
  icon: LucideIcon
  current: boolean
  ariaLabel?: string
  count?: number
  shortcut?: string
  onSelect: () => void
  onEdit?: () => void
}

export function PrimaryNavigation({
  items,
  collapsed,
  error,
  onReorder,
  onCreate,
  onRetry,
}: {
  items: PrimaryNavItem[]
  collapsed: boolean
  error?: string
  onReorder: (ids: string[]) => void
  onCreate: () => void
  onRetry: () => void
}) {
  return (
    <nav className="sidebar-main-nav" aria-label="主要導覽">
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled || !isSortable(event.operation.source)) return
          const { id, index } = event.operation.source
          const ids = items.map((item) => item.id)
          const from = ids.findIndex((item) => item === id)
          if (from < 0 || from === index || index < 0 || index >= ids.length)
            return
          const [moved] = ids.splice(from, 1)
          ids.splice(index, 0, moved)
          onReorder(ids)
        }}
      >
        <ul className="sidebar-nav-list">
          {items.map((item, index) => (
            <NavigationRow
              key={item.id}
              item={item}
              index={index}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </DragDropProvider>
      <button
        type="button"
        className="nav-item sidebar-add-board"
        aria-label="新增 Board"
        title="新增 Board"
        onClick={onCreate}
      >
        <Plus size={16} aria-hidden="true" />
        <span className="nav-label">新增 Board</span>
      </button>
      {error && !collapsed && (
        <div className="sidebar-collection-error" role="alert">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            重新讀取 Boards
          </Button>
        </div>
      )}
    </nav>
  )
}

function NavigationRow({
  item,
  index,
  collapsed,
}: {
  item: PrimaryNavItem
  index: number
  collapsed: boolean
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
    disabled: collapsed,
  })
  const Icon = item.icon
  return (
    <li
      ref={collapsed ? undefined : ref}
      className={`sidebar-nav-row ${item.current ? 'is-current' : ''} ${isDragging ? 'sidebar-nav-dragging' : ''}`}
    >
      {!collapsed && (
        <button
          ref={handleRef}
          type="button"
          className="sidebar-row-action sidebar-sort-handle"
          aria-label={`調整順序：${item.label}`}
          title="拖曳調整順序"
        >
          <GripVertical size={13} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={item.current ? 'nav-item active' : 'nav-item'}
        aria-label={item.ariaLabel ?? item.label}
        aria-current={item.current ? 'page' : undefined}
        aria-keyshortcuts={item.shortcut}
        title={item.label}
        onClick={item.onSelect}
      >
        <Icon size={17} aria-hidden="true" />
        <span className="nav-label">{item.label}</span>
        {item.count !== undefined && (
          <span className="nav-count">{item.count}</span>
        )}
      </button>
      {item.onEdit && !collapsed && (
        <SidebarEditButton
          name={item.label}
          kind="Board"
          onEdit={item.onEdit}
        />
      )}
    </li>
  )
}

export function SidebarEditButton({
  name,
  kind,
  onEdit,
}: {
  name: string
  kind: 'Board' | 'Project'
  onEdit: () => void
}) {
  return (
    <button
      type="button"
      className="sidebar-row-action sidebar-edit-button"
      aria-label={`編輯 ${kind}：${name}`}
      title={`編輯 ${kind}：${name}`}
      onClick={onEdit}
    >
      <Pencil size={14} aria-hidden="true" />
    </button>
  )
}
