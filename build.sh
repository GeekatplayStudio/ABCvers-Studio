#!/usr/bin/env bash
# ABCvers Studio - typecheck and build to ./dist.
# Geekatplay Studio, Vladimir Chopine.
set -euo pipefail

echo
echo "  ABCvers Studio - build"
echo "  -----------------------"
echo

if [ ! -d node_modules ]; then
  echo "  Dependencies are not installed yet - running install.sh first."
  npm install
fi

npm run build

echo
echo "  Built to ./dist"
echo
