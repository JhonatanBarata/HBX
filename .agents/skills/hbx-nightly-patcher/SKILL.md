---
name: hbx-nightly-patcher
description: Use for recurring HBX phase-2 maintenance that may make small safe patches in an isolated worktree or GitHub branch. Fix clear lint/type/build/import/test issues, add focused tests, and update docs. Do not use for pricing, checkout, payments, auth rewrites, authorization rewrites, migrations, secrets, deploys, or broad refactors.
---

# HBX Nightly Patcher

Phase 2 allows small safe patches only.

Use this skill when HBX maintenance should produce a reviewable diff in an isolated worktree or GitHub branch. The result must be easy for the owner to inspect and reject.

## Mandatory Rules

1. Read `AGENTS.md` first.
2. Run `git status --short` and report dirty files before changing anything.
3. Work only in an isolated worktree, branch, CI checkout, or PR branch.
4. Keep the diff small and focused.
5. Do not merge, auto-merge, deploy, publish, migrate, seed, or restart production services.
6. Do not inspect, print, create, edit, or rotate secrets.
7. Stop and report instead of patching when uncertainty is high.

## Allowed Patches

You may patch:

- broken imports;
- obvious type errors;
- lint errors;
- build errors with a clear local cause;
- null/empty-state guards;
- small runtime bugs with direct evidence;
- focused tests for touched behavior;
- stale docs or smoke notes;
- small PT-BR copy fixes that do not change business logic.

## Forbidden Patches

Do not patch these without explicit owner approval in the current task:

- pricing, plans, paywalls, quotas, entitlements, billing, taxes, refunds, or commercial access;
- checkout, payment provider logic, payment webhooks, refunds, subscriptions, or production payment data;
- authentication rewrites;
- authorization rewrites;
- database migrations or schema changes;
- production secrets, keys, tokens, environment variables, or credential rotation;
- deploy, publish, release, or production restart behavior;
- large architecture refactors;
- deletion of commercial history, Radar negatives, or user data.

If you find an issue in a forbidden area, document evidence and manual review steps instead of changing it.

## Patch Budget

Default limits for unattended work:

- maximum 5 tracked files changed;
- no new production dependency;
- no migration;
- no generated build artifacts committed;
- no package manifest or lockfile changes in unattended mode;
- no `.github`, `.agents`, or root `AGENTS.md` changes in unattended mode;
- no public behavior change without a focused test or clear manual validation note.

If the task needs more than this, stop after the report.

## Validation

Run the smallest checks that prove the patch:

- `cd frontend && npm run lint` for frontend lint/type style issues;
- `cd frontend && npm run build` for frontend build/runtime compile issues;
- `cd backend && npm run prisma:validate` for Prisma/schema-adjacent work;
- `cd backend && npm run build` for backend TypeScript changes;
- targeted backend tests from `backend/package.json` when relevant.

Do not run deploy, publish, migration, seed, production restart, or payment-provider commands.

## Final Report

Return:

- summary of changes;
- dirty files found before work;
- files changed;
- checks run;
- checks passed and failed;
- risks and owner-review items;
- manual validation steps;
- whether the patch is safe to merge after review.
