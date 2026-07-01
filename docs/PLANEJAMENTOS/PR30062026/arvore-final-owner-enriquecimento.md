# Árvore final do HBX Owner + conserto do enriquecimento (30/06)

**Decisões TRAVADAS pelo dono:** tabela `LeadContact` (1 lead → N contatos) · túnel **Tailscale** · VPS **sem fábrica** · filtro "nota 6+" **removido** · Brave+Serper = pagos.

**Regra de execução:** LOCAL primeiro, sempre reversível (`git checkout`). **VPS só quando o dono publicar.** Migração de schema + lógica de custo/prioridade = Opus na mão (camada sensível); UI/surfacing = subagente.

---

## PR1 — CORRIGIDO 30/06 (verificado em código antes de implementar) — Tabela de contato p/ BUSCA EM LOTE ⭐ LOCAL, reversível
**Correção importante:** a 1ª leitura ("blob não vira UI") estava ERRADA. Verificado em código: o presenter
(`radar-core-presentation.mixin.ts:2233-2252` `buildRadarLeadPublic`) JÁ desempacota `cnpj/razaoSocial/ownerName/
ownerPhone/ownerInstagram/ownerFacebook/emails[]/phones[]/companySituation` do `metadataJson` e manda na API. O
frontend (`detalhes-negocio.tsx:147-159` tipos + `:715-800` `renderContacts`) JÁ renderiza tudo isso, inclusive
emails/telefones extras. **O pipe ponta-a-ponta já existe e funciona — NÃO mexer no presenter nem no frontend.**

**O gap real (2 coisas):**
1. **Throughput, não código:** consulta na base LOCAL confirma 0 leads (tudo no VPS); histórico mostra que o
   backfill só rodou um TESTE de 150 leads (30/06, pós-fix do bug Brave 422) — dos ~5.959 do VPS, quase nenhum
   foi enriquecido ainda. O card "vazio" que o dono vê é dado que **ainda não existe**, não dado escondido. Mais
   throughput = PR4 (30B local + agent contínuo), não esta PR.
2. **#15 bulk filter/export é real:** puxar "50 emails que não estão em empresa alguma" em lote, varrendo TODO o
   VPS, é ineficiente em cima de array dentro de JSON blob. **Aqui sim** uma tabela normalizada se justifica —
   para CONSULTA EM LOTE, não para visibilidade do card (essa já funciona).
