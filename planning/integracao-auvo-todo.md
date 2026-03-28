# TO DO - Integracao AUVO / Arrumar a Casa do HBX

## Regras travadas

- Nao fazer refactor grande do Atendimento.
- Nao mexer em NF agora.
- Nao fazer split/comissao automatica agora.
- Nao mexer no billing do MASTER.
- Nao remover tabelas antigas.
- Nao chutar payload/endpoints da AUVO.
- Migration so estrutural.
- Backfill separado da migration.

## Sprint 1 - Schema backbone

- Criar `CustomerProfile`.
- Criar `DebtCase`.
- Criar `IntegrationConnection`.
- Criar `IntegrationSyncRun`.
- Adicionar `customerProfileId` opcional em `AtendimentoCustomer`.
- Adicionar `customerProfileId` opcional em `HbxRecoveryCustomer`.
- Adicionar `debtCaseId` opcional em `HbxRecoveryPayment`.
- Adicionar indices:
  - `companyId + phoneNormalized`
  - `companyId + document`
  - `sourceConnectionId + externalCustomerId`
  - `sourceConnectionId + externalDebtId`
- Nao criar unique agressivo em `document`.
- Nao colocar `not null` novo em legado.

## Sprint 2 - Seguranca da integracao

- `IntegrationConnection` precisa ter:
  - segredo criptografado
  - preview mascarado
  - status
  - ultimo teste
  - ultimo sync
- Nunca retornar token puro em leitura.
- So aceitar token puro em `create/update`.
- Reaproveitar o padrao ja usado no MASTER para credenciais.

## Sprint 3 - Backfill

- Criar script separado da migration.
- Script com modo `dry-run`.
- Script com modo `apply`.
- Match inicial so por `phoneNormalized`.
- Casos ambiguos nao mesclar.
- Gerar relatorio:
  - vinculados
  - ambiguos
  - ignorados
  - erros

## Sprint 4 - CustomerProfileService

- Criar `CustomerProfileService`.
- Fazer `cadastros.service.ts` delegar identidade central para ele.
- Preservar endpoints atuais de cadastro.
- Criar novos endpoints centrais de perfil.
- Nao mexer agora em fornecedores, paises, portos e transit time.

## Sprint 5 - Atendimento

- Entrada do WhatsApp procura `CustomerProfile` primeiro.
- Se nao achar, cria perfil provisorio.
- Depois sincroniza `AtendimentoCustomer` como projecao operacional.
- Nao trocar o fluxo externo do Inbox.
- No frontend, mexer so nos pontos de identidade.

## Sprint 6 - Recovery

- `promoteToRecovery` passa a:
  - buscar/criar `CustomerProfile`
  - criar `DebtCase`
  - criar/atualizar `HbxRecoveryCustomer`
- Colocar isso em transacao.
- `HbxRecoveryPayment` passa a aceitar `debtCaseId`.
- Manter compatibilidade transitoria com `customerId`.

## Sprint 7 - MASTER

- Adicionar secao inline de Integracoes no MASTER.
- Nada de tabs novas.
- Mostrar:
  - conexao
  - status
  - ultimo teste
  - ultimo sync
- Ter:
  - criar/editar conexao
  - testar conexao
  - sincronizar agora
- Usar drawer/modal simples.

## Sprint 8 - AUVO scaffold

- Criar `backend/src/integrations/auvo`.
- Criar:
  - `auvo.module.ts`
  - `auvo.client.ts`
  - `auvo.mapper.ts`
  - `auvo.sync.service.ts`
  - `auvo.webhook.service.ts` stub
- Tudo com interface/mock.
- Nada de endpoint real chutado.
- Cada sync gera `IntegrationSyncRun`.

## Checklist de validacao

- Migration nao pode ter `drop`.
- Migration nao pode renomear tabela antiga.
- Endpoints antigos de cadastro tem que continuar funcionando.
- Inbox tem que continuar abrindo normal.
- Promotion para Recovery nao pode gerar escrita parcial.
- MASTER nao pode regredir visualmente.
- Sync mock precisa aparecer no MASTER com ultimo status.

## Ordem de execucao

1. Criar `planning/integracao-auvo-todo.md`.
2. Fazer Sprint 1.
3. Fazer Sprint 2.
4. Fazer Sprint 3.
5. Fazer Sprint 4.
6. Fazer Sprint 5.
7. Fazer Sprint 6.
8. Fazer Sprint 7.
9. Fazer Sprint 8.

