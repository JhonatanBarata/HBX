# PR14062026014 — Radar COMPARTILHADO por empresa + Ramo no login + Propaganda (Meta Lead Ads)

> Ordem do dono (14/06/2026): "o radar ficou compartilhado para qualquer empresa, mas
> falta organizar tudo isso, e eu preciso pra ontem". Toda empresa vê o Radar; ele exibe
> as preferências da empresa **e** dos vendedores (misturadas); o card que a empresa A
> recebe a empresa B também pode receber — **não pode repetir por empresa**. Por isso, no
> primeiro login, **perguntar o ramo do dono** pra filtrar e não mostrar os mesmos cards
> pras mesmas empresas. Inclui a **ideia** do Meta Lead Ads como torneira de propaganda.
>
> **Autorização nova do dono (14/06):** Claude pode publicar em produção. Build/verifica
> em dev primeiro, publica por último, com o que vai ao ar à mostra. Sem clientes em prod.

---

## 1. A DECISÃO DE MODELO — compartilhada NO TEMPO (um de cada vez + recircula)

> **Correção do dono (14/06, à noite):** o modelo NÃO é "todo mundo vê o mesmo lead ao mesmo
> tempo". É **um de cada vez, e recircula por motivo.** "O mesmo lead pode aparecer em mais de
> uma empresa, mas NÃO simultaneamente. Quem negativou nunca mais vê. A pessoa pode não querer
> refrigerante, mas topar a ligação da cerveja. Por isso tem que selecionar o motivo: se for
> 'número não existe / não atende', some de vez."

A lagoa (`RadarLeadPool`) é **única e global** (`companyId NULL`). As regras:

1. **Um de cada vez (posse-no-tempo):** enquanto a empresa A segura o lead X (`ownerCompanyId=A`),
   ele **não aparece** pra B. `availableOnly ⇒ ownerCompanyId null`. (Era isso; eu tinha
   desligado por engano de manhã achando que o dono queria simultâneo — **religado**.)
2. **Recircula quando A solta:**
   - **72h sem ação** → `releaseExpiredRadarReservations` devolve pra lagoa (anti-acúmulo).
   - **descarte no Vendas** → `vendas.service` já solta o card de volta (`ownerCompanyId=null,
     status=clean`).
   - **recusa LEVE** ("sem interesse") → bloqueia só A (`RadarLeadCompanyState`) **e devolve pra
     lagoa** pros outros.
3. **Quem negativou nunca mais vê:** `companyStates.none` exclui qualquer status negativo da
   empresa (bloqueio permanente por empresa).
4. **Recusa DURA mata pra todos:** "número não existe / não atende / sem WhatsApp / inválido /
   opt-out / reclamação" → status global protegido → some da lagoa inteira.

**Mapa de motivo → destino (proposto — confirmar com o dono):**

| Motivo da recusa | status | Destino |
|---|---|---|
| Sem interesse / não é o momento / recusou a oferta | `negative` | LEVE — bloqueia A, volta pra lagoa |
| Vendedor descartou / escondeu | `discarded`/`hidden` | LEVE — bloqueia A, volta pra lagoa |
| Não atende / número não existe / inválido | `no_answer`/`invalid_phone` | **DURA — some pra todos** |
| Sem WhatsApp | `no_whatsapp` | **DURA — some pra todos** |
| Pediu pra não receber contato (opt-out) | `opt_out` | **DURA — some pra todos** |
| Reclamou | `complaint` | **DURA — some pra todos** |

`RADAR_EXCLUSIVE_OWNERSHIP=false` (env) volta ao modo simultâneo (só debug).

---

## 2. O QUE FOI IMPLEMENTADO (14/06, working tree — dev)

### 2.1 Backend
- **Posse-no-tempo (um de cada vez):** `radarExclusiveOwnershipEnabled()` LIGADO por padrão →
  `supportsRadarOwnershipPersistence()` ativa posse + reserva 72h + recirculação.
  `radar-core-presentation.mixin.ts`. (Religado à noite — de manhã eu tinha desligado por ler
  errado "compartilhado" como simultâneo.)
