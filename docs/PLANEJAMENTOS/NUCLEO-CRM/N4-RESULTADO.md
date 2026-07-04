# N4 — RESULTADO (módulo Contatos + criar conta/cliente manual + view papel=cliente)

> Sprint N4 do plano NÚCLEO-CRM. Executado 04/07 na branch `claude/nucleo-crm`
> (base = N3 @ `c7934557`; `origin/master @ 7fd01a26`, sem divergência de arquivo).
> **NÃO publicado.** Escopo: janela "Contatos" (pessoas) + criar/editar cadastro
> MANUAL + view "Clientes" (papel `isCliente`) + nav/ícone/gate. Cadastro manual
> é GRÁTIS (não é lead da base 28M → não debita crédito).

## Modelo (confirmado do plano)
**Contato = a pessoa** (filho de `CustomerProfile`). **Cliente = PAPEL da conta**
(`isCliente=true`), NÃO entidade nova. "Clientes" é uma VIEW filtrada da MESMA
base — zero cadastro duplicado.

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `backend/src/nucleo/dto/nucleo.dto.ts` | **NOVO.** DTOs de escrita (class-validator): `CreateContaDto`, `UpdateContaDto`, `CreateContatoDto`, `UpdateContatoDto`. companyId NUNCA no body. |
| `backend/src/nucleo/nucleo-cadastro.service.ts` | +6 métodos: `listContatos`, `listClientes` (reusa serialização de empresas, só troca filtro p/ `isCliente=true`), `createConta`, `updateConta`, `addContato`, `updateContato` + tipos. N1/N3 intactos. |
| `backend/src/nucleo/nucleo.controller.ts` | +5 endpoints (GET contatos, GET clientes, POST contas, PATCH contas/:id, POST contatos, PATCH contatos/:id). |
| `backend/src/bootstrap/structural-defaults.json` | +`SystemModule 'contatos'` (`defaultEnabled: true`, `companyAssignable: true`, `serviceUrl:/contatos`) — kill-switch do master, espelho de `empresas`. |
| `frontend/src/app/(app)/contatos/page.tsx` | **NOVO.** Server page (metadata) → `ContatosClient`. |
| `frontend/src/app/(app)/contatos/page.client.tsx` | **NOVO.** Lista de pessoas + busca + toggle "Só clientes" (troca p/ view de papel) + botão "Novo contato/cliente" → modal central. Estado vazio honesto. |
| `frontend/src/components/hbx/shell.tsx` | `ICONS.contatos` (2 pessoas), `NAV_LINKS` (+Contatos após Empresas), `NAV_ENTITLEMENT.contatos=null`, `NAV_MODULE_KEY.contatos=null`. |
| `frontend/src/app/hbx-theme/screens.css` | +bloco `.ctt-*` (toggle, linha da conta, form do modal) — reusa `.emp-*` p/ linhas/badges/empty/pager. Zero hex/inline. |

## Endpoints criados (company-scoped, companyId sempre do JWT)
- `GET /nucleo/contatos?query=&page=&pageSize=` → `{ page, pageSize, total, totalPages, items[] }`.
  Lista `Contato` (pessoas) da empresa, cada um com a Conta a que pertence
  (`contaId/contaNome/contaTipo` + papéis da conta). `query` casa nome/cargo/email
  do contato, telefone (dígitos) e nome da conta.
- `GET /nucleo/clientes?query=&uf=&page=&pageSize=` → **mesma forma do `/empresas`**.
  A VIEW "Clientes" = `CustomerProfile` onde `isCliente=true` (PF **ou** PJ).
  Reusa a serialização de empresas — **não duplica lógica**, só troca o filtro de
  papel (`isCliente:true` em vez de `tipo:'pj'`).
- `POST /nucleo/contas` → cria Conta manual (`origin='manual'`) + Contato principal.
  Idempotente por-tenant: se já existe conta com mesmo `cnpj`/`document`/
  `phoneNormalized` na empresa, faz **upsert** (não duplica). Papéis default:
  `isCliente=true` (cadastro do vendedor nasce cliente). Retorna `{ contaId, contatoId }`.
- `PATCH /nucleo/contas/:id` → edita conta (nome/tipo/endereço/papéis). Isolamento
  duro (`findFirst {id, companyId}` → 404 se de outro tenant).
- `POST /nucleo/contatos` → adiciona pessoa a uma conta existente (valida que a
  conta é da empresa; se `isPrincipal`, rebaixa o principal anterior).
- `PATCH /nucleo/contatos/:id` → edita contato. Company-scoped.

## UI — criar cliente + filtro Clientes
- **Título dinâmico:** "Contatos" (pessoas) OU "Clientes" conforme o toggle.
- **Toggle "Só clientes"** (na barra): liga → a lista passa a bater em
  `/nucleo/clientes` (contas papel=cliente, com contador de contatos); desliga →
  volta pras pessoas (`/nucleo/contatos`). O toggle reseta a página p/ 1.
