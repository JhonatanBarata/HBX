# PR10062026010 — Refatoração DESTRUTIVA do frontend (substituição, não convivência)

Data: 11/06/2026
Status: EM EXECUÇÃO — fases R1..R5 abaixo; cada checkbox é um commit/PR rastreável.
Absorve: o restante do PR10062026003 (T.2, T.4, T.5, T.6, K.3, K.4, K.6) e as pendências
de frontend herdadas do PR-002 (C.2, gate da automação, A.6 no backend).

---

## Princípios (decisão do dono, 11/06/2026)

- **P1 — Frontend destrutivo.** Tela nova nasce do kit (docs/TEMAS → `/app2` + `/dev/ui`)
  na rota canônica, e a tela velha é **DELETADA no mesmo commit**. Nada "transicional".
  **Não se herda código de página legada** — as páginas antigas nasceram antes das regras
  de página (OK-PR-004/005/008) existirem; copiar trecho delas é importar entropia.
- **P2 — Backend é contrato intocável.** Nada do que o backend entrega hoje pode se
  perder na troca de tela. Cada tela tem um **Contrato de preservação backend** (tabelas
  abaixo): a tela nova consome **os mesmos endpoints** (ou os canônicos pós-PR-002).
  Endpoint que a tela velha consumia e a nova não consome = **decisão registrada neste
  doc** (movido para outra tela / absorvido pelo shell / morto no backend em R4).
  Nada some em silêncio.
- **P3 — Adaptação tela por tela.** 1 tela = 1 PR = nova no kit + velha deletada +
  E2E das 3 personas verde. O E2E é o guardião durante a demolição — roda após cada fase.

### Método por tela (checklist fixo de cada PR de R2)

1. Ler o contrato de preservação da tela neste doc.
2. Construir a tela nova com o kit (blueprint OK-PR-005, peças do catálogo `/dev/ui`),
   direto na rota canônica do manifesto OK-PR-007.
3. Ligar exatamente os endpoints do contrato (sem fetch novo fora do contrato sem
   registrar aqui).
4. Deletar a tela velha: `page.tsx` + `page.client.tsx` + `page.module.css` + aliases
   que apontavam só para ela (respeitando `removalTarget` do manifesto).
5. Atualizar o manifesto de rotas.
6. Rodar lint + build + E2E das 3 personas.
7. Marcar o checkbox da tela aqui, com anotações de qualquer desvio do contrato.

---

## Infra que SOBREVIVE (não é legado — proibido reescrever junto com as telas)

| Peça | Por quê |
|---|---|
| `frontend/src/app/_lib/api.ts` (`apiFetch`) | transporte único: 402→`redirectTo`, 403 MODULE_ACCESS_DENIED sem redirect de cobrança, headers de superfície mobile, cache de shell, backoff de transporte |
| `frontend/src/components/PreCheckoutGate.tsx` | decisão de cobrança centralizada: admin-only; vendedor/funcionário só vê bloqueio neutro via `accessReleased` (PR-002 D.4) |
| `frontend/src/lib/billing-access.ts` | `resolvePreCheckoutReason`/`buildPreCheckoutPath` — projeção única do estado de cobrança |
| `frontend/src/app/_lib/useRequireModule.ts` + `useRequireAuth` | gate de módulo via `/modules/me` |
| `frontend/src/lib/hbx-modules.ts` | vocabulário de módulos |
| `frontend/src/lib/whatsapp-connection-flow.ts` + `useWhatsAppLiveHealth.ts` | fluxo de conexão WhatsApp já extraído de tela — vira a base do overlay do shell novo |
| `frontend/src/lib/websiteLaunch.ts` | portal do site |

`ThemeProvider` atual NÃO sobrevive: é substituído (não herdado) em R1/T.2 pelo
mecanismo `data-theme`/`data-theme-mode`, mantendo o endpoint
`/profile/theme-preferences` como persistência.

---

## Passo 0 — Higiene documental ✅ (feito em 11/06/2026, junto com este doc)

