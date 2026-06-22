# PLAN — WhatsApp: arquitetura LIMPA da camada de conexão/sessão (a fundação)

> Domínio: ler `/CLAUDE.md` + [docs/Rules/WHATSAPP.md](../../Rules/WHATSAPP.md) antes de tocar código.
> **Status: BLUEPRINT — aprovado o desenho, NÃO executar ainda.** O dono pediu "blueprint primeiro,
> depois executo". O motor Evolution (`Webwhats/`, :8080) **não se mexe** — o conserto é só na
> camada de conexão/sessão do `backend/`.
>
> Esta é a **FUNDAÇÃO** de que o [Fase B](PLAN-WHATSAPP-FASE-B-VISAO-EMPRESA.md) depende. O Fase B
> diz "Fase A aplicada e verde" — **não está**: provado abaixo. Fase B só roda depois desta.

## 0) Evidência (o que está no ar AGORA, 18/06)

`GET :8080/instance/fetchInstances` no motor local devolveu **3 instâncias, nenhuma `open`,
nenhuma no nome novo**:

| instância | status | número | veredito |
|---|---|---|---|
| `company-1` | connecting (eterno) | — | zumbi, nome legado por-empresa |
| `company-2` | close | 5519920121720 (Hbxsystem) | morta, ocupando nome |
| `company-11` | connecting | 5519997994929 (Fabiane) | **humano no nome legado** (devia ser `company-11-user-{id}`) |

O código novo resolve sessão/ingest/envio por `company-{id}-user-{userId}`; o motor só tem
`company-{id}`. **Split brain** → vendedor (Gabriela) vê inbox vazio porque a busca por
`user-{id}` não acha nada.

Drift de config achado de passagem: `backend/.env` tem
`WHATSAPP_MODAL_INTERNAL_URL=whatsapp-modal:8080` (não resolve), e o
[docker-compose.yml:68](../../../docker-compose.yml) sobrepõe com `host.docker.internal:8080`
(esse é o que vale). Dois valores pra mesma coisa = frágil.

## 0.1) VALIDAÇÃO 18/06 (lousa limpa) — REORDENA O PLANO

Reset manual de verdade (motor + DB zerados) e **conectado do zero**. Resultado:
- Motor criou **`company-2-user-36` (open)** — nome canônico por-usuário, **certo**.
- Sessão DB nasceu casando 1:1 (userId=36, tenantKey, phone, active); empresa `CONNECTED` + ponteiro.
- 100 conversas sincronizadas, **todas** no `whatsappConnectionSessionId` do user 36; 22 com foto.

**Conclusão:** o fluxo de *connect/ingest/sync* está fundamentalmente **correto**. O sintoma
(inbox vazio) vinha do **lixo legado + reset que não zera**, não do connect. Logo a prioridade
de execução vira: **P4 (reset real) → P5 (matar legado) → P3 (remover self-heal/boot-dedup, que
só existiam pra lutar com o lixo)**. P1 (nome) já está certo no caminho feliz — só consolidar a
função única e cobrir com teste. Drift extra confirmado: `@@map` Prisma
(`CompanyConversation`→`Conversation`, `CompanyMessage`→`Message`) confunde quem lê o banco cru.

## 0.2) VALIDAÇÃO AO VIVO 18/06 (pós-fix agentes) — o que ficou provado

Testado em local com connect real:
- **Connect/ingest/envio: OK.** `company-2-user-36` canônico; ida e volta gravada no banco
  (INBOUND `DELIVERED` + OUTBOUND `SENT`, ambos com providerMessageId via motor); foto OK.
- **Inbox vazio com sessão conectada → causa REAL = `wipedAt` herdado na sessão reusada.** O sync
  só roda no CONNECT (bootstrap do modal) e descarta todo chat anterior ao `wipedAt`. A sessão
  reusada (troca de número) carregou um `wipedAt` de wipe/contexto anterior → floorou os chats →
  0 conversas. **Provado:** limpando `wipedAt` da sessão, a conversa real apareceu (0→1).
- **Supressão cross-session: o fix do agente 2 está certo** (supressão do nº antigo 997024884 não
  bloqueia o nº atual 920121720). Não era o bloqueador final.
