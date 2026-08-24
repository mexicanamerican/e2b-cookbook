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
import {
  AD_SET_PROMPT,
  galleryUrl,
  listDir,
  liveChatIds,
  readArtifact,
  runTurn,
} from './agent.ts'
import {
  fixtureDir,
  fixtureStream,
  isScenario,
  readFixture,
  SCENARIOS,
} from './fixture.ts'

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

/** Fixture mode is a query flag per request, or FIXTURE=<scenario> for a session. */
const scenarioOf = (url: string) => {
  const asked = new URL(url).searchParams.get('fixture') ?? process.env.FIXTURE ?? null
  return isScenario(asked) ? asked : null
}

app.get('/api/health', c =>
  c.json({
    hasE2bKey: Boolean(process.env.E2B_API_KEY),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    scenarios: SCENARIOS,
    prompt: AD_SET_PROMPT,
  }),
)

app.post('/api/chat', async c => {
  const body = await c.req.json<{ id?: string; messages?: WorkbenchMessage[] }>()
  const chatId = body.id
  if (!chatId) return c.json({ error: 'Missing chat id.' }, 400)

  // Fixture mode: every visual state without a sandbox, an agent, or a token.
  const scenario = scenarioOf(c.req.url)
  if (scenario) {
    const pace = Number(c.req.query('pace') ?? 700)
    return createUIMessageStreamResponse({
      stream: fixtureStream(scenario, Number.isFinite(pace) ? pace : 700),
    })
  }

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
    const entries = scenarioOf(c.req.url)
      ? await fixtureDir(dir)
      : await listDir(chatId, dir)
    const gallery = scenarioOf(c.req.url) ? 'https://3000-fixture.e2b.app' : galleryUrl(chatId)
    return c.json({ dir, entries, gallery })
  } catch (error) {
    return c.json({ error: message(error) }, 400)
  }
})

app.get('/api/file', async c => {
  const chatId = c.req.query('chatId')
  const path = c.req.query('path')
  if (!chatId || !path) return c.json({ error: 'Missing chat id or path.' }, 400)
  try {
    return c.json(
      scenarioOf(c.req.url) ? await readFixture(path) : await readArtifact(chatId, path),
    )
  } catch (error) {
    return c.json({ error: message(error) }, 404)
  }
})

const port = Number(process.env.API_PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`api listening on http://127.0.0.1:${port}`)
