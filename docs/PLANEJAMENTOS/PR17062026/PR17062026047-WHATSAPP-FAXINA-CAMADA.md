# 047 — WhatsApp: FAXINA DA CAMADA + MOTOR (o nome ainda não volta) — HANDOFF 17/06

## 🟢 PARA RETOMAR NOUTRO CHAT (lê isto primeiro)
**Estado no ar:** commit `da29299a` ("publish 20260617_155755") deployado na Hostinger (6m31s), **Webwhats
rebuildado e ativo**, front/api respondendo 200. Então o 044 (resolução `@lid`→PN + cascata de nome) **JÁ
ESTÁ LIVE no motor** — o restart que faltava foi feito.

**O problema que SOBROU (o "realmente importante" — ordem do dono):** mesmo com tudo no ar, o Atendimento
ainda mostra os contatos como **"Contato WhatsApp"** (print 17/06: títulos "Contato WhatsApp", subtítulo =
última msg "opa/jojow/ol"). Esse rótulo é o **fallback final** → só aparece quando **nem o NOME nem o +55
resolveram**. Logo: pro `@lid` desses contatos o motor **não devolveu PN** e **não veio pushName**.
**→ O conserto é no MOTOR (Bloco D abaixo), não no app.** O Bloco B (app) só FORMATA o que o motor entrega;
não inventa número/nome. Fazer B antes de D não traz o nome.

**Próxima tarefa = BLOCO D (motor), começando por D1 (diagnosticar).** Ler `Webwhats/AGENTS.md` antes.

**Feature nova pedida 17/06 (Bloco E):** vendedoras querem o **chip DELAS** no Atendimento → chavinha no admin
(Configurações→Equipe) **"WhatsApp compartilhado ou próprio"**. Dono avisou: **agora o WhatsApp não funciona nem
do admin nem das que deveriam herdar** (sintoma → some com Bloco D/conexão). Detalhe no Bloco E.

**Já confirmado funcionando (não mexer):** Bloco C (selo de conexão vivo) ✅ dono confirmou; cleanupOldWhatsapp
✅; syncRecentChats ✅ (funcionam na prática — os 3 testes unitários vermelhos são fixtures velhas, baixa prio).

---

## 🔴 ACHADOS DO TESTE AO VIVO — produção, admin Jhonatan (17/06, dados crus da API)
> Logado em `www.hbxsystem.com.br` como admin. `/inbox/conversations` = 4 conversas, **TODAS `name:null`**
> (UI mostra "Contato WhatsApp"). Dados reais:
> - **1023** `75471266001032@lid` (msgs reais) · **1026** `75471266001032:12@lid` (VAZIA, 0 msgs) · **1024**
>   `170858228252856@lid` · **1025** `+55199201217200` (número malformado, dígitos a mais).

1. **DUPLICATA por sufixo de device** (a "contato duplicado" + "minha foto duplicada" do dono): **1023 e 1026
   são a MESMA pessoa = o próprio dono** (mesmo LID `75471266001032`; é ele testando — "oi Jhonatan"), viraram 2
   conversas porque o dedup **não normaliza o `:NN`** do `@lid` (`75471266001032@lid` vs `75471266001032:12@lid`).
   Confirmado por API: **1023.avatar === 1026.avatar** (a foto DELE) e ≠ 1024 (outra pessoa) → a "foto duplicada"
   é só a cara dele aparecendo nas 2 conversas gêmeas, não bug de avatar. FIX: stripar `/:\d+/` do JID antes de dedup/gravar.
2. **`@lid` cru como `contact`** em 3 de 4 → motor não resolve LID→PN (confirma o Bloco D em produção).
3. **Número malformado** no 1025 `+55199201217200` (PN mal montado / dígito a mais) → `formatBRNumber`/normalização.
4. **Nome nunca resolve** (4/4 `null`), mesmo o 1025 que tem número → sem pushName e sem agenda.
5. **🔥 SESSÃO CONECTADA SEM NÚMERO (provável raiz de tudo):** `/inbox/whatsapp-session` →
   `accessible:true`, `providerHealth.status:"connected"`, MAS `currentSession.phoneNormalized:null` e
   `displayPhone:null`. `/whatsapp-modal/status.phone:null`.
6. **🔥 STATUS FLAPPANDO:** o modal status veio `connected` (cache) e segundos depois `starting` (live) →
   **sessão instável/reconectando**. Chip comprado semana passada **conectou mas nunca estabilizou** (sem phone).
7. **🔥 ENVIO QUEBRADO (reproduzido ao vivo):** mandei "teste hbx" 18:33 → entrou ✓ (fila) e **virou ⚠ reenviar
   em ~6s**. Já há 3 sends em reenviar (jojow 11:47, oi 17:59, teste hbx 18:33); só a de 10:32 entregou. Padrão:
   mensagem **enfileira (✓) mas a entrega falha** → consistente com sessão morta (sem phone/flapping do item 5/6).