## Mapa tecnico por arquivo

### Sprint 1 - Schema backbone

- `backend/prisma/schema.prisma`
  - adicionar `CustomerProfile`
  - adicionar `DebtCase`
  - adicionar `IntegrationConnection`
  - adicionar `IntegrationSyncRun`
  - adicionar `customerProfileId` opcional em `AtendimentoCustomer`
  - adicionar `customerProfileId` opcional em `HbxRecoveryCustomer`
  - adicionar `debtCaseId` opcional em `HbxRecoveryPayment`
  - adicionar indices sem endurecer `document` com unique
- `backend/prisma/migrations/<timestamp>_add_customer_profile_integration_backbone/migration.sql`
  - conter so SQL estrutural
  - nao conter `DROP`, `ALTER TABLE ... RENAME` ou backfill

### Sprint 2 - Seguranca da integracao

- `backend/src/modules/master-global-integrations.util.ts`
  - reaproveitar padrao de preview mascarado
- `backend/src/modules/modules.service.ts`
  - usar como referencia de `previewSecret`
- `backend/src/integrations/`
  - criar utilitario/servico de segredo criptografado para `IntegrationConnection`
- `backend/src/.../dto`
  - aceitar segredo puro apenas em create/update
- `backend/src/.../controller|service`
  - nunca retornar token puro em leitura

### Sprint 3 - Backfill

- `backend/scripts/backfill-customer-profiles.js`
  - suportar `--dry-run`
  - suportar `--apply`
  - casar por `phoneNormalized`
  - nao mesclar ambiguos
  - gerar relatorio de vinculados, ambiguos, ignorados e erros

### Sprint 4 - CustomerProfileService

- `backend/src/customer-profile/customer-profile.service.ts`
  - centralizar identidade por telefone/documento
- `backend/src/customer-profile/customer-profile.module.ts`
  - expor servico para Cadastro, Atendimento e Recovery
- `backend/src/cadastros/cadastros.service.ts`
  - delegar identidade central para `CustomerProfileService`
- `backend/src/cadastros/cadastros.controller.ts`
  - manter endpoints atuais
  - adicionar endpoints centrais de perfil
- `backend/src/cadastros/dto/*`
  - incluir DTOs dos novos endpoints de perfil

### Sprint 5 - Atendimento

- `backend/src/inbox/inbox.service.ts`
  - resolver cliente por `CustomerProfile` antes da projecao operacional
- `backend/src/messaging/*`
  - ajustar entrada do WhatsApp para procurar/criar perfil antes de sincronizar `AtendimentoCustomer`
- `frontend/src/components/workspace/adapters/atendimento-data.ts`
  - expor campos minimos de identidade
- `frontend/src/app/dashboard/inbox/page.client.tsx`
  - consumir campos novos sem alterar o fluxo externo do Inbox

### Sprint 6 - Recovery

- `backend/src/inbox/inbox.service.ts`
  - colocar `promoteToRecovery` em transacao
  - criar `DebtCase` no fluxo de promocao
- `backend/src/hbx-recovery/hbx-recovery.service.ts`
  - aceitar `debtCaseId` preservando compatibilidade com `customerId`
- `backend/prisma/schema.prisma`
  - manter relacao transitoria de `HbxRecoveryPayment` com `customerId`

### Sprint 7 - MASTER

- `frontend/src/app/dashboard/master/page.client.tsx`
  - adicionar secao inline de Integracoes
  - lista/tabela minima
  - drawer/modal simples
  - botoes de testar conexao e sincronizar agora
- `backend/src/.../integrations/*.controller.ts`
  - CRUD basico de conexoes
  - endpoints de teste e sync manual

### Sprint 8 - AUVO scaffold

- `backend/src/integrations/auvo/auvo.module.ts`
- `backend/src/integrations/auvo/auvo.client.ts`
- `backend/src/integrations/auvo/auvo.mapper.ts`
- `backend/src/integrations/auvo/auvo.sync.service.ts`
- `backend/src/integrations/auvo/auvo.webhook.service.ts`
  - tudo com interface/mock
  - nada de endpoint real chutado
  - cada sync gera `IntegrationSyncRun`