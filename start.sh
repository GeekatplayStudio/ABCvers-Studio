#!/usr/bin/env bash
# ABCvers Studio - build and serve, opening the browser.
# Geekatplay Studio, Vladimir Chopine.
# Runs in the foreground - press Ctrl+C to stop the server.
set -euo pipefail

echo
echo "  ABCvers Studio - start"
echo "  -----------------------"
echo

if [ ! -d node_modules ]; then
  echo "  Dependencies are not installed yet - running install.sh first."
  npm install
fi

echo "  Building..."
npm run build

URL="http://localhost:4173/"
echo
echo "  Starting at $URL  (Ctrl+C here to stop)"
echo

# Open the browser a couple of seconds after the server has had a chance to
# bind the port, without blocking the server itself.
(
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
) &
disown 2>/dev/null || true

npm run serve
