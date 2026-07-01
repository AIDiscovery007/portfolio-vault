import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type SupportedLanguage = 'en' | 'zh-CN'

const LANGUAGE_STORAGE_KEY = 'portfolio-vault.language'

const resources = {
  en: {
    translation: {
      nav: {
        home: 'Home',
        imports: 'Review drafts',
        settings: 'Settings',
        navigation: 'Portfolio navigation'
      },
      actions: {
        search: 'Search',
        refresh: 'Refresh',
        cancel: 'Cancel',
        language: 'Language',
        switchToEnglish: 'Switch to English',
        switchToChinese: 'Switch to Chinese'
      },
      search: {
        positions: 'Search positions',
        placeholder: 'Search is intentionally lightweight in this MVP'
      },
      metrics: {
        summary: 'Portfolio summary',
        totalNetValue: 'Current net value',
        cashInvested: 'Cash invested',
        totalReturn: 'Total return',
        loading: 'Reading local vault',
        latestSnapshot: 'Latest local snapshot',
        amountBasis: 'Amount basis'
      },
      panels: {
        assetExposure: 'Asset exposure',
        accounts: 'Accounts',
        positionsCount: '{{count}} position',
        positionsCount_other: '{{count}} positions',
        emptyAccounts: 'No accounts yet',
        emptyExposure: 'No exposure yet',
        noAllocationYet: 'No allocation yet',
        allocationBar: 'Allocation bar'
      },
      onboarding: {
        label: 'Quick start',
        title: 'Import, review, then book.',
        body: 'Portfolio Vault only puts confirmed data into formal positions. To get started, drop in one screenshot or CSV.',
        handToCodex: 'Hand it to Codex',
        handToCodexText: 'Drop a screenshot, CSV, or trade record into the conversation to create a review draft.',
        reviewDetails: 'Review key details',
        reviewDetailsText: 'Codes, NAV, amount, P&L, and issues are grouped on the review page.',
        approveAndBook: 'Approve and book',
        approveAndBookText: 'Once confirmed, entries move into formal positions and the page refreshes automatically.'
      },
      positions: {
        aria: 'Core positions',
        title: 'Core positions',
        overviewMode: 'Review totals, exposure, and concentration.',
        filterByAccount: 'Filter by account',
        allAccounts: 'All accounts',
        headers: {
          instrument: 'Instrument',
          cashInvested: 'Cash invested',
          returnRate: 'Return',
          allocation: 'Weight',
          marketValue: 'Current value'
        },
        unmappedInstrument: 'Unmapped instrument',
        empty: 'No formal positions yet'
      },
      imports: {
        aria: 'Import review',
        summary: 'Import summary',
        title: 'Import review',
        subtitle: 'Review drafts before approving them into the ledger.',
        emptyDrafts: 'No import drafts yet',
        defaultRecord: 'Import record',
        bookedDate: 'Booked {{date}}',
        notBooked: 'Not booked',
        marketValue: 'Current value',
        bookedRows: 'Booked',
        readyRows: 'Ready',
        issues: 'Issues',
        pendingConfirm: 'Pending',
        originalRecordPending: 'Original record pending confirmation',
        amountPending: 'Amount pending',
        investedPending: 'Invested cash pending',
        returnRate: 'Return',
        allocationPending: 'Allocation pending',
        approve: 'Approve',
        approved: 'Booked',
        approving: 'Booking',
        needsCompletion: 'Needs details',
        accountPending: 'Account pending',
        accountReady: 'Account ready',
        accountProposal: 'Account proposal',
        accountConfirmed: 'Account confirmed',
        accountConfirmedShort: 'Confirmed',
        confirmAccount: 'Confirm account',
        confirmingAccount: 'Confirming',
        confirmAccountFirst: 'Confirm account first'
      },
      approveDialog: {
        title: 'Confirm booking',
        body: 'After confirmation, this draft will be written into formal positions and the local dashboard will refresh immediately.',
        ready: 'Ready',
        account: 'Account',
        pending: 'Pending',
        confirm: 'Confirm booking',
        approving: 'Booking'
      },
      status: {
        approved: 'Booked',
        rejected: 'Rejected',
        draft: 'Pending review',
        ready: 'Ready',
        duplicate: 'Possible duplicate',
        unsupported: 'Unsupported',
        needsReview: 'Needs review'
      },
      assetClass: {
        etf: 'ETF',
        fund: 'Fund',
        stock: 'Stock',
        cash: 'Cash',
        other: 'Other'
      },
      accountTypes: {
        brokerage: 'Brokerage',
        cash: 'Cash',
        fund: 'Fund platform',
        other: 'Other'
      }
    }
  },
  'zh-CN': {
    translation: {
      nav: {
        home: '首页',
        imports: '审核草稿',
        settings: '设置',
        navigation: 'Portfolio 导航'
      },
      actions: {
        search: '搜索',
        refresh: '刷新',
        cancel: '取消',
        language: '语言',
        switchToEnglish: '切换到英文',
        switchToChinese: '切换到中文'
      },
      search: {
        positions: '搜索仓位',
        placeholder: '当前版本仅保留轻量搜索入口'
      },
      metrics: {
        summary: 'Portfolio 摘要',
        totalNetValue: '当前总净值',
        cashInvested: '投入现金',
        totalReturn: '总收益',
        loading: '读取本地 vault',
        latestSnapshot: '本地最新快照',
        amountBasis: '金额口径'
      },
      panels: {
        assetExposure: '资产暴露',
        accounts: '账户',
        positionsCount: '{{count}} 个仓位',
        positionsCount_other: '{{count}} 个仓位',
        emptyAccounts: '暂无账户',
        emptyExposure: '暂无暴露',
        noAllocationYet: '暂无配置',
        allocationBar: '配置条'
      },
      onboarding: {
        label: '快速开始',
        title: '先导入，再审核，最后入账。',
        body: 'Portfolio Vault 只把确认过的数据放进正式仓位。第一次使用时，你只需要从一份截图或 CSV 开始。',
        handToCodex: '交给 Codex',
        handToCodexText: '把截图、CSV 或交易记录放进对话里，先生成待审草稿。',
        reviewDetails: '核对关键信息',
        reviewDetailsText: '代码、净值、金额、收益和问题会集中显示在审核页。',
        approveAndBook: '批准后入账',
        approveAndBookText: '确认无误后进入正式仓位，页面会自动同步刷新。'
      },
      positions: {
        aria: '核心仓位',
        title: '核心仓位',
        overviewMode: '看总额、暴露和集中度。',
        filterByAccount: '按账户筛选',
        allAccounts: '全部账户',
        headers: {
          instrument: '标的',
          cashInvested: '投入现金',
          returnRate: '收益率',
          allocation: '占比',
          marketValue: '当前净值'
        },
        unmappedInstrument: '未映射标的',
        empty: '暂无正式仓位'
      },
      imports: {
        aria: '导入审核',
        summary: '导入摘要',
        title: '导入审核',
        subtitle: '草稿先看清，再批准入账。',
        emptyDrafts: '暂无导入草稿',
        defaultRecord: '导入记录',
        bookedDate: '入账日 {{date}}',
        notBooked: '未入账',
        marketValue: '当前净值',
        bookedRows: '已入账',
        readyRows: '可入账',
        issues: '提示',
        pendingConfirm: '待确认',
        originalRecordPending: '原始记录待确认',
        amountPending: '金额待确认',
        investedPending: '投入现金待确认',
        returnRate: '收益率',
        allocationPending: '占比待确认',
        approve: '批准入账',
        approved: '已入账',
        approving: '入账中',
        needsCompletion: '待补齐',
        accountPending: '账户待确认',
        accountReady: '账户已确认',
        accountProposal: '账户提案',
        accountConfirmed: '账户已确认',
        accountConfirmedShort: '已确认',
        confirmAccount: '确认账户',
        confirmingAccount: '确认中',
        confirmAccountFirst: '先确认账户'
      },
      approveDialog: {
        title: '确认入账',
        body: '确认后，这批草稿会写入正式仓位，并立即刷新本地看板。',
        ready: '可入账',
        account: '账户',
        pending: '待确认',
        confirm: '确认入账',
        approving: '入账中'
      },
      status: {
        approved: '已入账',
        rejected: '已拒绝',
        draft: '待审核',
        ready: '可入账',
        duplicate: '疑似重复',
        unsupported: '暂不支持',
        needsReview: '需确认'
      },
      assetClass: {
        etf: 'ETF',
        fund: '基金',
        stock: '股票',
        cash: '现金',
        other: '其他'
      },
      accountTypes: {
        brokerage: '证券账户',
        cash: '现金账户',
        fund: '基金平台',
        other: '其他账户'
      }
    }
  }
}

export const languageOptions: Array<{ code: SupportedLanguage; label: string; shortLabel: string }> = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'zh-CN', label: '中文', shortLabel: '中文' }
]

function normalizeLanguage(value?: string | null): SupportedLanguage {
  return value?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function readStoredLanguage(): SupportedLanguage | null {
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return value ? normalizeLanguage(value) : null
  } catch {
    return null
  }
}

function detectInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en'
  return readStoredLanguage() ?? normalizeLanguage(window.navigator.language)
}

export function resolvedLanguage(language?: string | null): SupportedLanguage {
  return normalizeLanguage(language ?? i18n.resolvedLanguage ?? i18n.language)
}

export function localeForLanguage(language?: string | null) {
  return resolvedLanguage(language) === 'zh-CN' ? 'zh-CN' : 'en-US'
}

export async function changeLanguage(language: SupportedLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // The language still changes for this session when localStorage is unavailable.
  }
  await i18n.changeLanguage(language)
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  supportedLngs: languageOptions.map((option) => option.code),
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
})

export default i18n
