---
name: portfolio-vault-open
description: Open the Portfolio Vault local web service and dashboard. Use when the user asks to open, launch, view, or work in Portfolio Vault.
---

# Portfolio Vault Open

Start the local Portfolio Vault service for the user's global vault:

```bash
./scripts/start-vault.sh
```

Run this from the Portfolio Vault plugin root. The default URL is:

```text
http://127.0.0.1:43218/
```

The default vault directory is:

```text
~/Documents/PortfolioVault
```

When Browser control is available, open the URL in the Codex in-app browser. If browser control is unavailable, give the user the local URL. Do not inspect or mutate the formal ledger just to open the dashboard.
