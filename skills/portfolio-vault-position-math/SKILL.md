---
name: portfolio-vault-position-math
description: Use Portfolio Vault's amount-based position formulas and batch draft row shape. Use when importing holdings, explaining portfolio calculations, or creating holding_snapshot events.
---

# Portfolio Vault Position Math

Portfolio Vault tracks holding amounts, not broker share counts.

Use this skill whenever you create or explain holding import rows.

## Core Formula

Use exactly these formulas:

```text
cashInvested = marketValue - unrealizedPnL
unrealizedPnL = marketValue - cashInvested
returnPct = unrealizedPnL / cashInvested
allocationPct = marketValue / totalMarketValue
marketValue = cashInvested + unrealizedPnL
```

Display money and percentages to 2 decimal places.

If `cashInvested` is 0 or missing, return percentage is unknown and should be shown as `--`.

## Holding Snapshot Event

For current holdings, create one event per holding:

```json
{
  "type": "holding_snapshot",
  "occurredAt": "2026-07-01T00:00:00.000+08:00",
  "accountId": "alipay-fund",
  "instrumentId": "021662",
  "currency": "CNY",
  "cashInvested": 6600.00,
  "marketValue": 7056.09,
  "unrealizedPnL": 456.09
}
```

`cashInvested` may be omitted only when `marketValue` and `unrealizedPnL` are present; Portfolio Vault derives it as `marketValue - unrealizedPnL`.

Do not create `opening_position` or `price_snapshot` for amount-only holding screenshots.

## Draft Row Shape

Each ready holding row should look like:

```json
{
  "id": "row_001",
  "status": "ready",
  "confidence": 0.98,
  "rawText": "broker row text or screenshot label",
  "proposedEvent": {
    "type": "holding_snapshot",
    "occurredAt": "2026-07-01T00:00:00.000+08:00",
    "accountId": "alipay-fund",
    "instrumentId": "021662",
    "currency": "CNY",
    "cashInvested": 6600.00,
    "marketValue": 7056.09,
    "unrealizedPnL": 456.09
  },
  "extractedHolding": {
    "name": "screenshot name",
    "officialName": "official fund name",
    "fundCode": "021662",
    "currency": "CNY",
    "cashInvested": 6600.00,
    "marketValue": 7056.09,
    "holdingPnl": 456.09,
    "holdingPnlPct": 0.0691,
    "allocationPct": 0.2088,
    "matchSource": "Eastmoney/Tiantian fund code index",
    "matchConfidence": 0.98
  }
}
```

NAV fields such as `unitNav` and `navDate` are allowed as audit metadata, but they must not be required for position math.

Do not estimate or store shares unless the user explicitly asks for share tracking.

## Batch Import Procedure

For a screenshot or CSV containing multiple holdings:

1. Parse every holding first.
2. Run fund lookup once with all names.
3. Compute `cashInvested`, `returnPct`, and `allocationPct` in memory.
4. Create one draft containing all rows with a single `create_import_draft` call.

Avoid one MCP call per holding. Avoid one draft per holding.
