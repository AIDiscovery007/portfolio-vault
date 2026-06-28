---
name: portfolio-vault-fund-lookup
description: Precisely match Chinese mutual fund names from screenshots or broker records to fund codes, official names, NAV dates, unit NAVs, and confidence/source notes for Portfolio Vault imports.
---

# Portfolio Vault Fund Lookup

Use this before creating or enriching Portfolio Vault drafts that contain Chinese mutual funds, QDII funds, ETF feeder funds, Hong Kong mutual-recognition funds, or broker-shortened fund names.

## Rules

- Match identity first, then NAV. Do not infer shares until code, official name, NAV date, and unit NAV are resolved.
- Preserve share uncertainty. Account shares are private broker data; when a screenshot lacks shares, write `estimatedShares = marketValue / unitNav` and mark it as estimated.
- Respect share class. A/C,人民币,美元现汇/现钞,后端,ETF联接,发起式, and Hong Kong R-class labels materially change the code.
- Keep ambiguous rows as `needs_review`. Never force a low-confidence match into a ready ledger event.
- Store source and confidence on each row so the user can audit the match later.
- Do not use general web search for ordinary mainland funds unless the fixed lookup path fails. It is too slow and too noisy.

## Fast Fixed Lookup Path

Use the bundled script first:

```bash
node skills/portfolio-vault-fund-lookup/scripts/fund-lookup.mjs "国富亚洲机会股票(QDII)C"
```

The script uses a local cached fund-code index from Tiantian/Eastmoney and then fetches NAV only for matched candidate codes. This should be the default path for speed.

Preferred data path:

1. Mainland public fund identity index:
   - `https://fund.eastmoney.com/js/fundcode_search.js`
   - cache locally for the day; this avoids repeated browser/search queries
2. Mainland public fund NAV:
   - `https://fund.eastmoney.com/pingzhongdata/{fundCode}.js`
   - parse latest `Data_netWorthTrend` item as unit NAV and NAV date
3. Realtime/latest fallback:
   - `https://fundgz.1234567.com.cn/js/{fundCode}.js`
4. Official/audit fallback:
   - use CSRC capital-market electronic disclosure platform / fund disclosure pages for official public disclosures when a match is ambiguous or a row is high value
5. Hong Kong mutual-recognition funds (`968xxx`):
   - use Tiantian overseas pages first for speed
   - verify against the mainland agent/fund house disclosure page when confidence matters

## Lookup Order

1. Normalize the screenshot name:
   - convert full-width parentheses to half-width for searching, but keep the original label in `rawText`
   - preserve A/C/人民币/美元/R-class suffixes
   - search both the original name and a shorter stem without noisy platform wording
2. Run the fixed lookup script against the normalized names.
3. Choose the result whose official name matches the product class and suffix.
   - exact class/suffix match: usually `matchConfidence >= 0.96`
   - shortened platform label but unique class match: usually `0.90-0.95`
   - multiple same-stem classes or unclear currency/share class: keep `needs_review`
4. Record:
   - `fundCode`
   - `officialName`
   - `navDate`
   - `unitNav`
   - `matchSource`
   - `matchConfidence`
   - `matchNote` when the screenshot name is a shortened platform label

## Draft Enrichment Shape

Add the fields under `row.extractedHolding`:

```json
{
  "fundCode": "021662",
  "officialName": "国富亚洲机会股票(QDII)C",
  "navDate": "2026-06-25",
  "unitNav": 3.2554,
  "estimatedShares": 2167.5032,
  "estimatedSharesFormula": "marketValue / unitNav",
  "matchSource": "东方财富/天天基金基金档案与净值数据",
  "matchConfidence": 0.98
}
```

When confidence is high enough to review for entry, also create ready rows with `proposedEvent` for:

- `opening_position`: quantity from estimated shares, cost from broker-reported cost or `marketValue - holdingPnl`
- `price_snapshot`: unit NAV as the current price for display and unrealized P&L projection

If actual broker shares later become available, use a correction event rather than silently overwriting the historical opening position.