- **"Só 1 conversa" é CORRETO** para 920121720: dos 5 "chats" do motor, 1 é real (1:1) e 4 são
  self/sistema/device-dupe (`:0`, `@lid` "Você", `0@s.whatsapp.net` "WhatsApp").

**Conserto pendente (código, não na mão):** ao (re)conectar/reativar um número, a sessão NÃO pode
herdar `wipedAt` de outro contexto/número — senão o bootstrap do connect nasce floorado. Preservar
a proteção de wipe do MESMO número via supressão por-contato (já number-aware, agente 2).
Falta também verificar Bug 1 (disconnect/logout do aparelho) ao vivo.

## 0.3) TESTE DE CAMPO NA VPS 19/06 — 3 sintomas, 3 veredictos (o dono testando ao vivo)

> O dono está **no VPS** testando com chips reais. Pediu: "não pule pro diagnóstico, o chip ainda
> está sufocado, vamos testando" e "vai salvando no planejamento". Esta seção é o registro das
> decisões. NÃO há ação live executada por mim (guardrail): só leitura de código + diagnóstico.
> Disparo real / deploy / DB de prod = só o dono.

### Sintoma 1 — "mensagem não SAI mas RECEBE" no `5519920121720` (chip novo)
- **Recebe** = motor `open`, webhook fluindo, ingest acha a sessão. **Não sai** = OUTBOUND vira FAILED.
- O outro número (`019997024884`) enviou **perfeito**. Dono: "é o chip."
- **VEREDICTO: não existe trava DAQUI nesse número.** Provas no código:
  1. **Sem supressão/floor/merge** — removidos no commit *store-on-arrival*
     ([inbox.service.ts:5968](../../../backend/src/inbox/inbox.service.ts) — funções viraram comentário).
     Nada bloqueia contato/numero na nossa camada.
  2. **Sem normalização que estrague o número** — `resolveSendTarget`
     ([webwhats-bridge.service.ts:4438](../../../backend/src/messaging/webwhats-bridge.service.ts))
     **reusa o `whatsappRemoteJid` do inbound**: manda exatamente o JID que o motor já reconheceu
     ao receber. Não há armadilha de 9º dígito no envio.
  3. **Número não é special-case** — `5519920121720` no backend só aparece em **testes**
     (`*.test.ts`). O único número hard-coded é OUTRO: `5519997024884` = `ADMIN_SUPPORT_PHONE`
     ([companies.service.ts:69](../../../backend/src/companies/companies.service.ts)), usado pra
     alerta/suporte — não bloqueia envio.
  4. **O FAILED nasce no MOTOR** — `deliveryStatus:'failed'` + `status:'FAILED'` + `lastError` vêm
     do **webhook de entrega** ([messaging.service.ts:5351](../../../backend/src/messaging/messaging.service.ts)),
     payload do próprio WhatsApp. É o que alimenta o banner `.throttle-warn` (≥3 FAILED).
- **Conclusão:** sintoma 100% compatível com **estrangulamento/ban do chip novo** pelo WhatsApp
  (número fresco mandando ativo → flag de spam). Confirma o dono. **Não queimar tempo de código aqui.**
- **Resíduo a vigiar (única hipótese interna restante):** se o *selector* do envio resolvesse um
  `tenantKey`/sessão DIFERENTE da instância `open` no motor → POST cairia em instância morta → FAILED.
  Mas como o inbound DESSE número funciona, a sessão existe e resolve — risco baixo. Vale um log do
  `tenantKey` usado no `sendText` quando der FAILED, pra exonerar de vez (barato, não-destrutivo).

### Sintoma 2 — fotos de perfil não sincronizam direito
- **Onde:** `fetchProfilePicture` ([webwhats-bridge.service.ts:2890](../../../backend/src/messaging/webwhats-bridge.service.ts))
  faz `POST /chat/fetchProfilePictureUrl/{tenantKey}` com `treatNotFoundAsNull:true` → foto ausente
  vira **null em silêncio**.
- **Quando:** a foto só é buscada **no sync**, e só quando `metadata.whatsappAvatarUrl` ainda está
  vazio ([:462-464](../../../backend/src/messaging/webwhats-bridge.service.ts)) — busca **só do
  `syncableRemoteJids[0]`**.
