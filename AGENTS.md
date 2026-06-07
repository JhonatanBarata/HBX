# HBX Agent Instructions

## AI Context Index

Before changing HBX code, read the local AI context in `docs/ai/README.md`.

For broad repository orientation, use:

- `docs/ai/AI_CONTEXT.md`
- `docs/ai/PRODUCT_INVARIANTS.md`
- `docs/ai/REPO_MAP.md`
- `docs/ai/AI_ENTRYPOINTS.md`
- `docs/ai/AI_COMMANDS.md`
- `docs/ai/SKILL_REFERENCE.md`

Keep this `AGENTS.md` at the repository root. Agents read this path automatically; do not move it into `docs`.

## Product Direction

HBX is a prospecting pipeline:

Radar -> Vendas -> WhatsApp -> Retorno

Keep changes aligned with this flow. Radar is the memory of leads and opportunities. Negative results protect the system from repeated work and must not be discarded casually.

## Safety Rules

Do not make these changes unless the owner explicitly asks for them in the current task:

- pricing, plans, paywalls, quotas, entitlements, billing, tax, refunds, or commercial access;
- payment provider logic, checkout, webhooks, refunds, subscriptions, or production payment data;
- authentication or authorization rewrites;
- production secrets, keys, tokens, environment variables, or credential rotation;
- database migrations or destructive data operations;
- deploy, publish, release, or production restart commands;
- large architecture rewrites or broad refactors outside the requested scope.

Never expose secrets or bypass paid access. The backend is the source of truth for commercial authorization.

## Repo Map

- `frontend`: Next.js, React, TypeScript, Tailwind.
- `backend`: NestJS, Prisma, TypeScript.
- `Webwhats`: separate WhatsApp-related area with its own instructions.
- `docs`: operational notes, smoke results, reports, and runbooks.

## Default Checks

Prefer the smallest relevant checks for the files touched.

Frontend:

- `cd frontend && npm run lint`
- `cd frontend && npm run build`

Backend:

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- targeted backend tests from `backend/package.json` when the touched area matches them.

Root:

- `npm run test:e2e` only when an end-to-end path was changed and the environment is ready.

Do not run deploy or publish scripts during maintenance, review, or audit work.

## UI Standards

Public UI text should stay in PT-BR.

For operational desktop pages, avoid marketing heroes. Start with the HBX operational guides:

- `guia1`: use `HbxGuide1`, `hbx-guide1-slot`, `hbx-guide1`, and `hbx-tab-glide`.
- `guiaesquerdovertical`: use `HbxGuide4` and `hbx-guide4`.
- `subguia`: use `hbx-guide5` when a horizontal operational rail is needed.

New visual work must remain legible in light and dark themes. Prefer existing tokens and components before adding local styles.

## Review Guidelines

Flag these as high-priority risks:

- a paid feature becomes usable without a valid plan, payment, entitlement, quota, or commercial status;
- auth guards or tenant/user boundaries are weakened;
- checkout, payment, webhook, subscription, or refund behavior changes without tests;
- Radar cards can be created from generic sources without a real company/opportunity;
- negative lead history is erased or ignored;
- secrets, PII, tokens, or sensitive commercial data are logged or exposed.

For routine maintenance, keep diffs small and explain commands that failed, including whether the failure appears pre-existing.
