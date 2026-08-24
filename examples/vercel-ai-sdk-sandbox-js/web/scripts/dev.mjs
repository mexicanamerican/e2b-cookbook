// One command, two processes: the Hono API and the Vite dev server. Vite
// proxies /api to the API port, so the browser only ever talks to :3000.
import { spawn } from 'node:child_process'
import { connect } from 'node:net'

const API_PORT = process.env.API_PORT ?? '8787'

/** Resolve once something is listening, so Vite never proxies into a void. */
function waitForPort(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise(resolve => {
    const attempt = () => {
      const socket = connect({ port: Number(port), host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) resolve(false)
        else setTimeout(attempt, 150)
      })
    }
    attempt()
  })
}

// No `tsx watch` here on purpose: the API holds the live sandbox handles in
// memory (see server/agent.ts), so a reload orphans a running sandbox and
// leaves the open chat with no files. Edit the server, then restart this.
// `npm run dev:api` is the watch-mode variant for server-only iteration.
const children = [
  spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, API_PORT },
  }),
]

if (!(await waitForPort(API_PORT))) {
  console.error(`api never came up on ${API_PORT} — not starting vite`)
  process.exit(1)
}

children.push(spawn('npx', ['vite'], { stdio: 'inherit', env: { ...process.env, API_PORT } }))

let stopping = false
const shutdown = () => {
  // Killing our own children fires their exit handlers; without this guard the
  // first one back re-enters shutdown and reports itself as the crash.
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
for (const child of children) {
  child.on('exit', (code, signal) => {
    // A signal is not a crash: npx reports SIGTERM/SIGINT as 143/130, which
    // would otherwise read as a failing exit code every time you Ctrl-C.
    if (signal || code === 143 || code === 130 || code === 0 || code === null) return
    console.error(`\ndev process exited with ${code} — shutting down`)
    shutdown()
  })
}
