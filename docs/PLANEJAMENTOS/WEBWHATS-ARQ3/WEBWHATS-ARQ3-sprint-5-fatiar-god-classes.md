# WEBWHATS-ARQ3 — Sprint 5: Fatiar as god-classes (strangler, sem big-bang)

> Absorve o GATEWAY-WA Sprint 5 (parte "fatiar bridge"). Refactor do caminho-do-dinheiro: valor
> ZERO em runtime, então cada fatia é PEQUENA, atrás de testes de caracterização, com o
> comportamento provado idêntico antes/depois. Depende do Sprint 2 estável ≥ 2 semanas.
> Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($)
Três arquivos concentram o risco de TODA mexida em WhatsApp:
- `Webwhats/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts` — **5.391 linhas**;
- `backend/src/messaging/messaging.service.ts` — **9.432 linhas**;
- `backend/src/messaging/webwhats-bridge.service.ts` — **4.311 linhas**.

Cada bug fix nelas é caro e arriscado (contexto imenso, efeito colateral difícil de ver). Isso
freia toda evolução do produto de mensageria — o custo é velocidade e a chance de quebrar o
caminho da receita. O GATEWAY-WA deixou explícito que fatiar a bridge é "alto risco, valor zero
em runtime → sessão dedicada/vigiada". Este é o sprint dedicado.

## Método (strangler pattern — inegociável aqui)
1. **Teste de caracterização primeiro.** Antes de mover 1 linha, cravar testes que capturam o
   comportamento ATUAL do trecho a extrair (entradas reais → saídas reais). Já há base:
   `webwhats-bridge.service.test.ts` (1.735 linhas), `messaging.service.test.ts` (1.278).
2. **Extrair por responsabilidade, uma por PR**, mantendo a fachada pública idêntica (a classe
   velha delega pra novo colaborador). Nada de renomear API externa.
3. **Provar idêntico**: suíte verde + typecheck estrito do motor (`cd Webwhats && npm run
   typecheck`) + smoke no Chrome do fluxo tocado.
4. **Uma fatia por vez chega à master**; nunca duas god-classes em voo simultâneo.

## Fatias propostas (ordem por risco crescente)
### Bridge (`webwhats-bridge.service.ts`, 6 responsabilidades conhecidas — GATEWAY-WA S0)
- **F-A** `WebwhatsMediaResolver` — normalização/resolução de mídia (image/video/doc/audio/sticker),
  já isolável (tipos e `extractWebwhatsAttachment` bem delimitados).
- **F-B** `WebwhatsHttpClient` — `readConfig` + request REST + mapeamento de erro provider →
  `WebwhatsProviderError` (superfície pequena, muito reusada).
- **F-C** `WebwhatsIncomingNormalizer` — normalização de evento recebido (`WebwhatsNormalized...`).
- **F-D** resto da orquestração fica na fachada fina.

### messaging.service (9.432 linhas — o maior; fatiar DEPOIS da bridge)
- **F-E** dispatcher de saída (`sendOne`/lock/attempts) → `OutboundDispatcherService`.
- **F-F** ingestão de webhook/outbox (`processWebwhatsEventCore` + `handleWebwhatsWebhookEvent`)
  → `WebwhatsIngestionService` (o miolo compartilhado — extrair com rede de testes máxima).
- **F-G** anexos/variáveis (`extractWebwhatsAttachment`, `stripAttachmentReference...`).

### Motor (`whatsapp.baileys.service.ts`, 5.391 — MAIS arriscado, por ÚLTIMO)
- **F-H** só o que NÃO toca conexão: builders de mensagem de saída (sendText/media/etc.).
- Conexão/disjuntor/`connectionUpdate` ficam INTOCADOS neste plano (guardrail).

## Aceite (por fatia)
- [ ] Teste de caracterização commitado ANTES da extração; passa antes e depois.
- [ ] Fachada pública idêntica (nenhum call-site externo muda).
- [ ] `npm run typecheck` do motor (quando fatia é do motor) + suítes backend verdes.
- [ ] Smoke Chrome do fluxo tocado (enviar/receber texto e mídia).
- [ ] Contagem de linhas do arquivo-alvo cai; nenhuma regressão de comportamento observável.

## Riscos / rollback
- É o caminho da receita: cada PR é revertível isolado (fachada delega, extração é mecânica).
- NÃO fatiar conexão/reconexão (F-H exclui isso explicitamente).
- NÃO iniciar com o worktree do dono sujo nesses arquivos — conferir `git status`, snapshotar o
  WIP dele antes (regra 18/06); god-class do dono é campo minado de merge.
- Parar e reportar se um teste de caracterização revelar comportamento que ninguém sabia que
  existia (é sinal de acoplamento oculto, não de bug a "consertar de passagem").
