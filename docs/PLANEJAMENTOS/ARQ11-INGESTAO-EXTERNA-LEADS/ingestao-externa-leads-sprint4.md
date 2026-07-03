# Arq. nº11 — Ingestão Externa de Leads — Sprint 4: canal 2 = CTWA + painel de saúde do intake

Data do plano: 01/07/2026 · Depende de: Sprint 3 (adapter + delivery + conexão genérica)

## ⚠️ Regras duras Webwhats (chips banidos jun/26 — ler `Webwhats/AGENTS.md` antes)
Este sprint **LÊ metadata de mensagem entrante**. PROIBIDO: tocar conexão/reconexão/sessão, criar socket,
chamar `DELETE /instance/logout|delete` cru, qualquer coisa que encoste no ciclo de vida do chip.
Se a tarefa parecer exigir mexer em conexão, PARAR e replanejar. Teste de ponta a ponta só com número
descartável, jamais chip do dono.

## Por que CTWA antes de Google Lead Form ($)
No Brasil, a maior parte do gasto de anúncio de PME no Meta é click-to-WhatsApp (CTWA), não formulário
de lead. A mensagem do cliente JÁ entra pelo Webwhats; o referral do anúncio vem no payload da mensagem
(Baileys: `contextInfo.externalAdReply` / `ctwaClid`). Ou seja: o canal de ingestão mais valioso já está
dentro de casa, custo marginal ~zero, e captura lead de anúncio que hoje vira só conversa solta na inbox.
Google Lead Form e formulário do Website-Kit (CPL zero) entram DEPOIS, baratos, sobre as mesmas costuras.

## Verificação obrigatória ANTES de codar
O motor Webwhats repassa `externalAdReply`/`ctwaClid` no webhook que entrega mensagem ao backend
(`messaging.service.handleWhatsAppWebhook`)? 
- SIM → sprint é 100% backend, Webwhats intocado.
- NÃO → expor o campo no payload do motor é MUDANÇA DE LEITURA (serialização do evento de mensagem),
  não toca conexão — ainda assim, typecheck estrito do motor (`cd Webwhats && npm run typecheck`) e
  deploy via `npm run publish` (restart re-linka chips: comprovadamente seguro; o perigo era loop, já morto).

## Escopo IN
1. **Detecção**: no pipeline de mensagem entrante do backend, extrair referral de anúncio quando presente
   (title/body/sourceUrl/ctwaClid do `externalAdReply`).
2. **Adapter `ctwa`** (interface do Sprint 3): normaliza contato (nome do push, telefone do jid, campanha
   do referral) → `LeadDeliveryService.deliver` com policy de anúncio (quente, responsável da conexão).
   `IngestionConnection` provider `ctwa` por empresa: liga/desliga captura + responsável default.
3. **Dedup conversa↔card**: telefone já é chave natural do delivery; regra extra — conversa com card
   aberto ganha só evento de timeline ("novo clique de anúncio"), não card novo.
4. **Painel de saúde do intake** (admin, tokens hbx-theme): eventos por status
   (`received/retry/dead_letter/processed`) por provider, botão REPROCESSAR (dead_letter → received),
   alerta de conexão com erro e de assinatura de webhook pendente. Backend: endpoints de listagem +
   reprocess no módulo de intake.

## Escopo OUT
Google Lead Form (adapter futuro) · formulário do Website-Kit → intake direto (adapter futuro, CPL zero) ·
qualquer automação de resposta ao lead (isso é território do bot, outra frente).

## Arquivos
- `backend/src/messaging/messaging.service.ts` — ponto de extração do referral (leitura, sem mudar fluxo)
- `backend/src/lead-intake/adapters/ctwa.adapter.ts` — NOVO
- `backend/src/lead-intake/` — endpoints do painel (listagem/reprocess)
- `frontend/src/...` — painel de saúde (admin)
- (condicional) `Webwhats/` — expor `externalAdReply` no payload do webhook de mensagem, SE faltar

## Checks
- Backend: typecheck + testes (mensagem com referral simulado, mensagem normal, conversa com card aberto).
- Se tocar Webwhats: `cd Webwhats && npm run typecheck` (estrito, o publish exige) + teste com número
  descartável + deploy só via `npm run publish`.

## Critérios de aceite
1. Mensagem de teste com referral simulado → card `ctwa` quente + notificação ao vendedor.
2. Mensagem normal (sem referral) → zero card criado.
3. Conversa que já tem card aberto → só timeline event.
4. Dead-letter reprocessável pelo painel; conexão com erro fica visível sem olhar log.
5. Nenhuma mudança de comportamento de conexão do motor (chips intocados).
