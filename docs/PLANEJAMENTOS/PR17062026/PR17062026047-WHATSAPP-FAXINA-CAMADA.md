# 047 — WhatsApp: FAXINA DA CAMADA DO APP + DEPLOY (modelo limpo; o motor FICA)

## VEREDITO DA AUDITORIA (ordem do dono 17/06: "entre no motor e dê nota 0–10")
- **Motor `Webwhats/` (fork Evolution API) = 8/10.** Baileys multi-instância, reconexão automática
  ([`whatsapp.baileys.service.ts:447`](../../../Webwhats/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts) — reconnect padrão, só desiste em loggedOut/forbidden/402/406),
  sessão persistida, QR/pairing prontos. Customização HBX (LID→PN, chat list leve, presence) é
  **limpa, defensiva e aditiva** (`channel.service.ts:752`+, git log additivo c/ testes). **NÃO REESCREVER** —
  jogar fora = refazer pareamento+persistência+mídia+multi-tenant (meses, alto risco) e fere a regra
  (Baileys+persistência obrigatória; `whatsapp-web.js` proibido).
- **O que dói NÃO é o motor — são 2 coisas:**
  1. **DEPLOY VELHO = 3/10.** O 044 (número real + nome) está **em código, builds verdes, mas NÃO no ar**.
     O motor em produção roda build antigo → "a foto aparece mas o nome não". É OPS, não código.
  2. **CAMADA DO APP FRAGMENTADA = 5/10.** Estado de conexão espelhado em ~4 lugares e resolução de
     contato/nome repartida entre bridge+inbox+front. É aqui que "duplica código" é verdade.
- **Decisão de escopo (dono delegou):** refatorar **a camada do app** + **subir o que já existe**.
  Entrar no motor só pro deploy do 044 (e ajuste cirúrgico se faltar), **sem rewrite**.

---

## BLOCO 0 — DEPLOY do 044 (mata a dor do nome; custo quase zero)  ⚠️ ordem do dono na hora
> O conserto do nome JÁ EXISTE (ver `PR17062026044`). Subir e MEDIR antes de refatorar.
1. Deploy front + backend; **restart do motor** (o `getPNForLID`/`enrichChatsWithLidPn` roda no socket vivo).
2. Abrir Atendimento e conferir: as conversas viram **+55 / nome** (não mais `@lid`, não mais só foto).
3. Se resolver o nome → o Bloco B vira só consolidação; se NÃO → segue Bloco D (motor).

## BLOCO A — Backend: FONTE ÚNICA de estado de conexão
> Hoje `whatsappModalStatus` é lido/derivado solto em vários pontos; cada um redecide "tá conectado?".
1. Criar `backend/src/messaging/whatsapp-connection-state.ts`: 1 função `resolveWaConnection(company)` →
   `{ status, connected, operational, channel }` (deriva CONNECTED/RECONNECTING/QR/DISCONNECTED + Meta).
2. Trocar os consumidores por ela, sem mudar contrato externo:
   - `companies/whatsapp-modal.service.ts` (espelho do snapshot, `persistSnapshot:2752`).
   - `inbox/inbox.service.ts` (`ensureWebwhatsSessionFromCompany:482`, `getWhatsAppProviderHealth:5912`, `:526`).
   - `messaging/conversations.service.ts:502-514` (o gate de envio — `modalConnected`/`evolutionChannel`).
   - `modules/modules.service.ts:1651` (`hasOperationalWhatsAppEngine` do bloqueio do módulo).

## BLOCO B — Backend: FONTE ÚNICA de contato/nome (some o `@lid`, cascata 1 só)
> Mapa da fragmentação já levantado no 044 (CAUSA RAIZ). Consolidar, não reinventar.
1. 1 função `resolveWhatsAppContact(chatRow)` → `{ phone: '+55…'|null, name|null }`, **nunca** devolve JID cru.
   Cascata de nome única: **agenda (salvo) → pushName/profile → verifiedName/business → número → "Contato WhatsApp"**.
2. Aposentar as cópias: `messaging/webwhats-bridge.service.ts` (`resolvePreferredConversationContact:2967`,
   `getChatProfileDisplayName:2831`, `getChatAgendaDisplayName:2812`) e `inbox/inbox.service.ts:resolveConversationDisplayPhone:1571`
   passam a chamar a função única.

## BLOCO C — Front: inbox limpo + estado de conexão VISÍVEL
1. `frontend/src/app/(app)/atendimento/page.client.tsx`: tirar os fallbacks espalhados (linhas ~140, 1003,
   1045, 1362, 1370) — o campo já vem limpo do backend (Bloco B). `cleanContact` vira só rede de segurança.
2. Estado de conexão na cara (regra "ferramenta sem estado visível irrita o dono"): luz/badge de
   conectado + botão **reconectar** ali no Atendimento, lendo o health do Bloco A.
3. Repaginar o visual na casca/tokens (`frontend/src/app/hbx-theme/`) — 5 Leis, zero cor/hex solto.

## BLOCO D — Motor (só se o Bloco 0 não resolver o nome)  ⚠️ LER `Webwhats/AGENTS.md`; commit separado
1. Garantir `enrichChatsWithLidPn` também em `fetchContacts` (`Webwhats/src/api/services/channel.service.ts:512`).
2. Nada além disso sem novo plano. **Não commitar como efeito colateral do app principal.**

## CHECKS
- Backend: `cd backend && npm run prisma:validate && npm run build`
- Front: `cd frontend && npm run lint && npm run build`
- Motor (se Bloco D): `cd Webwhats && npm run lint:check && npm run build`
- Olho vivo: Atendimento mostra **+55 + nome**, estado de conexão visível, envio funciona p/ admin e vendedor.

## DEPENDÊNCIA
**0 primeiro** (deploy + medir) → A → B → C. D só se 0 não bastar. Bloco A/B não mudam contrato → seguros.
Absorve o 044 (vira o "Bloco 0" deste). Não reescreve o motor.
