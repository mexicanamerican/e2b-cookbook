// Empty-state cards. The first one is the real ad-set brief, served by the API so
// the card and the run can never drift; the rest are one-liners on the same box.
const EXTRAS = [
  'Show me what ImageMagick and Python are available in this sandbox',
  'Re-render the leaderboard with the headline one size larger',
  'Print the brand audit again and explain any rule that is close to failing',
]

export function SuggestedActions({
  onPick,
  disabled,
  prompt,
  brand,
  sizes,
}: {
  onPick: (suggestion: string, label?: string) => void
  disabled?: boolean
  prompt: string
  brand?: string
  sizes?: number
}) {
  const cards: { label: string; text: string }[] = [
    {
      // Named by the API, like the prompt beside it — the brief is the only
      // place a product name is written down.
      label: `Produce the ${brand ?? 'ad'} ad set — ${sizes ?? 'every'} sizes, brand audit, gallery`,
      text: prompt,
    },
    ...EXTRAS.map(text => ({ label: text, text })),
  ]
  return (
    <div className="no-scrollbar flex w-full gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible">
      {cards.map((card, index) => (
        <button
          className="fade-up min-w-[200px] shrink-0 whitespace-nowrap border border-stroke bg-bg-1 px-4 py-3 text-left text-[12px] text-fg-tertiary leading-relaxed transition-all duration-200 hover:border-stroke-active hover:bg-bg-highlight hover:text-fg disabled:pointer-events-none disabled:opacity-50 sm:min-w-0 sm:shrink sm:whitespace-normal sm:p-4 sm:text-[13px]"
          disabled={disabled || card.text.length === 0}
          data-testid={`suggestion-${index}`}
          key={card.label}
          onClick={() => onPick(card.text, card.label)}
          style={{ animationDelay: `${index * 60}ms` }}
          type="button"
        >
          {card.label}
        </button>
      ))}
    </div>
  )
}
