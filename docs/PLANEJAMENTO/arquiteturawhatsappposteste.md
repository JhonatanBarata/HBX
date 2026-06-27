# O que foi REMOVIDO de arquiteturawhatsapp.md — e por quê

Testado AO VIVO no VPS em 26/06/2026 (banco `hbx_prod` + motor Evolution `:8080`). Só entra aqui o
que o teste **derrubou ou corrigiu**. O que passou ficou no doc-fonte.

---

## ❌ Passo 4 e Passo 8 (P3) — "o ponteiro da empresa aponta pra um VENDEDOR (gabrielo)"

**Falso hoje.** `Company.currentWhatsappConnectionSessionId` da company 5 = `cmqqxqjb2006mf7a8x5oiso4f`,
que é a sessão do **próprio admin (user 6, ...884)** — não de vendedor. E **não existe user "gabrielo"**
na company 5 (usuários: 6 Jhonatan/ADMIN, 22, 28, 33 Gabriele).

**Por que estava "errado":** o ponteiro é **last-writer-wins** (`whatsapp-modal.service.ts:3286`): vira a
sessão do ÚLTIMO usuário que reconciliou `connected`. Quando a análise foi feita, o último a conectar era um
vendedor; depois o admin reconectou o ...884 (01:46 de 26/06) e o ponteiro passou a apontar pra ele. Ou seja,
não é "aponta por padrão pra vendedor" — é "aponta pra quem conectou por último".

**O que sobra de verdade:** o risco de design (qualquer poll de vendedor pode capturar o ponteiro da empresa)
é real e virou item do plano — mas como **trava** ("no individual o ponteiro não pode cair em sessão de
vendedor"), não como fato medido.

---

## ❌ Passo 10 (P5), 2ª metade — "re-espelho bumpa updatedAt → conversas velhas sobem fora de ordem"

**Falso.** O mirror grava `lastMessageAt` com o **timestamp REAL da mensagem**
(`webwhats-bridge.service.ts:3142` lê `chat.lastMessage.messageTimestamp`; persiste em `:3192`), e a lista
ordena por **`lastMessageAt` primeiro** (`inbox.service.ts:4041`: `orderBy lastMessageAt desc, updatedAt
desc, id desc`). Ainda tem guard que **pula a escrita** quando nada mudou (`:3178-3183`), então nem toca o
`updatedAt`. Re-espelhar histórico antigo NÃO joga chat velho pro topo.

**Por que estava "errado":** a solução proposta (S5b: "preservar lastMessageAt real, não now()") **já está
implementada**. O sintoma "reabre chat antigo e a sequência não bate" tem outra causa (provável: bootstrap
503 — a 1ª metade do Passo 10, que é VERDADE e ficou no doc).

> A 1ª metade do Passo 10 (bootstrap 503 por 1 conversa ruim) **passou** e continua no doc-fonte.

---

## ⚠️ Passo 11 (P6) — "o painel lê o BANCO, não o motor → ...884 desconectado mas está no celular"

**Não reproduz hoje + absoluto demais.** Banco e motor **concordam** agora: as 3 sessões da company 5
(...884 user6, ...4929 user28, ...8382 user33) estão `active` no banco **e** `open` no motor. O sintoma
"...884 desconectado no painel mas aberto no celular" não acontece no estado atual.

E o "lê o banco, não o motor" é falso como regra: o código **consulta o motor ao vivo** em
`fetchLiveSnapshotWithMeta` (`whatsapp-modal.service.ts:3336`, bate `/instance/connectionState`) e tem
auto-cura `recoverUserSessionIfProviderOpen` (`:647`). A divergência banco×motor que o anti-flap de 23/06
(commit `3bc9db33`) atacou está, no momento, resolvida.

**O que sobra de verdade:** ter um **reconciler central** (motor = fonte da verdade antes de listar/enviar)
continua sendo bom endurecimento — virou item do plano (mesmo PR4 do Passo 25), mas como melhoria, não como
"o painel mente porque só lê banco".

---

## ✍️ Correções de exagero (mantidas no doc, mas ajustadas)

- **Passo 9 (P4)** — "a tela do admin não atualiza / congela": a **LISTA** tem poll de 10s
  (`page.client.tsx:931`) e NÃO congela; só a **thread aberta** depende do SSE quando `sseOn=true`
  (`:920`). O mecanismo do SSE mentir vivo é real (`: keepalive` em `inbox.service.ts:368`, front só
  `bump()` em `event: inbox` em `:880`) — mas o estrago é a thread, não "a tela".

- **Passo 12 (P7)** — "muitas conversas do admin pinadas no fantasma ...720 ou em sessão null": medido,
  são **5** conversas na sessão fantasma `cmqjmzlgw...` (...720) e **0** em sessão null. O admin tem **103**
  na sessão ativa (...884). O núcleo do P7 (Forbidden "Só o dono da linha responde" em `:762`; saída roteada
  pela tenantKey da conversa em `:497`) passou e ficou no doc.
