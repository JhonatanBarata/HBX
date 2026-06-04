Run a report-only HBX nightly audit.

Use `$hbx-nightly-maintainer` if it is available in this repository.

Rules:

- Do not modify tracked repository files or create source, docs, or config edits.
- Do not apply patches.
- Do not commit, push, merge, deploy, publish, migrate, seed, or restart services.
- Do not alter pricing, plans, paywalls, checkout, payment logic, payment webhooks, auth, authorization, secrets, env vars, or commercial access rules.
- Read `AGENTS.md` first.
- Run `git status --short` and report any dirty files as pre-existing.

Preferred checks:

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`

If a command is too slow, blocked, or environment-sensitive, skip it and explain why. Transient build outputs are acceptable in CI and must not be committed.

Return:

- summary;
- dirty files found before audit;
- commands run;
- checks passed and failed;
- findings by severity;
- evidence with file paths;
- recommended next patches;
- risks that require owner review;
- whether each finding is safe for a future Codex patch phase.