- **Recusa LEVE × DURA:** `markRadarLeadNegativeForUser` agora separa — `isRadarGlobalKillStatus`
  decide: dura (número/contato ruim) marca status global protegido (some pra todos); leve
  (sem interesse) bloqueia só a empresa (`RadarLeadCompanyState`) e **libera o card pra lagoa**
  (`ownerCompanyId=null, status=clean`, sem ressuscitar morto global). `radar-core-distribution.mixin.ts`.
- **Admin/dono puxa card:** `pullRadarLeadsToVendasForUser` aceita ADMIN além de vendedor
  (`isCompanySellerUser || canUseWebscrapingRole`). Antes era vendedor-only → o dono (ADMIN)
  ficava SEM jeito de encher a carteira e só via o "Distribuir para vendedor" (push) que dava
  erro. `radar-core-delivery.mixin.ts`.
- **Ramo da empresa:** coluna `Company.prospectingSegmentsJson` (schema + runtime-ensure
  `ensureCompanyProspectingSegmentsColumn`); `POST /profile/prospecting-segments` (só o dono);
  `GET /profile/current-user` agora devolve `ramoPending`, `company.prospectingSegments` e
  `sellerProfile.preferredSegments` (a preferência do vendedor **estava salva no cadastro e
  nunca chegava na tela** — agora chega). `users.service.ts`, `profile.controller.ts`,
  `prisma.service.ts`.

### 2.2 Frontend
- **Pull pro dono:** o painel "Puxar leads" no `/leads` agora aparece pro vendedor **e** pro
  admin/dono (`isSeller || canDistribute`). `leads/page.client.tsx`.
- **Default por preferência:** o segmento do painel já vem preenchido com a preferência do
  vendedor (ou o ramo da empresa, pro admin). `leads/page.client.tsx` + `puxar-leads-panel.tsx`.
- **Ramo no primeiro login:** portão `boas-vindas-gate.tsx` ganhou o passo **RAMO** (depois da
  senha, antes do tutorial), só pro dono, com chips sugeridos + texto livre, classes `.bv-*`
  (Lei 5). Repete a cada login até resolver.

### 2.3 Camada "organizar" — estado
- [x] **Mix empresa+vendedores no Radar/Leads** — `listRadarLeadsForUser` agora aplica um
      BOOST de ordenação (não filtro) quando não vem segmento: sobe pro topo o que casa com o
      ramo da empresa ∪ a preferência de todos os vendedores ativos (vendedor = a dele).
      `resolveRadarPreferenceSegments` + `boostRadarRowsByPreference`. Não esconde nada.
- [x] **Vendedor edita a própria preferência (self-service)** — `PATCH /profile/preferred-segments`
      + util `preferred-segments.util.ts` (shape canônico {segments,cityRegion}, tolerante ao
      bare-array legado) + painel `minha-preferencia-panel.tsx` no /leads. (sessão paralela)
- [x] **Rótulo cross-empresa (presenter por-empresa)** — `resolveRadarLeadStatus` não cai mais
      no status de workflow de OUTRA empresa quando a empresa atual não tem `companyState`:
      mostra neutro. Negativados globais seguem globais. `radar-core-presentation.mixin.ts`.
- [x] **Radar = VITRINE** — removidos o filtro/Executar coleta e o Exportar do
      `webscraping/page.client.tsx` (ordem do dono: "não é pra existir isso").
- [x] **Leads = dados concretos** — removido o KPI "Quentes (score ≥ 70)" e o rótulo Alto/Médio;
      KPI vira "Com WhatsApp" (enrichmentSummary). `leads/page.client.tsx`.
- [x] **Seletor de MOTIVO ao negativar** — card do Vendas ganhou "Negativar lead" com motivo
      (leve = volta pra lagoa; dura = some pra todos), 2 cliques. `POST /vendas/lead/:id/negativar`
      → `negativarLeadForUser` → `releaseRadarLeadBackToPool` (leve/dura). `vendas.service.ts` +
      `vendas.controller.ts` + `vendas/page.client.tsx` (classes `.vendas-neg`).
