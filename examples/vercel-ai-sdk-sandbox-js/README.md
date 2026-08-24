# Vercel AI SDK on E2B Sandboxes (JavaScript)

Four ways to run [AI SDK](https://ai-sdk.dev) agents on E2B, all through
[`@e2b/ai-sdk-sandbox`](https://www.npmjs.com/package/@e2b/ai-sdk-sandbox) —
the E2B provider for AI SDK 7's sandbox interface.

## 1. A sandboxed tool (`src/tool.ts`)

A regular `generateText` agent with a `bash` tool whose commands run in an
isolated E2B sandbox instead of your machine. `session.restricted()` is the
security boundary: the tool gets file I/O and command execution, but nothing
that could stop the sandbox or change its network policy.

```ts
const session = await createE2BSandbox({}).createSession()
const sandbox = session.restricted()

const result = await generateText({
  model,
  tools: {
    bash: tool({
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => sandbox.run({ command }),
    }),
  },
  prompt: '…',
})
```

## 2. A coding agent on the sandbox (`src/harness.ts`)

The [AI SDK harness](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/overview)
runs the [Pi](https://github.com/earendil-works/pi) coding agent against the
E2B sandbox: Pi runs as an in-process library, and every tool it uses —
`bash`, `read`, `write`, `grep` — executes inside the sandbox, never on your
machine.

```ts
const agent = new HarnessAgent({
  harness: createPi({ auth, model }), // e.g. 'openai' + 'openai/gpt-5.6-luna'
  sandbox: createE2BSandbox({ timeoutMs: 10 * 60 * 1000 }),
})
```

Other harness adapters (`@ai-sdk/harness-claude-code`,
`@ai-sdk/harness-codex`) plug into the same `sandbox` option.

## 3. A creative-production agent (`src/harness-ai-creative-production-agent.ts`)

The same harness doing real production work. An image model generates one
campaign asset on your machine, it is written into a sandbox, and Pi turns it
into a finished ad set there: background cut out, every trafficking size
rendered, copy overlaid, brand rules audited, and a gallery served from the
sandbox on a public URL.

Nothing is installed at runtime — the E2B base template already ships
ImageMagick, and the brand audit is Python standard library.

**Layout is code, not prompt.** `src/sandbox/render.py` rides into the sandbox
as a file and does the compositing: safe areas, splitting the product and the
copy into boxes that cannot collide, and fitting the headline and the
call-to-action pill with ImageMagick's `caption:` and `label:`, which pick the
point size themselves so copy physically cannot overflow. Asking the model to
re-derive that arithmetic from prose on every run is what produced clipped
headlines, type over the product and an ink-on-ink CTA — different on each size,
every time. The agent runs the renderer, audits what came out and presents it;
it does not design it.

The craft the agent brings to the parts it *does* own — the brand audit and how
the ad set is presented — is not in the prompt either. It is
[agent skills](https://skills.sh) — installed into this example with
`npm run skills`, then handed to the harness, which is a first-class option:

```ts
const agent = new HarnessAgent({
  harness: createPi({ auth, model }),
  sandbox: createE2BSandbox({ sandbox: sbx }),
  skills: await loadSkills(),   // .agents/skills/*/SKILL.md
})
```

Each adapter surfaces skills its own way; Pi materializes them at
`/home/user/.agents/skills` inside the sandbox, so the agent discovers them the
way it discovers its own. Skill files are UTF-8, so the licensed typefaces
`canvas-design` ships travel separately as bytes — the renderer names one of
them with `-font`, which is what stops the ad set coming out in ImageMagick's
default face, the clearest tell of a machine-made ad.

```ts
const sbx = await Sandbox.create({ timeoutMs: 15 * 60 * 1000 })
await sbx.files.write('/home/user/brief/hero.png', new Uint8Array(image.uint8Array).buffer)

const agent = new HarnessAgent({
  harness: createPi({ auth, model }),
  sandbox: createE2BSandbox({ sandbox: sbx }), // Pi works in a sandbox you own
})
```

Passing your own `Sandbox` in, rather than letting the provider create one,
is what keeps `sbx.files.*` pointed at the same box the agent works in — so the
host can put the asset in and take the contact sheet and tarball back out.

This lane needs `OPENAI_API_KEY` for the image step whichever provider drives
Pi, because Anthropic has no image model.

## 4. The same agent, in a browser (`web/`)

A localhost workbench over lane 3: one click runs the ad-set brief, the
transcript shows each `bash` call as it happens, and every rendered variant
appears in the file pane as it lands — the contact sheet selects itself.
[AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-harnesses/ui) wiring, `useChat` on
the client, a Hono route on the server.

```bash
cd web && npm install && npm run dev   # http://localhost:3000
```

It reads the same `.env` as the scripts, but drives Pi with **OpenAI** by
default — the image step needs that key regardless, so one key runs the whole
lane. Set `PI_AUTH=anthropic` to use Claude instead.

Sandboxes and harness sessions are held
per chat in the dev-server process, so there is no resume state to persist — and
because the sandbox is created here rather than by the provider, the server can
still write the hero in and read the artefacts back out.

## How to run

**1. Set the API keys**

Copy `.env.example` to `.env` and fill in `E2B_API_KEY` plus an LLM provider
key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — the scripts pick whichever is
set, for both the model and the harness adapter).

**2. Install dependencies and skills**

```bash
npm install
npm run skills   # restores .agents/skills from skills-lock.json
```

The skills are vendored rather than committed — `canvas-design` alone is 5.8 MB
of fonts. Skip this step and the creative lane still runs, it just renders
without the craft.

**3. Run**

```bash
npm run start           # sandboxed tool
npm run start:harness   # coding agent inside the sandbox
npm run start:creative  # creative-production agent
cd web && npm run dev   # the same agent in a browser
```

The first two destroy their sandboxes at the end. The third leaves its sandbox
running so the gallery URL stays clickable, and prints the command to kill it.
The web app holds its sandbox until you stop the dev server or its 15-minute
timeout expires.
