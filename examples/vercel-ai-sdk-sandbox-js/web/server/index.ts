// The API. Hono, because `createUIMessageStreamResponse` hands back a Web
// `Response` and Hono returns one unchanged.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { config } from 'dotenv'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getHarnessErrorMessage } from '@ai-sdk/harness/agent'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { HOME_DIR, type WorkbenchMessage } from '../src/lib/protocol.ts'
import { BRIEF, OUT_DIR } from './brief.ts'
import {
  AD_SET_PROMPT,
  galleryUrl,
  listDir,
  liveChatIds,
  readArtifact,
  runTurn,
} from './agent.ts'

// The keys live in the example's own .env, one level up — the same file the
// three scripts read. Resolved against this file, not the cwd, so the API picks
// them up no matter where you launched it from. A local web/.env still wins if
// you make one (dotenv never overwrites an already-set variable).
const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '..', '.env') })
config({ path: resolve(here, '..', '..', '.env') })

const app = new Hono()

const message = (error: unknown) =>
  // getHarnessErrorMessage keeps reviewed harness text (rate limits, auth) and
  // masks anything it does not recognise.
  getHarnessErrorMessage(error) ??
  (error instanceof Error ? error.message : 'Something failed on the server.')

app.get('/api/health', c =>
  c.json({
    hasE2bKey: Boolean(process.env.E2B_API_KEY),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    prompt: AD_SET_PROMPT,
    brand: BRIEF.name,
    sizes: BRIEF.sizes.length,
  }),
)

app.post('/api/chat', async c => {
  const body = await c.req.json<{ id?: string; messages?: WorkbenchMessage[] }>()
  const chatId = body.id
  if (!chatId) return c.json({ error: 'Missing chat id.' }, 400)

  const last = body.messages?.at(-1)
  const typed = last?.parts.filter(part => part.type === 'text').map(part => part.text).join('') ?? ''
  const prompt = typed.trim() || AD_SET_PROMPT

  // The stream is created before the sandbox so a boot failure arrives as an
  // error part in the transcript rather than an opaque HTTP error.
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<WorkbenchMessage>({
      execute: async ({ writer }) => runTurn(chatId, prompt, writer),
      onError: message,
    }),
  })
})

// Which runs still have a sandbox behind them — the sidebar's live dots.
app.get('/api/sessions', c => c.json({ live: liveChatIds() }))

app.get('/api/files', async c => {
  const chatId = c.req.query('chatId')
  if (!chatId) return c.json({ error: 'Missing chat id.' }, 400)
  const dir = c.req.query('path') ?? HOME_DIR
  try {
    // servedRoot tells the page which files the gallery host can actually
    // serve, so the client builds preview URLs without hardcoding the path.
    return c.json({
      dir,
      entries: await listDir(chatId, dir),
      gallery: galleryUrl(chatId),
      servedRoot: OUT_DIR,
    })
  } catch (error) {
    return c.json({ error: message(error) }, 400)
  }
})

app.get('/api/file', async c => {
  const chatId = c.req.query('chatId')
  const path = c.req.query('path')
  if (!chatId || !path) return c.json({ error: 'Missing chat id or path.' }, 400)
  try {
    return c.json(await readArtifact(chatId, path))
  } catch (error) {
    return c.json({ error: message(error) }, 404)
  }
})

const port = Number(process.env.API_PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`api listening on http://127.0.0.1:${port}`)
