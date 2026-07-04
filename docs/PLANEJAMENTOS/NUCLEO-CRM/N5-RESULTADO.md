# N5 — RESULTADO (módulo Produtos: catálogo tenant + unidade/usaLogistica)

> Sprint N5 do plano NÚCLEO-CRM. Executado 05/07 na branch `claude/nucleo-crm`
> (base = N4 @ `b9e8e94f`). **NÃO publicado.** Escopo: catálogo de produtos do
> tenant (o que o vendedor vende/entrega) + 2 campos aditivos + tela `/produtos`.

## Decisão-chave: REUSEI o módulo existente, NÃO criei um novo
O backend JÁ tem um módulo `products` completo (`backend/src/products/`):
controller `@Controller('products')` com CRUD (`GET/POST/PATCH /products`,
`DELETE` = soft-delete via `status='archived'`), RBAC via team-access
(`canView/EditProducts`, `canViewProductPrice`, `canChangeProductPrice`),
versionamento (`ProductVersionService`) e a régua de preço/desconto/comissão.
**Expandi esse módulo** (adicionei só os 2 campos novos) — NÃO dupliquei CRUD.
O `Product` já tinha `kind`/`sku`/`status`/`price`/`priceCents`/`stock` — reusei
tudo; só faltavam `unidade` e `usaLogistica`.

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `backend/prisma/schema.prisma` | +2 colunas ADITIVAS no `Product`: `unidade String?` e `usaLogistica Boolean @default(false)`. Nada removido/alterado. |
| `backend/prisma/migrations/20260705010000_produto_logistica_fields/migration.sql` | **NOVO.** Migration aditiva à mão (padrão N1): `ADD COLUMN IF NOT EXISTS` p/ as 2 colunas. NÃO aplicada em banco (Postgres não conferido; migration inerte até o dono aplicar). |
| `backend/src/products/dto/create-product.dto.ts` | +`unidade?` (`@IsString`) e +`usaLogistica?` (`@IsBoolean`), ambos `@IsOptional`. |
| `backend/src/products/dto/update-product.dto.ts` | idem (edição). |
| `backend/src/products/products.service.ts` | `buildCreateData`: `unidade: normalizeText(dto.unidade, 60)` + `usaLogistica: normalizeBoolean(...)`. `buildUpdateData`: idem atrás de `hasOwn`. Nenhum outro caminho tocado. |
| `backend/src/bootstrap/structural-defaults.json` | +`SystemModule 'produtos'` (`defaultEnabled:true`, `companyAssignable:true`, `serviceUrl:/produtos`) — kill-switch do master, espelho de `empresas`/`contatos`. |
| `frontend/src/app/(app)/produtos/page.tsx` | **NOVO.** Server page (metadata) → `ProdutosClient`. |
| `frontend/src/app/(app)/produtos/page.client.tsx` | **NOVO.** Lista de produtos (nome, unidade, preço, badge "Logística") + busca + toggle "Mostrar inativos" + "Novo produto" → modal central (nome, unidade, preço, toggle "usa na Logística") + Editar/Inativar. Estado vazio honesto. Consome `/products` (array). |
| `frontend/src/components/hbx/shell.tsx` | `ICONS.produtos` (caixa/pacote — chave EXISTE, senão derruba a Sidebar), `NAV_LINKS` (+Produtos após Contatos), `NAV_ENTITLEMENT.produtos=null`, `NAV_MODULE_KEY.produtos=null`. |
| `frontend/src/app/hbx-theme/screens.css` | +bloco `.prod-*` (badge Logística, preço/unidade na linha, ações, toggle do modal) — reusa `.emp-*`/`.ctt-form*`. Zero hex/inline. |

## SQL da migração
```sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unidade"      TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "usaLogistica" BOOLEAN NOT NULL DEFAULT false;
```
100% aditivo/não-destrutivo, idempotente (`IF NOT EXISTS`). Defaults preservam o
comportamento legado (planos do HBX / checkout intactos).

## Endpoints (reusados, company-scoped, companyId do JWT via team-access)
- `GET /products` → `Product[]` (array, não paginado). Preço vem `null` se o
  cargo não tem `products.viewPrice` (Lei do Vendedor já embutida no serviço).
- `POST /products` → cria (`kind='tenant_product'` default). Body do modal:
  `{ name, unidade?, price, usaLogistica }`.
- `PATCH /products/:id` → edita (isolamento por company já no serviço).
- `DELETE /products/:id` → soft-delete (`status='archived'`), com versionamento.

