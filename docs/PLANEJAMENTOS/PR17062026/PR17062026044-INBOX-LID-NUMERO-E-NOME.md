# 044 — Inbox: matar o `@lid`, mostrar o número +55 real e o NOME (ordem do dono 17/06)

## ✅ APLICADO EM CÓDIGO 17/06 (falta o dono fazer deploy/restart do motor + front)
- **Bloco C (front) — FEITO:** `page.client.tsx` agora tem `cleanContact()`; nenhum JID cru
  (`@lid`/`@s.whatsapp.net`/`@g.us`/…) chega à tela. Sem nome+número → **"Contato WhatsApp"**.
- **Bloco B (backend) — SEM MUDANÇA NECESSÁRIA:** o inbox já descarta `@lid` no nome
  (`inbox.service.ts:1914`) e no telefone (`:1563`); o número real flui sozinho assim que o motor
  manda o PV via `remoteJidAlt`/`remoteJid` (o backend já consome isso).
- **Bloco A (motor) — FEITO:** `Webwhats/src/api/services/channel.service.ts` ganhou
  `resolveLidToPn()` (usa `signalRepository.lidMapping.getPNForLID`) + `enrichChatsWithLidPn()`,
  ligados em `fetchChats` e `fetchChatsFast`: todo chat `@lid` vira `remoteJid=PN` + `remoteJidAlt=<lid>`.
- **Builds verdes:** front lint 0 erros / build ok; backend prisma:validate + build ok; motor `tsc --noEmit` ok.
- **Live só após deploy** do front+backend e **restart do motor** (o `getPNForLID` roda no socket vivo).
  Caso raro sem mapa → "Contato WhatsApp" até o nome/PV aparecer no próximo sync.

---


> Sintoma (print do dono): conversas aparecem como `75471266001032@lid` no título E no
> subtítulo. O dono: **"não existe número lid, é o +55... ; puxe o nome da pessoa também."**
> Cascata de nome que ele pediu: **linha → WhatsApp → contato salvo no celular → (só então) número**.

## VERDADE TÉCNICA (o que é o `@lid`)
`@lid` = **LID (Linked ID)**, identificador interno e opaco do WhatsApp. `75471266001032` **NÃO é
telefone** — o dono está certo. O telefone real (PN, `@s.whatsapp.net`) só vem por:
1. `key.remoteJidAlt` (senderPn) na mensagem — **quando o WhatsApp manda junto**; OU
2. o mapa LID↔PN do Baileys: `client.signalRepository.lidMapping.getPNForLID(lid)`.

## CAUSA RAIZ (rastreada no código)
- O motor JÁ troca `@lid`→PN, mas **só quando `remoteJidAlt` vem na key**
  (`Webwhats/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts:1502`).
- Quando o WhatsApp entrega **só LID** (sem o PN alt — comum p/ contato fora da agenda), o
  `Message.key.remoteJid` fica `@lid`, sem alt. Aí:
  - `fetchChats` devolve `remoteJid: "…@lid"` sem `remoteJidAlt`
    (`Webwhats/src/api/services/channel.service.ts:752`).
  - backend `getChatRemoteJidAlt`→null; `resolvePreferredConversationContact` pula o `@lid` e
    **acaba gravando o próprio `@lid` como `contact`**
    (`backend/src/messaging/webwhats-bridge.service.ts:2764, 2967`).
  - `resolveConversationDisplayPhone` devolve `""` (ignora `@lid`)
    (`backend/src/inbox/inbox.service.ts:1571`).
  - front cai no fallback `c.contact` e **renderiza o `…@lid` cru**
    (`frontend/src/app/(app)/atendimento/page.client.tsx:140, 1362`).
- **O número real É recuperável**: `getPNForLID` já é usado no motor p/ chamadas
  (`…baileys.service.ts:1926`), mas **não existe rota HTTP** que exponha isso, e o
  `fetchChats/fetchContacts` não enriquecem chats LID com o PN.

---

## BLOCO A — Motor (Webwhats): resolver LID→PN  ⚠️ LER `Webwhats/AGENTS.md` + `docs/ai/*` ANTES; commit separado, sem efeito colateral
1. **Endpoint de resolução** (router `chat`): `POST /chat/resolveLid/{instance}` → recebe lista de
   JIDs `@lid`, devolve `{ lid, pn }` usando `client.signalRepository.lidMapping.getPNForLID()`
   (fallback: cache `isOnWhatsapp` / `onWhatsappCache.ts`).
2. **Enriquecer `fetchChats`/`fetchChatsFast`/`fetchContacts`**
   (`Webwhats/src/api/services/channel.service.ts:752, 870, 512`): p/ todo registro `@lid`,
   anexar `remoteJidAlt` = PN resolvido (igual à regra que já existe na linha 1502). Assim o
   backend recebe o número sem mudar contrato (campo `remoteJidAlt` já é consumido).
3. Sem migration nova se der pra reusar `isOnWhatsapp`. Build verde do motor; **não commitar como
   efeito colateral do app principal.**

## BLOCO B — Backend (bridge + inbox): nunca gravar/mostrar `@lid` como número
1. `webwhats-bridge.service.ts`: quando vier PN resolvido (via `remoteJidAlt`), gravar **o PN como
   `contact`** e manter o `@lid` só como chave-alt de match (metadata `whatsappRemoteJidLid`). NÃO
   deixar `resolvePreferredConversationContact` (`:2967`) cair no `@lid` como contato humano.
2. Reforçar a cascata de NOME (já meio-pronta em `getChatProfileDisplayName :2831` /
   `getChatAgendaDisplayName :2812`): ordem = **agenda (contato salvo) → pushName/profile →
   verifiedName/businessName**. (A "linha/carrier" não vem por API; verifiedName é o mais perto.)
3. `inbox.service.ts:resolveConversationDisplayPhone (:1571)`: já ignora `@lid` corretamente —
   garantir que com o PN agora presente ele devolve o `+55…`.

## BLOCO C — Front: blindar o fallback (o `@lid` NUNCA chega à tela)
1. `frontend/src/app/(app)/atendimento/page.client.tsx` linhas **140, 1003, 1045, 1362, 1370**:
   trocar o fallback `… || c.contact || "—"` por um helper `cleanContact()` que **descarta
   qualquer string com `@lid`/`@s.whatsapp.net`/`@g.us`** antes de exibir.
2. Fallback final (sem nome e sem PN real): **"Contato WhatsApp"** (rótulo neutro) — **DECIDIDO
   pelo dono 17/06**. Nunca mostrar `@lid` nem dígitos do LID (não é número). Quando o nome/PN
   chegar depois (sync), a conversa atualiza sozinha.

## CHECKS
- Backend: `cd backend && npm run prisma:validate && npm run build`
- Front: `cd frontend && npm run lint && npm run build`
- Motor (se tocado): `cd Webwhats && npm run lint:check && npm run build`
- Olho vivo: abrir Atendimento e conferir que as 3 conversas do print viram **+55 / nome**.

## DEPENDÊNCIA
A→B→C. Sem o Bloco A, o número real continua indisponível p/ chats LID puros; B+C já tiram o
`@lid` da cara (mostram nome quando houver, senão rótulo neutro) — entrega parcial válida.