- [x] `PR10062026002` renomeado para `OK-PR10062026002` (concluído — commit e8472cc7).
- [x] `PR10062026003` marcado: T.1, T.3 (preview), K.1, K.2, K.5 entregues pela trilha
      paralela; status mudado para ABSORVIDO por este PR-010.
- [x] Este doc criado com o plano completo + contratos de preservação por tela.

---

## R1 — Fundação única

- [x] **R1.1 Commit da trilha paralela** solta no working tree: `app/app2`, `app/dev/ui`,
      `app/hbx-theme`, `public/hbx-theme`, `components/corporate`, kit novo em
      `components/ui` (HbxDataTable/Drawer/KpiGrid/Modal/PersistentNotice), scanner
      `scripts/hbx-frontend-contract-scan.mjs` — corrigindo o erro de lint de
      `HbxCorporateShell.tsx:303` (setState dentro de effect: inicializar o modo via
      lazy initializer/`useSyncExternalStore` lendo `localStorage`, sem `setMode` no
      mount).
      *(11/06 madrugada: trilha já estava commitada pelo dono em 43b007bd; fix de lint
      via `useSyncExternalStore` em e7764dca — lint do frontend com 0 erros)*
- [x] **R1.2 Shell corporativo = AppShell oficial.** `HbxCorporateShell` promovido de
      preview a shell único do app autenticado. Ele **absorve as responsabilidades do
      TopBar** (inventário obrigatório abaixo) — o TopBar só é deletado em R3, depois
      que todas as linhas da tabela tiverem destino implementado.
      *(11/06 madrugada: `HbxAppShell` criado em f7c12d31 — identidade, logout, avisos
      do master com ack, chip de contexto master, tema; nav reusa `ModuleNav compact`
      [lógica de persona intacta]. Gaps propositais no L5 do PR11062026001)*
- [ ] **R1.3 Tema único (T.2 absorvido):** mecanismo `data-theme`/`data-theme-mode` no
      `<html>`, tokens de `docs/TEMAS` como única fonte; persistência integrada a
      `/profile/theme-preferences` (endpoint preservado); `hbx:corporate-mode` em
      localStorage vira só cache local. `HBX_THEME_PALETTES` legado morre quando a
      última tela velha morrer (R3).
      *(ADIADO de propósito para sessão conjunta — ver L6 do PR11062026001: risco de
      corromper escopos company/system/user do ThemeProvider)*
- [x] **R1.4 Rotas:** toda tela nova nasce direto na rota canônica do manifesto
      OK-PR-007. Nenhuma tela nova em `/dashboard/*`.
      *(cumprido nas telas entregues: /pre-checkout, /boasvindas, /planos)*

### Inventário TopBar (5.326 linhas) — pré-requisito do R3

O TopBar de hoje não é chrome: carrega fluxo de negócio. Cada responsabilidade precisa
de destino implementado ANTES da deleção:

| Responsabilidade | Endpoints | Destino no app novo |
|---|---|---|
| Identidade/sessão (perfil, logout, troca de senha, display-name) | `/profile/current-user`, `/auth/logout`, `/profile/password`, `/profile/display-name` | menu de conta na topbar do shell |
| Status operacional da empresa | `/companies/me/operational-status` | indicador no shell |
| Fluxo de conexão WhatsApp (modal QR, start/status/disconnect, centro, interesse de migração) | `/companies/me/whatsapp-modal/*`, `/companies/me/whatsapp-center`, `/companies/me/whatsapp-center/migration-interest` | overlay do kit (HbxModal) acionado do shell, lógica em `lib/whatsapp-connection-flow.ts` |
| Contexto master (assumir/sair de empresa, lista de empresas) | `/master-context/assume`, `/master-context/exit`, `/modules/master/companies` | chip de contexto master na topbar do shell |
| Avisos do master (listar/ack) | `/vendas/master-notices?audience=…`, `/vendas/master-notices/{id}/ack` | `HbxPersistentNotice` (K.2) |
| Execuções do radar (status/cancelar) | `/webscraping/radar/search-runs/{id}`, `…/cancel` | indicador de execução no shell (ou na tela radar — decidir no PR do R1.2) |
| Badges de inbox e recovery | `/inbox/conversations`, `/hbx-recovery/interactions?queue=all` | sinos do shell |
| Navegação por módulo | `/modules/me` | sidebar do shell (já implementada) |

