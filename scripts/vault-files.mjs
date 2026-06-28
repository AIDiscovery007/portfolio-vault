import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export function defaultVaultDir() {
  return join(homedir(), 'Documents', 'PortfolioVault')
}

export function parseVaultDir(args = process.argv.slice(2)) {
  const cliIndex = args.indexOf('--vault-dir')
  const cliValue = cliIndex >= 0 ? args[cliIndex + 1] : null
  return resolve(cliValue || process.env.PORTFOLIO_VAULT_DIR || defaultVaultDir())
}

export function hasFlag(flag, args = process.argv.slice(2)) {
  return args.includes(flag)
}

export function paths(vaultDir) {
  return {
    root: vaultDir,
    config: join(vaultDir, 'config.json'),
    events: join(vaultDir, 'events.jsonl'),
    drafts: join(vaultDir, 'import-drafts'),
    imports: join(vaultDir, 'imports'),
    derived: join(vaultDir, 'derived'),
    positions: join(vaultDir, 'derived', 'positions.json'),
    backups: join(vaultDir, 'backups')
  }
}

export function emptyConfig() {
  return {
    version: 1,
    baseCurrency: null,
    accounts: [],
    instruments: [],
    accountMappings: []
  }
}

export function emptySummary(vaultDir, updatedAt = new Date().toISOString()) {
  return {
    vaultDir,
    baseCurrency: null,
    accounts: [],
    instruments: [],
    positions: [],
    cashByAccount: [],
    pendingDraftCount: 0,
    updatedAt
  }
}

export async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  await writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`)
  await rename(tempFile, filePath)
}

export async function ensureVaultSkeleton(vaultDir) {
  const p = paths(vaultDir)
  await Promise.all([mkdir(p.drafts, { recursive: true }), mkdir(p.imports, { recursive: true }), mkdir(p.derived, { recursive: true })])

  if (!(await exists(p.config))) {
    await writeJsonAtomic(p.config, emptyConfig())
  }

  if (!(await exists(p.events))) {
    await writeFile(p.events, '')
  }

  if (!(await exists(p.positions))) {
    await writeJsonAtomic(p.positions, emptySummary(vaultDir))
  }

  return p
}

export async function emptyDir(dir) {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir, { withFileTypes: true })
  await Promise.all(entries.map((entry) => rmSafe(join(dir, entry.name))))
}

async function rmSafe(filePath) {
  const { rm } = await import('node:fs/promises')
  await rm(filePath, { recursive: true, force: true })
}

export async function copyIfExists(source, destination) {
  if (!(await exists(source))) return false
  const { cp } = await import('node:fs/promises')
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
  return true
}

export async function readJsonIfExists(filePath) {
  if (!(await exists(filePath))) return null
  return JSON.parse(await readFile(filePath, 'utf8'))
}
