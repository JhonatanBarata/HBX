# PR14062026008 — Radar: vitrine + Leads + QUEM ALIMENTA o Radar (feeder)

> **Fonte ÚNICA do pipeline de lead.** Absorve o antigo PR…004 (alcance/fallback) e a
> seção "Radar/Leads/Vendas (modelo B)" do 007. Divisão limpa: **007 = ACESSO por cargo**
> · **008 = PIPELINE de lead + FEEDER.**
>
> **Estado:** lagoa cheia, vendedor já alimentado. Não há urgência de data — a ordem é por
> DEPENDÊNCIA (núcleo → bonito), nunca por calendário. Nada vai pra produção sem "go".

---

## 1. O MAPA DE HOJE (confirmado lendo o código)

### 1.1 Tela Radar — `frontend/src/app/(app)/webscraping/page.client.tsx`
Hoje a tela é **operador de busca + base + CRM** numa coisa só: filtros (segmento/cidade/UF),
**▶ Executar coleta** (`POST /webscraping/radar/search-runs` + polling 4s), stats strip,
tabela com **telefone/e-mail/site**, **Exportar CSV**, aside com Ações (`send-to-vendas`,
`Criar abordagem`, `Ver histórico`). É exatamente essa tela que vira **vitrine read-only**.

### 1.2 Motor (backend) — já pronto, NÃO mexer
- `POST /webscraping/radar/search-runs` (`RadarPullDto`) já aceita `radiusKm`, `originLat`,
  `originLng`, `quantity`, `segment`. **Zero mudança de backend** pra ligar alcance.
- **Alcance → vizinhas:** `RadarSearchGeoService.resolveRegionalCities()` (haversine + raio);
  `getSearchCityTargets()` devolve `[principal, ...regionais]` só se `radiusKm > 0`. Varre
  principal primeiro → transborda pras vizinhas.
- **Multi-segmento:** `splitHbxBatchSegments()` (até 5) · `HBX_CATEGORY_SEGMENTS` expande
  categoria. Mass-data noturno já abre por categoria sozinho.
- **Anti-mistura:** `radar-quality-gate` rejeita estado diferente (`state_conflict`).
- **Descanso/retomada:** o motor descansa e **retoma a mesma pesquisa** em vez de morrer.

### 1.3 Distribuição
- **PUSH:** `distribute-to-vendedores` + regra automática (admin/regra empurra).
- **PULL:** `radar/pull` existe parcial — base do modelo B (puxar).

---

## 2. A VISÃO (modelo B)

| Tela | Papel | Dado | Operação |
|---|---|---|---|
| **RADAR** | Vitrine read-only ("encher o olho") | nome/segmento/cidade/score · **sem tel/e-mail** | NÃO busca. Sem export. Rate-limit + log. |
| **LEADS** | O que a empresa pede | Revelado **só no pull** | Puxar do banco = grátis · deep search = gasta QUOTA. Lagoa compartilhada (FIFO, score escondido, teto de WIP). |
| **VENDAS** | Bancada | Lista + kanban + comissão + **score no card** | Trabalha o lead puxado. |

Fluxo: **Radar (acha/mostra) → Leads (distribui) → Vendas (trabalha) → WhatsApp → Retorno.**

---

## 3. DECISÕES — TRAVADAS (dono, 14/06)

- **D1 — Origem do lead:** banco autônomo (noturno) + harvest local. Lagoa já cheia (ver §8 B0).
- **D2 — Pull ou Push:** **PULL** é o caminho principal; **PUSH** fica como rede de segurança.
  Vendedor nunca fica sem lead por feature meio-pronta. ✅ backend do pull feito e verificado.
- **D3 — Reveal-on-pull (mascarar tel/e-mail até puxar):** sim, mas é evolução — não bloqueia
  o núcleo. Entra depois (anti-exfiltração).
- **D4 — Tela Radar vira vitrine:** sim, depois do núcleo (cosmético, sem risco pro pull).
- **D5 — Operação de busca (executarColeta):** passo 1 = esconder do CARGO vendedor (fica com
  admin/gerente); passo 2 = mover pro Leads com medidor de quota.
- **D6 — Alcance:** **A** — front manda `radiusKm`+`quantity`, controle 0/25/50/100 km.
  Motor já faz principal→vizinhas. Escalada reativa (motor sobe raio sozinho) congelada até "go".

---

## 4. ORDEM POR DEPENDÊNCIA (núcleo → bonito)

**Núcleo (o vendedor pega lead e trabalha):**
1. Banco com leads (✅ confirmado — §8 B0).
2. Vendedor **pega lead** (pull principal / push fail-safe) → cai na carteira.
3. Lead puxado **trabalhável no /vendas** (telefone + score).
4. Ninguém travado por feature pela metade (fail-safe = push).

