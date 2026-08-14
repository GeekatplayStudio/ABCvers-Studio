#!/usr/bin/env bash
# ABCvers Studio - install dependencies.
#   ./scripts/install.sh            reproducible install from the lockfile
#   ./scripts/install.sh --update   let npm resolve newer versions
#   ./scripts/install.sh --verify   also typecheck, lint and run the tests
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

UPDATE=0
VERIFY=0
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    --verify) VERIFY=1 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) fail_ "Unknown option: $arg"; exit 2 ;;
  esac
done

head_ "$APP_NAME - install"
assert_node

if [ -f "$ROOT/package-lock.json" ] && [ "$UPDATE" -eq 0 ]; then
  step_ "Installing from package-lock.json (npm ci)"
  run_npm ci --no-audit --no-fund
else
  step_ "Resolving and installing dependencies (npm install)"
  run_npm install --no-audit --no-fund
fi

ok_ "Dependencies installed."

if [ "$VERIFY" -eq 1 ]; then
  step_ "Typechecking, linting and running the test suite"
  run_npm run verify
  ok_ "All checks passed."
fi

printf '\n  Next: run ./scripts/start.sh to build and open the studio.\n\n'
