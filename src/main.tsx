import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ArrowDownToLine,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
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

type DraftRow = {
  id: string
  status: 'ready' | 'needs_review' | 'duplicate_suspected' | 'unsupported'
  confidence: number
  proposedEvent?: {
    type?: string
    instrumentId?: string
    quantity?: number
    costAmount?: number
    price?: number
  }
  rawText?: string
  issues?: string[]
  extractedHolding?: {
    name?: string
    officialName?: string
    fundCode?: string
    currency?: string
    marketValue?: number
    holdingPnl?: number
    holdingPnlPct?: number
    allocationPct?: number
    unitNav?: number
    navDate?: string
    estimatedShares?: number
    matchConfidence?: number
    matchSource?: string
  }
}

type ImportDraft = {
  id: string
  status: 'draft' | 'approved' | 'rejected'
  sourceType: 'csv' | 'image' | 'manual'
  sourceFileName?: string
  accountId?: string
  accountConfidence?: number
  rows: DraftRow[]
  approvedAt?: string
  approvalAssumptions?: {
    approvedAt?: string
  }
  createdAt: string
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
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('overview')
  const [accountFilter, setAccountFilter] = useState('all')
  const [queryOpen, setQueryOpen] = useState(false)
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null)
  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null)
  const [confirmingDraft, setConfirmingDraft] = useState<ImportDraft | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadVaultState = useCallback(async (quiet = false) => {
    let cancelled = false
    if (!quiet) setLoading(true)
    try {
      const [summaryResponse, draftsResponse] = await Promise.all([fetch('/api/summary'), fetch('/api/drafts')])
      if (!summaryResponse.ok) throw new Error(`Summary request failed: ${summaryResponse.status}`)
      if (!draftsResponse.ok) throw new Error(`Draft request failed: ${draftsResponse.status}`)
      const [summaryData, draftData] = await Promise.all([summaryResponse.json() as Promise<PortfolioSummary>, draftsResponse.json() as Promise<{ drafts: ImportDraft[] }>])
      if (!cancelled) {
        setSummary(summaryData)
        setDrafts(draftData.drafts)
        setActionError(null)
      }
    } catch {
      if (!cancelled) {
        setSummary(emptySummary)
        setDrafts([])
      }
    } finally {
      if (!cancelled && !quiet) setLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const cancelLoad = loadVaultState()
    const events = new EventSource('/api/vault-events')
    const refreshQuietly = () => {
      void loadVaultState(true)
    }
    const refreshOnFocus = () => {
      if (!document.hidden) refreshQuietly()
    }

    events.addEventListener('vault-changed', refreshQuietly)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      void cancelLoad.then((cancel) => cancel())
      events.removeEventListener('vault-changed', refreshQuietly)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      events.close()
    }
  }, [loadVaultState])

  useEffect(() => {
    if (drafts.length === 0) {
      setExpandedDraftId(null)
      return
    }
    if (expandedDraftId && !drafts.some((draft) => draft.id === expandedDraftId)) {
      setExpandedDraftId(null)
    }
  }, [drafts, expandedDraftId])

  const data = summary ?? emptySummary
  const baseCurrency = data.baseCurrency ?? inferDisplayCurrency(data) ?? 'CNY'
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
  const isEmpty = !hasPortfolioData(data) && drafts.length === 0

  async function approveDraft(draft: ImportDraft) {
    setApprovingDraftId(draft.id)
    setActionError(null)
    try {
      const response = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}/approve`, { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `Approve failed: ${response.status}`)
      }
      await loadVaultState(true)
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setApprovingDraftId(null)
    }
  }

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
            <h1>Portfolio Vault</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" title="Search" aria-label="Search" onClick={() => setQueryOpen((value) => !value)}>
              <Search size={17} strokeWidth={1.7} />
            </button>
            <button className="icon-button" type="button" title="Refresh" aria-label="Refresh" onClick={() => window.location.reload()}>
              <RefreshCw size={17} strokeWidth={1.7} />
            </button>
            <span className="base-currency">{baseCurrency}</span>
            <CheckCircle2 className="ok-icon" size={17} strokeWidth={1.8} />
          </div>
        </header>

        {queryOpen ? (
          <label className="quiet-search">
            <Search size={16} strokeWidth={1.7} />
            <input aria-label="Search positions" placeholder="Search is intentionally lightweight in this MVP" />
          </label>
        ) : null}

        {isEmpty ? (
          <Onboarding />
        ) : (
          <>
            <section className="metrics" aria-label="Portfolio summary">
              <Metric icon={CircleDollarSign} label="总资产" value={money(totalAssets, baseCurrency)} detail={loading ? '读取本地 vault' : '本地最新快照'} />
              <Metric icon={WalletCards} label="现金" value={money(totalCash, baseCurrency)} detail={`占 ${percent(totalCash, totalAssets)}`} />
              <Metric icon={Gauge} label="浮动收益" value={signedMoney(unrealized, baseCurrency)} detail={percent(unrealized, totalMarket)} tone={unrealized >= 0 ? 'good' : 'bad'} />
              <Metric icon={ArrowDownToLine} label="待审草稿" value={String(data.pendingDraftCount)} detail="需要审核" tone={data.pendingDraftCount > 0 ? 'warn' : 'neutral'} />
            </section>

            <section className="focus-grid">
              <article className="exposure-panel">
                <PanelHeading icon={Gauge} title="资产暴露" subtitle={`${data.positions.length} 个仓位`} />
                <StackBar items={assetAllocation} />
                <AllocationList items={assetAllocation} />
              </article>

              <article className="side-panel">
                <PanelHeading icon={Landmark} title="账户" />
                <CompactList items={accountAllocation.slice(0, 4)} emptyText="暂无账户" currency={baseCurrency} />
              </article>

              <article className="side-panel">
                <PanelHeading icon={CircleDollarSign} title="币种" />
                <CompactList items={currencyAllocation.slice(0, 4)} emptyText="暂无币种暴露" currency={baseCurrency} />
              </article>
            </section>

            {mode === 'imports' ? (
              <DraftReviewSection
                drafts={drafts}
                expandedDraftId={expandedDraftId}
                approvingDraftId={approvingDraftId}
                actionError={actionError}
                baseCurrency={baseCurrency}
                onToggleDraft={(draftId) => setExpandedDraftId((current) => (current === draftId ? null : draftId))}
                onRequestApprove={setConfirmingDraft}
              />
            ) : (
              <PositionsSection
                accounts={accounts}
                accountFilter={accountFilter}
                baseCurrency={baseCurrency}
                instruments={instruments}
                positions={topPositions}
                totalAssets={totalAssets}
                allAccounts={data.accounts}
                mode={mode}
                onAccountFilterChange={setAccountFilter}
              />
            )}
          </>
        )}
      </section>

      {confirmingDraft ? (
        <ApproveDraftDialog
          draft={confirmingDraft}
          baseCurrency={baseCurrency}
          approving={approvingDraftId === confirmingDraft.id}
          error={actionError}
          onCancel={() => setConfirmingDraft(null)}
          onConfirm={() => {
            void approveDraft(confirmingDraft).then((approved) => {
              if (approved) setConfirmingDraft(null)
            })
          }}
        />
      ) : null}
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

function Onboarding() {
  const steps = [
    { icon: Upload, title: '交给 Codex', text: '把截图、CSV 或交易记录放进对话里，先生成待审草稿。' },
    { icon: Search, title: '核对关键信息', text: '代码、净值、金额、收益和问题会集中显示在审核页。' },
    { icon: CheckCircle2, title: '批准后入账', text: '确认无误后进入正式仓位，页面会自动同步刷新。' }
  ]

  return (
    <section className="onboarding" aria-label="快速开始">
      <div className="onboarding-copy">
        <p className="eyebrow">快速开始</p>
        <h2>先导入，再审核，最后入账。</h2>
        <p>Portfolio Vault 只把确认过的数据放进正式仓位。第一次使用时，你只需要从一份截图或 CSV 开始。</p>
      </div>
      <div className="onboarding-steps">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <article key={step.title}>
              <Icon size={20} strokeWidth={1.65} />
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PositionsSection({
  accounts,
  accountFilter,
  allAccounts,
  baseCurrency,
  instruments,
  mode,
  positions,
  totalAssets,
  onAccountFilterChange
}: {
  accounts: Map<string, Account>
  accountFilter: string
  allAccounts: Account[]
  baseCurrency: string
  instruments: Map<string, Instrument>
  mode: ViewMode
  positions: Position[]
  totalAssets: number
  onAccountFilterChange: (accountId: string) => void
}) {
  return (
    <section className="table-section" aria-label="Core positions">
      <div className="section-title-row">
        <div>
          <h2>核心仓位</h2>
          <p>{modeLabel(mode)}</p>
        </div>
        <div className="table-tools">
          <select value={accountFilter} aria-label="按账户筛选" onChange={(event) => onAccountFilterChange(event.target.value)} disabled={allAccounts.length === 0}>
            <option value="all">全部账户</option>
            {allAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <button className="icon-button" type="button" title="筛选" aria-label="筛选">
            <SlidersHorizontal size={17} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div className="position-table" role="table">
        <div className="table-row table-head" role="row">
          <span>代码</span>
          <span>名称</span>
          <span>账户</span>
          <span>市值</span>
          <span>收益</span>
          <span>占比</span>
        </div>
        {positions.map((item) => {
          const instrument = instruments.get(item.instrumentId)
          const account = accounts.get(item.accountId)
          const value = item.marketValue ?? item.costAmount
          return (
            <div className="table-row" role="row" key={`${item.accountId}-${item.instrumentId}`}>
              <span className="symbol">{instrument?.symbol ?? item.instrumentId}</span>
              <span className="truncate">{instrument?.name ?? '未映射标的'}</span>
              <span className="muted truncate">{account?.name ?? item.accountId}</span>
              <span>{money(value, item.currency ?? baseCurrency)}</span>
              <span className={(item.unrealizedPnL ?? 0) >= 0 ? 'positive' : 'negative'}>{signedMoney(item.unrealizedPnL ?? 0, item.currency ?? baseCurrency)}</span>
              <span>{percent(value, totalAssets)}</span>
            </div>
          )
        })}
        {positions.length === 0 ? (
          <div className="empty-table">
            <LayoutList size={18} strokeWidth={1.7} />
            <span>暂无正式仓位</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function DraftReviewSection({
  drafts,
  expandedDraftId,
  approvingDraftId,
  actionError,
  baseCurrency,
  onToggleDraft,
  onRequestApprove
}: {
  drafts: ImportDraft[]
  expandedDraftId: string | null
  approvingDraftId: string | null
  actionError: string | null
  baseCurrency: string
  onToggleDraft: (draftId: string) => void
  onRequestApprove: (draft: ImportDraft) => void
}) {
  if (drafts.length === 0) {
    return (
      <section className="table-section imports-section" aria-label="导入审核">
        <div className="empty-table tall">
          <Upload size={19} strokeWidth={1.7} />
          <span>暂无导入草稿</span>
        </div>
      </section>
    )
  }

  return (
    <section className="table-section imports-section" aria-label="导入审核">
      <div className="section-title-row">
        <div>
          <h2>导入审核</h2>
          <p>草稿先看清，再批准入账。</p>
        </div>
      </div>

      <div className="import-card-list">
        {drafts.map((draft) => {
          const stats = draftStats(draft)
          const isExpanded = expandedDraftId === draft.id
          const holdingRows = draft.rows.filter((row) => row.extractedHolding)
          const displayRows = holdingRows.length > 0 ? holdingRows : draft.rows
          const canApprove = draft.status === 'draft' && draft.rows.some((row) => row.status === 'ready' && row.proposedEvent)
          const bookedDate = bookedDateLabel(draft)

          return (
            <article className={`import-card ${isExpanded ? 'open' : ''}`} key={draft.id}>
              <button className="import-card-toggle" type="button" aria-expanded={isExpanded} onClick={() => onToggleDraft(draft.id)}>
                <span className={`status-pill ${draft.status}`}>{statusLabel(draft.status)}</span>
                <span className="import-card-main">
                  <strong>{draft.sourceFileName ?? '导入记录'}</strong>
                  <span className="import-card-subline">
                    <span>
                      <CalendarDays size={12} strokeWidth={1.7} />
                      {bookedDate ? `入账日 ${bookedDate}` : '未入账'}
                    </span>
                  </span>
                </span>
                <span className="import-card-metrics" aria-label="导入摘要">
                  <span>
                    <strong>{money(stats.marketValue, baseCurrency)}</strong>
                    <em>市值</em>
                  </span>
                  <span>
                    <strong>{stats.readyRows}/{draft.rows.length}</strong>
                    <em>{draft.status === 'approved' ? '已入账' : '可入账'}</em>
                  </span>
                  <span>
                    <strong>{stats.issueCount}</strong>
                    <em>提示</em>
                  </span>
                </span>
                <ChevronDown className="chevron" size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>

              {isExpanded ? (
                <div className="import-card-body">
                  {actionError ? <p className="action-error">{actionError}</p> : null}

                  <div className="draft-row-list">
                    {displayRows.map((row) => {
                      const holding = row.extractedHolding
                      const title = holding?.officialName ?? holding?.name ?? row.rawText ?? row.id
                      const pnl = holding?.holdingPnl ?? 0
                      return (
                        <article className="draft-row-card" key={row.id}>
                          <div>
                            <span className="symbol">{holding?.fundCode ?? row.proposedEvent?.instrumentId ?? row.proposedEvent?.type ?? '待确认'}</span>
                            <strong>{title}</strong>
                            <em>{holding?.navDate ? `${holding.navDate} · 净值 ${number(holding.unitNav)}` : row.rawText ?? '原始记录待确认'}</em>
                          </div>
                          <div>
                            <span>{holding?.marketValue === undefined ? '金额待确认' : money(holding.marketValue, holding.currency ?? baseCurrency)}</span>
                            <strong className={pnl >= 0 ? 'positive' : 'negative'}>{holding ? signedMoney(pnl, holding.currency ?? baseCurrency) : '--'}</strong>
                            <em>{holding?.estimatedShares ? `${number(holding.estimatedShares, 4)} 份` : '份额待确认'}</em>
                          </div>
                          <div>
                            <span className={`row-state ${draft.status === 'approved' ? 'ready' : row.status}`}>
                              {draft.status === 'approved' ? '已入账' : rowStatusLabel(row.status)}
                            </span>
                            <em>{holding?.allocationPct ? `${holding.allocationPct.toFixed(2)}%` : '占比待确认'}</em>
                          </div>
                          {row.issues && row.issues.length > 0 ? <p>{row.issues[0]}</p> : null}
                        </article>
                      )
                    })}
                  </div>

                  <div className="import-card-actions">
                    <button className="approve-button" type="button" disabled={!canApprove || approvingDraftId === draft.id} onClick={() => onRequestApprove(draft)}>
                      <CheckCircle2 size={16} strokeWidth={1.75} />
                      {draft.status === 'approved' ? '已入账' : approvingDraftId === draft.id ? '入账中' : canApprove ? '批准入账' : '待补齐'}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ApproveDraftDialog({
  draft,
  baseCurrency,
  approving,
  error,
  onCancel,
  onConfirm
}: {
  draft: ImportDraft
  baseCurrency: string
  approving: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const stats = draftStats(draft)
  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onCancel}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="approve-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <CheckCircle2 size={18} strokeWidth={1.75} />
          <h2 id="approve-dialog-title">确认入账</h2>
        </header>
        <p>确认后，这批草稿会写入正式仓位，并立即刷新本地看板。</p>
        {error ? <p className="action-error">{error}</p> : null}
        <div className="confirm-dialog-facts">
          <span>
            <strong>{money(stats.marketValue, baseCurrency)}</strong>
            <em>市值</em>
          </span>
          <span>
            <strong>{stats.readyRows}/{draft.rows.length}</strong>
            <em>可入账</em>
          </span>
          <span>
            <strong>{draft.accountId ?? '待确认'}</strong>
            <em>账户</em>
          </span>
        </div>
        <div className="confirm-dialog-actions">
          <button className="ghost-button" type="button" disabled={approving} onClick={onCancel}>
            取消
          </button>
          <button className="approve-button" type="button" disabled={approving} onClick={onConfirm}>
            <CheckCircle2 size={16} strokeWidth={1.75} />
            {approving ? '入账中' : '确认入账'}
          </button>
        </div>
      </section>
    </div>
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
  if (items.length === 0) return <p className="empty-note">暂无暴露</p>

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

function CompactList({ items, emptyText, currency }: { items: AllocationItem[]; emptyText: string; currency: string }) {
  if (items.length === 0) return <p className="empty-note">{emptyText}</p>

  return (
    <div className="compact-list">
      {items.map((item) => (
        <div key={item.label}>
          <span className="truncate">{item.label}</span>
          <strong>{money(item.value, currency)}</strong>
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
  if (assetClass === 'fund') return '基金'
  if (assetClass === 'stock') return '股票'
  if (assetClass === 'cash') return '现金'
  return '其他'
}

function modeLabel(mode: ViewMode) {
  if (mode === 'positions') return '聚焦当前正式仓位。'
  return '看总额、暴露和集中度。'
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function money(value: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(value)
}

function signedMoney(value: number, currency = 'CNY') {
  const formatted = money(Math.abs(value), currency)
  return `${value >= 0 ? '+' : '-'}${formatted}`
}

function number(value?: number, maximumFractionDigits = 4) {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(value)
}

function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return '0.0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

function bookedDateLabel(draft: ImportDraft) {
  const value = draft.approvedAt ?? draft.approvalAssumptions?.approvedAt ?? (draft.status === 'approved' ? draft.updatedAt : null)
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai'
  }).format(date)
}

function inferDisplayCurrency(summary: PortfolioSummary) {
  return summary.positions[0]?.currency ?? summary.cashByAccount[0]?.currency ?? summary.accounts[0]?.currency ?? summary.instruments[0]?.currency ?? null
}

function draftStats(draft: ImportDraft) {
  const holdingRows = draft.rows.filter((row) => row.extractedHolding)
  return {
    holdingRows: holdingRows.length,
    displayRows: holdingRows.length || draft.rows.length,
    readyRows: draft.rows.filter((row) => row.status === 'ready' && row.proposedEvent).length,
    issueCount: draft.rows.reduce((total, row) => total + (row.issues?.length ?? 0), 0),
    marketValue: sum(holdingRows.map((row) => row.extractedHolding?.marketValue ?? 0))
  }
}

function statusLabel(status: ImportDraft['status']) {
  if (status === 'approved') return '已入账'
  if (status === 'rejected') return '已拒绝'
  return '待审核'
}

function rowStatusLabel(status: DraftRow['status']) {
  if (status === 'ready') return '可入账'
  if (status === 'duplicate_suspected') return '疑似重复'
  if (status === 'unsupported') return '暂不支持'
  return '需确认'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