- **Causa-raiz:** no instante do connect o motor (Baileys) **ainda não terminou de puxar contatos**
  do servidor do WhatsApp → `fetchProfilePictureUrl` volta null → conversa nasce sem avatar. Como
  só re-busca em outro sync (e o connect é one-shot), a foto fica faltando até um **hard refresh /
  abrir a thread / reconectar**. Não é cache podre (o `...(avatarUrl?...)` só grava quando há foto,
  então re-tenta) — é **falta de gatilho de re-sync depois que o motor esquenta**.

### Sintoma 3 — ao conectar, conversas/contatos NÃO aparecem sozinhas (precisa hard refresh)
- **O front JÁ tem tempo real:** SSE `GET /inbox/events` → `event: inbox` → `bump()` (debounce 600ms)
  → `loadConvs()` ([atendimento/page.client.tsx:530-563](../../../frontend/src/app/(app)/atendimento/page.client.tsx)).
  E `onConnected` chama `loadConvs()` **uma vez** ([:421-424](../../../frontend/src/app/(app)/atendimento/page.client.tsx)).
- **CAUSA-RAIZ PROVADA:** o **bootstrap sync do connect (em `webwhats-bridge.service.ts`) NÃO publica
  `inboxRealtime.publish`** — todos os publishers de SSE estão em `messaging.service.ts` (webhook
  inbound), `inbox.service.ts:400` e `vendas-automation`; **nenhum no bridge**. Logo: o connect dispara
  `loadConvs()` **antes** do motor terminar de puxar o histórico, e quando o bootstrap finalmente enche
  o banco **ninguém cutuca o front** → lista parada até o hard refresh (que re-busca tudo já populado).
- Por isso a mensagem que CHEGA depois (inbound ao vivo) **aparece** — essa passa por
  `messaging.service` que publica SSE. Só o **histórico do connect** fica órfão de evento.

### Direções de conserto (DECIDIR antes de executar — não fiz código)
Os 3 sintomas internos (2 e 3) têm **uma raiz comum**: o sync é disparado no connect, one-shot, e o
motor esquenta DEPOIS, sem ninguém re-sincronizar nem avisar o front.
- **Conserto unificador (recomendado) — [APLICADO 19/06, dono escolheu]:** após o bootstrap do
  connect, rodar um **re-sync deferido (passos 6s e 16s, `.unref()`)** + **`inboxRealtime.publish`**
  imediato e a cada passo. Mata #3 (lista atualiza sozinha) e #2 (avatares chegam no re-sync) de uma
  vez. Implementado em
  [company-whatsapp-customer-sync.service.ts](../../../backend/src/companies/company-whatsapp-customer-sync.service.ts):
  `publishInboxRefresh` (event `kind:'conversation'` → front `bump()`→`loadConvs()`),
  `scheduleDeferredResync` (1 conjunto de timers por empresa; religar limpa o anterior) e disparo no
  fim de `bootstrapAfterWhatsappConnect`. Checks: `npm run build` verde + 9/9 em
  `company-whatsapp-customer-sync.service.test.ts` (2 testes novos cobrem publish-sim/publish-não).
  **Falta o teste de campo na VPS** (chip real conectando → lista/foto aparecem sem hard refresh).
- **Alternativa barata p/ #3 (só front, sem backend):** depois do `onConnected`, re-rodar
  `loadConvs()` em backoff (ex.: 2s/5s/12s) pra pegar o bootstrap pousando. Paliativo honesto.
- **Reativo (10/10):** reagir aos webhooks `contacts.update` / `chats.upsert` do motor → backfill de
  avatar/nome + push SSE. Some o hard refresh de vez e mantém foto fresca.
- **Sintoma 1:** nada a consertar no código (é chip). Único item: log do `tenantKey` no FAILED do
  `sendText` pra exonerar a hipótese de split-brain no envio.

## 1) Os 4 problemas-raiz (não são bugs — é arquitetura)

1. **Dois nomes de instância convivem.** `company-{id}` (legado por-empresa) e
   `company-{id}-user-{n}` (novo por-usuário). Viola "sem legado" do `/CLAUDE.md`.
   — Exceção legítima (050-7): automação/bot usa `company-{id}` de propósito. O problema é
   **humano** caindo em `company-{id}`.
