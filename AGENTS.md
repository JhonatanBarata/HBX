# HBX Agent Instructions

## AI Context Index

Before changing HBX code, read the local AI context in `docs/ai/README.md`.

Active planning documents live in `docs/PLANEJAMENTOS/` (one folder per PR batch,
newest date wins). The `Webwhats/` project has its own `AGENTS.md`.

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

## Access & Billing State (single source of truth)

`backend/src/modules/company-access-state.ts` (`resolveCompanyAccessState`) is the only
place that decides a company's commercial/access state:
`platform_infra | exempt | manual | paying | trial | trial_ending | grace | overdue | pending_checkout | suspended | unknown`.

Hard rules:

- Never re-derive billing/access state from raw `paymentStatus`/`subscriptionStatus`
  in services or UI. The backend engines (`module-access-policy.ts`, `companyStatusBucket`,
  `master-billing-situation.ts`, `evaluateCompanyStatus`) and the master UI are
  projections of the canonical resolver. New screens read `accessState`/`accessStateLabel`
  from the API.
- Billing is the contratante's business only. Users with role `USER` (sellers/employees)
  must never see billing screens, amounts, payment statuses, or billing block reasons.
  Their blocks are always neutral (`company_access_paused` / `module_not_enabled`).
  Enforcement points: `presentModuleBlockForRole` (backend) and `PreCheckoutGate`
  (frontend, redirects to checkout only when `userKind === 'admin'`).
- `premiumAccess` means manual release decided by the master. Never set it as a side
  effect for paid or trialing subscriptions.
- Billing exemption is data, not code: `Company.billingExempt` (+ reason and audit),
  set only via the master endpoint `PUT /modules/master/company/:id/billing-exemption`.
  The internal HBX company is a normal tenant with exemption — never special-case
  access or billing rules by slug or company name.

## Master Surface

The system master governs through the command center tabs:
`Empresas | Planos & Regras | Email | Webwhats | Banco de Dados | Tokens | Links`.

- Master-puro navigation exposes only the `master` and `exclusoes` modules
  (`MASTER_SURFACE_MODULE_KEYS` in `modules.service.ts`). The full module surface
  appears only when the master assumes a company context ("Operar").
- "Planos & Regras" shows the live plan catalog (`workspace.plansCatalog`, same source
  as checkout — never hardcode plan prices/modules in the frontend) plus every active
  rule exception (exempt, manual, grace, pending checkout).
- Legacy routes `/master/clientes|financeiro|operacao|whatsapp|planos` resolve through
  `?tab=` into tabs and board filters; keep them working or remove them, never half-wired.

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
- billing/access state re-derived from raw statuses instead of `resolveCompanyAccessState`;
- billing information (amounts, payment status, billing block reasons) rendered for
  non-admin users (sellers/employees);
- auth guards or tenant/user boundaries are weakened;
- checkout, payment, webhook, subscription, or refund behavior changes without tests;
- Radar cards can be created from generic sources without a real company/opportunity;
- negative lead history is erased or ignored;
- secrets, PII, tokens, or sensitive commercial data are logged or exposed.

For routine maintenance, keep diffs small and explain commands that failed, including whether the failure appears pre-existing.
