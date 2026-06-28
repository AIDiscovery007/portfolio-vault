---
name: portfolio-vault-admin
description: Initialize or reset the local Portfolio Vault data directory. Use whenever the user asks to initialize Portfolio Vault, prepare first-use files, create missing vault folders, reset Portfolio Vault, clear all accounts/positions/drafts, restore first-use state, or quickly test from a clean vault.
---

# Portfolio Vault Admin

Use this skill for local vault lifecycle tasks: first-use initialization and clean-state reset.

## Decision

Choose exactly one procedure:

- **Initialize** when the user says: 初始化, 首次使用, 准备使用条件, 创建目录结构, init, setup, bootstrap.
- **Reset** when the user says: 重置, 清空, 恢复初始状态, 回到第一次使用, reset, clean slate, 重新测试.

If the wording is ambiguous:

- Prefer **initialize** when the user asks for setup or missing files.
- Prefer **reset** only when the user explicitly wants existing accounts, positions, drafts, or events cleared.
- If there is any doubt before destructive reset, ask one short confirmation question.

## Vault Directory

Default vault directory:

```text
~/Documents/PortfolioVault
```

Respect a user-specified path when provided. Pass it through with:

```bash
-- --vault-dir /path/to/PortfolioVault
```

## Initialize Procedure

Run from the Portfolio Vault plugin root:

```bash
npm run vault:init
```

Or with a custom vault directory:

```bash
npm run vault:init -- --vault-dir /path/to/PortfolioVault
```

This is non-destructive. It creates only missing structure:

- `config.json`
- `events.jsonl`
- `import-drafts/`
- `imports/`
- `derived/positions.json`

After running, summarize the JSON output in plain language. Tell the user the vault is ready when `ok: true`.

## Reset Procedure

Reset is destructive to current vault state. Use it only when the user clearly asked to clear data.

Run from the Portfolio Vault plugin root:

```bash
npm run vault:reset
```

Or with a custom vault directory:

```bash
npm run vault:reset -- --vault-dir /path/to/PortfolioVault
```

By default this creates a backup under:

```text
~/Documents/PortfolioVault/backups/reset-...
```

It then clears:

- accounts
- instruments
- account mappings
- ledger events
- import drafts
- imported source files
- derived positions

Use `--no-backup` only when the user explicitly asks for no backup:

```bash
npm run vault:reset -- --no-backup
```

After running, summarize:

- vault directory
- backup path, or `no backup`
- resulting counts: accounts, instruments, positions, pending drafts

## Verification

After initialize or reset, verify with:

```bash
npm run vault:init
```

For reset, expected state is:

- accounts: 0
- instruments: 0
- positions: 0
- pendingDraftCount: 0

If the local web UI is running, refresh `http://127.0.0.1:43218/` and confirm the first-use onboarding appears after reset.

## Safety

Never delete the plugin source tree. These procedures operate only on the vault data directory.

Do not use shell commands such as `rm -rf ~/Documents/PortfolioVault` for normal reset. Use `npm run vault:reset` so backup and empty-file structure remain consistent.
