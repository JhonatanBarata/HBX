# PR17062026047 — WHATSAPP: REFAZER A CAMADA DO APP (de vez)

> **Ordem do dono 17/06 (literal):** "refazer isso de vez, tá um lixo. Se eu peço pra deletar,
> TEM que deletar o que eu pedi — arrancar o câncer. Por que os chats ficam voltando?"
> Dores reais (2 prints): **(1)** apaga e os chats **VOLTAM**; **(2)** quase tudo "⚠ reenviar"
> = recebe mas **não envia**; **(3)** conversas **duplicadas**; **(4)** contato vira número cru
> (`5199970248840`) em vez de nome.
>
> **Invariante:** o MOTOR (`Webwhats/`) é 8/10 — **NÃO se reescreve**. O lixo é a **camada do app**
> (backend bridge/inbox/sync + front). Absorve e encerra o **044** (lid→PN/nome).

## CAUSA-RAIZ DE CADA DOR (rastreada no código)
- **Ressurreição:** `inbox.service.ts:6486 wipeAllWhatsAppData` só apaga `companyMessage`/
  `companyConversation` ("Sessão mantida") e **NÃO** chama `recordDiscardedConversationSuppressions`
  (`:6534`). O motor (`webwhats_prod`) fica intacto e o bootstrap
  (`company-whatsapp-customer-sync.service.ts`) re-importa via `webwhats-bridge` no próximo sync.
- **Duplicatas:** `webwhats-bridge.service.ts:2985 consolidateDuplicateConversations` é band-aid
  **reativo** (junta depois de formar; log "duplicates=105"). Nascem porque a conversa é chaveada
  por `contact` cru → **lid e PN viram 2 linhas pra 1 pessoa**.
- **Número cru / nome errado:** identidade repartida em 3 lugares — bridge
  (`resolvePreferredConversationContact:2967`, `getChatProfileDisplayName:2831`,
  `getChatAgendaDisplayName:2812`), inbox (`resolveConversationDisplayPhone:1571`), front
  (`cleanContact`). Cada um resolve diferente → vaza `@lid`/dígito do lid.
- **Não envia:** estado de conexão espelhado ~4x; selo fica "verde" só por receber. O outbound
  (`messaging.service.ts` → motor `/message/sendText`) falha e o erro é engolido ("⚠ reenviar").

---

## BLOCO 1 — DELETE DE VERDADE (arrancar o câncer) — **1º, é a sangria**
`inbox.service.ts wipeAllWhatsAppData` passa a fazer as 3 coisas, em transação:
1. Apagar backend (já faz).
2. **Apagar no MOTOR**: limpar a instância `company-{id}` no webwhats (apagar a instância no
   motor e recriar vazia, OU endpoint de limpar chats/mensagens). Sem isso, sempre há o que reimportar.
3. **Gravar supressão de TUDO** que foi apagado (reusar `recordDiscardedConversationSuppressions`
   / `conversation_backend_deleted` + um `wipedAt` na sessão). Sem isso, o bootstrap reabre a porta.
4. Tirar o botão do "DEBUG": "Apagar tudo" vira ação real com confirmação (front
   `atendimento/page.client.tsx`, endpoint `inbox.controller.ts:78`).

## BLOCO 2 — PARAR A RESSURREIÇÃO (o bootstrap respeita o delete) — depois do 1
`company-whatsapp-customer-sync.service.ts`: antes de criar qualquer conversa, checar a supressão
(`isLocallyDeletedChatSuppressed`) **e** o `wipedAt` da sessão — nada anterior ao wipe reimporta.
Reimportação só do que chegou DEPOIS. (Hoje ele reimporta cego.)

## BLOCO 3 — FIM DAS DUPLICATAS (chave canônica única)
Chave da conversa = **PN normalizado** (uma função só, a mesma do resolver do Bloco 4). `@lid` nunca
vira chave. Upsert por `(companyId, channel, phoneNormalized)`. **Aposentar** o
`consolidateDuplicateConversations` reativo — deixar no máximo como migração única de limpeza do
passado, não como muleta a cada sync.

## BLOCO 4 — IDENTIDADE ÚNICA: número + nome (uma fonte só) — absorve o 044
UM resolver `resolveWhatsAppContactIdentity(chat) -> { phoneE164, displayName }`:
- número: `remoteJidAlt`(PN) → mapa lid↔PN do motor → nunca o lid;
- nome (cascata fixa): **agenda (contato salvo) → pushName/profile → verifiedName/businessName →**
  (só então) rótulo neutro "Contato WhatsApp". Nunca dígito de lid.
- O **bridge grava** o resultado; **inbox e front só LEEM**. Apaga a lógica de nome/número espalhada
  em inbox/bridge/front (`resolvePreferredConversationContact`, `resolveConversationDisplayPhone`,
  `cleanContact` viram um wrapper fino sobre o resolver único).

## BLOCO 5 — CONEXÃO QUE ENVIA (recebe mas não manda)
- Root-cause do "⚠ reenviar": caminho de envio (`messaging.service.ts` → motor `/message/sendText`)
  — instância certa? sessão viva? erro silenciado? Corrigir e **propagar o erro real** (não "reenviar" mudo).
- Estado de conexão = **fonte única** (`whatsapp-connection-state.ts`), sem espelho 4x. O selo só fica
  verde com **probe de envio real**, não só por receber.

## BLOCO 6 — SEM LEGADO (fecha)
Botão DEBUG → ação real; consolidação reativa removida; espelhos de estado removidos; 044 encerrado
aqui (o doc 044 é apagado quando o Bloco 4 subir). Duas coisas vivas pra mesma função = proibido.

## ORDEM
**1 → 2** primeiro (estanca a ressurreição, é o que mais dói) → **3 + 4** (duplicata e identidade,
andam juntos pela chave única) → **5** (envio, em paralelo) → **6** fecha.

## CHECKS
- Backend: `cd backend && npm run prisma:validate && npm run build` + catraca de testes.
- Front: `cd frontend && npm run lint && npm run build`.
- Motor (só se MESMO precisar tocar — ler `Webwhats/AGENTS.md`): `npm run lint:check && npm run build`.
- Olho vivo: apagar tudo → **não volta**; nome/+55 certo; sem duplicata; mandar mensagem → **envia**.
