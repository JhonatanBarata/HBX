# PLAN12062026002 — Motor: diferencial "uou" na entrega de cards

> Objetivo do dono: (1) manter o motor rápido funcionando e melhorar sem gastar com API;
> (2) criar um diferencial real na entrega — ex.: encomenda noturna ("50 e-mails do segmento X
> por dia"), com o motor trabalhando depois das 18:00 para cumprir o filtro pedido.

## Diagnóstico — o que JÁ existe (nada aqui nasce do zero)

| Peça | Estado real |
|---|---|
| Pipeline rápido (fases 01–06) | Funcionando. Providers: google-search, hbx-engine, **cnpj_public com base real** (commit 8a04e982), diretórios locais, vertical, website-crawl, reprocesso interno. |
| Motor Python (`hbx-scraping-engine`) | Descoberta gratuita (DDGS/Bing), seeds de diretórios (Solutudo, Lista Amarela, Apontador, GuiaMais), contrato já tem `email/emailStatus/emailSource/emailConfidence`, e os orçamentos por env **já preveem modos `night_factory`/`deep`** (`discovery.py:31`). |
| Night Factory (`backend/src/night-factory/`) | Já existe: janela configurável (startHour/endHour, tz São Paulo), worker com tick de 5 min, score de oportunidade, recompensa diária de 5 leads, relatório matinal "O que o HBX fez enquanto você dormia". |
| **Furo da Night Factory** | O enriquecimento é fake-leve: `buildLightweightEnrichment` só roda regex sobre as strings `website`/`sourceUrl` — **nunca abre o site de verdade**, apesar de a flag `allowWebsiteFetch` existir na config e nunca ser usada. |
| `hbx-local-lab` | Laboratório de e-mails pronto: crawl de site, extractor de página de contato, probe de diretórios e social, export JSONL, importação oficial via `/webscraping/lead-harvest/import`. |
| Banco (`RadarLeadPool`) | Colunas já existem para o card-dossiê: `email*`, `instagramUrl`, `facebookUrl`, `painType/painLabel/painPitch`, `recommendedChannel`, `openingHoursStatus`. |
| Frota | Governor elástico na VPS já considera fila + janela noturna + memória. |

Conclusão: o diferencial não é construir um motor novo — é **ligar o fetch real à noite**
e **criar o conceito de encomenda** em cima da Night Factory que já roda.

## Frente 1 — Rápido: manter e melhorar SEM API paga

O rápido não muda de arquitetura. Ele melhora porque lê do mesmo `RadarLeadPool` que a
noite vai engordar.

1. **PR-A — Fetch real na Night Factory** (maior ganho imediato, custo zero) — **FEITO 12/06/2026**
   Implementado em `night-factory.service.ts` (`fetchWebsiteIntel`) reaproveitando o
   `WebsiteCrawlProviderService` do Radar e o `buildRadarLeadEnrichment` canônico.
   Liga-se via `POST /modules/master/night-factory/config` com `{ "allowWebsiteFetch": true }`
   (default segue `false`). Requer docker restart do backend para valer em produção.
   - Honrar a flag `allowWebsiteFetch` existente: dentro da janela, abrir homepage +
     página de contato do lead (HTTP direto, reaproveitando os extractors do
     `hbx-local-lab` ou portando a lógica).
   - Preencher de verdade: `email/emailStatus/emailSource/emailConfidence`,
     `instagramUrl`, `facebookUrl`, `websiteStatus` real, `painType/painLabel/painPitch`.
   - Regra: e-mail achado no site oficial → `confirmed`; inferido/diretório → `probable`.
   - WhatsApp em site → no máximo `probable` (confirmed só via Webwhats — MOTOR.md).
   - Throttle: respeitar `cpuSoftLimitPercent`/`memorySoftLimitPercent` já configurados.

1b. **Extração HTML v2 + validação MX local** — **FEITO 12/06/2026**
   - `website-crawl-contact-extractor.ts`: e-mail ofuscado ("arroba"/"ponto" por extenso)
     e JSON-LD (`email`, `telephone`, `sameAs` → alimenta Instagram/Facebook/WhatsApp).
   - `webscraping/email-mx-validation.ts`: checagem MX via DNS local (cache 12h, timeout
     2,5s, timeout NÃO condena o e-mail). Na Night Factory: sem MX → `invalid` e canal
     recalculado; com MX → confiança ≥ 92. Zero API paga.

2. **Pool como primeira resposta do rápido** — segmento+cidade já mapeado de noite =
   resposta instantânea com card enriquecido (calibrar prioridade do reprocesso interno
   na fase 01; já existe `radar-internal-reprocess-source`).

3. **cnpj_public como camada de confiança no card** — idade da empresa, situação
   cadastral, CNAE. É dado que "qualquer pesquisa no Google" NÃO entrega. Base local,
   custo zero.

4. **Mais seeds gratuitos no motor Python** — `build_directory_seed_urls` tem 4
   diretórios; ampliar a lista com diretórios estáveis (validar um a um — card só nasce
   de empresa real).

## Teste em aplicação real — 12/06/2026 (dev local, docker)

Baseline (código antigo): pool com 330 leads, 58 e-mails (17,6%), busca "dentista
Piracicaba" devolveu 7 cards sendo 4 dos EUA e zero dor/canal.

Pós-atualização (fetch real + MX ligados, 2 lotes forçados de 200):
- **11 e-mails que estavam `confirmed` eram domínio morto** (sem MX) → rebaixados a `invalid`.
- Crawl achou e-mails novos no site oficial (ex.: Uniodonto Piracicaba, Dra. Vitoria
  Piccolli → `confirmed` 92 com canal `email`).
- Pedido forçado "10 e-mails de clínica" cumprido: 10 clínicas da região com e-mail
  `confirmed`, dor e canal.
- Tela Radar refletiu: "E-mails validados 44 (15,2%)", check verde no e-mail do painel.

Falhas reais encontradas (e estado):
1. **`NightFactoryModule` não estava plugado no `AppModule`** — módulo inteiro 404 no ar.
   CORRIGIDO em 12/06 (import adicionado). Era invisível a teste unitário.
2. Container backend (modo dev, bind mount + ts-node-dev) reciclou durante lote forçado
   de 200; trabalho completou, `failed=0`. Mitigação: cadência padrão restaurada
   (batchSize 50, concurrency 2). Em produção roda compilado (start:prod).
3. Front: filtro "Segmento" da tela Radar não filtra a lista (front em reset, ligação pendente).
4. Front: warning React de `key` duplicada em `dashboard/page.client.tsx:257` (overlay dev).
5. Busca rápida síncrona continua trazendo lixo geográfico (cards dos EUA) — tratar na
   fase 02-filter (coerência cidade/DDD/TLD); candidato a item da Frente 1.

Config atual em dev: `allowWebsiteFetch=true`, janela 00–06h, batchSize 50.

## Frente 2 — O diferencial "uou": Encomenda Noturna

Conceito de produto: o usuário deixa um pedido — *"quero 50 e-mails confirmados de
óticas em Piracicaba"* — e o motor trabalha das 18:00 às 06:00 para cumprir a quota.
De manhã o card de entrega aparece: **"Sua encomenda chegou: 50 e-mails de óticas"**.

5. **PR-B — Modelo `NightOrder`** (Prisma + CRUD) — **FEITO 12/06/2026**
   - Tabelas `NightOrder` + `NightOrderDelivery` (migration `20260612_night_orders`,
     aditiva, padrão leadIdsJson da casa).
   - Rotas (`JwtAuthGuard`, escopo por empresa): `POST/GET /night-factory/orders`,
     `GET /night-factory/orders/:id` (progresso + leads da noite),
     `POST :id/pause|resume|cancel`, `POST run-now` (força cumprimento).
   - Fulfillment: quota diária, dedupe por encomenda entre noites (lead nunca repete),
     `requireEmail` → só `confirmed/probable`, `requireWhatsapp` → celular provável
     (nunca promove confirmed), `onlyWithoutWebsite`, `idempotencyKey` no pedido.
   - Gancho no worker noturno: após cada lote de enriquecimento dentro da janela,
     as encomendas abertas são cumpridas com o estoque recém-enriquecido.
   - Testado online 12/06: encomenda "10 e-mails de clínica" criada via API e cumprida
     10/10 com e-mails `confirmed` 85–92%; segunda execução entregou 0 (dedupe ok);
     idempotencyKey devolveu a mesma encomenda.
   - PENDENTE (PR-C): quando o pool não tem estoque suficiente, disparar busca ativa
     no motor com budget deep para completar a quota.
   - Campos: `companyId`, `segment`, `city/state`, filtros (`requireEmail`,
     `requireWhatsapp`, `onlyWithoutWebsite`...), `dailyQuota`, `status`
     (`open/paused/done`), contadores por noite.
   - Endpoints: criar/pausar/listar encomenda + progresso.

6. **PR-C — Planner de encomendas no worker noturno**
   - Dentro da janela existente, o tick deixa de só re-enriquecer pool genérico e passa a:
     pegar encomendas abertas → gerar tarefas de busca pro `hbx-engine` com os budgets
     `deep/night_factory` (env já preparado) → search → filter → enrich (fetch real do
     PR-A) → contar para a quota só o que cumpre o filtro (ex.: `emailStatus=confirmed`).
   - Dedupe contra histórico completo — **negativo conta e nunca é apagado** (regra de ouro).
   - Para quando: quota cumprida OU janela fechou. O que faltou continua na noite seguinte.

7. **PR-D — Entrega matinal**
   - Generalizar a mecânica de claim/reward já existente (`NightFactoryRewardClaim`,
     cooldown, escopo por company) de "5 leads fixos" para "entrega da encomenda".
   - Relatório matinal existente ganha a seção da encomenda (quota pedida × entregue,
     qualidade média, fontes).
   - Frontend: REGRA ZERO — tela/card copiado de `docs/TEMAS`, só ligar endpoints.

## O card "uou" (o que muda na percepção de valor)

De "listagem que o Google acharia" para **dossiê**:
- E-mail com fonte e confiança (badge `confirmed`/`probable`).
- Presença digital verificada de verdade (site aberto, não regex de URL).
- Idade/situação/CNAE via cnpj_public ("empresa ativa há 12 anos").
- Dor detectada (`painType` → `painPitch` pronto para abordagem).
- Canal recomendado pela prioridade oficial (WhatsApp confirmado > Instagram > telefone > e-mail > site).

Guardrails dos cards (MOTOR.md): campos novos sempre opcionais; card antigo continua
renderizando; social pendente nunca vira erro; nada de `confirmed` sem Webwhats.

## Custos

Zero API paga: DDGS/Bing/SearXNG + diretórios + fetch HTTP direto + base cnpj_public
local. Serper continua opcional atrás do provider router (só se o dono ligar chave).

## Ordem de execução sugerida

1. **PR-A** (fetch real) — destrava tudo: melhora o rápido E é pré-requisito da encomenda.
2. **PR-B + PR-C** (encomenda + planner) — o diferencial em si.
3. **PR-D** (entrega matinal + card) — a parte visível do "uou".

## Métricas de sucesso

- E-mails `confirmed` gerados por noite (meta inicial: 50/encomenda).
- % de cards com dossiê completo (e-mail + presença verificada + dor) vs hoje.
- Tempo de resposta do rápido em segmento pré-mapeado de noite (meta: instantâneo do pool).

## Checks por PR

- Backend: `npm run prisma:validate` → `npm run build` (+ `night-factory.service.test.ts`).
- Edições pequenas de backend seguem a fila do PLAN12062026001 (lote + docker restart).