**Bonito (refatoração ampla, vai por cima sem risco):**
5. Radar vira vitrine read-only (tira tel/e-mail/export/busca; sonar; contadores honestos).
6. Busca migra pro Leads com quota + alcance (D6/A).
7. Reveal-on-pull + anti-exfiltração (rate-limit, log).
8. Lagoa redonda (FIFO, score escondido, teto de WIP, preferência segmento+região).

---

## 5. NÃO-OBJETIVOS (trava)
- **Não alterar o motor** (search-runner, geo, planner, quality-gate). Escalada reativa só com "go".
- Não mexer em custo/quota/governor neste passo (governor da VPS = env/deploy do dono).
- Não tocar mass-data/banco autônomo (tem expansão própria).
- Não fundir Radar/Leads/Vendas — são 3 telas (decisão do dono 11/06).
- Vendedor **nunca** fica sem lead por migração inacabada (push é o fail-safe).

---

## 6. ESTADO REAL (working tree local, sem commit/deploy)

### B0 — Verdade no chão (confirmado 14/06)
1. **Banco NÃO está vazio:** `RadarLeadPool` = **289 `clean`** + 50 `sent_to_vendas`. O trabalho
   é o **caminho do pull**, não encher banco.
2. **Lagoa já é compartilhada:** `RadarLeadPool.companyId = NULL` (pool global).
3. **PUSH testado:** `distributeRadarLeadsToVendedoresForUser` → respeita teto diário
   (`RadarDistributionDailyUsage`) + quota de cards ativos → `importRadarLeadToVendasForUser`
   cria o `vendasLead` atribuído ao vendedor, passando `opportunityScore` + contato.
4. **PULL parcial:** `pullRadarLeadsForUser` (`POST radar/pull`) reserva no pool, mas NÃO cria
   `vendasLead` e o front não chama.
5. **Front `/leads`:** vendedor vê base + "Enviar p/ Vendas" (1 a 1); sem "puxar por preferência".
6. **Preferência do vendedor existe:** `User.preferredSegmentsJson`.

### B1 — Pull do vendedor = FEITO + verificado local ✅
`pullRadarLeadsToVendasForUser` (vendedor-only) + `POST radar/pull-to-vendas`: consulta a lagoa
por filtro (segmento obrigatório, cidade/UF opcionais), respeita quota + teto, chama o
`importRadarLeadToVendasForUser` (assignedUserId=self) → lead cai na carteira com score+contato.
`radar/pull` reserve-only e o push ficam INTOCADOS. Import roda **na pele do admin** (mesma
semântica do push) por causa do portão `assertRadarLeadVisibleForUser`.
**Teste real:** vendedor puxou `segment=oficina, quantity=3` → `pulledCount: 3`, 3 `VendasLead`
criados, teto 20→17, lagoa marcou os 3 como `sent_to_vendas` (sem duplo-pull). **Backend → deploy-gated.**

### 🔴 Achado crítico corrigido — o tree NÃO DAVA BOOT
`prisma.service.ts` chamava o runtime-ensure `user-tutorial-onboarding-column` sem a definição
registrada em `RUNTIME_SCHEMA_ENSURES` → crash no `onModuleInit`. FIX: registrei a entrada
(`ensureTutorialOnboardingColumn` já existia). Backend sobe healthy. **Prova de que deploy do
tree atual às cegas derrubaria a VPS.**

### B1-front — botão "Puxar leads" = FEITO + verificado no browser ✅
Componente isolado `components/hbx/puxar-leads-panel.tsx` na tela `/leads` só pro cargo
vendedor (segmento + cidade/UF + **alcance** + quantidade → `POST radar/pull-to-vendas`).
**Verificado no preview:** login vendedor → clique → POST certo → "5 leads puxados pra carteira".

### B2 — score no card do Vendas = FEITO + verificado ✅
Coluna `VendasLead.opportunityScore Int?` (schema + runtime-ensure
`ensureVendasLeadOpportunityScoreColumn`) + persistido no `createOrUpdateLead` + mapeado no
import + servido no `buildLeadPayload`/`/vendas/board`. **Teste:** board mostra `score=100`.
**Schema → deploy-gated** (coluna nasce no boot via ensure).

### B4 — reveal-on-pull (lado vendedor) = JÁ ENFORÇADO ✅
`listRadarLeadsForUser` filtra por `assignedUserId` (`buildRadarWhere`): vendedor só vê na
lista o que puxou; a lagoa crua é invisível pra ele (verificado: radar/leads do vendedor = 0).
A vitrine mascarada (B3) é a outra metade.

### B5 — alcance no pull = FEITO + verificado ✅
`normalizeRadarFilters`→`resolveRegionalCities`→`buildRadarWhere` já expande pras vizinhas com
`radiusKm`+cidade. Faltava só o controle na UI (no `puxar-leads-panel`, 0/25/50/100 km).
**Verificado:** UI envia `{"...","city":"Rio Claro","radiusKm":50}`.

