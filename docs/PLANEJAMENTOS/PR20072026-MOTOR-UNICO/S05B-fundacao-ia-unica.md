# S05B — Fundação de IA única (base Concierge)

**Fase 1 · Worker: Sonnet · Depende de: S05 · Pedido do dono 20/07: "usar o concierge como o IA"**

## Objetivo
Hoje existem **3 clientes Ollama quase idênticos** falando com o MESMO Ollama local (`:11434`,
mesma flag `HBX_LLM_CLASSIFIER_ENABLED`, mesma URL, mesmo governor `AiGatewayService`):
`ai-intent-classifier` (classificador do bot), `assistente-ollama.ts` e `concierge-ollama.ts` —
cada frente criou o seu. Unificar na fundação mais MADURA (a do Concierge: bench 86/100, injeção
10/10, guardas, fallback determinístico) e pendurar todos nela.

## Regra de ouro (separação de CONTEXTO, não de motor)
- **Motor/hardening ÚNICO**: 1 cliente Ollama, guardas anti-injeção do concierge para TODOS.
- **Contexto ISOLADO por papel**: o cérebro que fala com o CLIENTE FINAL (Atendente) recebe SÓ
  a config do agent (nome/tom/produtos/fluxo/few-shots) — NUNCA ferramentas/dados internos do
  Concierge (lead cockpit, slots, dados de sistema). Cliente final é input HOSTIL; vazamento de
  dado interno (e LEI DO VENDEDOR) é o risco nº1 desta sprint.
- O produto Concierge (copiloto interno no painel do lead, módulo `concierge`, empresa 5) continua
  EXATO como está — muda só de onde vem o cliente HTTP dele.

## Arquivos
- CRIAR `backend/src/ai-gateway/ollama-client.ts` (+ test) — o cliente único: chat + format:'json',
  timeout/model por CHAMADOR (cadeia de env preservada por chamador), erros → caller decide fallback.
  Base: copiar o hardening do `concierge-ollama.ts` (o mais completo).
- EDITAR `backend/src/concierge/concierge-ollama.ts` → wrapper fino sobre o cliente único
  (mantém exports/envs próprios `HBX_AI_CONCIERGE_*`).
- EDITAR `backend/src/assistente/assistente-ollama.ts` → wrapper fino idem (`HBX_ASSISTENTE_*`).
- EDITAR `backend/src/.../ai-intent-classifier.service.ts` → usa o cliente único (envs próprias mantidas).

## Tarefas
1. Extrair o cliente único p/ `ai-gateway/` (já é o lar do governor — 1 Ollama, 1 porteiro).
2. Os 3 chamadores viram wrappers finos: MESMAS envs de modelo/timeout de cada um (bench sem
   código continua possível), MESMO comportamento em erro (concierge lança → chips; assistente
   → roteiro fallback; classificador → heurística). Zero mudança de contrato.
3. Guardas anti-injeção do concierge viram utilitário exportado; o prompt-builder do assistente
   (system do sandbox/runtime) passa a aplicá-las TAMBÉM (ganho direto: o Atendente IA herda a
   blindagem 10/10 provada).
4. Testes: 3 wrappers resolvem env na cadeia certa; guardas aplicadas no prompt do assistente;
   nenhum teste existente de concierge/assistente quebra.

## Critérios de aceite
- 1 único `fetch` ao Ollama no backend (grep prova); 3 chamadores com contrato intacto;
  build + testes das 3 áreas verdes.
- NENHUM dado/ferramenta interna do concierge exposto ao caminho do cliente final (revisar imports).

## Proibições
- Não tocar no produto/painel Concierge nem no seu gate (`concierge`, empresa 5).
- Não mudar modelos default de ninguém (envs mandam, como hoje).
- ⚠️ `assistente-ollama.ts` também alimenta o **Copiloto** (redação assistida no Lead — achado S02).
  Ao transformá-lo em wrapper fino, o Copiloto tem que continuar funcionando IGUAL (mesmas envs
  `HBX_ASSISTENTE_*`, mesmo comportamento em erro). Testar que o caminho do Copiloto não regride.

## DoD
Commit local: `refactor(automation): S05B — cliente Ollama único com hardening do concierge`
