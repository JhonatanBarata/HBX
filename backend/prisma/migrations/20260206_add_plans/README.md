This migration adds Plan and Feature tables and links Company to Plan.

Run: `prisma migrate dev --name add_plans`

## Prisma Studio

Studio must be started via:
scripts/start-prisma-studio.ps1

Do not run `npx prisma studio` directly,
as DATABASE_URL must be forced to SQLite file path.
