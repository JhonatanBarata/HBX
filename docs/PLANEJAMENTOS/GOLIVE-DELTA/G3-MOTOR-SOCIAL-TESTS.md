# G3 — Motor: 9 testes falhos de sinais sociais (P1.6)

## Contexto
`hbx-scraping-engine` tem **9 testes falhos**, todos em `tests/test_social_signals.py`
(enriquecimento Instagram/Facebook). Ex.: `enrich_lead(...).instagramUrl` volta `None` quando o
teste espera `https://instagram.com/confrariarc`. O dono **autorizou corrigir o motor** (guardrail
"não tocar motor" suspenso só para esta tarefa). **Primeiro diagnosticar**, depois corrigir.

## Arquivos
- `hbx-scraping-engine/tests/test_social_signals.py` (os 9 casos)
- `hbx-scraping-engine/app/services/search_service.py`, `app/search/**`,
  `app/services/*` (normalizer, parser, discovery, filters) — onde vive a lógica social.
- Rodar: `cd hbx-scraping-engine && python -m pytest tests/test_social_signals.py -q`

## Os 9 casos (do último run)
```
test_page_url_is_not_actionable_when_domain_is_generic_or_incompatible
test_lead_plus_enrichment_finds_social_and_confirms_email
test_identity_search_finds_confraria_social_without_phone_in_snippet
test_enrich_lead_reads_social_links_from_existing_website
test_enrich_lead_discovers_website_before_external_social_search
test_identity_search_rejects_hidden_facebook_without_city_handle
test_validated_handle_guess_does_not_guess_facebook_urls
test_identity_search_rejects_low_confidence_required_social_candidate
test_required_social_keeps_trying_preferred_second_channel
```

## Escopo
1. **Diagnóstico item a item**: para cada um dos 9, dizer se a falha é (a) **regressão de código**
   (o motor deixou de achar/validar social que deveria) ou (b) **teste desatualizado** (o
   comportamento mudou de propósito e o assert ficou velho).
2. Se **(a) regressão** → corrigir o CÓDIGO do motor até o teste passar com a régua original.
3. Se **(b) teste velho** → ajustar o teste, **documentando no resultado por que** a expectativa
   mudou (qual commit/regra de negócio).
4. Reportar o diagnóstico dos 9 no resultado.

## Fora de escopo
- NÃO tocar backend/frontend nem contratos de API do motor.
- NÃO fazer chamada de rede real (usar os fakes/mocks existentes, ex. `FakeDDGS`).

## Guardrails
- **Não baixar a régua**: proibido enfraquecer assert / `pytest.skip` / `xfail` só para ficar
  verde. Se mudar teste, é porque a regra mudou — justificar.
- Não tocar nada de WhatsApp/chip.

## Pronto quando
- `cd hbx-scraping-engine && python -m pytest -q` = **149 passed, 0 failed**.
- Diagnóstico dos 9 (regressão vs teste-velho) documentado no resultado.
