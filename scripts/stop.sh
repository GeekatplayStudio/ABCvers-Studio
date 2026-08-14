#!/usr/bin/env bash
# ABCvers Studio - stop the server started by start.sh.
#   ./scripts/stop.sh                stop the recorded server
#   ./scripts/stop.sh --port 8080    also release another port
#   ./scripts/stop.sh --all          also release the dev port
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# Kept separate from PORT, which load_state overwrites from the state file.
WANTED_PORT=0
ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) WANTED_PORT="${2:-0}"; shift 2 ;;
    --all) ALL=1; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) fail_ "Unknown option: $1"; exit 2 ;;
  esac
done

head_ "$APP_NAME - stop"

STOPPED=0
PORTS="$WANTED_PORT"

if load_state; then
  step_ "Stopping the ${MODE:-preview} server on port ${PORT:-?} (pid $PID)"
  if stop_pid "$PID"; then
    ok_ "Server stopped."
    STOPPED=$((STOPPED + 1))
  else
    fail_ "Could not stop pid $PID."
    exit 1
  fi
  PORTS="$PORTS ${PORT:-0}"
  clear_state
elif [ -f "$STATE_FILE" ]; then
  note_ "The recorded server is no longer running - clearing the stale record."
  clear_state
fi

# --- fallback: release the port even without a usable record ----------------
if [ "$ALL" -eq 1 ] || [ "$STOPPED" -eq 0 ]; then
  PORTS="$PORTS $PREVIEW_PORT $DEV_PORT"
fi

for candidate in $(printf '%s\n' $PORTS | grep -E '^[1-9][0-9]*$' | sort -u); do
  for owner in $(port_owner "$candidate"); do
    # Only ever stop a node process - never something unrelated that happens
    # to have taken the port.
    case "$(ps -p "$owner" -o comm= 2>/dev/null)" in
      *node*) ;;
      *) continue ;;
    esac
    step_ "Releasing port $candidate (pid $owner)"
    if stop_pid "$owner"; then
      ok_ "Port $candidate released."
      STOPPED=$((STOPPED + 1))
    else
      fail_ "Could not stop pid $owner on port $candidate."
    fi
  done
done

[ "$STOPPED" -eq 0 ] && note_ "Nothing was running."
printf '\n'
