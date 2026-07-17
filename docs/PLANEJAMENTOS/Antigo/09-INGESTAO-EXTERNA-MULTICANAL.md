# 09 — INGESTÃO EXTERNA MULTICANAL

## O que já existe

Meta Lead Ads possui ledger, retry e dead-letter. O que falta é generalização real, segundo canal e notificação útil ao vendedor.

## Microetapas

- [ ] 1. Caracterizar o fluxo Meta atual com testes antes de mover código.
- [ ] 2. Criar contrato `NormalizedLead`.
- [ ] 3. Extrair `LeadDeliveryService` preservando regras do Radar.
- [ ] 4. Criar `IngestionConnection` genérica e migration de leitura compatível.
- [ ] 5. Adaptar Meta sem mudar comportamento.
- [ ] 6. Verificar se `externalAdReply`/`ctwaClid` já chega ao backend.
- [ ] 7. Criar adapter CTWA somente de leitura do evento entrante.
- [ ] 8. Deduplicar conversa e card pelo contato; clique repetido vira timeline.
- [ ] 9. Criar painel de saúde e reprocessamento de dead-letter.
- [ ] 10. Substituir o stub de notificação por canal canônico e opt-in.
- [ ] 11. Testar com referral simulado; chip real não é necessário nessa fase.

## Guardrails

- Não tocar reconexão/sessão para extrair metadata.
- Lead pago e Radar têm políticas upstream diferentes; só compartilham a entrega.
- Migração deve permitir rollback de uma release.

## Pronto quando

Meta continua idêntico, CTWA cria lead quente sem duplicar e falhas são visíveis/reprocessáveis.

