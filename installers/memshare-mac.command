#!/bin/bash
# Memshare — local installer for macOS.
# Double-click this file to install and launch.

set -e

REPO_URL="https://github.com/aryasgit/memshare.git"
INSTALL_DIR="$HOME/Memshare"

clear
cat <<'HEAD'
──────────────────────────────────────────────────────
  Memshare · local installer (macOS)
──────────────────────────────────────────────────────
HEAD
echo

if ! command -v node >/dev/null 2>&1; then
  cat <<'MSG'
  ✗  Node.js is not installed.

     Memshare needs Node.js 20 or newer.
     Download the LTS installer from:
         https://nodejs.org

     Then double-click this file again.

MSG
  read -rp "  Press enter to close…"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  ✗  Node $NODE_MAJOR is too old. Memshare needs Node 20+."
  echo "     Update from https://nodejs.org and re-run this file."
  echo
  read -rp "  Press enter to close…"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  cat <<'MSG'
  ✗  git is not installed.

     Install Xcode command-line tools first:
         xcode-select --install

     Then double-click this file again.

MSG
  read -rp "  Press enter to close…"
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  →  Updating existing Memshare at $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "  →  Cloning Memshare to $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo "  →  Installing dependencies (this only happens once)"
npm install --silent --no-audit --no-fund

echo
cat <<'GO'
──────────────────────────────────────────────────────
  Memshare is starting at http://localhost:8787

  A LAN URL will print below — hand it to teammates
  on the same Wi-Fi and they're in.

  Close this Terminal window or press ⌃C to stop.
──────────────────────────────────────────────────────

GO

(sleep 2 && open "http://localhost:8787/app.html") &
exec npm run local
