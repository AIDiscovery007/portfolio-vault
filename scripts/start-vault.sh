#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORTFOLIO_VAULT_PORT:-43218}"
VAULT_DIR="${PORTFOLIO_VAULT_DIR:-$HOME/Documents/PortfolioVault}"

export PORTFOLIO_VAULT_DIR="$VAULT_DIR"
export PORTFOLIO_VAULT_PORT="$PORT"

cd "$ROOT_DIR"

PORT_PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:${PORT}/api/summary" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:${PORT}/" 2>/dev/null | grep -q "Portfolio Vault"; then
    echo "Portfolio Vault: restarting existing service on port ${PORT}"
    kill $PORT_PIDS 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      sleep 0.2
      if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
    done
  else
    echo "Port ${PORT} is already in use by another process. Set PORTFOLIO_VAULT_PORT to use a different port." >&2
    exit 1
  fi
fi

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  npm install
fi

echo "Portfolio Vault: http://127.0.0.1:${PORT}"
echo "Portfolio Vault data: ${PORTFOLIO_VAULT_DIR}"
exec npm run dev -- --host 127.0.0.1 --port "$PORT"
