#!/usr/bin/env zsh
# Aggregate native-history gate results into an arm table and a verdict.
#
# Usage:
#   scripts/native-history-analyze.zsh [--json] <result.json | directory>...
#   scripts/native-history-analyze.zsh --w1 <result.json | directory>...
#   scripts/native-history-analyze.zsh --n 29 <result.json | directory>...
#
# --w1 evaluates the W1 rules instead of Gate A: automatic-compaction groups
# need three valid sessions per arm (the trigger fires during a turn, so the
# old arm's reseed is counted after the compaction, not on the last turn), and
# a manual group with a production keep window needs one per arm.
#
# Gate A (both arms present): five valid old and five valid new results, all
# meeting their arm's rule. Gate B (new arm only): --n is required, every
# session must be valid, and zero failures over exactly n reports the exact
# one-sided 95% upper bound. A short or invalid set is INCOMPLETE, not a rate.
#
# Exit codes: 0 pass, 1 contradiction/failure, 2 incomplete, 3 invalid set.
set -eu
setopt pipefail

ROOT=${0:A:h:h}
JSON=0
W1=0
N=""
FILES=()

while (( $# )); do
  case $1 in
    --json) JSON=1; shift ;;
    --w1) W1=1; shift ;;
    --n)
      [[ $# -ge 2 ]] || { print -u2 -- "--n needs a value"; exit 3 }
      N=$2
      shift 2
      ;;
    --n=*) N=${1#--n=}; shift ;;
    --help|-h)
      print -r -- "usage: ${0:t} [--json] [--n N] <result.json | directory>..."
      exit 0
      ;;
    -*) print -u2 -- "unknown option $1"; exit 3 ;;
    *) FILES+=("$1"); shift ;;
  esac
done

