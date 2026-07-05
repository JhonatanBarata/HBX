# 02 — Assistente: env própria de modelo/timeout — RESULTADO

## O que foi feito
Em `backend/src/assistente/assistente-sandbox.service.ts`:
- Novas funções `assistenteModel()` e `assistenteTimeoutMs()` compondo a cadeia de
  fallback explicitamente (sem mudar a semântica de "env vazia = fallback" dos
  helpers `envStr`/`envInt` já existentes):
  - Modelo: `HBX_ASSISTENTE_MODEL` → `HBX_LLM_CLASSIFIER_MODEL` → `'qwen2.5:7b'`.
  - Timeout: `HBX_ASSISTENTE_TIMEOUT_MS` → `HBX_LLM_CLASSIFIER_TIMEOUT_MS` → `12000`.
- Os 3 pontos que liam `HBX_LLM_CLASSIFIER_MODEL`/`HBX_LLM_CLASSIFIER_TIMEOUT_MS`
  direto (linhas ~84/160/161 do arquivo original, dentro de `reply()` e
  `defaultOllamaChat()`) passaram a usar as novas funções.
- URL (`HBX_LLM_CLASSIFIER_URL`) e flag liga/desliga (`HBX_LLM_CLASSIFIER_ENABLED`)
  **continuam compartilhadas** — não duplicadas, conforme pedido (1 Ollama só, 1
  ambiente de IA só).
- Grep de `HBX_LLM_CLASSIFIER` em `backend/src/assistente/` confirmou que só
  `assistente-sandbox.service.ts` referenciava essas envs — `assistente-flow.ts`,
  `assistente.module.ts`, `assistente.service.ts` e `assistente.controller.ts` não
  tocam nisso. Os pontos do bot (`backend/src/bot/intent/intent-engine.service.ts`
  e `ai-intent-classifier.service.ts`) **não foram alterados** — seguem só na env
  do classificador.
- Comentário de cabeçalho do arquivo atualizado para explicar a env própria.

## Testes
Em `backend/src/assistente/assistente-sandbox.service.test.ts`, 4 testes novos
(env sempre pinada no teste via helper `withEnv`, com restauração no `finally` —
não depende de `.env` no host/worktree):
1. `HBX_ASSISTENTE_MODEL` setada → sandbox usa o modelo próprio (mesmo com
   `HBX_LLM_CLASSIFIER_MODEL` setada também).
2. Sem `HBX_ASSISTENTE_MODEL` → cai na env do classificador do bot.
3. Sem nenhuma env setada → cai no default `qwen2.5:7b` (prova o "comportamento
   idêntico ao atual").
4. `HBX_ASSISTENTE_TIMEOUT_MS`/`HBX_ASSISTENTE_MODEL` setadas → `defaultOllamaChat`
   (o caminho que faz o `fetch` real ao Ollama) usa o model próprio; `fetch` é
   mockado (sem rede real), seguindo o mesmo padrão já usado em
   `intent-engine.service.test.ts`.

## Checks
- `cd backend && npm run build` — verde (typecheck OK, sem erros).
- `node --test dist/assistente/assistente-sandbox.service.test.js
  dist/assistente/assistente-flow.test.js` — **13/13 passando** (9 pré-existentes
  + 4 novos).
- `node --test dist/bot/intent/intent-engine.service.test.js` — **9/9 passando**,
  confirmando que o bot não foi afetado.

## Arquivos alterados
- `backend/src/assistente/assistente-sandbox.service.ts`
- `backend/src/assistente/assistente-sandbox.service.test.ts`

## Explicação simples (pro dono, sem jargão)
Hoje o "cérebro" do bot do WhatsApp e o "cérebro" do Assistente (o chat de teste
do painel) usam a mesma configuração de modelo de IA e de tempo-limite — mudar um
mudava o outro junto. Agora cada um tem a própria configuração: se você não mexer
em nada, os dois continuam funcionando exatamente como hoje (nenhuma mudança de
comportamento). Mas quando o teste do Assistente (que ainda vai rodar) apontar um
modelo diferente do que ganhou pro bot, dá pra configurar só o Assistente, sem
mexer no bot e sem precisar programar nada — só ajustar a variável de ambiente na
VPS.
