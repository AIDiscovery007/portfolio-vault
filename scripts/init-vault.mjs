#!/usr/bin/env node
import { ensureVaultSkeleton, parseVaultDir, paths, readJsonIfExists } from './vault-files.mjs'

const vaultDir = parseVaultDir()
const p = await ensureVaultSkeleton(vaultDir)
const [config, summary] = await Promise.all([readJsonIfExists(p.config), readJsonIfExists(p.positions)])

console.log(
  JSON.stringify(
    {
      ok: true,
      action: 'initialized',
      vaultDir,
      files: {
        config: p.config,
        events: p.events,
        importDrafts: p.drafts,
        imports: p.imports,
        derived: p.derived,
        positions: p.positions
      },
      state: {
        accounts: config?.accounts?.length ?? 0,
        instruments: config?.instruments?.length ?? 0,
        positions: summary?.positions?.length ?? 0,
        pendingDraftCount: summary?.pendingDraftCount ?? 0
      }
    },
    null,
    2
  )
)