`DashboardScaffold` (542 linhas): só consome `/profile/current-user` + `/modules/me` —
substituído integralmente pelo shell; morre em R3 sem re-homing adicional.

---

## R2 — Telas por risco (1 PR cada: nova no kit + velha DELETADA)

Ordem do menor para o maior risco. Linhas medidas em 11/06/2026.

### Contratos de preservação backend (extraídos do código real em 11/06/2026)

- [x] **R2.1 `/pre-checkout`** (170 linhas) — vira **apresentação pura**: morre a
      inteligência local de audiência; a decisão é exclusiva do `PreCheckoutGate` +
      `billing-access` (que já fazem isso hoje). A tela nova só renderiza a razão vinda
      da query string.
      **Contrato:** `/profile/current-user`. Nada mais.
      **Deleta:** `app/pre-checkout/*` antigo + `page.module.css`. Alias `/precheckout`
      permanece (compatibilidade permanente por produto, manifesto).

- [x] **R2.2 `/boasvindas`** (588 linhas) — renasce como **Home operacional do kit**.
      *(11/06 madrugada: 5aca8a81 — guard D.4 preservado, fluxo mobile preservado)*
      **Contrato:** `/companies/me/operational-status?refresh=true`,
      `/companies/me/whatsapp-center`, `/companies/me/whatsapp-modal/status`,
      `/modules/me`, `/profile/current-user`, `/profile/password` (primeira troca de
      senha), `/vendas/board` (resumo).
      **Deleta:** `app/boasvindas` legado + css. Alias `?radar=1` (ex-webscraping)
      preservado até R2.8.

- [/] **R2.3 `/planos` + `/pagamento`** (600 + 1.890 linhas) — admin-only, lendo SÓ
      *(PARCIAL 11/06 madrugada: /planos entregue em c8ee2587 — FALLBACK_PLANS com
      preços hardcoded MORTO, catálogo só da API, trial em HbxModal. /pagamento fica
      para sessão conjunta: máquina Mercado Pago de 1.890 linhas é risco alto sem
      validação ao vivo do dono)*
      accessState/catálogo da API; **nenhum preço/nome de plano hardcoded**.
      Corrige o lint `isBillingGraceActive` ×2.
      **Contrato planos:** `/commercial-plans/me`, `/commercial-plans/select`,
      `/financeiro/preferences`.
      **Contrato pagamento:** `/financeiro/overview`, `/financeiro/checkout`,
      `/financeiro/subscription/create|cancel|change-card`.
      **Nota:** "financeiro do contratante" da lista original = a própria `/pagamento`
      (alias `/dashboard/financeiro` → `/pagamento`); histórico/recibos saem de
      `/financeiro/overview`. Se o dono quiser superfície separada de histórico, vira
      painel adicional desta mesma tela — mesmo contrato.
      **Deleta:** `app/planos`, `app/pagamento` (inclusive `page.mobile.client.tsx` —
      a variante mobile renasce do kit na mesma fase) + css.

- [ ] **R2.4 `/tutorial`** (3.263 + client mobile) — renasce como checklist de
      onboarding do kit.
      **Contrato:** `/commercial-plans/me`, `/companies/me/operational-status`
      (+`?refresh=true`), `/companies/me/whatsapp-center` (+`/migration-interest`),
      `/companies/me/whatsapp-modal/qr|start|status`, `/inbox/bot-config`,
      `/inbox/conversations?limit=1`, `/modules/me`, `/vendas/board`,
      `/vendas/sales-profile`, `/profile/current-user`, `/profile/display-name`,
      `/webscraping/radar/search-runs`.
      **Deleta:** `app/tutorial/*` + css + `mobile-tutorial` alias (vai pro lote R3 se
      ainda referenciado).

