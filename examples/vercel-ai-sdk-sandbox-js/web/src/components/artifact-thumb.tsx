import { Loader } from '@/components/ui/loader'
import { useSandboxFile } from '@/lib/queries'
import type { Artifact } from '@/lib/protocol'

/**
 * An artefact as it lands in the transcript. Images render as a real thumbnail
 * — the ad set is the point of the run, so the chat should show it, not just
 * name it. Click opens the full-size image in a new tab.
 */
export function ArtifactThumb({
  artifact,
  chatId,
  query,
  readable,
}: {
  artifact: Artifact
  chatId: string
  query: string
  readable: boolean
}) {
  const isImage = artifact.kind === 'image'
  // Keyed on the announced size: the watcher announces a variant the moment it
  // appears, which can be mid-write, and the finished file is a new read.
  const { data: body, isPending } = useSandboxFile(
    chatId,
    artifact.path,
    query,
    isImage && readable,
    artifact.bytes,
  )
  const loading = isImage && readable && isPending

  if (!isImage) {
    return (
      <p className="fade-up font-mono text-[11px] text-fg-tertiary">↳ {artifact.name}</p>
    )
  }

  const src = body?.encoding === 'base64' ? `data:${body.mime};base64,${body.content}` : null

  return (
    <figure className="fade-up m-0 inline-flex flex-col gap-1">
      {src ? (
        <a href={src} rel="noreferrer" target="_blank" title={`Open ${artifact.name}`}>
          <img
            alt={artifact.name}
            className="max-h-40 max-w-full border border-stroke transition-colors hover:border-stroke-active"
            src={src}
          />
        </a>
      ) : (
        <span className="flex h-20 w-40 items-center justify-center border border-stroke bg-bg-1">
          {loading ? <Loader size="sm" /> : <span className="text-[10px] text-fg-tertiary">no preview</span>}
        </span>
      )}
      <figcaption className="font-mono text-[10.5px] text-fg-tertiary">
        {artifact.name}
      </figcaption>
    </figure>
  )
}