2. **Status em 4 fontes que divergem.** socket vivo no motor · linha `WhatsAppConnectionSession`
   · `company.whatsappModalStatus` · `company.currentWhatsappConnectionSessionId`.
3. **Pilha de remendos em runtime.** self-heal (promove instância viva ao nome canônico),
   boot-dedup, reconnect-grace, `enforceNumberNotSharedAcrossCompaniesOrBlock` virou no-op
   ([whatsapp-modal.service.ts:997](../../../backend/src/companies/whatsapp-modal.service.ts)).
   Cada um tenta reconciliar o split brain ao vivo em vez de não criar o split.
4. **Reset não zera.** `wipeMotorInstance`
   ([webwhats-bridge.service.ts:1526](../../../backend/src/messaging/webwhats-bridge.service.ts))
   apaga **1** instância (a da sessão atual ou a legada `company-{id}`); `wipeAllWhatsAppData`
   ([inbox.service.ts:6612](../../../backend/src/inbox/inbox.service.ts)) ainda grava supressões.
   Sobram `company-1`/`company-2` apodrecendo.

## 2) Arquitetura-alvo — 5 princípios

### P1 — UMA convenção de nome, dona única
- **Humano (vendedor):** `company-{id}-user-{userId}`.
- **Automação/bot (sistema):** `company-{id}` (exceção 050-7, mantida).
- **Regra dura:** instância sem dono resolvível = não existe (candidata a delete no boot/reset).
- 1 função `buildInstanceName(companyId, userId|null)` usada por **connect, config do webhook,
  ingest, sync, envio, wipe** — hoje isso está espalhado em `buildUserTenantKey`,
  `resolveOperationalTenantKey`, `buildTenantKey` (`company-${id}`), `resolveMotorTenantKey`.
  **Consolidar numa só.**

### P2 — Motor = verdade do socket. DB = projeção fina.
- Verdade de "está conectado / qual número" = **só o motor** (`connectionState` + webhook
  `connection.update`).
- `WhatsAppConnectionSession` = projeção (status/phone/owner). **1 único escritor:**
  `reconcileWebwhatsConnectionSession`
  ([whatsapp-modal.service.ts:1098](../../../backend/src/companies/whatsapp-modal.service.ts)).
  Todo o resto (ingest, inbox, sync) **só lê** (já é a intenção — garantir).
- `company.whatsappModalStatus` e `currentWhatsappConnectionSessionId` **deixam de ser verdade**:
  ou somem, ou viram **derivados read-only** da projeção de sessão. Decisão em §"DECIDIR ANTES".

### P3 — Lifecycle determinístico (sem self-heal)
```
[start] connect cria company-{id}-user-{n}  →  motor: QR/pairing
   │
   ▼ webhook connection.update = open
[active] reconcile grava sessão (telefone WRITE-ONCE, userId carimbado)
   │
   ▼ webhook connection.update = close  /  disconnect do usuário
[disconnected] sessão disconnected; instância DELETADA no motor (não fica "connecting")
```
- `open` é o único gatilho de "ativo". Sem promover instância órfã, sem dedup no boot.
- `close`/disconnect = delete real da instância (já é a intenção do disconnect
  [:795](../../../backend/src/companies/whatsapp-modal.service.ts) — estender pro lifecycle todo).

### P4 — Reset de verdade (zero é zero)
Algoritmo do wipe (por empresa, e variante global pra dev):
1. `GET /instance/fetchInstances` → filtra todas as instâncias `company-{id}` **e**
   `company-{id}-user-*`.
2. Pra cada: `DELETE /instance/logout/{name}` + `DELETE /instance/delete/{name}`.
3. DB: `WhatsAppConnectionSession` da empresa → status `disconnected`+`wipedAt`; apaga
   conversas/mensagens `channel=whatsapp`.
4. Supressão: **opcional e explícita** (flag), não default — pra "zero" de teste não deixar
   estado oculto.

### P5 — Migrar o legado, não conviver
- Humano em `company-{id}` (ex.: Fabiane em `company-11`) → migrar pra
  `company-{id}-user-{n}` (renomear/reconectar) **ou** deletar. Não fica vivo no nome legado.
