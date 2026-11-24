#!/usr/bin/env zsh
# Reproducible, isolated opencode server for the native-history gate.
#
# Usage:
#   scripts/native-history-server.zsh start <old|new> <manual|auto|background> <state-dir>
#   scripts/native-history-server.zsh stop  <state-dir>
#   scripts/native-history-server.zsh status <state-dir>
#
# A relative <state-dir> resolves against the repo root. The script creates
#   <state-dir>/config   XDG_CONFIG_HOME (opencode.jsonc and the Muse auth link)
#   <state-dir>/data     XDG_DATA_HOME
#   <state-dir>/state    XDG_STATE_HOME (the usage ledger lands here)
# and writes server.json (mode 0600) with the pid, URL, password, config path,
# arm, and mode. The password is never printed.
#
# Env overrides: GATE_HOST, GATE_PORT, GATE_PROVIDER, GATE_MODEL,
# GATE_KEEP_TOKENS, GATE_BUFFER, GATE_BACKGROUND, GATE_CONTEXT_LIMIT,
# GATE_SERVER_PASSWORD, GATE_READY_SECONDS, MUSE_CONFIG_SOURCE. The plugin path
# is always this worktree.
#
# GATE_BACKGROUND is `default` (omit the key, so opencode's own default applies),
# `true`, or `false`. Unset derives it from the mode: manual `false`, auto
# `default`, background `true`.
#
# GATE_CONTEXT_LIMIT loads scratch/gate-model-limit and clamps the Muse
# model's context window to that many tokens, which is how automatic compaction
# becomes reachable without generating a full 170k-token session. It is a gate
# input only: production config never loads it.
set -eu
setopt pipefail

ROOT=${0:A:h:h}
CMD=${1:-}
GATE_HOST=${GATE_HOST:-127.0.0.1}
GATE_PORT=${GATE_PORT:-4199}
GATE_PROVIDER=${GATE_PROVIDER:-muse}
GATE_MODEL=${GATE_MODEL:-muse-ember-1.0}
GATE_KEEP_TOKENS=${GATE_KEEP_TOKENS:-400}
GATE_BUFFER=${GATE_BUFFER:-90%}
GATE_BACKGROUND=${GATE_BACKGROUND:-}
GATE_CONTEXT_LIMIT=${GATE_CONTEXT_LIMIT:-}
GATE_READY_SECONDS=${GATE_READY_SECONDS:-60}
MUSE_CONFIG_SOURCE=${MUSE_CONFIG_SOURCE:-$HOME/.config/muse}

die() {
  print -u2 -- "native-history-server: $*"
  exit 1
}

