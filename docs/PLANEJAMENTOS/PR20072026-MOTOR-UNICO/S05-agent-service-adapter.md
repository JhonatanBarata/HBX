# S05 — AgentService: config unificada do Atendente (adapter)

**Fase 1 · Worker: Sonnet · Depende de: S04 · Aditivo (adapter, sem schema novo)**

## Objetivo
UM contrato de leitura/escrita para o Atendente — hoje partido em dois mundos:
`AssistenteConfig` (IA: nome/tom/perfil/fluxoJson/published) e `BotConfig domain=atendimento`
(roteiro: welcomeMessage/botões/regras, versionado via `bot-config-store.service`).
O front novo (S13) fala SÓ com este contrato. Schema novo é na S09 — aqui é ADAPTER sobre os
stores atuais, para o corte de tela não esperar migration.

## Arquivos
- CRIAR `backend/src/automation/agent.service.ts`
- CRIAR `backend/src/automation/agent.service.test.ts`
- CRIAR `backend/src/automation/dto/agent.dto.ts`
- EDITAR `backend/src/automation/automation.controller.ts` (rotas do agente)
- EDITAR `backend/package.json` (test)

## Tarefas
1. Tipos (do CONTRATO.md): `AgentBrain = 'roteiro' | 'ia'`. `AgentView = { brain, identidade
   {nome, tom, perfil, produtos, empresaNome}, roteiro (shape BotConfig atendimento), fluxo (shape
   assistente), published, armed, preflight }`.
2. `GET /automation/agent` → monta `AgentView`: lê AssistenteConfig + BotConfig(atendimento) +
   activation. Regra de `brain` atual (sem schema novo): AssistenteConfig `published=true` → `'ia'`;
   senão, se só existe BotConfig → `'roteiro'`; se existem os dois sem publish → `'ia'` como
   preferido se AssistenteConfig existe, senão `'roteiro'`. Documentar a regra no código.
3. `PUT /automation/agent` → grava no store CERTO conforme o campo: identidade/fluxo →
   `assistente.service` (reusar validação/sanitização `sanitizeAssistenteConfig`); roteiro →
   `bot-config-store` do atendimento (reusar validação atual do PATCH `/inbox/bot-config`).
   NUNCA gravar direto no prisma por fora dos services donos.
4. `POST /automation/agent/publish {brain, on}`: brain `'ia'` → mesmo caminho do
   `/assistente/publish`; brain `'roteiro'` → mesmo caminho do `PUT /bot/activation`
   (type atendimento). Reusar services, preservando gates (pino armado, Termos são do front).
5. `POST /automation/agent/sandbox` → delega pro `assistente-sandbox.service` atual (brain 'ia').
   Para brain `'roteiro'`, implementar replay determinístico BACKEND da config (welcome → menu →
   botão → pós-ação), sem IA e sem WhatsApp — substitui o chat fake do front velho.
6. Endpoints legados (`/assistente`, `/inbox/bot-config`) continuam funcionando INTACTOS.

## Critérios de aceite
- Build + testes verdes (casos: view monta dos 2 stores; PUT roteia pro store certo; publish
  respeita pino; sandbox roteiro responde sem rede).
- Nenhuma tela atual quebra (nada dos endpoints velhos mudou).

## DoD
Commit local: `feat(automation): S05 — AgentService adapter (roteiro+ia) com sandbox unificado`
