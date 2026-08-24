import { useEffect, useRef, useState } from 'react'
import { ArtifactThumb } from '@/components/artifact-thumb'
import { Markdown } from '@/components/markdown'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import type { WorkbenchMessage } from '@/lib/protocol'

/** Shell command as its own row: mono, one line, click to copy. */
function CommandRow({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      className="group flex w-full min-w-0 items-start gap-2 overflow-x-auto border border-stroke bg-bg-1 px-2.5 py-1.5 text-left font-mono text-[11.5px] text-fg-secondary transition-colors hover:border-stroke-active hover:bg-bg-highlight"
      onClick={() => {
        navigator.clipboard.writeText(command).then(() => {
          setCopied(true)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      title="Copy"
      type="button"
    >
      <span className="select-none text-fg-tertiary">$</span>
      <span className="whitespace-pre">{command}</span>
      <span className="ml-auto shrink-0 select-none pl-2 text-[10px] text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  )
}

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|[\s|:-]+\|\s*$/

/**
 * Split a log into pipe-table blocks and everything else. The brand audit
 * prints its verdict as a table, and a table squeezed into a monospace scroll
 * box is the one thing in the run a reader actually has to parse — so it gets
 * rendered as a table and the surrounding chatter stays a log.
 */
function segment(text: string): { at: number; table: boolean; lines: string[] }[] {
  const blocks: { at: number; table: boolean; lines: string[] }[] = []
  text.split('\n').forEach((line, at) => {
    const table = TABLE_ROW.test(line)
    const last = blocks.at(-1)
    if (last && last.table === table) last.lines.push(line)
    else blocks.push({ at, table, lines: [line] })
  })
  // A single piped line is a coincidence, not a table.
  return blocks.map(block =>
    block.table && block.lines.length < 2 ? { ...block, table: false } : block,
  )
}

/** Markdown needs the separator row; a plain printed table often lacks one. */
function asMarkdownTable(lines: string[]): string {
  if (lines.length > 1 && TABLE_RULE.test(lines[1]!)) return lines.join('\n')
  const columns = lines[0]!.trim().replace(/^\||\|$/g, '').split('|').length
  const rule = `|${' --- |'.repeat(columns)}`
  return [lines[0], rule, ...lines.slice(1)].join('\n')
}

function Log({ lines }: { lines: string[] }) {
  const text = lines.join('\n').trim()
  if (!text) return null
  return (
    <pre className="max-h-64 overflow-auto border border-stroke border-l-2 border-l-fill-highlight bg-bg px-2.5 py-1.5 font-mono text-[11px] text-fg-tertiary leading-[1.6]">
      {text}
    </pre>
  )
}

function Output({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <div className="mt-1 space-y-1">
      {segment(text.trimEnd()).map(block =>
        block.table ? (
          <Markdown className="overflow-x-auto text-[11.5px]" key={block.at}>
            {asMarkdownTable(block.lines)}
          </Markdown>
        ) : (
          <Log key={block.at} lines={block.lines} />
        ),
      )}
    </div>
  )
}

type ToolPart = {
  type: string
  toolName?: string
  input?: unknown
  output?: unknown
  state?: string
}

/** Typed harness tools carry their name in the part type (`tool-bash`); only
 *  dynamic tools carry a separate `toolName`. */
function toolNameOf(part: ToolPart): string {
  if (part.type === 'dynamic-tool') return part.toolName ?? 'tool'
  return part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : part.type
}

function pick(value: unknown, key: string): string | undefined {
  if (value && typeof value === 'object' && key in value) {
    const found = (value as Record<string, unknown>)[key]
    if (typeof found === 'string') return found
    if (typeof found === 'number') return String(found)
  }
  return undefined
}

/** One harness tool call. `bash` gets the command row; everything else a label. */
function ToolRow({ part }: { part: ToolPart }) {
  const name = toolNameOf(part)
  const command = pick(part.input, 'command')
  const path = pick(part.input, 'file_path') ?? pick(part.input, 'path')
  const stdout = pick(part.output, 'stdout') ?? ''
  const stderr = pick(part.output, 'stderr') ?? ''
  const running = part.state !== undefined && !part.state.startsWith('output')

  return (
    <div className="fade-up space-y-1">
      <div className="flex items-center gap-2 text-[11px] text-fg-tertiary">
        <span className="border border-stroke bg-bg-1 px-1.5 py-0.5 font-mono uppercase tracking-wide">
          {name}
        </span>
        {path && <span className="truncate font-mono">{path}</span>}
        {running && <Loader size="sm" className="text-fg-tertiary" />}
      </div>
      {command ? <CommandRow command={command} /> : null}
      <Output text={[stdout, stderr].filter(Boolean).join('\n')} />
    </div>
  )
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div
      className="fade-up border border-accent-error-highlight/40 bg-accent-error-bg px-3 py-2.5"
      data-testid="run-error"
    >
      <p className="text-[11px] text-accent-error-highlight uppercase tracking-wide">
        Run stopped
      </p>
      <p className="mt-1 text-body text-fg">{text}</p>
    </div>
  )
}

export function Transcript({
  messages,
  status,
  error,
  chatId,
  readable,
}: {
  messages: WorkbenchMessage[]
  status: string
  error: Error | undefined
  chatId: string
  /** False once the run's sandbox has gone — thumbnails would 404. */
  readable: boolean
}) {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  const thinking = status === 'submitted'

  return (
    <div className="min-w-0 space-y-6" data-testid="transcript">
      {messages.map(message => (
        <div
          className={cn(
            'min-w-0 space-y-2.5',
            message.role === 'user' && 'flex justify-end',
          )}
          key={message.id}
        >
          {message.role === 'user' ? (
            <div className="max-w-[85%] whitespace-pre-wrap border border-stroke bg-bg-1 px-3.5 py-2.5 text-body text-fg">
              {message.parts
                .filter(part => part.type === 'text')
                .map(part => part.text)
                .join('')}
            </div>
          ) : (
            message.parts.map((part, index) => {
              const key = `${message.id}-${index}`
              if (part.type === 'text') {
                return (
                  <Markdown className="text-body text-fg" key={key}>
                    {part.text}
                  </Markdown>
                )
              }
              if (part.type === 'data-artifact') {
                return (
                  <ArtifactThumb
                    artifact={part.data}
                    chatId={chatId}
                    key={key}
                    readable={readable}
                  />
                )
              }
              if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                return <ToolRow key={key} part={part as ToolPart} />
              }
              return null
            })
          )}
        </div>
      ))}

      {thinking && (
        <div className="flex items-center gap-2 text-[12px] text-fg-tertiary">
          <Loader size="sm" />
          <span>sandbox up — generating the campaign asset…</span>
        </div>
      )}
      {error && <ErrorRow text={error.message} />}
      <div ref={bottom} />
    </div>
  )
}
