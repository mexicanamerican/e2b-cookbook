import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePreview } from '@/components/file-preview'
import { SplitRail } from '@/components/split-rail'
import { Loader } from '@/components/ui/loader'
import { useListHeight, usePanel } from '@/lib/panels'
import { useDirectory, useSandboxFile } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { HOME_DIR, type Artifact, type Entry } from '@/lib/protocol'

const KIND_LABEL: Record<Artifact['kind'], string> = {
  image: 'png',
  archive: 'tar',
  text: 'txt',
}

function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const parentOf = (dir: string) => dir.slice(0, dir.lastIndexOf('/')) || '/'

/**
 * One row. Memoised on primitives, so selecting a file re-renders the row
 * losing the highlight and the row gaining it — not the whole listing.
 */
const FileRow = memo(function FileRow({
  entry,
  selected,
  onPick,
}: {
  entry: Entry
  selected: boolean
  onPick: (entry: Entry) => void
}) {
  return (
    <button
      className={cn(
        'fade-up flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11.5px] transition-colors',
        selected
          ? 'bg-bg-highlight text-fg'
          : 'text-fg-secondary hover:bg-bg-1 hover:text-fg',
      )}
      data-testid={`entry-${entry.name}`}
      onClick={() => onPick(entry)}
      type="button"
    >
      <span className="w-7 shrink-0 text-fg-tertiary">
        {entry.type === 'dir' ? 'dir' : KIND_LABEL[entry.kind]}
      </span>
      <span className="truncate">
        {entry.name}
        {entry.type === 'dir' ? '/' : ''}
      </span>
      <span className="ml-auto shrink-0 text-fg-tertiary">
        {entry.type === 'dir' ? '' : bytes(entry.bytes)}
      </span>
    </button>
  )
})

/**
 * The sandbox's filesystem, browsable. Directories walk down, the breadcrumb and
 * the `..` row walk back up, files preview below the split. Polled while a turn
 * is in flight so new renders appear on their own.
 */
export function FilePane({
  announced,
  chatId,
  query,
  busy,
  live,
}: {
  announced: Artifact[]
  chatId: string
  query: string
  busy: boolean
  /** Whether this run's files can still be read. */
  live: boolean
}) {
  const panel = usePanel('right')
  const listHeight = useListHeight()
  const [dir, setDir] = useState(HOME_DIR)
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // React Query owns the polling. Its structural sharing means a tick that
  // finds the directory unchanged hands back the very same objects, so the
  // list does not re-render between renders of the agent's work.
  const { data: entries = [] } = useDirectory(chatId, dir, query, busy)

  // History outlives the sandbox — a restart or the timeout leaves the file
  // names in the transcript with nothing behind them.
  const ended = !live && entries.length === 0 && announced.length > 0

  const rows = useMemo(() => {
    const byPath = new Map<string, Entry>()
    for (const entry of entries) byPath.set(entry.path, entry)
    // Anything the stream announced for this directory, in case a poll is due.
    for (const artifact of announced) {
      if (artifact.path.slice(0, artifact.path.lastIndexOf('/')) === dir) {
        byPath.set(artifact.path, { ...artifact, type: 'file' })
      }
    }
    return [...byPath.values()].sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
    )
  }, [entries, announced, dir])

  // Show the first image as it appears, upgrading to the contact sheet when it
  // lands. A manual pick, or walking to another directory, stops that.
  useEffect(() => {
    if (picked) return
    const sheet = rows.find(row => row.name === 'contact-sheet.png')
    const best = sheet ?? rows.find(row => row.type === 'file' && row.kind === 'image')
    if (best && best.path !== selected) setSelected(best.path)
  }, [rows, picked, selected])

  const revision = rows.find(row => row.path === selected)?.bytes ?? ''
  const { data: body, isPending, error } = useSandboxFile(chatId, selected, query, !ended, revision)
  const loading = selected !== null && isPending

  // A new file starts at its top. Without this the previous file's scroll
  // offset survives the swap and a shorter preview snaps back to zero on its
  // own — a jump the click never asked for.
  useEffect(() => {
    previewRef.current?.scrollTo({ top: 0 })
  }, [selected])

  // Stable identity, so the memoised rows are not invalidated every render.
  const pick = useCallback((entry: Entry) => {
    setPicked(true)
    if (entry.type === 'dir') {
      setDir(entry.path)
      setSelected(null)
    } else {
      setSelected(entry.path)
    }
  }, [])

  const crumbs = dir.split('/').filter(Boolean)
  const homeDepth = HOME_DIR.split('/').filter(Boolean).length

  if (!panel.open) return null
  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col bg-bg"
      data-testid="file-pane"
      style={{ width: panel.width }}
    >
      {/* h-12 matches the chat pane header and the sidebar button. */}
      <header className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-stroke px-3">
        {crumbs.map((crumb, index) => {
          const path = `/${crumbs.slice(0, index + 1).join('/')}`
          const isLast = index === crumbs.length - 1
          return (
            <span className="flex shrink-0 items-center gap-1" key={path}>
              {index > 0 && <span className="text-fg-tertiary">/</span>}
              <button
                className={cn(
                  'font-mono text-[11px] transition-colors',
                  isLast ? 'text-fg' : 'text-fg-tertiary hover:text-fg',
                  index < homeDepth - 1 && 'pointer-events-none',
                )}
                onClick={() => {
                  setDir(path)
                  setPicked(true)
                }}
                type="button"
              >
                {crumb}
              </button>
            </span>
          )
        })}
        <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-fg-tertiary">
          {rows.length || '—'}
        </span>
      </header>

      {ended && (
        <p
          className="shrink-0 border-b border-stroke bg-fill px-3 py-2 text-[11.5px] text-fg-tertiary"
          data-testid="sandbox-ended"
        >
          This run's sandbox has ended. The names in the transcript are all that is
          left — start a new run to produce readable files.
        </p>
      )}

      <div className="shrink-0 overflow-y-auto" style={{ height: listHeight }}>
        {dir !== HOME_DIR && (
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11.5px] text-fg-tertiary transition-colors hover:bg-bg-1 hover:text-fg"
            data-testid="go-up"
            onClick={() => {
              setDir(parentOf(dir))
              setPicked(true)
            }}
            type="button"
          >
            <span className="w-7 shrink-0">↑</span>
            <span>..</span>
          </button>
        )}
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-fg-tertiary">
            {live ? 'Empty.' : 'The sandbox opens with your first run.'}
          </p>
        ) : (
          <ul>
            {rows.map(row => (
              <li key={row.path}>
                <FileRow entry={row} onPick={pick} selected={selected === row.path} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <SplitRail />

      {/* The preview always says something: a void here reads as a broken pane. */}
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="file-preview" ref={previewRef}>
        {ended ? (
          <p className="px-3 py-4 text-[12px] text-fg-tertiary">
            No bytes to show — this run's sandbox is gone.
          </p>
        ) : selected === null ? (
          <p className="px-3 py-4 text-[12px] text-fg-tertiary">
            {rows.length === 0 ? 'Nothing to preview yet.' : 'Pick a file to preview it.'}
          </p>
        ) : loading && body === null ? (
          <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-fg-tertiary">
            <Loader size="sm" />
            <span>reading {selected.split('/').pop()}</span>
          </div>
        ) : (
          <FilePreview
            content={body?.content}
            encoding={body?.encoding}
            error={error}
            loading={false}
            mime={body?.mime}
            path={selected}
          />
        )}
      </div>
    </aside>
  )
}
