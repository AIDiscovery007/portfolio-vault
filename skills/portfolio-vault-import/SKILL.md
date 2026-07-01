---
name: portfolio-vault-import
description: Parse a brokerage CSV or screenshot/image into a Portfolio Vault import draft. Use when the user asks to import transaction, holding, cash, price, or P&L data into Portfolio Vault.
---

# Portfolio Vault Import

Use this workflow for CSV and screenshot/image imports.

## Rules

- Start or verify the local Web UI before parsing a non-trivial import. The user should see Portfolio Vault early, even if the draft is not ready yet.
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

1. Start the local Web UI with `portfolio-vault-open` and verify `/api/health`.
2. Read the vault config and list existing accounts.
3. If the user explicitly named an account, use that account. If it does not exist, create an account proposal and let the user confirm it in the Web UI before approval.
4. If no accounts exist:
   - infer a concise account from the source, such as `支付宝基金`, `富途证券`, `华泰证券`, or the broker/file label shown in the screenshot
   - choose `type = fund` for platform fund holdings, `brokerage` for brokerage accounts, `cash` for cash-only imports, otherwise `other`
   - infer currency from the import; use `CNY` for mainland fund platform screenshots unless the source says otherwise
   - attach this as `draft.accountProposal`
   - leave `draft.accountId` empty until the user confirms the proposal in the Web UI
   - omit `proposedEvent.accountId` on ready rows when the account is still pending; the Web UI confirmation will bind the account to the draft and rows
5. If accounts already exist and the user did not specify one:
   - match the source against existing account names, institutions, and account mappings
   - when there is one high-confidence match, use that account and include it on the draft and proposed events
   - when confidence is low or multiple accounts match, create a draft only after the user chooses the account or after you attach a clear account proposal for Web UI confirmation
6. Add or update an `accountMappings` entry only after the user confirms the account assignment.

A draft with `accountProposal` is allowed, but it must not be approvable until the proposal is confirmed in the Web UI.

Account proposal shape:

```json
{
  "accountProposal": {
    "id": "cms-66-060",
    "name": "招商证券 66***060",
    "type": "brokerage",
    "currency": "CNY",
    "institution": "招商证券",
    "confidence": 0.9,
    "source": "broker screenshot"
  }
}
```

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
