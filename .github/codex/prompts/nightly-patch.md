Run HBX phase-2 nightly maintenance.

Use `$hbx-nightly-patcher` if it is available in this repository.

Goal:

Make only small, safe, reviewable maintenance patches in this isolated CI branch. If no safe patch is obvious, do not change files and return a report.

Rules:

- Read `AGENTS.md` first.
- Run `git status --short` before changing anything and report dirty files.
- Keep the diff small: maximum 5 tracked files changed.
- Do not commit, push, merge, auto-merge, deploy, publish, migrate, seed, or restart services.
- Do not alter pricing, plans, paywalls, quotas, entitlements, billing, checkout, payment logic, payment webhooks, refunds, subscriptions, auth, authorization, secrets, env vars, migrations, commercial access rules, Radar negatives, or user data.
- Do not add production dependencies.
- Do not change package manifests or lockfiles.
- Do not change `.github`, `.agents`, or root `AGENTS.md`.
- Do not commit generated build artifacts.
- If the safe fix is not clear, stop and report.

Preferred work:

- fix clear lint/type/build/import failures;
- add null/empty-state guards for obvious runtime risks;
- add focused tests for touched behavior;
- update stale docs or smoke notes;
- improve small PT-BR copy only when it does not change business logic.

Validation:

- run the smallest relevant check;
- prefer `cd frontend && npm run lint` for frontend lint changes;
- prefer `cd frontend && npm run build` for frontend build changes;
- prefer `cd backend && npm run prisma:validate` for Prisma-adjacent work;
- prefer `cd backend && npm run build` for backend TypeScript changes;
- run targeted backend tests when relevant.

Return:

- summary of changes;
- dirty files found before work;
- files changed;
- checks run;
- checks passed and failed;
- risks and owner-review items;
- manual validation steps;
- whether the patch is safe to merge after review.
