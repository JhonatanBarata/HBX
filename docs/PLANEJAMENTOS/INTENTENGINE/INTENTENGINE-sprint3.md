# INTENTENGINE — Sprint 3: BotConfig versionada (sair da tabela emprestada)

> Plano auto-contido. Editar código = subagente Sonnet (1 por .md); Opus planeja.
> Independe dos Sprints 1-2 (pode rodar em paralelo). Retorno: rollback de config em
> segundos = menos chamado de suporte quando cliente quebra o próprio bot.

## Objetivo
Config do bot em tabela própria, versionada e auditada. Hoje é JSON serializado dentro de
`HbxRecoveryFlowStage` (tabela do recovery reaproveitada como chave-valor): sem histórico,
sem quem-mudou-o-quê, sem rollback, e `findFirst orderBy updatedAt desc` torcendo pra não
haver linha duplicada.

## ESTADO ATUAL (verificado 01/07/2026)
Canais mágicos em `HbxRecoveryFlowStage` (channel/title → template = JSON):
- `__ATENDIMENTO_BOT_CONFIG__` / `config_v1` — config do bot de atendimento.
- `__ATENDIMENTO_AGENDA_CONFIG__` / `config_v1` — agenda.
- `__BOT_MASTER_SWITCH__` / `v1` — chave geral (bot-activation.service.ts ~119).
- `__HBX_RECOVERY_BOT_CONFIG__` / `config_v1` — bot do recovery.
Padrão `getConfigRow`/`saveConfigRow` DUPLICADO em 3 lugares:
- `backend/src/bot/bot-activation.service.ts` ~51-80
- `backend/src/inbox/inbox.service.ts` (CRUD do bot-config/agenda do painel)
- `backend/src/messaging/messaging.service.ts` (`getAtendimentoBotConfig`, `getAtendimentoAgendaConfig`)

## O QUE FAZER (em ordem)
1. Migration Prisma: tabela `BotConfig`
   (`id, companyId, domain, version int, payload Text, updatedByUserId?, createdAt`).
   Única por `(companyId, domain, version)`; leitura = maior version. Domains:
   `atendimento_bot | atendimento_agenda | bot_master_switch | recovery_bot`.
   Escrita = INSERT de nova versão (nunca update) → histórico de graça.
2. Criar `backend/src/bot/config/bot-config-store.service.ts` (módulo leaf):
   `get(companyId, domain)`, `save(companyId, domain, payload, userId)`,
   `rollback(companyId, domain)` (regrava a versão anterior como nova versão).
   DUAL-READ dentro do store: tenta `BotConfig`; se não existir, lê o canal mágico legado
   (mesma lógica de hoje) — migração lazy: primeira escrita nova já cai na tabela nova.
3. Trocar os 3 consumidores para o store (bot-activation, inbox, messaging). Normalizadores
   (`normalizeAtendimentoBotConfig` etc.) NÃO mudam — só a origem do JSON.
4. Backfill script (uma vez): copiar canais mágicos existentes → `BotConfig` version 1.
   NÃO deletar as linhas legadas neste sprint (ficam como fallback morto por 1 release).
5. Endpoint mínimo de rollback no painel master (rota admin/master existente do inbox ou
   command center): lista versões (data + quem) e volta 1 versão. Sem UI elaborada — botão.

## GUARDRAILS
- Comportamento de leitura 1:1: mesmo JSON, mesmos defaults dos normalizadores.
- Migration no VPS: conferir aplicação no publish (pendência conhecida de migrations).
- NÃO tocar nos fluxos de envio/bot — sprint é só armazenamento de config.
- O dono edita config em produção pelo painel enquanto isso roda → dual-read/dual-write
  precisa ser à prova de corrida: escrita SEMPRE na tabela nova a partir do deploy.

## PRONTO QUANDO
- tsc estrito 0 erros; testes verdes (inbox.service.test.ts cobre bot-config CRUD).
- Painel salva e lê config normalmente; `BotConfig` acumulando versões com autor.
- Rollback testado em dev: quebra proposital do menu → volta 1 versão → bot íntegro.
- Zero leitura nova dos canais mágicos após backfill (log de fallback no store pra medir).
