# Plano Fase 10 - Centralizar catalogos do Gerencial

Data: 2026-06-08

Branch alvo: `refactor/master-tenant-clean-cut`

Commit sugerido: `feat(gerencial): centralizar catalogo de acessos do vendedor`

## Objetivo

Criar a base central do `Gerencial > Acessos` como fonte de verdade para tudo que um vendedor de tenant pode ver, fazer, puxar, vender, enviar, editar, distribuir ou receber.

Regra central:

- HBX continua sendo tenant comum.
- Nao criar regra especial por empresa HBX.
- Nao usar slug como regra.
- Nao usar texto/runtime de `vendedor HBX`.
- Toda capacidade especial deve ser opcao configuravel do tenant/vendedor.

## Principio do corte

Se uma capacidade existe no produto, ela precisa aparecer no catalogo de acessos do Gerencial.

Se ainda nao houver enforcement no backend, a capacidade nao deve sumir: deve aparecer como `pendente de enforcement`.

Modelo esperado:

```text
Catalogo -> Preset -> Policy -> Tela -> Backend
```

O vendedor nao deve ter capacidade invisivel, e o backend nao deve depender de excecao por empresa.

## Arquivos principais

Criar:

- `backend/src/team/team-access-catalog.ts`
- `backend/src/team/team-access-presets.ts`

Atualizar:

- `backend/src/team/team-policy.types.ts`
- `backend/src/team/team-policy.service.ts`
- endpoints de TeamPolicy
- tela `frontend/src/app/gerencial/page.client.tsx`
- componentes de policy em `frontend/src/app/gerencial/_components`
- enforcement minimo de Radar/Vendas ja existente

## Catalogo central

Cada item deve ter:

- `key`
- `group`
- `label`
- `description`
- `defaultForAdmin`
- `defaultForSeller`
- `requiresModule?`
- `riskLevel: low | medium | high | critical`
- `sellerVisible: boolean`
- `backendEnforced: boolean`

## Grupos e keys

### Modulos

- `vendas.access`
- `radar.access`
- `atendimento.access`
- `financeiro.access`
- `cadastro.access`
- `website.access`
- `gerencial.access`

### Radar

- `radar.search.run`
- `radar.cards.pull`
- `radar.cards.viewOwn`
- `radar.cards.viewUnassigned`
- `radar.cards.assignToSelf`
- `radar.cards.assignToOthers`
- `radar.cards.distribute`
- `radar.filters.useSegments`
- `radar.filters.useCities`
- `radar.filters.useStates`
- `radar.enrichment.manual`
- `radar.enrichment.auto`

### Vendas / CRM

- `vendas.cards.viewOwn`
- `vendas.cards.viewCompany`
- `vendas.cards.createManual`
- `vendas.cards.edit`
- `vendas.cards.transfer`
- `vendas.cards.close`
- `vendas.cards.reopen`
- `vendas.cards.delete`
- `vendas.timeline.comment`
- `vendas.return.schedule`
- `vendas.status.change`
- `vendas.sale.markActivationPending`
- `vendas.sale.markTrialStarted`
- `vendas.sale.markConfirmed`
- `vendas.sale.markInactive`

### Comunicacao

- `communication.whatsapp.useCompanyNumber`
- `communication.whatsapp.sendManual`
- `communication.email.send`
- `communication.email.useCompanyReplyTo`
- `communication.support.contactAdmin`
- `communication.support.viewCompanySupportChannels`

### Comissao

- `commission.viewOwn`
- `commission.viewTeam`
- `commission.editPercent`
- `commission.editDueDays`
- `commission.markPaid`
- `commission.cancel`
- `commission.viewInherited`

### Rede / indicacao

- `sellerNetwork.recruitSellers`
- `sellerNetwork.viewReferrals`
- `sellerNetwork.approveReferrals`
- `sellerNetwork.receiveInheritedCommission`

### Produtos

- `products.view`
- `products.sell`
- `products.edit`
- `products.discount`
- `products.viewPrice`
- `products.changePrice`

### Admin

- `team.users.create`
- `team.users.edit`
- `team.users.disable`
- `team.users.delete`
- `team.access.manage`
- `team.access.applyPreset`
- `team.access.viewAudit`

## Presets obrigatorios

Criar presets em `backend/src/team/team-access-presets.ts`.

Cada preset deve gerar `accessMap` e limites basicos quando fizer sentido.

Presets minimos:

