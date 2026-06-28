#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORTFOLIO_VAULT_PORT:-43218}"
VAULT_DIR="${PORTFOLIO_VAULT_DIR:-$HOME/Documents/PortfolioVault}"

export PORTFOLIO_VAULT_DIR="$VAULT_DIR"
export PORTFOLIO_VAULT_PORT="$PORT"

cd "$ROOT_DIR"

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  npm install
fi

echo "Portfolio Vault: http://127.0.0.1:${PORT}"
echo "Portfolio Vault data: ${PORTFOLIO_VAULT_DIR}"
exec npm run dev -- --host 127.0.0.1 --port "$PORT"
