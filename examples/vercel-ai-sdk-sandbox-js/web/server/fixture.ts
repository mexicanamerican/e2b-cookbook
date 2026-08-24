// Replayable turns. Every visual state the page can reach — thinking, tool rows
// landing, artefacts appearing, each failure — is reachable here with no sandbox,
// no agent, and no tokens spent. This is what makes the UI verifiable.
import { readdir, readFile } from 'node:fs/promises'
import { createUIMessageStream, type UIMessageStreamWriter } from 'ai'
import {
  artifactKind,
  HOME_DIR,
  mimeFor,
  type Artifact,
  type Entry,
  type FileBody,
  type WorkbenchMessage,
} from '../src/lib/protocol.ts'
import { AD_SET_PROMPT, BRIEF, BRIEF_DIR, OUT_DIR } from './brief.ts'

// Real artefacts from a real run, committed so fixture mode shows the same
// pixels the agent produces. The directory mirrors the sandbox: fixtures/brief
// is what goes in, fixtures/out is what the agent writes.
const FIXTURE_DIR = new URL('../fixtures/', import.meta.url)
const FIXTURE_DIRS: Record<string, string> = { [BRIEF_DIR]: 'brief', [OUT_DIR]: 'out' }

export async function fixtureArtifacts(): Promise<Artifact[]> {
  const listings = await Promise.all(
    Object.entries(FIXTURE_DIRS).map(async ([sandboxDir, fixtureDir]) => {
      const base = new URL(`${fixtureDir}/`, FIXTURE_DIR)
      const names = await readdir(base).catch(() => [] as string[])
      return Promise.all(
        names
          .filter(name => !name.startsWith('.'))
          .map(async name => {
            const bytes = await readFile(new URL(name, base))
            return {
              path: `${sandboxDir}/${name}`,
              name,
              kind: artifactKind(name),
              bytes: bytes.byteLength,
            }
          }),
      )
    }),
  )
  return [
    {
      path: `${BRIEF_DIR}/brief.md`,
      name: 'brief.md',
      kind: 'text' as const,
      bytes: AD_SET_PROMPT.length,
    },
    ...listings.flat(),
  ].sort((a, b) => a.path.localeCompare(b.path))
}

/** The same tree the sandbox would have, served from disk. */
export async function fixtureDir(requested: string): Promise<Entry[]> {
  if (requested === HOME_DIR) {
    return [BRIEF_DIR, OUT_DIR].map(dir => ({
      path: dir,
      name: dir.split('/').pop() ?? dir,
      type: 'dir' as const,
      kind: 'text' as const,
      bytes: 0,
    }))
  }
  return (await fixtureArtifacts())
    .filter(file => file.path.startsWith(`${requested}/`))
    .map(file => ({ ...file, type: 'file' as const }))
}

export async function readFixture(path: string): Promise<FileBody> {
  const segments = path.split('/')
  const name = segments.pop() ?? ''
  // brief.md is the pasted brief itself, not a file on disk.
  if (name === 'brief.md') {
    return { path, mime: 'text/markdown', encoding: 'utf-8', content: AD_SET_PROMPT }
  }
  const fixtureDir = FIXTURE_DIRS[segments.join('/')]
  if (!name || !fixtureDir || name.includes('..')) throw new Error('No such fixture.')
  const bytes = await readFile(new URL(`${fixtureDir}/${name}`, FIXTURE_DIR))
  const mime = mimeFor(name)
  return artifactKind(name) === 'text'
    ? { path, mime, encoding: 'utf-8', content: bytes.toString('utf8') }
    : { path, mime, encoding: 'base64', content: bytes.toString('base64') }
}

export type Scenario = 'happy' | 'audit-fail' | 'no-key' | 'sandbox-error'

export const SCENARIOS: Scenario[] = ['happy', 'audit-fail', 'no-key', 'sandbox-error']

export function isScenario(value: string | null): value is Scenario {
  return value !== null && (SCENARIOS as string[]).includes(value)
}

const AD_FILES = BRIEF.sizes.map(size => `ad_${size}.png`)

// The real brand_check.py prints a markdown table, so the fixture does too —
// the page renders these rows as a table, not as a monospace block.
const AUDIT_PASS = `| size | dimensions | contrast | palette | verdict |
| --- | --- | --- | --- | --- |
| 1200x628 | ok | 17.45 | ok | PASS |
| 1080x1080 | ok | 17.45 | ok | PASS |
| 300x250 | ok | 17.45 | ok | PASS |
| 728x90 | ok | 17.45 | ok | PASS |
| 160x600 | ok | 17.45 | ok | PASS |

5/5 variants on brand`

const AUDIT_FAIL = `| size | dimensions | contrast | palette | verdict |
| --- | --- | --- | --- | --- |
| 1200x628 | ok | 17.45 | ok | PASS |
| 1080x1080 | ok | 17.45 | ok | PASS |
| 300x250 | ok | 17.45 | ok | PASS |
| 728x90 | ok | 2.51 | ok | FAIL — headline contrast 2.51, needs 4.5 |
| 160x600 | ok | 17.45 | ok | PASS |

4/5 variants on brand`

