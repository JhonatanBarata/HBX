set -e

if [ -z "${DIRECT_URL:-}" ]; then
  export DIRECT_URL="${DATABASE_URL:-}"
fi

wait_for_database() {
  echo "Waiting for PostgreSQL before Prisma migrations..."
  last_output=""
  for attempt in $(seq 1 60); do
    if output="$(printf 'SELECT 1;' | npx prisma db execute --schema=./prisma/schema.prisma --stdin 2>&1)"; then
      echo "PostgreSQL is reachable."
      return 0
    fi

    last_output="$output"
    if ! printf '%s' "$output" | grep -Eq 'P1001|ECONNREFUSED|Connection refused|Can.t reach database server|connect ETIMEDOUT|timeout'; then
      printf '%s\n' "$output"
      return 1
    fi

    echo "PostgreSQL not ready yet (${attempt}/60)."
    sleep 2
  done

  printf '%s\n' "$last_output"
  echo "PostgreSQL did not become reachable in time."
  return 1
}

wait_for_database
npx prisma migrate deploy --schema=./prisma/schema.prisma
npm run start:prod
