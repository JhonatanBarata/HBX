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
