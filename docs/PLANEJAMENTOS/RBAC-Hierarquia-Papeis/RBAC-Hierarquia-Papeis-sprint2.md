# RBAC / Hierarquia de Papéis — Sprint 2
## Autenticação fail-closed: JwtAuthGuard global + `@Public()` explícito

> Depende do sprint 1 estar publicado e estável (não misturar os dois num deploy).

## Contexto verificado

- HOJE o modelo é opt-in: **204 `@UseGuards` em 39 de 48 controllers** — cada rota
  protegida à mão. Handler sem decorator nasce **público**.
- Auditoria 01/07: os **9 controllers sem nenhum guard são intencionais** (nenhum
  vazamento ativo encontrado): `auth/internal.controller.ts` (x-internal-secret),
  `owner/owner-tickets.controller.ts` (x-owner-secret),
  `webscraping/webscraping-internal-radar.controller.ts` (x-hbx-internal-token — **atenção:
  linha 25 tem bypass quando token não configurado fora de produção**),
  `financeiro/financeiro.webhook.controller.ts`, `hbx-recovery/hbx-recovery-public.controller.ts`,
  `hbx-recovery/hbx-recovery.webhook.controller.ts`, `meta-lead-ads/meta-lead-ads.webhook.controller.ts`,
  `support/support.controller.ts`, `vendas/vendas-public.controller.ts`.
- Guard global existente (só throttler): `backend/src/app.module.ts:88` (`APP_GUARD` →
  `ThrottlerGuard`). O padrão NestJS de `@Public()` + guard global é o canônico da doc oficial.

## Por quê ($)

O ativo do negócio é a base de leads. O risco não é o que existe hoje (auditado) — é o
endpoint que ALGUÉM esquece amanhã. Fail-closed transforma "esqueceu = vazou" em
"esqueceu = 401". Custo: ~1 dia. Seguro barato.

## Escopo

1. Criar `@Public()` (`SetMetadata(IS_PUBLIC_KEY, true)`) em `backend/src/auth/`.
2. Estender `JwtAuthGuard` para ler `IS_PUBLIC_KEY` via `Reflector`
   (handler OU classe) e liberar sem autenticar.
3. Registrar `JwtAuthGuard` como `APP_GUARD` em `app.module.ts` (depois do Throttler).
4. Anotar `@Public()` em TODAS as rotas hoje sem JWT (inventário acima + rotas públicas
   dentro de controllers guardados por handler: login, signup, recuperação, webhooks,
   páginas públicas). Método de inventário: varrer TODO handler HTTP e classificar —
   `com JWT` / `@Public() + segredo próprio` / `@Public() puro`. Nenhum handler fica sem
   classificação.
5. Os `@UseGuards(JwtAuthGuard)` existentes ficam (inócuos com o global). NÃO remover em
   massa neste sprint — remoção é cosmética e aumenta o diff de risco.
6. Fechar o bypass da linha 25 do `webscraping-internal-radar.controller.ts`: em dev sem
   token configurado, logar warning em vez de liberar silenciosamente — OU exigir token
   sempre e setar no `.env` local (decidir pelo que não quebra o motor Python local).

## Fora de escopo
- Autorização (roles/permissions) — sprints 1/3/4. Aqui é só autenticação.
- Não tocar na trava de sessão única nem no token ops do master (`jwt.strategy.ts` —
  comportamento atual preservado).

## Riscos e guardrails
- **Risco nº1: quebrar webhook de produção** (Mercado Pago, Meta, recovery). Antes do
  publish: disparar cada webhook em localhost com payload real de teste e confirmar 200.
- Rota pública esquecida = cliente/checkout quebrado. O inventário do passo 4 é o
  entregável mais importante do sprint — colar a tabela completa no PR.
- Rollback: reverter o registro do `APP_GUARD` restaura o comportamento atual em 1 linha.

## Aceite
- Requisição sem token em rota não-`@Public()` → 401 (teste e2e).
- Todos os webhooks + rotas públicas respondem como antes (lista verificada 1 a 1).
- Tabela de inventário completa no PR: rota → classificação.

## Checks
- `cd backend && npm run build`
- `npm run test:e2e` (raiz) — caminho de login + 1 webhook
- Smoke manual localhost:3001: login dos 4 papéis + tela pública
