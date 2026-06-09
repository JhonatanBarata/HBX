# Relatorio Fase 5 - Profile, Login e Gerencial

Data: 2026-06-08

## Objetivo

Remover tratamento comercial especial por slug/empresa HBX em profile, login e frontend, mantendo a empresa HBX como tenant normal quando `companyKind="tenant"`.

## Ajustes aplicados

- `backend/src/auth/profile.controller.ts` passou a expor `companyKind`, `isTenant` e `isPlatformInfra`, sem marcar vendedor por slug HBX.
- `backend/src/auth/auth.service.ts` passou a bloquear `platform_infra` como workspace operacional/comercial e removeu redirects especiais pelo slug `hbx-master-whatsapp-engine`.
- `frontend/src/lib/billing-access.ts`, `frontend/src/app/login/page.tsx`, `frontend/src/app/pagamento/*` e `frontend/src/lib/currentUserAccess.ts` deixaram de liberar ou redirecionar por slug HBX.
- Gerencial passou a tratar documentação, comissao e heranca como escolhas do dono da empresa tenant:
  - o dono pode criar vendedor sem documentação;
  - o dono pode salvar documentação/contrato e liberar depois;
  - o dono pode configurar comissão ou deixar sem valor especial;
  - o dono pode configurar herança/indicador ou manter o vendedor direto.
- Textos de UI foram ajustados de "Parceiro/Rede HBX" para "Vendedor/Indicações" quando o recurso é uma escolha gerencial genérica.

## Regra preservada

Os nomes internos legados de API/campo (`hbxNetwork`, `isHbxSellerNetwork`, rotas `hbx-partner`) foram mantidos como compatibilidade. Eles nao concedem privilegio por slug; agora representam opcoes de vendedor em empresa tenant.

## Validacao

- `npm --prefix backend run build`
- `node --test backend/dist/gerencial/hbx-partner-referral.service.test.js backend/dist/gerencial/seller-onboarding.service.test.js backend/dist/team/team-policy.service.test.js backend/dist/commercial-plans/commercial-usage-limits.service.test.js`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