### B3 — Radar vira vitrine read-only = FEITO (outro agente) ✅ (cosmético pós-segunda)
`webscraping/page.client.tsx` cargo-gated (`isSeller`): vendedor sem busca/coleta, sem
Telefone/E-mail, sem ações CRM. Funcional/anti-exfiltração OK. O "encher o olho" animado
(sonar/contadores) fica pra quando entrarem as peles (esqueleto + 5 Leis).

### B2 — coluna de score: ⚠️ RESOLVIDO (ver acima). Texto antigo abaixo era o achado.

### 🟡 Dado: lagoa com segmento mal rotulado (PENDENTE — motor)
Pull de `oficina`/`beleza` trouxe nomes não-condizentes → lixo de rótulo na `RadarLeadPool`.
Não é bug do pull; tratar no motor/enriquecimento. ÚNICO item aberto do pipeline.

---

## 7. QUEM ALIMENTA O RADAR (feeder) — DECIDIDO 14/06

> **Uma lagoa, duas torneiras.** O `RadarLeadPool` é único e global (`companyId NULL`). Quem lê
> (pull/push) não sabe de qual motor veio. A pergunta não é "quem alimenta o radar de cada
> cliente" — é "quais torneiras despejam na lagoa sem brigar nem travar o cliente".

### 7.1 🟢 Torneira LOCAL — forte, sem freio
Frota `hbx-engine-*` local (`npm run engines:up`, fora do `up` padrão) + `hbx-local-lab`
(`127.0.0.1:3098`). Roda **na máquina do dono**, sem governor, sem cota. Varre pesado, exporta
JSONL, entra na lagoa **em lote** pelo único portão oficial:
`POST /webscraping/lead-harvest/import` (orquestrado pelo Ops Control). O esforço de scraping
mora aqui de propósito — o gargalo da VPS é CPU (4 núcleos, load 5–7); a VPS só recebe o
resultado já limpo.

### 7.2 🟡 Torneira VPS — governada, sempre pingando
`mass-data` autônomo `nightOnly: true` (`isWithinRadarWindow()`) + **governor**
(`hbx-engine-governor.service.ts`, `HBX_ENGINE_GOVERNOR_ENABLED=true`, tick 30s, cooldown 120s,
capacidade elástica warm 3 → máx 20). Mantém a lagoa de molho sem competir com o cliente.

### 7.3 Coexistência GARANTIDA (não gera duplicado)
O import deduplica contra a lagoa por telefone e placeId **antes de inserir**
(`existsRadarLead` → `duplicate_phone` / `duplicate_company_city`,
`lead-harvest-import.service.ts:565`). Local pode despejar à vontade que não pisa no que a VPS
já achou. **Sinal verde pro modelo de duas torneiras.**

### 7.4 As 3 travas anti-trava-cliente (já existem)
1. **Lease:** o governor **nunca para motor com lease ativo** (`leaseActive`). Busca real do
   cliente preempta; o autônomo cede a vez.
2. **Janela noturna:** o trabalho autônomo da VPS só abre a torneira fora do horário de pico.
3. **Governor warm/cap:** na VPS, `warm` baixo e `máx` no teto que o CPU aguenta (load 5–7 ⇒
   provável 6–8, não 20). Cliente sempre ganha o motor quente.

### 7.5 Refil por demanda (evolução, não núcleo)
Lagoa cheia "no geral" não basta — tem que estar cheia **nos segmentos/regiões que se puxa**.
Fios soltos já existem: `User.preferredSegmentsJson` (demanda) + mass-data que abre por
categoria. Falta fechar o loop: o que esvazia em Leads/Vendas mira a próxima rodada (noturno da
VPS + fila do harvest local). É enhancement — depende de criar o **sinal de depleção**.

### 7.6 Alavanca exclusiva do dono
A única peça do feeder que não é código de tree é o **env do governor na VPS** (warm/cap,
janela, intervalo). Isso é **deploy de produção** — fica com o dono. O agente não toca em env
nem reinicia a VPS sem "go" explícito.

---

## 8. O QUE FALTA (por dependência, sem data)
1. **B1 front:** tela no `/leads` pro vendedor **puxar** (segmento + cidade/UF) chamando
   `POST radar/pull-to-vendas`. **(frontend, edita na hora)**
2. **B2 backend:** coluna `VendasLead.opportunityScore` (runtime-ensure) + mapear no import +
   serializar no `GET /vendas/board`. **(PLAN14062026001 → restart VPS com "go")**
3. **B2 front:** score no card do `/vendas`. **(frontend)**
4. **Deploy VPS** do B1+B2 backend + env do governor (§7.6) — **só com "go" do dono**.
5. **Bonito (§4):** vitrine read-only, reveal-on-pull, alcance, refil por demanda — por cima,
   sem risco pro núcleo.
