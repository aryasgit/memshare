#!/usr/bin/env bash
# share.sh — start Memshare locally and expose it via a tunnel.
#
# Two tunnel backends, picked automatically:
#   - ngrok          (preferred) if .share.env sets MEMSHARE_NGROK_DOMAIN
#                    and ngrok is installed. Gives a stable URL.
#   - cloudflared    fallback. Zero setup, random URL each session.
#
# Survives macOS sleep (caffeinate) and auto-restarts on tunnel crash.
# Ctrl+C tears everything down cleanly.

set -e
cd "$(dirname "$0")"

# ── source local config (gitignored) ─────────────────────────────────
if [ -f .share.env ]; then
  set -a
  # shellcheck disable=SC1091
  source .share.env
  set +a
fi

PORT=${MEMSHARE_PORT:-8787}

# ── decide tunnel tool ───────────────────────────────────────────────
TOOL=""
if [ -n "${MEMSHARE_NGROK_DOMAIN:-}" ] && command -v ngrok >/dev/null 2>&1; then
  TOOL="ngrok"
elif command -v cloudflared >/dev/null 2>&1; then
  TOOL="cloudflared"
elif command -v ngrok >/dev/null 2>&1; then
  TOOL="ngrok-ephemeral"
fi

if [ -z "$TOOL" ]; then
  echo "✗  No tunnel tool installed."
  echo "   For a stable URL:     brew install ngrok   (then see .share.env.example)"
  echo "   For zero-setup:       brew install cloudflared"
  exit 1
fi

# ── prereqs ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "✗  Node.js is not installed. Get it from https://nodejs.org"
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

# ── graceful stop ────────────────────────────────────────────────────
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

# ── caffeinate (prevent macOS sleep) ─────────────────────────────────
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu &
  CAF_PID=$!
fi

# ── start Memshare ────────────────────────────────────────────────────
echo "→  Starting Memshare on http://localhost:$PORT  (tunnel: $TOOL)"
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

print_banner() {
  local url="$1" note="$2"
  cat <<EOF

──────────────────────────────────────────────────────────────────
  Memshare is live at:

      $url

  ${note:-Open that URL on any device. Share it with teammates.}
  Press Ctrl+C in this window to stop both processes.
──────────────────────────────────────────────────────────────────

EOF
}

# ── tunnel loop ──────────────────────────────────────────────────────
attempt=0
while [ "$RUNNING" = "1" ]; do
  attempt=$((attempt + 1))
  : > "$TUNNEL_LOG"

  case "$TOOL" in
    ngrok)
      [ "$attempt" -eq 1 ] && echo "→  Starting ngrok tunnel"
      [ "$attempt" -gt 1 ] && echo "→  Reconnecting ngrok (attempt #$attempt)"
      ngrok http "$PORT" --url="$MEMSHARE_NGROK_DOMAIN" --log=stdout --log-format=logfmt >"$TUNNEL_LOG" 2>&1 &
      TUNNEL_PID=$!
      # The URL is what we configured — print it immediately
      sleep 1.5
      if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
        echo "✗  ngrok exited immediately. First log lines:"
        head -5 "$TUNNEL_LOG"
        echo
        echo "   Common fix:  ngrok config add-authtoken <your-token>"
        echo "   Get token at: https://dashboard.ngrok.com/get-started/your-authtoken"
        exit 1
      fi
      print_banner "https://$MEMSHARE_NGROK_DOMAIN" "Stable URL — same every session."
      ;;

    ngrok-ephemeral)
      [ "$attempt" -eq 1 ] && echo "→  Starting ngrok tunnel (ephemeral URL — claim a static domain to get a stable one)"
      [ "$attempt" -gt 1 ] && echo "→  Reconnecting ngrok (attempt #$attempt)"
      ngrok http "$PORT" --log=stdout --log-format=logfmt >"$TUNNEL_LOG" 2>&1 &
      TUNNEL_PID=$!
      URL=""
      for i in {1..30}; do
        URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
              | grep -oE 'https://[a-z0-9-]+\.ngrok[a-z.-]+' | head -1)
        if [ -n "$URL" ]; then break; fi
        if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then break; fi
        sleep 0.5
      done
      if [ -n "$URL" ]; then
        print_banner "$URL" "Ephemeral URL — changes each restart."
      else
        echo "✗  Couldn't read ngrok URL. Log: $TUNNEL_LOG"
      fi
      ;;

    cloudflared)
      [ "$attempt" -eq 1 ] && echo "→  Starting Cloudflare Tunnel"
      [ "$attempt" -gt 1 ] && echo "→  Reconnecting tunnel (attempt #$attempt)"
      cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
      TUNNEL_PID=$!
      URL=""
      for i in {1..60}; do
        URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
        if [ -n "$URL" ]; then break; fi
        if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then break; fi
        sleep 0.5
      done
      if [ -n "$URL" ]; then
        print_banner "$URL" "Random URL — set MEMSHARE_NGROK_DOMAIN in .share.env for a stable one."
      else
        echo "✗  Couldn't read tunnel URL. Log: $TUNNEL_LOG"
      fi
      ;;
  esac

  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""

  if [ "$RUNNING" = "1" ]; then
    echo
    echo "⚠  Tunnel dropped. Reconnecting in 3 seconds…"
    sleep 3
  fi
done
