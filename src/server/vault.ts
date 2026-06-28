import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

export type CurrencyCode = string

export type Account = {
  id: string
  name: string
  type: 'brokerage' | 'cash' | 'fund' | 'other'
  currency: CurrencyCode
  institution?: string
  createdAt: string
}

export type Instrument = {
  id: string
  symbol: string
  name: string
  assetClass: 'stock' | 'etf' | 'fund' | 'cash'
  currency: CurrencyCode
  market?: string
  industry?: string
  region?: string
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export type LedgerEventBase = {
  id: string
  type: string
  occurredAt: string
  accountId: string
  currency: CurrencyCode
  sourceBatchId?: string
  memo?: string
  createdAt: string
}

export type OpeningPositionEvent = LedgerEventBase & {
  type: 'opening_position'
  instrumentId: string
  quantity: number
  costAmount: number
}

export type OpeningBalanceEvent = LedgerEventBase & {
  type: 'opening_balance'
  amount: number
}

export type BuyEvent = LedgerEventBase & {
  type: 'buy'
  instrumentId: string
  quantity: number
  price: number
  fees?: number
  taxes?: number
}

export type SellEvent = LedgerEventBase & {
  type: 'sell'
  instrumentId: string
  quantity: number
  price: number
  fees?: number
  taxes?: number
}

export type DividendEvent = LedgerEventBase & {
  type: 'dividend'
  instrumentId?: string
  amount: number
}

export type FeeEvent = LedgerEventBase & {
  type: 'fee'
  amount: number
}

export type CashTransferEvent = LedgerEventBase & {
  type: 'deposit' | 'withdrawal'
  amount: number
}

export type PriceSnapshotEvent = LedgerEventBase & {
  type: 'price_snapshot'
  instrumentId: string
  price: number
}

export type CorrectionEvent = LedgerEventBase & {
  type: 'correction' | 'reversal'
  targetEventId: string
  reason: string
}

export type LedgerEvent =
  | OpeningPositionEvent
  | OpeningBalanceEvent
  | BuyEvent
  | SellEvent
  | DividendEvent
  | FeeEvent
  | CashTransferEvent
  | PriceSnapshotEvent
  | CorrectionEvent

export type ImportDraftRow = {
  id: string
  status: 'ready' | 'needs_review' | 'duplicate_suspected' | 'unsupported'
  confidence: number
  proposedEvent?: Partial<LedgerEvent>
  rawText?: string
  issues?: string[]
  duplicateOf?: string
}

export type ImportDraft = {
  id: string
  status: 'draft' | 'approved' | 'rejected'
  sourceType: 'csv' | 'image' | 'manual'
  sourceFileName?: string
  accountId?: string
  accountConfidence?: number
  rows: ImportDraftRow[]
  createdAt: string
  updatedAt: string
}

export type VaultConfig = {
  version: 1
  baseCurrency: CurrencyCode | null
  accounts: Account[]
  instruments: Instrument[]
  accountMappings: Array<{
    id: string
    pattern: string
    accountId: string
    confidence: number
    createdAt: string
  }>
}

export type PositionSummary = {
  instrumentId: string
  accountId: string
  quantity: number
  costAmount: number
  averageCost: number
  lastPrice: number | null
  marketValue: number | null
  unrealizedPnL: number | null
  realizedPnL: number
  currency: CurrencyCode
}

export type PortfolioSummary = {
  vaultDir: string
  baseCurrency: CurrencyCode | null
  accounts: Account[]
  instruments: Instrument[]
  positions: PositionSummary[]
  cashByAccount: Array<{
    accountId: string
    currency: CurrencyCode
    balance: number
  }>
  pendingDraftCount: number
  updatedAt: string
}

export function defaultVaultDir() {
  return join(homedir(), 'Documents', 'PortfolioVault')
}

export function resolveVaultDir(input?: string | null) {
  return resolve(input?.trim() || process.env.PORTFOLIO_VAULT_DIR || defaultVaultDir())
}

function now() {
  return new Date().toISOString()
}

function paths(vaultDir: string) {
  return {
    config: join(vaultDir, 'config.json'),
    events: join(vaultDir, 'events.jsonl'),
    drafts: join(vaultDir, 'import-drafts'),
    imports: join(vaultDir, 'imports'),
    derived: join(vaultDir, 'derived'),
    positions: join(vaultDir, 'derived', 'positions.json')
  }
}

async function exists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  await writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`)
  await rename(tempFile, filePath)
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!(await exists(filePath))) return fallback
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export async function ensureVault(vaultDir = resolveVaultDir()) {
  const p = paths(vaultDir)
  await Promise.all([mkdir(p.drafts, { recursive: true }), mkdir(p.imports, { recursive: true }), mkdir(p.derived, { recursive: true })])
  if (!(await exists(p.config))) {
    const config: VaultConfig = {
      version: 1,
      baseCurrency: null,
      accounts: [],
      instruments: [],
      accountMappings: []
    }
    await writeJsonAtomic(p.config, config)
  }
  if (!(await exists(p.events))) {
    await writeFile(p.events, '')
  }
  return { vaultDir, paths: p }
}

export async function readConfig(vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  return readJson<VaultConfig>(p.config, {
    version: 1,
    baseCurrency: null,
    accounts: [],
    instruments: [],
    accountMappings: []
  })
}

export async function saveConfig(config: VaultConfig, vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  await writeJsonAtomic(p.config, config)
  return config
}

export async function appendLedgerEvents(events: LedgerEvent[], vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  if (events.length === 0) return
  const lines = events.map((event) => JSON.stringify(event)).join('\n')
  await writeFile(p.events, `${lines}\n`, { flag: 'a' })
  await rebuildDerived(vaultDir)
}

export async function readLedgerEvents(vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  const text = await readFile(p.events, 'utf8')
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEvent)
}

export async function listImportDrafts(vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  const entries = await readdir(p.drafts, { withFileTypes: true })
  const drafts = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => readJson<ImportDraft>(join(p.drafts, entry.name), null as unknown as ImportDraft))
  )
  return drafts.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function createImportDraft(input: Omit<ImportDraft, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }, vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  const timestamp = now()
  const draft: ImportDraft = {
    ...input,
    id: input.id || `draft_${Date.now()}_${randomUUID().slice(0, 8)}`,
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  await writeJsonAtomic(join(p.drafts, `${draft.id}.json`), draft)
  return draft
}

export async function approveImportDraft(draftId: string, vaultDir = resolveVaultDir()) {
  const { paths: p } = await ensureVault(vaultDir)
  const draftPath = join(p.drafts, `${basename(draftId)}.json`)
  const draft = await readJson<ImportDraft | null>(draftPath, null)
  if (!draft) throw new Error(`Import draft not found: ${draftId}`)
  if (draft.status !== 'draft') throw new Error(`Import draft is not pending: ${draftId}`)

  const events = draft.rows
    .filter((row) => row.status === 'ready' && row.proposedEvent)
    .map((row) => normalizeLedgerEvent(row.proposedEvent!, draft.id))

  if (events.length === 0) throw new Error('No ready rows are available to approve.')

  await appendLedgerEvents(events, vaultDir)
  const approved: ImportDraft = { ...draft, status: 'approved', updatedAt: now() }
  await writeJsonAtomic(draftPath, approved)
  await rebuildDerived(vaultDir)
  return approved
}

function normalizeLedgerEvent(input: Partial<LedgerEvent>, sourceBatchId: string): LedgerEvent {
  if (!input.type || !input.accountId || !input.currency || !input.occurredAt) {
    throw new Error('Draft event is missing required fields.')
  }
  return {
    ...input,
    id: input.id || `event_${Date.now()}_${randomUUID().slice(0, 8)}`,
    createdAt: input.createdAt || now(),
    sourceBatchId
  } as LedgerEvent
}

export async function rebuildDerived(vaultDir = resolveVaultDir()) {
  const [config, events, drafts] = await Promise.all([readConfig(vaultDir), readLedgerEvents(vaultDir), listImportDrafts(vaultDir)])
  const positions = projectPositions(events)
  const cashByAccount = projectCash(events)
  const summary: PortfolioSummary = {
    vaultDir,
    baseCurrency: config.baseCurrency,
    accounts: config.accounts,
    instruments: config.instruments,
    positions,
    cashByAccount,
    pendingDraftCount: drafts.filter((draft) => draft.status === 'draft').length,
    updatedAt: now()
  }
  const { paths: p } = await ensureVault(vaultDir)
  await writeJsonAtomic(p.positions, summary)
  return summary
}

export async function getPortfolioSummary(vaultDir = resolveVaultDir()) {
  await ensureVault(vaultDir)
  return rebuildDerived(vaultDir)
}

function positionKey(event: LedgerEvent & { instrumentId?: string }) {
  return `${event.accountId}:${event.instrumentId}`
}

function projectPositions(events: LedgerEvent[]) {
  const positions = new Map<string, PositionSummary>()
  const realizedPnL = new Map<string, number>()
  const lastPrices = new Map<string, number>()

  for (const event of events) {
    if (event.type === 'price_snapshot') {
      lastPrices.set(event.instrumentId, event.price)
      continue
    }

    if (!('instrumentId' in event) || !event.instrumentId) continue
    const key = positionKey(event)
    const current =
      positions.get(key) ??
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
      current.costAmount += event.quantity * event.price + (event.fees ?? 0) + (event.taxes ?? 0)
    }

    if (event.type === 'sell') {
      const averageCost = current.quantity === 0 ? 0 : current.costAmount / current.quantity
      const soldCost = averageCost * event.quantity
      const proceeds = event.quantity * event.price - (event.fees ?? 0) - (event.taxes ?? 0)
      current.quantity -= event.quantity
      current.costAmount -= soldCost
      realizedPnL.set(key, (realizedPnL.get(key) ?? 0) + proceeds - soldCost)
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
      realizedPnL: realizedPnL.get(key) ?? 0
    })
  }

  return [...positions.values()].filter((position) => Math.abs(position.quantity) > 1e-9)
}

function projectCash(events: LedgerEvent[]) {
  const balances = new Map<string, { accountId: string; currency: CurrencyCode; balance: number }>()
  function bump(accountId: string, currency: CurrencyCode, amount: number) {
    const key = `${accountId}:${currency}`
    const current = balances.get(key) ?? { accountId, currency, balance: 0 }
    current.balance += amount
    balances.set(key, current)
  }

  for (const event of events) {
    if (event.type === 'opening_balance') bump(event.accountId, event.currency, event.amount)
    if (event.type === 'deposit') bump(event.accountId, event.currency, event.amount)
    if (event.type === 'withdrawal') bump(event.accountId, event.currency, -event.amount)
    if (event.type === 'buy') bump(event.accountId, event.currency, -(event.quantity * event.price + (event.fees ?? 0) + (event.taxes ?? 0)))
    if (event.type === 'sell') bump(event.accountId, event.currency, event.quantity * event.price - (event.fees ?? 0) - (event.taxes ?? 0))
    if (event.type === 'dividend') bump(event.accountId, event.currency, event.amount)
    if (event.type === 'fee') bump(event.accountId, event.currency, -event.amount)
  }

  return [...balances.values()].filter((balance) => Math.abs(balance.balance) > 1e-9)
}
