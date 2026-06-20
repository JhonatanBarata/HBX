# PLAN — WhatsApp Fase B: visão de empresa (admin/master agrega as N sessões)

> ## ESTADO 2026-06-20 (multi-user testado na VPS pelo dono)
> **Backend FEITO** (Opus, `inbox.service.ts`):
> - Bug de leitura corrigido e **publicado pelo dono**: `getConversationById`/`listConversationMessages` agora passam `userId` (vendedor abria e dava `Conversation not found`).
> - **3 níveis**: vendedor=`own`; **gerente** (`ADMIN` sem `canViewBilling`, padrão `isGerente`)=`company` **peneirado** (exclui sessões do admin-dono/master via `isAdminOwnerSessionUser`); admin-dono/master=`company` cheio. **Sem role nova, sem migration, sem mexer em billing.**
> - **Item 4 (admin manda pelo vendedor) resolvido**: `assertCanSendInConversation` → **só o dono da linha** envia (sendMessage/uploadMedia/react/retry). Admin/gerente vendo conversa de outro = **só leitura**.
> - `ownSessionIds` + `restricted` no scope/metadata; mutação do gerente confinada ao time (`ensureConversation`).
>
> **Frontend FEITO** (worker Sonnet, `atendimento/page.client.tsx` + `kit.css`):
> - Chip do dono por conversa (passo 5) + filtro "por número" + **compose read-only** quando não é a sua linha. Lint/build verdes.
>
> ### MODELO CORRIGIDO (dono 20/06) — o DEFAULT é COMPARTILHADO, não por-vendedor
> O dono esclareceu o caso principal (ex.: pizzaria): **1 número da empresa (do admin), TODOS atendem nele**
> — todos veem, mandam e recebem pelo MESMO número. Vendedor/gerente **não conectam WhatsApp** (só o admin).
> Conversa pode ser **"puxada pra si"** (claim → "Fulano atendendo") pra não colidir → reusar `assignedUserId`
> (já existe na conversa). **Exceção:** admin **concede um chip** a uma pessoa → vira **privado**: só ela + o
> admin veem/usam; os outros não. Isso BATE com o mercado (shared inbox + assignment: Chatwoot Assignee/
> Participants, Respond.io shared dashboard). O modelo "1 número = 1 vendedor" da ordem 18/06 vira a EXCEÇÃO.
>
> **Impacto no que já foi feito hoje:** o que entrou (scope own/team/company + trava "só o dono envia") serve
> ao caso **privado** + ao invariante; o caso **compartilhado** (todos enviam no número do admin + claim) é
> o BLOCO PRINCIPAL ainda a fazer. A trava de envio precisa virar **condicional ao modo do número**
> (compartilhado=pool envia; privado=só o dono). Connect deve ser **só do admin** por padrão. Re-planejar.
>
> **PENDENTE (próximo bloco):**
> - **Override por usuário + painel "sem confusão"** (Configurações → Equipe): admin "compartilhado on/off", vendedor "entra no pool". Storage decidido: `UserTeamPolicy.visibilityJson.inboxScope` (sem migration). Hoje rodando só nos **defaults por cargo**.
> - **REGRA (dono 20/06) — forçar compartilhar chip derruba conexão ativa:** se o admin **forçar compartilhamento de um chip** e já houver vendedor/gerente **conectado** naquele número → **abrir confirm** mostrando **nome + número** de quem vai cair; só **desconecta de verdade** se confirmado. Disconnect **limpo** (logout+delete da instância), nunca soft-drop — senão duas pontas disputam o número e cai no **loop de remontagem (bug infinito)**. Reusar `whatsapp-modal.service` → `enforceNumberNotSharedAcrossCompaniesOrBlock` (hoje só bloqueia/409; aqui vira confirm→disconnect). Em aberto: "compartilhar chip" = pool de 1 número entre N pessoas (modelo número-único) **ou** só visibilidade? Confirmar com o dono ao construir. Ver [[chip-share-derruba-conexao-aviso]].
> - Caminho **Meta-only** (conversa sessão=null) no envio do gerente; testes `node --test` dirigidos.
> - **Admin conecta o próprio número**: confirmado que já funciona (user com `userId` → sessão `company-{id}-user-{adminId}`).

> ⚠️ **DEPENDÊNCIA (18/06):** Fase A **NÃO está verde** — o motor está em split brain (instâncias
> legadas `company-{id}` vivas, nome novo `company-{id}-user-{n}` no código; inbox de vendedor
> vazio). Fase B só roda **depois** da fundação:
> [PLAN-WHATSAPP-CONEXAO-ARQUITETURA-LIMPA.md](PLAN-WHATSAPP-CONEXAO-ARQUITETURA-LIMPA.md).
>
> Continuação do WhatsApp POR USER (Fase A já aplicada e verde). Fase A isolou cada vendedor
> na SUA sessão (`mode: 'current'` = só as conversas do próprio número). Fase B dá ao **ADMIN**
> (e ao master no contexto da empresa) a visão agregada das N sessões ativas — **sem** reabrir o
> vazamento que o antigo `mode: 'all'` causava pro vendedor.

## Objetivo

