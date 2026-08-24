import { Button } from '@/components/ui/button'
import { usePanel } from '@/lib/panels'
import { cn } from '@/lib/utils'
import { describeAge, type RunSummary } from '@/lib/runs'

/**
 * Run history. Each row is a chat id, which on the server owns its own sandbox
 * and harness session — the dot marks the ones still alive in this dev server.
 *
 * Alignment contract: the New-run button is `h-12` so its bottom edge lines up
 * with the `h-12` headers on the chat pane and the file pane next door, and the
 * three top bars read as one strip. The project name lives in the footer; the
 * theme toggle lives in the chat pane's header.
 */
export function AppSidebar({
  runs,
  activeId,
  liveIds,
  onSelect,
  onCreate,
  onDelete,
}: {
  runs: RunSummary[]
  activeId: string
  liveIds: Set<string>
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}) {
  const panel = usePanel('left')
  if (!panel.open) return null
  return (
    <aside
      className="flex h-full shrink-0 flex-col bg-bg-1"
      data-testid="sidebar"
      style={{ width: panel.width }}
    >
      <Button
        className="h-12 w-full shrink-0 border-x-0 border-t-0"
        data-testid="new-run"
        onClick={onCreate}
        type="button"
        variant="secondary"
      >
        New run
      </Button>

      <nav className="min-h-0 flex-1 overflow-y-auto pt-6">
        {runs.length === 0 ? (
          <p className="px-2.5 py-1.5 text-[11.5px] text-fg-tertiary">No runs yet.</p>
        ) : (
          <ul>
            {runs.map(run => (
              <li className="group relative" key={run.id}>
                <button
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-2.5 py-2.5 pr-8 text-left transition-colors',
                    run.id === activeId
                      ? 'bg-bg-highlight text-fg'
                      : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
                  )}
                  data-testid={`run-${run.id}`}
                  onClick={() => onSelect(run.id)}
                  type="button"
                >
                  <span className="flex w-full items-center gap-1.5">
                    {liveIds.has(run.id) && (
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 bg-accent-positive-highlight"
                        title="sandbox running"
                      />
                    )}
                    <span className="truncate text-[12.5px]">{run.title}</span>
                  </span>
                  <span className="truncate text-[10.5px] text-fg-tertiary">
                    {describeAge(run.createdAt)}
                  </span>
                </button>
                <button
                  aria-label={`Delete ${run.title}`}
                  className="-translate-y-1/2 absolute top-1/2 right-1.5 px-1.5 py-1 text-[13px] text-fg-tertiary opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                  data-testid={`delete-${run.id}`}
                  onClick={() => onDelete(run.id)}
                  title="Delete this run"
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Footer: project name over the example it lives in. px-2.5 matches the
          run rows, so both left edges line up. */}
      <div className="flex w-fit min-w-0 max-w-full shrink-0 flex-col gap-1 px-2.5 pt-4 pb-[1.125rem]">
        <span className="truncate text-headline-small text-fg">Creative production</span>
        <span className="truncate font-mono text-label text-fg-tertiary">
          e2b · vercel-ai-sdk-sandbox-js
        </span>
      </div>
    </aside>
  )
}
