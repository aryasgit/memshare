#!/usr/bin/env bash
# share.sh — start Memshare locally and expose it via a Cloudflare quick tunnel.
# Survives macOS sleep (via caffeinate) and auto-restarts the tunnel if it
# drops. Ctrl+C tears everything down cleanly.
#
# Usage:    ./share.sh        (from the repo root)
#       or  npm run share

set -e
cd "$(dirname "$0")"

PORT=${MEMSHARE_PORT:-8787}

# ── prereqs ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "✗  Node.js is not installed. Get it from https://nodejs.org"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "✗  cloudflared is not installed."
  echo "   brew install cloudflared"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "→  Installing dependencies (one-time)"
  npm install --silent --no-audit --no-fund
fi

if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "✗  Port $PORT is already in use."
  echo "   Hint: pkill -f 'node server/index.js'"
  exit 1
fi

LOG_DIR=$(mktemp -d -t memshare-share.XXXXXX)
SERVER_LOG="$LOG_DIR/server.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"

# ── graceful stop signalling ─────────────────────────────────────────
RUNNING=1
SERVER_PID=""
TUNNEL_PID=""
CAF_PID=""

cleanup() {
  RUNNING=0
  echo
  echo "→  Shutting down…"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$CAF_PID"    ] && kill "$CAF_PID"    2>/dev/null || true
  wait 2>/dev/null || true
  echo "   Logs preserved at: $LOG_DIR"
}
trap cleanup EXIT INT TERM

# ── prevent macOS sleep while sharing ────────────────────────────────
if command -v caffeinate >/dev/null 2>&1; then
  # -d display, -i idle, -m disk, -s prevent on AC, -u user activity
  caffeinate -dimsu &
  CAF_PID=$!
fi

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

# ── tunnel loop (auto-restart) ───────────────────────────────────────
print_banner() {
  local url="$1"
  cat <<EOF

──────────────────────────────────────────────────────────────────
  Memshare is live at:

      $url

  Open that URL on any device. Share it with teammates.
  Press Ctrl+C in this window to stop both processes.
──────────────────────────────────────────────────────────────────

EOF
}

attempt=0
while [ "$RUNNING" = "1" ]; do
  attempt=$((attempt + 1))
  : > "$TUNNEL_LOG"

  if [ "$attempt" -gt 1 ]; then
    echo "→  Reconnecting tunnel (attempt #$attempt)"
  else
    echo "→  Starting Cloudflare Tunnel"
  fi

  cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  URL=""
  for i in {1..60}; do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then break; fi
    # exit early if cloudflared already died
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then break; fi
    sleep 0.5
  done

  if [ -n "$URL" ]; then
    print_banner "$URL"
  else
    echo "✗  Couldn't read tunnel URL. Log: $TUNNEL_LOG"
  fi

  # Wait for cloudflared to exit (will return on Ctrl+C signal too)
  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""

  if [ "$RUNNING" = "1" ]; then
    echo
    echo "⚠  Tunnel dropped. Reconnecting in 3 seconds…"
    sleep 3
  fi
done
