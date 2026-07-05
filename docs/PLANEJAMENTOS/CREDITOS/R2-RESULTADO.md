# R2 — Módulo desacoplado de plano (kill-switch puro do master) — RESULTADO

> Executado LOCAL, direto no working tree (master). NÃO commitado, NÃO publicado, NÃO criou
> branch/worktree. Flag `HBX_MODULES_KILLSWITCH_ONLY` DEFAULT OFF — com a flag desligada,
> comportamento 100% preservado (regressão zero, provado por teste).

---

## O que foi feito

`resolveCompanyModuleAccessPolicy` (`backend/src/modules/module-access-policy.ts`) ganhou um
3º parâmetro **opcional** `moduleSnapshot?: KillSwitchModuleSnapshot`. A função continua **PURA**
(zero acesso a banco): quem chama já resolveu `SystemModule`/`CompanyModule` e injeta o snapshot.

- **Flag OFF (default) ou sem snapshot:** `moduleKeys` deriva exatamente como antes —
  `COMMERCIAL_PLAN_MODULE_KEYS[planKey]`. Nenhuma linha de código nova é exercida em prod até o
  dono ligar a flag.
- **Flag ON + snapshot presente:** `moduleKeys` vira união de todos os `SystemModule`
  `companyAssignable` com `defaultEnabled=true` (ou sem post-it na empresa) **menos** os
  explicitamente desligados via `CompanyModule.enabled=false` — e liga os que o master ligou
  explicitamente (`enabled=true`) mesmo com `defaultEnabled=false`. Não deriva mais do plano.
- Os estados bloqueados (`pending_checkout`, `overdue`, `subscription_inactive`,
  `platform_infra`) continuam retornando `moduleKeys` vazio **antes** de qualquer lógica de
  kill-switch — o gate de estado comercial (`resolveCompanyAccessState`) roda primeiro e nunca é
  substituído. Isso é o invariante duro do spec: inadimplência ≠ paywall de tier.

Novos exports em `module-access-policy.ts`:
- `KillSwitchModuleEntry` / `KillSwitchModuleSnapshot` — tipos do snapshot.
- `resolveKillSwitchModuleKeys(snapshot)` — helper puro que aplica a regra
  override > defaultEnabled sobre o snapshot.
- `isModulesKillSwitchOnlyEnabled()` — leitura da flag (mesmo padrão booleano de
  `isCreditsFeatureEnabled()` em `credits.flags.ts`).

### Resolvedor com-banco (`modules.service.ts`)

- `buildKillSwitchModuleSnapshot(companyId)` (privado): monta o snapshot lendo
  `prisma.systemModule.findMany` (`companyAssignable`, `defaultEnabled`, excluindo
  `RETIRED_MODULE_KEYS` — mesmo filtro já usado em `listCompanyAccessForAdmin`) +
  `prisma.companyModule.findMany({ where: { companyId } })` (mesma leitura do post-it já usada em
  `getCompanyModuleOverride`/`listMyModules`). Não duplica query nova — reusa os mesmos padrões.
- `resolveCompanyModulePolicyWithKillSwitch(company, companyId)` (privado): wrapper único.
  Com a flag OFF (ou sem `companyId`), chama `resolveCompanyModuleAccessPolicy(company)` sem 3º
  parâmetro — **nenhuma leitura extra ao banco**, idêntico ao comportamento pré-R2. Com a flag ON,
  busca o snapshot e injeta.
- Os 4 call-sites que chamavam `resolveCompanyModuleAccessPolicy(company)` direto
  (`canUserAccessModule`, `listMyModules`, `listCompanyAccessForAdmin`,
  `updateCompanyUserModuleAccess`) agora passam pelo wrapper.

### Flag documentada

`backend/.env.example`: `HBX_MODULES_KILLSWITCH_ONLY=false` com comentário explicando o efeito e a
dependência da Fase 1 (S1-S6 da carteira de créditos provados em prod antes de ligar).

## O que NÃO mudou (conforme regras duras do spec)

- `SystemModule.monthlyPrice` não foi tocado/removido (R5, via-única, fora de escopo).
- `commercial-usage-limits`/quotas, checkout/planos, `credits/**`, `financeiro/**`,
  `auth.service.ts`, mixins do radar — nada tocado.
