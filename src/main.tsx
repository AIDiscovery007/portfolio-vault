import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ArrowDownToLine,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Grid2X2,
  Landmark,
  LayoutList,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  WalletCards
} from 'lucide-react'
import './styles.css'

type Account = {
  id: string
  name: string
  type: string
  currency: string
  institution?: string
}

type Instrument = {
  id: string
  symbol: string
  name: string
  assetClass: 'stock' | 'etf' | 'fund' | 'cash'
  currency: string
  market?: string
  industry?: string
  region?: string
}

type Position = {
  instrumentId: string
  accountId: string
  quantity: number
  costAmount: number
  averageCost: number
  lastPrice: number | null
  marketValue: number | null
  unrealizedPnL: number | null
  realizedPnL: number
  currency: string
}

type CashBalance = {
  accountId: string
  currency: string
  balance: number
}

type PortfolioSummary = {
  vaultDir: string
  baseCurrency: string | null
  accounts: Account[]
  instruments: Instrument[]
  positions: Position[]
  cashByAccount: CashBalance[]
  pendingDraftCount: number
  updatedAt: string
}

type ViewMode = 'overview' | 'positions' | 'imports'

const navItems = [
  { id: 'overview' as const, icon: Grid2X2, label: 'Overview' },
  { id: 'positions' as const, icon: LayoutList, label: 'Positions' },
  { id: 'imports' as const, icon: Upload, label: 'Imports' }
]

const emptySummary: PortfolioSummary = {
  vaultDir: '/Users/qiaochao/Documents/PortfolioVault',
  baseCurrency: null,
  updatedAt: new Date(0).toISOString(),
  pendingDraftCount: 0,
  accounts: [],
  instruments: [],
  positions: [],
  cashByAccount: []
}

