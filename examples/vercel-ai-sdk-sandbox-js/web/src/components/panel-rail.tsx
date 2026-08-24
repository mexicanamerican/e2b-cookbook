import { railDragHandler } from '@/lib/rail-drag'
import { setPanelOpen, setPanelWidth, togglePanel, usePanel, type PanelSide } from '@/lib/panels'
import { cn } from '@/lib/utils'

/** The panel this rail resizes sits immediately before it (left) or after it (right). */
function panelOf(rail: HTMLElement, side: PanelSide): HTMLElement | null {
  const sibling = side === 'left' ? rail.previousElementSibling : rail.nextElementSibling
  return sibling instanceof HTMLElement ? sibling : null
}

/**
 * Draggable divider. Press and release in place toggles the panel; dragging
 * resizes it live by writing width straight to the element (no re-render per
 * pointer move), then commits on release.
 */
export function PanelRail({ side }: { side: PanelSide }) {
  const panel = usePanel(side)

  const onPointerDown = railDragHandler({
    side,
    onDragStart: rail => {
      if (!panel.open) setPanelOpen(side, true)
      const element = panelOf(rail, side)
      if (element) element.style.transition = 'none'
    },
    onLiveWidth: (px, rail) => {
      const element = panelOf(rail, side)
      if (element) element.style.width = `${px}px`
    },
    onDragEnd: rail => {
      const element = panelOf(rail, side)
      if (element) element.style.removeProperty('transition')
    },
    onCommit: px => setPanelWidth(side, px),
    onCollapse: () => setPanelOpen(side, false),
    onToggle: () => togglePanel(side),
  })

  return (
    <div
      aria-label={`Resize the ${side} panel`}
      aria-orientation="vertical"
      className={cn(
        // A 1px seam with a comfortable invisible grab area either side.
        'group relative w-px shrink-0 cursor-col-resize touch-none bg-stroke transition-colors',
        'after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-[""]',
        'hover:bg-stroke-active',
      )}
      data-testid={`rail-${side}`}
      onPointerDown={onPointerDown}
      role="separator"
      title={panel.open ? 'Drag to resize, click to hide' : 'Click to show'}
    />
  )
}
