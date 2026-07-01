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

export type HoldingSnapshotEvent = LedgerEventBase & {
  type: 'holding_snapshot'
  instrumentId: string
  cashInvested?: number
  marketValue: number
  unrealizedPnL?: number
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
  | HoldingSnapshotEvent
  | CorrectionEvent

export type ImportDraftRow = {
  id: string
  status: 'ready' | 'needs_review' | 'duplicate_suspected' | 'unsupported'
  confidence: number
  proposedEvent?: Partial<LedgerEvent>
  rawText?: string
  issues?: string[]
  duplicateOf?: string
  extractedHolding?: {
    name?: string
    officialName?: string
    fundCode?: string
    securityCode?: string
    symbol?: string
    assetClass?: Instrument['assetClass']
    market?: string
    currency?: CurrencyCode
    cashInvested?: number
    marketValue?: number
    holdingPnl?: number
    holdingPnlPct?: number
    allocationPct?: number
    unitNav?: number
    navDate?: string
    estimatedShares?: number
    matchSource?: string
    matchConfidence?: number
  }
}

export type ImportDraft = {
  id: string
  status: 'draft' | 'approved' | 'rejected'
  sourceType: 'csv' | 'image' | 'manual'
  sourceFileName?: string
  accountId?: string
  accountConfidence?: number
  rows: ImportDraftRow[]
  approvedAt?: string
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
  cashInvested: number
  marketValue: number | null
  unrealizedPnL: number | null
  returnPct: number | null
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

  const approvalTimestamp = now()
  const config = await readConfig(vaultDir)
  if (upsertInstrumentsFromDrafts(config, [draft], approvalTimestamp)) {
    await saveConfig(config, vaultDir)
  }
  await appendLedgerEvents(events, vaultDir)
  const approved: ImportDraft = { ...draft, status: 'approved', approvedAt: approvalTimestamp, updatedAt: approvalTimestamp }
  await writeJsonAtomic(draftPath, approved)
  await rebuildDerived(vaultDir)
  return approved
}

function normalizeLedgerEvent(input: Partial<LedgerEvent>, sourceBatchId: string): LedgerEvent {
  if (!input.type || !input.accountId || !input.currency || !input.occurredAt) {
    throw new Error('Draft event is missing required fields.')
  }
  if (input.type === 'holding_snapshot' && (!('instrumentId' in input) || !input.instrumentId || typeof input.marketValue !== 'number')) {
    throw new Error('Holding snapshot rows require instrumentId and marketValue.')
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
  let configChanged = upsertInstrumentsFromDrafts(
    config,
    drafts.filter((draft) => draft.status === 'approved'),
    now()
  )
  const positions = projectPositions(events)
  const cashByAccount = projectCash(events)
  const inferredBaseCurrency = config.baseCurrency ?? inferBaseCurrency(positions, cashByAccount)
  if (!config.baseCurrency && inferredBaseCurrency) {
    config.baseCurrency = inferredBaseCurrency
    configChanged = true
  }
  if (configChanged) await saveConfig(config, vaultDir)
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

function upsertInstrumentsFromDrafts(config: VaultConfig, drafts: ImportDraft[], timestamp: string) {
  const knownInstruments = new Map(config.instruments.map((instrument) => [instrument.id, instrument]))
  let changed = false

  for (const draft of drafts) {
    for (const row of draft.rows) {
      const event = row.proposedEvent
      if (!event || !('instrumentId' in event) || !event.instrumentId) continue

      const holding = row.extractedHolding
      const symbol = holding?.fundCode ?? holding?.securityCode ?? holding?.symbol ?? inferSymbolFromInstrumentId(event.instrumentId)
      const name = holding?.officialName ?? holding?.name ?? symbol ?? event.instrumentId
      const assetClass = holding?.assetClass ?? inferAssetClassFromHolding(holding, event)
      const currency = holding?.currency ?? event.currency ?? config.baseCurrency ?? 'CNY'
      const market = holding?.market ?? (holding?.fundCode && assetClass === 'fund' ? inferFundMarket(holding.fundCode) : undefined)
      const notes = holding?.matchSource ? `Imported from draft metadata. Source: ${holding.matchSource}.` : 'Imported from draft metadata.'
      const existing = knownInstruments.get(event.instrumentId)

      if (existing) {
        const nextSymbol = symbol ?? existing.symbol
        if (
          existing.symbol !== nextSymbol ||
          existing.name !== name ||
          existing.assetClass !== assetClass ||
          existing.currency !== currency ||
          existing.market !== market ||
          existing.notes !== notes
        ) {
          existing.symbol = nextSymbol
          existing.name = name
          existing.assetClass = assetClass
          existing.currency = currency
          existing.market = market
          existing.notes = notes
          existing.updatedAt = timestamp
          changed = true
        }
        continue
      }

      config.instruments.push({
        id: event.instrumentId,
        symbol: symbol ?? event.instrumentId,
        name,
        assetClass,
        currency,
        market,
        tags: holding?.fundCode || holding?.securityCode ? ['imported'] : undefined,
        notes,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      const instrument = config.instruments[config.instruments.length - 1]
      if (instrument) knownInstruments.set(instrument.id, instrument)
      changed = true
    }
  }

  return changed
}

function inferSymbolFromInstrumentId(instrumentId: string) {
  const codeMatch = instrumentId.match(/\d{6}/)
  return codeMatch?.[0] ?? instrumentId
}

function inferAssetClassFromEvent(type?: string): Instrument['assetClass'] {
  if (type === 'opening_balance') return 'cash'
  return 'fund'
}

function inferAssetClassFromHolding(holding: ImportDraftRow['extractedHolding'], event: Partial<LedgerEvent>): Instrument['assetClass'] {
  if (holding?.fundCode) return 'fund'
  const symbol = holding?.securityCode ?? holding?.symbol ?? ('instrumentId' in event ? event.instrumentId : undefined)
  if (symbol && /^(15|16|18|50|51|52|56|58)\d{4}$/.test(symbol)) return 'etf'
  if (symbol && /^(00|30|60|68|83|87|88|92)\d{4}$/.test(symbol)) return 'stock'
  return inferAssetClassFromEvent(event.type)
}

function inferFundMarket(fundCode: string) {
  if (fundCode.startsWith('968')) return 'HK mutual-recognition fund / overseas fund'
  return 'CN mutual fund'
}

function inferBaseCurrency(
  positions: PositionSummary[],
  cashByAccount: Array<{
    currency: CurrencyCode
    balance: number
  }>
) {
  const totals = new Map<CurrencyCode, number>()
  const fallback = positions[0]?.currency ?? cashByAccount[0]?.currency ?? null

  for (const position of positions) {
    const value = Math.abs(position.marketValue ?? position.costAmount)
    totals.set(position.currency, (totals.get(position.currency) ?? 0) + value)
  }

  for (const cash of cashByAccount) {
    totals.set(cash.currency, (totals.get(cash.currency) ?? 0) + Math.abs(cash.balance))
  }

  let bestCurrency: CurrencyCode | null = null
  let bestValue = 0
  for (const [currency, value] of totals) {
    if (value > bestValue) {
      bestCurrency = currency
      bestValue = value
    }
  }

  return bestCurrency ?? fallback
}

export async function getPortfolioSummary(vaultDir = resolveVaultDir()) {
  await ensureVault(vaultDir)
  return rebuildDerived(vaultDir)
}

function positionKey(event: LedgerEvent & { instrumentId?: string }) {
  return `${event.accountId}:${event.instrumentId}`
}

function snapshotTimestamp(event: LedgerEvent) {
  return event.occurredAt || event.createdAt || ''
}

function positionValue(position: PositionSummary) {
  return position.marketValue ?? position.costAmount
}

function deriveSnapshotAmounts(event: HoldingSnapshotEvent) {
  const marketValue = roundMoney(event.marketValue)
  const cashInvested = roundMoney(event.cashInvested ?? marketValue - (event.unrealizedPnL ?? 0))
  const unrealizedPnL = roundMoney(event.unrealizedPnL ?? marketValue - cashInvested)
  const returnPct = cashInvested === 0 ? null : roundRate(unrealizedPnL / cashInvested)

  return {
    cashInvested,
    marketValue,
    unrealizedPnL,
    returnPct
  }
}

function projectPositions(events: LedgerEvent[]) {
  const positions = new Map<string, PositionSummary>()
  const realizedPnL = new Map<string, number>()
  const lastPrices = new Map<string, number>()
  const snapshots = new Map<string, { event: HoldingSnapshotEvent; timestamp: string }>()

  for (const event of events) {
    if (event.type === 'price_snapshot') {
      lastPrices.set(event.instrumentId, event.price)
      continue
    }

    if (event.type === 'holding_snapshot') {
      const key = positionKey(event)
      const timestamp = snapshotTimestamp(event)
      const current = snapshots.get(key)
      if (!current || timestamp >= current.timestamp) {
        snapshots.set(key, { event, timestamp })
      }
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
        cashInvested: 0,
        marketValue: null,
        unrealizedPnL: null,
        returnPct: null,
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
    current.cashInvested = roundMoney(current.costAmount)
    positions.set(key, current)
  }

  for (const [key, position] of positions) {
    const lastPrice = lastPrices.get(position.instrumentId) ?? null
    const marketValue = lastPrice === null ? null : roundMoney(position.quantity * lastPrice)
    const cashInvested = roundMoney(position.costAmount)
    const unrealizedPnL = marketValue === null ? null : roundMoney(marketValue - cashInvested)
    positions.set(key, {
      ...position,
      lastPrice,
      cashInvested,
      marketValue,
      unrealizedPnL,
      returnPct: unrealizedPnL === null || cashInvested === 0 ? null : roundRate(unrealizedPnL / cashInvested),
      realizedPnL: realizedPnL.get(key) ?? 0
    })
  }

  for (const [key, snapshot] of snapshots) {
    const amounts = deriveSnapshotAmounts(snapshot.event)
    positions.set(key, {
      instrumentId: snapshot.event.instrumentId,
      accountId: snapshot.event.accountId,
      quantity: positions.get(key)?.quantity ?? 0,
      costAmount: amounts.cashInvested,
      averageCost: positions.get(key)?.averageCost ?? 0,
      lastPrice: null,
      cashInvested: amounts.cashInvested,
      marketValue: amounts.marketValue,
      unrealizedPnL: amounts.unrealizedPnL,
      returnPct: amounts.returnPct,
      realizedPnL: realizedPnL.get(key) ?? positions.get(key)?.realizedPnL ?? 0,
      currency: snapshot.event.currency
    })
  }

  return [...positions.values()].filter((position) => Math.abs(position.quantity) > 1e-9 || Math.abs(positionValue(position)) > 1e-9 || Math.abs(position.cashInvested) > 1e-9)
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function roundRate(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000
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
