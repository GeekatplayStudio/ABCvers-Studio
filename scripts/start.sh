#!/usr/bin/env bash
# ABCvers Studio - build and serve in the background.
#   ./scripts/start.sh                 build, then serve on 4173
#   ./scripts/start.sh --port 8080     serve on another port
#   ./scripts/start.sh --dev           hot-reloading dev server, no build
#   ./scripts/start.sh --skip-build    serve the existing dist/
#   ./scripts/start.sh --force         restart a running instance
#   ./scripts/start.sh --no-open       do not open a browser
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

PORT=0
DEV=0
SKIP_BUILD=0
FORCE=0
NO_OPEN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --dev) DEV=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --force) FORCE=1; shift ;;
    --no-open) NO_OPEN=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) fail_ "Unknown option: $1"; exit 2 ;;
  esac
done

head_ "$APP_NAME - start"

if [ "$PORT" -le 0 ] 2>/dev/null || [ "$PORT" = "0" ]; then
  if [ "$DEV" -eq 1 ]; then PORT=$DEV_PORT; else PORT=$PREVIEW_PORT; fi
fi
MODE=preview
[ "$DEV" -eq 1 ] && MODE=dev

# --- already running? -------------------------------------------------------
if load_state; then
  if [ "$FORCE" -eq 0 ]; then
    note_ "Already running on http://localhost:$PORT/ (pid $PID)."
    printf '    Use --force to restart it, or run ./scripts/stop.sh first.\n'
    [ "$NO_OPEN" -eq 0 ] && open_browser "http://localhost:$PORT/"
    exit 0
  fi
  step_ "Stopping the running instance (pid $PID)"
  stop_pid "$PID" || true
  clear_state
fi

assert_node
assert_dependencies

if [ ! -f "$VITE_BIN" ]; then
  fail_ "Vite is missing from node_modules - run ./scripts/install.sh."
  exit 1
fi

# --- the port must be free, or --strictPort would fail after the build ------
if port_open "$PORT"; then
  fail_ "Port $PORT is already in use$( [ -n "$(port_owner "$PORT")" ] && printf ' by pid %s' "$(port_owner "$PORT" | tr '\n' ' ')" )."
  printf '    Pick another with --port <number>, or stop whatever is using it.\n'
  exit 1
fi

# --- build ------------------------------------------------------------------
if [ "$DEV" -eq 1 ]; then
  step_ "Dev mode - skipping the production build"
elif [ "$SKIP_BUILD" -eq 1 ]; then
  if [ ! -f "$ROOT/dist/index.html" ]; then
    fail_ "No dist/ to serve - run without --skip-build first."
    exit 1
  fi
  step_ "Serving the existing build"
else
  step_ "Typechecking and building for production"
  run_npm run build
  ok_ "Build complete."
fi

# --- serve ------------------------------------------------------------------
mkdir -p "$RUN_DIR"
: > "$OUT_LOG"

# node is launched directly rather than through npm: the recorded pid is then
# the server itself, so stop.sh never has to hunt through a shim's children.
if [ "$DEV" -eq 1 ]; then
  set -- "$VITE_BIN" --port "$PORT" --strictPort
else
  set -- "$VITE_BIN" preview --port "$PORT" --strictPort
fi

step_ "Starting the $MODE server on port $PORT"
(cd "$ROOT" && nohup node "$@" >"$OUT_LOG" 2>&1 &
 echo $! > "$RUN_DIR/.pid")
SERVER_PID="$(cat "$RUN_DIR/.pid")"
rm -f "$RUN_DIR/.pid"
save_state "$SERVER_PID" "$PORT" "$MODE"

if ! wait_for_port "$PORT" 40; then
  fail_ "The server did not come up on port $PORT within 40s."
  tail -n 20 "$OUT_LOG" 2>/dev/null | sed 's/^/    /' || true
  stop_pid "$SERVER_PID" || true
  clear_state
  exit 1
fi

URL="http://localhost:$PORT/"
ok_ "$APP_NAME is running at $URL (pid $SERVER_PID)"
printf '    Logs: %s\n' "$OUT_LOG"
printf '    Stop it with ./scripts/stop.sh\n'
[ "$NO_OPEN" -eq 0 ] && open_browser "$URL"
printf '\n'
