import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    viteReact(),
  ],
  server: {
    port: 3000,
    // The API runs as its own Node process (Hono speaks Web Response, which is
    // what `createUIMessageStreamResponse` returns). Same-origin in dev, no CORS.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT ?? '8787'}`,
        changeOrigin: true,
        // A dead API port is a 503 the page can render, not an unhandled
        // proxy error in the terminal — the client already retries.
        configure: proxy => {
          proxy.on('error', (error, _req, res) => {
            if (!('writeHead' in res) || res.headersSent) return
            res.writeHead(503, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: `The API is not running (${error.message}).` }))
          })
        },
      },
    },
  },
})
