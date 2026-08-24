// Persisted width and open state for the two side panels — runs on the left,
// artefacts on the right. Module-scope store so the panels and their rails stay
// in sync without a context provider.
import { useSyncExternalStore } from 'react'

export type PanelSide = 'left' | 'right'

const key = (side: PanelSide, what: 'open' | 'width') => `creative.panel.${side}.${what}`

const DEFAULT_WIDTH: Record<PanelSide, string> = {
  left: '15.5rem',
  right: '26rem',
}

/** localStorage throws in private windows; a panel default is never worth a crash. */
function stored(side: PanelSide, what: 'open' | 'width'): string | null {
  try {
    return localStorage.getItem(key(side, what))
  } catch {
    return null
  }
}

function persist(side: PanelSide, what: 'open' | 'width', value: string): void {
  try {
    localStorage.setItem(key(side, what), value)
  } catch {
    // Ignored — layout preference, not data.
  }
}

type PanelState = { open: boolean; width: string }

const state: Record<PanelSide, PanelState> = {
  left: {
    open: stored('left', 'open') !== 'closed',
    width: stored('left', 'width') ?? DEFAULT_WIDTH.left,
  },
  right: {
    open: stored('right', 'open') !== 'closed',
    width: stored('right', 'width') ?? DEFAULT_WIDTH.right,
  },
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function usePanel(side: PanelSide): PanelState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state[side],
  )
}

export function setPanelWidth(side: PanelSide, px: number): void {
  const width = `${px}px`
  state[side] = { open: true, width }
  persist(side, 'width', width)
  persist(side, 'open', 'open')
  notify()
}

export function setPanelOpen(side: PanelSide, open: boolean): void {
  state[side] = { ...state[side], open }
  persist(side, 'open', open ? 'open' : 'closed')
  notify()
}

export function togglePanel(side: PanelSide): void {
  setPanelOpen(side, !state[side].open)
}

// Height of the file list inside the right panel; the preview takes the rest.
const LIST_KEY = 'creative.panel.right.listHeight'
const DEFAULT_LIST_HEIGHT = '14rem'
const MIN_LIST_PX = 72
const MAX_LIST_FRACTION = 0.7

let listHeight = (() => {
  try {
    return localStorage.getItem(LIST_KEY) ?? DEFAULT_LIST_HEIGHT
  } catch {
    return DEFAULT_LIST_HEIGHT
  }
})()

export function useListHeight(): string {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => listHeight,
  )
}

export function clampListHeight(px: number): number {
  return Math.min(Math.max(px, MIN_LIST_PX), window.innerHeight * MAX_LIST_FRACTION)
}

export function setListHeight(px: number): void {
  listHeight = `${clampListHeight(px)}px`
  try {
    localStorage.setItem(LIST_KEY, listHeight)
  } catch {
    // Layout preference only.
  }
  notify()
}
