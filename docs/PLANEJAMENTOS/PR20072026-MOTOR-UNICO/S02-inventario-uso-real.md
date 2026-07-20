# S02 — Inventário de uso real (banco VPS + flags)

**Fase 0 · Worker: Sonnet · Depende de: nada (paralelo a S01) · Somente LEITURA**

## Objetivo
Decidir demolição com DADO, não com achismo. A S20 (DDL destrutivo) só executa o que este
inventário provar sem uso. Dono já autorizou acesso ao VPS (ler) — não pedir autorização.

## Ferramentas
- `node scripts/vps-run.js "<comando>"` para rodar comando no VPS (ver exemplos em `docs/Rules/INFRA.md`).
- Banco do app roda em container Postgres no VPS; descobrir o nome com `docker ps` e usar
  `docker exec <pg> psql -U <user> -d <db> -c "SQL"`. Credenciais no `.env` do compose na VPS.

## Tarefas
1. Contagens por tabela (total e por companyId) — gravar TUDO no relatório:
   - `AssistenteConfig` (quantos, quantos `published=true`)
   - `ConversationAssistantRun` (total, últimos 30 dias, por status)
   - `BotConfig` por `domain` (atendimento/recovery/etc.), maior `version` por empresa
   - `Cadencia` (total, `ativa`, `isSeed`), `CadenciaInscricao` (por status), `CadenciaGatilho` (`fireCount>0`?), `CadenciaRotina` (`lastRunAt` não-nulo?)
   - `Company.botArmedAt` não-nulo (quais empresas têm bot armado)
2. Flags no VPS (`.env` do backend + compose): valor atual de `HBX_ASSISTENTE_PUBLISH_ENABLED`,
   `HBX_CADENCIA_RUNNER_ENABLED`, `HBX_CADENCIA_TICK_MS`, qualquer `HBX_VENDAS_AUTOMATION*`,
   e TODA flag que comece com `HBX_` citando bot/assistente/cadencia. Não alterar nada.
3. Endpoints legados em uso: grep no repo por consumidores de `/inbox/bot-config`,
   `/hbx-recovery/bot-config`, `/assistente`, `/cadencia` FORA das 3 telas (mobile casca,
   APK `app.js`, tutorial, testes) — listar cada referência encontrada.
4. Uso vivo: `docker logs` do backend (últimas 48h) — grep por `conversation_assistant`,
   `cadencia`, `atendimento` p/ ver o que de fato roda em prod.

## Saída
CRIAR `docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/INVENTARIO.md` com:
- Tabela de contagens; lista de empresas com automação viva (id + o quê).
- Flags e valores atuais no VPS.
- Referências legadas fora das 3 telas (com arquivo:linha).
- Veredito por item descartável do README: **LIVRE PRA DEMOLIR** / **EM USO — migrar antes** / **INCERTO**.

## Critérios de aceite
- INVENTARIO.md completo, com os comandos usados (reproduzível).
- ZERO escrita no VPS/banco (somente SELECT/READ).

## DoD
Commit local: `docs(automation): S02 — inventário de uso real dos motores`
