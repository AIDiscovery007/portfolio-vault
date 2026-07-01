---
name: portfolio-vault-security-lookup
description: Batch-match mainland China A-share and exchange-traded fund names or codes to official security codes for Portfolio Vault imports.
---

# Portfolio Vault Security Lookup

Use this before creating or enriching Portfolio Vault drafts that contain A-shares, listed ETFs, LOFs, or broker-shortened exchange-traded security names.

## Rules

- Use this for exchange-traded securities such as `招商证券`, `沪电股份`, `半导体设备ETF易方达`, `标普500ETF华夏`, and `纳指ETF汇添富`.
- Use `portfolio-vault-fund-lookup` instead for OTC mutual funds, QDII mutual funds, ETF feeder funds, and Alipay/Tiantian fund platform products.
- Match identity first. Portfolio Vault does not need share count or latest price to calculate amount-based positions.
- Keep ambiguous rows as `needs_review`; do not force a low-confidence match into a ready ledger event.
- Store source and confidence under `row.extractedHolding` so the user can audit the match later.
- Do not use general web search unless the fixed lookup path returns no plausible result.

## Fast Fixed Lookup Path

Pass all names or codes in one command:

```bash
node skills/portfolio-vault-security-lookup/scripts/security-lookup.mjs "招商证券" "沪电股份" "半导体设备ETF易方达"
```

The script uses Eastmoney's security suggest API as a fixed, cached path. It caches query results locally for the day under `~/.cache/portfolio-vault/security-lookup-cache.json`.

## Draft Enrichment Shape

For a high-confidence match, use the matched code as `proposedEvent.instrumentId` and include the security metadata:

```json
{
  "proposedEvent": {
    "type": "holding_snapshot",
    "instrumentId": "600999",
    "currency": "CNY",
    "cashInvested": 2105.02,
    "marketValue": 2110.00,
    "unrealizedPnL": 4.98
  },
  "extractedHolding": {
    "name": "招商证券",
    "officialName": "招商证券",
    "securityCode": "600999",
    "assetClass": "stock",
    "market": "SSE",
    "currency": "CNY",
    "matchSource": "Eastmoney security suggest API",
    "matchConfidence": 0.99
  }
}
```

For listed ETFs, set `assetClass` to `etf`.

## Confidence

- Exact code or exact normalized name match: usually `matchConfidence >= 0.98`.
- Broker-shortened ETF name with a unique first result: usually `0.90-0.97`.
- Multiple same-name markets, uncertain suffix, or no mainland exchange match: keep as `needs_review`.
