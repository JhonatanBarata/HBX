# COLD-21 — ARMADO (API / WebService) — disparar no 1º pedido externo real

> Blueprint estratégico: `docs/PLANEJAMENTOS/cold/21-api-webservice.md`. NÃO deletar até disparar.
> **Gatilho:** primeiro pedido externo real OU HOT-01/04 estáveis + fôlego.
> **Frente FINANCEIRA** (billing por consumo) → **execução por Opus DIRETO + revisão de diff**.

## A tese (não competir onde se perde)
Vender consulta cadastral crua = competir com **BrasilAPI grátis** / ReceitaWS barata → perde.
O que **SÓ o HBX** tem pra vender: o **dado VALIDADO/VIVO** — `whatsappValidado`, `siteVivo`, `notaIA`,
`seloContato`. Cliente-alvo: plataformas de crédito/marketplace B2B que precisam saber "essa empresa
responde?". A camada viva é o produto; a cadastral crua é commodity.

## Modelo de dados
```
ApiKey { id, companyId (ou partnerId), keyHash, keyPreview, scopes, rateLimitPerMin,
         monthlyQuota, status ('active'|'revoked'), createdAt, lastUsedAt }
ApiUsage { id, apiKeyId, endpoint, cnpj, costCredits, at }   // p/ billing por consumo
```
Auth = middleware Bearer que valida `keyHash` (nunca guardar a chave crua; guardar hash + preview, como
`accessTokenPreview` no `meta-lead-ads.service.ts`). Rate-limit por chave.

## Endpoints (2, escalonados por custo)
1. `GET /api/v1/company/:cnpj` — cadastral LOCAL (base RFB já ingerida). Barato, resposta imediata.
2. `GET /api/v1/company/:cnpj/alive` — **camadas vivas** (whatsappValidado/siteVivo/notaIA/seloContato).
   Caro. Se o dado estiver frio, **enfileira** (reusar a fila de missões `RadarMission` — flag
   `HBX_MISSION_QUEUE_ENABLED`) e responde 202 + `jobId`, ou 200 se já quente em cache.

## Billing
Acoplar ao **sistema de planos existente** (débito de créditos por consulta; `alive` custa mais que
cadastral). Ver como os créditos são debitados hoje em `backend/src/payments` / commercial-plans e
seguir o mesmo trilho. Preço de referência do mercado (não esquecer): crédito deles R$0,50→R$0,015/CNPJ
por volume; nós vendemos o VALIDADO, não a ficha fria.

## Docs
1 página markdown + coleção Postman (copiar a simplicidade deles). Sem portal pesado.

## Sprint
1. Tabela ApiKey/ApiUsage + middleware Bearer + rate-limit + tela "gerar/revogar chave" (Admin).
2. Endpoint `company/:cnpj` (local, barato).
3. Endpoint `company/:cnpj/alive` (enfileira se frio) + débito de créditos.
4. Docs md + Postman. Testes: chave inválida 401, quota estourada 429, débito idempotente, alive frio → 202.

## Custo/risco
Médio-alto (billing + segurança de chave). Só faz sentido com pedido externo pagante na mão.