- `admin_full`: acesso total de tenant admin.
- `seller_crm_only`: recebe cards e trabalha no CRM.
- `seller_radar_limited`: pode puxar Radar limitado e trabalha somente cards proprios.
- `seller_assigned_only`: nao pesquisa Radar; apenas recebe missao/card.
- `seller_referral`: pode indicar/recrutar e receber comissao herdada.
- `seller_blocked`: sem acesso operacional.

## TeamPolicy

Manter compatibilidade com os campos existentes:

- `modules`
- `limits`
- `radar`
- `sellerNetwork`
- `visibility`
- campos fisicos legados como `canRegisterHbxSellers`, `sellerReferralCommissionPercent`, `sellerDistributionDailyLimitOverride`

Adicionar payload unificado:

```ts
access: Record<string, boolean>
```

O payload dos endpoints deve expor:

- `accessCatalog`
- `accessPresets`
- `effectiveAccessMap`
- `missingBackendEnforcement[]`
- `modules`
- `limits`
- `radar`
- `sellerNetwork`
- `visibility`

## Gerencial frontend

Fortalecer a aba `Acessos`.

Grupos visiveis:

- Modulos
- Radar
- Vendas/CRM
- Comunicacao
- Comissao
- Rede/Indicacao
- Produtos
- Admin

Cada grupo deve mostrar:

- toggles de capacidade;
- badge quando `backendEnforced=false`;
- limite associado quando existir;
- preset aplicado;
- botao para aplicar preset.

Regra visual: nada que o vendedor ve/faz pode ficar fora dessa tela. Se ainda nao estiver conectado no backend, aparecer como pendente de enforcement.

## Enforcement minimo neste bloco

Conectar apenas o minimo necessario para o corte ficar coerente:

1. Vendedor `USER` nunca ve nao atribuidos por padrao.
2. Vendedor `USER` sempre puxa card atribuido a si mesmo quando tiver permissao de puxar.
3. Admin pode ver pool da empresa se tiver permissao.
4. Radar search so roda se `accessMap` permitir `radar.search.run` ou regra legada equivalente.
5. Gerencial so deixa editar politica se `team.access.manage` ou admin.
6. Comunicacao/e-mail pode ficar sem enforcement profundo, mas deve estar no catalogo com `backendEnforced=false`.

## Fora do escopo deste bloco

- Enforcement profundo de todas as keys.
- Reescrever autorizacao global.
- Migrar campos fisicos legados agora.
- Criar regra por slug/empresa.
- Mexer em pagamento, planos, checkout ou provider de pagamento.
- Mexer em `HbxCommissionSyncService` ou `HbxPresentationEmailService`.

## Testes obrigatorios

Backend:

1. Catalogo carrega todos os grupos.
2. Nenhuma key duplicada.
3. Preset `admin_full` libera admin.
4. Preset `seller_assigned_only` bloqueia Radar search e permite trabalhar cards proprios.
5. Preset `seller_radar_limited` permite puxar Radar, mas com `assignedUserId=self`.
6. `USER` sem `radar.search.run` nao inicia busca Radar.
7. `USER` sem `vendas.cards.viewCompany` nao ve cards de outros.
8. Admin com permissao ve nao atribuidos.
9. Nenhuma regra depende de slug `hbx`.

Grep runtime:

```powershell
rg -n -F -e "isHbxOperationSellerUser" -e "hbxSellerScope" -e "hbx_master" -e "master_operacional" -e "master_operational" -e "HBX_MASTER" -e "COMPANY_ADMIN" -e "vendedor HBX" -e "HBX Master" -e "Master Radar" backend/src frontend/src
```

Resultado esperado: zero ocorrencias runtime, exceto constante tecnica/infra ou docs historicos quando explicitamente justificado.

## Validacao

Executar:

```powershell
cd backend
npm run build
```

Executar testes unitarios relacionados a:

- team policy;
- access catalog/presets;
- Radar;
- Vendas.

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

## Resumo esperado ao finalizar

Informar:

- arquivos criados;
- catalogo criado;
- presets criados;
- endpoints alterados;
- tela alterada;
- enforcement conectado;
- enforcement pendente;
- resultado do grep final;
- comandos executados e falhas, se houver.

## Criterio de aceite

O bloco so deve ser considerado pronto quando:

- `backend/src/team/team-access-catalog.ts` existir e concentrar as capacidades.
- `backend/src/team/team-access-presets.ts` existir e gerar mapas coerentes.
- TeamPolicy retornar catalogo, presets e `effectiveAccessMap`.
- Gerencial exibir a aba `Acessos` por grupos.
- Radar/Vendas respeitarem pelo menos o enforcement minimo.
- Nao houver runtime novo tratando tenant/vendedor como HBX especial.
