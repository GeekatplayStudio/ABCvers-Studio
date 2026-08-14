#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ABCvers Studio - shared helpers for install / start / stop.
# Geekatplay Studio, Vladimir Chopine.
# Sourced by the other scripts; not meant to be run on its own.
# ---------------------------------------------------------------------------

APP_NAME="ABCvers Studio"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$ROOT/.abcvers"
STATE_FILE="$RUN_DIR/server.env"
OUT_LOG="$RUN_DIR/server.log"
VITE_BIN="$ROOT/node_modules/vite/bin/vite.js"

PREVIEW_PORT=4173
DEV_PORT=5173
MIN_NODE_MAJOR=18

head_()  { printf '\n  %s\n  %s\n' "$1" "$(printf '%*s' "${#1}" '' | tr ' ' '-')"; }
step_()  { printf '  > %s\n' "$1"; }
ok_()    { printf '  + %s\n' "$1"; }
note_()  { printf '  ! %s\n' "$1"; }
fail_()  { printf '  x %s\n' "$1" >&2; }

assert_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail_ "Node.js was not found on PATH."
    printf '    Install the LTS build from https://nodejs.org and reopen this terminal.\n'
    exit 1
  fi
  local raw major
  raw="$(node --version)"
  major="${raw#v}"
  major="${major%%.*}"
  if [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    fail_ "Node $raw is too old - $APP_NAME needs Node $MIN_NODE_MAJOR or newer."
    exit 1
  fi
  ok_ "Node $raw"
}

assert_dependencies() {
  [ -d "$ROOT/node_modules" ] && return 0
  note_ "Dependencies are not installed yet - running install first."
  "$SCRIPT_DIR/install.sh" || exit $?
}

run_npm() { (cd "$ROOT" && npm "$@") || { fail_ "npm $* failed."; exit 1; }; }

save_state() { # pid port mode
  mkdir -p "$RUN_DIR"
  printf 'PID=%s\nPORT=%s\nMODE=%s\n' "$1" "$2" "$3" > "$STATE_FILE"
}

# Populates PID / PORT / MODE. Fails when the recorded process is gone, or when
# the pid has been recycled by something that is not node.
load_state() {
  [ -f "$STATE_FILE" ] || return 1
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  [ -n "${PID:-}" ] || return 1
  kill -0 "$PID" 2>/dev/null || return 1
  case "$(ps -p "$PID" -o comm= 2>/dev/null)" in
    *node*) return 0 ;;
    *) return 1 ;;
  esac
}

clear_state() { rm -f "$STATE_FILE"; }

# Vite binds `localhost`, which can resolve to ::1 before 127.0.0.1 - probing
# one family alone reports a healthy server as dead.
port_open() { # port
  local target
  for target in 127.0.0.1 localhost ::1; do
    if command -v nc >/dev/null 2>&1; then
      nc -z "$target" "$1" >/dev/null 2>&1 && return 0
    else
      (exec 3<>"/dev/tcp/$target/$1") >/dev/null 2>&1 && return 0
    fi
  done
  return 1
}

port_owner() { # port -> pids on stdout
  command -v lsof >/dev/null 2>&1 || return 0
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true
}

wait_for_port() { # port timeout_seconds
  local waited=0 limit="${2:-40}"
  while [ "$waited" -lt "$((limit * 4))" ]; do
    port_open "$1" && return 0
    sleep 0.25
    waited=$((waited + 1))
  done
  return 1
}

stop_pid() { # pid
  kill -0 "$1" 2>/dev/null || return 0
  kill "$1" 2>/dev/null || true
  local waited=0
  while [ "$waited" -lt 40 ]; do
    kill -0 "$1" 2>/dev/null || return 0
    sleep 0.25
    waited=$((waited + 1))
  done
  kill -9 "$1" 2>/dev/null || true
  sleep 0.3
  ! kill -0 "$1" 2>/dev/null
}

open_browser() { # url
  if command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  fi
}
