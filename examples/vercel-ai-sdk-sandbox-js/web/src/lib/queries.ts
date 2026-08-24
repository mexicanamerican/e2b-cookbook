// Every read from the API. React Query owns the caching, the polling and the
// retries; the components just say what they want. Its structural sharing is
// what keeps a poll that returns an unchanged directory from re-rendering the
// file list — the previous objects are handed back by identity.
import { QueryClient, useQuery } from '@tanstack/react-query'
import type { Entry, FileBody } from '@/lib/protocol'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The sandbox is the source of truth and it changes on its own, so a
      // window refocus is not evidence of anything.
      refetchOnWindowFocus: false,
      retry: 1,
      retryDelay: 1500,
    },
  },
})

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'The request failed.')
  return json as T
}

const POLL_BUSY_MS = 1500
const POLL_IDLE_MS = 6000

/** One directory of the sandbox, polled faster while the agent is working. */
export function useDirectory(chatId: string, dir: string, busy: boolean) {
  return useQuery({
    queryKey: ['files', chatId, dir],
    queryFn: () =>
      get<{ entries?: Entry[]; gallery?: string | null }>(
        `/api/files?chatId=${encodeURIComponent(chatId)}&path=${encodeURIComponent(dir)}`,
      ),
    refetchInterval: busy ? POLL_BUSY_MS : POLL_IDLE_MS,
    select: result => result.entries ?? [],
  })
}

/**
 * Read one file out of the sandbox. `revision` is the announced byte size: a
 * file the agent is still writing gets announced at a partial size, and a new
 * revision is a new cache entry rather than a hit on the truncated read.
 */
export function useSandboxFile(
  chatId: string,
  path: string | null,
  enabled = true,
  revision: string | number = '',
) {
  return useQuery({
    queryKey: ['file', chatId, path, revision],
    queryFn: () =>
      get<FileBody>(
        `/api/file?chatId=${encodeURIComponent(chatId)}&path=${encodeURIComponent(path!)}`,
      ),
    enabled: enabled && path !== null,
    // Bytes at a given revision do not change; nothing is gained by re-reading.
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** The gallery the agent serves, once it has produced anything. */
export function useGallery(chatId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['gallery', chatId],
    queryFn: () =>
      get<{ gallery?: string | null; servedRoot?: string }>(
        `/api/files?chatId=${encodeURIComponent(chatId)}`,
      ),
    enabled,
    select: result => ({
      gallery: result.gallery ?? null,
      servedRoot: result.servedRoot ?? null,
    }),
  })
}

/** Which runs still hold a sandbox — the sidebar's live dots. */
export function useLiveRuns() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => get<{ live?: string[] }>('/api/sessions'),
    refetchInterval: 5000,
    select: result => new Set(result.live ?? []),
  })
}

/** The server owns the ad-set prompt, so the card and the run cannot drift. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => get<{ prompt?: string; brand?: string; sizes?: number }>('/api/health'),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
