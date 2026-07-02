# COLD-22 — ENTREGUE no master (commit e2506290), NÃO publicado

> Único cold com gatilho na porta → construído (subagente Sonnet) e trazido pro master **local**
> via patch cirúrgico, isolado do WORM-16 do dono (que seguia no working tree). **Não publicado** —
> o dono optou por não subir agora porque um `npm run publish` (git add -A) levaria o WORM-16
> inteiro + a migration LeadPerson pro prod junto. Sobe quando o dono decidir o batch.
> Blueprint estratégico original: `docs/PLANEJAMENTOS/cold/22-landing-pages-nativas.md`.

**Escopo entregue pelo subagente:** endpoint público (honeypot + rate-limit + dedup via ledger) →
`intakeAdvertisingLead({source:'site', temperature:'quente'})` → notificação WhatsApp (rotina
existente ou atrás de flag `HBX_SITE_LEAD_NOTIFY_ENABLED`) → origem "Site próprio" no card + snippet
de form no template do website-kit + teste unitário. NÃO publicado (worktree).

**PENDÊNCIA-DONO ao aterrissar:** aplicar migration do `websiteCaptureToken` no VPS, decidir domínio
público do backend p/ o `fetch` do site Firebase, liberar CORS da rota, ligar flag de notificação.