type Step =
  | { kind: 'say'; text: string }
  | { kind: 'write'; path: string; summary: string }
  | { kind: 'bash'; command: string; stdout: string }
  | { kind: 'artifact'; name: string; bytes: number }
  | { kind: 'fail'; message: string }

function plan(scenario: Scenario): Step[] {
  if (scenario === 'no-key') {
    return [
      {
        kind: 'fail',
        message:
          'OPENAI_API_KEY is not set. The campaign asset is generated with an image model, and only OpenAI ships one — add it to .env and restart.',
      },
    ]
  }
  if (scenario === 'sandbox-error') {
    return [
      { kind: 'say', text: 'Generating the campaign asset, then opening a sandbox…' },
      {
        kind: 'fail',
        message:
          'The sandbox refused to start: 401 unauthorized. Check E2B_API_KEY, and that it belongs to the cluster E2B_DOMAIN points at.',
      },
    ]
  }

  const failing = scenario === 'audit-fail'
  return [
    { kind: 'say', text: `Reading the brief for ${BRIEF.name} and the hero shot.` },
    { kind: 'write', path: 'brief/render.py', summary: 'cutout, five sizes, copy overlay, contact sheet' },
    {
      kind: 'bash',
      command: 'python3 /home/user/brief/render.py',
      stdout: [...AD_FILES.map(f => `rendered ${f}`), 'rendered contact-sheet.png'].join('\n'),
    },
    ...AD_FILES.map((name, index): Step => ({
      kind: 'artifact',
      name,
      bytes: 41_000 - index * 6_500,
    })),
    { kind: 'artifact', name: 'contact-sheet.png', bytes: 411_519 },
    { kind: 'write', path: 'brief/brand_check.py', summary: 'dimensions, WCAG contrast, palette share' },
    {
      kind: 'bash',
      command: 'python3 /home/user/brief/brand_check.py',
      stdout: failing ? AUDIT_FAIL : AUDIT_PASS,
    },
    { kind: 'write', path: 'brief/gallery.py', summary: 'single-file gallery, then tar and serve' },
    {
      kind: 'bash',
      command: 'python3 /home/user/brief/gallery.py && tar -czf /home/user/out/ad-set.tar.gz -C /home/user/out .',
      stdout: 'wrote /home/user/out/index.html\nserving /home/user/out on :3000',
    },
    { kind: 'artifact', name: 'index.html', bytes: 1_284 },
    { kind: 'artifact', name: 'ad-set.tar.gz', bytes: 476_332 },
    {
      kind: 'say',
      // Unfenced: the audit is a table, and fencing it would print the pipes.
      text: failing
        ? `The leaderboard failed the contrast rule. Audit as run:\n\n${AUDIT_FAIL}\n`
        : `All five variants are on brand. Audit as run:\n\n${AUDIT_PASS}\n`,
    },
  ]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function replay(
  writer: UIMessageStreamWriter<WorkbenchMessage>,
  scenario: Scenario,
  pace: number,
) {
  let counter = 0
  const nextId = () => `fixture-${++counter}`

  for (const step of plan(scenario)) {
    await sleep(pace)
    if (step.kind === 'fail') {
      writer.write({ type: 'error', errorText: step.message })
      return
    }
    if (step.kind === 'say') {
      const id = nextId()
      writer.write({ type: 'text-start', id })
      // Word by word, so the page is exercised mid-stream and not just at rest.
      for (const word of step.text.split(' ')) {
        writer.write({ type: 'text-delta', id, delta: `${word} ` })
        await sleep(Math.max(8, pace / 12))
      }
      writer.write({ type: 'text-end', id })
      continue
    }
    if (step.kind === 'artifact') {
      const artifact: Artifact = {
        path: `${OUT_DIR}/${step.name}`,
        name: step.name,
        kind: artifactKind(step.name),
        bytes: step.bytes,
      }
      writer.write({ type: 'data-artifact', id: artifact.path, data: artifact })
      continue
    }
    const toolCallId = nextId()
    const isBash = step.kind === 'bash'
    writer.write({
      type: 'tool-input-available',
      toolCallId,
      toolName: isBash ? 'bash' : 'write',
      input: isBash ? { command: step.command } : { file_path: step.path, summary: step.summary },
    })
    await sleep(pace)
    writer.write({
      type: 'tool-output-available',
      toolCallId,
      output: isBash ? { stdout: step.stdout, exitCode: 0 } : { ok: true },
    })
  }
}

/** A fixture turn as a UI message stream, shaped exactly like a real one. */
export function fixtureStream(scenario: Scenario, pace: number) {
  return createUIMessageStream<WorkbenchMessage>({
    execute: async ({ writer }) => replay(writer, scenario, pace),
    onError: error => (error instanceof Error ? error.message : 'Fixture failed.'),
  })
}
