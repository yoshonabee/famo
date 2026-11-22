import { useLayoutEffect, type RefObject } from 'react'

export function usePopupPosition(
  popupRef: RefObject<HTMLDivElement | null>,
  anchor: HTMLButtonElement | null,
  align: 'start' | 'end',
) {
  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!popup || !anchor) return

    function place() {
      if (!popup || !anchor) return
      const bounds = anchor.getBoundingClientRect()
      const { offsetWidth: width, offsetHeight: height } = popup
      const below = bounds.bottom + 8
      const above = bounds.top - height - 8
      const top =
        below + height > window.innerHeight - 12 && above >= 12 ? above : below
      popup.style.top = `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px`
      const left = align === 'start' ? bounds.left : bounds.right - width
      popup.style.left = `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`
    }

    place()
    const observer = new ResizeObserver(place)
    observer.observe(popup)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [align, anchor, popupRef])
}
