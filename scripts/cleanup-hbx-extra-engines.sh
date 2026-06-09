#!/usr/bin/env sh
set -eu

KEEP_COUNT="${HBX_ENGINE_CLEANUP_KEEP_COUNT:-${HBX_PUBLISH_ENGINE_MAX_COUNT:-${HBX_ENGINE_MAX_COUNT:-${HBX_ENGINE_COUNT:-${HBX_ENGINE_DEFAULT_COUNT:-${HBX_PUBLISH_ENGINE_COUNT:-${HBX_PUBLISH_WARM_ENGINE_COUNT:-20}}}}}}}"
SCAN_LIMIT="${HBX_ENGINE_CLEANUP_SCAN_LIMIT:-400}"

case "$KEEP_COUNT" in *[!0-9]*|"") KEEP_COUNT=200;; esac
case "$SCAN_LIMIT" in *[!0-9]*|"") SCAN_LIMIT=400;; esac

if [ "$KEEP_COUNT" -lt 1 ]; then KEEP_COUNT=1; fi
if [ "$KEEP_COUNT" -gt 200 ]; then KEEP_COUNT=200; fi
if [ "$SCAN_LIMIT" -lt "$KEEP_COUNT" ]; then SCAN_LIMIT="$KEEP_COUNT"; fi

START_REMOVE=$((KEEP_COUNT + 1))
if [ "$START_REMOVE" -gt "$SCAN_LIMIT" ]; then
  echo "No HBX engines above keep=$KEEP_COUNT to scan."
  exit 0
fi

for n in $(seq "$START_REMOVE" "$SCAN_LIMIT"); do
  name="hbx-engine-$n"
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    echo "Stopping/removing $name"
    docker stop "$name" >/dev/null 2>&1 || true
    docker rm "$name" >/dev/null 2>&1 || true
  fi
done

echo "Cleanup extra HBX engines done. keep=$KEEP_COUNT scan=$SCAN_LIMIT"
