#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { copyIfExists, emptyConfig, emptyDir, emptySummary, ensureVaultSkeleton, hasFlag, parseVaultDir, paths, writeJsonAtomic } from './vault-files.mjs'

const vaultDir = parseVaultDir()
const backup = !hasFlag('--no-backup')
const p = await ensureVaultSkeleton(vaultDir)
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = join(p.backups, `reset-${timestamp}`)

if (backup) {
  await mkdir(backupDir, { recursive: true })
  await Promise.all([
    copyIfExists(p.config, join(backupDir, 'config.json')),
    copyIfExists(p.events, join(backupDir, 'events.jsonl')),
    copyIfExists(p.drafts, join(backupDir, 'import-drafts')),
    copyIfExists(p.imports, join(backupDir, 'imports')),
    copyIfExists(p.positions, join(backupDir, 'derived', 'positions.json'))
  ])
}

await Promise.all([emptyDir(p.drafts), emptyDir(p.imports)])
await writeJsonAtomic(p.config, emptyConfig())
await writeFile(p.events, '')
await writeJsonAtomic(p.positions, emptySummary(vaultDir))

console.log(
  JSON.stringify(
    {
      ok: true,
      action: 'reset',
      vaultDir,
      backupDir: backup ? backupDir : null,
      state: {
        accounts: 0,
        instruments: 0,
        positions: 0,
        pendingDraftCount: 0
      }
    },
    null,
    2
  )
)
