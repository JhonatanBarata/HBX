#!/usr/bin/env sh
set -eu

for n in $(seq 51 200); do
  name="hbx-engine-$n"
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    echo "Stopping/removing $name"
    docker stop "$name" >/dev/null 2>&1 || true
    docker rm "$name" >/dev/null 2>&1 || true
  fi
done