[[ ${#FILES} -gt 0 ]] || { print -u2 -- "no result files"; exit 3; }

INPUTS=()
for target in "${FILES[@]}"; do
  if [[ -d $target ]]; then
    while IFS= read -r file; do INPUTS+=("$file"); done < <(
      find "$target" -maxdepth 3 -name '*.json' -type f | sort
    )
  elif [[ -f $target ]]; then
    INPUTS+=("$target")
  else
    print -u2 -- "not a file or directory: $target"
    exit 3
  fi
done
[[ ${#INPUTS} -gt 0 ]] || { print -u2 -- "no result json found"; exit 3; }

if (( W1 )); then
  W1_SUMMARY=$(jq -s '
    def valid:
      (.arm == "new" or .arm == "old")
      and (.compactionObserved == true)
      and (.compactionStatus == "completed")
      and (.digestNeedlePresent != true)
      and (.modelStable == true)
      and ((.compactionTrigger // "") != "");
    def auto_new:
      valid
      and .compactionTrigger == "auto"
      and (.compactionCount // 0) == 1
      and (.nativeCompactionRows // 0) >= 1
      and (.nativeMissingRows // 0) == 0
      and .nativeIdStable == true
      and (.nativeWindowMessages // 0) >= 1
      and .needleSeen == true
      and .controlSeen == true
      and (.reseedRows // 0) == 0
      and .postCompactionSeed == "delta";
    def auto_old:
      valid
      and .compactionTrigger == "auto"
      and (.nativeCompactionRows // 0) == 0
      and (.nativeMissingRows // 0) == 0
      and .needleSeen == false
      and .controlSeen == true
      and (.reseedAfterCompaction // 0) >= 1;
    def manual_new:
      valid
      and .compactionTrigger == "manual"
      and (.keepTokens // 0) >= 15000
      and (.nativeCompactionRows // 0) >= 1
      and (.nativeMissingRows // 0) == 0
      and .needleSeen == true
      and .controlSeen == true
      and (.reseedRows // 0) == 0
      and .postCompactionSeed == "delta";
    def manual_old:
      valid
      and .compactionTrigger == "manual"
      and (.keepTokens // 0) >= 15000
      and (.nativeCompactionRows // 0) == 0
      and (.nativeMissingRows // 0) == 0
      and .needleSeen == false
      and .controlSeen == true
      and (.reseedRows // 0) >= 1
      and .postCompactionSeed == "full";
    def classify:
      if (valid | not) then "invalid"
      elif .mode == "auto" then
        (if .arm == "new" then (if auto_new then "pass" else "fail" end)
         else (if auto_old then "pass" else "fail" end) end)
      else
        (if .arm == "new" then (if manual_new then "pass" else "fail" end)
         else (if manual_old then "pass" else "fail" end) end)
      end;
    map(select(.arm == "new" or .arm == "old") | . + {
      groupKey: ((.mode // "?") + " keep=" + ((.keepTokens // 0) | tostring)
                 + " bg=" + (.background // "?")
                 + " ctx=" + ((.contextLimit // 0) | tostring)),
      computed: classify,
      why: ([ (if .compactionTrigger == "" then "no_trigger" else empty end),
              (if .mode == "auto" and (.compactionCount // 0) != 1 then "compaction_count" else empty end),
              (if .arm == "new" and .needleSeen != true then "vault_miss" else empty end),
              (if .arm == "old" and .needleSeen == true then "vault_inside" else empty end),
              (if .controlSeen != true then "control_miss" else empty end),
              (if .arm == "new" and (.nativeCompactionRows // 0) < 1 then "no_native_row" else empty end),
              (if .arm == "old" and (.nativeCompactionRows // 0) != 0 then "native_row" else empty end),
              (if .arm == "new" and (.reseedRows // 0) != 0 then "full_reseed" else empty end),
              (if .arm == "new" and .postCompactionSeed != "delta" then "post_seed" else empty end),
              (if .arm == "old" and .mode == "auto" and (.reseedAfterCompaction // 0) < 1 then "no_reseed_after" else empty end),
              (if .arm == "old" and .mode == "manual" and .postCompactionSeed != "full" then "post_seed" else empty end) ]
            | join(","))
    })
    | group_by(.groupKey)
    | map({group: .[0].groupKey,
           mode: .[0].mode,
           required: (if .[0].mode == "auto" then 3 else 1 end),
           new: {valid: (map(select(.arm == "new" and .computed != "invalid")) | length),
                 pass: (map(select(.arm == "new" and .computed == "pass")) | length),
                 fail: (map(select(.arm == "new" and .computed == "fail")) | length),
                 invalid: (map(select(.arm == "new" and .computed == "invalid")) | length)},
           old: {valid: (map(select(.arm == "old" and .computed != "invalid")) | length),
                 pass: (map(select(.arm == "old" and .computed == "pass")) | length),
                 fail: (map(select(.arm == "old" and .computed == "fail")) | length),
                 invalid: (map(select(.arm == "old" and .computed == "invalid")) | length)},
           rows: map({arm, index, sessionID, computed, why})})
  ' "${INPUTS[@]}")

  w1_field() { print -r -- "$W1_SUMMARY" | jq -r "$1"; }

  if (( JSON )); then
    print -r -- "$W1_SUMMARY"
  else
    print -r -- "group  mode  required  new(valid/pass)  old(valid/pass)"
    print -r -- "$W1_SUMMARY" | jq -r '.[] |
      "\(.group)  \(.mode)  \(.required)  \(.new.valid)/\(.new.pass)  \(.old.valid)/\(.old.pass)"'
    print -r -- ""
    print -r -- "non-passing results:"
    print -r -- "$W1_SUMMARY" | jq -r '.[] | .rows[] | select(.computed != "pass") |
      "  \(.arm) \(.index) \(.sessionID): \(.computed) [\(.why)]"'
  fi

  w1_invalid=$(w1_field '[.[] | .new.invalid + .old.invalid] | add // 0')
  w1_fail=$(w1_field '[.[] | .new.fail + .old.fail] | add // 0')
  w1_short=$(w1_field '[.[] | select(.new.valid < .required or .old.valid < .required)] | length')

  if (( w1_invalid > 0 )); then
    w1_verdict="INVALID SET"; w1_code=3
    w1_message="$w1_invalid invalid sessions; replace them before counting W1"
  elif (( w1_fail > 0 )); then
    w1_verdict="FAIL"; w1_code=1
    w1_message="$w1_fail valid sessions failed their arm's W1 rule"
  elif (( w1_short > 0 )); then
    w1_verdict="INCOMPLETE"; w1_code=2
    w1_message="$w1_short group(s) short of the required sessions"
  else
    w1_verdict="PASS"; w1_code=0
    w1_message="every W1 group complete and passing"
  fi
  (( JSON )) || print -r -- "RESULT: $w1_verdict - $w1_message"
  exit "$w1_code"
fi

SUMMARY=$(jq -s '
  def valid:
    (.arm == "new" or .arm == "old")
    and (.compactionObserved == true)
    and (.compactionStatus == "completed")
    and (.digestNeedlePresent == false)
    and (.modelStable == true);
  def new_pass:
    valid
    and (.needleSeen == true)
    and (.controlSeen == true)
    and (.nativeCompactionRows >= 1)
    and (.nativeMissingRows == 0)
    and (.reseedRows == 0)
    and (.nativeIdStable == true)
    and (.nativeWindowMessages >= 1)
    and (.postCompactionSeed == "delta");
  def old_pass:
    valid
    and (.needleSeen == false)
    and (.controlSeen == true)
    and (.nativeCompactionRows == 0)
    and (.nativeMissingRows == 0)
    and (.reseedRows >= 1)
    and (.postCompactionSeed == "full");
  def new_causes:
    [ (if .needleSeen != true then "vault_miss" else empty end),
      (if .controlSeen != true then "control_miss" else empty end),
      (if (.nativeCompactionRows // 0) < 1 then "no_native_row" else empty end),
      (if (.nativeMissingRows // 0) != 0 then "missing_row" else empty end),
      (if .reseedRows != 0 then "full_reseed" else empty end),
      (if .nativeIdStable != true then "native_id" else empty end),
      (if (.nativeWindowMessages // 0) < 1 then "empty_window" else empty end),
      (if .postCompactionSeed != "delta" then "post_seed" else empty end) ];
  def old_causes:
    [ (if .needleSeen == true then "vault_hit" else empty end),
      (if .controlSeen != true then "control_miss" else empty end),
      (if (.nativeCompactionRows // 0) != 0 then "native_row" else empty end),
      (if (.nativeMissingRows // 0) != 0 then "missing_row" else empty end),
      (if (.reseedRows // 0) < 1 then "no_reseed" else empty end),
      (if .postCompactionSeed != "full" then "post_seed" else empty end) ];
  def classify:
    if (valid | not) then "invalid"
    elif .arm == "new" then (if new_pass then "pass" else "fail" end)
    else (if old_pass then "pass" else "fail" end)
    end;
  map(select(.arm == "new" or .arm == "old") | . + {
    computed: classify,
    cause: (if classify == "pass" then ""
            else ((if .arm == "new" then new_causes else old_causes end) | join(",")) end),
    modelId: ((.model.providerID // "?") + "/" + (.model.id // "?")),
    hostId: (.host.opencode // "?")
  })
  | {
      models: (map(.modelId) | unique),
      hosts: (map(.hostId) | unique),
      modes: (map(.mode // "?") | unique),
      triggers: (map(.compactionTrigger // "?") | unique),
      rows: map({arm, index, sessionID, computed, cause,
                 recorded: (.verdict // "?")}),
      counts: {
        new: {
          total: (map(select(.arm == "new")) | length),
          valid: (map(select(.arm == "new" and .computed != "invalid")) | length),
          pass: (map(select(.arm == "new" and .computed == "pass")) | length),
          fail: (map(select(.arm == "new" and .computed == "fail")) | length),
          invalid: (map(select(.arm == "new" and .computed == "invalid")) | length)
        },
        old: {
          total: (map(select(.arm == "old")) | length),
          valid: (map(select(.arm == "old" and .computed != "invalid")) | length),
          pass: (map(select(.arm == "old" and .computed == "pass")) | length),
          fail: (map(select(.arm == "old" and .computed == "fail")) | length),
          invalid: (map(select(.arm == "old" and .computed == "invalid")) | length)
        }
      }
    }
' "${INPUTS[@]}")

field() { print -r -- "$SUMMARY" | jq -r "$1"; }
count_of() { print -r -- "$SUMMARY" | jq -r ".counts.$1.$2"; }

print_table() {
  print -r -- "arm  total  valid  pass  fail  invalid"
  for arm in old new; do
    printf '%-4s %6s %6s %5s %5s %8s\n' "$arm" \
      "$(count_of "$arm" total)" "$(count_of "$arm" valid)" \
      "$(count_of "$arm" pass)" "$(count_of "$arm" fail)" \
      "$(count_of "$arm" invalid)"
  done
  print -r -- ""
  print -r -- "non-passing results:"
  print -r -- "$SUMMARY" | jq -r '.rows[]
    | select(.computed != "pass")
    | "  \(.arm) \(.index) \(.sessionID): \(.computed) [\(.cause)] (recorded \(.recorded))"'
}

report() {
  local result=$1 message=$2 code=$3
  if (( JSON )); then
    jq -cn --argjson summary "$SUMMARY" --arg result "$result" \
      --arg message "$message" \
      '{result: $result, message: $message, summary: $summary}'
  else
    print_table
    print -r -- "RESULT: $result - $message"
  fi
  exit "$code"
}

fail_set() { report "INVALID SET" "$1" 3; }
fail_run() { report "FAIL" "$1" 1; }
incomplete() { report "INCOMPLETE" "$1" 2; }

# Mixed artifacts cannot be pooled: the gate would be measuring different hosts,
# models, or triggers in one arm.
for key in models hosts modes triggers; do
  values=$(field ".$key | length")
  if [[ $values -gt 1 ]]; then
    fail_set "mixed $key: $(field ".$key | join(\", \")")"
  fi
done

NEW_TOTAL=$(count_of new total)
NEW_VALID=$(count_of new valid)
NEW_PASS=$(count_of new pass)
NEW_FAIL=$(count_of new fail)
NEW_INVALID=$(count_of new invalid)
OLD_TOTAL=$(count_of old total)
OLD_VALID=$(count_of old valid)
OLD_PASS=$(count_of old pass)
OLD_FAIL=$(count_of old fail)
OLD_INVALID=$(count_of old invalid)

if (( NEW_TOTAL == 0 && OLD_TOTAL == 0 )); then
  fail_set "no arm-tagged results"
fi

if (( OLD_TOTAL > 0 )); then
  if [[ -n $N ]]; then
    fail_set "Gate A does not take --n"
  fi
  if (( NEW_TOTAL > 5 || OLD_TOTAL > 5 )); then
    fail_set "more than five results in an arm; Gate A has a fixed n"
  fi
  if (( NEW_FAIL > 0 )); then
    fail_run "new-arm session failed the Gate A rule"
  fi
  if (( OLD_FAIL > 0 )); then
    fail_run "old control failed the Gate A rule: $(field '[.rows[] | select(.arm=="old" and .computed!="pass") | .cause] | unique | join(", ")')"
  fi
  if (( NEW_INVALID > 0 || OLD_INVALID > 0 )); then
    fail_set "invalid runs present; replace them before counting Gate A"
  fi
  if (( NEW_VALID == 5 && OLD_VALID == 5 && NEW_PASS == 5 && OLD_PASS == 5 )); then
    report "PASS" "Gate A, five valid old/new pairs" 0
  fi
  incomplete "Gate A needs five valid old and five valid new results (have old $OLD_VALID, new $NEW_VALID); this is a pilot, not confirmatory"
fi

# Gate B: new arm only.
if (( NEW_FAIL > 0 )); then
  fail_run "a new-arm session failed; stop and do not report a rate"
fi
if (( NEW_INVALID > 0 )); then
  fail_set "invalid runs present; replace them before counting Gate B"
fi
if [[ -z $N ]]; then
  fail_set "Gate B needs a pre-declared --n (29 for 10%, 59 for 5%)"
fi
if [[ ! $N =~ '^[0-9]+$' || $N -le 0 ]]; then
  fail_set "--n must be a positive integer"
fi
if (( NEW_VALID > N )); then
  fail_run "more valid sessions than the pre-declared n; optional stopping invalidates the rate"
fi
if (( NEW_VALID < N )); then
  incomplete "Gate B needs exactly $N valid sessions (have $NEW_VALID); no rate yet"
fi

BOUND=$(awk -v n="$N" 'BEGIN { printf "%.2f", 100 * (1 - exp(log(0.05) / n)) }')
report "PASS" "Gate B, 0 failures in $N sessions; exact one-sided 95% upper bound ${BOUND}% (not a 0% point estimate)" 0
