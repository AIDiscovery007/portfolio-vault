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

Always prefer `./scripts/start-vault.sh` over raw `npm run dev`. The script detects an existing Portfolio Vault service on the target port and restarts it, so Codex does not accidentally talk to stale server code after plugin updates. If the port is occupied by a non-Portfolio Vault process, the script exits instead of killing it.

After the service starts, check `http://127.0.0.1:43218/api/health` when doing imports or debugging. The health response includes plugin version, process id, start time, vault path, and capability flags; use it to catch stale services before creating drafts.

When Browser control is available, open the URL in the Codex in-app browser. If browser control is unavailable, give the user the local URL. Do not inspect or mutate the formal ledger just to open the dashboard.
