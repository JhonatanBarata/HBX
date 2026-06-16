# PR16062026021 — META LEAD ADS: ligar (env + registro do dono)

> Migrado de `PR14062026013` §A + `PR14062026014` §3. **JÁ CONSTRUÍDO** — falta só o dono ligar
> (env/registro). Memória: `meta-lead-ads-intake`.

## ✅ JÁ FEITO (registro)
Módulo `backend/src/meta-lead-ads/`: webhook público `leadgen` com **HMAC fail-closed**
(assinatura obrigatória), admin por empresa (conectar página/conta), Graph client, service,
**8 testes**. Schema: `model MetaLeadConnection` + `VendasLead.leadTemperature` (frio/morno/quente).
Migration `20260614_meta_lead_ads_intake` aplicada no dev; rotas verificadas. **Lead de anúncio
cai no Vendas como 🔥 quente** (inbound — a pessoa pediu contato).

## ⛔ FALTA (lado do dono — env/registro, NÃO código; não tocar secret de prod por conta)
1. Env do backend: `META_APP_SECRET`, `META_VERIFY_TOKEN` (opcional `META_GRAPH_VERSION`).
2. No Meta: webhook do app → `https://<host>/webhooks/meta/leadgen`, campo `leadgen`, mesmo
   verify token; inscrever a página no evento leadgen.
3. `POST /integrations/meta/connections` (logado ADMIN): `{ pageId, accessToken (page token),
   defaultAssignedUserId, pageName }`.
4. Disparar um lead de teste do formulário → cai no Vendas do vendedor como 🔥.

## Evolução opcional
Tratar o inbound como **mais uma torneira da lagoa compartilhada** (despejar pelo portão único
`lead-harvest/import` com `source='meta_lead_ads'`) vs. inbound direto no dono da campanha. Não é
necessário pro fluxo atual.

## Status
Código pronto + testado em dev; ligar = ação do dono.