- [x] **R2.5 `/whatsapp` → redirect único** para `/atendimento/automacao?tab=connection`
      *(11/06 madrugada: 65d5eecd — redirect já existia [43b007bd]; cadáver de 709
      linhas + wizard deletados. Atenção: spec whatsapp-mobile.spec.ts ainda testa a
      rota antiga — ver L7 do PR11062026001)*
      (manifesto). A tela atual (709 linhas) morre inteira.
      **Contrato:** os endpoints dela (`/companies/me/whatsapp-center`,
      `/companies/me/whatsapp-modal/bootstrap|qr|status`, `migration-interest`) **já são
      consumidos** pela automação e pelo fluxo do shell (R1.2) — nada se perde.
      **Deleta:** `app/whatsapp/*` + css.

- [ ] **R2.6 `/gerencial`** (4.455 linhas) — renasce como a **tela de Equipe nova** =
      entrega o **C.2 pendente do PR-002** (árvore única papel+permissões). Os demais
      blocos viram painéis do kit na mesma superfície (Equipe · Catálogo de produtos ·
      Comissões · Parceiros HBX · Comunicação). Corrige o lint de deps de `useMemo`.
      **Contrato equipe/permissões:** `/gerencial/overview`, `/team/policies`,
      `/team/policy/{userId}`, `/modules/company/access`,
      `/modules/company/user/{id}/access`, `/users/company/create`,
      `/users/company/seat-billing`, `/users/{id}/role|active|profile|delete`.
      **Contrato comissões:** `/gerencial/commission/settings|payouts|sync-hbx-clients`,
      `/gerencial/commission/{leadId}` (+`/sale-status`).
      **Contrato parceiros HBX:** `/gerencial/hbx-partner-referrals/*` (pending,
      lookup-phone, aprovar/rejeitar), `/gerencial/hbx-partners/{id}/onboarding*`
      (attachments, document-requirement, generate-contract, send-email,
      contract-template), `/vendas/master-notices/{id}/ack` (aviso de onboarding).
      **Contrato painéis auxiliares:** `/products` CRUD (ProductCatalogPanel),
      `/tenant-communication/settings`, `/gerencial/message/{id}/complaint`.
      **Nota de produto:** LITE sem gerencial é por design (List = solo) — documentar
      NA TELA (estado vazio do kit), não em tooltip escondido.
      **Deleta:** `app/gerencial/*` legado + css.

- [ ] **R2.7 `/master` (command center)** — renasce no kit; **morrem os "Detalhes
      técnicos" crus de vez** (até lá o master exibe menos info técnica — registrado).
      A central master continua fora das 8 seções (PR-003): estrutura própria, pele
      corporativa.
      **Contrato (MasterCommandCenter.hooks):** `/modules/master/workspace`,
      `/modules/master/company/{id}` (+`/detail`, `/plan`, `/courtesy`, `/trial`,
      `/suspension`, `/card-quota`, `/finance-settings`, `/global-token-usage`,
      `/import-tokens-to-master`, `/integrations` CRUD, `/manual-payment` +`/cancel`,
      `/assisted-setup/complete`, `/profile`), `/modules/master/billing-policy`,
      `/modules/master/global-integrations`, `/companies/master/{id}`
      (+`/archive`, `/mercadopago`, `/whatsapp/validate`,
      `/whatsapp-endpoints/{id}/validate`, `/whatsapp-migration-workflow`),
      `/master-context/assume|exit`, `/users/master/{id}` (+`/delete`,
      `/reset-password`, `/company/{id}/create`),
      `/website/master/company/{id}/config`, `/profile/current-user`.
      **Satélites do master (mesma fase, sub-PRs):**
      `/master/email` → contrato `/master/email` (+`/send`, `/settings`,
      `/templates/{t}` +`/restore` +`/test`);
      `/master/exclusoes` → contrato `/modules/master/exclusoes*` (+restore de
      radar-cards);
      `/bancodedados` → contrato `/modules/master/exclusoes/batch`,
      `/modules/master/vendas-complaints*`, `/modules/master/webscraping/
      database-cards*`, `/modules/master/webscraping/radar-auto-distribution` (+`/run`);
      `/hbx-recovery` → contrato `/hbx-recovery/customers*`, `/hbx-recovery/
      interactions/{id}/*` (assign-human, block/unblock, close/reopen, generate-link,
      internal-note, mark-paid, pause/resume-bot, request-proof, resend-link,
      send-message), `/hbx-recovery/payments/{id}/refund`,
      `/hbx-recovery/meta-templates*`, `/hbx-recovery/bot-config`,
      `/inbox/conversations`, `/whatsapp/send`.
      **Deleta:** telas master legadas + `night-factory` (avaliar: se for ferramenta
      viva, entra como satélite; se não, morre — registrar a decisão aqui).

