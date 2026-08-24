import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useState } from 'react'
import { useGallery, useHealth, useLiveRuns } from '@/lib/queries'
import { AppSidebar } from '@/components/app-sidebar'
import { Composer } from '@/components/composer'
import { FilePane } from '@/components/file-pane'
import { PanelRail } from '@/components/panel-rail'
import { PanelTrigger } from '@/components/panel-trigger'
import { ThemeToggle } from '@/components/theme-toggle'
import { Transcript } from '@/components/transcript'
import { Greeting } from '@/components/chat/greeting'
import { SuggestedActions } from '@/components/chat/suggested-actions'
import type { Artifact, WorkbenchMessage } from '@/lib/protocol'
import {
  createRun,
  deleteRun,
  listRuns,
  loadMessages,
  saveMessages,
  titleRun,
  type RunSummary,
} from '@/lib/runs'

/** `?fixture=happy&pace=400` replays a turn with no sandbox and no tokens. */
function fixtureQuery(): string {
  const page = new URLSearchParams(window.location.search)
  const passed = new URLSearchParams()
  for (const key of ['fixture', 'pace']) {
    const value = page.get(key)
    if (value) passed.set(key, value)
  }
  const query = passed.toString()
  return query ? `&${query}` : ''
}

/** One run: its own chat id, its own sandbox, its own transcript. */
function ChatSurface({
  runId,
  title,
  query,
  prompt,
  live,
  onFirstPrompt,
}: {
  runId: string
  title: string
  query: string
  prompt: string
  live: boolean
  onFirstPrompt: (text: string) => void
}) {
  const [apiDown, setApiDown] = useState(false)

  const { messages, sendMessage, status, error } = useChat<WorkbenchMessage>({
    id: runId,
    messages: loadMessages(runId),
    transport: new DefaultChatTransport({ api: `/api/chat?${query.slice(1)}` }),
  })

  // History survives a reload and a run switch; the server keeps none of it.
  useEffect(() => {
    if (messages.length > 0) saveMessages(runId, messages)
  }, [runId, messages])

  const artifacts = useMemo<Artifact[]>(() => {
    const byPath = new Map<string, Artifact>()
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === 'data-artifact') byPath.set(part.data.path, part.data)
      }
    }
    return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [messages])

  // The gallery only exists once the agent has served it, so ask when a turn
  // has settled and something came out of it.
  const { data: gallery } = useGallery(runId, query, status === 'ready' && artifacts.length > 0)

  // A dead API surfaces in useChat as a bare "An error occurred." — say what it
  // actually is, since the fix is a command rather than a retry.
  useEffect(() => {
    if (!error) return
    fetch('/api/health')
      .then(response => setApiDown(!response.ok))
      .catch(() => setApiDown(true))
  }, [error])

  const busy = status === 'submitted' || status === 'streaming'
  const started = messages.length > 0
  // Fixture mode serves files from disk, so artefacts are readable without a
  // live sandbox; a real run needs its sandbox still standing.
  const readable = live || query.length > 0

  // A suggestion names the run after its card; typed prompts name it after
  // themselves. Either way the sidebar reads like a list of jobs, not of blobs.
  const send = (text: string, label?: string) => {
    if (!started) onFirstPrompt(label ?? text)
    sendMessage({ text })
  }

  return (
    <main className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-stroke px-3">
          <div className="flex min-w-0 items-center gap-2">
            <PanelTrigger side="left" />
            <span className="min-w-0 truncate text-body text-fg" title={runId}>
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {query && (
              <span className="border border-stroke bg-bg-1 px-1.5 py-0.5 font-mono text-[10px] text-fg-tertiary">
                fixture
              </span>
            )}
            {gallery && (
              <a
                className="border border-stroke bg-bg-1 px-2.5 py-1 text-[11.5px] text-fg-secondary transition-colors hover:border-stroke-active hover:text-fg"
                href={gallery}
                rel="noreferrer"
                target="_blank"
              >
                open gallery ↗
              </a>
            )}
            <ThemeToggle />
            <PanelTrigger side="right" />
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
          <div className="mx-auto w-full max-w-[720px]">
            {started ? (
              <Transcript
                chatId={runId}
                error={
                  apiDown
                    ? new Error(
                        'The API is not running. Restart it with `npm run dev` in the web directory.',
                      )
                    : error
                }
                messages={messages}
                query={query}
                readable={readable}
                status={status}
              />
            ) : (
              <div className="flex min-h-full flex-col justify-center gap-8 py-10">
                <Greeting />
                <SuggestedActions disabled={busy || !prompt} onPick={send} prompt={prompt} />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-3">
          <div className="mx-auto w-full max-w-[720px]">
            <Composer
              busy={busy}
              onSend={send}
              placeholder="Ask for a change, or paste your own brief…"
            />
          </div>
        </div>
      </section>

      <PanelRail side="right" />
      <FilePane
        announced={artifacts}
        busy={busy}
        chatId={runId}
        live={readable}
        query={query}
      />
    </main>
  )
}

export function App() {
  const query = useMemo(fixtureQuery, [])
  const { data: health } = useHealth(query)
  const prompt = health?.prompt ?? ''
  const { data: liveIds = new Set<string>() } = useLiveRuns()
  const [runs, setRuns] = useState<RunSummary[]>(() => {
    const existing = listRuns()
    return existing.length > 0 ? existing : [createRun()]
  })
  const [activeId, setActiveId] = useState(() => runs[0]?.id ?? '')

  const create = () => {
    const run = createRun()
    setRuns(listRuns())
    setActiveId(run.id)
  }

  const remove = (id: string) => {
    const remaining = deleteRun(id)
    if (remaining.length === 0) {
      const fresh = createRun()
      setRuns(listRuns())
      setActiveId(fresh.id)
      return
    }
    setRuns(remaining)
    if (id === activeId) setActiveId(remaining[0]?.id ?? '')
  }

  return (
    <div className="flex h-dvh bg-bg text-fg">
      <AppSidebar
        activeId={activeId}
        liveIds={liveIds}
        onCreate={create}
        onDelete={remove}
        onSelect={setActiveId}
        runs={runs}
      />
      <PanelRail side="left" />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Keyed so switching runs remounts the chat with that run's history. */}
        <ChatSurface
          key={activeId}
          live={liveIds.has(activeId)}
          onFirstPrompt={text => setRuns(titleRun(activeId, text))}
          prompt={prompt}
          query={query}
          runId={activeId}
          title={runs.find(run => run.id === activeId)?.title ?? 'New run'}
        />
      </div>
    </div>
  )
}