3. **Nuance a CONFIRMAR (não corrigir cegamente):** telefone extra só aparece no card se passou pela verificação
   de WhatsApp em lote (`webscraping.service.ts:599-602` "regra do dono: todo telefone passa pelo motor antes de
   aparecer"). Se esse job não roda com regularidade, telefone extra fica perpetuamente invisível mesmo com dado
   presente — **auditar, não necessariamente mudar a regra** (é proposital).

**Escopo CORRIGIDO (NÃO tocar presenter nem frontend — já corretos):**
1. **Schema** (`backend/prisma/schema.prisma`): novo model `LeadContact { id, radarLeadId FK→RadarLeadPool
   onDelete Cascade, kind ('email'|'phone'|'whatsapp'|'instagram'|'facebook'), value, valueNormalized, rank Int
   (1..N), source, confidence Int?, claimedByCompanyId Int? (p/ #15), createdAt }`. Índices:
   `(radarLeadId, kind, rank)`, `(kind, valueNormalized)`, `(claimedByCompanyId)`. NÃO remover/alterar colunas
   existentes — é aditivo puro.
2. **Script de backfill idempotente:** varre `RadarLeadPool` → lê `metadataJson` (emails/phones/cnpj/ownerPhone/
   ownerInstagram/ownerFacebook) → popula `LeadContact` (skip se já existe, dedup por valueNormalized). Roda
   contra QUALQUER banco apontado por `DATABASE_URL` (local hoje, VPS no publish). Idempotente — pode rodar de
   novo conforme mais leads forem enriquecidos.
3. **Escrita dupla (aditiva):** `applyDiscoveredContactsForMaster` (`webscraping.service.ts:567`) E a rota
   `apply-contacts` (`ops-control/server.js:2470`) passam a TAMBÉM gravar em `LeadContact` ao lado do
   `metadataJson` atual (que continua sendo a fonte do presenter — não trocar a fonte, só duplicar a escrita).
4. **Endpoint + UI de export em lote (NOVO, resolve #15):** rota no backend (ex.:
   `GET /modules/owner/radar/contacts/export?kind=email&unclaimed=true&limit=50`) que faz
   `SELECT ... FROM LeadContact WHERE claimedByCompanyId IS NULL AND kind=$1 LIMIT $2` (rápido, indexado) +
   botão no cockpit do Owner (`hbx-owner/local-agent/web/app.js`) "Exportar contatos não reivindicados" → CSV.

**Verificação:** rodar o backfill na base LOCAL (vazia hoje, ok) e depois — quando publicar — na VPS; conferir
que `SELECT count(*) FROM "LeadContact"` bate com o que já existe espalhado no `metadataJson` dos ~poucos leads
hoje enriquecidos; testar o export puxando N contatos não reivindicados.

---

## PR2 — Painel inteligente: interlock + elasticidade (LOCAL)
- **Interlock #7:** motor (frota) desativado → fábrica desativada (fábrica depende de motor). Botão único `{Ativo/Desativado}` por nó.
- **Freio do cursor preso** (ver MOTOR.md "VPS 100% CPU"): fábrica off → fila seca → motor cai pro mínimo de verdade (hoje o cursor preso reenfileira vazio e segura 20). `radar-core-search-loop.mixin.ts` / `applyElasticDesiredStates`.

## PR3 — VPS sem fábrica (LIVE, deliberado) 🔴
Remover a fábrica autônoma do VPS sem vestígio (campanhas mass_data + cursor + cron). Scraping passa a ser **só local** → resultado vai pro VPS. Alinha com "20 motores/IP = throttle". **Confirmar com o dono antes de aplicar no VPS.**

## PR4 — Túnel + roteador de modelo (LOCAL + VPS) 🔴
- **Tailscale** no PC e no VPS (mesh privada). VPS alcança o Ollama 30B do PC num IP privado; **nunca** expor `:11434` cru.
- **Roteador no backend VPS:** tarefa pesada → 30B (se túnel up) → senão 7B/fila. Realtime de cliente → SEMPRE 7B. **VPS-origem = prioridade no 30B (fura fila).** Heartbeat do nó local → painel mostra 30B ONLINE/OFFLINE.

## PR5 — Lista/Export (#15) (LOCAL)
Lista consulta TODO o VPS · filtra · **extrai recorte** (ex.: 50 emails) só de contatos `claimedByCompanyId = null` (fora de empresa alguma). Depende do PR1 (LeadContact).

---

---

## STATUS (30/06, orquestração Opus)
- **PR1 ✅ FEITO + revisado** (LeadContact + migration + backfill + escrita dupla + endpoint/botão export). Local, working tree, build verde, migrate status ok. Guard `JwtAuthGuard+MasterGuard` confirmado.
- **PR5 ✅ coberto pelo PR1** (endpoint `contacts/export?unclaimed=true` + botão no cockpit; cockpit já puxa o VPS).
- **PR2 ✅ FEITO + revisado:** interlock motor→fábrica = guard `onlineHealthyEngines<=0` em `ensureNightFactoryWork` + no pump `processNextRadarCampaigns` (early-return limpo, reagenda); "fábrica parada→motor ao mínimo" JÁ existia (`resolveFactoryAllowedEngines`/`resolveElasticDesiredRunningCount`→warmMin), provado com teste novo. Painel: botão único `data-state` (motor+fábrica), interlock visual (fábrica trava sem motor). Build verde, E2E Chrome. **Freio fino (cursor/combo/backoff) ADIADO pro teste ao vivo.**
- **PR3 🔄 em curso:** gate `HBX_FACTORY_AUTONOMOUS_DISABLED` (default off = preserva atual; VPS seta no publish) bloqueia só a fábrica AUTÔNOMA (mass_data auto-perpetuada), NÃO o scraping on-demand do cliente. + script de limpeza VPS STAGED (cancela campanhas autônomas + reseta cursor; roda na sessão conjunta).
- **PR4 — DECOMPOSTO:** (a) **worker de SANEAMENTO IA** (limpa nome+segmento via Ollama LOCAL, aditivo em `metadataJson.ai*`, default OFF, testável contra os modelos já instalados) = construir agora; (b) **nota ICP** = ADIADO (precisa do rubric de conversão = decisão de negócio que o dono adiou p/ "entregas/planos"); (c) **túnel Tailscale + roteador 30B/7B + heartbeat** = sessão conjunta (install ao vivo nas 2 máquinas).

**Sessão conjunta (com o dono):** publish + freio-fino ao vivo + install Tailscale/roteador + limpeza VPS + definir rubric da nota ICP.

**Tudo fica LOCAL/working tree. Publish + teste = sessão conjunta com o dono** (incl. freio-fino ao vivo, install Tailscale, limpeza VPS).