function App() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('overview')
  const [accountFilter, setAccountFilter] = useState('all')
  const [queryOpen, setQueryOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSummary() {
      setLoading(true)
      try {
        const response = await fetch('/api/summary')
        if (!response.ok) throw new Error(`Summary request failed: ${response.status}`)
        const data = (await response.json()) as PortfolioSummary
        if (!cancelled) setSummary(data)
      } catch {
        if (!cancelled) setSummary(emptySummary)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSummary()
    return () => {
      cancelled = true
    }
  }, [])

  const data = summary ?? emptySummary
  const instruments = useMemo(() => new Map(data.instruments.map((instrument) => [instrument.id, instrument])), [data.instruments])
  const accounts = useMemo(() => new Map(data.accounts.map((account) => [account.id, account])), [data.accounts])
  const filteredPositions = useMemo(() => {
    const positions = data.positions.filter((item) => accountFilter === 'all' || item.accountId === accountFilter)
    return positions.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
  }, [accountFilter, data.positions])

  const totalMarket = sum(data.positions.map((item) => item.marketValue ?? item.costAmount))
  const totalCash = sum(data.cashByAccount.map((item) => item.balance))
  const unrealized = sum(data.positions.map((item) => item.unrealizedPnL ?? 0))
  const realized = sum(data.positions.map((item) => item.realizedPnL))
  const totalAssets = totalMarket + totalCash
  const assetAllocation = allocation(data.positions, instruments, (instrument) => labelAssetClass(instrument?.assetClass))
  const currencyAllocation = allocation(data.positions, instruments, (instrument, position) => instrument?.currency ?? position.currency)
  const accountAllocation = accountSummary(data.positions, data.cashByAccount, accounts)
  const topPositions = filteredPositions.slice(0, 8)
  const isEmpty = !hasPortfolioData(data)

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Portfolio navigation">
        <div className="brand-mark" title="Portfolio Vault">
          <BriefcaseBusiness size={20} strokeWidth={1.8} />
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={mode === item.id ? 'active' : ''}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => setMode(item.id)}
              >
                <Icon size={19} strokeWidth={1.65} />
                {item.id === 'imports' && data.pendingDraftCount > 0 ? <span className="pin">{data.pendingDraftCount}</span> : null}
              </button>
            )
          })}
        </nav>
        <button className="rail-bottom" type="button" title="Settings" aria-label="Settings">
          <Settings size={19} strokeWidth={1.65} />
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="crumb">Main Vault</p>
            <h1>Portfolio Vault</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" title="Search" aria-label="Search" onClick={() => setQueryOpen((value) => !value)}>
              <Search size={17} strokeWidth={1.7} />
            </button>
            <button className="icon-button" type="button" title="Refresh" aria-label="Refresh" onClick={() => window.location.reload()}>
              <RefreshCw size={17} strokeWidth={1.7} />
            </button>
            <span className="base-currency">{data.baseCurrency ?? 'Set base currency'}</span>
            <CheckCircle2 className="ok-icon" size={17} strokeWidth={1.8} />
          </div>
        </header>

        {queryOpen ? (
          <label className="quiet-search">
            <Search size={16} strokeWidth={1.7} />
            <input aria-label="Search positions" placeholder="Search is intentionally lightweight in this MVP" />
          </label>
        ) : null}

        <section className="metrics" aria-label="Portfolio summary">
          <Metric icon={CircleDollarSign} label="Total" value={money(totalAssets)} detail={loading ? 'Loading local vault' : 'Latest local snapshot'} />
          <Metric icon={WalletCards} label="Cash" value={money(totalCash)} detail={`${percent(totalCash, totalAssets)} of assets`} />
          <Metric icon={Gauge} label="Unrealized" value={signedMoney(unrealized)} detail={percent(unrealized, totalMarket)} tone={unrealized >= 0 ? 'good' : 'bad'} />
          <Metric icon={ArrowDownToLine} label="Drafts" value={String(data.pendingDraftCount)} detail="Need review" tone={data.pendingDraftCount > 0 ? 'warn' : 'neutral'} />
        </section>

        <section className="focus-grid">
          <article className="exposure-panel">
            <PanelHeading icon={Gauge} title="Exposure" subtitle={`${data.positions.length} positions`} />
            <StackBar items={assetAllocation} />
            <AllocationList items={assetAllocation} />
          </article>

          <article className="side-panel">
            <PanelHeading icon={Landmark} title="Accounts" />
            <CompactList items={accountAllocation.slice(0, 4)} emptyText="No accounts yet" />
          </article>

          <article className="side-panel">
            <PanelHeading icon={CircleDollarSign} title="Currency" />
            <CompactList items={currencyAllocation.slice(0, 4)} emptyText="No currency exposure" />
          </article>
        </section>

        <section className="table-section" aria-label="Core positions">
          <div className="section-title-row">
            <div>
              <h2>Core Positions</h2>
              <p>{isEmpty ? 'Add a reviewed import draft or manual opening balance to begin.' : modeLabel(mode)}</p>
            </div>
            <div className="table-tools">
              <select value={accountFilter} aria-label="Filter by account" onChange={(event) => setAccountFilter(event.target.value)} disabled={data.accounts.length === 0}>
                <option value="all">All accounts</option>
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <button className="icon-button" type="button" title="Filters" aria-label="Filters">
                <SlidersHorizontal size={17} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="position-table" role="table">
            <div className="table-row table-head" role="row">
              <span>Symbol</span>
              <span>Name</span>
              <span>Account</span>
              <span>Value</span>
              <span>P&amp;L</span>
              <span>Weight</span>
            </div>
            {topPositions.map((item) => {
              const instrument = instruments.get(item.instrumentId)
              const account = accounts.get(item.accountId)
              const value = item.marketValue ?? item.costAmount
              return (
                <div className="table-row" role="row" key={`${item.accountId}-${item.instrumentId}`}>
                  <span className="symbol">{instrument?.symbol ?? item.instrumentId}</span>
                  <span className="truncate">{instrument?.name ?? 'Unmapped instrument'}</span>
                  <span className="muted truncate">{account?.name ?? item.accountId}</span>
                  <span>{money(value, item.currency)}</span>
                  <span className={(item.unrealizedPnL ?? 0) >= 0 ? 'positive' : 'negative'}>{signedMoney(item.unrealizedPnL ?? 0, item.currency)}</span>
                  <span>{percent(value, totalAssets)}</span>
                </div>
              )
            })}
            {topPositions.length === 0 ? (
              <div className="empty-table">
                <LayoutList size={18} strokeWidth={1.7} />
                <span>No positions recorded</span>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  )
}

