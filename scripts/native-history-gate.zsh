#!/usr/bin/env zsh
# One native-history recall gate against a running opencode server.
#
# Usage:
#   SRV=http://127.0.0.1:4199 OPENCODE_PASSWORD=... \
#     scripts/native-history-gate.zsh <old|new> <manual|auto> <index>
#
# Start the server with scripts/native-history-server.zsh: it isolates the
# config/data/state roots, links the Muse login, and sets MUSE_NATIVE_HISTORY.
# This script creates the session with an explicit Muse model and aborts if any
# turn runs elsewhere.
#
# result.json records the mechanism, not just the answer: the compaction trigger
# and status, whether the digest leaks the vault code, the native window size,
# the native session ids, seed reasons, reseed and missing-window rows, the
# model at every turn, and the code/prereg hashes. A missing artifact is
# `invalid`, not a pass.
#
# This script deliberately uses a user message rather than a tool result: a
# long user block is enough to distinguish the digest from native history, and
# it needs no tool permission. A tool-result variant is a separate run.
#
# GATE_PAD_TURNS and GATE_PAD_CHARS append that many filler turns of that many
# characters after T6, before the compaction step. They are how the W1 runs push
# a session past an automatic threshold or past a production keep window; both
# values, the total padding, the effective compaction config (from
# GATE_SERVER_JSON when the runner supplies it), and a retained-window estimate
# land in result.json.
set -eu
setopt pipefail

ARM=${1:?arm: old or new}
MODE=${2:?mode: manual or auto}
IDX=${3:?index}
SRV=${SRV:-http://127.0.0.1:4199}
GATE_PROVIDER=${GATE_PROVIDER:-muse}
GATE_MODEL=${GATE_MODEL:-muse-ember-1.0}
GATE_PAD_TURNS=${GATE_PAD_TURNS:-0}
GATE_PAD_CHARS=${GATE_PAD_CHARS:-0}
GATE_SERVER_JSON=${GATE_SERVER_JSON:-}
ROOT=${0:A:h:h}
RUN_TAG=${GATE_RUN_TAG:-}
OUT="$ROOT/scratch/native-gate/${RUN_TAG:+$RUN_TAG-}$ARM-$MODE-$IDX"
mkdir -p "$OUT"
RESULT_FILE="$OUT/result.json"
RESULT_WRITTEN=0
MODEL_MISMATCH=""
SID=""
START=""

if [[ -z ${OPENCODE_PASSWORD:-} ]]; then
  echo "OPENCODE_PASSWORD is not set" >&2
  exit 2
fi

api() { opencode api --server "$SRV" "$@"; }
json_answer() {
  jq -r '[.data.messages[] | select(.type=="assistant")] | last | .content // []
    | map(select(.type=="text") | .text) | join("")' "$1"
}
sha_file() { sha256sum "$1" 2>/dev/null | awk '{print $1}' || print -r -- unknown; }

NEEDLE="VAULT-$ARM-$MODE-$IDX-7391"
CONTROL="CONTROL-$ARM-$MODE-$IDX-2846"
FILLER=$(printf 'x%.0s' {1..700})
TAIL=$(printf 'y%.0s' {1..300})

# The needle is after the digest's 512-character per-entry clip. The early
# block is also outside the small keep window used by the gate config.
T1="Reference block: ${FILLER} The vault code is ${NEEDLE}. ${TAIL} Reply with OK only."
T2="Filler note A: the migration has a rollback drill and a backfill. Reply with noted."
T3="Filler note B: the smaller option fits one release. Reply with noted."
T4="Filler note C: the acceptance check is a dry run. Reply with noted."
T5="Filler note D: the main risk is a partial backfill. Reply with noted."
T6="Latest control note: the control word is ${CONTROL}. Reply with noted."

pad_turns=$(( ${GATE_PAD_TURNS:-0} ))
pad_chars=$(( ${GATE_PAD_CHARS:-0} ))

# The effective config is read from the running server's own record rather than
# inferred from the gate's environment: mode can change the defaults.
COMPACTION_CONFIG='{}'
BACKGROUND=''
CONTEXT_LIMIT='null'
if [[ -n $GATE_SERVER_JSON && -f $GATE_SERVER_JSON ]]; then
  COMPACTION_CONFIG=$(jq -c '.compaction // {}' "$GATE_SERVER_JSON" 2>/dev/null || print -r -- '{}')
  BACKGROUND=$(jq -r '.background // ""' "$GATE_SERVER_JSON" 2>/dev/null || print -r -- '')
  CONTEXT_LIMIT=$(jq -c '.contextLimit // null' "$GATE_SERVER_JSON" 2>/dev/null || print -r -- 'null')
fi

OPENCODE_VERSION=$(opencode --version 2>/dev/null | head -1 || print -r -- unknown)
PLUGIN_VERSION=$(jq -r '.version // "unknown"' "$ROOT/package.json" 2>/dev/null || print -r -- unknown)
SDK_VERSION=$(jq -r '.dependencies["@muse-code/sdk"] // "unknown"' "$ROOT/package.json" 2>/dev/null || print -r -- unknown)
GIT_HEAD=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || print -r -- unknown)
if git -C "$ROOT" diff --quiet 2>/dev/null && git -C "$ROOT" diff --cached --quiet 2>/dev/null; then
  TRACKED_DIFF="clean"