- [ ] **R2.8 `/radar-digital`** (5.920 linhas) — renasce no kit; `HbxPopup2` morre junto.
      **Contrato:** `/webscraping/radar/leads?…` (+`/{id}`, `/{id}/enrich`,
      `/{id}/event`, `/{id}/send-to-vendas`, `/{id}/negative`,
      `/distribute-to-vendedores`, `/mark-sent-to-vendas`),
      `/webscraping/radar/search-runs` (+`/latest`, `/{id}`, `/{id}/cancel`),
      `/webscraping/radar/auto-distribution` (+`/run`),
      `/webscraping/enrichment-cost/summary?days=31`, `/vendas/import/webscraping`,
      `/vendas/pending-summary`, `/vendas/sales-profile`, `/vendas/usage`,
      `/users/company`, `/commercial-plans/me`, `/profile/current-user`.
      **Deleta:** `app/radar-digital/*` (incluindo os `.bak-*` esquecidos no diretório)
      + css + `app/webscraping` (alias para `/boasvindas?radar=1` entra no manifesto).

- [ ] **R2.9 `/atendimento` + `/atendimento/automacao`** (11.551 + automação) — renasce
      no kit; **gate de papel correto na automação** (pendência do D do PR-002);
      `HbxPopup2/3` morrem junto.
      **Contrato atendimento:** `/inbox/bootstrap?…`, `/inbox/conversations/*` (read,
      status, message, queue, block/unblock, bulk-bot, start), `/inbox/agenda`,
      `/inbox/bot-config`, `/inbox/whatsapp-sessions/cleanup`,
      `/hbx-recovery/meta-templates*` (create/sync), `/vendas/automation/live-status`,
      `/vendas/automation/prospecting/*` (config/start/ação), `/commercial-plans/me`,
      `/companies/me/whatsapp-center`, `/modules/me`, `/profile/current-user`.
      AgendaStudioModal: `/vendas/board`, `/vendas/lead/{id}`.
      **Contrato automação:** `/vendas/automation/bot-config|agenda|live-status`,
      `/vendas/automation/prospecting/*`, `/companies/me/whatsapp-modal/*`
      (qr/start/status/disconnect), `/companies/me/whatsapp-center`,
      `/commercial-plans/me`, `/modules/me`, `/profile/current-user`.
      **Deleta:** `app/atendimento/*` legado + css.

- [ ] **R2.10 `/vendas`** (12.870 linhas) — POR ÚLTIMO, **extração controlada**: o
      monólito vira módulos do kit (board, card, composer, comissões, mobile), DnD
      isolado num módulo próprio. `HbxPopup1/2` morrem junto.
      **Contrato:** `/vendas/board`, `/vendas/lead/{id}`, `/vendas/report?period=…`,
      `/vendas/sales-profile` (+`/suggest-weekly`), `/vendas/commission/summary`,
      `/vendas/commission/payout` (+`/{id}`), `/vendas/seller-audit?period=…`
      (+`/{sellerId}/governance`), `/vendas/crm-integrity`,
      `/vendas/hbx-closing-pipeline`, `/vendas/master-notices` (+`/{id}/ack`),
      `/products?status=active`, `/users/hbx/referred-seller`,
      `/webscraping/radar/search-runs/latest` (+`/{id}`), `/profile/current-user`,
      `/profile/display-name`.
      **Deleta:** `app/vendas/*` legado + css + `vendas-cidade` (resíduo registrado).

### Telas remanescentes a classificar (nada some em silêncio)