- `company-{id}` só sobrevive se for a instância de **automação** declarada.

## 3) Plano de execução (DEPOIS de aprovado — ordem)

> Cada passo: âncora por símbolo (linhas mudam), check verde, **sem deploy/restart de prod**.

1. **Unificar nome (P1).** Criar `buildInstanceName()` única; trocar todos os call-sites
   (`buildUserTenantKey`/`resolveOperationalTenantKey`/`buildTenantKey`/`resolveMotorTenantKey`).
   Check: `cd backend && npm run build` + `node --test` dos tocados.
2. **Reset de verdade (P4).** `wipeMotorInstance` → `wipeAllCompanyInstances` (lista + deleta
   todas). Variante dev "wipe global" (lista geral). Supressão vira flag.
3. **Lifecycle (P3).** `open`→active / `close`→disconnected+delete. Remover self-heal/boot-dedup.
4. **Fonte de verdade (P2).** Garantir 1 escritor; `whatsappModalStatus`/`currentSessionId`
   derivados ou removidos (conforme decisão).
5. **Migração legado (P5).** Rotina única: humano em `company-{id}` → `company-{id}-user-{n}`
   ou delete.
6. **Config drift.** Alinhar `backend/.env` ↔ compose (uma URL só do motor).
7. **Religar Fase B** por cima desta fundação (doc separado).

## 4) Testes (node --test, dirigidos) — provam o PRONTO

- `buildInstanceName`: humano→`-user-`, automação→`company-{id}`.
- Lifecycle: `open` ativa sessão (phone write-once, não sobrescreve); `close` deleta instância.
- Ingest: webhook `company-{id}-user-{n}` cai na sessão do user; sem sessão = descarta (já é).
- Inbox: vendedor com sessão vê só os chats dele; sem sessão = vazio; admin agrega (gancho Fase B).
- Reset: wipe lista N instâncias e deleta TODAS; DB e motor zerados.

## 5) Critério de PRONTO (= o que vai pro MEMORY.md só quando 100%)

1. **Ida e volta:** conecta `company-{id}-user-{n}` → recebe msg → responde → chega no celular.
2. **Foto certa por usuário:** avatar do contato aparece, sem vazar entre números.
3. **Sem duplicar conversa** entre sessões/chips.
4. Reset zera motor+DB de verdade; reconectar nasce limpo.

## 6) Riscos / travas

- **Isolamento do USER é sagrado** (regressão Fase A): nenhum caminho entrega chat de um vendedor
  a outro.
- **Não mexer no motor** (`Webwhats/`) — só backend.
- **Sem operação destrutiva de prod** sem ordem; wipe global é **só dev/local**.
- Sem deploy/publish/restart de prod (INFRA). Tudo validado em local com `npm run up`.

## 7) DECIDIR ANTES (PARE — pergunta ao dono)

1. **`whatsappModalStatus`/`currentWhatsappConnectionSessionId`:** apagar de vez (projeção pura
   por sessão) ou manter como **derivado read-only**? (impacta telas que leem esses campos)
2. **Legado em produção:** as instâncias `company-{id}` com humano são **migradas** (preserva
   histórico) ou **deletadas e reconectadas** do zero? (Local: tanto faz, é descartável.)
3. **Instância de automação:** confirmar que `company-2`/Hbxsystem é a do bot (mantém
   `company-{id}`) e não humano legado a migrar.

## 9) ROADMAP 10/10 (aprovado pelo dono 18/06 — 4 trilhas)

> Estado hoje ~7/10 (single-user feliz funciona; falta confiança). Ordem: confiança PRIMEIRO,
> depois os saltos. IA: "deixar pronto, SEM gastar" — scaffold + feature-flag OFF; zero chamada
> Claude até o dono ligar a flag.

