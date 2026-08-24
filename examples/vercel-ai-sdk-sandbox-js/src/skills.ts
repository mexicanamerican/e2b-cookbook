// The craft the agent works from. `npx skills add` installs
// [agent skills](https://skills.sh) into .agents/skills; the harness takes them
// as a `skills` option and each adapter surfaces them natively — Pi materializes
// them inside the sandbox, so the agent discovers them the way it discovers its
// own. Nothing here uploads anything: the fonts are the one exception, below.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HarnessAgentSkill } from '@ai-sdk/harness/agent'
import type { Sandbox } from 'e2b'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Where `npx skills add` installs, resolved from this file rather than cwd. */
const SKILLS_DIR = resolve(HERE, '../.agents/skills')

/** Skill files ride the harness as UTF-8; anything else is not a skill file. */
const TEXT_FILE = /\.(md|txt|json|html|csv)$/

/**
 * canvas-design ships 54 licensed typefaces. They are binary, and skill files
 * are text, so the fonts travel separately and the brief names this directory.
 */
const FONTS_SOURCE = join(SKILLS_DIR, 'canvas-design', 'canvas-fonts')
export const SANDBOX_FONTS_DIR = '/home/user/brief/canvas-fonts'

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(
    entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => {
        const path = join(dir, entry.name)
        return entry.isDirectory() ? walk(path) : Promise.resolve([path])
      }),
  )
  return found.flat()
}

/** `description:` out of the SKILL.md frontmatter — the line the model reads
 *  to decide whether a skill is worth opening. */
function describe(content: string, fallback: string): string {
  const frontmatter = content.startsWith('---') ? content.slice(3, content.indexOf('\n---', 3)) : ''
  const line = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  return line ?? fallback
}

/**
 * Every installed skill, in the shape the harness takes. An empty list is not
 * an error — the example still runs, it just runs without the craft.
 */
export async function loadSkills(): Promise<HarnessAgentSkill[]> {
  const names = (await readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  const skills = await Promise.all(
    names.map(async (name): Promise<HarnessAgentSkill | null> => {
      const root = join(SKILLS_DIR, name)
      const content = await readFile(join(root, 'SKILL.md'), 'utf-8').catch(() => null)
      if (content === null) return null

      // Everything beside SKILL.md that the runtime can actually read. The
      // fonts are excluded by extension; their licences travel with them.
      const extras = (await walk(root)).filter(
        path => TEXT_FILE.test(path) && !path.startsWith(FONTS_SOURCE) && !path.endsWith('SKILL.md'),
      )
      const files = await Promise.all(
        extras.map(async path => ({
          path: relative(root, path).split(sep).join('/'),
          content: await readFile(path, 'utf-8'),
        })),
      )
      return { name, description: describe(content, name), content, files }
    }),
  )

  return skills.filter((skill): skill is HarnessAgentSkill => skill !== null)
}

/**
 * The renderer, which rides in as a file rather than as instructions.
 *
 * Ad layout is arithmetic — safe areas, box splits, fitting copy — and asking a
 * model to re-derive it from prose on every run is what made each size fail in
 * its own way. The agent runs this and audits the result; it does not design it.
 */
const RENDERER_SOURCE = join(HERE, 'sandbox', 'render.py')
export const SANDBOX_RENDERER = '/home/user/brief/render.py'

export async function mountRenderer(sandbox: Sandbox): Promise<void> {
  await sandbox.files.write(SANDBOX_RENDERER, await readFile(RENDERER_SOURCE, 'utf-8'))
}

/** Written in batches: one request per typeface is 54 round trips. */
const BATCH = 24

/** Copy the typefaces in beside the brief. Returns how many landed. */
export async function mountFonts(sandbox: Sandbox): Promise<number> {
  const files = await walk(FONTS_SOURCE)
  for (let index = 0; index < files.length; index += BATCH) {
    const batch = await Promise.all(
      files.slice(index, index + BATCH).map(async path => ({
        path: `${SANDBOX_FONTS_DIR}/${relative(FONTS_SOURCE, path).split(sep).join('/')}`,
        // The copy re-homes the Buffer's bytes into a standalone ArrayBuffer;
        // Node pools Buffers, so `.buffer` alone can carry a whole slab.
        data: new Uint8Array(await readFile(path)).buffer,
      })),
    )
    await sandbox.files.write(batch)
  }
  return files.length
}
