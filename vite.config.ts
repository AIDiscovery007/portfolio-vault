import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { watch, type FSWatcher } from 'node:fs'
import {
  approveImportDraft,
  createImportDraft,
  ensureVault,
  getPortfolioSummary,
  listImportDrafts,
  readConfig,
  resolveVaultDir,
  saveConfig
} from './src/server/vault'

const PLUGIN_NAME = 'portfolio-vault'
const PLUGIN_VERSION = '0.3.0'
const SERVER_STARTED_AT = new Date().toISOString()

type SseClient = {
  write: (chunk: string) => void
  end: () => void
}

const vaultEventClients = new Set<SseClient>()
const vaultWatchers: FSWatcher[] = []
let vaultWatchStarted = false
let vaultBroadcastTimer: ReturnType<typeof setTimeout> | null = null

function sendJson(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readBody(req: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request body is too large.'))
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function broadcastVaultChanged(reason: string) {
  const payload = JSON.stringify({ reason, updatedAt: new Date().toISOString() })
  for (const client of vaultEventClients) {
    client.write(`event: vault-changed\ndata: ${payload}\n\n`)
  }
}

function queueVaultChanged(reason: string) {
  if (vaultBroadcastTimer) clearTimeout(vaultBroadcastTimer)
  vaultBroadcastTimer = setTimeout(() => {
    vaultBroadcastTimer = null
    broadcastVaultChanged(reason)
  }, 120)
}

async function startVaultWatch() {
  if (vaultWatchStarted) return
  vaultWatchStarted = true

  const { paths } = await ensureVault()
  for (const [reason, filePath] of [
    ['config', paths.config],
    ['events', paths.events],
    ['drafts', paths.drafts]
  ] as const) {
    try {
      vaultWatchers.push(watch(filePath, { persistent: false }, () => queueVaultChanged(reason)))
    } catch {
      // Watch support varies across filesystems; API-triggered broadcasts still keep the UI fresh.
    }
  }
}

function portfolioVaultApi(): Plugin {
  return {
    name: 'portfolio-vault-api',
    configureServer(server) {
      void startVaultWatch()
      server.httpServer?.once('close', () => {
        for (const watcher of vaultWatchers) watcher.close()
        vaultWatchers.length = 0
        vaultWatchStarted = false
      })

      server.middlewares.use('/api', async (req, res, next) => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')

          if (req.method === 'GET' && url.pathname === '/health') {
            const { paths } = await ensureVault()
            sendJson(res, 200, {
              ok: true,
              name: PLUGIN_NAME,
              version: PLUGIN_VERSION,
              pid: process.pid,
              startedAt: SERVER_STARTED_AT,
              vaultDir: resolveVaultDir(),
              paths: {
                config: paths.config,
                events: paths.events,
                drafts: paths.drafts,
                derived: paths.derived,
                positions: paths.positions
              },
              capabilities: {
                amountBasedPositions: true,
                holdingSnapshot: true,
                importDraftApproval: true,
                vaultEvents: true
              }
            })
            return
          }

          if (req.method === 'GET' && url.pathname === '/vault-events') {
            await startVaultWatch()
            res.statusCode = 200
            res.setHeader('content-type', 'text/event-stream')
            res.setHeader('cache-control', 'no-cache, no-transform')
            res.setHeader('connection', 'keep-alive')
            res.setHeader('x-accel-buffering', 'no')
            res.write(': connected\n\n')

            vaultEventClients.add(res)
            const heartbeat = setInterval(() => {
              res.write(`: heartbeat ${Date.now()}\n\n`)
            }, 25000)

            req.on('close', () => {
              clearInterval(heartbeat)
              vaultEventClients.delete(res)
            })
            return
          }

          if (req.method === 'GET' && url.pathname === '/summary') {
            sendJson(res, 200, await getPortfolioSummary())
            return
          }

          if (req.method === 'GET' && url.pathname === '/config') {
            sendJson(res, 200, await readConfig())
            return
          }

          if (req.method === 'PUT' && url.pathname === '/config') {
            const body = JSON.parse(await readBody(req))
            const config = await saveConfig(body)
            sendJson(res, 200, config)
            queueVaultChanged('config')
            return
          }

          if (req.method === 'GET' && url.pathname === '/drafts') {
            sendJson(res, 200, { drafts: await listImportDrafts() })
            return
          }

          if (req.method === 'POST' && url.pathname === '/drafts') {
            const body = JSON.parse(await readBody(req))
            const draft = await createImportDraft(body)
            sendJson(res, 201, draft)
            queueVaultChanged('drafts')
            return
          }

          if (req.method === 'POST' && url.pathname.startsWith('/drafts/') && url.pathname.endsWith('/approve')) {
            const draftId = decodeURIComponent(url.pathname.slice('/drafts/'.length, -'/approve'.length))
            const draft = await approveImportDraft(draftId)
            sendJson(res, 200, draft)
            queueVaultChanged('events')
            return
          }

          next()
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), portfolioVaultApi()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORTFOLIO_VAULT_PORT || 43218)
  }
})
