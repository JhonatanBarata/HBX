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

## 1. A DECISÃO DE MODELO — lagoa COMPARTILHADA, dedup POR EMPRESA

A lagoa (`RadarLeadPool`) é **única e global** (`companyId NULL`). O schema **já tinha** a
peça certa: `RadarLeadCompanyState` com `@@unique([companyId, radarLeadId])` — cada empresa
tem o **seu próprio estado** de cada card da lagoa. Tinha, porém, **dois modelos brigando**:

1. **Posse exclusiva** (`ownerCompanyId` + `claimedAt`; `availableOnly ⇒ ownerCompanyId null`)
   → o **primeiro** que pega vira **dono único** e o card **some pra todo mundo**. ❌ era isso
   que fazia o card NÃO repetir entre empresas (e estourava "card já está na carteira de outra
   empresa" no transferir/distribuir).
2. **Estado por empresa** (`companyStates.none`) → lagoa **compartilhada**; o card só some
   **pra quem já o trabalhou**. ✅ é o modelo que o dono pediu.

**O que mudou (núcleo):** a posse exclusiva passou a ser OPCIONAL e DESLIGADA por padrão.
A disponibilidade agora vem só do estado por-empresa. Resultado:

- Empresa A puxa o card X → cria `RadarLeadCompanyState(A,X)` → some **só pra A**.
- Empresa B continua vendo e podendo puxar X. ✅ (repete entre empresas)
- A não puxa X de novo (o `companyStates.none` exclui). ✅ (não repete por empresa)
- `sent_to_vendas`/`in_attendance` **não** são status "protegidos" (`RADAR_PROTECTED_STATUSES`),
  então não escondem o card globalmente — só os negativados (denied/complaint/opt-out…) somem
  pra todos, que é o certo (do-not-contact é global).

`RADAR_EXCLUSIVE_OWNERSHIP=true` (env) restaura a posse exclusiva, se um dia precisar.

---

## 2. O QUE FOI IMPLEMENTADO (14/06, working tree — dev)

### 2.1 Backend
- **Pool compartilhado:** `radarExclusiveOwnershipEnabled()` (novo) + `supportsRadarOwnershipPersistence()`
  retorna `false` por padrão → posse exclusiva off → dedup só por empresa.
  `radar-core-presentation.mixin.ts`.
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

### 2.3 Falta (camada "organizar", próximo passo, sem risco pro núcleo)
- [ ] **Mix empresa+vendedores no default do backend** (`listRadarLeadsForUser` sem segmento
      cair no ramo da empresa ∪ preferências dos vendedores). Hoje o default é por-tela (front).
- [ ] **Vendedor editar a própria preferência** (self-service). Hoje quem grava é o admin no
      cadastro/gerenciar. O default já USA a preferência; falta a tela do vendedor mexer nela.
- [ ] **Rótulo cross-empresa:** empresa B pode ver um card que A marcou `sent_to_vendas` com
      esse rótulo (cosmético; ela ainda PODE puxar). Ajuste no presenter (status por-empresa).
- [ ] **Sinal de depleção por ramo** → realimentar a lagoa nos segmentos que esvaziam.

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
