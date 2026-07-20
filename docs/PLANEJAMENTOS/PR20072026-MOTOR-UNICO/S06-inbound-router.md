# S06 — InboundRouterService: precedência extraída do messaging ⚠

**Fase 1 · Worker: Sonnet · Depende de: S01 (testes congelados), S04 · Revisão adversarial: SIM**

## Objetivo
A decisão "quem responde este inbound" sai do miolo do `messaging.service` (10k linhas) e vira o
serviço explícito `InboundRouterService` — o coração do motor único. Comportamento IDÊNTICO:
os testes da S01 têm que passar SEM EDITAR os testes.

## Arquivos
- CRIAR `backend/src/automation/inbound-router.service.ts`
- EDITAR `backend/src/messaging/messaging.service.ts` (trecho ~10040-10169 delega pro router)
- EDITAR `backend/src/automation/automation.module.ts` + módulos p/ injeção
- (testes da S01 NÃO são editados — são o juiz)

## Tarefas
1. Mover a sequência para `InboundRouterService.route(input)`:
   `interruptForInbound` → `dispatchCadenciaInbound` → assistente (`prepareReply` + enfileirar via
   `queueOutboundForCompany` + `markQueued`/`markQueueFailed` + log evento) → retorno
   `handleAtendimento` (o handler de atendimento/recovery FICA no messaging por ora — o router
   decide e devolve `{action:'atendimento'}` pro messaging executar, OU recebe um callback; escolher
   a forma que exigir MENOS mudança no messaging e documentar).
2. O router é o ÚNICO lugar com a ordem de precedência. Comentário-doc no topo: a ordem é regra de
   produto (paridade HubSpot/Intercom), com link pro CONTRATO.md.
3. Injeção: cuidado com dependência circular messaging↔automation — se aparecer, usar
   `forwardRef` como os módulos vizinhos já fazem, ou injetar os colaboradores (conversations,
   assistant runtime, cadencia dispatcher) DIRETO no router em vez de importar o messaging.
4. `npm run test:automation` (S01) verde SEM tocar nos testes. Build verde.

## Critérios de aceite
- Trecho no messaging.service reduzido a uma chamada ao router (+ tratamento do retorno).
- Testes S01 passam inalterados. Zero mudança observável.

## Proibições
- Não "aproveitar pra melhorar" a precedência. Igual significa IGUAL — melhoria é depois (S10+).
- Não tocar handlers internos de atendimento/recovery.

## DoD
Commit local: `refactor(automation): S06 — precedência inbound extraída para InboundRouterService`