| Tela | Contrato backend | Proposta |
|---|---|---|
| `/cadastros` | `/cadastros/customers` (+`/{id}`) | morre em **R4.2** junto com a chave única de cadastro no backend |
| `/auto-replies` (+new/+id) | `/auto-replies/rules` (+`/{id}`) | decidir: vira painel da automação (R2.9) ou morre com endpoint em R4 — registrar |
| `/messages` | `/messages`, `/messages/outbound?take=50` | ferramenta de inspeção: vira painel master (R2.7) ou morre — registrar |
| `/layouts`, `/website` | `websiteLaunch` → `/website/portal?target=…`, `/modules/me` | manter: módulo website segue vivo; tela renasce no kit quando chegar a vez (apêndice de R2) |
| `/inbox/recovery` | superfície de recovery | absorvida pelo satélite `/hbx-recovery` em R2.7 |
| `/checkout` | fluxo de pagamento | confirmar se é página ativa do fluxo `/financeiro/checkout` ou casca — se casca, morre em R3 |

---

## R3 — Demolição (só depois de R2 completo)

- [ ] Deletar `TopBar` (tabela de re-homing 100% implementada antes).
- [ ] Deletar `DashboardScaffold` (incluindo o papel de "orquestrador" — resíduo
      registrado).
- [ ] Deletar `HbxPopup1-4` + `RadarPopupHost` (host).
- [ ] Deletar os 21 `page.module.css` operacionais (inventário OK-PR-006).
- [ ] Deletar os 55 redirects/aliases (`/dashboard/*`, `/mobile-*`, etc.), EXCETO os
      marcados `removalTarget: null` no manifesto (`/precheckout` e similares de
      produto). Antes de cada remoção: checar links externos/campanhas/bookmarks
      (regra do manifesto).
- [ ] Limpar CSS morto do `globals.css` + `HBX_THEME_PALETTES`.

## R4 — Resíduo backend ligado ao front

- [ ] **R4.1 Taxonomia comercial única:** DROP da tabela `Plan` legada +
      `structural-defaults.json` sem prata/ouro/diamante; `company.plan` fora de TODOS
      os payloads (front novo já não lê).
- [ ] **R4.2 Chave única de cadastro** (morre a tela e o módulo `cadastros`).
- [ ] **R4.3 A.6:** `RolesGuard`/`seller-governance` como projeções do estado canônico —
      fecha o diagnóstico do PR-002.
- [ ] **R4.4 Pendências herdadas:** senha temporária em
      `masterResetPassword`/`master-provisioning`; `whatsapp-center` admin-gated.

## R5 — Gates executáveis (Fase F enxuta, agora trivial)

- [ ] Scanner (`scripts/hbx-frontend-contract-scan.mjs`) vira gate de CI:
      `HbxPopup` / CSS local de página / campo cru / preço hardcoded = **erro**.
- [ ] Teste do manifesto de rotas (alias fora do manifesto = erro).
- [ ] Lint obrigatório + githooks + gitleaks.
- [ ] Contrato OK-PR-004 **reescrito em 1 página**: "use o kit; o resto não existe" —
      os caminhos errados deixaram de existir fisicamente.

---

## Registro "tudo mesmo" (erros e dívidas pegos no caminho — cada um com fase dona)

| Item | Fase |
|---|---|
| Lint: `HbxCorporateShell.tsx:303` setState em effect | R1.1 |
| Lint: `isBillingGraceActive` ×2 (pagamento) | R2.3 |
| Lint: deps de `useMemo` (gerencial) | R2.6 |
| Master exibindo menos info técnica até a tela nova | R2.7 |
| LITE sem gerencial é por design (List = solo) — documentar na tela | R2.6 |
| E2E usa SQL direto como simulação de e-mail/webhook (padrão mantido) | — (registro) |
| `vendas-cidade` resíduo | R2.10 |
| `DashboardScaffold` como orquestrador | R3 |
| Pré-checkout duplo (`/precheckout` alias) | manifesto (permanente) |
| `.bak-*` esquecidos em `app/radar-digital` | R2.8 |
| Duplicata acidental dentro do handoff (`design_handoff.../docs/TEMAS/claro`) | limpar em R1.1 |
