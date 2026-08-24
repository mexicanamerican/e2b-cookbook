// An AI creative-production agent. An image model makes one campaign asset on
// your machine; a Pi coding agent inside an E2B sandbox turns it into a finished
// ad set — background cut out, every trafficking size rendered, copy overlaid,
// brand rules audited, and a gallery served straight from the sandbox.
//
// Nothing is installed at runtime: the E2B base template already ships
// ImageMagick, and the audit is Python standard library.
import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { HarnessAgent } from '@ai-sdk/harness/agent'
import { createPi } from '@ai-sdk/harness-pi'
import { createE2BSandbox } from '@e2b/ai-sdk-sandbox'
import { openai } from '@ai-sdk/openai'
import { generateImage } from 'ai'
import { Sandbox } from 'e2b'
import { AD_SET_PROMPT, BRIEF, BRIEF_DIR, HERO_PROMPT, OUT_DIR, SERVE_COMMAND } from './brief.ts'
import { cutHero } from './hero.ts'
import { loadSkills } from './skills.ts'

// Pi drives the sandbox; Anthropic when its key is set, matching the other lanes.
const [auth, model] = process.env.ANTHROPIC_API_KEY
  ? (['anthropic', 'anthropic/claude-sonnet-5'] as const)
  : (['openai', 'openai/gpt-5.6-luna'] as const)

// 1. The image model makes the campaign asset — on your machine, not in the sandbox.
console.log(`generating the campaign asset for ${BRIEF.name}…`)
const { image } = await generateImage({
  model: openai.image('gpt-image-2'),
  size: '1024x1024',
  prompt: HERO_PROMPT,
})

// The raw generation is the campaign's key visual — keep it, it is a deliverable
// in its own right and not just an input the sandbox consumes.
await writeFile('key-visual.png', image.uint8Array)

// 2. A plain E2B sandbox. No custom template, no setup commands.
const sbx = await Sandbox.create({ timeoutMs: 15 * 60 * 1000 })
console.log(`sandbox ${sbx.sandboxId} ready`)

try {
  // 3. The asset crosses the boundary, with the brief beside it. The hero lands
  // in the served directory so the pages can reference it as `hero.png`.
  // `files.write` takes an ArrayBuffer; the copy re-homes the view's bytes into one.
  await sbx.files.write(`${OUT_DIR}/hero.png`, new Uint8Array(image.uint8Array).buffer)
  await sbx.files.write(`${BRIEF_DIR}/brand.json`, JSON.stringify(BRIEF, null, 2))

  // 3b. The cutout, and the server the pages are previewed from. Both are
  //     mechanical, so the host does them rather than asking for them.
  console.log(await cutHero(sbx) ?? 'no cutout — the agent gets the uncut hero')
  await sbx.commands.run(SERVE_COMMAND)

  // 3b. The craft itself. The harness hands these to Pi, which surfaces them
  //     as skills inside the sandbox — no uploading, no prompt stuffing.
  const skills = await loadSkills()
  console.log(
    skills.length > 0
      ? `skills: ${skills.map(skill => skill.name).join(', ')}`
      : 'no skills found — run `npm run skills`; the ad set will be designed without art direction',
  )

  // 4. Pi works inside that same sandbox. Passing the sandbox in — rather than
  //    letting the provider create one — is what keeps `sbx.files.*` usable here.
  const agent = new HarnessAgent({
    harness: createPi({ auth, model }),
    sandbox: createE2BSandbox({ sandbox: sbx }),
    skills,
  })
  const session = await agent.createSession()

  // 5. One prompt. Every tool call runs in the sandbox, never on your machine.
  const result = await agent.generate({ session, prompt: AD_SET_PROMPT })
  console.log('\n' + result.text)

  // 6. The gallery is the deliverable, and it lives in the sandbox — but check
  //    it exists rather than printing a URL that 404s.
  const { stdout: produced } = await sbx.commands.run(`ls -1 ${OUT_DIR}`)
  const pages = produced.split('\n').filter(name => name.endsWith('.html'))
  if (!pages.includes('index.html')) {
    throw new Error(`the agent never produced ${OUT_DIR}/index.html. It left: ${produced.split('\n').filter(Boolean).join(', ')}`)
  }
  console.log(`\n${pages.length} pages: ${pages.join(', ')}`)

  // Stop the Pi runtime so this process can exit. In wrap mode the sandbox is
  // ours, not the provider's, so this leaves it — and its server — running.
  await session.destroy()

  // 7. …and the gallery stays up, served by the sandbox that rendered it.
  console.log(`\nkey visual: ./key-visual.png (gpt-image-2, ${image.uint8Array.byteLength.toLocaleString()} bytes)`)
  console.log(`gallery: https://${sbx.getHost(3000)}`)
  console.log(`the sandbox self-destructs in 15 minutes, or kill it now:`)
  console.log(`  npx e2b sandbox kill ${sbx.sandboxId}`)
} catch (error) {
  await sbx.kill()
  throw error
}
