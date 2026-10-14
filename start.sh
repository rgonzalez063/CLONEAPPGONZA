#!/bin/sh
# Starts Adjustment Support on this computer: installs what it needs the first time, then opens http://localhost:3000
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again."; exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 20 ]; then echo "Node.js $MAJOR is too old. Install version 20 or newer from https://nodejs.org"; exit 1; fi
[ -d node_modules ] || { echo "First run: installing (a few minutes)..."; npm install || exit 1; }
[ -d .next ] || { echo "Building the app..."; npm run build || exit 1; }
PORT=${PORT:-3000}
echo; echo "Adjustment Support is starting at http://localhost:$PORT  (close this window to stop it)"; echo
( sleep 4; (open "http://localhost:$PORT" || xdg-open "http://localhost:$PORT") >/dev/null 2>&1 ) &
exec npm start -- -p "$PORT"
