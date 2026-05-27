#!/usr/bin/env bash
# share.sh — start Memshare locally and expose it via a Cloudflare quick tunnel.
# One command, one URL. Ctrl+C tears both down cleanly.
#
# Usage:    ./share.sh        (from the repo root)
#       or  npm run share     (works from anywhere inside the repo)

set -e
cd "$(dirname "$0")"

PORT=${MEMSHARE_PORT:-8787}

# ── prereqs ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "✗  Node.js is not installed."
  echo "   Install Node 20+ from https://nodejs.org and re-run."
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "✗  cloudflared is not installed."
  echo "   brew install cloudflared"
  echo "   (or https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "→  Installing dependencies (one-time)"
  npm install --silent --no-audit --no-fund
fi

if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "✗  Port $PORT is already in use. Kill the other process or set MEMSHARE_PORT."
  echo "   Hint: pkill -f 'node server/index.js'  (only kills Memshare)"
  exit 1
fi

# ── temp logs ────────────────────────────────────────────────────────
LOG_DIR=$(mktemp -d -t memshare-share.XXXXXX)
SERVER_LOG="$LOG_DIR/server.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"

cleanup() {
  echo
  echo "→  Shutting down…"
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "   Logs preserved at: $LOG_DIR"
}
trap cleanup EXIT INT TERM

# ── start Memshare ────────────────────────────────────────────────────
echo "→  Starting Memshare on http://localhost:$PORT"
MEMSHARE_PORT="$PORT" node server/index.js >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for i in {1..30}; do
  if curl -sf "http://localhost:$PORT/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.3
done
if ! curl -sf "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
  echo "✗  Memshare didn't come up. Log: $SERVER_LOG"
  exit 1
fi

# ── start cloudflared ─────────────────────────────────────────────────
echo "→  Starting Cloudflare Tunnel"
cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

URL=""
for i in {1..60}; do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$URL" ]; then break; fi
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "✗  Couldn't read a tunnel URL from cloudflared. Log: $TUNNEL_LOG"
  exit 1
fi

# ── banner ────────────────────────────────────────────────────────────
cat <<EOF

──────────────────────────────────────────────────────────────────
  Memshare is live.

      $URL

  Open that URL on any device. Share it with teammates.
  Press Ctrl+C in this window to stop both processes.
──────────────────────────────────────────────────────────────────

EOF

# Block until either child dies; trap cleans up the survivor.
wait
