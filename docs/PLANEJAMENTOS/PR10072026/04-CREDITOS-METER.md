# F6 — MEDIDOR UNIVERSAL DE CRÉDITO (backend) — EXECUÇÃO DIRETA DO ORQUESTRADOR

Frente FINANCEIRA (preço/cobrança) → exceção da regra de orquestração: o orquestrador edita DIRETO,
com revisão obrigatória do diff ao final. Workers NÃO tocam nesta frente.

Decisões do dono (10/07, chat): módulos LIVRES, USO cobrado; crédito = moeda universal;
**WhatsApp automação NUNCA debita** ("ninguém cobra a não ser que for Meta") — só mede; humano nem mede.
Track-first: medir 30d, precificar com dado real; débito novo só com decisão explícita (padrão 2 chaves).

## Escopo
1. `backend/src/credits/credit-action-catalog.ts` (novo): `actionKey → {mode: 'free'|'track'|'debit',
   cost: number}` — `lead_delivery: debit/1` (comportamento atual intocado), `whatsapp_auto_send: track`,
   `ai_realtime: track`, `ai_batch: track`, `logistica_delivery: track`. Catálogo em código; overlay
   editável no /master = fase 2 (pendência registrada, não silenciosa).
2. `CreditMeterService.meter()` (novo, fino sobre o ledger existente): free→no-op; track→shadow entry
   (`debit_shadow` com actionKey novo — schema já aceita); debit→débito fail-closed idempotente.
   `lead_delivery` CONTINUA pelo caminho vivo (`assertAndDebitLeadDelivery`) — não rerotear dinheiro.
3. Fricção de semântica (obrigatório ANTES de qualquer actionKey novo): teto S4 do vendedor
   (`credits.service.ts` ~L626/641) e teto diário anti-scraper (commercial-usage-limits) filtram
   `actionKey='lead_delivery'` — senão mensagem/IA contam como lead.
4. IA: `AiGatewayService.run` ganha contexto opcional `{companyId, actionKey, units}` (4º parâmetro,
   aditivo); hook estático best-effort (classe é static sem DI) ligado pelo módulo de créditos no boot.
   Call-sites com empresa à mão propagam (assistente-sandbox, intent-engine, ai-intent-classifier);
   batch sem companyId claro → omite (não inventar).
5. WhatsApp: 1 hook no sucesso do dispatch (`messaging.service.ts::sendOne`) — `sourceModule` em
   {vendas_prospeccao_bot, atendimento_bot, logistica_entrega, logistica_fechamento, hbx_recovery_*} →
   `meter('whatsapp_auto_send', usageKey=id da outboundMessage)`; `atendimento_human|manual` → NADA.
6. Logística: hook track `logistica_delivery` no ponto de "entrega concluída" (`logistica.service.ts`),
   usageKey = id da entrega.
7. `docs/PLANEJAMENTOS/CREDITOS/PLANO.md`: ADENDO datado revogando o D1 ("só lead é metrado") →
   crédito universal track-first; WhatsApp nunca debita.
8. Testes: unit do meter (roteamento por modo, idempotência, skip humano, catálogo default) + suíte de
   créditos existente verde + typecheck backend.

## Kill-switch
Tudo desarma com `HBX_CREDITS_ENABLED=false` (comportamento existente); track não bloqueia nada por
construção (shadow). Nenhuma env nova obrigatória.
