# Arquitetura WhatsApp / Atendimento HBX — VERIFICADO + plano

> Tudo abaixo foi **testado ao vivo no VPS em 26/06/2026** (banco `hbx_prod` + motor Evolution `:8080`).
> O que NÃO passou no teste saiu daqui e está em [arquiteturawhatsappposteste.md](arquiteturawhatsappposteste.md)
> com o porquê. Aqui ficou só fato confirmado + plano de ação.

## VEREDITO (o que decide fix × refazer motor)

**Não refazer o motor.** O Evolution/Baileys está SAUDÁVEL ao vivo: 3 instâncias da company 5 `open`,
webhook configurado e ativo, 9k+ msgs espelhadas. Os bugs do Atendimento são da **camada HBX** (reconciliação
de sessão, watchdog do SSE, tolerância do bootstrap, limpeza de fantasma) — não do motor. Trocar de biblioteca
só mudaria o lugar onde o erro aparece. **Refazer o motor = last resort que NÃO se justifica pelos dados.**

---

## Fatos confirmados ao vivo (company 5 · admin user 6 · ...884)

- **Motor OK.** Evolution `2.3.7` / baileys `7.0.0-rc.9`. `connectionState`, `fetchInstances` e
  `webhook/find` respondem. Webhook → `https://api.hbxsystem.com.br/webhooks/webwhats/events`, enabled,
  eventos `MESSAGES_UPSERT/UPDATE/DELETE, SEND_MESSAGE, CONNECTION_UPDATE, LOGOUT_INSTANCE`.
- **3 sessões `open` no motor = `active` no banco** (concordam): `company-5-user-6` ...884 (9113 msg / 1557
  contato / 433 chat), `company-5-user-28` ...4929, `company-5-user-33` ...8382. Modo = `individual`.
- **Admin tem sessão per-user** `company-5-user-6` (igual vendedor). O "admin quebra por ser userId-null" era
  do master/company-13, NÃO da company 5.
- **Cadáver real no banco:** 2 números na MESMA chave `company-5-user-6` → ...884 (`active`) e ...720
  (`disconnected`, nunca apagado). 5 conversas ainda pinadas no fantasma ...720.

## Problemas REAIS (passaram no teste) → fix

- **P1 — Identidade dupla do admin.** `isAggregateUser` (ADMIN/master) resolve o admin como
  `mode:'company', currentSessionId:null` na LEITURA (vê o time inteiro) mas opera o próprio ...884 no ENVIO.
  Vendedor tem 1 identidade; o admin tem 2 e acumula divergência. (`inbox.service.ts:206`, `:656`)
- **P2 — "1 chave = 1 número" não é cumprido no swap de mesma-chave.** A purga só DELETA quando é
  mesmo-número/tenantKey-diferente (`whatsapp-modal.service.ts:1489`); quando troca o número na MESMA chave,
  só marca `disconnected` (`:1441`) → cadáver (o ...720). **Fix:** no swap de mesma chave, purgar o número
  antigo (re-espelhando histórico sob o novo).
- **P3 — Ponteiro da empresa é last-writer-wins.** `currentWhatsappConnectionSessionId` vira a sessão do
  último user que reconciliou `connected` (`:3286`). No `individual`, um poll de vendedor PODE capturar o
  ponteiro da empresa. **Fix (trava):** no `individual`, ponteiro só aponta pra sessão do admin ou fica nulo —
  nunca pra vendedor.
- **P4 — SSE mente "vivo".** Heartbeat é `: keepalive` (comentário SSE, não evento — `inbox.service.ts:368`);
  o front só `bump()` em `event: inbox` (`page.client.tsx:880`) e desliga o poll da THREAD quando `sseOn=true`
  (`:920`). Atrás do proxy o stream morre calado → `sseOn` fica "true mentindo" → a **thread aberta congela**
  (a lista se salva no poll de 10s `:931`). **Fix = PR2 abaixo.**
- **P5 — Bootstrap tudo-ou-nada.** Se QUALQUER conversa falha no espelhamento, joga 503 no fim
  (`inbox.service.ts:4119`) → "o atendimento morreu" por causa de 1 conversa. **Fix = PR3 abaixo.**
- **P7 — Permissão/sessão-pinada, não rota.** Saída roteia certo pela tenantKey da conversa (`:497`); o
  bloqueio é o Forbidden "Só o dono da linha responde" no `individual` (`:762`) + conversas pinadas no
  fantasma ...720. **Fix:** re-pinar as 5 conversas órfãs do ...720 no ...884 + aplicar P2/P3.
- **P9 — Self-heal lateral.** `recoverUserSessionIfProviderOpen` (`whatsapp-modal.service.ts:647`) conserta
  pontual, espalhado. **Fix:** dobrar dentro do reconciler central (PR4).

> Observação: a 503 "consta conectado mas a sessão operacional não foi criada" (`inbox.service.ts:4270`)
> existe e é exatamente o estado-zumbi "parece conectado mas parou".

---

## Plano de ação (ordem) — só o que sobreviveu ao teste

1. **PR2 — SSE watchdog (prioridade 1, é o que trava a tela ao vivo).**
   - Backend: além do `: keepalive`, mandar evento real `event: ping` a cada ~15s.
   - Front: gravar `lastStreamAt` em QUALQUER chunk; se passar 40–45s sem evento útil → `ctrl.abort()` +
     `setSseOn(false)` (volta o poll da thread). Hoje não existe esse watchdog.
2. **PR3 — Bootstrap parcial.** Provider totalmente fora → 503; conversa(s) isolada(s) falhando → sucesso
   `partial:true` + `failures[]`. Nunca derrubar o espelhamento inteiro por 1 conversa.
3. **PR4 — Reconciler central + purga de fantasma.** Antes de listar/enviar: motor = fonte da verdade
   (`connectionState`/`fetchInstances`); banco≠motor → motor ganha. Absorve o P9 (self-heal) e a trava do P3
   (no `individual` o ponteiro nunca cai em vendedor). Inclui a purga de mesma-chave do P2 (apagar ...720 e
   re-pinar suas 5 conversas no ...884).
4. **PR1 — Health endpoint único** `GET /inbox/whatsapp-health` (`connectedForUi`, `canSend`,
   `providerInstanceState`, `dbSessionActive`, `currentSessionId`, `tenantKey`, `attendanceMode`,
   `repairAction`). A tela só mostra "conectado" se `connectedForUi && canSend`. Hoje só existe
   `GET /inbox/whatsapp-session` (status fatiado).
5. **Travar regra shared × individual** (sem meio-termo): compartilhado = 1 número da empresa por atribuição;
   individual = cada vendedor seu chip. O motor já garante 1 socket/número; o comentário em
   `whatsapp-modal.service.ts:2106` ("N sockets no mesmo número brigando") é a justificativa.

**Fora de escopo agora:** trocar Evolution→WAHA/Cloud API. O motor está saudável; isso é avaliação futura,
não a causa dos bugs atuais.