function hasPortfolioData(summary: PortfolioSummary) {
  return summary.accounts.length > 0 || summary.instruments.length > 0 || summary.positions.length > 0 || summary.cashByAccount.length > 0
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral'
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'good' | 'bad' | 'warn'
}) {
  return (
    <article className={`metric ${tone}`}>
      <Icon size={18} strokeWidth={1.7} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  )
}

function PanelHeading({
  icon: Icon,
  title,
  subtitle
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  subtitle?: string
}) {
  return (
    <header className="panel-heading">
      <Icon size={17} strokeWidth={1.7} />
      <h2>{title}</h2>
      {subtitle ? <span>{subtitle}</span> : null}
    </header>
  )
}

function StackBar({ items }: { items: AllocationItem[] }) {
  if (items.length === 0) return <div className="stack-bar empty" aria-label="No allocation yet" />

  return (
    <div className="stack-bar" aria-label="Allocation bar">
      {items.map((item, index) => (
        <span key={item.label} style={{ width: `${item.weight}%`, background: palette[index % palette.length] }} title={`${item.label}: ${item.weight.toFixed(1)}%`} />
      ))}
    </div>
  )
}

function AllocationList({ items }: { items: AllocationItem[] }) {
  if (items.length === 0) return <p className="empty-note">No exposure yet</p>

  return (
    <div className="allocation-list">
      {items.slice(0, 5).map((item, index) => (
        <div key={item.label}>
          <i style={{ background: palette[index % palette.length] }} />
          <span>{item.label}</span>
          <strong>{item.weight.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  )
}

function CompactList({ items, emptyText }: { items: AllocationItem[]; emptyText: string }) {
  if (items.length === 0) return <p className="empty-note">{emptyText}</p>

  return (
    <div className="compact-list">
      {items.map((item) => (
        <div key={item.label}>
          <span className="truncate">{item.label}</span>
          <strong>{money(item.value)}</strong>
          <em>{item.weight.toFixed(1)}%</em>
        </div>
      ))}
    </div>
  )
}

type AllocationItem = {
  label: string
  value: number
  weight: number
}

const palette = ['#335f42', '#6d8f71', '#8fb09d', '#6f8ba3', '#a88498', '#c5c9c2']

function allocation(
  positions: Position[],
  instruments: Map<string, Instrument>,
  getLabel: (instrument: Instrument | undefined, position: Position) => string
): AllocationItem[] {
  const totals = new Map<string, number>()
  for (const position of positions) {
    const value = position.marketValue ?? position.costAmount
    const label = getLabel(instruments.get(position.instrumentId), position)
    totals.set(label, (totals.get(label) ?? 0) + value)
  }
  const total = sum([...totals.values()])
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value, weight: total === 0 ? 0 : (value / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}

function accountSummary(positions: Position[], cash: CashBalance[], accounts: Map<string, Account>) {
  const totals = new Map<string, number>()
  for (const position of positions) {
    totals.set(position.accountId, (totals.get(position.accountId) ?? 0) + (position.marketValue ?? position.costAmount))
  }
  for (const item of cash) {
    totals.set(item.accountId, (totals.get(item.accountId) ?? 0) + item.balance)
  }
  const total = sum([...totals.values()])
  return [...totals.entries()]
    .map(([accountId, value]) => ({
      label: accounts.get(accountId)?.name ?? accountId,
      value,
      weight: total === 0 ? 0 : (value / total) * 100
    }))
    .sort((a, b) => b.value - a.value)
}

function labelAssetClass(assetClass?: string) {
  if (assetClass === 'etf') return 'ETF'
  if (assetClass === 'fund') return 'Fund'
  if (assetClass === 'stock') return 'Stock'
  if (assetClass === 'cash') return 'Cash'
  return 'Other'
}

function modeLabel(mode: ViewMode) {
  if (mode === 'imports') return 'Import review stays visible through the draft counter.'
  if (mode === 'positions') return 'Filtered view of the holdings that matter now.'
  return 'A minimal read of value, exposure, and concentration.'
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(value)
}

function signedMoney(value: number, currency = 'USD') {
  const formatted = money(Math.abs(value), currency)
  return `${value >= 0 ? '+' : '-'}${formatted}`
}

function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return '0.0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
