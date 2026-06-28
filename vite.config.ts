import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import {
  approveImportDraft,
  createImportDraft,
  getPortfolioSummary,
  listImportDrafts,
  readConfig,
  saveConfig
} from './src/server/vault'

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

function portfolioVaultApi(): Plugin {
  return {
    name: 'portfolio-vault-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')

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
            sendJson(res, 200, await saveConfig(body))
            return
          }

          if (req.method === 'GET' && url.pathname === '/drafts') {
            sendJson(res, 200, { drafts: await listImportDrafts() })
            return
          }

          if (req.method === 'POST' && url.pathname === '/drafts') {
            const body = JSON.parse(await readBody(req))
            sendJson(res, 201, await createImportDraft(body))
            return
          }

          if (req.method === 'POST' && url.pathname.startsWith('/drafts/') && url.pathname.endsWith('/approve')) {
            const draftId = decodeURIComponent(url.pathname.slice('/drafts/'.length, -'/approve'.length))
            sendJson(res, 200, await approveImportDraft(draftId))
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
