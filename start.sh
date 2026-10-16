#!/bin/sh
# Starts Adjustment Support on this computer. Installs and builds the first time, and again whenever this folder holds a newer version.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again."; exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 20 ]; then echo "Node.js $MAJOR is too old. Install version 20 or newer from https://nodejs.org"; exit 1; fi
WANT=$(cat VERSION 2>/dev/null || echo unknown)
HAVE=$(cat .app-version 2>/dev/null || echo none)
if [ ! -d node_modules ] || [ ! -d .next ] || [ "$WANT" != "$HAVE" ]; then
  echo "Setting up version $WANT (a few minutes the first time)..."
  npm install || exit 1
  rm -rf .next
  npm run build || exit 1
  echo "$WANT" > .app-version
fi
PORT=${PORT:-3000}
echo; echo "Adjustment Support is starting at http://localhost:$PORT  (close this window to stop it)"; echo
( sleep 4; (open "http://localhost:$PORT" || xdg-open "http://localhost:$PORT") >/dev/null 2>&1 ) &
exec npm start -- -p "$PORT"
