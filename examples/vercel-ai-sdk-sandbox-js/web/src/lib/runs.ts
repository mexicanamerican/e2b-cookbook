// Run history, kept in localStorage. Each run is its own chat id, which on the
// server means its own sandbox and its own harness session — so switching runs
// in the sidebar switches which sandbox you are looking at.
import type { WorkbenchMessage } from '@/lib/protocol'

export type RunSummary = {
  id: string
  title: string
  createdAt: number
}

const LIST_KEY = 'creative.runs'
const messagesKey = (id: string) => `creative.run.${id}.messages`
const MAX_TITLE = 52

/** localStorage throws in private windows and when storage is full. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do — history is a convenience, never load-bearing.
  }
}

export function listRuns(): RunSummary[] {
  return read<RunSummary[]>(LIST_KEY, []).sort((a, b) => b.createdAt - a.createdAt)
}

export function createRun(): RunSummary {
  const run: RunSummary = {
    id: `run-${Math.random().toString(36).slice(2, 10)}`,
    title: 'New run',
    createdAt: Date.now(),
  }
  write(LIST_KEY, [run, ...listRuns()])
  return run
}

/** Name a run after its first prompt, the way its transcript reads. */
export function titleRun(id: string, prompt: string): RunSummary[] {
  const trimmed = prompt.trim().replace(/\s+/g, ' ')
  const title =
    trimmed.length > MAX_TITLE ? `${trimmed.slice(0, MAX_TITLE - 1)}…` : trimmed || 'New run'
  const runs = listRuns().map(run => (run.id === id ? { ...run, title } : run))
  write(LIST_KEY, runs)
  return runs
}

export function deleteRun(id: string): RunSummary[] {
  const runs = listRuns().filter(run => run.id !== id)
  write(LIST_KEY, runs)
  try {
    localStorage.removeItem(messagesKey(id))
  } catch {
    // Same as above.
  }
  return runs
}

export function loadMessages(id: string): WorkbenchMessage[] {
  return read<WorkbenchMessage[]>(messagesKey(id), [])
}

export function saveMessages(id: string, messages: WorkbenchMessage[]): void {
  write(messagesKey(id), messages)
}

export function describeAge(createdAt: number): string {
  const seconds = Math.round((Date.now() - createdAt) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
