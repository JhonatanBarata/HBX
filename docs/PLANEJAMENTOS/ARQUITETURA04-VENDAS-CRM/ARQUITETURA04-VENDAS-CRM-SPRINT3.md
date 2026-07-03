# SPRINT3 — Comissões em módulo próprio (P1) — FRENTE FINANCEIRA

> **REGRA DA CASA: frente financeira (preço/cobrança/comissão) = Opus edita DIRETO com revisão
> obrigatória do diff pelo dono. NÃO delegar este sprint a subagente.**
> LEI DO VENDEDOR intocada: só Admin vê valores; vendedor nunca vê motivo financeiro.

## ⛔ BLOQUEADO 03/07 — descoberta com dados (o plano "move limpo" ESTÁ ERRADO)

Antes de mover um centavo, medi as dependências reais dos 7 métodos de comissão em `vendas.service.ts`.
Resultado (script de análise de `this.X()`):

- **7 helpers EXCLUSIVOS** de comissão (moveriam junto sem dor): `assertCanCancelCommission`,
  `assertCanMarkCommissionPaid`, `assertCanViewCommission`, `buildCommissionClientPayload`,
  `buildCommissionReceivablePayload`, `canUseCommissionTeamScope`, `isDueReceivable`.
- **15 helpers COMPARTILHADOS**, núcleo do service inteiro, usados em TODA parte:
  `normalizeCurrencyAmount` (83 usos), `normalizeText` (180), `assertVendasPermission` (30),
  `buildTimelineEvent` (32), `resolveVendasUserContext` (40), `normalizeSaleStatus` (27),
  `normalizeCommissionStatus` (17), `formatSaleStatusLabel` (8), `formatCommissionStatusLabel` (7),
  `getSaoPauloDayKey`, `parseDate`, `isDueCommission`, `resolveCommissionDueBusinessDays`,
  `normalizeCommissionDueBusinessDays`, `resolveSellsHbxPlans`.

Mover comissão exigiria **duplicar a matemática do dinheiro** (`normalizeCurrencyAmount` em 2 lugares
= divergência de arredondamento esperando acontecer — inaceitável em comissão) OU um acoplamento torto
(tornar ~15 privados públicos e o serviço de comissão chamar de volta o vendas). Ambos pioram o código.

### Pré-requisito real (novo): SPRINT0 — extrair o NÚCLEO compartilhado

O 1º passo do split NÃO é comissão — é extrair o kernel de utilitários puros
(`vendas-shared/*.ts`: dinheiro/`normalizeCurrencyAmount`, texto/`normalizeText`, normalizadores de
status, datas São Paulo, `resolveVendasUserContext`, `assertVendasPermission`, `buildTimelineEvent`)
para funções puras/serviço injetável, re-apontando os call-sites. É grande (83+180+40… call-sites) mas
é **mecânico e sem lógica de dinheiro nova** — tsc + as 68 specs de `vendas.service.test.ts` guardam.
Só DEPOIS do kernel existir, comissão (S3) E os domínios do S5 (board/intake/…) saem limpos, todos
importando o mesmo kernel — sem duplicar, sem acoplar.

**Decisão (03/07, autonomia total):** NÃO forcei o S3 agora. Mover código financeiro no escuro, no fim
de uma sessão longa, com a matemática do dinheiro entrelaçada em 180 call-sites, é o oposto de "melhor
direção". S3 fica atrás do SPRINT0 (kernel), em sessão FOCADA, com Postgres de pé pra rodar as 68 specs.

## Problema

O dinheiro do vendedor (comissão, payout, receivable, caso de cancelamento) vive dentro do god-file
`vendas.service.ts` (9.719 linhas) misturado com board, e-mail e relatório. Qualquer mudança de funil
passa pelo arquivo que calcula pagamento — erro de merge aqui quebra confiança do time de vendas.
O módulo `commissions/` JÁ existe (`HbxCommissionSyncService` mora lá).

## Objetivo

Movimentação de código, **zero mudança de comportamento, endpoint, payload ou schema**. Snapshots de
comissão no `VendasLead` FICAM onde estão neste sprint (split de tabela é decisão separada, não tomada).

## Escopo — métodos a mover de `vendas.service.ts` para `commissions/vendas-commissions.service.ts` (novo)

| Método | Linha atual | Rota servida |
|---|---|---|
| `getCommissionSummaryForUser` | L4329 | GET `/vendas/commission/summary` |
| `createCommissionPayoutForUser` | L3582 | POST `/vendas/commission/payout` |
| `cancelCommissionPayoutForUser` | L3813 | POST `/vendas/commission/payout/:id/cancel` |
| `getCommissionPayoutDetailForUser` | L3955 | GET `/vendas/commission/payout/:id` |
| `getMyCommissionProfileForUser` | L8899 | GET `/vendas/me/commission-profile` |
| `listCancellationCasesForUser` | L1111 | GET `/vendas/cancellation-cases` |
| `resolveCancellationCaseForUser` | L1155 | PATCH `/vendas/lead/:id/cancellation-case` |

+ os helpers privados que SÓ eles usam (mapear com grep antes de mover; helper compartilhado com
board/relatório fica no vendas e é importado/injetado — não duplicar).

`VendasService` mantém métodos com o mesmo nome delegando 1-linha para o service novo (fachada) —
`vendas.controller.ts` NÃO muda. `VendasModule` já importa `CommissionsModule`; registrar o service
novo lá e exportar.

## Passos

1. Grep de dependências de cada método (helpers privados, models Prisma tocados:
   `VendasCommissionPayout`, `VendasCommissionReceivable`, campos `commission*` e
   `cancellationCase*` do `VendasLead`).
2. Mover método a método, com o teste correspondente de `vendas.service.test.ts` migrando junto.
3. Fachada de delegação no `VendasService`.
4. Diff final para revisão do dono: deve ler como "recortar e colar + delegação", nenhuma linha de
   lógica alterada. Qualquer linha que precisou mudar além de import/this → justificar uma a uma.

## Guardrails

- Nenhum valor, percentual, cap, arredondamento ou condição de status muda.
- `applyCommissionCap` e catálogo (`commercial-plan-catalog`) continuam sendo a fonte.
- Sem migration. Sem mudança em DTO.
- Sincronização recorrente (`HbxCommissionSyncService`, `runWeeklySalesProfileSuggestions` NÃO é
  comissão — não tocar).

## Checks e aceite

- `cd backend && npm run build` verde; testes de comissão (movidos) + testes restantes do vendas verdes.
- Diff revisado e aprovado pelo dono ANTES de publicar.
- Smoke manual: resumo de comissão e detalhe de payout idênticos antes/depois (mesma empresa de teste,
  credenciais em `.test-login.local.md`, localhost:3001, Chrome).

## Rollback

`git revert` — movimentação pura.
