import { useRef } from 'react'
import {
  clampSidebarWidth,
  sidebarMaxWidth,
  sidebarMinWidth,
} from '@/lib/sidebar-preferences'
import { useLanguage } from '@/lib/i18n'

export function SidebarResizeHandle({
  width,
  onResize,
  onSave,
}: {
  width: number
  onResize: (width: number | null) => void
  onSave: (width: number) => void
}) {
  const { t } = useLanguage()
  const drag = useRef<{ id: number; x: number; width: number }>(null)

  function resizedWidth(id: number, x: number) {
    const start = drag.current
    if (start?.id !== id) return null
    return clampSidebarWidth(start.width + x - start.x)
  }

  function cancelDrag(id: number) {
    if (drag.current?.id !== id) return
    drag.current = null
    onResize(null)
  }

  return (
    <div
      className="sidebar-resize-handle"
      role="separator"
      tabIndex={0}
      aria-label={t('resizeSidebar')}
      aria-controls="app-sidebar"
      aria-orientation="vertical"
      aria-valuemin={sidebarMinWidth}
      aria-valuemax={sidebarMaxWidth}
      aria-valuenow={width}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: event.pointerId, x: event.clientX, width }
        onResize(width)
      }}
      onPointerMove={(event) => {
        const next = resizedWidth(event.pointerId, event.clientX)
        if (next !== null) onResize(next)
      }}
      onPointerUp={(event) => {
        const next = resizedWidth(event.pointerId, event.clientX)
        if (next === null) return
        if (next !== drag.current?.width) onSave(next)
        drag.current = null
        onResize(null)
      }}
      onPointerCancel={(event) => cancelDrag(event.pointerId)}
      onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
      onKeyDown={(event) => {
        if (drag.current) return
        const widths = {
          ArrowLeft: width - 12,
          ArrowRight: width + 12,
          Home: sidebarMinWidth,
          End: sidebarMaxWidth,
        }
        const next = widths[event.key as keyof typeof widths]
        if (typeof next !== 'number') return
        event.preventDefault()
        onSave(clampSidebarWidth(next))
      }}
    />
  )
}
