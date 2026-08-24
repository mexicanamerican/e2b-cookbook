import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { artifactKind, declaredSize } from '@/lib/protocol'

// Extension → shiki language for the code-block preview. Anything missing
// falls back to a plain "text" block — still gets the header + copy chrome.
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  json: 'json',
  jsonl: 'json',
  html: 'html',
  css: 'css',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  rb: 'ruby',
  php: 'php',
  xml: 'xml',
  swift: 'swift',
  kt: 'kotlin',
}

/**
 * A page shown at the size it declares, scaled down to fit the pane.
 *
 * The markup rides in a `srcdoc` with a `<base>` pointing at the sandbox's own
 * server, rather than the frame simply navigating to that server. The files are
 * named after IAB slots — `300x250.html`, `160x600.html` — and every filter list
 * carries generic rules for exactly those strings (`/160x600.` is EasyList, verbatim),
 * so a blocker aborts the subdocument and the preview goes grey while the same URL
 * opened in a tab is fine, because filter lists match subdocuments, not top-level
 * navigations. `about:srcdoc` gives them no URL to match. The `<base>` keeps what
 * the old comment here was right to worry about: `hero-cut.png` and the gallery's
 * nested frames still resolve against a real origin.
 *
 * Scaling is a transform on a fixed-size frame, so the page still lays out at its
 * true trafficking width — a 728x90 leaderboard is not reflowed into a narrow
 * column, it is shown smaller.
 */
/** Tallest a preview gets before it is scaled down instead of scrolled past. */
const MAX_PREVIEW_HEIGHT = 460
/** A small ad is worth enlarging, but not to the point of visible softness. */
const MAX_UPSCALE = 2

const HEAD_OPEN = /<head[^>]*>/i
const HTML_OPEN = /<html[^>]*>/i

/**
 * Point relative URLs at the sandbox host. Inserted as early in `<head>` as the
 * markup allows, because a `<base>` only governs the references that follow it.
 */
function withBase(markup: string, baseHref: string): string {
  const tag = `<base href="${baseHref}">`
  const head = markup.match(HEAD_OPEN)
  if (head?.index !== undefined) {
    const at = head.index + head[0].length
    return markup.slice(0, at) + tag + markup.slice(at)
  }
  // No <head> to land in: after <html> if there is one, otherwise the very top.
  const html = markup.match(HTML_OPEN)
  if (html?.index !== undefined) {
    const at = html.index + html[0].length
    return markup.slice(0, at) + tag + markup.slice(at)
  }
  return tag + markup
}

function PageFrame({
  markup,
  baseHref,
  width,
  height,
}: {
  markup: string
  baseHref: string
  width: number
  height: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const element = box.current
    if (!element) return
    // Fit both axes, and allow scaling *up*: capping at 1 left a 300x250 sitting
    // at native size in a much wider pane while a 1200x628 filled it, which reads
    // as the small sizes being broken rather than merely small.
    const fit = () => {
      const available = element.clientWidth
      if (available === 0) return
      setScale(Math.min(MAX_UPSCALE, available / width, MAX_PREVIEW_HEIGHT / height))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [width, height])

  return (
    <div ref={box} style={{ height: height * scale, overflow: 'hidden' }}>
      <iframe
        className="border border-stroke bg-white"
        height={height}
        // This markup was written by a model from a brief the user pasted, so it
        // is untrusted by construction. `allow-scripts` lets a design animate;
        // everything else stays off — no allow-same-origin (the frame keeps an
        // opaque origin and cannot touch storage on the sandbox host), and no
        // top-navigation, so the page cannot redirect the workbench out from
        // under the user. Webfonts still load: fonts.gstatic.com answers a null
        // origin with `access-control-allow-origin: *`, verified.
        sandbox="allow-scripts"
        srcDoc={withBase(markup, baseHref)}
        style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        title={baseHref}
        width={width}
      />
    </div>
  )
}

const BACKTICK_RUN = /`+/g

/** Wrap raw file content in a markdown fence long enough that backtick runs
 * inside the file can't terminate it early. */
function fenced(content: string, language: string): string {
  let longest = 0
  for (const run of content.match(BACKTICK_RUN) ?? []) {
    longest = Math.max(longest, run.length)
  }
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${content}\n${fence}`
}

