This migration adds Plan and Feature tables and links Company to Plan.

Current role: canonical PostgreSQL baseline for the active schema.

Run: `prisma migrate deploy --schema=./prisma/schema.prisma`

## Prisma Studio

Studio must be started via:
scripts/start-prisma-studio.ps1

Do not run `npx prisma studio` directly when your host environment is not loaded.
Use the wrapper so DATABASE_URL and DIRECT_URL point to the active PostgreSQL environment.