else
  TRACKED_DIFF=$(git -C "$ROOT" diff --binary 2>/dev/null | sha256sum | awk '{print $1}')
fi
UNTRACKED_SHA=$(cd "$ROOT" && git ls-files --others --exclude-standard -z -- src test 2>/dev/null |
  xargs -0 -r sha256sum 2>/dev/null | sort | sha256sum | awk '{print $1}')
SCRIPT_SHA=$(sha_file "${0:A}")
PREREG_SHA=$(sha_file "$ROOT/bench/prereg/native-history.md")
LEDGER=${LEDGER:-"${XDG_STATE_HOME:-$HOME/.local/state}/opencode-muse/usage-$(date -u +%F).jsonl"}

ledger_rows() {
  if [[ -f $LEDGER ]]; then
    jq -s --arg sid "$SID" '[.[] | select(.sessionID==$sid)]' "$LEDGER" 2>/dev/null || print -r -- '[]'
  else
    print -r -- '[]'
  fi
}

finalize() {
  local verdict=$1 detail=$2
  if (( RESULT_WRITTEN )); then return 0; fi

  local export_file="$OUT/post-compact.export.json"
  local compaction='{}' compaction_count=0
  if [[ -f $export_file ]]; then
    compaction=$(jq -c '[.data.messages[]? | select(.type=="compaction")] | last // {}' "$export_file" 2>/dev/null || print -r -- '{}')
    compaction_count=$(jq '[.data.messages[]? | select(.type=="compaction")] | length' "$export_file" 2>/dev/null || print -r -- 0)
  fi

  local trigger c_status c_provider c_model summary digest digest_needle=false digest_control=false native_window=0
  local keep_tokens compact_turns=0 post_input
  trigger=$(print -r -- "$compaction" | jq -r '.reason // ""' 2>/dev/null || print -r -- "")
  c_status=$(print -r -- "$compaction" | jq -r '.status // ""' 2>/dev/null || print -r -- "")
  c_provider=$(print -r -- "$compaction" | jq -r '.model.providerID // ""' 2>/dev/null || print -r -- "")
  c_model=$(print -r -- "$compaction" | jq -r '.model.id // ""' 2>/dev/null || print -r -- "")
  summary=$(print -r -- "$compaction" | jq -r '.summary // ""' 2>/dev/null || print -r -- "")
  digest=$(print -r -- "$compaction" | jq -r '.metadata.digest // ""' 2>/dev/null || print -r -- "")
  native_window=$(print -r -- "$compaction" | jq -r '.native.messages | length' 2>/dev/null || print -r -- 0)
  if [[ $summary == *"$NEEDLE"* || $digest == *"$NEEDLE"* ]]; then digest_needle=true; fi
  if [[ $summary == *"$CONTROL"* || $digest == *"$CONTROL"* ]]; then digest_control=true; fi

  keep_tokens=$(print -r -- "$COMPACTION_CONFIG" | jq -r '.keep.tokens // ""' 2>/dev/null || print -r -- "")

  local rows='[]' turns='[]' history_rows='[]'
  if [[ -n $SID ]]; then
    rows=$(ledger_rows)
    turns=$(print -r -- "$rows" | jq -c '[.[] | select(.step != null and .seed != null)]' 2>/dev/null || print -r -- '[]')
    history_rows=$(print -r -- "$rows" | jq -c '[.[] | select(.type == "history")]' 2>/dev/null || print -r -- '[]')
    compact_turns=$(print -r -- "$rows" | jq '[.[] | select(.kind == "compaction")] | length' 2>/dev/null || print -r -- 0)
  fi

  local native_rows missing_rows reseed_rows native_ids native_stable post_seed post_seed_reason
  local turns_recorded model_stable seed_reasons reseed_reasons
  local last_compaction_ts reseed_after
  native_rows=$(print -r -- "$history_rows" | jq '[.[] | select(.event=="compaction" and .native==true)] | length')
  missing_rows=$(print -r -- "$history_rows" | jq '[.[] | select(.reason=="native_history_missing")] | length')
  reseed_rows=$(print -r -- "$turns" | jq '[.[] | select(.seed=="full")] | length')
  native_ids=$(print -r -- "$turns" | jq -c '[.[] | .nativeSessionId // empty] | unique')
  native_stable=$(print -r -- "$native_ids" | jq 'length == 1')
  post_seed=$(print -r -- "$turns" | jq -r 'last | .seed // ""')
  post_seed_reason=$(print -r -- "$turns" | jq -r 'last | .seedReason // ""')
  turns_recorded=$(print -r -- "$turns" | jq 'length')
  model_stable=$(print -r -- "$turns" |
    jq --arg model "$GATE_MODEL" 'all(.[]; .model == $model)')
  seed_reasons=$(print -r -- "$turns" |
    jq -c 'map(.seedReason // "unknown") | group_by(.) | map({key: .[0], value: length}) | from_entries')
  reseed_reasons=$(print -r -- "$turns" |
    jq -c '[.[] | select(.seed=="full") | (.seedReason // "unknown")] | group_by(.) | map({key: .[0], value: length}) | from_entries')

  # An automatic compaction fires during a turn, so the turn that triggers it is
  # already the post-compaction turn: a full reseed lands there, not on the
  # final answer turn the manual gate could count on.
  last_compaction_ts=$(print -r -- "$history_rows" |
    jq -r '[.[] | select(.event=="compaction")] | last | .ts // ""' 2>/dev/null || print -r -- "")
  reseed_after=$(print -r -- "$rows" |
    jq --arg ts "$last_compaction_ts" \
      '[.[] | select(.step != null and .seed == "full" and .ts > $ts)] | length' 2>/dev/null || print -r -- 0)
  # Measured, not estimated: the request size the model actually saw on the
  # first turn after compaction. The export orders compaction items last, so a
  # char count of "messages after the item" is not a retained-window measure.
  post_input=$(print -r -- "$rows" |
    jq --arg ts "$last_compaction_ts" \
      '[.[] | select(.step != null and .ts > $ts)] | first | .input // null' 2>/dev/null || print -r -- null)

  local turn_records
  turn_records=$(print -r -- "$turns" |
    jq -c 'to_entries | map({turn: (.key + 1)} + (.value | {step, model, seed, seedReason, nativeSessionId}))')

  local compaction_observed=false
  if (( compaction_count > 0 )); then compaction_observed=true; fi

  local answer needle_seen=false control_seen=false
  answer=$(json_answer "$OUT/turn8.export.json" 2>/dev/null || print -r -- "")
  if [[ $answer == *"$NEEDLE"* ]]; then needle_seen=true; fi
  if [[ $answer == *"$CONTROL"* ]]; then control_seen=true; fi

  local -a failures
  if [[ $verdict == pass || $verdict == fail ]]; then
    (( turns_recorded > 0 )) || failures+=(no_turns)
    [[ $model_stable == true ]] || failures+=(model_unstable)
    [[ $compaction_observed == true ]] || failures+=(no_compaction_item)
    if [[ $compaction_observed == true ]]; then
      [[ $c_provider == "$GATE_PROVIDER" && $c_model == "$GATE_MODEL" ]] || failures+=(compaction_model)
    fi
    [[ $c_status == completed ]] || failures+=(compaction_status)
    [[ $digest_needle == false ]] || failures+=(digest_leaks_vault)
    (( missing_rows == 0 )) || failures+=(native_history_missing)
    if [[ $ARM == new ]]; then
      [[ $needle_seen == true ]] || failures+=(vault_missing)
      [[ $control_seen == true ]] || failures+=(control_missing)
      (( native_rows >= 1 )) || failures+=(no_native_row)
      (( reseed_rows == 0 )) || failures+=(full_reseed)
      [[ $native_stable == true ]] || failures+=(native_id_changed)
      (( native_window >= 1 )) || failures+=(empty_native_window)
      [[ $post_seed == delta ]] || failures+=(post_compaction_seed)
    else
      [[ $needle_seen == false ]] || failures+=(vault_inside_window)
      [[ $control_seen == true ]] || failures+=(control_missing)
      (( native_rows == 0 )) || failures+=(unexpected_native_row)
      (( reseed_rows >= 1 )) || failures+=(no_reseed)
      if [[ $MODE == manual ]]; then
        [[ $post_seed == full ]] || failures+=(post_compaction_seed)
      else
        (( reseed_after >= 1 )) || failures+=(no_reseed_after_compaction)
      fi
    fi
    if (( ${#failures} > 0 )); then
      verdict=fail
      detail=${(j:,:)failures}
    elif [[ $verdict == fail ]]; then
      verdict=fail
      detail=ok
    else
      verdict=pass
      detail=ok
    fi
  fi

  jq -n \
    --arg arm "$ARM" --arg mode "$MODE" --argjson idx "$IDX" \
    --arg sid "$SID" --arg start "$START" --arg end "$(date -u +%FT%TZ)" \
    --arg needle "$NEEDLE" --arg control "$CONTROL" --arg answer "$answer" \
    --argjson needleSeen "$needle_seen" --argjson controlSeen "$control_seen" \
    --argjson nativeRows "$native_rows" --argjson missingRows "$missing_rows" \
    --argjson reseedRows "$reseed_rows" --argjson turnsRecorded "$turns_recorded" \
    --argjson reseedAfterCompaction "$reseed_after" \
    --arg lastCompactionAt "$last_compaction_ts" \
    --argjson seedReasons "$seed_reasons" --argjson reseedReasons "$reseed_reasons" \
    --arg postCompactionSeed "$post_seed" --arg postCompactionSeedReason "$post_seed_reason" \
    --argjson nativeIds "$native_ids" --argjson nativeIdStable "$native_stable" \
    --argjson modelStable "$model_stable" \
    --argjson compactionObserved "$compaction_observed" \
    --argjson compactionCount "$compaction_count" \
    --arg compactionTrigger "$trigger" --arg compactionStatus "$c_status" \
    --arg compactionProvider "$c_provider" --arg compactionModel "$c_model" \
    --argjson digestNeedlePresent "$digest_needle" \
    --argjson digestControlPresent "$digest_control" \
    --argjson nativeWindowMessages "$native_window" \
    --argjson turns "$turn_records" \
    --argjson padTurns "$pad_turns" --argjson padChars "$pad_chars" \
    --argjson padTotalChars "$(( pad_turns * pad_chars ))" \
    --argjson postCompactionInputTokens "${post_input:-null}" \
    --argjson keepTokens "${keep_tokens:-null}" \
    --argjson compactionConfig "$COMPACTION_CONFIG" \
    --arg background "$BACKGROUND" \
    --argjson contextLimit "$CONTEXT_LIMIT" \
    --argjson compactionTurns "$compact_turns" \
    --arg verdict "$verdict" --arg detail "$detail" \
    --arg provider "$GATE_PROVIDER" --arg model "$GATE_MODEL" \
    --arg opencode "$OPENCODE_VERSION" --arg plugin "$PLUGIN_VERSION" \
    --arg sdk "$SDK_VERSION" \
    --arg gitHead "$GIT_HEAD" --arg trackedDiff "$TRACKED_DIFF" \
    --arg untracked "$UNTRACKED_SHA" --arg scriptSha "$SCRIPT_SHA" \
    --arg preregSha "$PREREG_SHA" --arg srv "$SRV" \
    '{arm:$arm, mode:$mode, index:$idx, sessionID:$sid,
      start:$start, end:$end, server:$srv,
      model:{providerID:$provider, id:$model},
      host:{opencode:$opencode, plugin:$plugin, sdk:$sdk},
      hashes:{gitHead:$gitHead, trackedDiff:$trackedDiff,
              untrackedSource:$untracked, gateScript:$scriptSha,
              prereg:$preregSha},
      needle:$needle, control:$control, answer:$answer,
      needleSeen:$needleSeen, controlSeen:$controlSeen,
      compactionObserved:$compactionObserved,
      compactionTrigger:$compactionTrigger,
      compactionStatus:$compactionStatus,
      compactionCount:$compactionCount,
      compactionModel:{providerID:$compactionProvider, id:$compactionModel},
      digestNeedlePresent:$digestNeedlePresent,
      digestControlPresent:$digestControlPresent,
      nativeWindowMessages:$nativeWindowMessages,
      nativeCompactionRows:$nativeRows,
      nativeMissingRows:$missingRows,
      nativeIds:$nativeIds,
      nativeIdStable:$nativeIdStable,
      reseedRows:$reseedRows,
      reseedAfterCompaction:$reseedAfterCompaction,
      lastCompactionAt:$lastCompactionAt,
      reseedReasons:$reseedReasons,
      seedReasons:$seedReasons,
      postCompactionSeed:$postCompactionSeed,
      postCompactionSeedReason:$postCompactionSeedReason,
      turnsRecorded:$turnsRecorded,
      turns:$turns,
      padTurns:$padTurns, padChars:$padChars, padTotalChars:$padTotalChars,
      postCompactionInputTokens:$postCompactionInputTokens,
      keepTokens:$keepTokens, compactionConfig:$compactionConfig,
      background:$background, contextLimit:$contextLimit,
      compactionTurns:$compactionTurns,
      modelStable:$modelStable,
      verdict:$verdict, detail:$detail}' \
    | tee "$RESULT_FILE" >> "$ROOT/scratch/native-gate/manifest.jsonl"
  RESULT_WRITTEN=1
  print -r -- "verdict $verdict ($detail)"
}

abort_result() {
  if (( RESULT_WRITTEN )); then return 0; fi
  finalize invalid "aborted"
}
trap abort_result EXIT

START=$(date -u +%FT%TZ)
SID=$(api -d "$(jq -nc --arg t "native-gate-$ARM-$MODE-$IDX" \
  --arg provider "$GATE_PROVIDER" --arg model "$GATE_MODEL" \
  '{title:$t,model:{providerID:$provider,id:$model}}')" session.create \
  | jq -r '.data.id')
[[ -n $SID && $SID != null ]] || { echo "no session id" >&2; exit 1; }
echo "$SID" > "$OUT/sid"

run_turn() {
  local label=$1 text=$2
  local body provider model
  body=$(jq -nc --arg t "$text" '{text:$t}')
  api --param "sessionID=$SID" -d "$body" session.prompt > "$OUT/$label.prompt.json"
  api --param "sessionID=$SID" experimental.session.wait > "$OUT/$label.wait.json"
  api --param "sessionID=$SID" experimental.session.export > "$OUT/$label.export.json"
  if ! jq -e '.data.messages' "$OUT/$label.export.json" >/dev/null 2>&1; then
    finalize invalid "missing_export_$label"
    exit 3
  fi
  provider=$(jq -r '[.data.messages[] | select(.type=="assistant")] | last | .model.providerID // ""' "$OUT/$label.export.json")
  model=$(jq -r '[.data.messages[] | select(.type=="assistant")] | last | .model.id // ""' "$OUT/$label.export.json")
  if [[ $provider != "$GATE_PROVIDER" || $model != "$GATE_MODEL" ]]; then
    MODEL_MISMATCH="$label used ${provider:-unknown}/${model:-unknown}"
    echo "$MODEL_MISMATCH, wanted $GATE_PROVIDER/$GATE_MODEL" >&2
    finalize invalid "model_mismatch"
    exit 1
  fi
}

for pair in "1:$T1" "2:$T2" "3:$T3" "4:$T4" "5:$T5" "6:$T6"; do
  run_turn "turn${pair%%:*}" "${pair#*:}"
done

# Padding goes after T6 and before the compaction step, so the threshold (auto)
# or the retained window (manual keep) is crossed while the reference block is
# far behind. Pad turns carry their own file prefix; the turn 7/8 numbering that
# finalize() reads stays fixed.
if (( pad_turns > 0 )); then
  [[ $pad_chars -gt 0 ]] || { echo "GATE_PAD_CHARS must be > 0 when GATE_PAD_TURNS > 0" >&2; exit 2; }
  # Words, not one repeated character: a single-character run tokenizes at a
  # very different ratio than chars/4, so the host's size estimate and the
  # model's reported input diverge and the run compacts more than once.
  pad_phrase="staging rollback backfill migration window checkpoint release drill partial accept dry run. "
  fill=""
  while (( ${#fill} < pad_chars )); do fill+=$pad_phrase; done
  fill=${fill[1,$pad_chars]}
  for (( i = 1; i <= pad_turns; i++ )); do
    run_turn "pad$i" "Padding note $i of $pad_turns: $fill Reply with noted."
  done
  # Padding pushes the T6 control note out of the retained window. The control
  # is a liveness check (the session still answers after compaction), not a
  # memory claim, so it is restated inside the window after the padding; the
  # vault code stays behind and is the only recall claim.
  run_turn control "Latest control note: the control word is ${CONTROL}. Reply with noted."
fi

if [[ $MODE == manual ]]; then
  api --param "sessionID=$SID" -d '{}' session.compact > "$OUT/compact.json"
  api --param "sessionID=$SID" experimental.session.wait > "$OUT/compact.wait.json"
else
  # The server must compact automatically at its configured threshold. Give it
  # one more turn and let the export show whether a compaction item exists.
  run_turn turn7 "Trigger the configured automatic compaction threshold. Reply with noted."
fi

api --param "sessionID=$SID" experimental.session.export > "$OUT/post-compact.export.json"

FINAL="Answer in two lines. Line 1: the exact vault code from the first reference block. Line 2: the exact control word from the latest control note. Do not use tools."
run_turn turn8 "$FINAL"

finalize pass ""

echo "$OUT"
case $(jq -r '.verdict' "$RESULT_FILE") in
  pass) exit 0 ;;
  fail) exit 1 ;;
  *) exit 3 ;;
esac
