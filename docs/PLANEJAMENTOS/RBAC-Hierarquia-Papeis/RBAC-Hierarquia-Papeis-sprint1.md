# RBAC / Hierarquia de Papéis — Sprint 1
## Fazer o toggle do catálogo VALER: enforcement das 27 chaves `backendEnforced:false`

> Arquitetura nº5. Ordem do dono (01/07/2026): plano autorizado explicitamente — mexe em
> autorização, área da lista de segurança do CLAUDE.md, coberta por esta ordem.
> Executor: 1 subagente por sprint. Este arquivo some ao concluir.

## Contexto verificado (não confiar em resumo — os paths são a verdade)

- Catálogo: `backend/src/team/team-access-catalog.ts` — **76 chaves**, **27 com
  `backendEnforced: false`**, **6 críticas**: `team.users.create/edit/disable/delete`,
  `radar.cards.distribute`, `radar.distribution.manage`.
- O sistema já declara o buraco: `listMissingBackendEnforcement()` no mesmo arquivo.
- Enforcement existente (usar como padrão): `assertEffectiveTeamAccess` /
  `resolveEffectiveTeamAccess` em `backend/src/team/team-access-runtime.ts`; exemplo vivo
  de uso: `assertSellerTeamPolicyAccess(user, 'radar.cards.pull', ...)` em
  `backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts:2010`.

**O risco REAL (auditado, não o exagerado):** os endpoints críticos TÊM check de role
inline (ex.: `radar-core-delivery.mixin.ts:3607` — "Apenas ADMIN pode distribuir"). Ou seja,
vendedor NÃO escala nos críticos. O buraco é de **governança interna**:
1. **Gerente é `role=ADMIN`** (só `canViewBilling=false`) → passa todos os checks
   `role==='ADMIN'`. Se o Dono desligar `radar.cards.distribute` ou `team.users.create`
   pro Gerente no Gerencial, **nada bloqueia** — o toggle é decorativo.
2. Chaves alcançáveis por vendedor sem enforcement (`radar.filters.*`,
   `communication.whatsapp.useCompanyNumber`, `radar.cards.assignToOthers`,
   `vendas.cards.transfer`) → vendedor ignora a política via API direta.

## Por quê primeiro ($)

`commission.editPercent`/`editDueDays`/`inheritance.configure` sem enforcement = percentual
de comissão configurável fora da regra do Dono → dinheiro saindo errado. `team.users.*` =
Gerente pode criar/editar/desativar acesso mesmo proibido. É a distância mais curta entre
bug e prejuízo em R$.

## Escopo

Para CADA uma das 27 chaves abaixo, nesta ordem:
1. Mapear o(s) endpoint(s)/service(s) que executam a ação (grep pela ação, não pela chave).
2. Inserir o assert no **service** (nunca só no controller):
   `await assertEffectiveTeamAccess(this.prisma, user, '<chave>', '<msg>')` — ou somar a
   chave ao contexto já resolvido quando o service já chama `resolveEffectiveTeamAccess`
   (não duplicar query).
3. Semântica: `false` explícito na política bloqueia **inclusive ADMIN/Gerente** (master
   nunca é bloqueado). Default segue `defaultForAdmin`/`defaultForSeller` do catálogo.
4. Virar `backendEnforced: true` no catálogo (na MESMA mudança do assert, nunca antes).
5. Teste direcionado: papel com chave `false` → 403; com default → passa.

**Ordem de ataque:**
- Lote A (críticas, 6): `team.users.create`, `team.users.edit`, `team.users.disable`,
  `team.users.delete` (endpoints em `users.controller.ts` / `gerencial.controller.ts`),
  `radar.cards.distribute` (`webscraping.controller.ts:994` →
  `distributeRadarLeadsToVendedoresForUser`), `radar.distribution.manage`
  (`radar-core-distribution.mixin.ts:464/504/996`).
- Lote B (dinheiro, 6): `commission.editPercent`, `commission.editDueDays`,
  `commission.inheritance.configure`, `commission.viewInherited`,
  `sellerNetwork.approveReferrals`, `sellerNetwork.receiveInheritedCommission`.
- Lote C (operacional, 15): `radar.cards.assignToOthers`, `radar.filters.useSegments`,
  `radar.filters.useCities`, `radar.filters.useStates`, `radar.enrichment.auto`,
  `vendas.cards.transfer`, `vendas.complaints.view`,
  `communication.whatsapp.useCompanyNumber`, `communication.support.contactAdmin`,
  `sellerNetwork.recruitSellers`, `sellerNetwork.viewReferrals`,
  `seller.documents.request`, `seller.documents.store`, `team.access.applyPreset`,
  `team.access.viewAudit`.

**Trava anti-regressão (entra JUNTO com o Lote A):** teste em
`team-access-catalog.test.ts` (criar) que falha se existir chave com
`backendEnforced: false` fora de uma allowlist `ENFORCEMENT_DEBT` explícita no teste.
A allowlist nasce com Lotes B+C e SÓ diminui — chave nova nasce enforced ou não entra.

## Fora de escopo
- Guard global / @Public (sprint 2). PermissionsGuard (sprint 4). Redactor (sprint 5).
- NÃO mexer em master-context, sessão única, JwtStrategy.
- NÃO criar migration (política persistida já existe; se um lote exigir schema, PARAR e
  reportar ao dono).

## Riscos e guardrails
- Falso-bloqueio de admin legítimo: política persistida antiga com `false` acidental.
  Antes de cada lote, rodar em localhost (`npm run up`, chrome, :3001, credenciais em
  `.test-login.local.md`) com os 4 papéis. Se achar política suja, reportar antes de publicar.
- Alguns fluxos chamam service-a-service (distribuição automática por cron) — o assert é
  sobre o USUÁRIO; caminhos de sistema (sem user) não passam pelo assert. Não quebrar cron.

## Aceite
- 27 chaves com `backendEnforced: true` (ou na allowlist do teste, que só encolhe).
- Teste-trava verde e vermelho quando se adiciona chave nova sem enforcement (provar os 2).
- Gerente com chave `false` recebe 403 nos 6 endpoints críticos (teste manual nos 4 papéis).

## Checks
- `cd backend && npm run typecheck` (se existir) e `npm run build`
- Testes direcionados: `team-policy.service.test.ts`, `team-access-runtime.test.ts` + novos
- Smoke manual localhost:3001 (chrome) com os 4 papéis
