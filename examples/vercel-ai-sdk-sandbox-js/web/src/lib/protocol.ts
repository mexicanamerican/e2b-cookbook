// The one contract between the API and the page. Imported by both, so a change
// here is a type error on whichever side forgot about it.
import type { UIMessage } from 'ai'

/** A file the agent produced in the sandbox, announced as it appears. */
export type Artifact = {
  /** Absolute path inside the sandbox. */
  path: string
  /** Basename, for the file list. */
  name: string
  kind: 'image' | 'archive' | 'text'
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
  return 'text'
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