- [ ] **Sinal de depleção por ramo** → realimentar a lagoa nos segmentos que esvaziam (único aberto).
- [x] **FREEZE de aparência LEVANTADO** — memória + CLAUDE.md atualizados (refatorar aparência
      autorizado; 5 Leis seguem como método, não freio).

---

## 3. PROPAGANDA — Meta Lead Ads (JÁ CONSTRUÍDO — falta o dono ligar)

> ⚠️ Repasse importante: o Meta Lead Ads **NÃO ficou só na conversa — está implementado**.
> Confirmado lendo o código (14/06): módulo `backend/src/meta-lead-ads/` (webhook controller +
> admin controller + Graph client + service + 8 testes) e schema (`model MetaLeadConnection`
> + `VendasLead.leadTemperature` frio/morno/quente). Doc de origem: PR14062026013 §A.

**O que já existe:**
- **Webhook público** Meta `leadgen` com **HMAC fail-closed** (assinatura obrigatória).
- **Admin por empresa** (conectar página/conta, VERIFY_TOKEN por empresa).
- **Lead de anúncio cai no Vendas como 🔥 quente** (`leadTemperature`) — inbound (a pessoa
  pediu contato), entra direto no funil.
- Build + testes + rotas **verificados no dev**.

**Falta (é do dono, é env/registro — não código):**
- [ ] Ligar `META_APP_SECRET` + `META_VERIFY_TOKEN` no ambiente.
- [ ] Registrar o app/página no Meta e apontar o webhook pra `…/meta-lead-ads/webhook`.

**Casamento com a lagoa (evolução opcional):** hoje o lead de anúncio entra direto no Vendas
da empresa dona da campanha. Se um dia quiser tratar como **mais uma torneira da lagoa
compartilhada** (igual feeder LOCAL/VPS do PR…008 §7), é só despejar pelo portão único
`lead-harvest/import` com `source='meta_lead_ads'`. Não é necessário pro fluxo atual — é uma
escolha de "inbound direto no dono" vs. "inbound na lagoa de todos".

---

## 4. REPASSE — estado real dos .md abertos (14/06)

Lido o código, não a conversa. "Deploy-gated" = escrito e verde em dev, **falta publicar**.

| Doc | Assunto | Estado real |
|---|---|---|
| **008** RADAR-VITRINE-E-LEADS | pipeline do lead (pull/push/feeder) | Núcleo FEITO; **este PR014** resolve o compartilhamento + admin-pull + ramo. Falta: camada "organizar" (§2.3) + deploy. |
| **007** REGUA-DE-ACESSO | acesso por cargo | COMPLETA e no ar (handoff no topo do próprio doc). |
| **003** FRONT-E-TELAS-VENDEDORA | telas da vendedora | revisar contra o estado atual; muita coisa já no app. |
| **005** COMISSAO-ASSENTOS | teto de comissão/assentos | teto no ar; assentos/visibilidade conferir. |
| **001** AQUECIMENTO-CADENCIA | cadência tipo Apollo | DESIGN; build pendente. |
| **009** LIMPEZA-CODIGO-LEGADO | Plan/Feature legado | Plan/Feature REMOVIDO (feito); varrer resíduos. |
| **010** HBX-OWNER-PAINEL | painel web do Owner | painel no ar (tkinter morto); coluna VPS feita. |
| **012** CADASTRO-CHECKOUT-COBRANCA | onboarding+checkout | Sprints 1-4 em DEV; **S4-live + webhook = VPS/dono** (dinheiro — não toco sem ordem na tarefa). |
| **013** VALOR-NO-MOTOR-E-GASTO | custo/gasto do motor | a casar com a propaganda (§3). |
| **PLAN14062026001** | fila de edições backend | fila viva; migra a cada virada de dia. |
| **tutorial-interativo / website-magnifico** | tour + site público | tutorial no ar; site = PLANO, não comecei. |

---

## 5. PUBLISH (autorizado pelo dono em 14/06)
Ordem: **build verde em dev → restart backend em dev → verificar pull do dono no preview →
publicar**. O working tree tem mudança de schema (coluna nova nasce no boot via runtime-ensure)
— por isso o boot precisa subir saudável antes de ir pro ar. Publica por último, com o diff à
mostra.
