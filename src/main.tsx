import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type { TFunction } from 'i18next'
import {
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Landmark,
  LayoutList,
  RefreshCw,
  Search,
  Settings,
  Upload,
  WalletCards
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import './i18n'
import { changeLanguage, languageOptions, localeForLanguage, resolvedLanguage, type SupportedLanguage } from './i18n'
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
  cashInvested: number
  marketValue: number | null
  unrealizedPnL: number | null
  returnPct: number | null
  realizedPnL: number
  currency: string
}

type CashBalance = {
  accountId: string
  currency: string
  balance: number
}

type AccountProposal = {
  id?: string
  name: string
  type: 'brokerage' | 'cash' | 'fund' | 'other'
  currency: string
  institution?: string
  confidence?: number
  source?: string
  status?: 'pending' | 'accepted'
  confirmedAccountId?: string
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
    cashInvested?: number
    marketValue?: number
    unrealizedPnL?: number
  }
  rawText?: string
  issues?: string[]
  extractedHolding?: {
    name?: string
    officialName?: string
    fundCode?: string
    assetClass?: 'stock' | 'etf' | 'fund' | 'cash'
    currency?: string
    cashInvested?: number
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
  accountProposal?: AccountProposal
  rows: DraftRow[]
  approvedAt?: string
  approvalAssumptions?: {
    approvedAt?: string
  }
  createdAt: string
  updatedAt: string
}

