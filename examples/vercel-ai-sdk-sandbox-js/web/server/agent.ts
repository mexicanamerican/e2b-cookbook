// The real turn. One sandbox and one harness session per chat, held in this
// process — the dev server outlives the chat, so there is no resume state to
// persist. Keeping the sandbox ours (wrap mode) is what lets the page read the
// files the agent writes.
import { posix } from 'node:path'
import { getHarnessErrorMessage, HarnessAgent } from '@ai-sdk/harness/agent'
import { createPi } from '@ai-sdk/harness-pi'
import { createE2BSandbox } from '@e2b/ai-sdk-sandbox'
import { openai } from '@ai-sdk/openai'
import { generateImage, toUIMessageStream, type UIMessageStreamWriter } from 'ai'
import { Sandbox } from 'e2b'
import {
  artifactKind,
  HOME_DIR,
  mimeFor,
  type Artifact,
  type Entry,
  type FileBody,
  type WorkbenchMessage,
} from '../src/lib/protocol.ts'
import { loadSkills, mountFonts, mountRenderer } from '../../src/skills.ts'
import { AD_SET_PROMPT, BRIEF, BRIEF_DIR, HERO_PROMPT, OUT_DIR } from './brief.ts'

const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000
const ARTIFACT_POLL_MS = 1200

type Workbench = {
  sandbox: Sandbox
  /** Created on the first turn — the sandbox is registered before this exists. */
  session?: Awaited<ReturnType<HarnessAgent['createSession']>>
  agent?: HarnessAgent
  hero?: Promise<void>
}

const benches = new Map<string, Workbench>()
const opening = new Map<string, Promise<Workbench>>()

export class MissingKeyError extends Error {}

function requireKeys() {
  if (!process.env.E2B_API_KEY) {
    throw new MissingKeyError(
      'E2B_API_KEY is not set. Copy the example .env and restart the dev server.',
    )
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new MissingKeyError(
      'OPENAI_API_KEY is not set. The campaign asset is generated with an image model, and only OpenAI ships one.',
    )
  }
}

async function open(chatId: string, brief: string): Promise<Workbench> {
  requireKeys()

  // The sandbox first, because it is the fast part — a second or so. It comes up
  // holding just the brief you pasted, so the page shows a real sandbox with a
  // real file in it while the image model is still drawing the campaign asset.
  const sandbox = await Sandbox.create({
    timeoutMs: SANDBOX_TIMEOUT_MS,
    metadata: { chatId, example: 'vercel-ai-sdk-sandbox-js-web' },
  })
  await sandbox.files.write(`${BRIEF_DIR}/brief.md`, brief)

  const bench: Workbench = { sandbox }
  // The rest lands in the background; the turn awaits it before prompting.
  bench.hero = (async () => {
    const [{ image }] = await Promise.all([
      generateImage({ model: openai.image('gpt-image-2'), size: '1024x1024', prompt: HERO_PROMPT }),
      sandbox.files.makeDir(OUT_DIR).catch(() => undefined),
      sandbox.files.write(`${BRIEF_DIR}/brand.json`, JSON.stringify(BRIEF, null, 2)),
      // The typefaces the brief insists on. Binary, so they travel as files
      // rather than as skill content.
      mountFonts(sandbox),
      // The renderer. Layout is code, not something the agent re-derives.
      mountRenderer(sandbox),
    ])
    // `files.write` takes an ArrayBuffer; the copy re-homes the view's bytes.
    await sandbox.files.write(`${BRIEF_DIR}/hero.png`, new Uint8Array(image.uint8Array).buffer)
  })()

  benches.set(chatId, bench)
  return bench
}

/** The harness session, created on first use so the sandbox can exist without it. */
async function session(bench: Workbench) {
  if (bench.session) return bench.session
  // Pi drives the sandbox. OpenAI by default — the image step needs that key
  // anyway, so one key runs the whole example. Set PI_AUTH=anthropic to switch
  // (the standalone scripts still prefer Anthropic).
  const forced = process.env.PI_AUTH
  const [auth, model] =
    forced === 'anthropic' || (!forced && !process.env.OPENAI_API_KEY)
      ? (['anthropic', 'anthropic/claude-sonnet-5'] as const)
      : (['openai', 'openai/gpt-5.6-luna'] as const)
  // The installed skills go to the harness, which lets the Pi adapter surface
  // them natively inside the sandbox — the agent finds them as skills, not as
  // a wall of prompt.
  const skills = await loadSkills()
  if (skills.length === 0) {
    console.warn('no skills found — run `npm run skills` for the art direction')
  }
  bench.agent = new HarnessAgent({
    harness: createPi({ auth, model }),
    sandbox: createE2BSandbox({ sandbox: bench.sandbox }),
    skills,
  })
  bench.session = await bench.agent.createSession()
  return bench.session
}

/** One sandbox per chat, built at most once even under concurrent requests. */
function workbench(chatId: string, brief: string): Promise<Workbench> {
  const existing = benches.get(chatId)
  if (existing) return Promise.resolve(existing)
  const inFlight = opening.get(chatId)
  if (inFlight) return inFlight
  const started = open(chatId, brief).finally(() => opening.delete(chatId))
  opening.set(chatId, started)
  return started
}

