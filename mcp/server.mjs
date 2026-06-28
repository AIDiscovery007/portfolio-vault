import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import readline from 'node:readline'

const SERVER_NAME = 'Portfolio Vault MCP'
const SERVER_VERSION = '0.2.0'

const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function now() {
  return new Date().toISOString()
}

function defaultVaultDir() {
  return join(homedir(), 'Documents', 'PortfolioVault')
}

function resolveVaultDir(args = {}) {
  return resolve(args.vaultDir || process.env.PORTFOLIO_VAULT_DIR || defaultVaultDir())
}

function paths(vaultDir) {
  return {
    config: join(vaultDir, 'config.json'),
    events: join(vaultDir, 'events.jsonl'),
    drafts: join(vaultDir, 'import-drafts'),
    imports: join(vaultDir, 'imports'),
    derived: join(vaultDir, 'derived'),
    positions: join(vaultDir, 'derived', 'positions.json')
  }
}

async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function writeJsonAtomic(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  await writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`)
  await rename(tempFile, filePath)
}

async function readJson(filePath, fallback) {
  if (!(await exists(filePath))) return fallback
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function ensureVault(vaultDir) {
  const p = paths(vaultDir)
  await Promise.all([mkdir(p.drafts, { recursive: true }), mkdir(p.imports, { recursive: true }), mkdir(p.derived, { recursive: true })])
  if (!(await exists(p.config))) {
    await writeJsonAtomic(p.config, {
      version: 1,
      baseCurrency: null,
      accounts: [],
      instruments: [],
      accountMappings: []
    })
  }
  if (!(await exists(p.events))) {
    await writeFile(p.events, '')
  }
  return p
}

async function readConfig(vaultDir) {
  const p = await ensureVault(vaultDir)
  return readJson(p.config, {
    version: 1,
    baseCurrency: null,
    accounts: [],
    instruments: [],
    accountMappings: []
  })
}

async function readLedgerEvents(vaultDir) {
  const p = await ensureVault(vaultDir)
  const text = await readFile(p.events, 'utf8')
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function listImportDrafts(vaultDir) {
  const p = await ensureVault(vaultDir)
  const entries = await readdir(p.drafts, { withFileTypes: true })
  const drafts = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    drafts.push(await readJson(join(p.drafts, entry.name), null))
  }
  return drafts.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function createImportDraft(input, vaultDir) {
  const p = await ensureVault(vaultDir)
  const timestamp = now()
  const draft = {
    id: input.id || `draft_${Date.now()}_${randomUUID().slice(0, 8)}`,
    status: 'draft',
    sourceType: input.sourceType,
    sourceFileName: input.sourceFileName,
    accountId: input.accountId,
    accountConfidence: input.accountConfidence,
    rows: Array.isArray(input.rows) ? input.rows : [],
    createdAt: timestamp,
    updatedAt: timestamp
  }
  await writeJsonAtomic(join(p.drafts, `${basename(draft.id)}.json`), draft)
  return draft
}

function projectPositions(events) {
  const positions = new Map()
  const realizedPnL = new Map()
  const lastPrices = new Map()

  for (const event of events) {
    if (event.type === 'price_snapshot') {
      lastPrices.set(event.instrumentId, event.price)
      continue
    }
    if (!event.instrumentId) continue
    const key = `${event.accountId}:${event.instrumentId}`
    const current =
      positions.get(key) ||
      {
        instrumentId: event.instrumentId,
        accountId: event.accountId,
        quantity: 0,
        costAmount: 0,
        averageCost: 0,
        lastPrice: null,
        marketValue: null,
        unrealizedPnL: null,
        realizedPnL: 0,
        currency: event.currency
      }

    if (event.type === 'opening_position') {
      current.quantity += event.quantity
      current.costAmount += event.costAmount
    }
    if (event.type === 'buy') {
      current.quantity += event.quantity
      current.costAmount += event.quantity * event.price + (event.fees || 0) + (event.taxes || 0)
    }
    if (event.type === 'sell') {
      const averageCost = current.quantity === 0 ? 0 : current.costAmount / current.quantity
      const soldCost = averageCost * event.quantity
      const proceeds = event.quantity * event.price - (event.fees || 0) - (event.taxes || 0)
      current.quantity -= event.quantity
      current.costAmount -= soldCost
      realizedPnL.set(key, (realizedPnL.get(key) || 0) + proceeds - soldCost)
    }
    current.averageCost = current.quantity === 0 ? 0 : current.costAmount / current.quantity
    positions.set(key, current)
  }

  for (const [key, position] of positions) {
    const lastPrice = lastPrices.get(position.instrumentId) ?? null
    const marketValue = lastPrice === null ? null : position.quantity * lastPrice
    positions.set(key, {
      ...position,
      lastPrice,
      marketValue,
      unrealizedPnL: marketValue === null ? null : marketValue - position.costAmount,
      realizedPnL: realizedPnL.get(key) || 0
    })
  }

  return [...positions.values()].filter((position) => Math.abs(position.quantity) > 1e-9)
}

function projectCash(events) {
  const balances = new Map()
  function bump(accountId, currency, amount) {
    const key = `${accountId}:${currency}`
    const current = balances.get(key) || { accountId, currency, balance: 0 }
    current.balance += amount
    balances.set(key, current)
  }

  for (const event of events) {
    if (event.type === 'opening_balance') bump(event.accountId, event.currency, event.amount)
    if (event.type === 'deposit') bump(event.accountId, event.currency, event.amount)
    if (event.type === 'withdrawal') bump(event.accountId, event.currency, -event.amount)
    if (event.type === 'buy') bump(event.accountId, event.currency, -(event.quantity * event.price + (event.fees || 0) + (event.taxes || 0)))
    if (event.type === 'sell') bump(event.accountId, event.currency, event.quantity * event.price - (event.fees || 0) - (event.taxes || 0))
    if (event.type === 'dividend') bump(event.accountId, event.currency, event.amount)
    if (event.type === 'fee') bump(event.accountId, event.currency, -event.amount)
  }

  return [...balances.values()].filter((balance) => Math.abs(balance.balance) > 1e-9)
}

async function getPortfolioSummary(args = {}) {
  const vaultDir = resolveVaultDir(args)
  const [config, events, drafts] = await Promise.all([readConfig(vaultDir), readLedgerEvents(vaultDir), listImportDrafts(vaultDir)])
  return {
    vaultDir,
    baseCurrency: config.baseCurrency,
    accounts: config.accounts,
    instruments: config.instruments,
    positions: projectPositions(events),
    cashByAccount: projectCash(events),
    pendingDraftCount: drafts.filter((draft) => draft.status === 'draft').length,
    updatedAt: now()
  }
}

function toolDefinitions() {
  return [
    {
      name: 'get_portfolio_summary',
      title: 'Get Portfolio Summary',
      description: 'Read the local Portfolio Vault summary, including accounts, instruments, derived positions, cash balances, and pending draft count.',
      inputSchema: {
        type: 'object',
        properties: {
          vaultDir: { type: 'string', description: 'Optional absolute Portfolio Vault directory. Defaults to ~/Documents/PortfolioVault.' }
        },
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: 'list_import_drafts',
      title: 'List Import Drafts',
      description: 'List pending and historical import drafts. Drafts must be approved in the local web UI before formal ledger entry.',
      inputSchema: {
        type: 'object',
        properties: {
          vaultDir: { type: 'string', description: 'Optional absolute Portfolio Vault directory. Defaults to ~/Documents/PortfolioVault.' }
        },
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: 'create_import_draft',
      title: 'Create Import Draft',
      description: 'Create a reviewed import draft from parsed CSV or screenshot data. This tool never appends to the formal ledger.',
      inputSchema: {
        type: 'object',
        properties: {
          vaultDir: { type: 'string', description: 'Optional absolute Portfolio Vault directory. Defaults to ~/Documents/PortfolioVault.' },
          sourceType: { type: 'string', enum: ['csv', 'image', 'manual'] },
          sourceFileName: { type: 'string' },
          accountId: { type: 'string' },
          accountConfidence: { type: 'number' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true
            }
          }
        },
        required: ['sourceType', 'rows'],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    {
      name: 'get_instrument_registry',
      title: 'Get Instrument Registry',
      description: 'Read confirmed instrument metadata from the local Portfolio Vault config.',
      inputSchema: {
        type: 'object',
        properties: {
          vaultDir: { type: 'string', description: 'Optional absolute Portfolio Vault directory. Defaults to ~/Documents/PortfolioVault.' }
        },
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    }
  ]
}

async function handleToolCall(id, params) {
  const args = params?.arguments || {}
  const vaultDir = resolveVaultDir(args)

  if (params?.name === 'get_portfolio_summary') {
    const summary = await getPortfolioSummary(args)
    sendResult(id, {
      content: [{ type: 'text', text: `Portfolio Vault has ${summary.positions.length} open positions and ${summary.pendingDraftCount} pending import drafts.` }],
      structuredContent: summary
    })
    return
  }

  if (params?.name === 'list_import_drafts') {
    const drafts = await listImportDrafts(vaultDir)
    sendResult(id, {
      content: [{ type: 'text', text: drafts.length === 0 ? 'No Portfolio Vault import drafts found.' : `${drafts.length} import draft(s) found.` }],
      structuredContent: { vaultDir, drafts }
    })
    return
  }

  if (params?.name === 'create_import_draft') {
    const draft = await createImportDraft(args, vaultDir)
    sendResult(id, {
      content: [{ type: 'text', text: `Created Portfolio Vault import draft ${draft.id}. Review and approve it in the local web UI.` }],
      structuredContent: { vaultDir, draft }
    })
    return
  }

  if (params?.name === 'get_instrument_registry') {
    const config = await readConfig(vaultDir)
    sendResult(id, {
      content: [{ type: 'text', text: `${config.instruments.length} confirmed instrument(s) in Portfolio Vault.` }],
      structuredContent: { vaultDir, instruments: config.instruments }
    })
    return
  }

  sendError(id, JsonRpcError.INVALID_PARAMS, `Unknown tool: ${params?.name || ''}`)
}

async function handleRequest(message) {
  const { id, method, params } = message

  if (method === 'initialize') {
    sendResult(id, {
      protocolVersion: params?.protocolVersion || '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      },
      instructions:
        'Use Portfolio Vault for local investment ledger and position context. Read tools are safe for summaries. create_import_draft may write only draft files; formal ledger approval must happen in the local web UI.'
    })
    return
  }

  if (method === 'ping') {
    sendResult(id, {})
    return
  }

  if (method === 'tools/list') {
    sendResult(id, { tools: toolDefinitions() })
    return
  }

  if (method === 'tools/call') {
    try {
      await handleToolCall(id, params)
    } catch (error) {
      sendError(id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error))
    }
    return
  }

  if (id !== undefined) {
    sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}

const lines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
})

lines.on('line', (line) => {
  if (line.trim().length === 0) return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  handleRequest(message).catch((error) => {
    if (message.id !== undefined) {
      sendError(message.id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error))
    }
  })
})
