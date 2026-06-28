---
name: portfolio-vault-import
description: Parse a brokerage CSV or screenshot/image into a Portfolio Vault import draft. Use when the user asks to import transaction, holding, cash, price, or P&L data into Portfolio Vault.
---

# Portfolio Vault Import

Use this workflow for CSV and screenshot/image imports.

## Rules

- Create an import draft only. Do not append to the formal ledger.
- Preserve uncertainty. Low-confidence account assignment, ambiguous symbols, duplicated-looking trades, and OCR uncertainty must be marked on draft rows.
- The user approves drafts in the local web UI.
- Broker-reported positions, cash, floating P&L, and account totals are reconciliation snapshots, not overrides of derived ledger state.

## Draft Rows

Each row should include:

- `id`
- `status`: `ready`, `needs_review`, `duplicate_suspected`, or `unsupported`
- `confidence`: number from 0 to 1
- `proposedEvent` when a ledger event is clear enough to review
- `rawText` when parsed from image/OCR
- `issues` for unresolved ambiguity
- `duplicateOf` when a likely duplicate is detected

Use the Portfolio Vault MCP `create_import_draft` tool when available. If MCP is not available, tell the user the parsed draft summary and ask them to open Portfolio Vault for review.