/** Everything in the sandbox the page is allowed to look at: the brief that
 *  went in, and whatever the agent has written out. */
export async function listWorkspace(chatId: string): Promise<Artifact[]> {
  const bench = benches.get(chatId)
  if (!bench) return []
  const listings = await Promise.all(
    [BRIEF_DIR, OUT_DIR].map(async dir => {
      const entries = await bench.sandbox.files.list(dir).catch(() => [])
      return entries
        .filter(entry => entry.type === 'file' && !entry.name.startsWith('.'))
        .map(entry => ({
          path: `${dir}/${entry.name}`,
          name: entry.name,
          kind: artifactKind(entry.name),
          bytes: entry.size,
        }))
    }),
  )
  return listings.flat().sort((a, b) => a.path.localeCompare(b.path))
}

/** The directories the page renders, whether or not they hold anything yet. */
export const WORKSPACE_DIRS = [BRIEF_DIR, OUT_DIR]

/** Just the outputs — what the turn announces as it renders them. */
export async function listArtifacts(chatId: string): Promise<Artifact[]> {
  return (await listWorkspace(chatId)).filter(a => a.path.startsWith(`${OUT_DIR}/`))
}

/**
 * Resolve a requested path to one genuinely inside the sandbox home. A prefix
 * test alone is not containment: `/home/user/../../etc/passwd` starts with the
 * right string and still escapes.
 */
function confineToWorkspace(requested: string): string {
  const resolved = posix.normalize(requested)
  const contained = resolved === HOME_DIR || resolved.startsWith(`${HOME_DIR}/`)
  if (!contained || resolved.split('/').includes('..')) {
    throw new Error('Only the sandbox home directory is readable.')
  }
  return resolved
}

/** One directory of the sandbox, for the file browser. */
export async function listDir(chatId: string, requested: string): Promise<Entry[]> {
  const dir = confineToWorkspace(requested)
  const bench = benches.get(chatId)
  if (!bench) return []
  const entries = await bench.sandbox.files.list(dir).catch(() => [])
  return entries
    .filter(entry => !entry.name.startsWith('.'))
    .map(entry => ({
      path: `${dir === '/' ? '' : dir}/${entry.name}`,
      name: entry.name,
      type: entry.type === 'dir' ? ('dir' as const) : ('file' as const),
      kind: artifactKind(entry.name),
      bytes: entry.size,
    }))
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
    )
}

export async function readArtifact(chatId: string, requested: string): Promise<FileBody> {
  // Validate the input before looking anything up, so a bad path can never
  // reach a live sandbox handle.
  const path = confineToWorkspace(requested)
  const bench = benches.get(chatId)
  if (!bench) throw new Error('That chat has no sandbox yet.')
  const mime = mimeFor(path)
  const binary = artifactKind(path) !== 'text'
  if (binary) {
    const bytes = await bench.sandbox.files.read(path, { format: 'bytes' })
    return { path, mime, encoding: 'base64', content: Buffer.from(bytes).toString('base64') }
  }
  const text = await bench.sandbox.files.read(path, { format: 'text' })
  return { path, mime, encoding: 'utf-8', content: text }
}

/**
 * Announce artefacts as they land. The harness stream says nothing about files,
 * so the directory is polled for the duration of the turn — `data-artifact`
 * parts are keyed by path, so re-announcing one replaces it rather than
 * appending a duplicate.
 */
function watchArtifacts(chatId: string, writer: UIMessageStreamWriter<WorkbenchMessage>) {
  const announced = new Map<string, number>()
  const tick = async () => {
    for (const artifact of await listArtifacts(chatId)) {
      if (announced.get(artifact.path) === artifact.bytes) continue
      announced.set(artifact.path, artifact.bytes)
      writer.write({ type: 'data-artifact', id: artifact.path, data: artifact })
    }
  }
  const timer = setInterval(() => void tick().catch(() => undefined), ARTIFACT_POLL_MS)
  return {
    stop: async () => {
      clearInterval(timer)
      await tick().catch(() => undefined)
    },
  }
}

/** Run one turn into the caller's UI message stream. */
export async function runTurn(
  chatId: string,
  prompt: string,
  writer: UIMessageStreamWriter<WorkbenchMessage>,
) {
  const bench = await workbench(chatId, prompt)
  await bench.hero
  const active = await session(bench)
  const watcher = watchArtifacts(chatId, writer)
  try {
    const result = await bench.agent!.stream({ session: active, prompt })
    writer.merge(
      toUIMessageStream({ stream: result.stream, onError: getHarnessErrorMessage }) as never,
    )
    await result.text
  } finally {
    await watcher.stop()
  }
}

/** Chat ids that still hold a live sandbox in this process. */
export function liveChatIds(): string[] {
  return [...benches.keys()]
}

/** The gallery the agent serves, once its sandbox exists. */
export function galleryUrl(chatId: string): string | null {
  const bench = benches.get(chatId)
  return bench ? `https://${bench.sandbox.getHost(3000)}` : null
}

export { AD_SET_PROMPT }