- **Vendedor (USER):** continua vendo SÓ a sua sessão (`mode: 'current'`). Nada muda.
- **ADMIN / master-no-contexto-da-empresa:** vê o inbox da empresa inteira = união das conversas
  de TODAS as sessões webwhats vivas + as conversas só-Meta. Responder usa **a sessão dona da
  conversa** (não a do admin) — o número certo sai na resposta.

## Por que não é só "voltar o `all`"

`inbox.service.ts:587-590` matou `mode:'all'` de propósito: pra um USER, "mostra tudo" vazava as
conversas dos outros vendedores. Fase B **não** reabre isso pro USER — cria um modo novo
**gateado por role** que só o ADMIN/master alcança.

## Âncoras (file:line)

- `resolveInboxWhatsappSessionScope(companyId, userId)` — `inbox.service.ts:550-592`. Hoje:
  `accessible` por user, `mode` ∈ `current|meta|none`, `currentSessionId` único.
- `isRowVisibleForWhatsappSessionScope(row, scope)` — `inbox.service.ts:599-607`. Hoje filtra
  `current` (1 sessão) / `meta` (sessão null).
- `buildWhatsappSessionMetadata(scope)` — `inbox.service.ts:609-624` (o front lê isto).
- Entrypoints que resolvem o escopo: `:725, :3377, :3555, :3645, :3752` (uns passam `userId`,
  outros não — Fase B precisa passar **role** também).
- Saída por conversa: `buildWebwhatsConversationSelector` (`:497-506`) já mira
  `whatsappConnectionSessionId` da conversa → resposta do admin já sairia pelo número certo.
- Dispatcher outbound (messaging) já manda `msg.whatsappConnectionSessionId/sourceTenantKey`
  (Fase A) — confirmar que vale também quando quem dispara é ADMIN agregado.

## Plano

1. **Novo modo `company` no scope.** `resolveInboxWhatsappSessionScope` passa a receber o
   **role** (ou um flag `aggregate`) além de `userId`. Quando ADMIN/master no contexto da empresa:
   - busca **todas** as `WhatsAppConnectionSession` vivas da empresa → `sessionIds: string[]`;
   - `mode: 'company'`, `accessible` = `sessionIds.length>0 || metaActive`,
     `sessionIds` no objeto de scope (novo campo).
2. **Visibilidade agregada.** `isRowVisibleForWhatsappSessionScope`: no `mode:'company'`, row
   visível se `rowSessionId ∈ sessionIds` **ou** (`rowSessionId === null` e `metaActive`).
   USER nunca recebe `mode:'company'` (gate de role no passo 1).
3. **Thre: role nos entrypoints.** Os 5 pontos de `:725/:3377/:3555/:3645/:3752` recebem o
   `user` (já têm `userId` em alguns) e decidem agregado×current pela role. Controller do inbox
   passa `req.user` (role + isSystemMaster). USER → sempre `current`.
4. **Saída (resposta do admin).** Garantir que responder numa conversa agregada usa
   `buildWebwhatsConversationSelector(conversationId)` (a sessão DONA), não a sessão do admin.
   Já é assim em `:387/:410/:2969` — só cobrir com teste no caminho admin.
5. **Metadata pro front.** `buildWhatsappSessionMetadata` expõe `mode:'company'` +
   `sessions: [{id, phone, sellerName}]` pro inbox poder rotular "de quem é cada conversa"
   (chip por vendedor). Front: badge do dono na lista (sem cor solta — token/classe central).
6. **Master.** Master no contexto da empresa = trata como ADMIN dessa empresa (mesmo agregado).
   Fora de contexto, segue a superfície master mínima (não toca aqui).

## Riscos / travas

- **Isolamento do USER é sagrado:** nenhum caminho pode entregar `mode:'company'` a role USER.
  Teste explícito: USER pedindo inbox → só a própria sessão (regressão da Fase A).
- **Resposta sai pelo número errado:** se o admin responder e o dispatch pegar a sessão do admin
  em vez da sessão da conversa → vaza identidade. Teste: admin responde conversa da sessão X →
  outbound usa selector de X.
- **Fotos/identidade por sessão** continuam re-chaveadas por tenantKey (Fase A) — agregar a LISTA
  não pode reusar cache de contato entre números.

## Testes (node --test, dirigidos)

- `inbox.service`: ADMIN agrega N sessões; USER não agrega (vê só a sua); conversa só-Meta entra
  no agregado quando metaActive.
- `webwhats-bridge`/`messaging`: admin responde conversa da sessão X → outbound pelo selector de X.

## Checks

- `cd backend && npm run prisma:validate && npm run build` + `node --test` dos testes tocados.
- `cd frontend && npm run lint && npm run build` (se mexer no badge de dono na lista).
- Sem deploy/restart de prod sem ordem (INFRA).

## Aberto (decidir antes de aplicar)

- **Gate exato do agregado:** todo ADMIN agrega, ou só ADMIN com `canViewBilling`/algum acesso?
  (Default proposto: todo ADMIN da empresa.)
- **Chip de dono na lista** (passo 5) entra agora ou fica visual pra um 2º passo?
