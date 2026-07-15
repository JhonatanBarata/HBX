#!/usr/bin/env sh
set -eu

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  COMPOSE=""
fi

echo "== Docker Compose =="
if [ -n "$COMPOSE" ]; then
  $COMPOSE version || true
  echo "compose command: $COMPOSE"
else
  echo "docker compose/docker-compose not found"
fi

echo
echo "== HBX engine containers 1..50 =="
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | awk '/hbx-engine-([0-9]+)(\t|$)/ { print }' | sort -V || true

echo
echo "== Backend engine/env =="
BACKEND_CONTAINER="${HBX_BACKEND_CONTAINER:-hbx-backend}"
docker exec "$BACKEND_CONTAINER" sh -lc 'printenv | grep -E "^(HBX_ENGINE_COUNT|HBX_ENGINE_MAX_COUNT|HBX_ENGINE_URLS|HBX_CLIENT_RESERVED_ENGINES|HBX_RADAR_CLIENT_PRIORITY_)" | sort' || true

echo
echo "== Health from backend network =="
for n in 1 20 21 40 50; do
  url="http://hbx-engine-$n:8001/health"
  printf "hbx-engine-%s " "$n"
  docker exec "$BACKEND_CONTAINER" sh -lc "if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 4 '$url'; elif command -v wget >/dev/null 2>&1; then wget -qO- -T 4 '$url'; else node -e \"fetch('$url').then(r=>r.text().then(t=>{console.log(r.status,t)})).catch(e=>{console.error(e.message);process.exit(1)})\"; fi" || true
  echo
done

echo
echo "== Recent scheduler logs =="
docker logs "$BACKEND_CONTAINER" --since=30m 2>&1 | grep -E "engine-scheduler|acquired engine" | tail -n 160 || true

echo
echo "== Compose usage hint =="
if [ "$COMPOSE" = "docker compose" ]; then
  echo "Use: docker compose -f docker-compose.hostinger.yml ps"
elif [ "$COMPOSE" = "docker-compose" ]; then
  echo "Use: docker-compose -f docker-compose.hostinger.yml ps"
else
  echo "Install Docker Compose v2 or docker-compose v1."
fi