**Herança da vendedora (explica "nem das vendedoras que deveria herdar"):** o gate de envio é company-level
(`whatsappModalStatus`), então a vendedora **herda a MESMA sessão da empresa** — que está quebrada (sem phone,
flapping). Não é a herança que falha; é a **sessão da empresa que está quebrada** → quebra pra todos.

**AÇÕES (prioridade, entram no Bloco D):**
- **D-fix-0 (RAIZ, 1º):** investigar por que o chip novo conecta **sem phone e fica flappando** `connected↔starting`.
  Olhar `whatsapp.baileys.service.ts` connection `'open'` (grava `wuid`/`ownerJid`) e o sync do número pro
  `whatsappModalPhone` (`whatsapp-modal.service.ts persistSnapshot`). Sessão sem phone provavelmente derruba envio + resolução.
- **D-fix-1:** normalizar `@lid` tirando `:\d+` antes de dedup/gravar → mata a duplicata (itens 1).
- **D-fix-2:** LID→PN no ingest + persistir (= D2) + `formatBRNumber` no número malformado (item 3).

---

## VEREDITO DA AUDITORIA (mantido)
**Motor `Webwhats/` = 8/10 — NÃO REESCREVER.** Evolution fork: Baileys multi-instância, reconexão automática
(`whatsapp.baileys.service.ts:447`), sessão persistida, QR/pairing prontos. Customização HBX limpa/aditiva.
Rewrite = refazer meses de código batido + fere regra (Baileys+persistência). A dor era **deploy velho**
(resolvido agora) + **camada fragmentada** (Bloco A resolvido).

## BLOCO 0 — DEPLOY do 044  ✅ FEITO 17/06
Subiu no `da29299a`. Motor reiniciado, `getPNForLID`/`enrichChatsWithLidPn` rodando no socket vivo.
**RESULTADO MEDIDO: o nome NÃO voltou** (segue "Contato WhatsApp") → vai pro Bloco D.

## BLOCO A — Backend: FONTE ÚNICA de estado de conexão  ✅ FEITO 17/06
`backend/src/messaging/whatsapp-connection-state.ts` criado; 5 gates de string solta migrados
(`conversations.service`, `inbox.service` ×2, `modules.service`, `webwhats-bridge` ×2). Duas noções
preservadas: **send-ready** (só `CONNECTED`) vs **sessão disponível** (`CONNECTED`|`RECONNECTING`).
Build verde; 0 regressão.

## BLOCO C — Front: estado de conexão VIVO  ✅ FEITO 17/06 (dono confirmou)
`page.client.tsx:362` faz poll leve (20s) de `refreshWaStatus` (independe de conversa aberta). O selo
"● WhatsApp: {status}" (`:1149`) já abre o `whatsapp-connect-modal` (poll 4s + reconectar). Pendente só o
**repaginar visual** (C.3) — precisa da direção do dono, não fazer unilateral.

## ⭐ BLOCO D — MOTOR: fazer o `@lid` virar +55 e o nome aparecer (A PRIORIDADE)
> ⚠️ LER `Webwhats/AGENTS.md` + `docs/ai/*` antes. Commit SEPARADO no Webwhats; não commitar como efeito
> colateral do app. Checks do motor: `cd Webwhats && npm run lint:check && npm run build`; depois restart do
> serviço `webwhats`.
>
> **Mapa do código (anchors confirmados 17/06):**
> - Resolução `@lid`→PN hoje roda só na LEITURA: `Webwhats/src/api/services/channel.service.ts:756`
>   (`resolveLidToPn` → `client.signalRepository.lidMapping.getPNForLID(jid)`) + `enrichChatsWithLidPn:772`
>   em `fetchChats`/`fetchChatsFast`. **Depende do `lidMapping` JÁ ter o número** — pra esses contatos volta `null`.
> - `getPNForLID` no INGEST só é usado pra CHAMADAS (`whatsapp.baileys.service.ts:1926`), **nunca pra reescrever
>   o `remoteJid` da mensagem**. Então msg `@lid` é gravada como `@lid`.
> - Nome: `pushName` vem de `received.pushName` (`whatsapp.baileys.service.ts:1527`); `fetchChats.displayName =
>   COALESCE(Contact.pushName, Message.pushName)`. Sem pushName e sem PN → cai em "Contato WhatsApp".

**D1 — DIAGNOSTICAR primeiro (mais barato, faz 1º):** log temporário em `resolveLidToPn` — logar o `lid` e o que
`getPNForLID` devolve (null? throw? PN?). E checar no banco se esses chats têm `pushName`/`Contact`. Isso diz
QUAL ramo consertar (mapa vazio vs pushName vazio vs as duas). Sem isso, D2/D3 é chute.

**D2 — Resolver no INGEST e PERSISTIR:** no caminho `messages.upsert` (espelhar o uso de `getPNForLID` da linha
1926), quando `key.remoteJid` termina em `@lid`, resolver o PN e gravar `remoteJidAlt`=`@lid` + `remoteJid`=PN
(o backend já consome `remoteJidAlt`). Persistir tira a dependência do mapa estar quente na leitura.

