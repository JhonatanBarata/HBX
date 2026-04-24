set -e

if [ -z "${DIRECT_URL:-}" ]; then
  export DIRECT_URL="${DATABASE_URL:-}"
fi

npx prisma migrate deploy --schema=./prisma/schema.prisma
npm run start:prod