- RBAC (`UserTeamPolicy`/`resolveCargoModuleAllowed`/`presentModuleBlockForRole`) intacto — o
  kill-switch decide só a camada 1 (disponibilidade), nunca substitui a camada 3 (RBAC).
- `getPlanModuleDefaults`/`PlanModuleConfig` (a "caixa do plano" viva) não foi alterado — ainda é
  usado pelos 2 call-sites que dependem de `accessPolicy.planKey` (não de `moduleKeys`), que
  continuam se comportando como antes independente da flag.

## Testes (node --test sobre dist)

`backend/src/modules/module-access-policy.test.ts`: **21/21 verdes** (14 testes pré-existentes +
7 novos do R2, zero mudança de expectativa nos antigos):

1. Flag OFF: snapshot passado é ignorado, `moduleKeys` idêntico ao cálculo atual (regressão zero).
2. Flag ON: empresa `active` sem plano nenhum enxerga módulos `defaultEnabled=true`.
3. Flag ON: master desliga módulo X via post-it (`enabled=false`) → X some; liga Y via post-it
   (`enabled=true` com `defaultEnabled=false`) → Y aparece; resto intacto.
4. Flag ON: `pending_checkout`/`overdue`/`suspended` continuam com `moduleKeys` vazio e os mesmos
   `blockedCode` de sempre — o kill-switch nunca é avaliado nesses estados.
5. Flag ON: bloqueio RBAC (`user_module_blocked`) passa intacto por `presentModuleBlockForRole`
   independente do kill-switch — camada 3 não é substituída pela camada 1.
6. `resolveKillSwitchModuleKeys` isolado: ignora `companyAssignable=false`, override sempre manda
   sobre `defaultEnabled` nos dois sentidos.

`backend/src/modules/company-access-state.test.ts`: 12/12 verdes (dependência não tocada, só
confirmação de que a base que o R2 consome continua íntegra).

## Build

`cd backend && npx tsc -p tsconfig.json --noEmit` — **zero erros** no meu escopo
(`modules/module-access-policy.ts`, `modules.service.ts`, `.test.ts`, `.env.example`).

Erros pré-existentes em `src/credits/credit-pack-config.service.test.ts` e, num momento anterior,
em `src/auth/*.test.ts` — **fora do meu escopo** (outros workers ativos em `credits/**`/`auth/**`
durante a execução, confirmado via `git status`/`git log` mostrando commits/mudanças concorrentes
nesses diretórios). `npm run build` completo (com emit) roda mesmo com esses erros
(`noEmitOnError` não está setado) — o `dist/modules/*.js` foi gerado e os testes rodaram sobre ele.

`npx prisma validate` — schema válido (não tocado).

## Desvio relevante (reportar pro Opus)

Durante a execução, o working tree de `backend/src/modules/module-access-policy.ts`,
`module-access-policy.test.ts`, `modules.service.ts` e `backend/.env.example` foi **revertido ao
estado pré-edição por um processo externo** (concorrente com `npm run publish`/outro worker
rodando `git reset --hard` ou equivalente — `HEAD` avançou para `d1f7109e` "S5 — receita da
recarga..." durante a tarefa, mas esse commit não toca meus arquivos; o mecanismo exato do reset
não foi identificado, só o efeito). Reapliquei todas as edições do zero e confirmei persistência
com `wc -l`/`grep` após cada edit antes de prosseguir. Recomendo ao dono confirmar que não há um
`git checkout -- backend/src/modules/` ou script de sincronização rodando em paralelo que possa
repetir esse comportamento com outros workers.

## Reuso confirmado (não duplicação)

- Query de `SystemModule` companyAssignable: mesmo filtro (`companyAssignable: true, key: { notIn:
  RETIRED_MODULE_KEYS }`) já usado em `listCompanyAccessForAdmin`/`updateCompanyUserModuleAccess`.
- Query de `CompanyModule` por empresa: mesmo padrão já usado em `listMyModules`
  (`prisma.companyModule.findMany({ where: { companyId } })`).
- Flag booleana: mesmo parser de `isCreditsFeatureEnabled()`
  (`['true','1','yes','on'].includes(...)`).
