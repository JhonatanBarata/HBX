# S20 — Backend: endpoints/flags órfãos + DDL destrutivo condicionado ⚠

**Fase 4 · Worker: Sonnet · Depende de: S10 em prod-local validado, S17-S19, INVENTARIO.md · Revisão adversarial: SIM**

## Objetivo
Fechar a fusão no backend: aposentar superfícies que só as telas mortas usavam, consolidar flags,
e — SÓ onde o inventário (S02) provou zero uso — DDL destrutivo. Regra de ouro: **na dúvida, não dropa**.

## Tarefas
1. **Endpoints**: para cada um, decidir pelo INVENTARIO.md (item 3 — referências fora das telas):
   - `GET/PATCH /inbox/bot-config`, `/hbx-recovery/bot-config`, `/assistente*`: SE mobile casca/APK/
     tutorial não usam → remover controller+DTO; SE usam → manter e marcar `@deprecated` no código.
   - `/bot/activation` FICA (S05/S14 usam por baixo). `/cadencia*` FICA (S15/S16 usam).
2. **Flags → família `HBX_AUTOMATION_*`** (mapa do CONTRATO.md):
   - `HBX_ASSISTENTE_PUBLISH_ENABLED` → `HBX_AUTOMATION_IA_LIVE` (runtime lê a NOVA e faz fallback
     pra velha com warn de deprecado — a velha só morre de vez num publish futuro).
   - `HBX_CADENCIA_RUNNER_ENABLED` → `HBX_AUTOMATION_RUNNER_ENABLED` (mesmo padrão fallback).
   - `HBX_AUTOMATION_AGENT` (S10): passa a default ON **em código** (constante), com kill-switch
     `HBX_AUTOMATION_AGENT=0` — a fusão vira o caminho principal.
   - Documentar as 3 no relatório p/ o dono injetar no VPS (o worker NÃO mexe em env do VPS).
3. **DDL destrutivo condicionado** (cada um SÓ se INVENTARIO.md = LIVRE PRA DEMOLIR e S10 validado):
   - `AssistenteConfig` → dados já no AutomationAgent (backfill S09): DROP.
   - `BotConfig domain='atendimento'` → absorvido no roteiroJson: DELETE das linhas do domain
     (tabela FICA — recovery continua nela até frente própria).
   - Antes do DROP: `pg_dump` seletivo SÓ das tabelas-alvo → `Desktop\Backup 20-07 alteracaomotor\db\`
     (comando no relatório; NUNCA dumpar `cnpj_public*`). O dump é gerado no VPS no dia do publish —
     nesta sprint, escrever o script `backend/scripts/automation-pre-drop-dump.sh` e a migration
     fica em pasta `migrations-hold/` FORA de `prisma/migrations/` (o orquestrador move pra valer
     só no publish final, depois do dump — DDL destrutivo nunca entra no auto-deploy sem o dump).
4. Limpeza de código: referências mortas a AssistenteConfig no runtime (pós S10 flag-on default),
   `TYPE_ENDPOINT` e afins que só existiam pro front velho.
5. Build + TODOS os testes (`test:automation` + suites de assistente/cadencia que sobreviverem —
   testes de código removido são removidos junto) + `npm run typecheck` estrito se existir no backend.

## Critérios de aceite
- Zero endpoint/flag/tabela removido SEM prova de inventário; migration destrutiva em hold, não em
  `prisma/migrations/`; fallback de flags funcionando; build+testes verdes.

## Proibições
- NÃO aplicar DDL destrutivo em banco nenhum nesta sprint. NÃO tocar env do VPS.
- `Cadencia*` e `ConversationAssistantRun` NÃO se dropam (vivos no motor novo).

## DoD
Commit local: `refactor(automation): S20 — aposentadoria de endpoints/flags legados + DDL em hold`