export function FilePreview({
  path,
  content,
  encoding,
  mime,
  loading,
  error,
  servedUrl,
}: {
  path: string
  content: string | undefined
  encoding?: 'utf-8' | 'base64'
  mime?: string
  loading: boolean
  error: unknown
  /** Where the sandbox serves this file, if it serves it at all. */
  servedUrl?: string | null
}) {
  // A page defaults to being shown, not read. The toggle is still there,
  // because the CSS the agent wrote is half of what there is to look at.
  const [asSource, setAsSource] = useState(false)
  if (loading) {
    return (
      <div className="space-y-2 px-3 pb-3 pt-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="px-3 pb-3 pt-6 font-mono text-[11px] text-accent-error-highlight">
        {error instanceof Error ? error.message : 'Could not load the file.'}
      </p>
    )
  }
  const name = path.split('/').pop() ?? path
  const isPage = artifactKind(name) === 'html'

  // The frame renders the bytes we already read, so the preview needs both the
  // content and a served URL: one to show, one to resolve `hero-cut.png` against.
  if (isPage && servedUrl && content !== undefined && encoding !== 'base64' && !asSource) {
    const size = declaredSize(name) ?? { width: 1200, height: 800 }
    const baseHref = servedUrl.slice(0, servedUrl.lastIndexOf('/') + 1)
    return (
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-fg-tertiary">
            {size.width}×{size.height}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="border border-stroke bg-bg-1 px-2 py-0.5 font-mono text-[10px] text-fg-tertiary transition-colors hover:border-stroke-active hover:text-fg"
              onClick={() => setAsSource(true)}
              type="button"
            >
              source
            </button>
            <a
              className="border border-stroke bg-bg-1 px-2 py-0.5 font-mono text-[10px] text-fg-tertiary transition-colors hover:border-stroke-active hover:text-fg"
              href={servedUrl}
              rel="noreferrer"
              target="_blank"
            >
              open ↗
            </a>
          </div>
        </div>
        <PageFrame baseHref={baseHref} height={size.height} markup={content} width={size.width} />
      </div>
    )
  }

  // Images and videos arrive base64 in the JSON envelope (the API is
  // header-authed, so an <img>/<video> src pointing at the endpoint can't
  // work) — render a data URI.
  if (encoding === 'base64' && mime && content !== undefined) {
    const src = `data:${mime};base64,${content}`
    return (
      // p-3 matches the pane header's px-3, so media lines up with the
      // path label and back button above.
      <div className="p-3">
        {mime.startsWith('video/') ? (
          <video
            className="max-w-full border border-stroke"
            controls
            src={src}
          />
        ) : (
          <img
            alt="Workspace file preview"
            className="max-w-full border border-stroke"
            src={src}
          />
        )}
      </div>
    )
  }
  if (content === undefined) return null
  // Text files get the transcript's markdown treatment: .md renders as
  // markdown, everything else as a shiki-highlighted code block with the
  // same header/copy/download chrome as streamed replies.
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  const isMarkdown = extension === 'md' || extension === 'markdown'
  return (
    // p-3 matches the pane header's px-3, so the code block's left edge
    // lines up with the path label and back button above.
    <div className="p-3 text-[13px] leading-[1.65]">
      {isPage && servedUrl && (
        <button
          className="mb-2 border border-stroke bg-bg-1 px-2 py-0.5 font-mono text-[10px] text-fg-tertiary transition-colors hover:border-stroke-active hover:text-fg"
          onClick={() => setAsSource(false)}
          type="button"
        >
          ← preview
        </button>
      )}
      <Markdown>
        {isMarkdown
          ? content
          : fenced(content, LANGUAGE_BY_EXTENSION[extension] ?? 'text')}
      </Markdown>
    </div>
  )
}