**D3 — Fallback de número/nome:** quando não há PN nem pushName, tentar `client.onWhatsApp(jid)` / fetch de perfil
pra obter número e/ou nome; cachear via `onWhatsappCache.ts`. (É o caminho pra contato fora da agenda sem pushName.)

**D4 — (se preciso) endpoint de resolução** (ideia do 044 Bloco A): `POST /chat/resolveLid/{instance}` recebe lista
de `@lid` e devolve `{lid, pn}` — pro app pedir resolução sob demanda.

**D5 — Estender `enrichChatsWithLidPn` ao `fetchContacts`** (`channel.service.ts:512`) — leftover do plano antigo.

## BLOCO B — Backend app: fonte única de contato/nome  ⏸️ DEPOIS DO MOTOR (não é o conserto do nome)
> Só FORMATA o que o motor entrega. Fazer como LIMPEZA depois que D fizer o motor devolver PN/nome.
1. 1 função `resolveWhatsAppContact(chatRow)` → `{ phone:'+55…'|null, name|null }`, nunca JID cru. Cascata única:
   agenda → pushName/profile → verifiedName/business → número → "Contato WhatsApp".
2. Aposentar cópias: `webwhats-bridge.service.ts` (`resolvePreferredConversationContact:2967`,
   `getChatProfileDisplayName:2831`, `getChatAgendaDisplayName:2812`) e `inbox.service.ts:resolveConversationDisplayPhone:1571`.

## BLOCO E — WhatsApp POR VENDEDORA: chip próprio vs compartilhado (pedido do dono 17/06)
> Pedido: **"minhas vendedoras querem pôr os chips DELAS no Atendimento."** Quer uma **chavinha no admin**
> em Configurações → Equipe (`/configuracoes?sec=Equipe`, painel **"Acesso do cargo Vendedor"** — print do dono):
> rótulo tipo **"WhatsApp compartilhado ou próprio"**.
> ⚠️ Aside do dono (sintoma, não cravar causa): **hoje o WhatsApp não está funcionando — nem o do admin, nem o
> das vendedoras que DEVERIAM herdar.** Some com o Bloco D/conexão (confirmar número da empresa `CONNECTED` e
> que o gate de envio entrega o número ao vendedor).

**Hoje (arquitetura):** sessão/número é **por EMPRESA** (1 chip; `whatsappModalStatus`; gate de envio em
`conversations.service` é company-level). Todo vendedor **compartilha** o número da empresa. A sessão já é
"por número" (bloco 036), então o motor multi-instância **suporta N chips por empresa** — a base existe.

**Modos do toggle:**
- **Compartilhado (herda):** vendedoras usam o número da empresa (modelo atual) — 1 inbox compartilhado.
- **Próprio (cada uma o seu):** cada vendedora **conecta o chip dela** (sessão Webwhats própria, ex. tenant
  `company-<id>-user-<uid>`); o Atendimento dela usa o número dela.

**Blocos de implementação (rascunho — DECIDIR com o dono antes de aplicar):**
- **E1:** política company-level `sellerWhatsappMode: 'shared' | 'own'` + a chavinha no painel "Acesso do cargo
  Vendedor" (`frontend/src/components/hbx/cargo-acessos-editor.tsx`) ou seção nova em Equipe.
- **E2:** modo `own` → fluxo de conexão **por vendedora** (reusa `frontend/src/lib/whatsapp-connection-flow.ts`
  + `backend/src/companies/whatsapp-modal.service.ts`, sessão-por-número do 036) com QR/pairing e status por usuário.
- **E3:** gate de envio + inbox resolvem **a sessão do vendedor** quando `own` (hoje só company-level); mantêm
  company-level quando `shared` (cross-ref Bloco A `whatsapp-connection-state.ts`).
- **E4:** modo `shared` tem que ENTREGAR o número ao vendedor de verdade (a parte que o dono diz não funcionar) —
  validar junto com o Bloco D/conexão.

**DECISÕES ABERTAS (não chutar — perguntar ao dono):** (a) a chavinha é company-wide ou por vendedora? (b) no
modo `own`, quem paga/gerencia o chip de cada uma? (c) custo de motor (N instâncias) vs capacidade configurada.

## CHECKS
- Motor: `cd Webwhats && npm run lint:check && npm run build` → restart serviço `webwhats`.
- Backend: `cd backend && npm run prisma:validate && npm run build`
- Front: `cd frontend && npm run lint && npm run build`
- Olho vivo: Atendimento mostra **+55 + nome** (não "Contato WhatsApp") p/ os contatos do print.

## DEPENDÊNCIA
✅0 → ✅A → ✅C feitos. **AGORA: D (motor), começando por D1.** B só depois de D entregar PN/nome. C.3 (visual)
quando o dono der a direção. Não reescreve o motor.
