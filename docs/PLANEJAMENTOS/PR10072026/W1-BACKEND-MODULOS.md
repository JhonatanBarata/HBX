# W1 — Backend módulos: teto do master × uso do admin + limpeza

Leia `CONTRATOS.md` (mesma pasta) antes. Só backend. Arquivos-alvo: `backend/prisma/schema.prisma`, `backend/src/modules/*`, `backend/src/users/users.service.ts` (saveCompanyModuleCategories), `backend/src/auth/profile.controller.ts`, `backend/src/logistica/logistica.controller.ts` (só decorators de gate).

## 1. Migration `master_enabled`
- `CompanyModule.masterEnabled Boolean @default(true)` + migration SQL com backfill `true` (default já cobre). Nome: `add_company_module_master_enabled`.
- Rodar `npx prisma migrate dev` local (se o banco local não estiver de pé, gerar a migration com `--create-only` e validar o SQL) + `npx prisma generate`.

## 2. Efetivo = masterEnabled && enabled (helper único)
- Criar helper único (ex. em `module-access-policy.ts`) `effectiveCompanyModuleEnabled(row) = row.masterEnabled && row.enabled` e usar em TODOS os pontos que hoje leem `enabled` como override: `getCompanyModuleOverride`, `resolveKillSwitchModuleKeys`, `canUserAccessModule`, `listMyModules`, `getSellerCargoAccessForAdmin` (companyHas), validação de delegação descendente (`updateCompanyUserModuleAccess`), e qualquer `companyModule.findMany({ where: { enabled: true } })` — grep por `enabled: true` no contexto companyModule e converter.

## 3. Master escreve o TETO
- `setCompanyModuleByMaster`: upsert passa a gravar `masterEnabled` (não mais `enabled`). Auditoria MODULE_TOGGLED mantém previous/current (agora do teto).
- Listagem de módulos da ficha da empresa no /master (achar o endpoint que a `janela-empresas.tsx` consome): expor `masterEnabled`, `companyEnabled` (=enabled) e `effective` por módulo, mantendo compat com o shape atual (campo `enabled` existente da resposta passa a ser o `effective`… NÃO: manter `enabled` = masterEnabled para o toggle do master continuar refletindo o que ele controla, e adicionar `companyEnabled`/`effective` como campos novos).

## 4. OOBE/categorias com teto + auditoria + options
- `saveCompanyModuleCategories`: nunca setar `enabled=true` em módulo com `masterEnabled=false` (skip; coletar `skipped[]` no retorno); pode continuar setando `enabled=false`. Registrar auditoria (mesmo mecanismo do MODULE_TOGGLED; se o mecanismo for master-only, criar evento análogo com ator do tenant — seguir padrão existente de auditoria no repo).
- Novo **GET `/profile/module-categories/options`** conforme contrato (mesmo gate de dono do POST). Implementar cálculo enabled/locked por categoria a partir de `MODULE_CATEGORY_MAP` + snapshot SystemModule/CompanyModule.

## 5. Gate de rota da logística (kill-switch de verdade)
- Introduzir `COMPANY_LEVEL_MODULE_KEYS = ['logistica']` na policy: para essas chaves, `canUserAccessModule` checa SÓ a camada empresa (pula molho de cargo/per-usuário — o entregador USER não pode quebrar).
- `@ModuleAccess('logistica')` + `ModuleAccessGuard` no `LogisticaController` (classe inteira). Atenção: master bypassa (ok); empresa com módulo OFF → 403 (comportamento desejado de kill-switch).

## 6. Suspensão não apaga post-its
- Nos 5 pontos com `companyModule.updateMany({ enabled: false })` em massa (modules.service ~4154, 4201, 4489, 4981, 5080): confirmar 1 a 1 que a policy (`module-access-policy` — blocked/pending_checkout/overdue → moduleKeys vazio) e `canUserAccessModule` já negam acesso nesses estados; onde for redundante, REMOVER o updateMany (preserva estado p/ reativação). Se algum ponto não estiver coberto pela policy, manter e anotar em `pendencias`.

## 7. Limpeza (sujeira da auditoria)
- Remover `ensureTrialBundleForCompany` + `TRIAL_BUNDLED_MODULE_KEYS` e chamadas (trial aposentado no S7). Ajustar testes que referenciem.
- Remover a injeção da chave morta `'whatsapp'` em knownModuleKeys (modules.service ~2393).

## Checks obrigatórios
- `cd backend && npx tsc --noEmit` (ou o script de typecheck do package.json).
- Testes: `module-access-policy.test.ts`, `modules.controller.retired-plan-endpoints.test.ts`, `credits.service.test.ts`, `auth.service.test.ts` e qualquer teste que quebrar por causa do rename — rodar via jest por caminho. Atualizar os que assumem 1 coluna.
- NÃO commitar. Retornar JSON: `{status, filesTouched[], migration, checks:{typecheck, testes}, skippedOuPendencias[], notas[]}`.