- **Botão "Novo contato/cliente"** → modal central (`.hbx-veil`/`.hbx-modal`,
  Lei 2): nome*, tipo pf/pj, telefone/WhatsApp, cargo, endereço/cidade/UF
  (opcionais) e toggle "É cliente" (default ON). Salva via `POST /nucleo/contas`
  e recarrega a lista. Este é o fluxo "Dona Maria + endereço" do plano.
- **Estado vazio honesto:** diferente p/ Contatos vs Clientes; ambos oferecem o
  botão de novo cadastro (que AGORA existe — diferente do N3, que era read-only).

## Nav / ícone / gate (kill-switch, NÃO paywall)
- **Ícone:** `ICONS.contatos` registrado (2 pessoas). A chave EXISTE — nav id sem
  entrada em ICONS derruba a Sidebar (foi o P0 do "assistente"). `/contatos` no
  manifesto do build, sem crash.
- **Visível por default:** `NAV_ENTITLEMENT.contatos = null` e
  `NAV_MODULE_KEY.contatos = null` → a aba nasce ligada, sem exigir tier de plano.
  Casa a direção CRÉDITOS (módulo = kill-switch, não paywall). Igual `empresas`.
- **Kill-switch do master:** `SystemModule 'contatos'` (defaultEnabled=true) no
  catálogo p/ cortar por empresa no futuro (trocar `NAV_MODULE_KEY.contatos` p/
  `"contatos"` + gatear o controller quando quiser ligar).
- **Controller usa só `JwtAuthGuard`** (não `@ModuleAccess`, que viraria paywall
  por tier) — mesmo padrão do N3.

## Checks (resultado)
- **Backend `npm run build` (tsc estrito):** ✅ VERDE, 0 erro.
- **Backend `npm run prisma:validate`:** ✅ "schema is valid" (N4 não altera schema
  — reusa `CustomerProfile`/`Contato` de N1).
- **Frontend `tsc --noEmit`:** ✅ VERDE, 0 erro.
- **Frontend `npm run build` (next):** ✅ "Compiled successfully", rota `/contatos`
  no manifesto (static).
- **`check-pele.mjs` (5 Leis):** meus arquivos = **0 violações** (grep confirmou:
  0 hex/rgba/hsl no bloco `.ctt-*`; 0 style inline visual nos `.tsx` — só layout).
  ⚠️ O script REPROVA por violações **PRÉ-EXISTENTES** que NÃO são minhas e já
  estavam no HEAD: `bot-builder.css:163`, `whatsapp.css` (várias) e
  `screens.css:1555/1572` (`box-shadow rgba`) — as MESMAS já flagradas no
  N3-RESULTADO. Meu bloco começa após a linha ~3623. **N4 não adiciona nenhuma
  violação nova.**

## Guardrails respeitados
- **NÃO publiquei.** Branch `claude/nucleo-crm`.
- **NÃO usei `git stash`.**
- **`git add` arquivo-a-arquivo** (8 caminhos), NUNCA `-A`/`.`.
- **Trabalho paralelo do dono preservado e NÃO commitado:** `leads/page.client.tsx`
  (M), `filtro-avancado-modal.tsx` (??) e `docs/.../VENDAS-REFAB/S-FRONT-UI-V2-RESULTADO.md`
  (??) seguem intactos no working tree — não os toquei nem commitei.

## Decisões pro dono revisar
1. **Cliente manual nasce `isCliente=true`** (o pedido: "vendedor cadastrando
   cliente"). O toggle "É cliente" no modal permite desmarcar (viraria só um
   contato/conta sem papel de cliente). Confirma o default ON?
2. **View "Clientes" reusa a serialização de Empresas** (mesma forma de item) — a
   tela mostra a conta cliente + contador de contatos. Não abri ficha de detalhe
   dela nesta sprint (o clique da linha é read-only no N4; edição de conta/contato
   já tem endpoint `PATCH`, mas a UI de editar fica p/ N5/N6 ou um follow-up leve).
3. **Idempotência da conta manual:** chave por `cnpj` → `document` → `phoneNormalized`
   (nessa ordem) dentro da empresa. Cadastrar "Dona Maria" 2× com o mesmo telefone
   faz upsert (não duplica). Se preferir permitir homônimos sem telefone, é relaxar.
4. **PATCH de papéis pode LIGAR e DESLIGAR** (edição explícita da conta); já o
   upsert do cadastro/pull só LIGA papéis (acumulativo, nunca apaga). Fronteira
   proposital — confirma?
5. **check-pele pré-existente vermelho** (mesmas violações do N3) — segue pendente
   de decisão sua (PR de pele à parte OU `pele-allow`), independe de N4.
