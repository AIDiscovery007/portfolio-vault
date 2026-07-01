#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'

const SEARCH_URL = 'https://searchapi.eastmoney.com/api/suggest/get'
const EASTMONEY_TOKEN = '44c9d251add88e27b65ed86506f6e5da'
const CACHE_FILE = join(homedir(), '.cache', 'portfolio-vault', 'security-lookup-cache.json')
const DAY_MS = 24 * 60 * 60 * 1000

const args = process.argv.slice(2)
const noCache = args.includes('--no-cache')
const queries = args.filter((arg) => arg !== '--no-cache').filter(Boolean)

if (queries.length === 0) {
  console.error('Usage: node security-lookup.mjs "招商证券" "半导体设备ETF易方达" [--no-cache]')
  process.exit(1)
}

const startedAt = performance.now()
const cache = noCache ? { entries: {} } : await readCache()
const results = await Promise.all(queries.map((query) => lookup(query, cache)))
if (!noCache) await writeCache(cache)

console.log(
  JSON.stringify(
    {
      source: 'Eastmoney security suggest API',
      cache: noCache ? 'disabled' : 'daily',
      elapsedMs: round(performance.now() - startedAt, 2),
      results
    },
    null,
    2
  )
)

async function lookup(query, cache) {
  const key = normalize(query)
  const cached = cache.entries[key]
  const raw = cached && Date.now() - cached.cachedAt < DAY_MS ? cached.payload : await fetchSuggest(query)
  if (!cached || raw !== cached.payload) {
    cache.entries[key] = { cachedAt: Date.now(), query, payload: raw }
  }

  const rows = raw?.QuotationCodeTable?.Data ?? []
  const matches = rows
    .map((row) => toMatch(query, row))
    .filter((match) => match.assetClass !== 'unsupported' && match.matchConfidence >= 0.58)
    .sort((a, b) => b.matchConfidence - a.matchConfidence)
    .slice(0, 5)

  return {
    query,
    best: matches[0] ?? null,
    matches
  }
}

async function fetchSuggest(query) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('input', query)
  url.searchParams.set('type', '14')
  url.searchParams.set('token', EASTMONEY_TOKEN)
  url.searchParams.set('count', '10')

  const response = await fetch(url, {
    headers: {
      'user-agent': 'PortfolioVault/0.2 security lookup'
    }
  })
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`)
  return response.json()
}

function toMatch(query, row) {
  const code = String(row.Code ?? '')
  const name = String(row.Name ?? '')
  const classify = String(row.Classify ?? '')
  const quoteId = String(row.QuoteID ?? '')
  const market = inferMarket(quoteId, row)
  const assetClass = inferAssetClass(classify, code)
  const mainlandPenalty = market === 'HKEX' ? 0.16 : 0
  const unsupportedPenalty = assetClass === 'unsupported' ? 0.28 : 0
  const confidence = Math.max(0, scoreIdentity(query, code, name) - mainlandPenalty - unsupportedPenalty)

  return {
    code,
    symbol: code,
    officialName: name,
    assetClass,
    market,
    currency: market === 'HKEX' ? 'HKD' : 'CNY',
    quoteId,
    classify,
    securityTypeName: String(row.SecurityTypeName ?? ''),
    matchConfidence: round(confidence, 4),
    matchSource: 'Eastmoney security suggest API'
  }
}

function inferAssetClass(classify, code) {
  if (classify === 'AStock' || classify === 'HK') return 'stock'
  if (classify === 'Fund' && /^(15|16|18|50|51|52|56|58)\d{4}$/.test(code)) return 'etf'
  if (classify === 'Fund') return 'fund'
  return 'unsupported'
}

function inferMarket(quoteId, row) {
  if (quoteId.startsWith('1.')) return 'SSE'
  if (quoteId.startsWith('0.')) return 'SZSE'
  if (quoteId.startsWith('116.')) return 'HKEX'
  const marketType = String(row.MarketType ?? '')
  if (marketType === '1') return 'SSE'
  if (marketType === '2') return 'SZSE'
  if (marketType === '5') return 'HKEX'
  return undefined
}

function scoreIdentity(query, code, name) {
  const normalizedQuery = normalize(query)
  const normalizedName = normalize(name)
  if (normalizedQuery === code) return 0.995
  if (normalizedQuery === normalizedName) return 0.99
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return 0.94

  const q = bigrams(normalizedQuery)
  const c = new Set(bigrams(normalizedName))
  if (q.length === 0 || c.size === 0) return 0
  const overlap = q.filter((item) => c.has(item)).length
  return overlap / Math.max(q.length, c.size)
}

function normalize(value) {
  return String(value)
    .toUpperCase()
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
    .replace(/[·\-_/]/g, '')
}

function bigrams(value) {
  if (value.length <= 1) return value ? [value] : []
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

async function readCache() {
  try {
    const info = await stat(CACHE_FILE)
    if (Date.now() - info.mtimeMs >= DAY_MS) return { entries: {} }
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries: {} }
    throw error
  }
}

async function writeCache(cache) {
  await mkdir(dirname(CACHE_FILE), { recursive: true })
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`)
}
