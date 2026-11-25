import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { GripVertical, Pencil, Plus, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n'

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
  error,
  onReorder,
  onCreate,
  onRetry,
}: {
  items: PrimaryNavItem[]
  error?: string
  onReorder: (ids: string[]) => void
  onCreate: () => void
  onRetry: () => void
}) {
  const { t } = useLanguage()
  return (
    <nav className="sidebar-main-nav" aria-label={t('mainNavigation')}>
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
            <NavigationRow key={item.id} item={item} index={index} />
          ))}
        </ul>
      </DragDropProvider>
      <button
        type="button"
        className="nav-item sidebar-add-board"
        aria-label={t('addBoard')}
        title={t('addBoard')}
        onClick={onCreate}
      >
        <Plus size={16} aria-hidden="true" />
        <span className="nav-label">{t('addBoard')}</span>
      </button>
      {error && (
        <div className="sidebar-collection-error" role="alert">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('reloadBoards')}
          </Button>
        </div>
      )}
    </nav>
  )
}

function NavigationRow({
  item,
  index,
}: {
  item: PrimaryNavItem
  index: number
}) {
  const { t } = useLanguage()
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
  })
  return (
    <li
      ref={ref}
      className={`sidebar-nav-row ${item.current ? 'is-current' : ''} ${isDragging ? 'sidebar-nav-dragging' : ''}`}
    >
      <button
        ref={handleRef}
        type="button"
        className="sidebar-row-action sidebar-sort-handle"
        aria-label={t('reorderNavigation', item.label)}
        title={t('dragToReorder')}
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
      <NavigationButton item={item} />
      {item.onEdit && (
        <SidebarEditButton
          name={item.label}
          kind="Board"
          onEdit={item.onEdit}
        />
      )}
    </li>
  )
}

export function NavigationButton({ item }: { item: PrimaryNavItem }) {
  const Icon = item.icon
  return (
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
  const { t } = useLanguage()
  return (
    <button
      type="button"
      className="sidebar-row-action sidebar-edit-button"
      aria-label={t('editCollection', kind, name)}
      title={t('editCollection', kind, name)}
      onClick={onEdit}
    >
      <Pencil size={14} aria-hidden="true" />
    </button>
  )
}
