# S04 — Módulo `automation` + GET /automation/overview

**Fase 1 · Worker: Sonnet · Depende de: S03 (CONTRATO.md) · Aditivo puro**

## Objetivo
Nascer o módulo backend `automation` com o primeiro endpoint REAL: o agregador de status que o
painel único (S12) vai consumir. Nada é migrado ainda — o overview LÊ os motores atuais.

## Arquivos
- CRIAR `backend/src/automation/automation.module.ts`
- CRIAR `backend/src/automation/automation.controller.ts`
- CRIAR `backend/src/automation/automation-overview.service.ts`
- CRIAR `backend/src/automation/automation-overview.service.test.ts`
- EDITAR `backend/src/app.module.ts` (registrar módulo)
- EDITAR `backend/package.json` (incluir o novo test no `test:automation`)

## Tarefas
1. `GET /automation/overview` (shape exato no CONTRATO.md) agregando, por empresa autenticada:
   - `atendente`: existe AssistenteConfig? published? existe BotConfig atendimento? bot armado
     (`bot-activation`)? tipo live? preflight (chip conectado, config completa)?
   - `cobranca`: BotConfig recovery + estado live/preflight do tipo recovery.
   - `prospeccao`: resumo do live-status do vendas-automation (REUSAR o service existente — injetar
     e chamar, não copiar lógica).
   - `regras`: contagens de cadências/gatilhos/rotinas ativas (reusar services de `cadencia/`).
   - `motor`: flags relevantes (`runnerEnabled` da cadência, `publishEnabled` do assistente) e
     identidade do chip (conectado ou não — mesma fonte que o preflight do bot usa hoje).
2. Guard de acesso: mesmo padrão dos controllers atuais (JWT + tenant). O overview responde se a
   empresa tem módulo `bot` OU `vendas` (decisão nº2 do README) — usar o mecanismo de módulo
   existente; se precisar de OR, implementar no controller (checar os dois), não inventar guard novo.
3. Cada sub-bloco do overview é fail-soft: motor indisponível → bloco `{ok:false}` sem derrubar o
   endpoint (o painel mostra "indisponível", nunca 500).
4. Teste unit do service com mocks dos services fonte (padrão node:test da casa).

## Critérios de aceite
- `npm run build` + `npm run test:automation` verdes.
- ZERO alteração de comportamento nos motores existentes (só leitura/injeção).
- Overview devolve os 5 blocos com dados reais dos services atuais.

## Proibições
- Não duplicar lógica de status (injetar services existentes; se um método for privado, expor
  método público de leitura NO service dono, mínimo e read-only).

## DoD
Commit local: `feat(automation): S04 — módulo automation + overview agregado`
