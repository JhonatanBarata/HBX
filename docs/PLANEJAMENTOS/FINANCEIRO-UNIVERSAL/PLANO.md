# FINANCEIRO-UNIVERSAL — Fase 1: financeiro funcional em todos os módulos úteis

**Contexto:** hoje o financeiro do cliente vive PRESO dentro da logística. `FinanceiroCharge`
já é genérico, mas todas as portas têm a fechadura da logística: endpoints atrás de
`@ModuleAccess('logistica')`, o `quitar` recusa charge que não seja `logistica_*`, e não
existe NENHUMA tela/nav "Financeiro" na casca central. Venda fechada no funil NÃO vira
dinheiro em lugar nenhum. Mapa completo: workflow 8 agentes (11/07), verificado no código.

## Regra-mãe desta fase: NÃO QUEBRAR A LOGÍSTICA
Arquitetura escolhida toca **ZERO** em `logistica.service.ts`, `schema.prisma` e
`structural-defaults.json` (os 3 arquivos que uma sessão paralela — concierge/núcleo —
está editando ao vivo). A logística continua exatamente como está; o financeiro universal
é um **módulo NOVO** que lê/baixa o MESMO `FinanceiroCharge` por catálogo de origens.

## ESCOPO — este publish (Fase 1)
1. **Fix segurança:** `GET /logistica/resumo-dia` ganha `@Admin` (era o único endpoint de
   dinheiro sem trava — entregador USER lia recebido/a-receber do dia). Arquivo:
   `logistica.controller.ts` (não-contestado).
2. **Módulo `financeiro-tenant` (NOVO, arquivos novos):** controller `/financeiro-tenant/*`
   `@Admin` + company-scoped, SEM `@ModuleAccess('logistica')` → acessível a tenant de
   vendas OU logística. Service lê `FinanceiroCharge` por catálogo
   `TENANT_FINANCE_SOURCE_MODULES = ['logistica_entrega','logistica_fechamento','vendas_fechamento']`:
   - `GET saldos` (quem me deve, todas as origens)
   - `GET clientes/:id/extrato`
   - `POST charges/:id/quitar` (baixa genérica, claim atômico idempotente — espelha o
     padrão provado do `logistica.quitarCharge`; escopo `sourceModule IN catálogo`)
   Logística mantém os endpoints dela intactos.
3. **Vendas → dinheiro:** `POST /vendas/lead/:id/gerar-cobranca` (`@Admin`) cria
   `FinanceiroCharge` `sourceModule='vendas_fechamento'`, `customerProfileId` (o card já
   vira CustomerProfile no fechamento), `dueDate`, idempotente via
   `externalReference='vendas_fechamento:<leadId>'` (campo já `@unique` — ZERO schema novo).
4. **Frontend:** tela central desktop `/financeiro` (reusa os endpoints do módulo novo) +
   entrada em `NAV_LINKS`/`NAV_ENTITLEMENT`/`NAV_MODULE_KEY` (fail-closed exige os 2 mapas);
   botão "Gerar cobrança" no card/modal de vendas (admin); esconder painel financeiro zumbi
   em `/contatos` quando logística inacessível.

## DEFERIDO — decisão/segunda leva (NÃO entra sem OK do dono)
- **Furo #2 direção MP (money-routing):** recarga/assinatura da PLATAFORMA usam
  `resolveCompanyMercadoPagoAccess` que prefere o token do TENANT → receita da plataforma
  pode cair na conta MP do cliente (cenário estreito: tenant com token próprio p/ recovery).
  É onde o dinheiro ATERRISSA → não mexo sem OK. **Decisão do dono.**
- **Pagamento parcial + método de pagamento** (tabela `FinanceiroPagamento`) — schema.
- **Product.custoUnit + margem** — schema.
- **Relatórios:** fechamento de caixa do entregador, fluxo de caixa mensal, export CSV.
- **Régua automática de cobrança WhatsApp** — DISPARA WhatsApp ao vivo = gatilho de ban;
  só com freio (throttle `HBX_WA_SEND_THROTTLE_ENABLED` hoje OFF) + disjuntor + teste em
  número descartável. **NÃO entra neste publish.**
- **Liquidação MP real do tenant** (link PIX na conta do cliente) — faltam 3 peças
  (self-service do token, secret de webhook por conta, flag de direção). **Decisão do dono.**

## Validação (gate do publish)
Typecheck back+front+motor VERDE; testes logística/vendas/créditos VERDES; **tree INTEIRO
compila com o concierge** (o dono autorizou publicar tudo junto, condicionado a compilar).
Depois: QA no VPS tela por tela + workers de correção.
