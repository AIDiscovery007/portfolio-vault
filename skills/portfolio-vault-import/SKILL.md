---
name: portfolio-vault-import
description: Parse a brokerage CSV or screenshot/image into a Portfolio Vault import draft. Use when the user asks to import transaction, holding, cash, price, or P&L data into Portfolio Vault.
---

# Portfolio Vault Import

Use this workflow for CSV and screenshot/image imports.

## Rules

- Create an import draft only. Do not append to the formal ledger.
- Resolve account ownership before creating the draft. A draft must not be created with missing or guessed account ownership.
- Preserve uncertainty. Low-confidence account assignment, ambiguous symbols, duplicated-looking trades, and OCR uncertainty must be marked on draft rows.
- The user approves drafts in the local web UI.
- Broker-reported positions, cash, floating P&L, and account totals are reconciliation snapshots, not overrides of derived ledger state.
- For Chinese mutual funds, use `portfolio-vault-fund-lookup` before finalizing the draft rows. Record fund code, official name, source, and confidence. NAV data is optional audit metadata only; do not estimate shares.
- For mainland A-shares and listed ETFs, use `portfolio-vault-security-lookup` before finalizing draft rows. Record security code, official name, market, asset class, source, and confidence.
- Use `portfolio-vault-position-math` for holding snapshot formulas and row shape. Portfolio Vault tracks cash invested, return, weight, and current value; shares are not part of the core ledger view.
- When a row creates a `proposedEvent.instrumentId`, include enough row metadata to register that instrument during approval. For fund imports this means `extractedHolding.fundCode`, `officialName`, `currency`, and `matchSource` when available.

## Account Preflight

Run this before parsing rows into a draft:

1. Read the vault config and list existing accounts.
2. If the user explicitly named an account, use that account. If it does not exist, propose creating it and wait for confirmation before continuing.
3. If no accounts exist:
   - infer a concise account from the source, such as `支付宝基金`, `富途证券`, `华泰证券`, or the broker/file label shown in the screenshot
   - choose `type = fund` for platform fund holdings, `brokerage` for brokerage accounts, `cash` for cash-only imports, otherwise `other`
   - infer currency from the import; use `CNY` for mainland fund platform screenshots unless the source says otherwise
   - ask the user to confirm the proposed account name/type/currency before creating the draft
   - after confirmation, create the account in config and use its id on the draft and every proposed event
4. If accounts already exist and the user did not specify one:
   - match the source against existing account names, institutions, and account mappings
   - when there is one high-confidence match, show the match and ask for confirmation before import
   - when confidence is low or multiple accounts match, ask the user to choose before import
5. Add or update an `accountMappings` entry only after the user confirms the account assignment.

Do not create the import draft until this preflight is complete. If confirmation is missing, stop with a concise account proposal instead of producing a partial draft.

## Draft Rows

Each row should include:

- `id`
- `status`: `ready`, `needs_review`, `duplicate_suspected`, or `unsupported`
- `confidence`: number from 0 to 1
- `proposedEvent` when a ledger event is clear enough to review
- `rawText` when parsed from image/OCR
- `issues` for unresolved ambiguity
- `duplicateOf` when a likely duplicate is detected

For high-confidence holding snapshots, create ready review rows with a single `proposedEvent.type = "holding_snapshot"`. Keep uncertain rows as `needs_review`.

Batch the import for speed:

1. Extract all rows from the source first.
2. Run fund/security lookup once with all names, not one command per holding.
3. Build one `rows` array in memory.
4. Call `create_import_draft` once for the full import.

Do not create one draft per holding and do not call MCP once per row.

Approval automatically registers missing instruments from draft row metadata. If a draft lacks `extractedHolding`/instrument metadata, the formal ledger can still be written but the UI may show an unmapped instrument. Treat missing metadata on a ready row as an import quality issue.

Use the Portfolio Vault MCP `create_import_draft` tool when available. If MCP is not available, tell the user the parsed draft summary and ask them to open Portfolio Vault for review.
