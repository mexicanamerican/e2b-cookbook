import type { PointerEvent as ReactPointerEvent } from 'react'
import { clampListHeight, setListHeight } from '@/lib/panels'

/**
 * Horizontal divider inside the right panel: drag to trade height between the
 * file list above and the preview below. The x-axis rails between panels are
 * `PanelRail`; this is the same gesture on the other axis.
 */
export function SplitRail() {
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const rail = event.currentTarget
    const list = rail.previousElementSibling
    if (!(list instanceof HTMLElement)) return
    const top = list.getBoundingClientRect().top
    rail.setPointerCapture(event.pointerId)
    list.style.transition = 'none'

    const onMove = (moved: globalThis.PointerEvent) => {
      list.style.height = `${clampListHeight(moved.clientY - top)}px`
    }
    const finish = (ended: globalThis.PointerEvent) => {
      rail.removeEventListener('pointermove', onMove)
      rail.removeEventListener('pointerup', finish)
      rail.removeEventListener('pointercancel', finish)
      list.style.removeProperty('transition')
      setListHeight(ended.clientY - top)
    }
    rail.addEventListener('pointermove', onMove)
    rail.addEventListener('pointerup', finish)
    rail.addEventListener('pointercancel', finish)
  }

  return (
    <div
      aria-label="Resize the file list"
      aria-orientation="horizontal"
      className='group relative h-px shrink-0 cursor-row-resize touch-none bg-stroke transition-colors after:absolute after:inset-x-0 after:-top-1.5 after:-bottom-1.5 after:content-[""] hover:bg-stroke-active'
      data-testid="rail-split"
      onPointerDown={onPointerDown}
      role="separator"
      title="Drag to resize the file list"
    />
  )
}
