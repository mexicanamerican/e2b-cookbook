import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const AUTO_GROW_MAX_FRACTION = 0.35

export function Composer({
  onSend,
  busy,
  placeholder,
}: {
  onSend: (text: string) => void
  busy: boolean
  placeholder: string
}) {
  const [value, setValue] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)

  // Grow with the text, up to a fraction of the viewport, then scroll.
  useLayoutEffect(() => {
    const node = textarea.current
    if (!node) return
    node.style.height = 'auto'
    const max = window.innerHeight * AUTO_GROW_MAX_FRACTION
    node.style.height = `${Math.min(node.scrollHeight, max)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
    setValue('')
  }

  return (
    <form
      className={cn(
        'flex flex-col border border-stroke bg-bg-1 transition-shadow',
        'focus-within:border-stroke-active',
      )}
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        className="max-h-[35vh] w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-body leading-relaxed text-fg outline-none placeholder:text-fg-tertiary"
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder}
        ref={textarea}
        rows={2}
        value={value}
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
        <span className="text-[11px] text-fg-tertiary">
          Enter to send · Shift+Enter for a newline
        </span>
        <Button disabled={busy || value.trim().length === 0} size="sm" type="submit">
          {busy ? '…' : '↑'}
        </Button>
      </div>
    </form>
  )
}
