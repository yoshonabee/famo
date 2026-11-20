import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'

const rowSelector = '[data-selectable-task]'
const rowControls =
  'button, a, input, textarea, select, [contenteditable], [role="dialog"]'
const selectThreshold = 5
const scrollEdge = 56
const touchHold = 400

type Selection = { scope: string; ids: string[]; anchor: string | null }
type Gesture = {
  pointer: number
  root: HTMLDivElement
  row: HTMLElement
  start: string
  end: string | null
  startedInEditor: boolean
  touch: boolean
  x: number
  y: number
}

function taskRow(target: EventTarget | null, root: HTMLDivElement) {
  const row =
    target instanceof Element ? target.closest<HTMLElement>(rowSelector) : null
  return row && root.contains(row) ? row : null
}

function rowsIn(root: HTMLDivElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(rowSelector))
}

function rowID(row: HTMLElement) {
  return row.dataset.selectableTask!
}

export function useTaskSelection(scope: string, disabled: boolean) {
  const [state, setState] = useState<Selection | null>(null)
  const [dragScope, setDragScope] = useState<string | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const scrollFrame = useRef(0)
  const touchTimer = useRef<number | undefined>(undefined)
  const ignoreClick = useRef(false)
  const selection = state?.scope === scope ? state : null
  if (state && !selection) setState(null)

  const stopDrag = useCallback(() => {
    const active = gesture.current
    gesture.current = null
    cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = 0
    window.clearTimeout(touchTimer.current)
    if (active?.root.hasPointerCapture(active.pointer))
      active.root.releasePointerCapture(active.pointer)
    if (active?.end) setDragScope(null)
  }, [])

  useEffect(() => {
    // A press that has yet to become a drag can end outside the task list.
    function onPointerEnd(event: globalThis.PointerEvent) {
      if (gesture.current?.pointer === event.pointerId) stopDrag()
    }
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    return () => {
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      stopDrag()
    }
  }, [scope, disabled, stopDrag])

  function save(ids: string[], anchor: string | null) {
    setState({ scope, ids, anchor })
  }

  function range(root: HTMLDivElement, start: string, end: string) {
    const ids = rowsIn(root).map(rowID)
    const first = ids.indexOf(start)
    const last = ids.indexOf(end)
    return first < 0 || last < 0
      ? [end]
      : ids.slice(Math.min(first, last), Math.max(first, last) + 1)
  }

  function extend(root: HTMLDivElement, start: string, end: string) {
    const ids = range(root, start, end)
    save(ids, ids.includes(start) ? start : end)
  }

  function toggle(id: string) {
    const selected = selection?.ids ?? []
    save(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
      id,
    )
  }

  function clear() {
    stopDrag()
    setState(null)
  }

  function updateDrag(active: Gesture) {
    const row = taskRow(
      document.elementFromPoint(active.x, active.y),
      active.root,
    )
    if (!row || rowID(row) === active.end) return
    active.end = rowID(row)
    extend(active.root, active.start, active.end)
  }

  function scrollWhileDragging() {
    scrollFrame.current = 0
    const active = gesture.current
    if (!active?.end) return
    const above = active.y - scrollEdge
    const below = active.y - (window.innerHeight - scrollEdge)
    const speed =
      Math.max(-scrollEdge, Math.min(above, 0)) +
      Math.min(scrollEdge, Math.max(below, 0))
    if (!speed) return
    const before = window.scrollY
    window.scrollBy(0, speed / 3)
    updateDrag(active)
    if (window.scrollY !== before)
      scrollFrame.current = requestAnimationFrame(scrollWhileDragging)
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointer === event.pointerId) stopDrag()
  }

  return {
    ids: selection?.ids ?? [],
    clear,
    selectAll: (ids: string[]) => save(ids, null),
    handlers: {
      'data-drag-selecting': dragScope === scope && !disabled ? '' : undefined,
      onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
        if (!event.isPrimary || event.button !== 0) return
        ignoreClick.current = false
        const row = taskRow(event.target, event.currentTarget)
        if (disabled || !row || !(event.target instanceof Element)) return
        const control = event.target.closest(rowControls)
        const title =
          control instanceof HTMLInputElement && control.matches('.todo-title')
            ? control
            : null
        if (control && !title) return
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          event.preventDefault()
          return
        }
        const touch = event.pointerType === 'touch'
        const startedInEditor = !!title && title === document.activeElement
        if (touch && startedInEditor) return
        gesture.current = {
          pointer: event.pointerId,
          root: event.currentTarget,
          row,
          start: rowID(row),
          end: null,
          startedInEditor,
          touch,
          x: event.clientX,
          y: event.clientY,
        }
        if (touch) {
          touchTimer.current = window.setTimeout(() => {
            ignoreClick.current = true
            toggle(rowID(row))
            row.focus({ preventScroll: true })
          }, touchHold)
        }
      },
      onPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
        const active = gesture.current
        if (!active || active.pointer !== event.pointerId) return
        if (active.touch) {
          if (
            Math.hypot(event.clientX - active.x, event.clientY - active.y) >=
            selectThreshold
          )
            stopDrag()
          return
        }
        if (disabled || !(event.buttons & 1)) {
          finishPointer(event)
          return
        }
        if (!active.end) {
          if (Math.abs(event.clientY - active.y) < selectThreshold) return
          if (active.startedInEditor) {
            const { top, bottom } = active.row.getBoundingClientRect()
            if (event.clientY >= top && event.clientY < bottom) return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          active.end = active.start
          ignoreClick.current = true
          active.row.focus({ preventScroll: true })
          window.getSelection()?.removeAllRanges()
          setDragScope(scope)
          save([active.start], active.start)
        }
        event.preventDefault()
        active.x = event.clientX
        active.y = event.clientY
        updateDrag(active)
        if (!scrollFrame.current)
          scrollFrame.current = requestAnimationFrame(scrollWhileDragging)
      },
      onPointerUpCapture: finishPointer,
      onPointerCancelCapture: finishPointer,
      onLostPointerCapture: finishPointer,
      onContextMenuCapture(event: MouseEvent<HTMLDivElement>) {
        if (gesture.current?.touch) event.preventDefault()
      },
      onMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
        // Touch release can dispatch a compatibility mousedown that focuses the title.
        if (ignoreClick.current) event.preventDefault()
      },
      onClickCapture(event: MouseEvent<HTMLDivElement>) {
        if (ignoreClick.current && event.detail > 0) {
          ignoreClick.current = false
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const row = taskRow(event.target, event.currentTarget)
        if (disabled || !row || !(event.target instanceof Element)) return
        const id = rowID(row)
        const control = event.target.closest(rowControls)
        if (control && !control.matches('.todo-title')) return
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          event.preventDefault()
          event.stopPropagation()
          if (event.shiftKey)
            extend(event.currentTarget, selection?.anchor ?? id, id)
          else toggle(id)
          row.focus({ preventScroll: true })
          return
        }
        if (control) save(selection?.ids ?? [], id)
        else if (
          event.nativeEvent instanceof PointerEvent &&
          event.nativeEvent.pointerType === 'touch'
        )
          toggle(id)
        else save([id], id)
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (disabled || event.defaultPrevented || event.nativeEvent.isComposing)
          return
        const row = taskRow(event.target, event.currentTarget)
        if (
          event.key === 'Escape' &&
          selection?.ids.length &&
          !(
            event.target instanceof Element &&
            event.target.closest('input, textarea, select, [role="dialog"]')
          )
        ) {
          event.preventDefault()
          clear()
        }
        if (!row || event.target !== row) return
        const id = rowID(row)
        if (event.key === ' ') {
          event.preventDefault()
          toggle(id)
        } else if (
          event.shiftKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          event.preventDefault()
          const rows = rowsIn(event.currentTarget)
          const next =
            rows[rows.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1)]
          if (next) {
            extend(event.currentTarget, selection?.anchor ?? id, rowID(next))
            next.focus()
          }
        }
      },
    },
  }
}