## UI
- **Lista:** nome + linha-sub (unidade · "Inativo" se arquivado) + badge
  **"Logística"** (ícone mapin) quando `usaLogistica` + preço formatado (pt-BR).
- **Busca** local (nome/unidade/SKU) — o endpoint devolve o catálogo inteiro do
  tenant, filtro é no cliente (catálogo pequeno). **Toggle "Mostrar inativos"**
  (arquivados escondidos por default).
- **Novo/Editar produto** → modal central (`.hbx-veil`/`.hbx-modal`, Lei 2):
  nome*, unidade, preço (aceita vírgula pt-BR), toggle "usa na Logística" + nota.
- **Inativar** (lixeira) → `DELETE` com `window.confirm`. Editar reabre o modal.
- **Estado vazio honesto:** explica galão 20L/kg/unidade + a flag Logística.

## Nav / ícone / gate (kill-switch, NÃO paywall)
- **Ícone:** `ICONS.produtos` registrado (caixa/pacote). A chave EXISTE — nav id
  sem entrada em ICONS derruba a Sidebar (P0 do "assistente"). `/produtos` no
  manifesto do build, sem crash.
- **Visível por default:** `NAV_ENTITLEMENT.produtos=null` e
  `NAV_MODULE_KEY.produtos=null` → aba nasce ligada, sem tier de plano. Igual
  `empresas`/`contatos`.
- **Controller usa só `JwtAuthGuard`** (o RBAC fino é o team-access do próprio
  serviço; não é paywall por tier). Kill-switch do master via `SystemModule
  'produtos'` (defaultEnabled=true) p/ cortar por empresa no futuro.

## Checks (resultado)
- **Backend `npx prisma validate`:** ✅ "schema is valid".
- **Backend `npx prisma generate`:** ✅ client gerado (v5.22.0).
- **Backend `npm run build` (tsc estrito):** ✅ VERDE, 0 erro.
- **Frontend `tsc --noEmit`:** ✅ VERDE, 0 erro.
- **Frontend `npm run build` (next):** ✅ "Compiled successfully"; rota
  `/produtos` no manifesto (static ○).
- **`check-pele.mjs` (5 Leis):** meus arquivos = **0 violações** (grep confirmou:
  0 hex/rgba/hsl no bloco `.prod-*`; nos `.tsx` só 2 inline de LAYOUT
  `{flex:1}`/`{padding}`, idênticos ao N4). ⚠️ O script REPROVA por violações
  **PRÉ-EXISTENTES** que NÃO são minhas: `screens.css:1555/1572`
  (`box-shadow 0 1px 3px rgba(0,0,0,0.05)`) — as MESMAS já flagradas em
  N3/N4-RESULTADO. **N5 não adiciona nenhuma violação nova.**

## Guardrails respeitados
- **NÃO publiquei.** Branch `claude/nucleo-crm`.
- **NÃO usei `git stash`.**
- **`git add` arquivo-a-arquivo** (10 caminhos), NUNCA `-A`/`.`.
- **Trabalho paralelo do dono preservado e NÃO commitado:**
  `vendas/page.client.tsx` (M), `leads/page.client.tsx` (M),
  `frontend/src/components/hbx/filtro-avancado-modal.tsx` (??) e
  `docs/.../VENDAS-REFAB/S-FRONT-UI-V2-RESULTADO.md` (??) seguem intactos — não
  os toquei nem commitei.

## Decisões pro dono revisar
1. **Reusei o módulo `products` existente** (kind='tenant_product') em vez de
   criar `/produtos` novo no backend — casa o plano ("PROCURE endpoints que JÁ
   EXISTAM… VOCÊ EXPANDE"). O front chama `/products`, não `/produtos`. Confirma?
2. **`usaLogistica` default OFF** — só marca itens físicos (galão de água). É o
   gancho pro N6 (Logística) filtrar o catálogo de entrega. Confirma o default?
3. **Preço no modal aceita vírgula pt-BR** e envia `price` (float); o serviço
   converte pra `priceCents`. Não expus desconto/comissão/estoque na tela (o
   serviço suporta, mas N5 é catálogo enxuto). Adiciono na ficha se quiser.
4. **Busca/filtro é no cliente** (o `GET /products` traz o catálogo inteiro do
   tenant — pensado p/ dezenas de itens, não milhares). Se um tenant tiver
   catálogo enorme, migrar p/ busca server-side (`?query=`) é trivial.
5. **check-pele pré-existente vermelho** (`screens.css:1555/1572`, mesmas do
   N3/N4) — segue pendente da sua decisão (PR de pele à parte OU `pele-allow`),
   independe de N5.
