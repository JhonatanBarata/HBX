# PLAN-CARD-B — Mesmo caderno (3 telas iguais DE VERDADE)

> Projeto noturno 21/06. Worker BACKEND + mapping de atendimento/leads. Roda DEPOIS do A (API do componente final).
> Decisão do dono: "igualar de verdade" — o lead é UM caderno que acumula dado no funil; cada tela LÊ o mesmo
> registro. Hoje a diferença é só PROJEÇÃO no endpoint. Não é refazer dado, é devolver o que já existe.

## Modelo (palavra do dono: "mesmo notebook")
- **Vendas** já devolve o caderno inteiro (`buildLeadPayload`). É a referência.
- **Atendimento**: o `status-card` (`inbox`/`customer-profile`) já carrega `card.lead` (o VendasLead) e
  `card.customer`. → **PROJETAR na resposta** os campos que hoje não saem: segment, city, state, website,
  leadTemperature, opportunityScore, rating, reviews, lastResult, attemptCount, owner, leadIntelligence, sale,
  productName, timesSeen, history. Depois mapear no front (`atendimento/page.client.tsx`) pro `NegocioDetail` cheio.
- **Radar/Leads**: é o **primeiro sketch** — preenche SÓ o que o radar tem (nome, segmento, cidade, contatos
  quando revelado, opportunityScore, rating/reviews, enrichment). Campos que **nascem depois** no funil
  (history, owner, tentativas, returnAt, sale, nextAction) ficam **vazios de propósito** — não inventar. Mapear no
  front (`leads/page.client.tsx`) pro `NegocioDetail` com esses campos ausentes (somem sozinhos).

## O que fazer
1. Backend Atendimento: achar o serializer do `status-card` (provável `inbox`/`customer-profile` service) e
   adicionar os campos acima, lendo de `card.lead`/`card.customer` que JÁ estão na query (se não estiverem no
   select/include, incluir). Espelhar a forma do `buildLeadPayload` da Vendas (mesmos nomes/labels).
2. Backend Radar: o presenter do lead (`radar-lead-presenter` / `radar-core-presentation`) já entrega o sketch —
   garantir que os campos comuns saem com os MESMOS nomes do `NegocioDetail` (segment/city/opportunityScore/
   rating/reviews/website/contatos-mascarados). Não forçar campos de funil.
3. Front: migrar o mapping de atendimento e leads pra preencher o `NegocioDetail` completo a partir das respostas
   enriquecidas (campo ausente → some).
4. Checks: `cd backend && npm run prisma:validate && npm run build`; `cd frontend && npm run lint && npm run build`.

## Cuidados
- **Backend é contrato** (Rules/BACKEND.md): só ADICIONAR campos à resposta, não mudar regra/lógica. Aditivo, reversível.
- Respeitar máscara do radar (contato só revelado). Não vazar PII no sketch.
- Não inventar dado de funil no radar (regra anti-fake). Vazio é resposta correta no sketch.
- Atendimento: não quebrar as props de obs/WA que a tela já usa.
