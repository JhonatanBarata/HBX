# HBX Recovery — Sprint 5: wa-templates (módulo compartilhado)

> Arquitetura nº14. Independente dos Sprints 3-4 (pode rodar em paralelo por outro subagente).
> Executor: subagente Sonnet.

## Problema
~1.700 linhas do `hbx-recovery.service.ts` (faixa ~953-2970) são ciclo de vida de template
WhatsApp Cloud: sync com Graph API, criação/deleção, Upload API de mídia, persistência de
arquivo em disco, URLs versionadas. Servem TAMBÉM o módulo atendimento (moduleKey
`atendimento`) — atendimento depende do service do Recovery pra gerenciar template.
Armazenamento: UM blob JSON por empresa/módulo (templates + histórico + `headerMediaBase64`
de mídia pendente DENTRO do blob) em linha-sentinela da `HbxRecoveryFlowStage`
(channel `HBX_RECOVERY_META_TEMPLATES`).

## Solução
1. **Novo módulo** `backend/src/wa-templates/`: `wa-templates.service.ts` (lógica movida),
   `wa-templates.module.ts`. Sem controller próprio no v1 — os controllers atuais
   (`/hbx-recovery/meta-templates/*` e o público de mídia) continuam existindo e DELEGAM,
   zero mudança de rota pro frontend.
2. **Tabelas reais** (migration):
   - `WhatsAppTemplate { id, companyId, moduleKey, name, language, category, status,
     qualityScore?, rejectedReason?, headerFormat?, headerText?, bodyText, footerText?,
     buttonsJson, variableKeysJson, componentsJson, hbxActive, lastMetaSyncAt?,
     @@unique([companyId, moduleKey, name, language]) }`
   - `WhatsAppTemplateHistory { id, templateId, previousStatus?, nextStatus, reason?, changedAt }`
     (manter limite de 250 por template via poda no service).
   - `WhatsAppTemplateMedia { id, companyId, templateId?, fileName, contentType, storagePath,
     versionToken, pending Boolean, createdAt }` — **base64 sai do blob**; arquivo continua em
     disco do VPS (single-host hoje, aceitável), mas REFERENCIADO por tabela. `storagePath`
     relativo ao upload dir pra sobreviver a mudança de base pública.
3. **Migração de dados** (script chamado uma vez, idempotente): parsear os registries JSON
   existentes (títulos `meta_templates_registry` e `meta_templates_registry_atendimento`) →
   inserir nas tabelas; gravar base64 pendente como arquivo + linha em Media. NÃO deletar as
   linhas-sentinela ainda (rollback barato); marcar migrado. Deleção definitiva no Sprint 6.
4. **Leitura dual-read por 1 release:** service lê tabela nova; se vazia e sentinela existe,
   migra on-the-fly e loga.
5. `hbx-recovery.service.ts` perde a faixa toda e injeta `WaTemplatesService` com
   `moduleKey: 'hbx_recovery'`; consumidores do atendimento trocam para o novo service.

## Critérios de aceite
- [ ] Painel de templates do Recovery e do Atendimento funcionam idênticos (listar, sync,
      criar, deletar, ativar, upload de mídia) — testar no chrome, localhost/3001.
- [ ] Rota pública de mídia continua servindo os MESMOS bytes/URLs já publicados (cache
      immutable de 1 ano em URLs antigas — a URL versionada antiga precisa continuar resolvendo).
- [ ] `hbx-recovery.service.ts` abaixo de ~2.800 linhas após a extração.
- [ ] `npx tsc --noEmit` verde; testes do módulo verdes; migration aplicada local.

## Guardrails
- NÃO renomear template na Meta nem re-submeter nada à Meta durante a migração — é só
  movimentação interna de dados.
- Upload dir (`getBackendPublicUploadDir`) não muda de lugar neste sprint.