type ViewMode = 'home' | 'imports'

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
  const { t, i18n } = useTranslation()
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('home')
  const [accountFilter, setAccountFilter] = useState('all')
  const [queryOpen, setQueryOpen] = useState(false)
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null)
  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null)
  const [confirmingAccountDraftId, setConfirmingAccountDraftId] = useState<string | null>(null)
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

  const language = resolvedLanguage(i18n.resolvedLanguage)
  const locale = localeForLanguage(language)
  const baseCurrency = data.baseCurrency ?? inferDisplayCurrency(data) ?? 'CNY'
  const instruments = useMemo(() => new Map(data.instruments.map((instrument) => [instrument.id, instrument])), [data.instruments])
  const accounts = useMemo(() => new Map(data.accounts.map((account) => [account.id, account])), [data.accounts])
  const filteredPositions = useMemo(() => {
    const positions = data.positions.filter((item) => accountFilter === 'all' || item.accountId === accountFilter)
    return positions.sort((a, b) => positionMarketValue(b) - positionMarketValue(a))
  }, [accountFilter, data.positions])

  const totalNetValue = sum(data.positions.map(positionMarketValue))
  const totalInvested = sum(data.positions.map(positionCashInvested))
  const totalReturn = sum(data.positions.map(positionReturn))
  const assetAllocation = allocation(data.positions, instruments, (instrument) => labelAssetClass(instrument?.assetClass, t))
  const accountAllocation = accountSummary(data.positions, accounts)
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

  async function confirmDraftAccount(draft: ImportDraft) {
    setConfirmingAccountDraftId(draft.id)
    setActionError(null)
    try {
      const response = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}/account/confirm`, { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `Account confirmation failed: ${response.status}`)
      }
      await loadVaultState(true)
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setConfirmingAccountDraftId(null)
    }
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label={t('nav.navigation')}>
        <button className={`brand-mark ${mode === 'home' ? 'active' : ''}`} type="button" title={t('nav.home')} aria-label={t('nav.home')} onClick={() => setMode('home')}>
          <span className="brand-mark-image" aria-hidden="true" />
        </button>
        <nav>
          <button className={mode === 'imports' ? 'active' : ''} type="button" title={t('nav.imports')} aria-label={t('nav.imports')} onClick={() => setMode('imports')}>
            <Upload size={19} strokeWidth={1.65} />
            {data.pendingDraftCount > 0 ? <span className="pin">{data.pendingDraftCount}</span> : null}
          </button>
        </nav>
        <button className="rail-bottom" type="button" title={t('nav.settings')} aria-label={t('nav.settings')}>
          <Settings size={19} strokeWidth={1.65} />
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Portfolio Vault</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" title={t('actions.search')} aria-label={t('actions.search')} onClick={() => setQueryOpen((value) => !value)}>
              <Search size={17} strokeWidth={1.7} />
            </button>
            <button className="icon-button" type="button" title={t('actions.refresh')} aria-label={t('actions.refresh')} onClick={() => window.location.reload()}>
              <RefreshCw size={17} strokeWidth={1.7} />
            </button>
            <LanguageToggle language={language} />
            <span className="base-currency">{baseCurrency}</span>
            <CheckCircle2 className="ok-icon" size={17} strokeWidth={1.8} />
          </div>
        </header>

        {queryOpen ? (
          <label className="quiet-search">
            <Search size={16} strokeWidth={1.7} />
            <input aria-label={t('search.positions')} placeholder={t('search.placeholder')} />
          </label>
        ) : null}

        {isEmpty && mode === 'home' ? (
          <Onboarding t={t} />
        ) : (
          <>
            {!isEmpty ? (
              <>
                <section className="metrics" aria-label={t('metrics.summary')}>
                  <Metric icon={CircleDollarSign} label={t('metrics.totalNetValue')} value={money(totalNetValue, baseCurrency, locale)} detail={loading ? t('metrics.loading') : t('metrics.latestSnapshot')} />
                  <Metric icon={WalletCards} label={t('metrics.cashInvested')} value={money(totalInvested, baseCurrency, locale)} detail={t('metrics.amountBasis')} />
                  <Metric icon={Gauge} label={t('metrics.totalReturn')} value={signedMoney(totalReturn, baseCurrency, locale)} detail={ratePercent(totalInvested === 0 ? null : totalReturn / totalInvested)} tone={totalReturn >= 0 ? 'good' : 'bad'} />
                </section>

                <section className="focus-grid">
                  <article className="exposure-panel">
                    <PanelHeading icon={Gauge} title={t('panels.assetExposure')} subtitle={t('panels.positionsCount', { count: data.positions.length })} />
                    <StackBar items={assetAllocation} />
                    <AllocationList items={assetAllocation} t={t} />
                  </article>

                  <article className="side-panel">
                    <PanelHeading icon={Landmark} title={t('panels.accounts')} />
                    <CompactList items={accountAllocation.slice(0, 4)} emptyText={t('panels.emptyAccounts')} currency={baseCurrency} locale={locale} />
                  </article>
                </section>
              </>
            ) : null}

            {mode === 'imports' ? (
              <DraftReviewSection
                drafts={drafts}
                expandedDraftId={expandedDraftId}
                approvingDraftId={approvingDraftId}
                actionError={actionError}
                baseCurrency={baseCurrency}
                confirmingAccountDraftId={confirmingAccountDraftId}
                locale={locale}
                t={t}
                onConfirmAccount={confirmDraftAccount}
                onToggleDraft={(draftId) => setExpandedDraftId((current) => (current === draftId ? null : draftId))}
                onRequestApprove={setConfirmingDraft}
              />
            ) : !isEmpty ? (
              <PositionsSection
                accounts={accounts}
                accountFilter={accountFilter}
                baseCurrency={baseCurrency}
                instruments={instruments}
                positions={topPositions}
                totalNetValue={totalNetValue}
                locale={locale}
                allAccounts={data.accounts}
                t={t}
                onAccountFilterChange={setAccountFilter}
              />
            ) : null}
          </>
        )}
      </section>

      {confirmingDraft ? (
        <ApproveDraftDialog
          draft={confirmingDraft}
          baseCurrency={baseCurrency}
          locale={locale}
          approving={approvingDraftId === confirmingDraft.id}
          error={actionError}
          t={t}
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

function LanguageToggle({ language }: { language: SupportedLanguage }) {
  const { t } = useTranslation()
  const nextLanguage = language === 'en' ? 'zh-CN' : 'en'
  const current = languageOptions.find((option) => option.code === language) ?? languageOptions[0]
  const nextLabel = nextLanguage === 'en' ? t('actions.switchToEnglish') : t('actions.switchToChinese')

  return (
    <button className="language-toggle" type="button" title={nextLabel} aria-label={nextLabel} onClick={() => void changeLanguage(nextLanguage)}>
      {current.shortLabel}
    </button>
  )
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

function Onboarding({ t }: { t: TFunction }) {
  const steps = [
    { icon: Upload, title: t('onboarding.handToCodex'), text: t('onboarding.handToCodexText') },
    { icon: Search, title: t('onboarding.reviewDetails'), text: t('onboarding.reviewDetailsText') },
    { icon: CheckCircle2, title: t('onboarding.approveAndBook'), text: t('onboarding.approveAndBookText') }
  ]

  return (
    <section className="onboarding" aria-label={t('onboarding.label')}>
      <div className="onboarding-copy">
        <p className="eyebrow">{t('onboarding.label')}</p>
        <h2>{t('onboarding.title')}</h2>
        <p>{t('onboarding.body')}</p>
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
  locale,
  positions,
  t,
  totalNetValue,
  onAccountFilterChange
}: {
  accounts: Map<string, Account>
  accountFilter: string
  allAccounts: Account[]
  baseCurrency: string
  instruments: Map<string, Instrument>
  locale: string
  positions: Position[]
  t: TFunction
  totalNetValue: number
  onAccountFilterChange: (accountId: string) => void
}) {
  return (
    <section className="table-section" aria-label={t('positions.aria')}>
      <div className="section-title-row">
        <div>
          <h2>{t('positions.title')}</h2>
          <p>{t('positions.overviewMode')}</p>
        </div>
        <div className="table-tools">
          <select value={accountFilter} aria-label={t('positions.filterByAccount')} onChange={(event) => onAccountFilterChange(event.target.value)} disabled={allAccounts.length === 0}>
            <option value="all">{t('positions.allAccounts')}</option>
            {allAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="position-table" role="table">
        <div className="table-row table-head" role="row">
          <span>{t('positions.headers.instrument')}</span>
          <span>{t('positions.headers.cashInvested')}</span>
          <span>{t('positions.headers.returnRate')}</span>
          <span>{t('positions.headers.allocation')}</span>
          <span>{t('positions.headers.marketValue')}</span>
        </div>
        {positions.map((item) => {
          const instrument = instruments.get(item.instrumentId)
          const account = accounts.get(item.accountId)
          const value = positionMarketValue(item)
          const invested = positionCashInvested(item)
          const pnl = positionReturn(item)
          const returnRate = item.returnPct ?? (invested === 0 ? null : pnl / invested)
          return (
            <div className="table-row" role="row" key={`${item.accountId}-${item.instrumentId}`}>
              <span className="position-identity">
                <strong>{instrument?.symbol ?? item.instrumentId}</strong>
                <em>{instrument?.name ?? account?.name ?? t('positions.unmappedInstrument')}</em>
              </span>
              <span>{money(invested, item.currency ?? baseCurrency, locale)}</span>
              <span className={pnl >= 0 ? 'positive' : 'negative'}>{ratePercent(returnRate)}</span>
              <span>{percent(value, totalNetValue)}</span>
              <span>{money(value, item.currency ?? baseCurrency, locale)}</span>
            </div>
          )
        })}
        {positions.length === 0 ? (
          <div className="empty-table">
            <LayoutList size={18} strokeWidth={1.7} />
            <span>{t('positions.empty')}</span>
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
  confirmingAccountDraftId,
  locale,
  t,
  onConfirmAccount,
  onToggleDraft,
  onRequestApprove
}: {
  drafts: ImportDraft[]
  expandedDraftId: string | null
  approvingDraftId: string | null
  actionError: string | null
  baseCurrency: string
  confirmingAccountDraftId: string | null
  locale: string
  t: TFunction
  onConfirmAccount: (draft: ImportDraft) => void
  onToggleDraft: (draftId: string) => void
  onRequestApprove: (draft: ImportDraft) => void
}) {
  if (drafts.length === 0) {
    return (
      <section className="table-section imports-section" aria-label={t('imports.aria')}>
        <div className="empty-table tall">
          <Upload size={19} strokeWidth={1.7} />
          <span>{t('imports.emptyDrafts')}</span>
        </div>
      </section>
    )
  }

  return (
    <section className="table-section imports-section" aria-label={t('imports.aria')}>
      <div className="section-title-row">
        <div>
          <h2>{t('imports.title')}</h2>
          <p>{t('imports.subtitle')}</p>
        </div>
      </div>

      <div className="import-card-list">
        {drafts.map((draft) => {
          const stats = draftStats(draft)
          const isExpanded = expandedDraftId === draft.id
          const holdingRows = draft.rows.filter((row) => row.extractedHolding)
          const displayRows = holdingRows.length > 0 ? holdingRows : draft.rows
          const accountPending = needsAccountConfirmation(draft)
          const canApprove = !accountPending && draft.status === 'draft' && draft.rows.some((row) => row.status === 'ready' && row.proposedEvent)
          const bookedDate = bookedDateLabel(draft, locale)

          return (
            <article className={`import-card ${isExpanded ? 'open' : ''}`} key={draft.id}>
              <button className="import-card-toggle" type="button" aria-expanded={isExpanded} onClick={() => onToggleDraft(draft.id)}>
                <span className={`status-pill ${draft.status}`}>{statusLabel(draft.status, t)}</span>
                <span className="import-card-main">
                  <strong>{draft.sourceFileName ?? t('imports.defaultRecord')}</strong>
                  <span className="import-card-subline">
                    <span>
                      <CalendarDays size={12} strokeWidth={1.7} />
                      {bookedDate ? t('imports.bookedDate', { date: bookedDate }) : t('imports.notBooked')}
                    </span>
                    {accountPending ? <span>{t('imports.accountPending')}</span> : draft.accountId ? <span>{t('imports.accountReady')}</span> : null}
                  </span>
                </span>
                <span className="import-card-metrics" aria-label={t('imports.summary')}>
                  <span>
                    <strong>{money(stats.marketValue, baseCurrency, locale)}</strong>
                    <em>{t('imports.marketValue')}</em>
                  </span>
                  <span>
                    <strong>{stats.readyRows}/{draft.rows.length}</strong>
                    <em>{draft.status === 'approved' ? t('imports.bookedRows') : t('imports.readyRows')}</em>
                  </span>
                  <span>
                    <strong>{stats.issueCount}</strong>
                    <em>{t('imports.issues')}</em>
                  </span>
                </span>
                <ChevronDown className="chevron" size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>

              {isExpanded ? (
                <div className="import-card-body">
                  {actionError ? <p className="action-error">{actionError}</p> : null}

                  {draft.accountProposal ? (
                    <AccountProposalCard
                      draft={draft}
                      confirming={confirmingAccountDraftId === draft.id}
                      t={t}
                      onConfirm={() => onConfirmAccount(draft)}
                    />
                  ) : null}

                  <div className="draft-row-list">
                    {displayRows.map((row) => {
                      const holding = row.extractedHolding
                      const title = holding?.officialName ?? holding?.name ?? row.rawText ?? row.id
                      const pnl = holding?.holdingPnl ?? 0
                      const marketValue = holding?.marketValue ?? row.proposedEvent?.marketValue
                      const cashInvested = holding?.cashInvested ?? row.proposedEvent?.cashInvested ?? (marketValue === undefined ? undefined : marketValue - pnl)
                      const returnRate = cashInvested === undefined || cashInvested === 0 ? null : pnl / cashInvested
                      const rowBooked = draft.status === 'approved' && row.status === 'ready' && Boolean(row.proposedEvent)
                      return (
                        <article className="draft-row-card" key={row.id}>
                          <div>
                            <span className="symbol">{holding?.fundCode ?? row.proposedEvent?.instrumentId ?? row.proposedEvent?.type ?? t('imports.pendingConfirm')}</span>
                            <strong>{title}</strong>
                            <em>{row.rawText ?? t('imports.originalRecordPending')}</em>
                          </div>
                          <div>
                            <span>{marketValue === undefined ? t('imports.amountPending') : money(marketValue, holding?.currency ?? baseCurrency, locale)}</span>
                            <strong className={pnl >= 0 ? 'positive' : 'negative'}>{holding ? signedMoney(pnl, holding.currency ?? baseCurrency, locale) : '--'}</strong>
                            <em>{t('imports.returnRate')}: {ratePercent(returnRate)}</em>
                          </div>
                          <div>
                            <span className={`row-state ${rowBooked ? 'ready' : row.status}`}>
                              {rowBooked ? t('status.approved') : rowStatusLabel(row.status, t)}
                            </span>
                            <span>{cashInvested === undefined ? t('imports.investedPending') : money(cashInvested, holding?.currency ?? baseCurrency, locale)}</span>
                            <em>{holding?.allocationPct === undefined ? t('imports.allocationPending') : allocationPercent(holding.allocationPct)}</em>
                          </div>
                          {row.issues && row.issues.length > 0 ? <p>{row.issues[0]}</p> : null}
                        </article>
                      )
                    })}
                  </div>

                  <div className="import-card-actions">
                    <button className="approve-button" type="button" disabled={!canApprove || approvingDraftId === draft.id} onClick={() => onRequestApprove(draft)}>
                      <CheckCircle2 size={16} strokeWidth={1.75} />
                      {draft.status === 'approved' ? t('imports.approved') : accountPending ? t('imports.confirmAccountFirst') : approvingDraftId === draft.id ? t('imports.approving') : canApprove ? t('imports.approve') : t('imports.needsCompletion')}
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

function AccountProposalCard({
  draft,
  confirming,
  t,
  onConfirm
}: {
  draft: ImportDraft
  confirming: boolean
  t: TFunction
  onConfirm: () => void
}) {
  const proposal = draft.accountProposal
  if (!proposal) return null
  const confirmed = !needsAccountConfirmation(draft)
  return (
    <section className={`account-proposal ${confirmed ? 'confirmed' : ''}`} aria-label={t('imports.accountProposal')}>
      <WalletCards size={18} strokeWidth={1.7} />
      <div>
        <span>{confirmed ? t('imports.accountConfirmed') : t('imports.accountProposal')}</span>
        <strong>{proposal.name}</strong>
        <em>
          {accountTypeLabel(proposal.type, t)} · {proposal.currency}
          {proposal.institution ? ` · ${proposal.institution}` : ''}
        </em>
      </div>
      {confirmed ? (
        <span className="row-state ready">{t('imports.accountConfirmedShort')}</span>
      ) : (
        <button className="approve-button" type="button" disabled={confirming} onClick={onConfirm}>
          <CheckCircle2 size={16} strokeWidth={1.75} />
          {confirming ? t('imports.confirmingAccount') : t('imports.confirmAccount')}
        </button>
      )}
    </section>
  )
}

function ApproveDraftDialog({
  draft,
  baseCurrency,
  locale,
  approving,
  error,
  t,
  onCancel,
  onConfirm
}: {
  draft: ImportDraft
  baseCurrency: string
  locale: string
  approving: boolean
  error: string | null
  t: TFunction
  onCancel: () => void
  onConfirm: () => void
}) {
  const stats = draftStats(draft)
  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onCancel}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="approve-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <CheckCircle2 size={18} strokeWidth={1.75} />
          <h2 id="approve-dialog-title">{t('approveDialog.title')}</h2>
        </header>
        <p>{t('approveDialog.body')}</p>
        {error ? <p className="action-error">{error}</p> : null}
        <div className="confirm-dialog-facts">
          <span>
            <strong>{money(stats.marketValue, baseCurrency, locale)}</strong>
            <em>{t('imports.marketValue')}</em>
          </span>
          <span>
            <strong>{stats.readyRows}/{draft.rows.length}</strong>
            <em>{t('approveDialog.ready')}</em>
          </span>
          <span>
            <strong>{draft.accountId ?? t('approveDialog.pending')}</strong>
            <em>{t('approveDialog.account')}</em>
          </span>
        </div>
        <div className="confirm-dialog-actions">
          <button className="ghost-button" type="button" disabled={approving} onClick={onCancel}>
            {t('actions.cancel')}
          </button>
          <button className="approve-button" type="button" disabled={approving} onClick={onConfirm}>
            <CheckCircle2 size={16} strokeWidth={1.75} />
            {approving ? t('approveDialog.approving') : t('approveDialog.confirm')}
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
  const { t } = useTranslation()
  if (items.length === 0) return <div className="stack-bar empty" aria-label={t('panels.noAllocationYet')} />

  return (
    <div className="stack-bar" aria-label={t('panels.allocationBar')}>
      {items.map((item, index) => (
        <span key={item.label} style={{ width: `${item.weight}%`, background: palette[index % palette.length] }} title={`${item.label}: ${item.weight.toFixed(1)}%`} />
      ))}
    </div>
  )
}

function AllocationList({ items, t }: { items: AllocationItem[]; t: TFunction }) {
  if (items.length === 0) return <p className="empty-note">{t('panels.emptyExposure')}</p>

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

function CompactList({ items, emptyText, currency, locale }: { items: AllocationItem[]; emptyText: string; currency: string; locale: string }) {
  if (items.length === 0) return <p className="empty-note">{emptyText}</p>

  return (
    <div className="compact-list">
      {items.map((item) => (
        <div key={item.label}>
          <span className="truncate">{item.label}</span>
          <strong>{money(item.value, currency, locale)}</strong>
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

function positionMarketValue(position: Position) {
  return position.marketValue ?? position.costAmount
}

function positionCashInvested(position: Position) {
  return position.cashInvested ?? position.costAmount
}

function positionReturn(position: Position) {
  return position.unrealizedPnL ?? positionMarketValue(position) - positionCashInvested(position)
}

function allocation(
  positions: Position[],
  instruments: Map<string, Instrument>,
  getLabel: (instrument: Instrument | undefined, position: Position) => string
): AllocationItem[] {
  const totals = new Map<string, number>()
  for (const position of positions) {
    const value = positionMarketValue(position)
    const label = getLabel(instruments.get(position.instrumentId), position)
    totals.set(label, (totals.get(label) ?? 0) + value)
  }
  const total = sum([...totals.values()])
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value, weight: total === 0 ? 0 : (value / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}

function accountSummary(positions: Position[], accounts: Map<string, Account>) {
  const totals = new Map<string, number>()
  for (const position of positions) {
    totals.set(position.accountId, (totals.get(position.accountId) ?? 0) + positionMarketValue(position))
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

function labelAssetClass(assetClass: string | undefined, t: TFunction) {
  if (assetClass === 'etf') return 'ETF'
  if (assetClass === 'fund') return t('assetClass.fund')
  if (assetClass === 'stock') return t('assetClass.stock')
  if (assetClass === 'cash') return t('assetClass.cash')
  return t('assetClass.other')
}

function needsAccountConfirmation(draft: ImportDraft) {
  return draft.status === 'draft' && Boolean(draft.accountProposal) && draft.accountProposal?.status !== 'accepted' && !draft.accountId
}

function accountTypeLabel(type: AccountProposal['type'], t: TFunction) {
  if (type === 'brokerage') return t('accountTypes.brokerage')
  if (type === 'cash') return t('accountTypes.cash')
  if (type === 'fund') return t('accountTypes.fund')
  return t('accountTypes.other')
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function money(value: number, currency = 'CNY', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function signedMoney(value: number, currency = 'CNY', locale = 'en-US') {
  const formatted = money(Math.abs(value), currency, locale)
  return `${value >= 0 ? '+' : '-'}${formatted}`
}

function number(value?: number, maximumFractionDigits = 4, locale = 'en-US') {
  if (value === undefined || value === null || Number.isNaN(value)) return '--'
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)
}

function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return '0.00%'
  return `${((value / total) * 100).toFixed(2)}%`
}

function allocationPercent(value: number) {
  const normalized = Math.abs(value) <= 1 ? value * 100 : value
  return `${normalized.toFixed(2)}%`
}

function ratePercent(rate: number | null | undefined) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '--'
  return `${(rate * 100).toFixed(2)}%`
}

function bookedDateLabel(draft: ImportDraft, locale: string) {
  const value = draft.approvedAt ?? draft.approvalAssumptions?.approvedAt ?? (draft.status === 'approved' ? draft.updatedAt : null)
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
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

function statusLabel(status: ImportDraft['status'], t: TFunction) {
  if (status === 'approved') return t('status.approved')
  if (status === 'rejected') return t('status.rejected')
  return t('status.draft')
}

function rowStatusLabel(status: DraftRow['status'], t: TFunction) {
  if (status === 'ready') return t('status.ready')
  if (status === 'duplicate_suspected') return t('status.duplicate')
  if (status === 'unsupported') return t('status.unsupported')
  return t('status.needsReview')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
