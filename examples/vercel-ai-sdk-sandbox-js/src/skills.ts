// The craft the agent works from. `npx skills add` installs
// [agent skills](https://skills.sh) into .agents/skills; the harness takes them
// as a `skills` option and each adapter surfaces them natively — Pi materializes
// them inside the sandbox, so the agent discovers them the way it discovers its
// own. Nothing here uploads anything — the pages the agent writes are HTML, and
// the browser that opens them loads the webfonts.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HarnessAgentSkill } from '@ai-sdk/harness/agent'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Where `npx skills add` installs, resolved from this file rather than cwd. */
const SKILLS_DIR = resolve(HERE, '../.agents/skills')

/** Skill files ride the harness as UTF-8; anything else is not a skill file. */
const TEXT_FILE = /\.(md|txt|json|html|csv)$/

async function skillNames(): Promise<string[]> {
  return (await readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

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
  const names = await skillNames()

  const skills = await Promise.all(
    names.map(async (name): Promise<HarnessAgentSkill | null> => {
      const root = join(SKILLS_DIR, name)
      const content = await readFile(join(root, 'SKILL.md'), 'utf-8').catch(() => null)
      if (content === null) return null

      // Everything beside SKILL.md that the runtime can actually read — a
      // skill's references travel with it. TEXT_FILE keeps binaries out.
      const extras = (await walk(root)).filter(
        path => TEXT_FILE.test(path) && !path.endsWith('SKILL.md'),
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
