// The one contract between the API and the page. Imported by both, so a change
// here is a type error on whichever side forgot about it.
import type { UIMessage } from 'ai'

/** A file the agent produced in the sandbox, announced as it appears. */
export type Artifact = {
  /** Absolute path inside the sandbox. */
  path: string
  /** Basename, for the file list. */
  name: string
  kind: 'image' | 'archive' | 'html' | 'text'
  bytes: number
}

/**
 * Artifacts ride the message stream as `data-artifact` parts keyed by path, so
 * re-announcing a path replaces its part instead of appending a duplicate.
 */
export type WorkbenchMessage = UIMessage<never, { artifact: Artifact }>

/** One row in the sandbox file browser. */
export type Entry = {
  path: string
  name: string
  type: 'dir' | 'file'
  kind: Artifact['kind']
  bytes: number
}

/** The browsable root — the sandbox's own home directory. */
export const HOME_DIR = '/home/user'

/** Body of `GET /api/file`: sandbox bytes, base64 for anything not text. */
export type FileBody = {
  path: string
  mime: string
  encoding: 'utf-8' | 'base64'
  content: string
}

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'])
export const ARCHIVE_EXTENSIONS = new Set(['gz', 'tgz', 'zip', 'tar'])

export function artifactKind(name: string): Artifact['kind'] {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive'
  // A page is the deliverable in this example, not source to read, so it gets
  // its own kind and the preview renders it instead of highlighting it.
  if (extension === 'html' || extension === 'htm') return 'html'
  return 'text'
}

/**
 * Which kinds travel as base64 rather than UTF-8. Stated positively on purpose:
 * as `kind !== 'text'` this silently turned HTML into bytes the moment 'html'
 * became its own kind, and the page then rendered as a broken <img>.
 */
export function isBinaryKind(kind: Artifact['kind']): boolean {
  return kind === 'image' || kind === 'archive'
}

/** `300x250.html` → the size the page declares, for previewing it to scale. */
export function declaredSize(name: string): { width: number; height: number } | null {
  const match = name.match(/(\d{2,5})x(\d{2,5})/)
  if (!match?.[1] || !match[2]) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}

export function mimeFor(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const byExtension: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    gz: 'application/gzip',
    html: 'text/html',
    json: 'application/json',
    py: 'text/x-python',
    txt: 'text/plain',
  }
  return byExtension[extension] ?? 'text/plain'
}
