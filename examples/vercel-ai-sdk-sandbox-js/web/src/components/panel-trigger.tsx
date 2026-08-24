import { Button } from '@/components/ui/button'
import { togglePanel, usePanel, type PanelSide } from '@/lib/panels'
import { cn } from '@/lib/utils'

/** Figma `Icon/16px/Collapse Left` and `Expand Right`, drawn inline — this
 *  example carries no icon set. */
function CollapseLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 16 16">
      <path d="M7.49935 5.1665L4.66602 7.99984L7.49935 10.8332" stroke="currentColor" strokeLinecap="square" strokeWidth="1.33333" />
      <path d="M2 3.3335V12.6668" stroke="currentColor" strokeLinecap="square" strokeWidth="1.33333" />
      <path d="M14.0007 8H5.33398" stroke="currentColor" strokeLinecap="square" strokeWidth="1.33333" />
    </svg>
  )
}

function ExpandRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 16 16">
      <path d="M8.5 5.1665L11.3333 7.99984L8.5 10.8332" stroke="currentColor" strokeLinecap="square" strokeWidth="1.33333" />
      <path d="M14 3.3335V12.6668" stroke="currentColor" strokeLinecap="square" strokeWidth="1.33333" />
      <path d="M2 8H10.6667" stroke="currentColor" strokeLinecap="square" strokeWidth="1.33333" />
    </svg>
  )
}

/**
 * Header button toggling a panel. It reads the shared panels store, so it can
 * sit in the chat header while the panel it controls is a layout sibling —
 * and a panel dragged shut still has something visible to reopen it.
 */
export function PanelTrigger({ side }: { side: PanelSide }) {
  const panel = usePanel(side)
  const Icon = side === 'left' ? CollapseLeftIcon : ExpandRightIcon
  return (
    <Button
      aria-pressed={panel.open}
      data-testid={`panel-trigger-${side}`}
      onClick={() => togglePanel(side)}
      // icon-sm matches the theme toggle sharing this row.
      size="icon-sm"
      title={`${panel.open ? 'Hide' : 'Show'} the ${side === 'left' ? 'run list' : 'file pane'}`}
      type="button"
      variant="quaternary"
    >
      {/* The icon reads as the action: as drawn = collapse, flipped = expand. */}
      <Icon
        className={cn(
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          !panel.open && 'rotate-180',
        )}
      />
      <span className="sr-only">Toggle the {side} panel</span>
    </Button>
  )
}
