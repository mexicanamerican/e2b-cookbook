import { code } from '@streamdown/code'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'

/** The app's one markdown setup, shared by assistant replies and file previews. */
export function Markdown({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    // Streaming-tolerant: an unterminated fence renders as a code block
    // mid-stream instead of leaking raw ``` into the transcript.
    <Streamdown
      className={cn('assistant-md min-w-0 space-y-3 break-words', className)}
      plugins={{ code }}
      shikiTheme={['github-light', 'github-dark']}
    >
      {children}
    </Streamdown>
  )
}