### Trilha 1 — Fundação de confiança (FAZER PRIMEIRO)
- **[FEITO 19/06] Status honesto, fonte única — desenho FINAL:** `getCompanyStatus` com `userId`
  é leitura pura do banco (`WhatsAppConnectionSession`). **Nunca toca o motor** — sem sondagem de
  `connectionState`, sem "Iniciando" fantasma, sem promoção de zumbi. A pill da tela de Atendimento
  (poll 20s, modal fechado) reflete o que está gravado: Conectado / Reconectando / Desconectado.
  Testes: `whatsapp-modal.service.test.ts` (31 passam; 3 deles cobrem getCompanyStatus honesto).
  - **[FEITO 19/06] Persistência do QR = responsabilidade do MODAL:** quando o vendedor clica em
    "Conectar" e entra no fluxo de pareamento (`status = waiting_qr` ou `starting`), o poll do modal
    (4s) vai direto no endpoint `/qr` (`fetchWhatsAppModalQr`) em vez do `/status`. Isso mantém o
    QR vivo no front sem precisar que o backend sonde o motor nos polls de status. O motor só é
    acionado dentro do modal e apenas após o clique em "Conectar". `statusRef` no modal espelha o
    status exibido e decide qual endpoint usar em cada tick de poll.
- **[FEITO 19/06] Ticks reais + reenviar:** `Checks` já renderiza ✓ SENT → ✓✓ DELIVERED → ✓✓
  azul READ; `retry` button aparece no FAILED e chama `POST /inbox/conversations/:id/messages/:mid/retry`.
  SSE publica `kind:'status'` → `bump()` recarrega a thread. 7 testes novos em
  `webwhats-bridge.service.test.ts` provam o mapeamento de status.
- **[FEITO 19/06] Aviso de estrangulamento:** banner `.throttle-warn` no Atendimento quando
  ≥3 OUTBOUND FAILED nas últimas 10 mensagens visíveis da thread. Classe central em `kit.css`.
- **[FOLLOW-UP — NÃO IMPLEMENTADO] Reconexão auto-curável:** quando `status=reconnecting` persiste
  por mais que X minutos sem `open`, o backend poderia tentar `restart` automaticamente e mostrar
  um badge "reconectando…" persistente no pill. Deixado para sprint posterior — requer debounce
  cuidadoso para não criar loop de restarts e interação com lifecycle P3 (Trilha arquitetura).

### Trilha 2 — Co-piloto de IA lead-aware (DEIXAR PRONTO, SEM GASTAR)
- Seam `whatsapp-copilot.service.ts` (`suggestReply`/`summarize`/`detectIntent`) atrás de flag
  `WHATSAPP_AI_COPILOT_ENABLED=false`. Prompt = conversa + dossiê do lead (Radar). **NENHUMA
  chamada Claude até a flag ligar.**
- Front: botões "Sugerir resposta"/"Resumir" no painel da conversa, escondidos/stub com a flag OFF.

### Trilha 3 — Cola do funil automática
- Inbound de lead do Radar → gruda no card do lead (match por telefone); desfecho da conversa
  move a etapa. Loop Radar→Vendas→WhatsApp→Retorno visível.

### Trilha 4 — Cockpit multi-vendedor (= Fase B turbinada)
- Admin vê saúde de conexão de TODOS os vendedores + carga + tempo de resposta; roteia lead.
  Depende da Fundação (status honesto) + Fase B.

## 8) Âncoras (símbolo — linha muda, símbolo não)

- `whatsapp-modal.service.ts`: `startCompanySession`, `createProviderInstance`,
  `reconcileWebwhatsConnectionSession`, `disconnectCompanySession`, `buildUserTenantKey`,
  `resolveOperationalTenantKey`, `enforceNumberNotSharedAcrossCompaniesOrBlock` (no-op).
- `webwhats-bridge.service.ts`: `resolveCurrentWebwhatsSession`, `ingestWebhookMessage`,
  `buildTenantKey` (`company-${id}`), `resolveMotorTenantKey`, `wipeMotorInstance`,
  `fetchProfilePicture`, `listLiveChats`.
- `inbox.service.ts`: `resolveInboxWhatsappSessionScope`, `isRowVisibleForWhatsappSessionScope`,
  `ensureWebwhatsSessionFromCompany`, `wipeAllWhatsAppData`, `cleanupOldWhatsappSessions`.
- `messaging.service.ts`: `handleWebwhatsWebhookEvent`, `findWebwhatsTenantKey`,
  `resolveCompanyForWebwhatsEvent`. Controller: `webwhatsEvent`.
- Config: `backend/.env` `WHATSAPP_MODAL_INTERNAL_URL` ↔ `docker-compose.yml:68`.
