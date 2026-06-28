#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FUND_INDEX_URL = 'https://fund.eastmoney.com/js/fundcode_search.js'
const CACHE_DIR = join(homedir(), '.cache', 'portfolio-vault')
const CACHE_FILE = join(CACHE_DIR, 'fundcode_search.json')
const DAY_MS = 24 * 60 * 60 * 1000

const queries = process.argv.slice(2).filter(Boolean)
if (queries.length === 0) {
  console.error('Usage: node fund-lookup.mjs "基金名称" ["基金名称2"]')
  process.exit(1)
}

const index = await loadFundIndex()
const results = []
for (const query of queries) {
  const candidates = rankCandidates(index, query).slice(0, 3)
  const enriched = []
  for (const candidate of candidates) {
    enriched.push({ ...candidate, ...(await fetchNav(candidate.code)) })
  }
  results.push({ query, matches: enriched })
}

console.log(JSON.stringify(results, null, 2))

async function loadFundIndex() {
  await mkdir(CACHE_DIR, { recursive: true })
  if (await isFresh(CACHE_FILE)) {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  }

  const text = await fetchText(FUND_INDEX_URL)
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('Unable to parse fund index.')

  const rows = JSON.parse(text.slice(start, end + 1))
  const funds = rows.map((row) => ({
    code: String(row[0]),
    shortPinyin: String(row[1] ?? ''),
    name: String(row[2] ?? ''),
    type: String(row[3] ?? ''),
    pinyin: String(row[4] ?? '')
  }))
  await writeFile(CACHE_FILE, JSON.stringify(funds))
  return funds
}

async function isFresh(filePath) {
  try {
    const info = await stat(filePath)
    return Date.now() - info.mtimeMs < DAY_MS
  } catch {
    return false
  }
}

function rankCandidates(funds, query) {
  const normalizedQuery = normalize(query)
  return funds
    .map((fund) => {
      const normalizedName = normalize(fund.name)
      const score = scoreMatch(normalizedQuery, normalizedName)
      return {
        code: fund.code,
        officialName: fund.name,
        type: fund.type,
        matchConfidence: score,
        matchSource: 'Eastmoney/Tiantian fund code index'
      }
    })
    .filter((fund) => fund.matchConfidence >= 0.62)
    .sort((a, b) => b.matchConfidence - a.matchConfidence)
}

function normalize(value) {
  return value
    .toUpperCase()
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
    .replace(/[·\-_/]/g, '')
    .replace(/人民币|基金|发起式/g, '')
}

function scoreMatch(query, candidate) {
  if (query === candidate) return 0.99
  if (candidate.includes(query) || query.includes(candidate)) return 0.94

  const q = bigrams(query)
  const c = new Set(bigrams(candidate))
  if (q.length === 0 || c.size === 0) return 0
  const overlap = q.filter((item) => c.has(item)).length
  return overlap / Math.max(q.length, c.size)
}

function bigrams(value) {
  if (value.length <= 1) return value ? [value] : []
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
}

async function fetchNav(code) {
  const nav = await fetchPingzhongData(code).catch(() => null)
  if (nav) return nav
  return fetchRealtimeNav(code).catch(() => ({}))
}

async function fetchPingzhongData(code) {
  const text = await fetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`)
  const trendMatch = text.match(/var Data_netWorthTrend = (\[.*?\]);/s)
  if (!trendMatch) throw new Error(`No NAV trend for ${code}`)
  const trend = JSON.parse(trendMatch[1])
  const latest = trend.at(-1)
  if (!latest?.y || !latest?.x) throw new Error(`No latest NAV for ${code}`)
  return {
    unitNav: Number(latest.y),
    navDate: new Date(Number(latest.x)).toISOString().slice(0, 10),
    navSource: 'Eastmoney pingzhongdata'
  }
}

async function fetchRealtimeNav(code) {
  const text = await fetchText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`)
  const jsonMatch = text.match(/jsonpgz\((.*)\);?$/s)
  if (!jsonMatch) throw new Error(`No realtime NAV for ${code}`)
  const payload = JSON.parse(jsonMatch[1])
  return {
    unitNav: Number(payload.dwjz),
    navDate: payload.jzrq,
    navSource: 'Tiantian realtime NAV'
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'PortfolioVault/0.2 fund lookup'
    }
  })
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`)
  return response.text()
}