resolve_dir() {
  local raw=$1
  if [[ $raw = /* ]]; then
    print -r -- "${raw:A}"
  else
    (cd "$ROOT" && print -r -- "${raw:A}")
  fi
}

server_json() {
  print -r -- "$DIR/server.json"
}

read_field() {
  jq -r --arg key "$1" '.[$key] // ""' "$(server_json)"
}

running_pid() {
  local pid=$1
  [[ $pid =~ '^[0-9]+$' ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  local command
  command=$(ps -p "$pid" -o command= 2>/dev/null || true)
  [[ $command == *opencode* ]] || return 1
  print -r -- "$pid"
}

api() {
  OPENCODE_PASSWORD=$PASSWORD opencode api --server "$URL" "$@"
}

ready() {
  api server.info >/dev/null 2>&1 || return 1
  api model.list 2>/dev/null |
    jq -e --arg provider "$GATE_PROVIDER" --arg model "$GATE_MODEL" \
      'any(.data[]; .providerID == $provider and .id == $model)' >/dev/null 2>&1
}

write_config() {
  local auto derived
  case $MODE in
    manual) auto=false; derived=false ;;
    auto) auto=true; derived=default ;;
    background) auto=true; derived=true ;;
    *) die "mode must be manual, auto, or background (got '$MODE')" ;;
  esac
  BACKGROUND=${GATE_BACKGROUND:-$derived}
  [[ $BACKGROUND == default || $BACKGROUND == true || $BACKGROUND == false ]] ||
    die "GATE_BACKGROUND must be default, true, or false (got '$BACKGROUND')"

  COMPACTION=$(jq -cn \
    --argjson auto "$auto" \
    --argjson keep "$GATE_KEEP_TOKENS" \
    --arg buffer "$GATE_BUFFER" \
    --arg background "$BACKGROUND" \
    '{auto: $auto, keep: {tokens: $keep}, buffer: $buffer}
     + (if $background == "default" then {}
        else {background: ($background == "true")} end)')

  local plugins
  if [[ -n $GATE_CONTEXT_LIMIT ]]; then
    plugins=$(jq -cn \
      --arg plugin "$ROOT" \
      --arg clamp "$ROOT/scratch/gate-model-limit" \
      '[$plugin, $clamp]')
  else
    plugins=$(jq -cn --arg plugin "$ROOT" '[$plugin]')
  fi

  jq -n \
    --arg model "$GATE_PROVIDER/$GATE_MODEL" \
    --argjson plugins "$plugins" \
    --argjson compaction "$COMPACTION" \
    --argjson permissions "${GATE_PERMISSIONS_JSON:-null}" \
    '{model: $model, plugins: $plugins, compaction: $compaction}
     + (if $permissions == null then {} else {permissions: $permissions} end)' \
    > "$DIR/config/opencode/opencode.jsonc"
}

start() {
  ARM=${1:-}
  MODE=${2:-}
  RAW_DIR=${3:-}
  [[ $ARM == old || $ARM == new ]] || die "arm must be old or new (got '${ARM:-}')"
  [[ -n $MODE ]] || die "mode is required"
  [[ -n $RAW_DIR ]] || die "state-dir is required"
  DIR=$(resolve_dir "$RAW_DIR")
  mkdir -p "$DIR/config/opencode" "$DIR/data" "$DIR/state"

  umask 077
  [[ -d $MUSE_CONFIG_SOURCE ]] ||
    die "no Muse config at $MUSE_CONFIG_SOURCE; log in with the Muse CLI first"
  ln -sfn "$MUSE_CONFIG_SOURCE" "$DIR/config/muse"

  write_config

  if [[ -n ${GATE_SERVER_PASSWORD:-} ]]; then
    PASSWORD=$GATE_SERVER_PASSWORD
  else
    PASSWORD=$(openssl rand -hex 24)
  fi
  URL="http://$GATE_HOST:$GATE_PORT"
  local native_flag=0
  if [[ $ARM == new ]]; then native_flag=1; fi

  if ss -ltn 2>/dev/null | grep -q ":$GATE_PORT "; then
    die "port $GATE_PORT is already in use; stop the other server or set GATE_PORT"
  fi

  {
    local started
    started=$(date -u +%FT%TZ)
    local -a clamp_env
    clamp_env=()
    if [[ -n $GATE_CONTEXT_LIMIT ]]; then
      clamp_env+=("MUSE_TEST_CONTEXT_LIMIT=$GATE_CONTEXT_LIMIT")
    fi
    # Containment diagnostics are opt-in and forwarded only when set, so a
    # normal gate run spends no probe turn.
    if [[ -n ${MUSE_PROBE_PROMPT:-} ]]; then
      clamp_env+=("MUSE_PROBE_PROMPT=$MUSE_PROBE_PROMPT")
    fi
    if [[ -n ${MUSE_DEBUG_CONTAINMENT:-} ]]; then
      clamp_env+=("MUSE_DEBUG_CONTAINMENT=$MUSE_DEBUG_CONTAINMENT")
    fi
    nohup env \
      XDG_CONFIG_HOME="$DIR/config" \
      XDG_DATA_HOME="$DIR/data" \
      XDG_STATE_HOME="$DIR/state" \
      MUSE_NATIVE_HISTORY="$native_flag" \
      OPENCODE_SERVER_PASSWORD="$PASSWORD" \
      "${clamp_env[@]}" \
      opencode serve --hostname "$GATE_HOST" --port "$GATE_PORT" \
      > "$DIR/server.log" 2>&1 &!
    local pid=$!

    local waited=0
    while (( waited < GATE_READY_SECONDS )); do
      if ! running_pid "$pid" >/dev/null; then
        die "server exited during startup; see $DIR/server.log"
      fi
      if ready; then
        jq -n \
          --argjson pid "$pid" \
          --arg url "$URL" \
          --arg password "$PASSWORD" \
          --arg config "$DIR/config/opencode/opencode.jsonc" \
          --arg stateDir "$DIR" \
          --arg arm "$ARM" \
          --arg mode "$MODE" \
          --argjson port "$GATE_PORT" \
          --arg startedAt "$started" \
          --arg nativeFlag "$native_flag" \
          --arg model "$GATE_PROVIDER/$GATE_MODEL" \
          --argjson compaction "$COMPACTION" \
          --arg background "$BACKGROUND" \
          --arg contextLimit "$GATE_CONTEXT_LIMIT" \
          '{pid: $pid, url: $url, password: $password, config: $config,
            stateDir: $stateDir, arm: $arm, mode: $mode, port: $port,
            startedAt: $startedAt, status: "running",
            nativeHistory: ($nativeFlag | tonumber), model: $model,
            compaction: $compaction, background: $background,
            contextLimit: (if $contextLimit == "" then null
                           else ($contextLimit | tonumber) end)}' \
          > "$DIR/server.json.tmp"
        mv "$DIR/server.json.tmp" "$DIR/server.json"
        chmod 600 "$DIR/server.json"
        print -r -- "started $ARM/$MODE at $URL (pid $pid, state $DIR)"
        print -r -- "MUSE_NATIVE_HISTORY=$native_flag; model $GATE_PROVIDER/$GATE_MODEL"
        return 0
      fi
      sleep 1
      waited=$((waited + 1))
    done

    kill -TERM "$pid" 2>/dev/null || true
    die "server was not ready with $GATE_PROVIDER/$GATE_MODEL in ${GATE_READY_SECONDS}s; see $DIR/server.log"
  }
}

stop() {
  RAW_DIR=${1:-}
  [[ -n $RAW_DIR ]] || die "state-dir is required"
  DIR=$(resolve_dir "$RAW_DIR")
  [[ -f $(server_json) ]] || die "no server.json in $DIR"
  local pid
  pid=$(read_field pid)
  if running_pid "$pid" >/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    local waited=0
    while kill -0 "$pid" 2>/dev/null && (( waited < 15 )); do
      sleep 1
      waited=$((waited + 1))
    done
    kill -KILL "$pid" 2>/dev/null || true
  fi
  local port
  port=$(read_field port)
  local waited_port=0
  while (( waited_port < 20 )) && ss -ltn 2>/dev/null | grep -q ":$port "; do
    sleep 1
    waited_port=$((waited_port + 1))
  done
  local stopped
  stopped=$(date -u +%FT%TZ)
  jq --arg stopped "$stopped" \
    'del(.password) | .status = "stopped" | .stoppedAt = $stopped' \
    "$(server_json)" > "$DIR/server.json.tmp"
  mv "$DIR/server.json.tmp" "$DIR/server.json"
  chmod 600 "$DIR/server.json"
  print -r -- "stopped pid $pid ($DIR)"
}

status() {
  RAW_DIR=${1:-}
  [[ -n $RAW_DIR ]] || die "state-dir is required"
  DIR=$(resolve_dir "$RAW_DIR")
  [[ -f $(server_json) ]] || die "no server.json in $DIR"
  local pid arm mode url
  pid=$(read_field pid)
  arm=$(read_field arm)
  mode=$(read_field mode)
  url=$(read_field url)
  if running_pid "$pid" >/dev/null; then
    print -r -- "running: $arm/$mode $url (pid $pid)"
    return 0
  fi
  print -r -- "stopped: $arm/$mode $url (pid $pid)"
  return 1
}

case $CMD in
  start) shift; start "$@" ;;
  stop) shift; stop "$@" ;;
  status) shift; status "$@" ;;
  *)
    print -u2 -- "usage: ${0:t} start <old|new> <manual|auto|background> <state-dir>"
    print -u2 -- "       ${0:t} stop <state-dir>"
    print -u2 -- "       ${0:t} status <state-dir>"
    exit 2
    ;;
esac
